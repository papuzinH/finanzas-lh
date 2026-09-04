# Ingresos a mes vencido: a qué mes cuenta un cobro

**Fecha**: 2026-09-03
**Estado**: diseño aprobado, pendiente de plan de implementación
**Alcance**: la imputación de un ingreso a un mes. El disponible, los gastos y el ritmo de cobro no se tocan.

---

## El problema

Un usuario de la beta lo reportó el 2026-09-01: **cobra el 29 de agosto la plata de
septiembre, y el día 1 la app le dice «0 ingresos este mes»**.

El mecanismo es de una línea. `getMonthlyIncome` (`financeStore.ts:1193`) filtra con
`isSameMonth(parseLocalDate(t.date), now)`: mes calendario estricto sobre la fecha del
movimiento. Lo mismo hace la rama de ingresos de `computeExpensesByCategory`
(`analysis.ts:35`), que además lo documenta como decisión («mismo criterio que
`getMonthlyIncome()`»).

### No es un caso de borde: es un tercio de los usuarios

Medido contra producción el 2026-09-03:

| Métrica | Valor |
|---|---|
| Usuarios con ingresos cargados | 10 |
| Usuarios que **hoy** ven «$0 este mes» | 4 |
| …de los cuales cobraron entre el 25 y el 31 de agosto | **3** |
| Usuarios que fechan **siempre** sus ingresos a fin de mes | 3 |

O sea: **3 de 10 usuarios con ingresos están viendo hoy mismo que no entró plata, habiendo
cobrado hace días.** No es un usuario despistado, es el patrón de casi un tercio de la base.

Distribución de los 33 ingresos por día del mes:

| Día | 1 | 2-5 | 7-23 | 25-29 | 30-31 |
|---|---|---|---|---|---|
| Ingresos | **15** | 5 | 5 | **8** | 0 |

Dos picos y un valle en el medio. El del día 1 es gente que **normaliza la fecha al cargar**
—Lauti entre ellos: cobra los últimos días hábiles y lo anota el 1°—, o sea usuarios que ya
están esquivando el problema a mano. El de 25-29 es quien anota el día que cobra y come el bug.

### Lo que hoy funciona bien y no hay que romper

**El disponible no miente.** `computeAvailableToSpend` sale del bolsillo, que no depende del
mes: la plata está en la cuenta desde que entró. `pocket.ts:25` documenta que usa `t.date` y
no `periodDate` a propósito. Lo que miente son las cifras «del mes».

### El alcance real del daño

`getMonthlyIncome` no alimenta sólo la card. Con `income = 0`, además quedan mal:

- el gráfico **«¿Llegás a fin de mes?»** (`getMonthlySpendingPace`), que lo usa de referencia
  contra el gasto proyectado — a un usuario que cobra a fin de mes le dice que se funde;
- la **tasa de ahorro** (`getSavingsRateSeries` sobre `getMonthlyTrend`);
- `getMonthlyExpensesBreakdown` y `getMonthlyLiquidityBreakdown`.

---

## Por qué ninguna regla automática alcanza

Quien cobra el 29 de agosto **por septiembre** y quien cobra el 29 de agosto **por agosto
trabajado** anotan exactamente el mismo movimiento. **La app no puede distinguirlos sin
preguntar.** Cualquier heurística acierta con uno y se equivoca con el otro, en silencio.

Y hay un antecedente escrito en el propio repo. `getPeriodEnd` (`pocket.ts:108`) documenta,
desde el 2026-08-20, por qué no se modela la fecha de cobro:

> *No se modela la fecha exacta de cobro a propósito: los usuarios cobran el 1°, los últimos
> días hábiles o el último martes, y algunos normalizan la fecha al cargar.*

Inferir la imputación del historial leería **cómo el usuario decidió anotar**, no cuándo
cobra. Es la misma trampa, un año más tarde.

### Las alternativas que se descartaron

| Opción | Por qué no |
|---|---|
| **Ventana móvil** («desde tu último cobro») | El inicio del período saldría del último ingreso registrado. Para quien tiene sueldo + freelance + alquiler, un freelance chico corta la ventana y la cifra queda **peor** que hoy. |
| **Mostrar sólo el último cobro con su fecha** | Honesto y barato, pero pierde a quien cobra de varias fuentes, y deja el gráfico y la tasa de ahorro leyendo `income = 0`. |
| **Mes calendario + aclaración cuando da $0** | Mata el síntoma visible con lo mínimo, pero no arregla ninguno de los cuatro consumidores de arriba. |
| **Backfill automático del pasado** | Movería cifras históricas de 10 usuarios sin que lo pidan. Contradice de frente la regla elegida: nada se imputa solo. |
| **Regla por monto** («si es grande, es el sueldo») | Es un umbral inventado. El repo ya se quemó con eso: el `+2` de los ciclos de tarjeta era un número sin justificación escrita que después falló. |

---

## La decisión

