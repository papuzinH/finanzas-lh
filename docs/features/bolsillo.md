# Bolsillo (modelo de disponible anclado)

## Propósito
Reemplaza el cálculo viejo del número central del home ("Tu plata libre para hoy"), que sumaba **todo movimiento registrado desde siempre** y por eso se desviaba de la realidad para siempre con solo un gasto sin anotar (caso real que motivó el cambio: la app mostraba ~$728.000 con ~$10.600 reales en cuenta). El modelo nuevo ancla cada cuenta a un saldo que el usuario declara en una fecha, y calcula el disponible desde ahí: `disponible = Σ saldo(cuentas del bolsillo) − compromisos del período`. Incluye la puesta a punto (`/puesta-a-punto`), el ritmo de cobro declarado y la conciliación cuando el saldo declarado no coincide con el calculado.

## Rutas / entry points
- `/puesta-a-punto` — `src/app/puesta-a-punto/page.tsx` (Server Component: redirige a `/onboarding` si el onboarding no está completo, a `/` si `pocket_setup_completed` ya es `true`) + `puesta-a-punto-flow.tsx` (`'use client'`, 4 pasos: intro → cuentas → ritmo → cambio). El **middleware** (`src/utils/supabase/middleware.ts`) fuerza esta ruta para todo usuario con `pocket_setup_completed !== true` (después de validar `onboarding_completed`), y la excluye junto con `/onboarding` de esa misma validación para no loopear.
- **Onboarding de usuario nuevo** (`/onboarding`, fuera de este doc — ver `docs/features/onboarding-auth.md`): `payment-methods-slide.tsx` y `rhythm-slide.tsx` ya capturan bucket/saldo/ritmo al alta, así que un usuario que termina el onboarding normal llega con `pocket_setup_completed = true` de entrada (vía `saveOnboardingPaymentMethods` en `src/app/onboarding/actions.ts`, un action distinto de `saveAccountAnchors`). `/puesta-a-punto` es solo para la base de usuarios que ya usaba la app con el modelo viejo.
- **Editar el ancla de una cuenta después**: `/ajustes/medios` → `institutional-card.tsx` abre `EditAnchorDialog`.
- **Conciliar cuando el saldo no cierra**: la card `ReconcileReminderCard` en `/` (home) abre `AdjustBalanceDialog`.
- **Cambiar el ritmo de cobro después**: `/ajustes` → `RhythmPicker`.

## Archivos clave
| Archivo | Rol |
|---|---|
| `src/lib/finance/pocket.ts` | Puro. `computeAccountBalance` (saldo de una cuenta ancla→hoy), `anchorValueForDeclaredBalance` (declarado → valor a guardar), `getPeriodEnd` (fin del período según ritmo), `computeCommitments` (fijos + tarjetas que salen del bolsillo), `computeAvailableToSpend` (el cálculo completo) |
| `src/lib/finance/reconcile.ts` | Puro. `daysSinceLastRegistration` (gatilla el recordatorio), `reconcileOptionsFor`/`reconcileHeadline` (qué clasificaciones aplican según el signo de la diferencia) |
| `src/lib/utils/pocket-copy.ts` | Copy compartido entre onboarding, puesta a punto, Ajustes y el hero: `BUCKET_HELP`, `BALANCE_EMPTY_HELP`, `RHYTHMS`/`rhythmLabel`/`rhythmHelp`, `periodLabel`/`nextPeriodLabel` |
| `src/lib/store/financeStore.ts` | `getAvailableToSpend()` (wrapper fino de `computeAvailableToSpend`, el getter que consume el home), `getDaysSinceLastRegistration()`, `getGlobalBalance()` (el cálculo viejo, ver más abajo) |
| `src/app/bolsillo/actions.ts` | `saveAccountAnchors`, `saveIncomeRhythm`, `completePocketSetup`, `reconcileAccount` |
| `src/app/puesta-a-punto/page.tsx` + `puesta-a-punto-flow.tsx` | Flujo standalone de puesta a punto (usuarios existentes) |
| `src/components/pocket/account-anchor-fields.tsx` | Campos compartidos "¿Cuánto tenés hoy?" + bolsillo/reserva. Tres call sites: onboarding (`payment-methods-slide.tsx`), puesta a punto (`puesta-a-punto-flow.tsx`) y `EditAnchorDialog`. `balanceCaption` (prop opcional) cambia qué implica dejar el campo vacío según el contexto — el default sirve a los dos primeros, `EditAnchorDialog` pasa uno propio |
| `src/components/pocket/rhythm-picker.tsx` | Selector de ritmo de cobro (`RHYTHMS`) |
| `src/components/pocket/edit-anchor-dialog.tsx` | Re-ancla una cuenta o le cambia el bucket. Muestra el saldo actual (`computeAccountBalance`) antes de pedir uno nuevo; dejar el campo vacío en una cuenta ya anclada **conserva** el ancla existente (no la borra) |
| `src/components/pocket/adjust-balance-dialog.tsx` | Conciliación manual: compara lo declarado contra `computeAccountBalance` y ofrece clasificar la diferencia |
| `src/components/pocket/reconcile-reminder-card.tsx` | "¿Te falta anotar algo?" en el home, a partir de `DAYS_WITHOUT_REGISTERING` (2) días sin actividad registrada, silenciable 2 días |
| `src/components/dashboard/balance-card.tsx` | Hero card del home, consumidor de `getAvailableToSpend()` |
| `src/components/layout/app-shell.tsx` | `ONBOARDING_ROUTES` incluye `/puesta-a-punto`: sin bottom nav/sidebar/chat mientras la puesta a punto está pendiente (si no, el middleware la vuelve un loop de redirect) |
| `src/utils/supabase/middleware.ts` | Fuerza `/puesta-a-punto` cuando `pocket_setup_completed !== true` (después de onboarding) |

