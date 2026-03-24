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
- Dark mode: `bg-surface`, `text-slate-50`, acentos Indigo/Violet.
- Shadcn UI siempre (nunca `<div>` crudo si existe `<Card>`).
- Íconos: `lucide-react` (importar específicos).
- Mobile-first: `w-full` → `md:w-auto`.

## TypeScript
- Tipos de `types/database.ts`. Nunca `any`.
- Imports absolutos: `@/components/...`, `@/lib/...`
- Schemas Zod en `lib/schemas/` + React Hook Form + `@hookform/resolvers`.

## Deploy
- `master` → producción automática en Vercel (Supabase PROD).
- `.env.local` → Supabase DEV.
- Cambios de schema SQL: aplicar a PROD **antes** del merge.
