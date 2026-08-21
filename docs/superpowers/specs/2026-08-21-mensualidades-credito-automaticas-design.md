# Mensualidades de crédito que se postean solas — diseño

**Fecha**: 2026-08-21
**Estado**: aprobado, pendiente de plan de implementación

> Nota de privacidad: este repo es público. Las cifras del diagnóstico están redondeadas y
> los servicios contratados no se nombran. Los escenarios de prueba usan datos ficticios.

## El problema

Una mensualidad facturada en tarjeta de crédito **no se paga: se debita sola** cuando cierra
el resumen. Chanchito, sin embargo, le pide al usuario que la marque como pagada mes a mes,
igual que a un servicio que sí tiene que ir a pagar. En el caso que originó el diseño son
**11 mensualidades de tarjeta** figurando como pendientes de acción todos los meses, contra
7 que el usuario sí paga a mano desde su cuenta.

El pedido no es sólo cosmético. **El resto del gasto de crédito ya funciona bien**: las
compras variables y las cuotas nacen como transacciones fechadas al vencimiento del resumen
(`calculateCreditPaymentDate`). La excepción son las mensualidades, porque no tienen fin y
no se pueden generar todas por adelantado. El resultado es un resumen incompleto: en el
relevamiento previo al diseño, **dos meses enteros sin ninguna mensualidad de tarjeta**
—el usuario simplemente dejó de marcarlas—, con el resumen de la tarjeta principal
subestimado en el orden de los $300.000.

Tres consecuencias, en orden de gravedad:

1. **El resumen de la tarjeta miente por omisión.** Lo que la app muestra como deuda del
   ciclo es menos que lo que el banco va a cobrar.
2. **El usuario tiene que hacer un trabajo que no le corresponde**: confirmar mes a mes algo
   sobre lo que no decide nada.
3. **El mes visual queda corrido.** El backfill histórico fecha las mensualidades al día 01
   del mes de consumo, no al vencimiento. Como `prepareTransactions` retrocede un mes el
   `periodDate` cuando el pago vence después del cierre, el consumo de un mes termina
   mostrándose en el mes anterior.

Causa estructural: **`recurring_plans` no guarda el día del mes en que se factura el plan.**
Sin ese dato no se puede decidir en qué resumen cae la mensualidad, y por eso nunca se pudo
tratar igual que a una compra.

## Qué se decidió

| Decisión | Resolución |
|---|---|
| **Alcance** | Sólo las mensualidades de **crédito**. En crédito la certeza es total: si está en el resumen, se debitó. En débito no —si la app postea un alquiler que el usuario todavía no transfirió, el bolsillo afirma una salida que no ocurrió, que es exactamente el agujero corregido el 2026-08-20. |
| **Día de cobro** | Columna nueva `recurring_plans.billing_day` (1-31, nullable), editable en el diálogo de la mensualidad, que se lee como `billing_day ?? 1`. Los planes existentes siguen funcionando sin migrar datos. |
| **Momento de generación** | Perezosa, al abrir la app, **hasta lo ya facturado**: el mes M se postea recién cuando su día de cobro ya pasó. Chanchito nunca afirma un cobro que todavía no ocurrió. Sin cron. |
| **Datos históricos** | Migración one-shot que re-fecha las mensualidades de crédito ya existentes a su vencimiento real. El mecanismo nuevo llena después los meses faltantes. |
| **UI** | La tab Mensualidades se parte en dos grupos con subtotal: las que se debitan solas y las que paga el usuario. |
| **Idempotencia** | Guard aplicativo por (plan, mes), sin constraint en la base. Ver "Alternativas evaluadas". |

## El modelo

### Qué plan se automatiza

Un plan se postea solo si cumple **las tres** condiciones:

1. su medio de pago es de tipo `credit`;
2. ese medio tiene el ciclo cargado (`default_closing_day` y `default_payment_day` no nulos);
3. su `frequency` es `monthly`.

Una tarjeta sin ciclo configurado no permite calcular el vencimiento, y un plan anual daría
doce cobros donde hay uno. En ambos casos el plan **sigue con el toggle manual de hoy**: el
mecanismo no inventa fechas que no puede derivar.

### Cuándo se factura y en qué resumen cae

```
diaCobro   = min(billing_day ?? 1, últimoDíaDe(mes))
fechaCargo = calculateCreditPaymentDate(`${mes}-${diaCobro}`, closing_day, payment_day)
```

El clamp resuelve el plan cobrado el 31 en un mes de 30 días (y en febrero). La fecha final
sale de la **misma función que ya usan cuotas y compras variables**: si el día de cobro es
posterior al cierre, la mensualidad se va al resumen siguiente. Con una tarjeta que cierra
el 20 y vence el 1, un plan cobrado el día 1 entra al resumen que vence el 1 del mes
siguiente; uno cobrado el 25, al subsiguiente.

