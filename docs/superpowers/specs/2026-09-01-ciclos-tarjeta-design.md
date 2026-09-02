# Ciclos de tarjeta: el resumen como entidad

**Fecha**: 2026-09-01
**Estado**: diseño aprobado, pendiente de plan de implementación
**Alcance**: pertenencia al ciclo (A) + fecha de compra (C). Los recargos de compras en dólares (B) quedan fuera, con spec propio.

---

## El problema

Hoy una tarjeta se describe con dos enteros: `payment_methods.default_closing_day` y
`default_payment_day`. De ahí sale todo — a qué resumen pertenece cada compra, cuánto se
debe y cuándo. El modelo asume que todos los meses son iguales.

**No lo son.** Verificado contra dos resúmenes reales de Galicia (1-sep-2026), que traen la
fila que exige la Ley 25.065 art. 23 — cierre y vencimiento del ciclo anterior, del actual y
del siguiente:

| Tarjeta | Cierres reales | Vencimientos reales | Configurado en Chanchito |
|---|---|---|---|
| Visa Galicia | 23-jul · 20-ago · 24-sep | 3-ago · 1-sep · 5-oct | cierre 20, vence 1 |
| Mastercard Galicia | 30-jul · 27-ago · 1-oct | 7-ago · 4-sep · 9-oct | cierre 27, vence 4 |

Los tres cierres de la Visa son **los tres jueves** — el cierre está anclado al día de la
semana, no al día del mes, que es el patrón que el research encontró en Macro y Banco Ciudad
("cada jueves", "último jueves hábil"). El día calendario se corre hasta 4 días entre ciclos, y
la configuración fija acierta **un ciclo de cada tres**.

### Los tres defectos que eso produce

1. **La pertenencia es implícita.** `computePaymentMethodStatus` la define como
   `sameMonthYear(t.date, nextPaymentDate)`. `t.date` hace dos trabajos a la vez: es la fecha
   que se muestra y es la clave de agrupación. El modelo no puede representar dos ciclos en el
   mismo mes calendario.

2. **La fecha de compra no se persiste en `transactions`.** En crédito `t.date` es el
   vencimiento calculado por `calculateCreditPaymentDate`; `created_at` mide cuándo se anotó.
   Consecuencia práctica: al investigar un caso concreto durante este mismo diseño, no hubo
   con qué determinar cuándo se había comprado. Ver «Lo que no se pudo determinar».

3. **Las cuotas cuentan meses, no resúmenes.** `installments/actions.ts` fecha la cuota N con
   `addMonths(primera, N)`. Con vencimientos reales de 4-sep y 9-oct, eso da 4-oct.

### Por qué el arreglo obvio es peor que el problema

La recomendación anterior era que el usuario dejara de editar `default_payment_day` y que las
cuotas se derivaran del ciclo vigente. **Está descartada.** Galicia no permite fecha fija:
ofrece rangos, y dentro del rango el día cambia mes a mes. El usuario copia el día real del
resumen todos los meses, así que hacer que editar la tarjeta re-feche las cuotas futuras le
movería las 47 cuotas **todos los meses** — peor que el estado actual.

---

## Decisión

**Materializar el resumen como entidad, con la transacción apuntándole por FK reasignable.**

Es lo único que alguien probó en producción: Mobills persiste la *fatura* con ciclo de vida y
un campo `Fatura` editable en el formulario de gasto; Organizze materializa
`credit_card_invoices` con fechas propias y ofrece «enviar para a fatura anterior/próxima».
Ninguna de las cinco apps relevadas permite editar las fechas de un ciclo concreto para mover
transacciones.

### Schema

```sql
create table credit_card_cycles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id),
  payment_method_id uuid not null references payment_methods(id) on delete cascade,
  closing_date      date not null,
  due_date          date not null,
  source            text not null default 'generated',  -- 'generated' | 'declared'
  created_at        timestamptz not null default now(),
  unique (payment_method_id, closing_date)
);

alter table transactions
  add column cycle_id      uuid references credit_card_cycles(id),
  add column purchase_date date;
```

