# Movimientos (transacciones)

**Propósito**: registrar, listar, buscar, editar y borrar ingresos/gastos. Soporta montos en USD (persistidos como equivalente ARS + metadatos de moneda original) y fechas de crédito desplazadas al vencimiento del resumen. Es la tabla base de la que sale todo el resto de la app (balances, análisis, chat).

## Rutas / entry points

- `/movimientos` → `src/app/movimientos/page.tsx` — Client Component. Ledger del mes agrupado por día, con filtros en URL (`?month=YYYY-MM&paymentMethod=<id>&category=<uuid>`), búsqueda con debounce (300ms) y rail desktop.
- Alta desde cualquier lado vía `CreateTransactionDialog` (home `/`, movimientos, etc.).
- El chatbot crea/edita/borra transacciones por su propio camino (`lib/ai/handlers.ts` + tools), pero los números que muestra salen del mismo pipeline `lib/finance/prepare.ts`.

## Archivos clave

| Path | Rol |
|---|---|
| `src/app/movimientos/page.tsx` | Vista ledger: filtra por `periodDate \|\| date` (mes visual), agrupa en `Proyección Futura` (fechas > hoy, colapsada) / `Hoy` / días pasados; resumen Ingresos/Gastos/Neto; sección "Mensualidades pendientes" |
| `src/app/movimientos/actions.ts` | `updateExchangeRates()`: refresca `exchange_rates` (Blue/MEP/CCL/USDT) desde las fuentes de /inversiones |
| `src/app/dashboard/transactions/actions.ts` | Server actions CRUD: `createTransaction`, `updateTransaction`, `deleteTransaction`, `assignDefaultToUnassignedTransactions` (banner de arreglo masivo) |
| `src/components/transactions/create-transaction-dialog.tsx` | Alta con RHF + Zod. Preselecciona el medio `is_default`; al crear, avisa si el gasto excede/acerca el presupuesto de la categoría (`getCategoryBudgetStatus`) |
| `src/components/transactions/edit-transaction-dialog.tsx` | Edición. Si la tx es USD, el form muestra `original_amount` y recalcula el ARS con la cotización vigente al guardar |
| `src/components/transactions/transaction-form-fields.tsx` | Campos compartidos: `AmountField`, `TypeToggle`, `CategoryPicker`, `DateField`, `PaymentMethodField` (muestra la fecha de vencimiento ajustada si el medio es crédito), `CurrencyField` (par `DEFAULT_RATE_PAIR = 'USD_ARS_MEP'`), `InstallmentSelector`, `FrequencySelector` |
| `src/components/shared/transaction-item.tsx` | Fila reutilizable: swipe derecha=editar / izquierda=borrar (mobile, con "peek" de descubribilidad), menú kebab en desktop, **undo de borrado con ventana de 4s** (el `deleteTransaction` real se difiere) |
| `src/components/shared/swipeable-row.tsx` | El gesto en sí (fondos, umbral de 80px, haptics, peek y guard del click sintético). Se extrajo de `TransactionItem` para compartirlo con las cards de /compromisos |
| `src/components/transactions/mes-del-cobro-field.tsx` | Selector «A qué mes cuenta» (dos chips con el NOMBRE del mes). Se dibuja solo si la fecha cae en el borde del mes; la condición completa (ingreso + medio que no es tarjeta) la decide `imputacionAlGuardar` en el diálogo |
| `src/lib/finance/imputacion-ingresos.ts` | Puro: `necesitaDeclararMes` (últimos `DIAS_DE_BORDE` = 7 días), `mesesCandidatos`, `mesPorDefecto`, `resolverImputacion` e `imputacionAlGuardar` |
| `src/lib/schemas/transaction.ts` | Zod: `transactionSchema` / `createTransactionSchema` (idénticos hoy). `payment_method_id` es string u opcional (`'none'` → null); `currency`/`rate_pair`/`exchange_rate` para USD |
| `src/lib/finance/prepare.ts` | `prepareTransactions` (calcula `periodDate` + convierte USD→ARS con `resolveRate`) y `prepareRecurringPlans`. Mismo pipeline en cliente (store) y servidor (chat) |
| `src/lib/utils/dates.ts` | `parseLocalDate`, `calculateCreditPaymentDate`, `dateToLocalString`, `todayString` |

