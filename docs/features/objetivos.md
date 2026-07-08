# Objetivos (metas de ahorro + presupuestos por categoría)

## Propósito
Pantalla `/objetivos` con dos sub-features en tabs:
1. **Metas de ahorro** (`savings_goals` + `savings_goal_contributions`): objetivos `one_time` (monto + fecha límite) o `monthly` (monto recurrente por mes). El progreso se arma sumando **aportes manuales** — no se infiere de transacciones.
2. **Presupuestos por categoría** (`category_budgets`): límite mensual de gasto por categoría; el gasto real se calcula dinámicamente contra `getExpensesByCategory('current_month')` (que ya respeta ciclos de tarjeta), con proyección de fin de mes por ritmo diario.

## Rutas / entry points
- **`/objetivos`** → `src/app/objetivos/page.tsx` (Server Component): valida `?tab=metas|presupuestos` de `searchParams` y renderiza `ObjetivosClient` con `initialTab`.
- Cards de resumen en el **home** consumen `getSavingsGoalsOverview()` y `getBudgetsOverview()` (mismo store, sin ruta propia).
- **Chatbot**: tool `list_goals_and_budgets` (`lib/ai/tools/readTools.ts`) + writes de crear/editar/borrar meta y presupuesto vía `lib/ai/handlers.ts` (líneas ~1130–1310).

## Archivos clave
| Archivo | Rol |
|---|---|
| `src/app/objetivos/objetivos-client.tsx` | UI: hero "Total en Metas" (suma `totalContributed` de metas activas, **sin conversión de moneda**), tabs, empty states, listado de metas activas/inactivas y presupuestos |
| `src/app/dashboard/goals/actions.ts` | Server actions: `createSavingsGoal`, `updateSavingsGoal`, `deleteSavingsGoal`, `completeGoal` (= `is_active=false`), `addGoalContribution` (recibe `FormData`), `deleteGoalContribution`, `createCategoryBudget` (**upsert** `onConflict: user_id,category_id`), `updateCategoryBudget`, `deleteCategoryBudget`. Todas revalidan `/objetivos` |
| `src/components/goals/savings-goal-card.tsx` | Card de meta: progreso, aportes, completar/borrar |
| `src/components/goals/add-contribution-dialog.tsx` | Alta/borrado de aportes |
| `src/components/goals/create-savings-goal-dialog.tsx` / `edit-savings-goal-dialog.tsx` | CRUD de metas (RHF + Zod) |
| `src/components/goals/category-budget-card.tsx` | Card de presupuesto: gasto vs. límite + proyección |
| `src/components/goals/create-budget-dialog.tsx` / `edit-budget-dialog.tsx` | CRUD de presupuestos (solo categorías `type === 'expense'`) |
| `src/lib/schemas/savings-goal.ts` | `savingsGoalSchema` (+ variante form con `Date`) — `superRefine`: `one_time` exige `target_date`; `savingsGoalContributionSchema` |
| `src/lib/schemas/category-budget.ts` | `categoryBudgetSchema` (category_id, amount > 0, currency ARS/USD) |
| `supabase/migrations/20260322_add_goals_tables.sql` | Crea las 3 tablas + RLS |

## Getters del store (`lib/store/financeStore.ts`)
- `getSavingsGoalProgress(goalId)` — `one_time`: progreso = `totalContributed` histórico + `daysLeft` hasta `target_date`; `monthly`: progreso = aportes del **mes actual**. `status: 'completed'` cuando el aportado efectivo ≥ target.
- `getSavingsGoalsOverview()` — agregado para el home: ordena metas con fecha primero (por `daysLeft` asc), luego mensuales por `percent` desc; `totalSavedARS` (USD→ARS por blue) y `totalsByCurrency` (sumas **nativas** por moneda, sin convertir; `null` si no hay metas en esa moneda).
- `getCategoryBudgetStatus(categoryId)` — `spent` sale de `getExpensesByCategory('current_month')` **indexado por nombre de categoría**; estados: `ok` < 75 % ≤ `warning` ≤ 100 % < `exceeded`.
- `getAllBudgetStatuses()` — todos los activos, ordenados por `percent` desc.
- `getBudgetProjection(budgetId)` — `(spent / díasTranscurridos) × díasDelMes` → `isOverBudget`.
- `getBudgetsOverview()` — gauge del home: totales en ARS (límites USD convertidos por blue), `projectedPercent`, `willExceed`, contadores.
- **`fetchGoalsData()`** — refetch liviano de SOLO las 3 tablas de goals; lo llaman los diálogos/cards tras cada mutación en vez de `fetchAllData()` completo. `fetchAllData()` también trae estas tablas (errores de goals son *non-blocking*: solo `console.warn`, por si falta la migración en DEV).

