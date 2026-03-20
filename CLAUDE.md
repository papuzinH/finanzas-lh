# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
npm run dev      # Servidor de desarrollo con Turbopack
npm run build    # Build de producción con Webpack (next build --webpack)
npm run lint     # ESLint
npm run start    # Servidor de producción
```

> No hay tests configurados en este proyecto.

## Arquitectura

**Chanchito** es una PWA de finanzas personales construida con Next.js App Router, Supabase (PostgreSQL + Auth) y Zustand para estado global.

### Regla cardinal: Server vs. Client

- Todos los archivos en `app/` son Server Components por defecto.
- Solo usar `'use client'` cuando se necesiten hooks (`useState`, `useEffect`, `useFinanceStore`) o event listeners.
- **Server Components** → fetch directo con `utils/supabase/server.ts`.
- **Client Components** → NUNCA fetch directo; consumir estado via `useFinanceStore`.
- Prohibido: `useEffect` para fetching, SWR o React Query (salvo que se pida explícitamente).

### Estado global: `lib/store/financeStore.ts`

Es la única fuente de verdad del lado cliente. **Leer este archivo antes de modificar cualquier componente** para verificar si ya existe un selector/getter.

**Regla crítica:** Toda la lógica de negocio (sumas, cálculos, porcentajes) va en el store, NO en los componentes.

Getters principales disponibles:
- `getPortfolioStatus()` – análisis del portafolio de inversiones
- `getGlobalBalance()` – balance total
- `getMonthlyBurnRate()` – suma de planes recurrentes activos
- `getInstallmentStatus(planId)` – progreso de pago de cuotas
- `getPaymentMethodStatus(methodId)` – lógica compleja de ciclo de tarjeta de crédito vs débito/efectivo
- `getExpensesByCategory(scope)` – desglose por categoría
- `getMonthlyBalance(monthStr, methodId)` – balance mensual

`fetchAllData()` carga todo en paralelo (Promise.all) desde Supabase y además consulta la API del dólar blue (no-blocking).

### Procesamiento de fechas y ciclos de tarjeta

Hay lógica especial para cuotas de tarjeta de crédito:
- `periodDate` – fecha visual para agrupar en vistas mensuales (puede diferir de la fecha real)
- `realPaymentDate` – fecha real de la transacción
- `isExpenseInCurrentMonthScope()` – determina si un gasto pertenece al "mes actual" según el ciclo de cierre/pago de la tarjeta
- Usar siempre `parseLocalDate()` de `lib/utils/dates.ts` para evitar bugs de timezone UTC

### UI: Neo-Bank estética

- **Tema:** Dark mode por defecto. `bg-slate-950`, `text-slate-50`, acentos Indigo/Violet.
- **Componentes:** Shadcn UI siempre (nunca `<div>` crudo si existe un `<Card>`).
- **Íconos:** `lucide-react`, importar íconos específicos.
- **Responsividad:** Mobile-first. `w-full` en mobile, `md:w-auto` en desktop.

### TypeScript

- Tipos de `types/database.ts` (auto-generados de Supabase). Nunca `any`.
- Imports absolutos: `@/components/...`, `@/lib/...`, etc.
- Variables de entorno públicas: `process.env.NEXT_PUBLIC_*`.

### Validación

Schemas Zod en `lib/schemas/` para cada entidad (transaction, installment-plan, payment-method, category, investment, subscription). Usados con React Hook Form + `@hookform/resolvers`.

### Pipeline de despliegue

- Branch `master` → producción automática en Vercel (base de datos PROD de Supabase).
- `.env.local` apunta a Supabase DEV durante desarrollo.
- PRs generan preview URLs de Vercel conectadas a base DEV.
- Los cambios de schema SQL deben aplicarse a PROD antes de hacer merge.