## Tablas DB

| Tabla | Filtro de usuario | Notas |
|---|---|---|
| `transactions` | `users.id` (**id interno**) | Columnas especiales abajo |
| `payment_methods` | `users.id` (**id interno**) | `type` credit/débito/efectivo, `default_closing_day`/`default_payment_day`, `is_default` |
| `categories` | **UUID de auth** (+ `is_system`) | `category_id` en transactions es UUID |
| `exchange_rates` | global (sin user) | upsert por `pair` desde `updateExchangeRates()` |

Columnas especiales de `transactions` (ver `src/types/database.ts`):
- `recurring_plan_id` → la tx ES el pago de una mensualidad (creada por `markRecurringPlanPaid`/backfill en `src/app/compromisos/actions.ts`).
- `installment_plan_id` → cuota de un plan (no editable/deslizable como tx suelta en la UI de movimientos).
- `card_payment_for` → pago de resumen de tarjeta (id de la tarjeta). **Excluido de la lista y de todos los totales** de /movimientos y de las analíticas (las compras ya están itemizadas).
- `income_period` → el mes (día 1) al que cuenta un **ingreso**; NULL en todo lo demás, y el CHECK `income_period_solo_ingresos` lo exige (un `type` que pasa a `expense` tiene que soltarlo en el MISMO update, o el UPDATE entero vuelve con 23514: lo hacen `updateTransaction` y `handleEdit` del chat).
- `original_currency` / `original_amount` / `rate_pair` / `exchange_rate` → metadatos USD. **NO existe columna `currency`** en `transactions` (gotcha clásico); `amount` SIEMPRE guarda el equivalente ARS del momento.

## Flujos principales

1. **Crear**: form (Zod) → si `currency === 'USD'`, el cliente resuelve `exchange_rate = getExchangeRate(rate_pair)` en el submit → `createTransaction`: valida, y si el medio es crédito con ciclo, **la fecha guardada (`date`) pasa a ser el vencimiento** del resumen que contiene la compra (`asegurarCiclos` + `cicloDeCompra`), y se persisten `cycle_id` y `purchase_date` (esta última sólo en `expense`); sin resumen que la contenga, fallback a `calculateCreditPaymentDate(fechaCompra, closing, payment)` con `cycle_id` null; persiste `amount` en ARS + metadatos originales → toast + `fetchAllData()` (el refresco real es del store, no de `revalidatePath`).
2. **Leer**: `fetchAllData()` trae filas crudas → `prepareTransactions()` agrega `periodDate` (mes visual: si `paymentDay < closingDay` y el día de la fecha ≤ `paymentDay + 2`, retrocede un mes) y `realPaymentDate`, y re-convierte USD→ARS con la cotización actual (`resolveRate`: par en `exchange_rates` → dólar blue → snapshot `exchange_rate` → 1). Por eso una tx USD "flota" con la cotización del día en pantalla aunque `amount` en DB quede congelado.
3. **Editar**: `updateTransaction` recalcula la fecha de vencimiento **solo si cambió el medio de pago** a un crédito (evita re-desplazar una fecha ya desplazada). USD se reconvierte con la cotización vigente.
4. **Borrar**: swipe/menú → toast con "Deshacer" 4s → recién ahí `deleteTransaction` (delete duro por id + user).

## A qué mes cuenta un cobro (`income_period`)

Un cobro del 29 de agosto puede ser agosto trabajado o septiembre por adelantado: los dos se anotan igual y la app **no puede distinguirlos sin preguntar**. Por eso:

