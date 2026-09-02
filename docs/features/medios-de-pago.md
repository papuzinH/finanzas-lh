# Medios de pago

## Propósito
Gestión de los medios de pago del usuario (tarjetas de crédito, débito, efectivo y "deudas personales") y de su estado financiero: saldo disponible por cuenta, resumen "a pagar en el vencimiento" por tarjeta de crédito, medio **predeterminado** para el chatbot y la asignación masiva de movimientos sin medio.

## Rutas / entry points
- `/ajustes/medios` — `src/app/ajustes/medios/page.tsx` (`'use client'`, todo desde `useFinanceStore`). Incluye: banner de movimientos sin medio (con botón que llama `assignDefaultToUnassignedTransactions`), cards institucionales y personales, diálogo de alta y `RegisterCardPaymentDialog`.
- **La ruta legacy `/medios-pago` fue eliminada** en la limpieza: en `src/app/medios-pago/` solo queda `actions.ts`, que sigue siendo el módulo canónico de server actions del CRUD (los diálogos importan de ahí).
- El pago del ciclo vigente de una tarjeta se dispara desde Compromisos (`credit-card-cycle-card.tsx`); ver `docs/features/compromisos.md`.

## Archivos clave
| Archivo | Rol |
|---|---|
| `src/app/ajustes/medios/page.tsx` | Pantalla principal (lista, banner de sin-asignar, alta) |
| `src/app/medios-pago/actions.ts` | `createPaymentMethod`, `updatePaymentMethod`, `deletePaymentMethod`, `reassignAndDeletePaymentMethod` |
| `src/app/dashboard/transactions/actions.ts` | `assignDefaultToUnassignedTransactions()` (arreglo masivo) |
| `src/lib/schemas/payment-method.ts` | Zod: `createPaymentMethodSchema` (`type: 'credit'|'debit'|'cash'`, días de cierre/vencimiento, `is_personal`, `is_default`) |
| `src/components/medios-pago/create-payment-method-dialog.tsx` | Alta (toggle "Predeterminado"; oculto para `is_personal`) |
| `src/components/medios-pago/edit-payment-method-dialog.tsx` / `delete-payment-method-dialog.tsx` | Edición / borrado con reasignación |
| `src/components/medios-pago/institutional-card.tsx` / `personal-debt-card.tsx` | Cards de cuenta institucional vs deuda personal. `institutional-card.tsx` abre `EditAnchorDialog` (`src/components/pocket/edit-anchor-dialog.tsx`, ver `docs/features/bolsillo.md`) para re-anclar el saldo o cambiar el bucket de una cuenta |
| `src/components/medios-pago/payment-method-detail-modal.tsx` | Detalle con movimientos del mes |
| `src/components/medios-pago/register-card-payment-dialog.tsx` | Registrar pago de resumen de tarjeta (típicamente meses anteriores); monta `DeclararProximoCiclo` |
| `src/components/medios-pago/ciclo-fechas-field.tsx` | `CicloFechasField` (par cierre/vencimiento) + `EtiquetaProcedencia` ("del resumen" / "estimado"), compartidos por la ficha y los diálogos de pago |
| `src/components/medios-pago/editar-ciclo-dialog.tsx` | Diálogo «Corregir fechas» de la ficha (`institutional-card.tsx`) |
| `src/components/medios-pago/declarar-proximo-ciclo.tsx` | Paso opcional «Lo tengo a mano, lo cargo» dentro de los diálogos de pago |
| `src/lib/ciclos/declarar.ts` | `guardarDeclaracion` (escribe el `source: 'declared'`), `realinearFuturos` (re-fecha los `generated` futuros) |
| `src/lib/finance/balances.ts` | `computePaymentMethodStatus`, `computePendingCreditCards`, `hasCardPaymentInCycle` |
| `src/lib/finance/cycles.ts` | `cicloVigente` (el resumen vigente), `ciclosDeMetodo`, `cicloDeCompra`, `cicloSaldadoEn` |
| `src/lib/finance/creditCycle.ts` | `getCreditCycleDates` (**fallback** para tarjetas sin ciclos materializados) |
| `src/lib/store/financeStore.ts` | Getters: `getPaymentMethodStatus`, `getDefaultPaymentMethod`, `getUnassignedTransactionsCount`, `getPendingCreditCardByCard`, `isCreditCardCyclePaid` |

