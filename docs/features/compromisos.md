# Compromisos

## Propósito
Hub de deudas y gastos comprometidos del usuario: **cuotas** (planes de financiación), **mensualidades** (planes recurrentes tipo suscripción/servicio) y **ciclos de tarjeta de crédito** (resumen a pagar por tarjeta, con estado pagada/pendiente). Es la pantalla donde el usuario marca pagos y ve cuánto de su plata ya está comprometida este mes.

## Rutas / entry points
- `/compromisos` — `src/app/compromisos/page.tsx` (Server Component fino: lee `searchParams.tab` y renderiza `CompromisosClient` con `initialTab` `'cuotas' | 'mensualidades'`).
- `src/app/compromisos/compromisos-client.tsx` (`'use client'`, todo desde `useFinanceStore`): hero "Compromisos del mes" (cuotas + mensualidades), sección **Tarjetas de crédito** (una `CreditCardCycleCard` por tarjeta con ciclo pendiente, vía `getPendingCreditCardByCard()`), y debajo `TabsDS` con las tabs `cuotas` / `mensualidades`.
- El diálogo "Registrar pago" de resúmenes de meses anteriores vive en `/ajustes/medios` (`register-card-payment-dialog.tsx`), pero llama a la misma action `payCreditCardCycle`.

## Archivos clave
| Archivo | Rol |
|---|---|
| `src/app/compromisos/page.tsx` | Entry server, resuelve tab inicial |
| `src/app/compromisos/compromisos-client.tsx` | UI completa (hero, tarjetas, tabs, cards de cuotas y mensualidades) |
| `src/components/shared/swipeable-row.tsx` | Gesto de las cards en mobile: derecha edita, izquierda elimina. Mismo componente que usa `TransactionItem` en /movimientos |
| `src/app/compromisos/actions.ts` | `markRecurringPlanPaid`, `unmarkRecurringPlanPaid`, `payCreditCardCycle`, `undoCreditCardPayment`, `backfillRecurringPlansHistory`, `syncAutomaticRecurringCharges` |
| `src/app/dashboard/installments/actions.ts` | `createInstallmentPlan`, `updateInstallmentPlan`, `deleteInstallmentPlan` (cuotas) |
| `src/app/dashboard/subscriptions/actions.ts` | `createSubscription`, `updateSubscription`, `deleteSubscription` (CRUD de `recurring_plans`) |
| `src/components/compromisos/credit-card-cycle-card.tsx` | Card + chip de ciclo de tarjeta (pagar / deshacer pago, selector de medio financiador) y el pedido de fechas del resumen (etiqueta «estimado» + «Corregir» → `EditarCicloDialog`) cuando `pideDeclaracion` da true |
| `src/components/installments/*` , `src/components/subscriptions/*` | Diálogos crear/editar de cuotas y mensualidades |
| `src/lib/finance/cycles.ts` | `cicloDeCompra`, `cicloVigente`, `cicloAnterior`, `cicloNEsimo`, `cicloSaldadoEn`, `generarCiclos` (el resumen como entidad) |
| `src/lib/ciclos/asegurar.ts` | `asegurarCiclos` (get-or-create de los resúmenes; la única escritura) |
| `src/lib/finance/creditCycle.ts` | `getCreditCycleDates` (**fallback** sin ciclos), `isExpenseInCurrentMonthScope`, `sameMonthYear` (funciones puras) |
| `src/lib/finance/balances.ts` | `computePaymentMethodStatus`, `computePendingCreditCards`, `hasCardPaymentInCycle` |
| `src/lib/finance/pending.ts` | `computePendingFixedExpenses` (mensualidades pendientes del mes) |
| `src/lib/finance/recurring.ts` | `isAutomaticPlan`, `expectedChargeDatePorCiclo` (el resumen real al que cae el cobro, por `cycle_id`), `expectedChargeDate` (fallback sobre los defaults de la tarjeta cuando no hay ciclo), `computeMissingAutomaticCharges` (mensualidades de crédito que se postean solas) |
| `src/lib/store/financeStore.ts` | Getters: `getPendingCreditCardByCard`, `getPendingFixedExpenses`, `getInstallmentStatus`, `getMonthlyBurnRate`, `isCreditCardCyclePaid`, `getRecurringBackfillPreview` |

