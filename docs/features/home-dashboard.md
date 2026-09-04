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
| `analysis/tab-este-mes.tsx` | "¿Llegás a fin de mes?" (`getMonthlySpendingPace`, ver abajo) + `InstallmentsRealCostCard` (`getInstallmentsRealCost`: cuotas futuras deflactadas por IPC) |
| `analysis/tab-tendencia.tsx` | `TrendChart` (`getMonthlyTrend(6)`) + hint ajustado por inflación (`getRealAdjustedTrend`) + tasa de ahorro (`getSavingsRateSeries`: `net/income`, tono good ≥15% / warn ≥0 / bad) + bloque **«Qué se movió»** (`QueSeMovio`, `getHistorico(vara)`): categorías que cambiaron de nivel vs. gasto de una vez, en pesos de hoy (o "pesos corrientes" si `deflactado` da `false`), con toggle de vara y modal `DetalleCategoria` |
| `analysis/tab-categorias.tsx` | `getCategoryBreakdown` (torta, scope mes/histórico), `getCategoryFrequencyRanking` (cuenta movimientos, no montos), `CurrencyExposureCard`, modal `DetalleCategoria` (histórico por categoría vía `getHistorico`) — no se monta si hay categorías homónimas (mismo nombre, ids distintos) |
| `src/components/dashboard/month-selector.tsx` (+ `month-picker-dialog.tsx`) | Vive en `dashboard/` pero **hoy solo lo usa `/movimientos`** (el home no filtra por mes) |
| `src/lib/store/financeStore.ts` | Única fuente cliente. Getters = wrappers finos sobre `lib/finance/` |
| `src/lib/finance/pocket.ts` | `computeAvailableToSpend` (el número central), `computeAccountBalance`, `computeCommitments` — ver `docs/features/bolsillo.md` |
| `src/lib/finance/balances.ts` | `computeGlobalBalance` (el cálculo viejo, ver más abajo), `computePaymentMethodStatus`, `computePendingCreditCards`, `hasCardPaymentInCycle` |
| `src/lib/finance/pending.ts` | `computePendingFixedExpenses` (mensualidades activas sin transacción este mes) |
| `src/lib/finance/analysis.ts` | `computeExpensesByCategory`, `computeMonthlyBalance` |
| `src/lib/finance/cycles.ts` | `cicloVigente`, `cicloAnterior`, `cicloDeCompra` (el resumen como entidad) |
| `src/lib/finance/creditCycle.ts` | `getCreditCycleDates` (**fallback** sin ciclos), `isExpenseInCurrentMonthScope`, `sameMonthYear` |


## `getMonthlySpendingPace` — qué día es cada gasto (cambio de 2026-09-04)

El eje del gráfico es **cuándo se gastó**, y eso NO es `periodDate`: en crédito
`periodDate` es el `closing_date` del resumen, o sea el día que cierra el papel.
Usarlo apilaba el mes entero de la tarjeta en un día y lo dejaba **invisible** hasta
que ese día llegaba, porque el acumulado sólo recorre hasta hoy. Medido contra
producción el 2026-09-04: 67 de 68 movimientos de crédito con cierre en septiembre
($1.029.504, 4 usuarios) no aparecían; tres de los cuatro usuarios veían **$0** de
gasto con tarjeta.

Tres reglas, y conviene no tocarlas sin volver a medir:

1. **El día sale de `purchase_date`**, con fallback a `periodDate || date`.
   ⚠️ **El arreglo es parcial a propósito** (decisión de producto): las filas viejas
   sin `purchase_date` siguen cayendo en el día del cierre y siguen ocultas hasta que
   llegue — **$535.840 en 4 usuarios** al momento del cambio. Descartarlas se evaluó
   y se rechazó: el acumulado quedaría por debajo del gasto real.
2. **La pertenencia al mes la decide SÓLO `isExpenseInCurrentMonthScope`.** Antes
   había un segundo filtro (`isSameMonth(periodDate)`) con una definición distinta de
   "este mes", y lo que pasaba el primero se caía del segundo sin dejar rastro: hay
   216 de 344 cuotas en ciclos cuyo cierre y vencimiento caen en meses distintos. Lo
   que queda fuera del mes se apoya en el borde (día 1 o último) en vez de perderse.
   ⚠️ **Deuda que esto deja expuesta**: la rama de cuotas de
   `isExpenseInCurrentMonthScope` decide con los **defaults** de la tarjeta
   (`default_closing_day`/`default_payment_day`), que CLAUDE.md degradó a *sólo
   fallback* desde que `credit_card_cycles` es la entidad. Antes el segundo filtro
   hacía de red; ahora no hay red. Debería mirar `cycle_id`, como todo lo demás.
