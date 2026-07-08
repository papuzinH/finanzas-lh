# Home / Dashboard

**Propósito**: pantalla principal (`/`). Muestra el **Disponible Real** ("Tu plata libre para hoy") como número central, 4 KPIs del mes, insights automáticos, presupuestos/metas, análisis (tabs) y últimos movimientos. Todo número visible sale de getters del store que envuelven funciones puras de `lib/finance/` — nunca se calcula en el componente.

## Rutas / entry points

- `/` → `src/app/page.tsx` — **Client Component** (`'use client'`, excepción consciente a la regla "app/ = Server Components": necesita el store). Dispara `fetchAllData()` si `!isInitialized` y envuelve todo en `PullToRefresh`.
- No recibe datos por props: TODO viene de `useFinanceStore`.

## Archivos clave

| Path | Rol |
|---|---|
| `src/app/page.tsx` | Composición de la pantalla + 4 modales de detalle (cuotas, fijos, ingresos, variables) + racha (`getRegistrationStreak`) |
| `src/components/dashboard/balance-card.tsx` | Hero card del Disponible Real. Expandible: desglose `saldoBruto − gastos fijos pendientes − tarjeta del mes`, con sub-línea por tarjeta (`pendingCardItems`: vencimiento vigente + estado "cerrado"/"en curso"). Count-up con rAF |
| `src/components/dashboard/metric-grid.tsx` | 4 KPIs: Ingresos / Variables / Cuotas / Fijos del mes (con sparklines vía `getWeeklySnapshot`) |
| `src/components/dashboard/insights-carousel.tsx` | Carrusel auto-rotativo (5s) de `getInsights()`. **Retorna `null` si no hay insights** → la celda del grid colapsa (es hijo directo del grid a propósito) |
| `src/components/dashboard/budget-gauge-card.tsx` | Gauge semicircular de `getBudgetsOverview()` (gastado vs proyectado). Retorna `null` sin presupuestos |
| `src/components/dashboard/savings-goals-rings-card.tsx` | Anillos de progreso de `getSavingsGoalsOverview()` (máx. 4 metas). Retorna `null` sin metas activas |
| `src/components/dashboard/incomplete-credit-cards-banner.tsx` | Aviso de tarjetas de crédito sin `closing_day`/`payment_day` |
| `src/components/dashboard/analysis/analysis-section.tsx` | Tabs `este mes / tendencia / categorías` + toggle ARS/USD (`displayCurrency` + `toDisplay()` del store) |
| `analysis/tab-este-mes.tsx` | "¿Llegás a fin de mes?" (`getMonthlySpendingPace`: gasto acumulado + proyección lineal vs ingreso) + `InstallmentsRealCostCard` (`getInstallmentsRealCost`: cuotas futuras deflactadas por IPC) |
| `analysis/tab-tendencia.tsx` | `TrendChart` (`getMonthlyTrend(6)`) + hint ajustado por inflación (`getRealAdjustedTrend`) + tasa de ahorro (`getSavingsRateSeries`: `net/income`, tono good ≥15% / warn ≥0 / bad) |
| `analysis/tab-categorias.tsx` | `getCategoryBreakdown` (torta, scope mes/histórico), `getCategoryFrequencyRanking` (cuenta movimientos, no montos), `CurrencyExposureCard` |
| `src/components/dashboard/month-selector.tsx` (+ `month-picker-dialog.tsx`) | Vive en `dashboard/` pero **hoy solo lo usa `/movimientos`** (el home no filtra por mes) |
| `src/lib/store/financeStore.ts` | Única fuente cliente. Getters = wrappers finos sobre `lib/finance/` |
| `src/lib/finance/balances.ts` | `computeGlobalBalance`, `computePaymentMethodStatus`, `computePendingCreditCards`, `hasCardPaymentInCycle` |
| `src/lib/finance/pending.ts` | `computePendingFixedExpenses` (mensualidades activas sin transacción este mes) |
| `src/lib/finance/analysis.ts` | `computeExpensesByCategory`, `computeMonthlyBalance` |
| `src/lib/finance/creditCycle.ts` | `getCreditCycleDates`, `isExpenseInCurrentMonthScope`, `sameMonthYear` |

## Tablas DB (vía `fetchAllData`, no directo desde componentes)

| Tabla | Filtro de usuario |
|---|---|
| `transactions`, `payment_methods`, `recurring_plans`, `installment_plans` | `users.id` **numérico** (FK a `public.users`) |
| `categories`, `internal_transfers`, `savings_goals`, `savings_goal_contributions`, `category_budgets`, `savings` | **UUID de auth** (`auth.uid()`) |
| `exchange_rates`, `market_prices` | globales, sin filtro de usuario |

Gotcha crítico del repo: confundir id numérico con UUID produce queries que **nunca matchean sin error** (fuente de 5 bugs en el chat). El criterio canónico por tabla está documentado en `src/lib/ai/tools/dataLoader.ts` (comentario "Step 0"). El store cliente pasa `authUser.id` a todos los filtros y se apoya en RLS; en server-side (tools/handlers del chat) hay que elegir el id correcto a mano.