## Tablas DB
| Tabla | Filtro de usuario |
|---|---|
| `payment_methods` | `user_id` = **id interno** (`users.id`) |
| `transactions` | `user_id` = **id interno** (`users.id`) (reasignación, pagos de tarjeta, sin-asignar) |
| `recurring_plans` / `installment_plans` | `user_id` = **id interno** (`users.id`) (reasignación al borrar un medio) |

Gotcha crítico: estas tablas usan el id interno de `public.users` (`users.id`), NO el UUID de auth (que usan `categories`/`internal_transfers`/`savings_goals`/`category_budgets`). En la capa IA se distingue `ctx.userId` (id interno) de `ctx.authUserId` (UUID); confundirlos produce queries que nunca matchean, sin error.

## Flujos principales
1. **Alta/edición**: validación Zod (para crédito, `default_closing_day !== default_payment_day`). Invariante de **un solo `is_default` por usuario**: si el nuevo/editado queda como default, la action primero resetea `is_default = false` en TODOS los medios del usuario y después marca este.
2. **Estado por medio** (`getPaymentMethodStatus` → `computePaymentMethodStatus`):
   - **Crédito con ciclo** = "a pagar en el vencimiento": suma los gastos imputados al resumen vigente por la FK (`t.cycle_id === ciclo.id`, no el mes de `t.date`) + mensualidades adheridas activas sin transacción en el ciclo (deduplicadas por `recurring_plan_id`) − reintegros del mismo ciclo. `getPaymentMethodTransactionsForCurrentMonth` usa la MISMA regla, así la lista de movimientos cuadra con este número. `projectedTotal` **negativo = se debe** a la tarjeta. Devuelve `arsExpenses`/`usdExpenses` por separado (el desglose NO convierte USD→ARS; la conversión solo alimenta el total).
   - **Débito/efectivo** (o crédito sin ciclo) = saldo histórico `ingresos − gastos` (cuotas contadas hasta fin del mes actual). Los pagos de tarjeta registrados en la cuenta la debitan como cualquier gasto. Este es el saldo "de siempre" que muestra el detalle de la cuenta; el que alimenta el disponible del home es otro cálculo (`computeAccountBalance`, ancla + movimientos desde el ancla — ver `docs/features/bolsillo.md`), no `computePaymentMethodStatus`.