3. **La proyección extrapola SÓLO el gasto variable**, que es lo único que tiene
   ritmo. Todo lo demás entra como monto fijo, porque es plata ya comprometida que
   no se repite: lo comprado en meses anteriores (todas las cuotas de un plan
   comparten la `purchase_date` de la compra original) y **las mensualidades y
   cuotas de este mes** — Netflix no se cobra otra vez el día 15. Se suman enteras,
   incluidas las que caen en días del mes que todavía no llegaron: van a ocurrir.

   Ese número es el que decide el chip rojo «Te pasás», y extrapolar el acumulado
   entero lo dispara. Dos mediciones contra producción del 2026-09-04: un usuario
   con 19 de 19 filas compradas en meses anteriores proyectaba **más de $2.000.000
   el día 4**; otro, con el **87% de su acumulado en mensualidades** ($853.848 de
   $975.473), proyectaba **$7,3M** contra $252.260 de gasto variable en todo el mes.

   ⚠️ La línea del gráfico NO cambia con esto: sigue mostrando lo que ya pasó. Lo
   único que se corrige es la proyección.

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
4. **Análisis mes actual**: los gastos usan `isExpenseInCurrentMonthScope()` (respeta ciclo de tarjeta); los ingresos van por **`periodDate || date`** — ya no por el mes calendario de `t.date`.

## Invariantes y gotchas

- **Pagar una mensualidad o el resumen de tarjeta NO mueve el disponible**: al pagar, la transacción entra dentro de `computeAccountBalance` de la cuenta financiadora (baja ese saldo) y el compromiso deja de estar pendiente (`computeCommitments` ya no lo suma) — el efecto neto sobre `available` es cero. Tests: E8/E9 en `lib/finance/__tests__/escenarios-disponible.test.ts`.
- **`getGlobalBalance()` (el cálculo viejo, `computeGlobalBalance`) sigue existiendo pero ya NO alimenta el home**: solo se usa en `/puesta-a-punto` para mostrarle al usuario el contraste "antes/después" al migrar al modelo de bolsillo. No reintroducirlo como fuente del número central.
- **`card_payment_for` se excluye de TODAS las analíticas de consumo** (`computeGlobalBalance`, `isExpenseInCurrentMonthScope`, `computeExpensesByCategory`): las compras del resumen ya están itemizadas; contar el pago duplicaría.
- Cuotas **futuras no se restan** del balance global; impactan recién en su mes (según ciclo de tarjeta).
- El ciclo de tarjeta vigente **avanza recién cuando el vencimiento ya pasó** (comparación por día): el día exacto del vencimiento el resumen sigue pendiente. `isCycleClosed` (cierre ya pasado) explica por qué una tarjeta muestra un período anterior y otra el vigente.
- `getMonthlyTrend` **proyecta** mensualidades activas en meses donde no hay transacción registrada (solo si el plan existía ese mes: `created_at <= endOfMonth`), para no mostrar meses "baratos" falsos.
- **Los ingresos del mes van por `periodDate || date`** (`getMonthlyIncome`), con precedencia **ciclo > `income_period` > `t.date`**: un cobro de fin de mes cuenta en el mes que declaró el usuario (ver `docs/features/movimientos.md`), y un `income` con `cycle_id` — un reintegro de tarjeta — en el mes del **CIERRE** de su resumen. Esto último **cambió el 2026-09-03**: antes contaba en el mes del vencimiento, así que cuando las dos fechas caen en meses distintos el reintegro se corre un mes. Es deliberado — `computeMonthlyBalance` ya iba por `periodDate` y la pantalla se contradecía a sí misma — y medido contra producción: 2 reintegros en tarjeta, 1 cambia de mes, 2 usuarios. Fijado en `lib/store/__tests__/ingresos-imputados.test.ts`.
- Fechas: **siempre** `parseLocalDate()` (`lib/utils/dates.ts`); comparar por `periodDate || date` para agrupación mensual.
- El viejo flag `paidCycles`/`markCreditCardCyclePaid` (localStorage) **ya no existe**: el estado "pagada" se deriva de la existencia de una transacción con `card_payment_for` imputada a ese resumen por `cycle_id` (`isCreditCardCyclePaid`/`hasCardPaymentInCycle`). `quick-add.tsx` (dashboard) fue eliminado por huérfano; las rutas legacy `/cuotas`, `/mensualidades`, `/categorias`, `/medios-pago`, `/perfil` ya no tienen página (solo sobreviven sus `actions.ts`).
- Cambios de lógica financiera van en `lib/finance/`, nunca en el cuerpo de un getter ni en componentes (misma fuente que usa el chatbot server-side).

## Tests

- `src/lib/finance/__tests__/`: `pocket.test.ts`, `escenarios-disponible.test.ts` (el disponible del bolsillo), `balances.test.ts`, `pending.test.ts`, `analysis.test.ts`, `creditCycle.test.ts`, `prepare.test.ts` (funciones puras, directo).
- `src/lib/store/__tests__/`: `analysis-getters.test.ts`, `insights.test.ts`, `home-overview-getters.test.ts`, `goalsGetters.test.ts`, `ingresos-imputados.test.ts` — siembran con `useFinanceStore.setState` + `vi.useFakeTimers`.
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
