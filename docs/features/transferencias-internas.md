# Transferencias internas (`internal_transfers`)

**Propósito**: registrar plata que el usuario movió a ahorro (el "sobrante" de fin de mes o un aporte manual) para que **deje de contar como saldo gastable** sin inventar una transacción de gasto. Es trazabilidad pura: no hay pantalla dedicada; su efecto se ve en el Disponible Real y en los desgloses mensuales del store.

## Rutas / entry points

- **No hay UI dedicada** (ni página ni diálogo de alta). En el código actual de `src/` la tabla solo se **lee**:
  - `financeStore.fetchAllData()` (`src/lib/store/financeStore.ts`, ~línea 524) → estado `internalTransfers`.
  - `lib/ai/tools/dataLoader.ts` (`loadFinanceData`) → snapshot del chatbot (tool `get_balance_snapshot` en `lib/ai/tools/readTools.ts` la pasa a `computeGlobalBalance`).
- No existe hoy ninguna server action ni tool que inserte/edite/borre filas (verificado por grep: los únicos `.from('internal_transfers')` son selects). Las filas existentes se cargaron por fuera de la UI actual; si se agrega escritura, respetar el UNIQUE de la tabla (abajo).

## Archivos clave

| Path | Rol |
|---|---|
| `supabase/migrations/20260530_add_internal_transfers.sql` | DDL completo: tabla + índice `(user_id, period_date DESC)` + RLS `auth.uid() = user_id` |
| `src/types/database.ts` (tabla `internal_transfers`, ~línea 578) | Tipos Row/Insert/Update; tipo exportado `InternalTransfer` |
| `src/lib/finance/balances.ts` → `computeGlobalBalance()` | Resta el total histórico de transferencias del balance global (paso 4: "ahorros transferidos dejan de ser saldo gastable") |
| `src/lib/store/financeStore.ts` → `getGlobalBalance` / `getRealAvailableBalance` | Wrappers que pasan `internalTransfers` a `computeGlobalBalance` (junto al `pendingFixedTotal` de `lib/finance/pending.ts`) |
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
| `real_transfer_date` | DATE — cuándo se movió la plata de verdad (default hoy) |
| `transfer_type` | `'end_of_month_surplus' \| 'manual'` |
| `description` | opcional |
| — | **UNIQUE (user_id, period_date, transfer_type)** → máx. UNA transferencia de sobrante por usuario/mes |

## Flujos principales

1. **Balance global**: `computeGlobalBalance(transactions, paymentMethods, internalTransfers, pendingFixedTotal, now)` resta `Σ |amount|` de TODAS las transferencias (histórico completo, sin filtrar por mes). Consecuencia: registrar una transferencia baja el Disponible Real de una vez y para siempre — es plata "apartada".
2. **Desgloses del mes**: `getMonthlyExpensesBreakdown` y `getMonthlyLiquidityBreakdown` suman como `savingsTransfers` solo las filas cuyo `period_date` cae en el mes actual (`period_date?.slice(0, 7) === 'yyyy-MM'`), y las tratan como un rubro más del gasto mensual (`netBalance = income − totalExpenses`).
3. **Chatbot**: `get_balance_snapshot` reproduce el mismo cálculo server-side con el snapshot de `loadFinanceData` — garantía de que el chat y el home dicen el mismo número.

## Invariantes y gotchas

- **UUID de auth, no el id interno** (repetido porque es el bug silencioso #1 del repo). En handlers/tools usar `ctx.authUserId` / `getAuthUserId()`.
- `computeGlobalBalance` resta `Math.abs(amount)` **sin convertir moneda**: una fila con `currency='USD'` restaría su número nominal como si fuera ARS (no hay `resolveRate` acá, a diferencia de transactions/recurring_plans). Hoy no parece haber flujo que cree filas USD, pero si se agrega UI de alta hay que resolver esto primero.
- El fetch del store es **non-blocking**: si la tabla no existe (DEV sin migración) solo hace `console.warn` y sigue con `internalTransfers: []` (línea ~597 de financeStore.ts).
- `getMonthlyLiquidityBreakdown` existe y está tipado en el store, pero **ningún componente lo consume actualmente** (verificado por grep; quedó del diseño del layout desktop del home). No borrarlo sin revisar el roadmap; no asumir que hay una card de liquidez viva.
- No es una transacción: no aparece en /movimientos, no tiene categoría ni medio de pago, y no participa de `getExpensesByCategory` ni del ciclo de tarjetas.
- Diferenciar de `savings_goal_contributions` (aportes a metas, tabla propia) y de la tabla legacy `savings`: son tres cosas distintas que se fetchean por separado en `fetchAllData`.
- Cambios de schema: aplicar en Supabase PROD **antes** de mergear a `master` (regla general del repo; skill `migrar-schema`).

## Tests

- `src/lib/finance/__tests__/balances.test.ts` — cubre `computeGlobalBalance` (las transferencias entran como parámetro de la función pura).
- `src/lib/store/__tests__/disponible-real.test.ts` y `home-overview-getters.test.ts` — siembran `internalTransfers` con `useFinanceStore.setState`.
- `src/lib/ai/tools/__tests__/dataLoader.test.ts` — verifica que el fetch filtra por `authUserId` (UUID) y que las filas llegan al snapshot.

## Docs relacionados

- `docs/superpowers/specs/2026-05-31-notion-doc-rewrite-design.md` — tabla en el modelo de datos ("surplus mensual entre meses")
- `docs/superpowers/specs/2026-07-06-home-desktop-superior-layout-design.md` — contexto de `getMonthlyLiquidityBreakdown`
- `docs/superpowers/specs/2026-07-02-disponible-real-design.md` — dónde encaja la resta en la fórmula del Disponible Real