`default_closing_day` / `default_payment_day` **sobreviven como generador**, no como verdad:
paren el próximo ciclo cuando no hay dato mejor.

**Sin columna `status`.** El estado se deriva de datos existentes: abierto si hoy ≤ cierre,
cerrado si pasó, pagado si existe una transacción con `card_payment_for` en ese ciclo.
Agregarlo sería una segunda fuente de verdad. Como efecto colateral, atar el pago a `cycle_id`
en vez de al *mes* del vencimiento elimina de raíz la clase de bug que obligó al parche de
`rangoDelMes` (1-sep-2026).

**Sin columna `declared_total`.** Es la extensión natural para conciliar contra el total del
resumen, y no entra acá — ver «Fuera de alcance».

`source` no es decorativo: distingue una fecha que la app estimó de una que el usuario leyó del
resumen, y es lo que impide que una regeneración pise un dato real.

### El invariante central

> **Declarar un cierre nuevo NO reasigna ninguna transacción ya asignada.** Sólo actualiza las
> fechas de los ciclos futuros con `source = 'generated'`. Una transacción cambia de resumen
> únicamente por acción explícita del usuario.

Esto es lo que responde a la advertencia del párrafo anterior, y es la razón por la que se
elige una FK persistida sobre fechas recalculadas: si la pertenencia se deriva, tocar el cierre
mueve todo; si está escrita, no se mueve nada.

Lo que sí se actualiza es `t.date`, que pasa a ser **derivado del ciclo**. Sigue existiendo
porque lo leen 19 archivos, pero deja de ser la verdad: la verdad es `cycle_id`. Un test lo fija.

### Generación perezosa

Los ciclos se crean cuando hacen falta —al cargar una cuota que vence en un mes sin ciclo—, no
por cron ni por lote. Mismo patrón que `syncAutomaticRecurringCharges`. **Se generan también
hacia atrás**: cargar una compra vieja en cuotas debe poder materializar los ciclos previos
(requisito del spec de alta de cuotas en curso, ver «Fuera de alcance»).

### La regla del borde

Una compra hecha el día del cierre **entra en el ciclo que cierra** — el ciclo corre hasta las
23:59 de esa fecha. Es la regla del banco, confirmada por el usuario y consistente con el
código actual (`calculateCreditPaymentDate` salta de ciclo con `diaCompra > closingDay`, que
con `27 > 27` da false). **No hay bug de borde que arreglar**, y el diseño no marca esas
compras como dudosas.

Queda una anomalía observada y no explicada: una compra internacional fechada 30-jul-26
(el día del cierre anterior de la Mastercard) aparece en el resumen siguiente. Hipótesis:
liquidación diferida — el resumen imprime la fecha de la operación, pero el corte usa la fecha
de presentación del comercio. El usuario la considera irrelevante para su caso. La reasignación
manual la cubre.

---

## Cómo cambia la lógica

Todo el cálculo vive en `lib/finance/`, consumido por el store (cliente) **y** por las tools
del chat (servidor), que es la garantía estructural de que no puedan decir números distintos.

### Módulo nuevo: `lib/finance/cycles.ts`

| Función | Qué hace |
|---|---|
| `generarCiclos(method, hasta, declarados)` | Pare los ciclos faltantes desde los defaults, sin pisar los `declared` |
| `cicloDeCompra(purchaseDate, ciclos)` | A qué resumen pertenece una compra |
| `cicloVigente(ciclos, now)` | Reemplaza a `getCreditCycleDates` |

**Tarjetas sin ciclo configurado.** Hay 2 en producción sin `default_closing_day` /
`default_payment_day`. No se les inventa un ciclo: sus transacciones quedan con
`cycle_id = NULL` y siguen cayendo al branch que ya existe en `computePaymentMethodStatus`
(«crédito sin ciclo» → saldo histórico). `cicloVigente` devuelve `undefined` para ellas, igual
que hoy `getCreditCycleDates`. El control de «cero huérfanas» de la migración sólo aplica a
tarjetas **con** ciclo configurado.