## Tablas DB
| Tabla | Filtro de usuario |
|---|---|
| `recurring_plans` | `user_id` = **id interno** (`users.id`) |
| `installment_plans` | `user_id` = **id interno** (`users.id`) |
| `transactions` | `user_id` = **id interno** (`users.id`) (las cuotas, mensualidades pagadas y pagos de tarjeta son filas acá) |
| `payment_methods` | `user_id` = **id interno** (`users.id`) |
| `categories` | `user_id` = **UUID de auth** (relevante en el get-or-create "Pagos de tarjeta") |

Gotcha crítico (documentado en CLAUDE.md, fuente de bugs silenciosos en el chatbot): las 4 primeras tablas filtran por el id interno de `public.users` (`users.id`); `categories` por el UUID de `auth.users`. En las server actions se usa `supabase.auth.getUser().id` + RLS; en la capa IA la distinción es explícita (`ctx.userId` vs `ctx.authUserId`).

## Flujos principales
1. **Marcar mensualidad pagada** (`markRecurringPlanPaid`): crea una transacción `expense` real con `recurring_plan_id` (guard anti-duplicado por mes; hereda `original_currency`/`original_amount`/`rate_pair`/`exchange_rate` del plan si es USD). `unmarkRecurringPlanPaid` borra la transacción vinculada del mes actual. El estado "pagada este mes" NO se guarda: se deriva de que el plan ya no figure en `getPendingFixedExpenses().items`.
2. **Regularizar historial** (`backfillRecurringPlansHistory`): crea transacciones de mensualidades para meses PASADOS no cubiertos (desde `created_at` de cada plan activo hasta el mes pasado; el mes actual no se toca). **Piso = mes del primer INGRESO del usuario** (no la primera transacción: una cuota anterior al primer sueldo no corre el piso) y antes borra el exceso previo al piso. `getRecurringBackfillPreview()` en el store calcula la misma preview (`missingMonths`/`excessMonths`); ojo: hoy ninguna UI invoca la action ni el getter (solo tests) — verificar antes de asumir que existe el banner.
3. **Mensualidades automáticas de crédito** (`syncAutomaticRecurringCharges`): una mensualidad facturada en tarjeta no se paga, se debita cuando cierra el resumen. Las de crédito nacen solas como transacción fechada al vencimiento del resumen que le toca al cobro, con su `cycle_id` (`expectedChargeDatePorCiclo`; el día de cobro es `billing_day ?? 1` clampeado al último día del mes, y `expectedChargeDate` sobre los defaults de la tarjeta queda como fallback si no hay ciclo), igual que cuotas y compras variables. Se dispara desde `fetchAllData()` **una vez por carga de la app** (flag de módulo `automaticChargesSynced`), nunca en cada refetch. Sólo aplica a planes **mensuales** sobre tarjetas con ciclo cargado; el resto sigue con el toggle manual. Piso: el mes más tardío entre la creación del plan y el primer ingreso del usuario. **Cobertura de un mes**: dos regímenes, y cada transacción cae en uno solo. Si la fila tiene **`purchase_date`** —el mes de consumo literal, que escribe este mismo sync— esa es la clave, **exacta y excluyente**: el mes M está cubierto sii alguna fila del plan tiene su `purchase_date` en M, y esa fila **no** aporta ninguna de las claves aproximadas. Si no la tiene (las que crea el marcado manual de pago, y las anteriores a que la columna existiera), el mes de consumo se reconstruye con dos claves aproximadas evaluadas con **OR**: su `cycle_id` contra el que predice `expectedChargeDatePorCiclo`, y el mes de su `date` contra el mes de la fecha prevista (el mes y no la fecha exacta a propósito: una fecha editada a mano sigue contando). El reparto evita los **dos** errores, los dos con declarar un resumen como disparador: **duplicar** (declarar mueve la predicción a otro resumen y la fila posteada deja de matchear) y **suprimir** (dos resúmenes seguidos que vencen en el mismo mes calendario —lo normal después de declarar— hacen que el cargo de septiembre le preste su clave de mes a octubre, y el de octubre no se postea nunca). Límite conocido, acotado a las filas **sin** `purchase_date`: ahí la cobertura sigue siendo por aproximación y los dos errores siguen siendo posibles.
4. **Cuotas** (`createInstallmentPlan`): inserta el plan y N transacciones `(i/N)` con `installment_plan_id`. Primera cuota: si el medio es crédito, el `due_date` del resumen que contiene la compra (`cicloDeCompra`); si no, la fecha de compra. Las siguientes: la cuota `i` va al **i-ésimo resumen** (`cicloNEsimo`), no a +1 mes — con ciclos desparejos, sumar meses inventa fechas que la tarjeta no tiene. Fallback a `calculateCreditPaymentDate` + `addMonths` sólo sin ciclos materializados. `updateInstallmentPlan` propaga descripción/categoría preservando el sufijo `(X/Y)`; `deleteInstallmentPlan` borra plan + transacciones (fallback manual si no hay CASCADE, código FK `23503`).
5. **Ciclo de tarjeta**: `getPendingCreditCardByCard()` → `computePendingCreditCards` arma un `CreditCardCycleSummary` por tarjeta con deuda (`projectedTotal < 0`): `total`, `nextPaymentDate`, `isCycleClosed` (el cierre ya pasó o es hoy → resumen fijado), `isPending`, `isPaidManually`.
6. **Pagar resumen** (`payCreditCardCycle`): crea transacción `expense` en el **medio financiador** elegido (nunca la propia tarjeta ni medios `is_personal`) con `card_payment_for = <id tarjeta>` y fecha = vencimiento; categoría get-or-create **"Pagos de tarjeta"** (`emoji 💳`, `is_system: true`, `type: 'expense'`; `category_id` es NOT NULL). Guard anti-duplicado: **por `cycle_id`** (`hasCardPaymentInCycle`, desde el Plan 1 de ciclos) — no por mes calendario, que era la fuente de bugs de borde de mes que ese plan cerró. `undoCreditCardPayment` borra el pago del `cycle_id` indicado.

