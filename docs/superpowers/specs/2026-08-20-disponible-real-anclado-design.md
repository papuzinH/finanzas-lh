# Disponible real anclado — diseño

**Fecha**: 2026-08-20
**Estado**: aprobado, pendiente de plan de implementación

> Nota de privacidad: este repo es público. El diagnóstico que originó el diseño usa cifras
> redondeadas y no identifica cuentas. Los escenarios de prueba usan datos ficticios.

## El problema

El número central de Chanchito —"Tu plata libre para hoy"— no representa nada verificable
en el mundo real. En el caso que disparó este diseño, la app mostraba un disponible de
~$728.000 mientras la cuenta operativa del usuario tenía ~$10.600. Ni el cálculo ni los
datos estaban corruptos: el modelo es el que no cierra.

`computeGlobalBalance` construye el disponible como **flujo acumulado desde el principio de
los tiempos**: suma todos los ingresos registrados, resta todos los gastos registrados. Un
modelo así solo dice la verdad si el usuario registra el 100% de sus movimientos, para
siempre. En cuanto se olvida de anotar una salida —una transferencia a un broker, plata
que sacó del ahorro, un gasto en efectivo— el número se despega de la realidad y **no
vuelve nunca**, porque no hay ningún punto de reanclaje.

En el caso relevado, dos errores independientes empujaban en direcciones opuestas:

- **De más**: la app creía que la cuenta operativa tenía ~$2.860.000. Faltaban registrar
  ~$2.850.000 de salidas hacia cuentas de inversión y compra de dólares.
- **De menos**: la app no sabía que existían ~USD 2.800 líquidos y ~USD 1.200 invertidos
  en un broker, porque `computeGlobalBalance` ni mira `investment_transactions`.

Por eso el número quedaba en tierra de nadie: no era el saldo bancario, ni el disponible
real, ni el patrimonio. Era el residuo de un flujo registrado a medias.

Dos causas estructurales, ambas del modelo y no del código:

1. **No hay ancla.** `payment_methods` no tiene saldo. Nada permite decir "esta cuenta
   tiene esto hoy" y arrancar de ahí.
2. **No hay concepto de plata que no es para gastar.** `internal_transfers` existe pero no
   tiene origen ni destino: asume un único "ahorro" genérico. Mover plata a un broker, a un
   plazo fijo o a dólares no tiene dónde anotarse, y sacarla de ahí para un gasto tampoco.

## Qué se decidió

| Decisión | Resolución |
|---|---|
| **Alcance** | El disponible sale **solo del bolsillo**. La plata en ahorro o inversión no cuenta: si contara, la app estaría invitando al usuario a romper su propio ahorro sin decírselo. |
| **Anclaje** | Saldo declarado por cuenta + recordatorio de anotar a los 2 días sin actividad. El ajuste de saldo es la **red de contención**, no la herramienta principal. |
| **Gasto desde una reserva** | Una sola acción del usuario genera dos movimientos internos (retiro + gasto), igual que hoy pagar una tarjeta genera su transacción con `card_payment_for`. |
| **Ingreso futuro** | El usuario declara su **ritmo** de cobro, no la fecha. Define qué compromisos se descuentan. |
| **Mensualidades de crédito** | No se descuentan aparte: ya viajan dentro del resumen de su tarjeta. |
| **Fuera de alcance** | Pago parcial de tarjeta (ver sección propia). |

### Por qué el ritmo y no la fecha

La primera versión del diseño calculaba un "ciclo de cobro" a partir de la fecha del último
sueldo. Se descartó por frágil: los usuarios cobran el 1°, los últimos días hábiles, el
último martes, o cuando les pagan. Peor todavía —y esto se detectó con datos reales— **un
usuario puede normalizar la fecha al cargar**: cobrar los últimos días hábiles y registrarlo
igual el día 1 para que las cuentas cierren por mes. Inferir del historial leería *cómo el
usuario decidió anotar*, no cuándo cobra.

El modelo no necesita saber qué día cobra. Necesita saber **si hay otro cobro antes de que
venza esto**. Para eso alcanza con el ritmo, y el caso irregular deja de ser un parche para
ser una rama de primera clase.

## Modelo de datos

Todos los cambios son aditivos. Ninguna columna existente cambia de tipo ni de semántica.

### `payment_methods`

```sql
ALTER TABLE payment_methods
  ADD COLUMN bucket text NOT NULL DEFAULT 'pocket'
    CHECK (bucket IN ('pocket', 'reserve')),
  ADD COLUMN initial_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN initial_balance_at date;
```

- **`bucket`** decide si el medio cuenta para el disponible. Es **ortogonal a `type`**: una
  reserva puede ser una caja de ahorro (`debit`), un broker o un plazo fijo. El default
  `'pocket'` preserva el comportamiento actual para todo lo existente.
