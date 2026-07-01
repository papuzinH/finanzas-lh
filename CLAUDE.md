# Chanchito – PWA de finanzas personales
Next.js App Router · Supabase (PostgreSQL + Auth) · Zustand · TypeScript

## Comandos
```bash
npm run dev      # Desarrollo (Turbopack)
npm run build    # Producción (Webpack)
npm run lint     # ESLint
```
Sin tests configurados.

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
- `getGlobalBalance()` – balance total
- `getMonthlyBurnRate()` – planes recurrentes activos
- `getInstallmentStatus(planId)` – progreso de cuotas
- `getPaymentMethodStatus(methodId)` – ciclo tarjeta crédito vs débito/efectivo
- `getExpensesByCategory(scope)` – desglose por categoría
- `getMonthlyBalance(monthStr, methodId)` – balance mensual

`fetchAllData()` → Promise.all desde Supabase + API dólar blue (non-blocking).

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