## Interacción de las cards (mobile vs desktop)

Cuotas y mensualidades se editan y borran igual que un movimiento: en **mobile**, deslizando
(derecha = editar, izquierda = eliminar) o tocando la card, que abre un `ActionSheet` con las
mismas dos acciones; en **desktop**, con el menú kebab que aparece en la card. El menú kebab
**no se renderiza en mobile** y el gesto **no se registra en desktop** (`useIsMobile`).
El toggle "pagada/pendiente" de una mensualidad manual corta la propagación del click: tocarlo
marca el pago y no abre el menú de la fila.

## Invariantes y gotchas
- **Una mensualidad de crédito nunca está pendiente de acción.** Se postea sola, fechada al vencimiento del resumen, cuando su día de cobro ya pasó. Borrar una transacción generada NO la elimina: vuelve en la próxima carga, porque la cobertura se deriva de los datos y no de un registro de qué se generó — para que un plan deje de postearse hay que desactivarlo (`is_active = false`). La UI separa "Se debitan solas" de "Las pagás vos", y el subtotal "Por pagar" cuenta **sólo las manuales**.
- **`recurring_plans.billing_day`** (1-31, nullable, se lee como `billing_day ?? 1`): el día del mes en que el plan se factura. En crédito decide en qué resumen cae; en débito alimenta el "vence el X". El stepper del formulario existía desde antes, pero era un campo fantasma: sólo aparecía en débito y su valor se descartaba al guardar.
- **Mensualidades = transacciones reales.** Nada de flags: pagada/pendiente/histórico se deriva de las tx con `recurring_plan_id`. Usar `original_currency`/`original_amount` — la columna `currency` NO existe en `transactions`.
- **El ciclo vigente avanza recién cuando el vencimiento YA pasó**, con comparación por día (`cicloVigente`: el de menor `due_date` con `due_date >= hoy`). El día exacto del vencimiento ese resumen sigue vigente (todavía se debe). `computePendingCreditCards` usa la misma regla para `isPending`.
- **Pertenencia al ciclo**: la decide la FK `transactions.cycle_id` — un movimiento pertenece al resumen sii `t.cycle_id === ciclo.id`. Ya no se deriva del mes de `t.date`: esa aritmética no podía representar dos resúmenes vencidos en el mismo mes calendario y se movía sola cada vez que el usuario corregía el día de vencimiento de la tarjeta.
- **Pago de tarjeta es neutro para el Disponible Real global** y las analíticas de consumo (`isExpenseInCurrentMonthScope` y los cómputos globales excluyen `card_payment_for`: las compras ya están itemizadas, restarlo duplicaría). Sí baja el saldo del medio financiador.
- **`isCreditCardCyclePaid(methodId)`** = existe transacción con `card_payment_for` = la tarjeta y `cycle_id` = el resumen vigente (`hasCardPaymentInCycle`). El viejo flag `paidCycles`/localStorage fue **eliminado** (cero referencias en `src/`) — no reintroducirlo.
- Invariante del home: pagar mensualidad o tarjeta NO mueve "Tu plata libre para hoy" (`getAvailableToSpend`, modelo de bolsillo — ver `docs/features/bolsillo.md`): el monto pasa de "pendiente" a formar parte del saldo ya movido de la cuenta financiadora, neto cero.
- Los fijos (mensualidades) se descuentan del disponible siempre en base al **mes calendario** (`computePendingFixedExpenses` no guarda fecha de vencimiento por plan) — a diferencia de las tarjetas, que sí respetan un período de cobro más corto (`weekly`/`biweekly`) en `computeCommitments`.
- Cambios de lógica de ciclo/balance van en `src/lib/finance/` (funciones puras compartidas con el chatbot), nunca en componentes ni en el cuerpo de los getters.
- Fechas siempre con `parseLocalDate()` / `dateToLocalString()` de `src/lib/utils/dates.ts` (bugs UTC).

