# Home / Dashboard

**Propósito**: pantalla principal (`/`). Muestra **"Tu plata libre para hoy"** (el disponible del modelo de bolsillo) como número central, 4 KPIs del mes, insights automáticos, presupuestos/metas, análisis (tabs) y últimos movimientos. Todo número visible sale de getters del store que envuelven funciones puras de `lib/finance/` — nunca se calcula en el componente.

## Rutas / entry points

- `/` → `src/app/page.tsx` — **Client Component** (`'use client'`, excepción consciente a la regla "app/ = Server Components": necesita el store). Dispara `fetchAllData()` si `!isInitialized` y envuelve todo en `PullToRefresh`.
- No recibe datos por props: TODO viene de `useFinanceStore`.

## Archivos clave

| Path | Rol |
|---|---|
| `src/app/page.tsx` | Composición de la pantalla + 4 modales de detalle (cuotas, fijos, ingresos, variables) |
| `src/components/dashboard/balance-card.tsx` | Hero card de "Tu plata libre para hoy". Expandible: desglose `pocketTotal − comprometido = disponible`, con sub-línea por cuenta del bolsillo (`accounts`, con `anchored`) y por compromiso (`commitmentItems`: tarjetas con vencimiento vigente + estado "cerrado"/"en curso", fijos sin fecha). Muestra también `reserveTotal` aparte (no resta) y `committedNextPeriod` (lo que vence después del período, no baja el disponible de hoy). Count-up con rAF |
| `src/components/dashboard/metric-grid.tsx` | 4 KPIs: Ingresos / Variables / Cuotas / Fijos del mes (con sparklines vía `getWeeklySnapshot`) |
| `src/components/dashboard/insights-carousel.tsx` | Carrusel auto-rotativo (5s) de `getInsights()`. **Retorna `null` si no hay insights** → la celda del grid colapsa (es hijo directo del grid a propósito) |
| `src/components/dashboard/budget-gauge-card.tsx` | Gauge semicircular de `getBudgetsOverview()` (gastado vs proyectado). Retorna `null` sin presupuestos |
| `src/components/dashboard/*` (sección "Presupuestos y metas") | El **título de sección vive en `page.tsx` y se oculta** si no hay ningún presupuesto activo ni meta activa (`getBudgetsOverview() === null` y `getSavingsGoalsOverview().activeCount === 0`); con uno solo de los dos, el grid pasa a una columna |
| `src/components/dashboard/savings-goals-rings-card.tsx` | Anillos de progreso de `getSavingsGoalsOverview()` (máx. 4 metas). Retorna `null` sin metas activas |
| `src/components/dashboard/incomplete-credit-cards-banner.tsx` | Aviso de tarjetas de crédito sin `closing_day`/`payment_day` |
| `src/components/dashboard/analysis/analysis-section.tsx` | Tabs `este mes / tendencia / categorías` + toggle ARS/USD (`displayCurrency`; los montos salen de `store.formatDisplay()`, que convierte y formatea junto) |
| `analysis/tab-este-mes.tsx` | "¿Llegás a fin de mes?" (`getMonthlySpendingPace`: gasto acumulado + proyección lineal vs ingreso) + `InstallmentsRealCostCard` (`getInstallmentsRealCost`: cuotas futuras deflactadas por IPC) |
| `analysis/tab-tendencia.tsx` | `TrendChart` (`getMonthlyTrend(6)`) + hint ajustado por inflación (`getRealAdjustedTrend`) + tasa de ahorro (`getSavingsRateSeries`: `net/income`, tono good ≥15% / warn ≥0 / bad) |
| `analysis/tab-categorias.tsx` | `getCategoryBreakdown` (torta, scope mes/histórico), `getCategoryFrequencyRanking` (cuenta movimientos, no montos), `CurrencyExposureCard` |
| `src/components/dashboard/month-selector.tsx` (+ `month-picker-dialog.tsx`) | Vive en `dashboard/` pero **hoy solo lo usa `/movimientos`** (el home no filtra por mes) |
| `src/lib/store/financeStore.ts` | Única fuente cliente. Getters = wrappers finos sobre `lib/finance/` |
| `src/lib/finance/pocket.ts` | `computeAvailableToSpend` (el número central), `computeAccountBalance`, `computeCommitments` — ver `docs/features/bolsillo.md` |
| `src/lib/finance/balances.ts` | `computeGlobalBalance` (el cálculo viejo, ver más abajo), `computePaymentMethodStatus`, `computePendingCreditCards`, `hasCardPaymentInCycle` |
| `src/lib/finance/pending.ts` | `computePendingFixedExpenses` (mensualidades activas sin transacción este mes) |
| `src/lib/finance/analysis.ts` | `computeExpensesByCategory`, `computeMonthlyBalance` |
| `src/lib/finance/creditCycle.ts` | `getCreditCycleDates`, `isExpenseInCurrentMonthScope`, `sameMonthYear` |

## Tablas DB (vía `fetchAllData`, no directo desde componentes)

| Tabla | Filtro de usuario |
|---|---|
| `transactions`, `payment_methods`, `recurring_plans`, `installment_plans` | `users.id` (**id interno**, FK a `public.users`) |
| `categories`, `internal_transfers`, `savings_goals`, `savings_goal_contributions`, `category_budgets`, `savings` | **UUID de auth** (`auth.uid()`) |
| `exchange_rates`, `market_prices` | globales, sin filtro de usuario |

Gotcha crítico del repo: confundir el id interno con el UUID de auth produce queries que **nunca matchean sin error** (fuente de 5 bugs en el chat). El criterio canónico por tabla está documentado en `src/lib/ai/tools/dataLoader.ts` (comentario "Step 0"). El store cliente pasa `authUser.id` a todos los filtros y se apoya en RLS; en server-side (tools/handlers del chat) hay que elegir el id correcto a mano.

