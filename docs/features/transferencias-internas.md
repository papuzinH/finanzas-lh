# Transferencias internas (`internal_transfers`)

**Propósito**: registrar plata que el usuario movió entre sus propias cuentas (a una reserva, el "sobrante" de fin de mes, un aporte manual) para que **deje de contar como saldo gastable de la cuenta de origen** sin inventar una transacción de gasto. Antes era trazabilidad de solo lectura; desde el modelo de bolsillo (`docs/features/bolsillo.md`) también hay **escritura**: la conciliación puede crear filas nuevas, y `from_payment_method_id`/`to_payment_method_id` mueven plata entre los saldos por cuenta que consume `computeAccountBalance`.

## Rutas / entry points

- **Sin UI dedicada para crear una transferencia libremente** (ni página ni diálogo de alta genérico). Pero **sí hay un flujo que escribe**: la conciliación (`AdjustBalanceDialog` → `reconcileAccount` en `src/app/bolsillo/actions.ts`), cuando el usuario clasifica el drift como "Lo mandé a una reserva" — ver `docs/features/bolsillo.md`.
- Se **lee** en:
  - `financeStore.fetchAllData()` (`src/lib/store/financeStore.ts`) → estado `internalTransfers`.
  - `lib/ai/tools/dataLoader.ts` (`loadFinanceData`) → snapshot del chatbot (tool `get_balance_snapshot` en `lib/ai/tools/readTools.ts` la pasa a `computeGlobalBalance`, el cálculo viejo).
  - `computeAccountBalance` (`src/lib/finance/pocket.ts`) → saldo por cuenta del modelo de bolsillo (ver Flujos principales).
- Fuera de `reconcileAccount`, no hay otra server action ni tool que inserte/edite/borre filas. Las filas más viejas se cargaron por fuera de la UI actual; cualquier escritura nueva debe respetar el UNIQUE de la tabla (abajo).

## Archivos clave

| Path | Rol |
|---|---|
| `supabase/migrations/20260530_add_internal_transfers.sql` | DDL completo: tabla + índice `(user_id, period_date DESC)` + RLS `auth.uid() = user_id` |
| `src/types/database.ts` (tabla `internal_transfers`) | Tipos Row/Insert/Update; tipo exportado `InternalTransfer` |
| `src/lib/finance/pocket.ts` → `computeAccountBalance()` | **Fuente del disponible actual**: por cada transferencia dentro de la ventana ancla→hoy, resta el monto de la cuenta `from_payment_method_id` y lo suma a `to_payment_method_id` |
| `src/app/bolsillo/actions.ts` → `reconcileAccount()` | Único punto de **escritura**: clasificación `transfer` inserta una fila con `transfer_type: 'manual'`. Valida que la cuenta de origen y la de destino pertenezcan al usuario |
| `src/lib/finance/reconcile.ts` → `daysSinceLastRegistration()` | Cuenta una transferencia interna reciente (`created_at`) como actividad de registro, junto con las transacciones — evita que el recordatorio de conciliación siga apareciendo justo después de conciliar con "Lo mandé a una reserva" |
| `src/lib/finance/balances.ts` → `computeGlobalBalance()` | El cálculo **viejo** (ya no alimenta el home): resta el total histórico de transferencias del balance global |
| `src/lib/store/financeStore.ts` → `getGlobalBalance` | Wrapper de `computeGlobalBalance`, hoy usado solo en `/puesta-a-punto` para el contraste "antes/después" |
| `src/lib/store/financeStore.ts` → `getMonthlyExpensesBreakdown` / `getMonthlyLiquidityBreakdown` | Suman `savingsTransfers` del mes en curso (filtro `period_date` = mes actual) como componente del gasto/liquidez mensual |
| `src/lib/ai/tools/dataLoader.ts` | Fetch server-side con `ctx.authUserId` (UUID) — el comentario "Step 0" documenta el criterio |

## Tabla DB

`internal_transfers` — **`user_id` es UUID de auth (`auth.uid()`)**, NO el id interno de `public.users` (`users.id`). Este es EL gotcha del repo: filtrar esta tabla con el id interno produce una query que nunca matchea, sin error (mismo patrón que `categories`/`savings_goals`/`category_budgets`; en cambio `transactions` y compañía usan el id interno (`users.id`)).

| Columna | Tipo / regla |
|---|---|
| `id` | UUID PK |
| `user_id` | UUID (auth), RLS owner-only |
| `amount` | NUMERIC(12,2), **CHECK > 0** (siempre positivo; el signo lo pone la lógica) |
| `currency` | `'ARS' \| 'USD'` (default ARS) |
| `period_date` | DATE — mes al que se **imputa** la transferencia (el "sobrante de mayo" lleva period_date de mayo) |
| `real_transfer_date` | DATE — cuándo se movió la plata de verdad (default hoy); es la fecha que usa `computeAccountBalance` para decidir si la transferencia cae dentro de la ventana ancla→hoy de una cuenta |
| `transfer_type` | `'end_of_month_surplus' \| 'manual'` (`reconcileAccount` siempre inserta `'manual'`) |
| `from_payment_method_id` / `to_payment_method_id` | `payment_methods.id`, nullable. **Consumidas por `computeAccountBalance`**: origen resta, destino suma. Filas viejas sin estas columnas cargadas simplemente no mueven ninguna cuenta (`computeAccountBalance` ignora `null`) |
| `description` | opcional |
| — | **UNIQUE (user_id, period_date, transfer_type)** → máx. UNA transferencia de sobrante por usuario/mes (no limita las `'manual'`, que pueden repetirse) |

