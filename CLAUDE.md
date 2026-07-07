# Chanchito – PWA de finanzas personales
Next.js App Router · Supabase (PostgreSQL + Auth) · Zustand · TypeScript

## Comandos
```bash
npm run dev      # Desarrollo (Turbopack)
npm run build    # Producción (Webpack)
npm run lint     # ESLint
npm test         # Vitest (run) · npm run test:watch para watch
```
Tests en `src/**/__tests__/`. Los del store (`lib/store/__tests__/analysis-getters.test.ts`, `disponible-real.test.ts`) siembran estado con `useFinanceStore.setState` y `vi.useFakeTimers`. (Nota: `dates.test.ts` tiene fallas preexistentes ajenas.)

## Reglas Server / Client
- `app/` → Server Components por defecto.
- `'use client'` solo si se necesitan hooks o event listeners.
- Server Components: fetch con `utils/supabase/server.ts`.
- Client Components: NUNCA fetch directo → solo `useFinanceStore`.
- Prohibido: `useEffect` para fetching, SWR, React Query.

## Store: `lib/store/financeStore.ts`
Única fuente de verdad cliente. **Leer antes de modificar componentes.**
Toda lógica de negocio (sumas, cálculos, porcentajes) va en el store, NO en componentes.

Getters disponibles:
- `getPortfolioStatus()` – portafolio de inversiones
- `getGlobalBalance()` – balance total. **Resta mensualidades históricas** (tx con `recurring_plan_id`) + las pendientes del mes en curso (`getPendingFixedExpenses`), NO solo el burn rate del mes.
- `getMonthlyBurnRate()` – planes recurrentes activos
- `getInstallmentStatus(planId)` – progreso de cuotas
- `getPaymentMethodStatus(methodId)` – **Crédito**: "a pagar en el vencimiento" del ciclo. Un movimiento pertenece al ciclo si el mes/año de `t.date` (que en crédito ya es la fecha de vencimiento calculada por `calculateCreditPaymentDate`) coincide con `nextPaymentDate`; incluye cuotas + compras + mensualidades adheridas (deduplicadas). Devuelve `arsExpenses`/`usdExpenses` por separado (NO se convierte USD→ARS en el desglose). El ciclo vigente (`getCreditCycleDates`) **avanza al siguiente resumen recién cuando el vencimiento ya pasó** (comparación por día): el día exacto del vencimiento ese resumen sigue siendo el vigente (todavía lo debés). **Débito/efectivo**: saldo histórico `ingresos − gastos` (los pagos de tarjeta, ver abajo, lo reducen).
- `getExpensesByCategory(scope)` – desglose por categoría
- `getMonthlyBalance(monthStr, methodId)` – balance mensual
- `getRealAvailableBalance()` – **Disponible Real** (número central del home). `disponibleReal = getGlobalBalance()`; expone también `saldoBruto`, `pendingFixedExpenses`, `pendingCardTotal` y `pendingCardItems` (`CreditCardCycleSummary[]` filtrado a `isPending`) para el desglose. El desglose de "Tu plata libre para hoy" (`BalanceCard`) lista debajo de "Tarjeta de este mes" una sub-línea por tarjeta pendiente con su **vencimiento vigente** (`nextPaymentDate`, la fecha real del ciclo en curso), su **estado** (`isCycleClosed`: "cerrado" = resumen ya cerrado a pagar / "en curso" = ciclo aún acumulando) y su monto en ARS (los `total` suman exacto `pendingCardTotal`). El estado explica por qué una tarjeta muestra consumo de un período anterior (cerrado) y otra el del período vigente (en curso). Invariante: pagar una mensualidad o tarjeta NO mueve `disponibleReal` **global** (sí baja el saldo del medio que financia el pago, ver "Medios de pago").
- `getPendingFixedExpenses()` – mensualidades activas sin transacción vinculada este mes (`{ total, items }`).
- `getRecurringBackfillPreview()` – meses de mensualidades sin registrar (`missingMonths`) y exceso a borrar (`excessMonths`), con piso en la primera transacción real del usuario.
- `getDefaultPaymentMethod()` – medio de pago marcado `is_default`.
- `getUnassignedTransactionsCount()` – transacciones con `payment_method_id == null`.
- `isCreditCardCyclePaid(methodId)` – true si existe un pago (`card_payment_for`) en el mes del vencimiento del ciclo vigente. Reemplaza el viejo flag `paidCycles`/localStorage.

`fetchAllData()` → Promise.all desde Supabase + API dólar blue (non-blocking).

**Mensualidades = transacciones reales.** Marcar una mensualidad como pagada (o "Regularizar/Corregir historial") crea/borra transacciones con `recurring_plan_id` vía `src/app/compromisos/actions.ts` (`markRecurringPlanPaid`, `unmarkRecurringPlanPaid`, `backfillRecurringPlansHistory`). Usar `original_currency`/`original_amount` (NO `currency`, que no existe en `transactions`). El backfill nunca genera antes del mes de la primera transacción real (piso) y limpia el exceso previo.

## Medios de pago
- **Predeterminado** (`payment_methods.is_default`): un solo default por usuario (las actions de `src/app/medios-pago/actions.ts` resetean el resto al marcar uno). Se configura con el toggle "Predeterminado" en crear/editar medio (oculto para `is_personal`).
- **Chatbot**: si el usuario no aclara el medio, `resolvePaymentMethod(..., exactMatch=true)` usa el `is_default`. Aplica en `handleTransaction`/`handleInstallment`/`handleSubscription` (`src/lib/ai/handlers.ts`).
- **Editar el medio** de una transacción: `payment_method_id` está en `transactionSchema` y en `updateTransaction`; el diálogo de edición usa `PaymentMethodField`. Al cambiar a crédito se recalcula la fecha SOLO si el medio cambió.
- **Arreglo masivo**: `assignDefaultToUnassignedTransactions()` (`src/app/dashboard/transactions/actions.ts`) asigna el default a las transacciones sin medio (banner en `/ajustes/medios`).