## Tests
- `src/lib/finance/__tests__/creditCycle.test.ts`, `balances.test.ts`, `pending.test.ts`, `prepare.test.ts` — lógica pura de ciclos, pendientes y pagos de tarjeta.
- `src/lib/finance/__tests__/pocket.test.ts`, `escenarios-disponible.test.ts` — `computeCommitments` (qué sale del bolsillo cada período) y el efecto neutro de pagar mensualidades/tarjetas sobre el disponible (E8/E9).
- `src/lib/finance/__tests__/recurring.test.ts` — motor de cargos automáticos: los ciclos de dos tarjetas distintas, cobro después del cierre, día 31 en febrero, tarjeta sin ciclo, plan anual, piso por primer ingreso e idempotencia.
- `src/lib/store/__tests__/recurring-backfill-preview.test.ts` — `getRecurringBackfillPreview` (piso por primer ingreso, exceso). Restaurado desde el viejo `disponible-real.test.ts` (retirado junto con `getRealAvailableBalance`) porque eran los únicos tests de este getter, que sigue vivo.
- `src/lib/store/__tests__/analysis-getters.test.ts` — getters de análisis que excluyen `card_payment_for`.
- Correr con `npm test`.

## Docs relacionados
- `CLAUDE.md` — secciones "Store", "Lógica financiera compartida", "Modelo de bolsillo", "Medios de pago" (pago de tarjeta) y "Fechas y ciclos de tarjeta".
- `docs/features/bolsillo.md` — modelo de disponible anclado; por qué los fijos de crédito no se descuentan aparte de la tarjeta.
- `docs/superpowers/specs/2026-07-02-cards-cuotas-ritmo-claridad-design.md` — claridad de cards de cuotas/ritmo en el dashboard.
- `docs/superpowers/specs/2026-07-06-lo-que-se-viene-vencimientos-tarjeta-design.md` — agenda de próximos vencimientos de tarjeta en el home (misma lógica de ciclo).
- `docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md` — cómo los compromisos alimentan el número central del home.
- `docs/superpowers/specs/2026-08-21-mensualidades-credito-automaticas-design.md` — por qué las de crédito se postean solas y qué quedó fuera de alcance.
- `docs/features/medios-de-pago.md` — lado "medio de pago" del pago de resúmenes.
