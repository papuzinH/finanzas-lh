# Movimientos y Mensualidades en dólares — Diseño

**Fecha:** 2026-05-30
**Estado:** Aprobado para implementación

## Objetivo

Permitir cargar movimientos (ingresos/egresos en `/movimientos`) y Mensualidades
(`recurring_plans` en `/compromisos`) en dólares además de pesos. De cada carga en USD
se registra **tanto el monto en USD como el equivalente en pesos del momento**. El
**balance disponible y todos los cálculos derivados** revalúan los montos en USD a la
**cotización actual** (no la del momento de carga), usando las mismas cotizaciones que
`/inversiones` (Blue, MEP, CCL, USDT).

### Decisiones tomadas
- **Cotización:** elegible por movimiento (Blue/MEP/CCL/USDT), **MEP por defecto**.
- **Alcance del recálculo:** en todos lados (balance global, mensual, por categoría,
  medios de pago, presupuestos, burn rate, etc.).
- **Enfoque técnico:** recalcular `amount` en memoria al cargar datos (enfoque A, ver abajo).
- **Cuotas (`installment_plans`):** fuera de alcance en esta iteración.
- **Refresco de cotización:** botón en `/movimientos` (junto al balance) + el refresco
  automático al entrar + el botón existente en `/inversiones` + cron.

## Enfoque técnico: recálculo en memoria (A)

Hoy ~30 getters del store hacen `Number(t.amount)` asumiendo que `amount` está en ARS.

En `fetchAllData`, **una vez cargadas las cotizaciones** (`exchangeRates` desde DB +
`dolarBlue` en vivo), se reescribe el `amount` **en memoria** de cada transacción/plan
en USD:

```
amountEnMemoria = original_amount (USD) × cotizaciónActual(rate_pair)
```

Los getters siguen leyendo `t.amount` y `plan.amount` sin cambios → quedan
automáticamente en cotización actual. La base de datos conserva el snapshot del momento
de carga; sólo la copia en memoria refleja el valor vivo.

**Por qué es seguro mutar `amount` en memoria:** las operaciones `update`/`delete` van
por server actions que leen los valores del formulario, no el `amount` del store. Ningún
flujo persiste el `amount` recalculado de vuelta a la DB.

Alternativas descartadas:
- **B (helper `getTransactionArs()` en cada getter):** toca ~30 sitios, fácil olvidar uno.
- **C (vista/columna generada SQL):** la cotización cambia; el valor quedaría congelado.

## Modelo de datos

### `transactions` (migración — agregar columnas)
| Columna | Tipo | Default | Significado |
|---|---|---|---|
| `original_currency` | text | `'ARS'` | `'ARS'` o `'USD'` |
| `original_amount` | numeric | null | Monto en moneda original (en USD = cifra en dólares) |
| `rate_pair` | text | null | `USD_ARS_MEP` / `USD_ARS_CCL` / `USD_ARS_BLUE` / `USDT_ARS` |
| `exchange_rate` | numeric | null | Cotización del momento de carga (snapshot) |

- `amount` se mantiene = valor en ARS del momento de carga (snapshot).
- Para movimientos en ARS: `original_currency='ARS'`, `original_amount = amount`,
  `rate_pair` y `exchange_rate` en null.
- Filas existentes: `original_currency` toma el default `'ARS'`; `original_amount` se
  backfillea con `amount` (o se deja null y el store lo trata como ARS).

### `recurring_plans` (migración — agregar columnas)
Ya tiene `currency` (text null). Agregar:
| Columna | Tipo | Default | Significado |
|---|---|---|---|
| `original_amount` | numeric | null | Monto en moneda original |
| `rate_pair` | text | null | Cotización elegida |
| `exchange_rate` | numeric | null | Snapshot del momento de carga |

- `currency` pasa a usarse: `'ARS'` (default) o `'USD'`.
- `amount` = valor en ARS del momento de carga (snapshot).

> **Recordatorio de deploy (CLAUDE.md):** aplicar la migración SQL a PROD **antes** del
> merge a `master`. Documentar en el skill `migrar-schema`.

## Cotizaciones: lookup y refresco

### Lookup de cotización actual (en el store)
Helper `getCurrentRate(pair: string): number`:
1. Busca `pair` en `exchangeRates` (DB); si `rate > 0`, lo usa.
2. Fallback a `dolarBlue.venta` si existe.
3. Último fallback: el `exchange_rate` snapshot de la propia fila (para no romper si no
   hay ninguna cotización disponible).

Reutiliza el patrón ya presente en `getPortfolioStatus` (`getRate` + `blueFallback`).

### Refresco
- `fetchAllData` ya re-lee `exchange_rates` y trae `dolarBlue` en vivo en cada llamada.
- Nueva server action liviana **`updateExchangeRates()`** (en
  `src/app/movimientos/actions.ts` o un módulo compartido de cotizaciones): llama
  `fetchAllRates()` → upsert en `exchange_rates` con `onConflict: 'pair'` (mismo bloque
  que `runUpdatePrices`, pero sólo cotizaciones). Devuelve `{ success, updated }`.