## Tablas DB
| Tabla | Columnas relevantes |
|---|---|
| `payment_methods` | `bucket` (`'pocket' \| 'reserve'`, default `'pocket'`), `initial_balance` (numeric, default 0), `initial_balance_at` (date, nullable — `null` = sin anclar) |
| `users` | `income_rhythm` (`'monthly' \| 'biweekly' \| 'weekly' \| 'irregular'`), `pocket_setup_completed` (boolean) |
| `internal_transfers` | Usada por `reconcileAccount` (clasificación `transfer`, "Lo mandé a una reserva") vía `from_payment_method_id`/`to_payment_method_id`. Ver `docs/features/transferencias-internas.md` |
| `transactions` | `is_balance_adjustment` (marca los ajustes de conciliación; excluidos de las analíticas de consumo igual que `card_payment_for`) |

Todas estas tablas filtran por `users.id` (id interno), salvo `internal_transfers` que sigue filtrando por el UUID de auth (ver el gotcha de esa tabla en su propio doc).

## Flujos principales
1. **Puesta a punto** (`PuestaAPuntoFlow`): congela `getGlobalBalance()` (el número viejo) apenas carga, antes de anclar nada, porque después ya no se puede reconstruir. Paso "cuentas": una `AccountAnchorFields` por cuenta no-crédito y no-personal; balance vacío = esa cuenta queda sin anclar. Paso "ritmo": `RhythmPicker`. Paso "cambio": compara el número viejo congelado contra `getAvailableToSpend()` recién guardado. `saveAccountAnchors` recibe, por cuenta, `anchorValueForDeclaredBalance(declarado, ...)` — **no** el declarado tal cual, porque `computeAccountBalance` ya cuenta los movimientos del día del ancla y guardar el declarado sin ajustar restaría dos veces lo de hoy.
2. **Cálculo del disponible** (`computeAvailableToSpend`): filtra `payment_methods` a `type !== 'credit' && !is_personal` (una tarjeta no tiene saldo propio; una deuda personal no es una cuenta con plata). Por cada una, `computeAccountBalance` = `initial_balance` (si está anclada) + movimientos (`transactions` + `internal_transfers`) entre el ancla (inclusive) y hoy (inclusive). `pocketTotal`/`reserveTotal` = suma por `bucket`. `computeCommitments` resta del bolsillo lo que ya tiene dueño dentro del período de cobro (`getPeriodEnd(rhythm, now)`): mensualidades pendientes (`computePendingFixedExpenses`, fijas al mes calendario) + tarjetas cuyo `nextPaymentDate` cae dentro del período; lo que vence después va a `committedNextPeriod` (se muestra, no resta). `available = pocketTotal − committed`.
3. **Re-anclar una cuenta** (`EditAnchorDialog`, desde `/ajustes/medios`): muestra `computeAccountBalance(method, ...)` actual antes de pedir uno nuevo. Si el usuario completa el campo, guarda un ancla nueva (mismo cálculo que la puesta a punto). Si lo deja vacío y la cuenta **ya estaba anclada**, reenvía `initial_balance`/`initial_balance_at` sin cambios — solo se aplica el `bucket` nuevo. Si lo deja vacío y la cuenta **nunca estuvo anclada**, sigue sin anclar. Esto evita que "solo quería cambiar el bucket" borre en silencio un ancla ya declarada.
4. **Conciliación** (`reconcile.ts` + `AdjustBalanceDialog` + `reconcileAccount`): `getDaysSinceLastRegistration()` cuenta desde el `created_at` más reciente entre `transactions` **e** `internal_transfers` (una conciliación resuelta con "Lo mandé a una reserva" también cuenta como actividad, si no el recordatorio seguía apareciendo después de resolver el drift). A partir de 2 días sin actividad aparece "¿Te falta anotar algo?": la opción primaria es "Anotar ahora" (abre el diálogo de transacción normal); la secundaria, "Ya está todo anotado", abre `AdjustBalanceDialog`, que compara el saldo declarado contra `computeAccountBalance` y ofrece `reconcileOptionsFor(diferencia)` — `transfer`/`expense`/`adjustment` si falta plata (la app cree que hay más de lo real), `income`/`adjustment` si sobra. `reconcileAccount` valida que la cuenta de origen **y**, si la clasificación es `transfer`, la cuenta de destino, pertenezcan al usuario. Un `adjustment` crea una transacción con `is_balance_adjustment = true`: nunca reescribe el pasado, queda visible en `/movimientos`, pero se excluye de las analíticas de consumo.