## Flujos principales

1. **Saldo por cuenta (modelo de bolsillo, el que alimenta el home)**: `computeAccountBalance(method, transactions, transfers, now)` recorre `internal_transfers` dentro de la ventana ancla→hoy y, por cada una, resta el monto si `from_payment_method_id === method.id` o suma si `to_payment_method_id === method.id`. Es lo que hace que "Lo mandé a una reserva" (conciliación) mueva plata de una cuenta del bolsillo a una reserva sin tocar `transactions`.
2. **Conciliar mandando a una reserva**: `AdjustBalanceDialog` con la clasificación `transfer` → `reconcileAccount` inserta la fila (`from_payment_method_id` = la cuenta que se está conciliando, `to_payment_method_id` = la reserva elegida), validando ambos medios contra `user.id`. Ver `docs/features/bolsillo.md`.
3. **Balance global (cálculo viejo)**: `computeGlobalBalance(transactions, paymentMethods, internalTransfers, pendingFixedTotal, now)` resta `Σ |amount|` de TODAS las transferencias (histórico completo, sin filtrar por mes ni por cuenta). Ya no alimenta el home; sigue vivo solo para `/puesta-a-punto`.
4. **Desgloses del mes**: `getMonthlyExpensesBreakdown` y `getMonthlyLiquidityBreakdown` suman como `savingsTransfers` solo las filas cuyo `period_date` cae en el mes actual (`period_date?.slice(0, 7) === 'yyyy-MM'`), y las tratan como un rubro más del gasto mensual (`netBalance = income − totalExpenses`).
5. **Chatbot**: `get_balance_snapshot` reproduce el cálculo viejo (`computeGlobalBalance`) server-side con el snapshot de `loadFinanceData` — no el disponible del bolsillo.

## Invariantes y gotchas

- **UUID de auth, no el id interno** (repetido porque es el bug silencioso #1 del repo). En handlers/tools usar `ctx.authUserId` / `getAuthUserId()`.
- **`computeAccountBalance` sí distingue origen/destino** (`from_payment_method_id`/`to_payment_method_id`) por cuenta; **`computeGlobalBalance` no** — resta el total sin importar de qué cuenta salió ni a cuál entró. Son dos lecturas distintas de la misma tabla, para dos cálculos distintos (bolsillo vs. cálculo viejo).
- Ni `computeAccountBalance` ni `computeGlobalBalance` **convierten moneda**: una fila con `currency='USD'` se resta/suma por su número nominal como si fuera ARS (no hay `resolveRate` acá, a diferencia de transactions/recurring_plans). `reconcileAccount` siempre inserta `currency: 'ARS'`, así que hoy no hay flujo de escritura que cree filas USD — pero una fila vieja en USD (si existiera) rompería el saldo de la cuenta igual que la limitación de reservas en moneda extranjera documentada en `docs/features/bolsillo.md`.
- El fetch del store es **non-blocking**: si la tabla no existe (DEV sin migración) solo hace `console.warn` y sigue con `internalTransfers: []`.
- `getMonthlyLiquidityBreakdown` existe y está tipado en el store, pero **ningún componente lo consume actualmente** (verificado por grep; quedó del diseño del layout desktop del home). No borrarlo sin revisar el roadmap; no asumir que hay una card de liquidez viva.
- No es una transacción: no aparece en /movimientos, no tiene categoría ni medio de pago, y no participa de `getExpensesByCategory` ni del ciclo de tarjetas.
- Diferenciar de `savings_goal_contributions` (aportes a metas, tabla propia) y de la tabla legacy `savings`: son tres cosas distintas que se fetchean por separado en `fetchAllData`.
- Cambios de schema: aplicar en Supabase PROD **antes** de mergear a `master` (regla general del repo; skill `migrar-schema`).

## Tests

- `src/lib/finance/__tests__/balances.test.ts` — cubre `computeGlobalBalance` (las transferencias entran como parámetro de la función pura).
- `src/lib/finance/__tests__/pocket.test.ts` — `computeAccountBalance` con transferencias (origen resta, destino suma, ventana ancla→hoy, filas sin origen/destino no afectan a ningún medio).
- `src/lib/finance/__tests__/reconcile.test.ts` — `daysSinceLastRegistration` considerando transferencias internas recientes.
- `src/lib/store/__tests__/home-overview-getters.test.ts` — siembra `internalTransfers` con `useFinanceStore.setState`.
- `src/lib/ai/tools/__tests__/dataLoader.test.ts` — verifica que el fetch filtra por `authUserId` (UUID) y que las filas llegan al snapshot.

## Docs relacionados

- `docs/features/bolsillo.md` — cómo la conciliación escribe en esta tabla y cómo `computeAccountBalance` la consume por cuenta.
- `docs/superpowers/specs/2026-05-31-notion-doc-rewrite-design.md` — tabla en el modelo de datos ("surplus mensual entre meses")
- `docs/superpowers/specs/2026-07-06-home-desktop-superior-layout-design.md` — contexto de `getMonthlyLiquidityBreakdown`
- `docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md` — spec del modelo de bolsillo, incluida la conciliación