- El selector aparece **sólo** cuando la fecha cae en los últimos 7 días del mes (`DIAS_DE_BORDE`, medido contra producción: los 8 cobros de fin de mes reales caen entre el 25 y el 29) y **sólo** para ingresos que no van a tarjeta — un reintegro de crédito ya pertenece a un resumen, y el ciclo le gana a `income_period` en `prepare.ts`.
- **Nada se imputa solo.** `users.income_counts_next_month` (Ajustes / ritmo de cobro) **pre-elige** la opción, no imputa.
- Mostrar y guardar son **la misma condición**, `imputacionAlGuardar`: el submit la recomputa desde `data.payment_method_id` (lo que efectivamente se manda), no desde el `watch`. Cuando eran dos condiciones separadas, un reintegro en tarjeta se guardaba con mes sin que el control se hubiera visto nunca — y en una tarjeta sin días por defecto (sin ciclo que gane) eso movía el cobro de mes de verdad.
- Se **deriva de la fecha final, no se retiene**: un mes elegido que deja de estar entre los candidatos de la fecha actual se descarta y cae al default.
- El chat pregunta con el patrón de dos pasos sin estado (`create_transaction` devuelve el pedido al modelo si falta `mes_del_cobro`), y descarta un mes alucinado con la misma función pura.
- Los cobros cargados **antes** de que esto existiera se corrigen **editando el movimiento**: el selector aparece ahí igual que en el alta. No hay backfill automático ni aviso en el inicio — hubo un banner de repaso en el home y se retiró (decisión de producto, 2026-09-03): el lugar para arreglar un movimiento es el movimiento.

Spec: `docs/superpowers/specs/2026-09-03-ingresos-mes-vencido-design.md`.

## Invariantes y gotchas

- `t.date` de un gasto de **crédito** ya ES la fecha de vencimiento del resumen, no la de compra: esa vive en `purchase_date`. La pertenencia a un resumen la decide la FK `transactions.cycle_id`, no el mes de `t.date`.
- Agrupación mensual SIEMPRE por `periodDate || date`; comparaciones de fecha SIEMPRE con `parseLocalDate()` (evita bugs UTC). La precedencia de `periodDate` es **ciclo > `income_period` > `t.date`**.
- El "Neto" del mes en /movimientos suma las **mensualidades pendientes** (`getPendingFixedExpenses`, anclado al mes real de hoy — solo se muestra si estás viendo el mes actual, sin búsqueda ni filtros activos) porque esos compromisos aún no tienen transacción.
- "Proyección Futura" = transacciones reales con fecha futura dentro del mes (típicamente vencimientos de crédito y cuotas), no proyecciones inventadas.
- El monto de un gasto se guarda positivo con `type='expense'`; los getters usan `Math.abs`.
- Al reasignar el medio default a txs sin medio (`assignDefaultToUnassignedTransactions`), si el default es crédito imputa cada fila a su resumen (`cycle_id` + `date = due_date` del ciclo que la contiene, vía `cicloDeCompra`; sólo cae al cálculo por defaults, sin `cycle_id`, si ningún resumen materializado la contiene) — desde el Plan 1 de ciclos ya no es sólo "recalcular el vencimiento".
- Las rutas legacy `/cuotas`, `/mensualidades`, `/categorias`, `/medios-pago`, `/perfil` fueron eliminadas (solo quedan sus `actions.ts`); no linkear a ellas.

## Tests

- `src/lib/finance/__tests__/prepare.test.ts` (periodDate + conversión USD), `creditCycle.test.ts`, `balances.test.ts`.
- `src/lib/store/__tests__/`: `financeStore.test.ts`, `resolveRate.test.ts`, `getQuickAmounts.test.ts`, `analysis-getters.test.ts` (siembran estado con `setState` + fake timers).
- `src/lib/finance/__tests__/imputacion-ingresos.test.ts` — la ventana del borde, los candidatos, el default por preferencia y `imputacionAlGuardar` (incluido el caso tarjeta).
- No hay tests de UI de los diálogos — la suite corre en `environment: node`, sin DOM, así que no hay forma de disparar un submit de RHF: lo que el submit DECIDE se prueba sobre la función pura, y que los dos diálogos la usen bien lo fija el test estructural `src/components/transactions/__tests__/mes-del-cobro-en-los-dialogos.test.ts`. El resto de la validación la cubren Zod + la server action.

## Docs relacionados

- `docs/superpowers/specs/2026-09-03-ingresos-mes-vencido-design.md` — a qué mes cuenta un cobro (`income_period` y la preferencia)
- `docs/superpowers/specs/2026-05-30-movimientos-en-dolares-design.md` — diseño del soporte USD (original_currency/original_amount/rate_pair)
- `docs/movimientos-ux-a11y-plan.md` — plan UX/a11y de la pantalla (swipe, filtros bottom-sheet, focus)
- `docs/superpowers/specs/2026-07-02-cards-cuotas-ritmo-claridad-design.md` — tratamiento de cuotas en cards