## Invariantes y gotchas
- **El disponible sale solo del bolsillo** (`bucket = 'pocket'`); las reservas quedan afuera a propósito, para que la app no invite a romper un ahorro deliberado.
- **Sin ancla, una cuenta suma todo el historial** (comportamiento del modelo viejo) — es el estado de cualquier cuenta que el usuario salteó en la puesta a punto o el onboarding. `accounts[].anchored` en `getAvailableToSpend()` lo expone para la UI (`sinAnclar` en `balance-card.tsx`).
- **Los fijos (mensualidades) se descuentan siempre en base al mes calendario** (`computePendingFixedExpenses` no tiene fecha de vencimiento por mensualidad) — a diferencia de las tarjetas, que sí respetan un período más corto (`weekly`/`biweekly`). Es la lectura conservadora: el modelo no sabe cuándo vence cada mensualidad dentro del mes.
- **`getGlobalBalance()` (el cálculo viejo) sigue vivo, pero solo para el contraste "antes/después"** del paso "cambio" de `/puesta-a-punto`. No alimenta el disponible ni ningún otro cálculo del modelo nuevo — no reintroducirlo como fuente de verdad en otro lado.
- **`/puesta-a-punto` corre fuera del `AppShell`** (`ONBOARDING_ROUTES`): sin bottom nav, sidebar ni chat. Si se sacara de esa lista, cualquier intento de navegar durante la puesta a punto pendiente rebota contra el middleware, que la vuelve a forzar — un loop de redirect visible.
- **Limitación conocida — pago parcial de tarjeta**: fuera de alcance (documentada también en `docs/features/compromisos.md`). `isCreditCardCyclePaid` da el ciclo por saldado con cualquier pago en el mes del vencimiento.
- **Limitación conocida — reservas en moneda extranjera**: `payment_methods` no tiene columna de moneda, así que `initial_balance` es un número sin unidad, mientras que `prepareTransactions` convierte los movimientos en USD a ARS. Una reserva declarada en dólares (ej. "Mis dólares" con `initial_balance: 2800`) ve su saldo calculado mezclar esa ancla en USD con gastos ya convertidos a ARS: un gasto de USD 100 le resta ~$130.000 al saldo de esa cuenta, no 100. El disponible global no se ve afectado (las reservas no lo alimentan), pero la cifra que se muestra bajo "Guardado en reservas" y en `/ajustes/medios` para esa cuenta específica queda sin sentido. No hay fix de código previsto — hace falta una columna de moneda por cuenta.
- Cambios de lógica financiera van en `src/lib/finance/pocket.ts` / `reconcile.ts` (puras), nunca en componentes ni en el cuerpo de los getters.
- Fechas siempre con `parseLocalDate()` (`src/lib/utils/dates.ts`).

## Tests
- `src/lib/finance/__tests__/pocket.test.ts` — `computeAccountBalance`, `getPeriodEnd`, `computeCommitments`, `computeAvailableToSpend`, `anchorValueForDeclaredBalance` (funciones puras, todos los casos borde de ventana de ancla).
- `src/lib/finance/__tests__/escenarios-disponible.test.ts` — los perfiles de aceptación del spec (E1–E9): sueldo mensual, mitad en efectivo, freelancer irregular, ahorrista en dólares, gasto pagado desde una reserva, mensualidad facturada en tarjeta, conciliación, y las dos invariantes de neutralidad (pagar tarjeta / marcar mensualidad pagada no mueven el disponible) + un test de integración contra el store.
- `src/lib/finance/__tests__/reconcile.test.ts` — `daysSinceLastRegistration` (incluye transacciones y transferencias internas), `reconcileOptionsFor`, `reconcileHeadline`.
- `src/lib/store/__tests__/recurring-backfill-preview.test.ts` — `getRecurringBackfillPreview` (no es parte del modelo de bolsillo en sí; vive en el mismo store, ver `docs/features/compromisos.md`).
- Correr con `npm test`.

## Docs relacionados
- `CLAUDE.md` — sección "Modelo de bolsillo (`lib/finance/pocket.ts`)".
- `docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md` — spec completo del modelo.
- `docs/superpowers/plans/2026-08-20-disponible-anclado-fundacion.md`, `2026-08-20-disponible-anclado-ui.md` — planes de implementación (15 tasks).
- `docs/features/home-dashboard.md` — cómo el hero del home consume `getAvailableToSpend()`.
- `docs/features/medios-de-pago.md` — bucket/ancla por cuenta desde `/ajustes/medios`.
- `docs/features/compromisos.md` — por qué los fijos de crédito no se descuentan aparte.
- `docs/features/transferencias-internas.md` — lado `internal_transfers` de la conciliación.