3. **Borrado**: `deletePaymentMethod` (directo) o `reassignAndDeletePaymentMethod(id, newMethodId | null)` que primero reapunta `transactions`, `recurring_plans` e `installment_plans` al nuevo medio (o `null`) y recién entonces borra.
4. **Arreglo masivo** (`assignDefaultToUnassignedTransactions`): asigna el medio `is_default` a todas las transacciones con `payment_method_id = null`. Si el default es crédito con ciclo, imputa cada fila a su resumen (`cycle_id` + `date = due_date` del ciclo que la contiene, rama `isCredit`; sin resumen que la contenga cae al cálculo por defaults y `cycle_id: null`); si no, solo setea el medio. Banner en `/ajustes/medios` alimentado por `getUnassignedTransactionsCount()`.
5. **Registrar pago de resumen** (`RegisterCardPaymentDialog` → `payCreditCardCycle` de `src/app/compromisos/actions.ts`): para meses anteriores u olvidados. El medio financiador no puede ser una tarjeta de crédito, ni `is_personal`, ni la tarjeta pagada. Crea la transacción con `card_payment_for` (baja el saldo del financiador, neutra para el Disponible Real global).
6. **Chatbot**: si el usuario no aclara medio, `resolvePaymentMethod(..., exactMatch=true)` en `src/lib/ai/handlers.ts` cae al `is_default` (aplica a transacciones, cuotas y suscripciones creadas por el agente).
7. **Declarar el resumen** (Plan 2, `declararCiclo` → `src/lib/ciclos/declarar.ts`): la ficha (`institutional-card.tsx`) muestra el cierre/vencimiento del resumen vigente con su procedencia (`EtiquetaProcedencia`: "del resumen" si `source: 'declared'`, "estimado" si `'generated'`) y el botón «Corregir fechas» abre `EditarCicloDialog` (`CicloFechasField`) para cargarlas a mano. Corrige el resumen del MISMO mes calendario (nunca inserta uno nuevo) y no reasigna ninguna transacción. El mismo paso opcional está disponible al marcar un pago (`DeclararProximoCiclo`, montado en `RegisterCardPaymentDialog` y en el diálogo de Compromisos). Editar los días de la tarjeta (`updatePaymentMethod`) re-fecha **sólo** los resúmenes futuros `generated` (`realinearFuturos`) — nunca uno `declared` ni uno que ya cerró.

## Invariantes y gotchas
- **Un solo default por usuario** — garantizado por las actions (reset masivo antes de marcar), no por un constraint de DB. Cualquier código nuevo que toque `is_default` debe mantener el patrón.
- **`projectedTotal` negativo = deuda** en crédito: `computePendingCreditCards` solo lista tarjetas con `projectedTotal < 0`. No invertir el signo alegremente.
- El ciclo vigente avanza al siguiente resumen **recién cuando el vencimiento ya pasó** (comparación por día); el día exacto del vencimiento el resumen sigue vigente.
- No convertir USD→ARS en el desglose `arsExpenses`/`usdExpenses` (solo el total agregado usa la conversión de `prepareTransactions`).
- `payment_method_id` es editable en transacciones (`transactionSchema` + `updateTransaction`, diálogo con `PaymentMethodField`); al cambiar a crédito la fecha se recalcula SOLO si el medio cambió.
- El viejo `markCreditCardCyclePaid`/`paidCycles` (localStorage) fue **eliminado**: el estado "pagada" se deriva de la transacción `card_payment_for` (`isCreditCardCyclePaid`).
- Toda la lógica de saldo/ciclo vive en `src/lib/finance/` (pura, compartida con el chatbot); los getters del store son wrappers finos.

## Tests
- `src/lib/finance/__tests__/balances.test.ts` — `computePaymentMethodStatus` (crédito vs débito), `computePendingCreditCards`, `hasCardPaymentInCycle`.
- `src/lib/finance/__tests__/creditCycle.test.ts` — avance de ciclo y pertenencia por vencimiento.
- `src/lib/finance/__tests__/pocket.test.ts`, `escenarios-disponible.test.ts` — saldo anclado por cuenta (`computeAccountBalance`) y su interacción con pagos de tarjeta.
- Correr con `npm test`.

## Docs relacionados
- `CLAUDE.md` — sección "Medios de pago" (fuente canónica de las reglas de default y pago de tarjeta) y "Modelo de bolsillo" (bucket/ancla por cuenta).
- `docs/features/bolsillo.md` — bucket (`pocket`/`reserve`) y saldo anclado (`initial_balance`/`initial_balance_at`) por cuenta; edición desde `EditAnchorDialog`.
- `docs/features/compromisos.md` — ciclos de tarjeta y pago de resúmenes.
- `docs/superpowers/specs/2026-07-06-lo-que-se-viene-vencimientos-tarjeta-design.md` — vencimientos por tarjeta en el home.
- `docs/superpowers/specs/2026-07-07-chatbot-asistente-ia-design.md` — cómo el agente resuelve el medio de pago.