**El cobro pertenece a un mes, y ese dato lo declara el usuario** — igual que
`transactions.cycle_id` declara a qué resumen pertenece una compra. Es el mismo problema que
resolvieron los ciclos de tarjeta, en la otra punta del flujo.

**La preferencia pre-elige; nunca imputa sola.** Se declara una vez («lo que cobro a fin de
mes es del mes que viene») y su único efecto es qué opción viene marcada en el selector.
Confirmar exige un gesto, que es la misma regla que gobierna declarar un resumen.

El override por cobro no es un lujo: **el aguinaldo del 30 de junio es de junio**, y con una
regla actuando sola se iría a julio.

---

## El modelo

### Una columna

```sql
alter table transactions
  add column income_period date,
  add constraint income_period_solo_ingresos
    check (income_period is null or type = 'income');
```

`income_period` guarda **el día 1 del mes al que cuenta el cobro**. `null` = contá por la
fecha del movimiento, o sea el comportamiento actual. El `CHECK` hace que la restricción sea
del schema y no de la convención: un gasto con `income_period` es un error de la base, no un
bug silencioso.

### Una línea en `prepareTransactions`

```ts
const periodDate = ciclo ? ciclo.closing_date : (t.income_period ?? t.date);
```

Esto es lo que hace barata a toda la feature. `periodDate` ya significa *«a qué mes visual
pertenece esto»* — el concepto que los ciclos inventaron para las compras de crédito. Los
ingresos nunca lo habían usado porque para ellos siempre valía `t.date`.

### Qué se arregla solo y qué hay que tocar

**Sin tocar una línea** (ya leen `periodDate || date`):

- `/movimientos` (`page.tsx:91`, con el comentario *«CAMBIO CLAVE: Usamos periodDate»* ya escrito)
- `get_monthly_summary` del chat (`readTools.ts`)
- `computeMonthlyBalance`

**Tres filtros que pasan de `t.date` a `periodDate`:**

- `getMonthlyIncome` y `getMonthlyIncomeTransactions` (`financeStore.ts:1193`)
- la rama de ingresos de `computeExpensesByCategory` (`analysis.ts:35`)

**Y con eso caen en cascada** los cuatro consumidores dañados: el gráfico «¿Llegás a fin de
mes?», la tasa de ahorro, `getMonthlyExpensesBreakdown` y `getMonthlyLiquidityBreakdown`.

### La ventana del borde, con evidencia

`necesitaDeclararMes(fecha)` devuelve true cuando la fecha cae en **los últimos 7 días del
mes** (25-31 en un mes de 31, 24-30 en uno de 30, 22-28 en febrero).

El número no es arbitrario: medido contra producción, esa ventana captura **los 8 cobros de
fin de mes reales y ninguno de los otros 25** — el ingreso no ambiguo más cercano por debajo
está el día 23, y no hay ninguno el 30 ni el 31.

La decisión vive en **funciones puras en `lib/finance/`** —`necesitaDeclararMes(fecha)` y
`mesesCandidatos(fecha)`— porque la consumen tres lugares distintos: el form, el chat y el
repaso. Es la misma garantía estructural que ya sostienen `cycles.ts` e `historico.ts`: si la
regla vive en un solo lado, la pantalla y el chat no pueden discrepar.

---

## La captura

### La preferencia

`users.income_counts_next_month` (`boolean`, nullable), al lado de `income_rhythm`:

- `null` — todavía no contestó
- `false` — el cobro cuenta por su fecha
- `true` — lo que cobra a fin de mes cuenta al mes siguiente

Editable siempre desde Ajustes.

### En el onboarding

Una línea más dentro de `RhythmSlide` —**no una pantalla nueva**—, visible **sólo si el ritmo
es mensual**: para semanal o irregular la pregunta no significa nada. El «Ahora no, lo
configuro después» que el slide ya tiene sigue funcionando, así que no agrega ningún paso
bloqueante.

⚠️ **Riesgo asumido y declarado**: el onboarding es hoy el punto más frágil de la app — 8 de
17 usuarios se caen antes de cargar un movimiento. Por eso la pregunta se suma al paso que ya
existe en vez de abrir uno propio.

### El selector en el alta

Aparece **sólo** cuando `type === 'income'` **y** `necesitaDeclararMes(fecha)`. Dos opciones
con el **nombre real del mes** («Agosto» / «Septiembre»), no «este / el que viene», que se lee
ambiguo justo donde importa. Viene pre-elegido según la preferencia.

**Guardar el form con el selector a la vista es el gesto de confirmación.** Nada se imputa
escondido — y a diferencia del paso opcional de declarar un resumen, acá el control está
visible, no detrás de un desplegable.

Aplica en `create-transaction-dialog.tsx` y `edit-transaction-dialog.tsx`.

**Consecuencia visible, a anticipar en el copy**: el 29 de agosto marcás «este cobro es de
septiembre» y la card de **agosto** deja de contarlo, pudiendo quedar en $0. Es correcto
—cobraste plata de septiembre— pero es un número que se mueve en pantalla.

### En el chat