## Tablas DB (criterio de `user_id` — gotcha crítico del repo)
| Tabla | Filtro | Notas |
|---|---|---|
| `savings_goals` | **UUID de auth** (RLS `auth.uid() = user_id`) | `type: one_time/monthly`, `target_date` nullable, `is_active` |
| `savings_goal_contributions` | **UUID de auth** | FK `goal_id` con `ON DELETE CASCADE` |
| `category_budgets` | **UUID de auth** | `UNIQUE (user_id, category_id)`; `category_id` es `TEXT` FK a `categories` |
| `savings` | **UUID de auth** | Tabla aparte (tenencias sueltas) — vive en la feature Inversiones, NO confundir con metas |

Las actions usan `user.id` de `supabase.auth.getUser()` (UUID) — correcto. Este trío fue fuente del bug clásico del chat: `category_budgets` filtrado por el id numérico nunca matcheaba (ya corregido, ver `handlers.ts:101` y `checkBudgetAlert.test.ts`).

## Flujos principales
1. **Crear meta** → dialog → `createSavingsGoal` → `fetchGoalsData()` refresca el store.
2. **Aportar** → `addGoalContribution` (FormData) → el progreso se recalcula en el getter; para metas `monthly` solo cuentan los aportes cuyo `date` cae en el mes actual (comparación por string `YYYY-MM`).
3. **Completar meta** → `completeGoal` marca `is_active=false`; la UI la muestra en el `<details>` de "inactivas". Borrar meta cascadea sus aportes.
4. **Crear presupuesto** → upsert por `(user_id, category_id)`: recrear un presupuesto borrado/duplicado no falla, pisa el existente y lo reactiva.
5. **Alertas**: el chat dispara aviso al 90 % del presupuesto al registrar un gasto (`checkBudgetAlert` en `handlers.ts`).

## Invariantes y gotchas
- **El progreso de metas es 100 % manual**: registrar una transacción de ahorro NO aporta a una meta; solo `savings_goal_contributions` cuenta.
- `getCategoryBudgetStatus` matchea gasto por **nombre** de categoría (no por id): renombrar una categoría no rompe (el nombre viene del mismo `categories` en el store), pero dos categorías con igual nombre se mezclarían.
- Presupuestos en **USD**: `spent` siempre está en ARS (viene de `getExpensesByCategory`) y `limit` en la moneda del presupuesto → `percent`/`status` pueden ser imprecisos (nota reconocida en el código de `getBudgetsOverview`; fuera de alcance).
- El hero "Total en Metas" de `objetivos-client.tsx` suma `totalContributed` crudo (mezcla ARS+USD sin convertir y formatea como ARS) — a diferencia del home, que usa `totalsByCurrency`. Deuda visual conocida.
- Mutaciones de goals refrescan con `fetchGoalsData()`, no `fetchAllData()`; si una mutación tocara transacciones (no es el caso hoy), haría falta el fetch completo.
- `CreateBudgetDialog` recibe solo categorías `type === 'expense'`.

## Tests
- `src/lib/store/__tests__/goalsGetters.test.ts` — versiones puras extraídas de `getSavingsGoalProgress`/budget status (no dependen de Zustand).
- `src/lib/ai/__tests__/checkBudgetAlert.test.ts` — regresión del bug UUID en `category_budgets`.
- `src/lib/ai/tools/__tests__/readToolsB.test.ts` — tool `list_goals_and_budgets`.

## Docs relacionados
- `supabase/migrations/20260322_add_goals_tables.sql` (schema + RLS + instrucciones de deploy).
- `docs/superpowers/specs/2026-07-06-home-presupuestos-metas-visual-design.md` y `docs/superpowers/plans/2026-07-06-home-presupuestos-metas-visual-implementation.md` — cards de metas/presupuestos en el home.
- `CLAUDE.md` — gotcha `user_id` numérico vs UUID (sección Asistente IA).