## Flujos principales

1. **Carga**: `fetchAllData()` → `Promise.all` de ~16 queries Supabase + API dólar blue (`dolarapi.com`, timeout 5s, opcional) + IPC (`argentinadatos.com`, opcional) → `prepareTransactions()`/`prepareRecurringPlans()` (`lib/finance/prepare.ts`: calcula `periodDate` y normaliza USD→ARS) → `set(...)`.
2. **Tu plata libre para hoy** (`getAvailableToSpend`, wrapper de `computeAvailableToSpend` en `lib/finance/pocket.ts`): `available = pocketTotal − committed`, donde `pocketTotal` es la suma de `computeAccountBalance` de cada cuenta con `bucket = 'pocket'` (ancla + movimientos entre el ancla y hoy, o todo el historial si la cuenta no está anclada) y `committed` son los compromisos del período de cobro declarado (`computeCommitments`: mensualidades pendientes + tarjetas cuyo vencimiento cae dentro del período). Detalle completo, incluida la puesta a punto (`/puesta-a-punto`) y la conciliación, en `docs/features/bolsillo.md`.
3. **Insights** (`getInsights`, máx. 6): gasto vs mes anterior, categoría que subió >20%, cuotas del mes, presupuesto ≥75%, tarjetas que necesitan actualizar fechas (día después del vencimiento), meta ≥50%, portafolio ±3%.
4. **Análisis mes actual**: los gastos usan `isExpenseInCurrentMonthScope()` (respeta ciclo de tarjeta); los ingresos, mes calendario simple.

## Invariantes y gotchas

- **Pagar una mensualidad o el resumen de tarjeta NO mueve el disponible**: al pagar, la transacción entra dentro de `computeAccountBalance` de la cuenta financiadora (baja ese saldo) y el compromiso deja de estar pendiente (`computeCommitments` ya no lo suma) — el efecto neto sobre `available` es cero. Tests: E8/E9 en `lib/finance/__tests__/escenarios-disponible.test.ts`.
- **`getGlobalBalance()` (el cálculo viejo, `computeGlobalBalance`) sigue existiendo pero ya NO alimenta el home**: solo se usa en `/puesta-a-punto` para mostrarle al usuario el contraste "antes/después" al migrar al modelo de bolsillo. No reintroducirlo como fuente del número central.
- **`card_payment_for` se excluye de TODAS las analíticas de consumo** (`computeGlobalBalance`, `isExpenseInCurrentMonthScope`, `computeExpensesByCategory`): las compras del resumen ya están itemizadas; contar el pago duplicaría.
- Cuotas **futuras no se restan** del balance global; impactan recién en su mes (según ciclo de tarjeta).
- El ciclo de tarjeta vigente **avanza recién cuando el vencimiento ya pasó** (comparación por día): el día exacto del vencimiento el resumen sigue pendiente. `isCycleClosed` (cierre ya pasado) explica por qué una tarjeta muestra un período anterior y otra el vigente.
- `getMonthlyTrend` **proyecta** mensualidades activas en meses donde no hay transacción registrada (solo si el plan existía ese mes: `created_at <= endOfMonth`), para no mostrar meses "baratos" falsos.
- Fechas: **siempre** `parseLocalDate()` (`lib/utils/dates.ts`); comparar por `periodDate || date` para agrupación mensual.
- El viejo flag `paidCycles`/`markCreditCardCyclePaid` (localStorage) **ya no existe**: el estado "pagada" se deriva de la existencia de una transacción con `card_payment_for` en el mes del vencimiento (`isCreditCardCyclePaid`/`hasCardPaymentInCycle`). `quick-add.tsx` (dashboard) fue eliminado por huérfano; las rutas legacy `/cuotas`, `/mensualidades`, `/categorias`, `/medios-pago`, `/perfil` ya no tienen página (solo sobreviven sus `actions.ts`).
- Cambios de lógica financiera van en `lib/finance/`, nunca en el cuerpo de un getter ni en componentes (misma fuente que usa el chatbot server-side).

## Tests

- `src/lib/finance/__tests__/`: `pocket.test.ts`, `escenarios-disponible.test.ts` (el disponible del bolsillo), `balances.test.ts`, `pending.test.ts`, `analysis.test.ts`, `creditCycle.test.ts`, `prepare.test.ts` (funciones puras, directo).
- `src/lib/store/__tests__/`: `analysis-getters.test.ts`, `insights.test.ts`, `home-overview-getters.test.ts`, `goalsGetters.test.ts` — siembran con `useFinanceStore.setState` + `vi.useFakeTimers`.
- Correr con `npm test`. (`dates.test.ts` tiene fallas preexistentes ajenas.)

## Docs relacionados

- `docs/features/bolsillo.md` — modelo de disponible anclado, puesta a punto y conciliación (fuente del número central actual)
- `docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md` — spec vigente del número central
- `docs/superpowers/specs/2026-07-02-disponible-real-design.md` — diseño histórico (el "Disponible Real"/flujo acumulado, reemplazado por el modelo de bolsillo)
- `docs/superpowers/specs/2026-06-30-dashboard-analisis-home-design.md` — sección Análisis (tabs)
- `docs/superpowers/specs/2026-07-07-insights-carousel-mejoras-design.md` — carrusel de insights
- `docs/superpowers/specs/2026-07-06-home-presupuestos-metas-visual-design.md` — gauge de presupuestos + anillos de metas
- `docs/superpowers/specs/2026-07-06-home-desktop-superior-layout-design.md` — grid desktop 2/3 + rail
- `docs/superpowers/specs/2026-07-02-tasa-ahorro-card-design.md`, `2026-07-02-frecuencia-categoria-ranking-design.md` — cards del análisis