- **`initial_balance` / `initial_balance_at`** son el ancla. `initial_balance_at` nulo
  significa **"sin anclar"**: el saldo se calcula sumando desde el primer movimiento
  registrado, que es el comportamiento actual. Con fecha, se toma `initial_balance` como
  punto de partida y **solo se computan los movimientos posteriores a esa fecha** — los
  anteriores quedan fuera del saldo, porque ya están representados dentro del ancla.
- Las tarjetas de crédito (`type = 'credit'`) **no llevan saldo inicial**: su deuda se deriva
  del ciclo, como hoy. El campo se ignora para ellas.

### `internal_transfers`

```sql
ALTER TABLE internal_transfers
  ADD COLUMN from_payment_method_id uuid REFERENCES payment_methods(id),
  ADD COLUMN to_payment_method_id   uuid REFERENCES payment_methods(id);
```

Hoy la tabla no tiene origen ni destino: asume "del bolsillo a un ahorro genérico". Con
estas dos columnas, "mandé plata al broker" y "saqué del broker para un gasto" son la misma
tabla en direcciones opuestas. Las filas viejas quedan con ambos nulos y se interpretan con
la semántica actual (salida del bolsillo hacia ahorro sin destino identificado).

### `transactions`

```sql
ALTER TABLE transactions
  ADD COLUMN is_balance_adjustment boolean NOT NULL DEFAULT false;
```

Los ajustes de conciliación son transacciones marcadas, siguiendo el patrón que el repo ya
usa con `card_payment_for`: quedan visibles en el historial y **no reescriben el pasado**.
Se excluyen de las analíticas de consumo por categoría, igual que los pagos de tarjeta.

### `users`

```sql
ALTER TABLE users
  ADD COLUMN income_rhythm text NOT NULL DEFAULT 'monthly'
    CHECK (income_rhythm IN ('monthly', 'biweekly', 'weekly', 'irregular'));
```

## El cálculo del disponible

```
disponible = Σ saldo(medio)  para todo medio con bucket = 'pocket'
           − compromisos_del_período

saldo(medio) = initial_balance
             + ingresos al medio            (desde initial_balance_at)
             − gastos del medio
             + transferencias entrantes
             − transferencias salientes
             ± ajustes de conciliación
```

### Qué entra en `compromisos_del_período`

Un compromiso se descuenta si cumple **las dos** condiciones:

1. **Sale del bolsillo.** Los fijos con medio de crédito **no se descuentan**: ya están
   facturados dentro del resumen de su tarjeta. Descontarlos aparte los contaría dos veces.
   En el caso relevado esto representaba ~$300.000 de doble conteo.
2. **Vence dentro del período actual**, según el ritmo declarado:
   - `monthly` → mes calendario en curso
   - `biweekly` → quincena en curso
   - `weekly` → semana en curso
   - `irregular` → **sin período: se descuenta todo lo comprometido**, sin importar cuándo
     venza. Es la lectura conservadora, y es la correcta cuando no hay un próximo ingreso
     que asumir.

Los resúmenes de tarjeta se tratan igual: se descuentan si vencen dentro del período. Los
que vencen después se muestran aparte, como **comprometido del próximo período** — no
alteran el disponible de hoy, pero el usuario tiene que verlos para saber cuánto va a poder
ahorrar al cierre.

### Por qué esto no es doble conteo

El saldo de una cuenta del bolsillo es su **saldo real**: las compras hechas con tarjeta de
crédito todavía no lo tocaron. Por eso restar el resumen es correcto — es plata que está en
la cuenta pero ya tiene dueño.

Esto **sí** habría sido doble conteo en el modelo actual, donde el "saldo" se construye
restando cada compra en el momento de hacerla. La diferencia es exactamente el cambio de
flujo acumulado a saldo anclado.

## Conciliación

El orden importa: **primero recuperar el dato, después ajustar el número.**

**1. Recordatorio de anotar.** A los 2 días sin registrar ningún movimiento, la app
pregunta si falta anotar algo. Es el camino principal, porque un gasto anotado conserva
monto, fecha, categoría y medio.

**2. Ajuste de saldo.** Disponible siempre a pedido, y ofrecido automáticamente cuando el
usuario afirma que ya anotó todo y el saldo declarado sigue sin coincidir. La app calcula
la diferencia, la registra como ajuste visible y ofrece clasificarla:

- *"Lo mandé a ahorro"* → se convierte en transferencia a una reserva
- *"Fue un gasto"* → se convierte en gasto (pide categoría)
- *"Solo ajustar"* → queda como ajuste sin clasificar

Un ajuste nunca borra ni edita movimientos existentes.

## Onboarding y migración