### Tres lugares donde se retira la aritmética de meses

- **`balances.ts` — pertenencia**: de `sameMonthYear(t.date, nextPaymentDate)` a
  `t.cycle_id === ciclo.id`.
- **`balances.ts` — resumen vencido**: `computePendingCreditCards` busca hoy el ciclo anterior
  con `subMonths(nextPaymentDate, 1)`. Pasa a ser «el ciclo anterior por `closing_date`». Esto
  además levanta la limitación anotada en el CLAUDE.md («sólo un ciclo hacia atrás»): cuántos se
  retienen pasa a ser una decisión, no un límite del modelo. **El piso de `initial_balance_at`
  se mantiene sin cambios** — un resumen anterior al ancla ya está dentro del saldo declarado.
- **`prepare.ts` — `periodDate`**: hoy se deriva con una heurística que adivina si `t.date` es
  un vencimiento mirando el día del mes
  (`dayOfMonth <= method.default_payment_day + 2`, con un `+2` sin justificación escrita). Con
  el ciclo materializado sale del mes del cierre y la heurística se borra.

### Cuotas

La cuota N va al **N-ésimo ciclo**, no a `addMonths(primera, N)`. Las cuotas dejan de contar
meses y pasan a contar resúmenes.

### Carga de datos

`credit_card_cycles` entra al `Promise.all` del store (`financeStore.ts`) **y** al del
`dataLoader` del chat. Los dos o ninguno.

### Actions

- `payCreditCardCycle` — gana el paso opcional de declarar el próximo ciclo
- `declararCiclo(methodId, closingDate, dueDate)` — nueva
- `reasignarTransaccion(transactionId, cycleId)` — nueva
- Alta de transacción y de cuotas — resuelve `cycle_id` y persiste `purchase_date`

---

## Pantallas

### 1. Declarar el próximo ciclo — opcional, en tres lugares

El diálogo de **«Registrar pago»** ofrece el paso, con la estimación mostrada como texto gris
(«Estimado: cierra 27 sep · vence 4 oct») y un botón «Lo tengo a mano, lo cargo» que la vuelve
editable. Se puede pagar sin cargar nada.

> **Confirmar exige un gesto.** Darle «Pagué» de largo nunca convierte una estimación en dato
> confirmado. Si lo hiciera, la app quedaría afirmando que conoce fechas que inventó, y después
> no habría forma de distinguir cuál es cuál.

Si no se carga, aparece un **recordatorio en Compromisos** — pero no al pagar, sino **el día en
que ese ciclo cierra**, que es cuando el banco emite el papel. Nunca pide algo que el usuario
todavía no puede tener. «Ahora no» lo silencia hasta el cierre siguiente.

Y las fechas viven además en la **ficha de la tarjeta**, marcadas como «del resumen» o
«estimado», editables en cualquier momento sin depender de haber pagado.

Se eligió esta combinación porque el usuario declaró que marca los pagos de memoria y sin el
resumen a mano: un paso obligatorio ahí agregaría fricción justo en la acción que —según E11—
es lo único que impide que el disponible se infle solo.

### 2. El detalle de la tarjeta se agrupa por ciclo

`payment-method-detail-modal.tsx` agrupa hoy **por mes**. Pasa a agrupar **por resumen**, con
navegación entre resúmenes. Es lo que permite comparar contra el papel del banco.

Las transacciones sin `purchase_date` se muestran como **«sin fecha de compra»**. La app admite
lo que no sabe en vez de fabricar un día.

### 3. Mover una compra al resumen vecino