`create_transaction` suma `mes_del_cobro`, opcional, `yyyy-MM`. Si es un ingreso en el borde
y no vino, la tool **devuelve un error dirigido al modelo** para que pregunte: el patrón de
dos pasos sin estado que ya usan las confirmaciones de borrado de `delete_entity`.

⚠️ El mensaje se redacta a mano y en español, **nunca un error de Zod crudo**. Es exactamente
el bug del 2026-09-01, donde el chat le leyó a una usuaria *«nota: Invalid input: expected
string, received undefined»*. El campo va `.nullable().optional()` con `describe` — la forma
que hoy sólo tiene `reasignar_a`.

---

## El repaso de lo existente

Sin backfill automático: mover plata en pantalla sin que la persona lo pida contradice la
regla central de este diseño.

Un getter lista los ingresos con `income_period is null` cuya fecha cae en el borde —**hoy: 8
cobros en 5 usuarios**, de los cuales 4 son de una sola persona— y un **banner en el home**
ofrece resolverlos en lote: una fila por cobro, dos botones con el nombre del mes.

El banner va en el home y **no lleva botón de descartar**, porque no le hace falta: *«dejalos
como están»* ya es la salida, y además deja la decisión escrita. Un descarte aparte sería un
segundo mecanismo para lo mismo, con la diferencia de que no persiste nada y el banner
volvería en el próximo dispositivo — la lección del tour y del popup de novedades.

Ojo con la comparación fácil: `OverdueCardPaymentBanner` tampoco se descarta, pero por el
motivo opuesto —explica por qué falta plata y es la única vía para saldar un resumen—. Este
corrige una lente de análisis y no bloquea nada; si el usuario no lo toca, no pasa nada malo.

**«Dejalos como están» también escribe `income_period`**, con el mes de la fecha. Así una
decisión explícita queda persistida, el banner desaparece para siempre y no hace falta
inventar un estado de «descartado» aparte. Precedente: el banner de movimientos sin medio de
pago en `/ajustes/medios`.

---

## Invariantes y tests

1. **Imputar un cobro a otro mes NO mueve el disponible.** Escenario nuevo en
   `escenarios-disponible.test.ts`, con el mismo trato que E8 («pagar la tarjeta no mueve el
   disponible») y E9. `pocket.ts` no se toca: la plata está en la cuenta desde que entró.
2. **Paridad chat/pantalla**: `get_monthly_summary.ingresos` == `getMonthlyIncome()` para el
   mismo usuario y mes, **con el reloj congelado**. El 2026-08-31 un test de paridad pasaba
   *por casualidad del calendario* y se habría roto solo en octubre; no se repite.
3. **Bordes de `necesitaDeclararMes`**: mes de 31 días, de 30, y febrero (28 y 29).
4. **Un `expense` con `income_period` no cambia nada** — y la base lo rechaza por `CHECK`.
5. **`income_period` se persiste tal cual, sin round trip por `Date`.** La regla del repo:
   `dateToLocalString(new Date(string))` corre un día atrás en TZ negativa, que es el bug que
   se barrió el 2026-09-02.

---

## Fuera de alcance

- **El disponible y `pocket.ts`**: no se tocan.
- **Los gastos**: su imputación ya la resuelve `cycle_id`; `income_period` es sólo para ingresos.
- **Modelar «sueldo» como entidad**: los ingresos no tienen `recurring_plan_id` y no se les
  agrega. La regla aplica a cualquier ingreso del borde, y el selector corrige la excepción.
- **El ritmo de cobro** (`income_rhythm`) y la definición de período de `getPeriodEnd`.
- **Backfill automático** del historial.
- **El «Ingresos mes $0» de la landing**, que tiene la misma raíz pero otra causa: el seeder
  del demo genera los sueldos con `ultimoHabil(1)` y `ultimoHabil(2)`, o sea los dos meses
  anteriores, así que Emi nunca tiene ingreso del mes en curso. Se arregla en el seeder, y
  arrastra regenerar las capturas y `DISPONIBLE_DEMO` en el mismo commit.

---

## Lo que este diseño no resuelve

**Quien cobra varias veces en el borde del mismo mes responde una vez por cobro**, y ese
perfil **existe hoy en producción**: un usuario tiene **4 ingresos dentro de la ventana de
agosto de 2026**. Es correcto que se pregunte por cada uno —son cobros distintos, con
imputaciones posiblemente distintas— pero para ese perfil la fricción es real y repetida, y
en el repaso inicial verá 4 filas en vez de 1.

Se asume a conciencia: la alternativa es que la preferencia impute sola, que es justamente lo
que este diseño descarta. Si al usarlo la fricción molesta, el arreglo natural **no** es
volver a la regla automática sino un «aplicar a todos los de este mes» dentro del repaso,
que resuelve el lote sin que nada se mueva sin gesto.

⚠️ Este párrafo empezó afirmando lo contrario —que ningún usuario tenía dos ingresos en la
misma ventana— por no haberlo medido. La consulta lo desmintió. Queda anotado porque es el
tipo de suposición cómoda que este spec no se puede permitir.