- Botón **"Actualizar cotización"** junto al balance en `/movimientos`: dispara
  `updateExchangeRates()` y luego `fetchAllData()`. Muestra loading + toast.

## UI de carga (formularios)

Componente nuevo en `transaction-form-fields.tsx`: **`CurrencyField`** (reutilizable por
movimiento y suscripción).

- Toggle **ARS / USD** (segmented control, mismo estilo que `TypeToggle`).
- Si USD: selector compacto de cotización (Blue/MEP/CCL/USDT), **MEP por defecto**
  (reutilizar estilo de `CurrencyToggle` de inversiones).
- Preview en vivo bajo el monto: "≈ $120.000 ARS (a $1.200 MEP)", calculado con
  `getCurrentRate(pair)` del store.
- `AmountField`: el prefijo `$` cambia a `US$` cuando la moneda es USD.

Formularios afectados:
- `create-transaction-dialog.tsx` + `edit-transaction-dialog.tsx`
- `create-subscription-dialog.tsx` + `edit-subscription-dialog.tsx`

## Schemas (Zod)

- `lib/schemas/transaction.ts`: agregar `currency: z.enum(['ARS','USD'])` (default `'ARS'`),
  `rate_pair: z.string().nullable().optional()`, `original_amount: z.number().positive().optional()`.
  `amount` sigue siendo el monto que el usuario tipea en la moneda elegida; el server
  calcula el ARS.
- `lib/schemas/subscription.ts`: mismos campos.

Nota de semántica del form: el usuario tipea el monto en la **moneda elegida**. Si es USD,
`amount` ingresado = dólares; el server (o el client antes de enviar) resuelve
`original_amount = amount`, `exchange_rate = getCurrentRate(pair)` (la que vio en el
preview), y `amount` persistido en ARS = `original_amount × exchange_rate`.

## Server actions

- `app/dashboard/transactions/actions.ts` → `createTransaction` / `updateTransaction`:
  aceptar `currency`, `rate_pair`, `exchange_rate` (el rate mostrado en el preview del client).
  Si `currency='USD'`: persistir `original_currency='USD'`, `original_amount`, `rate_pair`,
  `exchange_rate`, y `amount = original_amount × exchange_rate`. Si ARS: comportamiento
  actual + `original_currency='ARS'`, `original_amount = amount`.
  Validar `exchange_rate > 0` cuando es USD.
- `app/dashboard/subscriptions/actions.ts`: misma lógica sobre `recurring_plans`.
- `updateExchangeRates()`: ver sección de refresco.

> Se usa la cotización que el usuario **vio en el preview** (ya cargada en el store) para
> que el snapshot coincida con lo mostrado al confirmar. No se re-fetchea en el server al
> guardar.

## Store (`lib/store/financeStore.ts`)

1. `getCurrentRate(pair)` helper (puede ser interno, reutilizado por el recálculo).
2. En `fetchAllData`, tras setear `exchangeRates`/`dolarBlue`: mapear
   `processedTransactions` y `recurringPlans` reescribiendo `amount` para filas USD
   (`amount = original_amount × getCurrentRate(rate_pair)`).
3. Exponer la lógica de refresco si conviene (o se maneja desde la página llamando la
   action + `fetchAllData`).

## Display

- `components/shared/transaction-item.tsx`: si `original_currency==='USD'`, mostrar
  "US$ 100" como dato principal y el equivalente en pesos vivo (`amount`) como secundario,
  con un badge de la cotización usada (ej. "MEP").
- Cards de suscripción en `compromisos-client.tsx`: análogo para planes en USD.

## Tipos

- `types/database.ts`: actualizar `Row`/`Insert`/`Update` de `transactions` y
  `recurring_plans` con las nuevas columnas.

## Testing / verificación

- No hay test runner configurado (CLAUDE.md). Verificación manual:
  - Cargar ingreso/egreso en USD (MEP por defecto) → ver preview, confirmar, ver en lista
    "US$ X ≈ $Y".
  - Verificar que el balance disponible y el desglose mensual/por categoría usan la
    cotización actual (cambiar cotización vía refresco y ver que los montos se mueven).
  - Cargar suscripción en USD → burn rate y proyecciones la consideran en ARS vivo.
  - Movimientos en ARS existentes y nuevos: sin cambios de comportamiento.
- `npm run build` + `npm run lint` (o `rtk next build` / `rtk lint`) deben pasar.

## Fuera de alcance
- Cuotas (`installment_plans`) en USD.
- Elección de compra/venta: se reutiliza el `rate` de `exchange_rates` (que guarda `sell`).
- Conversión de savings/objetivos (ya manejan su propia moneda donde aplica).