«Mover a otro resumen» se suma al ActionSheet de la fila, junto a Editar y Eliminar (patrón ya
establecido: la fila abre el ActionSheet en mobile, kebab en desktop). El diálogo ofrece el
ciclo anterior, el actual y el siguiente.

**Mover una cuota corre el plan entero**, avisando cuántas cuotas mueve y hasta cuándo se
estira. El banco no parte un plan entre dos resúmenes; permitir mover una cuota suelta dejaría
armar un estado que en el papel no existe.

---

## Migración

67 ciclos, 10 tarjetas, de sep-2025 a ago-2027. 430 movimientos de crédito de 6 usuarios reales.

1. **Schema** — tabla y columnas
2. **Ciclos retroactivos** — 67 filas desde los defaults actuales, todas `source: 'generated'`
3. **`cycle_id`** — cada transacción al ciclo cuyo vencimiento cae en el mes de su `t.date`;
   es exactamente la agrupación que ya tiene, escrita explícitamente
4. **`purchase_date`** — backfill de las **326 cuotas** desde `installment_plans.purchase_date`,
   que existe y es NOT NULL desde siempre. Las **104** restantes quedan NULL: no hay de dónde
   sacarlas y `created_at` mide cuándo se anotó, no cuándo se compró
5. **Realineado de `t.date`** — 47 filas (todas de una sola tarjeta), con guard

> **Realineado seguro**: cada transacción toma el vencimiento de *su* ciclo. Si eso cayera en un
> mes distinto al que tiene, no se toca y se marca para revisión. Medido: hoy 0 filas cruzarían
> de mes. El guard igual va — es la diferencia entre unificar cómo se muestra y mover plata de
> un resumen a otro.

**El día del deploy no cambia ningún monto, ningún total ni ninguna pertenencia.** Sólo se
unifican fechas mostradas dentro del mismo mes. Mismo criterio que el Plan 1 del disponible
anclado.

### Verificación

**Invariante duro**: el total a pagar de cada tarjeta, por mes, idéntico antes y después. Foto
de `(tarjeta, mes, suma)` antes, foto después, diff. Cualquier diferencia distinta de cero
aborta la migración.

Más tres controles: cero transacciones huérfanas (sin `cycle_id` en tarjetas con ciclo), cero
`t.date` cambiados de mes, y ciclos sin solapes ni huecos por tarjeta.

### Dónde se prueba

**No alcanza con DEV tal cual**: nació de un backup de producción pero se le purgaron los
usuarios reales, y el demo Emi no tiene compras en dólares ni cuotas viejas. Correr ahí sólo
probaría que el SQL no explota.

El procedimiento es restaurar en DEV el **dump de producción del día** (el del VPS de las 04:00,
procedimiento en `infra/vps/README.md`), correr la migración contra esa copia, comparar las dos
fotos y verificar en el navegador con la sesión de un usuario real restaurado. Recién con eso
en verde, producción.

Eso salda de paso el **restore test periódico** pendiente desde el 26-ago: el `pg_restore --list`
diario sólo prueba que el archivo no está corrupto.

⚠️ En la cuenta B existe un proyecto llamado **`LHSTUDIO`** (inactivo) que **no es** el
`LHStudio` de producción — ese vive en la cuenta A. Nombres casi idénticos en cuentas distintas.

---

## Tests

Escenarios numerados en `escenarios-disponible.test.ts`, que va por E12:

| | |
|---|---|
| **E13** | Declarar un cierre no mueve ninguna transacción de resumen — el invariante central |
| **E14** | La cuota N cae en el N-ésimo ciclo, con ciclos desparejos (vence 4-sep y 9-oct). **Falla hoy** |
| **E15** | Mover una cuota corre el plan entero y estira la última |
| **E16** | Compra el día del cierre → entra al ciclo que cierra |
| **E17** | El realineado de `t.date` nunca cruza de mes |

Más `cycles.test.ts` para las funciones puras y un **test de paridad chat/pantalla con el reloj
congelado**, mismo patrón que `historico-tools.test.ts`.

