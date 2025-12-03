# GitHub Copilot Instructions for finanzas-lh

## Project Overview
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4, Framer Motion, Lucide React
- **State Management**: Zustand
- **Backend**: Supabase (Auth & Database)
- **Charts**: Recharts
- **Date Handling**: date-fns

## Architecture & State Management
- **Central Store**: `src/lib/store/financeStore.ts` is the source of truth.
  - **Pattern**: "Big Fetch" - `fetchAllData` loads transactions, installments, payment methods, and recurring plans simultaneously.
  - **Computed Logic**: Use store getters (e.g., `getInstallmentStatus`, `getGlobalBalance`) rather than recalculating in components.
- **Data Flow**: 
  1. Components call `fetchAllData` on mount (usually in a top-level effect or layout).
  2. Store processes raw data (e.g., adjusting credit card dates).
  3. Components subscribe to specific slices of the store.

## Critical Business Logic
- **Credit Card Dates**: 
  - In `financeStore.ts`, transactions made with credit cards (`type === 'credit'`) have their `date` adjusted to the **payment due date**, not the purchase date.
  - Logic depends on `default_closing_day` and `default_payment_day`.
- **Installments**:
  - A plan is "paid" based on whether the calculated payment dates of its child transactions are `<= today`.
  - Use `getInstallmentStatus(planId)` to get progress, remaining amount, and finished status.

## Supabase Integration
- **Clients**:
  - Client-side: `import { createClient } from '@/utils/supabase/client'`
  - Server-side: `import { createClient } from '@/utils/supabase/server'`
- **Types**: Use `Database` types from `@/types/database` (or `supabase.ts`).

## Styling & UI
- **Tailwind v4**: Use the new v4 features (CSS variables for theme values).
- **Components**: 
  - Shared UI components live in `src/components/ui`.
  - Feature-specific components live in `src/components` or within `src/app/(feature)/components`.
- **Animations**: Use `framer-motion` for transitions (e.g., `motion-card.tsx`).

## Developer Workflows
- **Dev Server**: `npm run dev`
- **Linting**: `npm run lint`
- **Imports**: Use absolute imports with `@/` (e.g., `@/lib/utils`).

## Common Patterns
- **Currency**: Handle amounts as `number` in logic, format only for display.
- **Dates**: Use `date-fns` for all date manipulation.
- **Async Data**: Handle `isLoading` and `error` states from the store in UI components.