## Flujos principales

1. **Carga**: `fetchAllData()` → `Promise.all` de ~16 queries Supabase + API dólar blue (`dolarapi.com`, timeout 5s, opcional) + IPC (`argentinadatos.com`, opcional) → `prepareTransactions()`/`prepareRecurringPlans()` (`lib/finance/prepare.ts`: calcula `periodDate` y normaliza USD→ARS) → `set(...)`.
2. **Disponible Real** (`getRealAvailableBalance`): `disponibleReal = getGlobalBalance()` (→ `computeGlobalBalance`: ingresos − variables − cuotas pasadas y del mes − mensualidades (pagadas + pendientes del mes) − `internal_transfers`). El desglose se **deriva** del total: `saldoBruto := disponibleReal + pendingFixedExpenses + pendingCardTotal`, así siempre cuadra. `pendingCardItems` = `getPendingCreditCardByCard().filter(isPending)`.
3. **Insights** (`getInsights`, máx. 6): gasto vs mes anterior, categoría que subió >20%, cuotas del mes, presupuesto ≥75%, tarjetas que necesitan actualizar fechas (día después del vencimiento), meta ≥50%, racha ≥3 días, portafolio ±3%.
4. **Análisis mes actual**: los gastos usan `isExpenseInCurrentMonthScope()` (respeta ciclo de tarjeta); los ingresos, mes calendario simple.

## Invariantes y gotchas

- **Pagar una mensualidad o el resumen de tarjeta NO mueve `disponibleReal` global**: solo transfiere plata entre el bucket "pendiente" y "ya gastado" (`computeGlobalBalance` resta el compromiso completo del mes, pagado o no). Sí baja el saldo del medio financiador (`getPaymentMethodStatus`).
- **`card_payment_for` se excluye de TODAS las analíticas de consumo** (`computeGlobalBalance`, `isExpenseInCurrentMonthScope`, `computeExpensesByCategory`): las compras del resumen ya están itemizadas; contar el pago duplicaría.
- Cuotas **futuras no se restan** del balance global; impactan recién en su mes (según ciclo de tarjeta).
- El ciclo de tarjeta vigente **avanza recién cuando el vencimiento ya pasó** (comparación por día): el día exacto del vencimiento el resumen sigue pendiente. `isCycleClosed` (cierre ya pasado) explica por qué una tarjeta muestra un período anterior y otra el vigente.
- `getMonthlyTrend` **proyecta** mensualidades activas en meses donde no hay transacción registrada (solo si el plan existía ese mes: `created_at <= endOfMonth`), para no mostrar meses "baratos" falsos.
- Fechas: **siempre** `parseLocalDate()` (`lib/utils/dates.ts`); comparar por `periodDate || date` para agrupación mensual.
- El viejo flag `paidCycles`/`markCreditCardCyclePaid` (localStorage) **ya no existe**: el estado "pagada" se deriva de la existencia de una transacción con `card_payment_for` en el mes del vencimiento (`isCreditCardCyclePaid`/`hasCardPaymentInCycle`). `quick-add.tsx` (dashboard) fue eliminado por huérfano; las rutas legacy `/cuotas`, `/mensualidades`, `/categorias`, `/medios-pago`, `/perfil` ya no tienen página (solo sobreviven sus `actions.ts`).
- Cambios de lógica financiera van en `lib/finance/`, nunca en el cuerpo de un getter ni en componentes (misma fuente que usa el chatbot server-side).

## Tests

- `src/lib/finance/__tests__/`: `balances.test.ts`, `pending.test.ts`, `analysis.test.ts`, `creditCycle.test.ts`, `prepare.test.ts` (funciones puras, directo).
- `src/lib/store/__tests__/`: `disponible-real.test.ts` (invariante del Disponible Real), `analysis-getters.test.ts`, `insights.test.ts`, `home-overview-getters.test.ts`, `goalsGetters.test.ts` — siembran con `useFinanceStore.setState` + `vi.useFakeTimers`.
- Correr con `npm test`. (`dates.test.ts` tiene fallas preexistentes ajenas.)

## Docs relacionados

- `docs/superpowers/specs/2026-07-02-disponible-real-design.md` — fórmula y desglose del número central
- `docs/superpowers/specs/2026-06-30-dashboard-analisis-home-design.md` — sección Análisis (tabs)
- `docs/superpowers/specs/2026-07-07-insights-carousel-mejoras-design.md` — carrusel de insights
- `docs/superpowers/specs/2026-07-06-home-presupuestos-metas-visual-design.md` — gauge de presupuestos + anillos de metas
- `docs/superpowers/specs/2026-07-06-home-desktop-superior-layout-design.md` — grid desktop 2/3 + rail
- `docs/superpowers/specs/2026-07-02-tasa-ahorro-card-design.md`, `2026-07-02-frecuencia-categoria-ranking-design.md` — cards del análisis