⚠️ **Los fixtures de ciclos van desparejos por defecto.** Los dos últimos bugs grandes de este
repo se escondieron en fixtures demasiado prolijos: E8 no vio el bug de los dólares porque ponía
`totalARS === total`, y cinco suites no vieron el del histórico porque ponían
`periodDate === date`. El equivalente acá sería fixturear ciclos mensuales perfectos.

### Gate visual, obligatorio

Se extiende `scripts/seed-escenarios-tarjeta.mjs` con una tarjeta de ciclos irregulares reales
(23-jul / 20-ago / 24-sep) y `verificar-escenarios-tarjeta.mjs` con el flujo completo. No es
opcional: los dos últimos defectos de UI del proyecto —el toggle de 28px y el botón de 40px del
popup— los encontró el navegador con el gate de tests en verde.

---

## Orden de salida

Schema y migración a producción **antes del merge a `produccion`**, no antes del merge a
`master`. Entra a la **1.0.0**, que estaba esperando algo que el usuario note.

---

## Lo que no se pudo determinar

Durante el diagnóstico se afirmó que una compra concreta estaba en el resumen equivocado,
apoyándose en `created_at` como fecha de compra. **La afirmación se retiró**: `created_at` mide
cuándo se anotó el movimiento, no cuándo se compró, y el usuario carga en tandas. No hay forma
de saber cuándo se hizo esa compra.

Queda anotado porque es el mejor argumento a favor de `purchase_date`: **no se pudo ni
investigar el caso que originó el spec.**

---

## Fuera de alcance

**Recargos de compras en dólares (B).** El criterio que originó este spec era «que Chanchito
coincida con el resumen del banco», y los ciclos son sólo una de las causas del desvío. Medido
sobre los dos resúmenes reales:

- Visa, USD 30,60 de suscripciones: Chanchito $47.583 (blue 1555) · Galicia $70.087 (oficial
  1497 + IVA 21% + IIBB 2% + RG 5617 30%)
- Mastercard, USD 100: Chanchito $155.500 · Galicia $196.820 (oficial + percepción AFIP 30%)

Dos causas independientes: la app convierte al blue y el banco liquida al oficial, y la app no
modela percepciones ni IVA. **Entre 27% y 47% de desvío** sobre consumos en dólares. Spec propio.

**Conciliación contra el total del resumen.** La columna `declared_total` y la vista de
diferencias. Se pospone deliberadamente: al comparar contra el papel, lo que más aparece **no
son ciclos mal asignados sino movimientos no anotados** — en el resumen medido faltaban 5 viajes
de SUBE, un subte y un pago de $50.000. Mezclarlo haría que la feature se lea como un reproche
por no anotar. Nace junto a su respuesta (fase 3.1: foto del ticket, gastos por mail).

**Alta de cuotas en curso.** Cómo carga un usuario nuevo una compra a cuotas hecha hace meses,
cuando no conoce los ciclos de entonces. Toca este modelo (necesita ciclos retroactivos, que
este spec deja previstos) pero es un flujo de onboarding, y el onboarding es hoy el problema
medido de la app: 8 de 17 usuarios no cargaron ni un movimiento. Merece brainstorming propio.
Intuición registrada: **«¿en qué cuota vas?» es más confiable que «¿cuándo compraste?»** — el
usuario sabe con certeza que va por la 4 de 12 porque el resumen lo imprime (`04/06`, `02/09`),
y la fecha de hace cinco meses la recuerda mal. Las dos preguntas son equivalentes.

**Importar el resumen en PDF.** No es una alternativa a declarar las fechas a mano: es una
*fuente* para llenar la misma entidad. Sin la entidad no tiene dónde aterrizar. Verificado
durante este diseño que el PDF de Galicia trae las seis fechas, cada consumo con su fecha real y
la numeración de cuotas, y que se extrae con `pypdf` en ~20 líneas. Empalma con la fase 3.1.