### Cuándo un mes ya está cubierto

Un mes M está cubierto si existe una transacción del plan cuya fecha cae en **el mismo mes y
año** que `fechaCargo(M)` — la regla `sameMonthYear` que ya usa el ciclo de tarjeta para
decidir pertenencia.

La clave que hace innecesaria cualquier columna nueva en `transactions`: para un plan dado,
la función `mes de consumo → mes de vencimiento` es inyectiva (cada mes de consumo cae en un
resumen distinto), así que el mes de consumo se puede reconstruir sin guardarlo. La regla es
además deliberadamente laxa —mira el mes, no la fecha exacta— para que una transacción
editada a mano por el usuario siga contando como cobertura y no se duplique.

### Horizonte y piso

- **Techo**: se genera el mes M mientras su día de cobro sea anterior o igual a hoy.
- **Piso**: el más tardío entre el mes de creación del plan y el mes del **primer ingreso**
  del usuario — la misma regla que `backfillRecurringPlansHistory`, por el mismo motivo:
  backfillear gastos en meses sin ingresos registrados hunde el saldo sin contrapartida.

### Qué NO cambia

- `computeCommitments` sigue salteando los fijos de crédito: ya viajan dentro del resumen de
  su tarjeta, y descontarlos aparte los contaría dos veces.
- El disponible del bolsillo no se ve afectado: las tarjetas no son cuentas, así que no
  entran en `pocketTotal`, y los fijos de crédito nunca estuvieron en `committed`.
- Al existir la transacción, el plan deja de figurar en `computePendingFixedExpenses` por la
  lógica que ya existe. No hace falta tocar esa función.

El efecto sobre el número central depende de dónde caiga el vencimiento del resumen: mientras
quede **fuera** del período de cobro vigente, el monto nuevo se suma a
`committedNextPeriod` —que se muestra pero no baja el disponible—, y recién lo baja cuando el
vencimiento entra en el período. En el caso relevado, con ritmo `monthly` y ambos
vencimientos en el mes siguiente, el efecto el día del cambio es **cero**. Lo que cambia
siempre, y hacia la verdad, es el tamaño del resumen: pasa a valer lo que el banco realmente
va a cobrar, en vez de estar subestimado por omisión.

## Arquitectura

### Funciones puras — `src/lib/finance/recurring.ts` (nuevo)

Toda la lógica vive acá, sin Zustand ni Supabase, como el resto de `lib/finance/`:

- `isAutomaticPlan(plan, method)` → las tres condiciones de arriba.
- `expectedChargeDate(plan, method, mes)` → clamp + `calculateCreditPaymentDate`.
- `computeMissingAutomaticCharges(plans, methods, transactions, floorMonth, now)` →
  `Array<{ planId, month, date }>` con lo que falta postear.

### Escritura — `syncAutomaticRecurringCharges()` en `src/app/compromisos/actions.ts`

Lee planes activos, medios y las transacciones con `recurring_plan_id` desde el piso; delega
el cálculo en la función pura; hace un único `insert` con las filas faltantes. La fila
generada es idéntica a la de `markRecurringPlanPaid`: hereda categoría, medio,
`original_currency`, `original_amount`, `rate_pair` y `exchange_rate` del plan.

**Disparo**: desde `fetchAllData()` del store, con un guard de una vez por carga de la app.
No en cada refetch: el chat llama a `fetchAllData()` después de cada escritura y no
corresponde pagar un round-trip extra por mensaje.

### Datos históricos — migración one-shot

En la misma migración que agrega la columna, un `UPDATE` acotado que re-fecha las
mensualidades de crédito existentes a su vencimiento real. Criterio de selección:
`recurring_plan_id` no nulo, medio de tipo `credit`, día de la fecha = 01, y fecha anterior
al mes en que se aplica.

Es seguro aplicarla **antes** del deploy del código (la regla del repo para cambios de
schema): el código vigente lee esas filas igual, porque `prepareTransactions` deriva el
`periodDate` desde la fecha de vencimiento. De hecho las corrige: hoy el consumo de un mes
se muestra en el mes anterior.

### UI

- **Tab Mensualidades en dos grupos con subtotal**: "Se debitan solas · $X" (chip
  informativo `<Tarjeta> · vence D/M` derivado de `expectedChargeDate`, sin toggle) y "Las
  pagás vos · $Y" (el toggle pendiente/pagada de hoy, sin cambios).