**Usuario nuevo.** Dos agregados al onboarding, ambos salteables:

- En el slide de medios de pago, junto a cada cuenta: *"¿cuánto tenés hoy?"*. Es un dato que
  la persona tiene a mano mientras carga la cuenta. Si saltea, el saldo arranca en 0 y el
  primer recordatorio lo pide.
- Una pregunta de una línea sobre el ritmo de cobro, junto al primer ingreso.

**Usuario existente.** Un flujo de puesta a punto la primera vez que abre la versión nueva:
saldos de sus cuentas, cuáles son reservas, y su ritmo. Sin esto el número seguiría
mintiendo en silencio, que es precisamente lo que el diseño viene a corregir.

**Después.** Todo editable desde Ajustes. El ritmo de cobro cambia con la vida —de relación
de dependencia a freelance, un laburo quincenal que se suma— y un valor fijado en el
onboarding envejecería mal.

## Escenarios de prueba

Cada escenario se implementa como test del store. Datos ficticios. Son la garantía de que el
modelo sirve a usuarios que no son el autor.

**E1 — Sueldo mensual, todo por billetera.** Bolsillo $150.000. Resumen de tarjeta $200.000
que vence el mes próximo. Fijos de débito pendientes $80.000 este mes. Ritmo `monthly`.
→ Disponible **$70.000**. Comprometido del próximo: $200.000.

**E2 — Mitad en efectivo.** Billetera $50.000 + efectivo $30.000. Sin tarjetas. Fijos
$20.000. Ritmo `monthly`.
→ Disponible **$60.000**. El efectivo es un medio del bolsillo como cualquier otro.

**E3 — Freelancer que cobra irregular.** Bolsillo $100.000. Reserva USD 500. Resumen
$150.000 que vence el mes próximo. Fijos de débito $40.000. Ritmo `irregular`.
→ Disponible **−$90.000**: al no haber próximo cobro que asumir, se descuenta todo. La
reserva en dólares no suma.

**E4 — Ahorrista en dólares.** Bolsillo $300.000. Transfiere $200.000 a la reserva
"Mis dólares".
→ Bolsillo **$100.000**, reserva $200.000, disponible **$100.000**. La transferencia no es
un gasto: no aparece en las analíticas de consumo.

**E5 — Gasto pagado desde una reserva.** Bolsillo $100.000, reserva $500.000. Registra un
gasto de $150.000 eligiendo la reserva como origen.
→ Disponible sigue en **$100.000**; reserva $350.000. El gasto **sí** aparece en movimientos
y suma a su categoría. Internamente son dos movimientos, para el usuario fue una acción.

**E6 — Mensualidad facturada en tarjeta.** Fijo de $20.000 con medio de crédito. Resumen de
esa tarjeta $100.000 (que ya lo incluye), venciendo dentro del período.
→ Se descuentan **$100.000**, no $120.000. Es el caso que causaba el doble conteo.

**E7 — Conciliación.** La app calcula $200.000; el usuario declara $150.000 y confirma que
ya anotó todo.
→ Ajuste visible de **−$50.000**, saldo queda en $150.000, ningún movimiento previo se
modifica.

## Fuera de alcance

**Pago parcial de tarjeta.** Hoy `isCreditCardCyclePaid` busca un pago en el mes del
vencimiento y da el ciclo por saldado. Quien paga el mínimo queda con deuda viva más
intereses y punitorios, y la app le diría que está al día. Para muchos usuarios argentinos
esto no es un caso borde. Queda documentado como **limitación conocida** y se diseña aparte:
arrastra saldo refinanciado, intereses y punitorios, que es un proyecto propio.

**Sincronización automática con bancos.** No hay open banking utilizable en Argentina; el
anclaje manual es la respuesta realista.

**Cotizaciones de reservas en moneda extranjera.** Las reservas se muestran en su moneda.
Valuarlas en pesos reutilizaría `lib/finance/` y queda para cuando exista la vista de
patrimonio, que no es parte de este diseño.

## Riesgos

**El número va a empeorar mucho para los usuarios actuales.** En el caso relevado, el
disponible pasaría de ~$728.000 a un número cercano a lo que realmente hay en la cuenta.
Es la respuesta correcta a la pregunta, pero es un cambio brusco: la migración tiene que
explicar por qué el número cambió, o se va a leer como un bug.

**El recordatorio puede volverse molesto.** Dos días es agresivo. Debe poder silenciarse y
no debe dispararse si el usuario ya concilió recientemente.

**`bucket` es una decisión que el usuario puede tomar mal.** Marcar la cuenta sueldo como
reserva dejaría el disponible en cero. El onboarding tiene que explicar la distinción en
una línea: *el bolsillo es de donde gastás; la reserva es lo que decidiste no gastar.*
