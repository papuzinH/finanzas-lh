# Objetivos (metas de ahorro + presupuestos por categoría)

## Propósito
Pantalla `/objetivos` con dos sub-features, una debajo de la otra (las tabs murieron en el layout del 2026-08-18):
1. **Metas de ahorro** (`savings_goals` + `savings_goal_contributions`): objetivos `one_time` (monto + fecha límite) o `monthly` (monto recurrente por mes). El progreso se arma sumando **aportes manuales** — no se infiere de transacciones.
2. **Presupuestos por categoría** (`category_budgets`): límite mensual de gasto por categoría; el gasto real se calcula dinámicamente contra `getExpensesByCategory('current_month')` (que ya respeta ciclos de tarjeta), con proyección de fin de mes por ritmo diario.

## Rutas / entry points
- **`/objetivos`** → `src/app/objetivos/page.tsx` (Server Component) renderiza `ObjetivosClient`.
- Cards de resumen en el **home** consumen `getSavingsGoalsOverview()` y `getBudgetsOverview()` (mismo store, sin ruta propia).
- **Chatbot**: tool `list_goals_and_budgets` (`lib/ai/tools/readTools.ts`) + writes de crear/editar/borrar meta y presupuesto vía `lib/ai/handlers.ts` (líneas ~1130–1310).

## Archivos clave
| Archivo | Rol |
|---|---|
| `src/app/objetivos/objetivos-client.tsx` | UI: hero, metas activas en grilla de 2 columnas (4 en desktop), metas guardadas plegadas, presupuestos y el «+» único |
| `src/components/goals/goals-hero-card.tsx` | «Guardado para tus metas»: la cifra de la pantalla, con la firma celeste |
| `src/components/brand/chancho-gauge.tsx` | El chancho de la marca usado como medidor de progreso |
| `src/app/dashboard/goals/actions.ts` | Server actions: `createSavingsGoal`, `updateSavingsGoal`, `deleteSavingsGoal`, `completeGoal` (= `is_active=false`), `addGoalContribution` (recibe `FormData`), `deleteGoalContribution`, `createCategoryBudget` (**upsert** `onConflict: user_id,category_id`), `updateCategoryBudget`, `deleteCategoryBudget`. Todas revalidan `/objetivos` |
| `src/components/goals/savings-goal-card.tsx` | Card de meta: chancho medidor + montos. Sin botones: tap/swipe en mobile, kebab en desktop |
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

Las actions usan `user.id` de `supabase.auth.getUser()` (UUID) — correcto. Este trío fue fuente del bug clásico del chat: `category_budgets` filtrado por el id interno nunca matcheaba (ya corregido, ver `handlers.ts:101` y `checkBudgetAlert.test.ts`).

## Flujos principales
1. **Crear meta** → dialog → `createSavingsGoal` → `fetchGoalsData()` refresca el store.
2. **Aportar** → `addGoalContribution` (FormData) → el progreso se recalcula en el getter; para metas `monthly` solo cuentan los aportes cuyo `date` cae en el mes actual (comparación por string `YYYY-MM`).
3. **Completar meta** → `completeGoal` marca `is_active=false`; la UI la muestra en el `<details>` de "inactivas". Borrar meta cascadea sus aportes.
4. **Crear presupuesto** → upsert por `(user_id, category_id)`: recrear un presupuesto borrado/duplicado no falla, pisa el existente y lo reactiva.
5. **Alertas**: el chat dispara aviso al 90 % del presupuesto al registrar un gasto (`checkBudgetAlert` en `handlers.ts`).

## Interacción de las cards (rediseño 2026-08-22)

La pantalla tenía **16 botones** con 2 metas y 3 presupuestos —4 por meta, 2 por
presupuesto, más dos «+» distintos— cuando el mock con el que se diseñó dibujaba 2.
Ahora **ninguna card tiene botones**:

- **Mobile**: tocar la card abre un `ActionSheet` con sus acciones; deslizar es el
  atajo (en metas, derecha aporta e izquierda elimina; en presupuestos, derecha edita).
  El gesto nunca es la única vía: quien no lo descubre llega igual por el tap.
- **Desktop**: menú kebab que aparece al pasar el mouse, como en /movimientos.
- **Un solo «+»** en el header abre una hoja que pregunta si va meta o presupuesto.
- Borrar usa `ConfirmationModal`, no el `confirm()` del navegador (era el único
  lugar de la app donde saltaba el cartel gris del sistema).
- `AddContributionDialog`, `EditSavingsGoalDialog` y `EditBudgetDialog` aceptan
  `open`/`onOpenChange`: sueltos traen su botón, controlados los abre la card.

## El chancho medidor

`savings_goals` **no tiene columna de emoji**, así que todas las metas mostraban el
mismo chancho quieto en un cuadrito: decoraba sin informar. Ahora cada card usa
`<ChanchoGauge percent>` (`components/brand/chancho-gauge.tsx`), que llena la
alcancía de abajo hacia arriba según el progreso — el dibujo de marca ES el dato,
y cada meta se distingue de un vistazo. Verde cuando está lograda.
Tests en `components/brand/__tests__/chancho-gauge.test.tsx`.

## El hero

`<GoalsHeroCard>` responde «¿cuánto llevo?», que antes exigía sumar las cards a ojo.
Sale de `getSavingsGoalsOverview()`, que además de `totalSavedARS` devuelve
`totalTargetARS`, `percent` y `remainingARS` (las metas en USD se convierten con el
blue, las dos puntas con el mismo criterio). Es **la única cifra de la pantalla con
`--shadow-bandera`**, como manda el sistema, y alinea a Objetivos con Inicio
(«Tu plata libre para hoy») e Inversiones («Tu cartera»), que ya abrían así.
El copy de la línea de estado es `goalsHeadline()` en `lib/utils/objetivos-copy.ts`.

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
- `CLAUDE.md` — gotcha `user_id` (id interno vs UUID de auth) (sección Asistente IA).