- **Campo "¿Qué día te lo cobran?"** (1-31, default 1) en crear y editar mensualidad, para
  todos los planes: en crédito define el resumen; en débito alimenta el "vence el X" que
  quedó pendiente en el layout de Compromisos.

### Artefactos que acompañan al cambio

- `src/lib/schemas/subscription.ts` — `billing_day` en los schemas Zod de crear y editar.
- `src/types/database.ts` — regenerado desde el schema real después de aplicar la migración.
- `docs/features/compromisos.md` — el flujo nuevo y la invariante que introduce ("una
  mensualidad de crédito nunca está pendiente de acción").

## Escenarios de prueba

Tests directos sobre las funciones puras, en `src/lib/finance/__tests__/recurring.test.ts`.
Los fixtures siguen la convención de la base real: `amount` **siempre positivo**, el signo lo
lleva `type`.

| # | Escenario | Resultado esperado |
|---|---|---|
| A1 | Tarjeta cierra 20 / vence 1, cobro el día 1 | Consumo del mes M → vence el 1 de M+1 |
| A2 | Misma tarjeta, cobro el día 25 (después del cierre) | Consumo de M → vence el 1 de M+2 |
| A3 | Tarjeta cierra 27 / vence 4 | El ciclo propio de esa tarjeta, no el de la otra |
| A4 | `billing_day` 31 en un mes de 28 días | Clampea al último día, no desborda al mes siguiente |
| A5 | Tarjeta sin `default_closing_day` | No se automatiza; el plan queda con toggle manual |
| A6 | Plan con `frequency: 'yearly'` | No se automatiza |
| A7 | Plan de débito | No se automatiza (fuera de alcance por decisión) |
| A8 | Mes en curso con el día de cobro todavía por venir | No se genera todavía |
| A9 | Plan creado después del primer ingreso | El piso es la creación del plan |
| A10 | Plan anterior al primer ingreso | El piso es el mes del primer ingreso |
| A11 | Correr el sync dos veces seguidas | La segunda no crea nada |
| A12 | Mes cubierto por una transacción con fecha editada a mano | Cuenta como cubierto (regla por mes, no por fecha exacta) |

## Alternativas evaluadas

- **Índice único sobre `(recurring_plan_id, mes)`** como garantía dura de idempotencia.
  Descartado: el guard aplicativo cubre el caso real, el daño de una carrera entre dos
  pestañas es un duplicado corregible, y una constraint global sobre `transactions` en una
  base sin instancia DEV muerde en casos legítimos con un error críptico. Se reabre si
  aparecen duplicados reales en producción.
- **Inferir el día de cobro del historial de pagos.** Descartado por la misma razón que se
  descartó inferir el ciclo de cobro del último sueldo: lee cómo el usuario decidió anotar,
  no cuándo le cobran.
- **Generar al cerrar el resumen** en vez de al abrir la app. Descartado: deja el ciclo en
  curso sin sus mensualidades durante todo el mes, justo cuando el usuario mira cuánto lleva
  gastado.
- **Proyectar el ciclo entero**, adelantando cobros cuyo día todavía no llegó. Descartado:
  la app afirmaría cobros que aún no ocurrieron.
- **Detectar duplicados contra gastos cargados a mano** (heurística por descripción y monto).
  Descartado: en el caso relevado, un gasto suelto con el mismo nombre que un plan resultó
  ser un gasto distinto. La heurística habría escondido un gasto real.

## Fuera de alcance

- **Mensualidades de débito automático.** Requieren un flag explícito por plan ("se debita
  solo") para no afirmar salidas que el usuario no hizo. Si se pide, es un slice propio.
- **Planes anuales.** Siguen con toggle manual. Queda anotado un problema preexistente que
  este diseño no empeora ni arregla: `computePendingFixedExpenses` trata todo plan como
  mensual, así que un plan anual figura pendiente los doce meses.
- **Cotizar el USD al dólar del día de cierre.** La transacción hereda el cambio congelado
  del plan, igual que hoy hace `markRecurringPlanPaid`. El resumen real de la tarjeta cotiza
  al dólar del cierre, así que el monto en pesos de un plan en dólares es una aproximación.
- **Borrar una transacción generada.** Vuelve en la próxima carga: la cobertura se deriva de
  los datos, no de un registro de qué se generó. Para que un plan deje de postearse hay que
  desactivarlo (`is_active = false`).

## Docs relacionados

- `docs/features/compromisos.md` — mensualidades, ciclos de tarjeta e invariantes.
- `docs/features/bolsillo.md` — por qué los fijos de crédito no se descuentan aparte.
- `docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md` — cómo los
  compromisos alimentan el número central.