**Pago de tarjeta = salida real del medio que la financia.** Pagar un resumen crea una transacción `expense` en el medio financiador (ej. Mercado Pago) marcada con `transactions.card_payment_for = <id tarjeta>` (`payCreditCardCycle`/`undoCreditCardPayment` en `src/app/compromisos/actions.ts`). Esa transacción:
- **baja el saldo del medio financiador** (`getPaymentMethodStatus` débito la cuenta),
- es **neutra para el Disponible Real global y las analíticas de consumo**: `isExpenseInCurrentMonthScope` y los totales de `getGlobalBalance`/`getGlobalEffectiveExpenses`/`getExpensesByCategory` excluyen `card_payment_for` (las compras ya están itemizadas → no doble-contar),
- usa una categoría get-or-create "Pagos de tarjeta" (`category_id` es NOT NULL).
UI: selector de medio en el chip de Compromisos (`credit-card-cycle-card.tsx`) + diálogo "Registrar pago" para meses anteriores (`register-card-payment-dialog.tsx`). El viejo `markCreditCardCyclePaid`/`paidCycles` (localStorage) quedó **deprecado**.

## Fechas y ciclos de tarjeta
- `periodDate` → fecha visual para agrupación mensual (puede diferir de la real)
- `realPaymentDate` → fecha real de transacción
- `isExpenseInCurrentMonthScope()` → determina pertenencia al mes según ciclo cierre/pago
- **Siempre** usar `parseLocalDate()` de `lib/utils/dates.ts` (evita bugs UTC)

## UI
- **Fondo de app**: `bg-bg` (crema). Cards: `bg-surface`.
- **Tokens semánticos SIEMPRE**: nunca hardcodees hex ni colores Tailwind para UI.
  - Layout: `bg-bg`, `bg-bg-2`, `bg-surface`, `bg-surface-2`, `text-text`, `text-muted`, `text-faint`, `border-border`
  - Acento: `bg-accent text-accent-ink border-accent-deep shadow-offset`
  - Financiero: `text-good` (ingreso/positivo), `text-bad` (gasto/negativo), `text-warn` (atención)
  - Hero card: `bg-hero text-cream shadow-float rounded-[26px]`
- **NO usar**: `emerald-*`, `rose-*`, `indigo-*`, `violet-*`, `slate-*` para UI nueva.
- **Bordes**: siempre `border-[1.5px] border-border`. Nunca `border` (1px default).
- **Tipografía** (por rol):
  - `font-poster` (Alfa Slab One): saldos, montos display, títulos de pantalla
  - `font-sans` (DM Sans): TODA la UI de texto (labels, descripciones, botones)
  - `font-serifd` (Bodoni Moda): solo frases editoriales/marketing
  - `font-script` (Yellowtail): solo tagline/logo
  - `tnum`: TODOS los números financieros (alineación en columna)
- **Botones**: `<Button>` de `@/components/ui/button` → pill + `border-[1.5px] shadow-offset active:translate-y-[2px]`. Variants: `accent`, `navy`, `soft`, `ghost`.
- **Cards**: `<Card>` de `@/components/ui/card` → `rounded-2xl bg-surface border-[1.5px] border-border shadow-card`.
- **Tabs**: `<TabsDS>` de `@/components/ui/tabs-ds`.
- **Toggles**: `<ToggleDS>` de `@/components/ui/toggle-ds`.
- **Progress bars**: `<ProgressBar>` de `@/components/ui/progress-bar` con `tone="accent|good|warn|bad"`.
- **Chips de filtro**: `<Chip>` de `@/components/ui/chip`.
- **Banners**: `<BannerDS>` de `@/components/ui/banner-ds`.
- **Íconos**: `lucide-react` directo (importar específicos) O `<Icon name="..." />` de `@/components/ui/icon`.
- **ScreenHeader**: `<ScreenHeader kicker="..." title="..." sub="..." right={...} />` de `@/components/shared/screen-header`. Reemplaza cualquier `PageHeader`.
- **Mobile-first**: canvas base 392px. Margen lateral `px-5`. Touch targets ≥44px. `pb-28` para clearear BottomNav.

## Prototipos de referencia
Los archivos JSX en `design_handoff_chanchito/prototypes/app/` son la fuente visual de verdad:
- `ui.jsx` — BottomNav, ScreenHeader, Card, SectionTitle
- `screen-inicio.jsx` — Dashboard
- `screen-movimientos.jsx` — Movimientos
- `screen-compromisos.jsx` — Compromisos
- `screen-objetivos.jsx` — Objetivos
- `screen-inversiones.jsx` — Inversiones

Para verificar visualmente: `design_handoff_chanchito/prototypes/Chanchito App.html` en el navegador.

## TypeScript
- Tipos de `types/database.ts`. Nunca `any`.
- Imports absolutos: `@/components/...`, `@/lib/...`
- Schemas Zod en `lib/schemas/` + React Hook Form + `@hookform/resolvers`.

## Deploy
- `master` → producción automática en Vercel (Supabase PROD).
- `.env.local` → Supabase DEV.
- Cambios de schema SQL: aplicar a PROD **antes** del merge.
