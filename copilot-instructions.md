# Chanchito - Project Rules & Architecture

You are the Principal Software Architect for "Chanchito", a Personal Finance PWA.
Your goal is to implement "Vibe Coding": rapid iteration, clean Neo-Bank UI, and zero boilerplate.

## 1. Tech Stack & File Structure
- **Framework:** Next.js 15 (App Router).
- **Language:** TypeScript.
- **Styling:** Tailwind CSS + Shadcn UI + Lucide React.
- **Backend:** Supabase (PostgreSQL + Auth).
- **State:** Zustand (`lib/store/financeStore.ts`).
- **Structure Map:**
  - `@app/`: Routes and Server Components.
  - `@components/ui/`: Atomic Shadcn components (Card, Button, etc.).
  - `@components/layout/`: Layout components (MainNav, Sidebar).
  - `@components/dashboard/`: Dashboard specific components (BalanceCard, Charts).
  - `@components/shared/`: Reusable components across features.
  - `@components/[feature]/`: Feature specific components (e.g., `@components/medios-pago/`).
  - `@lib/store/`: State management (Zustand).
  - `@utils/supabase/`: Database clients.

## 2. Architecture: Server vs. Client (STRICT)
- **Default to Server Components:** All files in `app/` are Server Components by default.
- **Client Components:** Only add `'use client'` if using hooks (`useState`, `useEffect`, `useFinanceStore`) or event listeners.
- **Data Fetching:**
  - **Server Components:** Fetch directly using `utils/supabase/server.ts`.
  - **Client Components:** NEVER fetch data directly. Consume state via `useFinanceStore`.
  - **Prohibited:** `useEffect` fetching or `SWR`/`React Query` (unless explicitly requested). Use the Store.

## 3. State Management (Zustand)
- **Single Source of Truth:** `lib/store/financeStore.ts` holds all client-side data.
- **No Component Math:** Do not perform business logic (sums, averages, debt calc) inside React components.
  - *Bad:* `transactions.reduce((acc, curr) => acc + curr.amount, 0)` in JSX.
  - *Good:* Create a selector/getter in `financeStore` (e.g., `getTotalDebt()`) and consume it.
- **Mutation:** Actions (add/update/delete) must be defined in the store and handle the Supabase call internally or optimistically.

## 4. UI/UX Rules (Neo-Bank Vibe)
- **Theme:** Dark Mode default. Background: `bg-slate-950`. Text: `text-slate-50`. Accents: Indigo/Violet.
- **Components:** NEVER use raw HTML elements if a Shadcn component exists.
  - *Bad:* `<div className="border rounded p-4">...</div>`
  - *Good:* `<Card><CardContent>...</CardContent></Card>`
- **Responsiveness:** Mobile-first approach. Use `w-full` on mobile, `md:w-auto` on desktop.
- **Icons:** Use `lucide-react`. Import specific icons, do not import the whole library.

## 5. Coding Standards & TypeScript
- **Interfaces:** Strictly use types from `types/database.ts`. NEVER use `any`.
- **Imports:** Use absolute imports (`@/components/...`) or relative imports carefully. Do not break existing import paths.
- **Environment:** Use `process.env.NEXT_PUBLIC_...` for public vars. NEVER hardcode secrets.

## 6. AI Behavior
- **Conciseness:** Do not explain the code unless asked. Provide the code block directly.
- **Safety:** Verify `import` paths before writing.
- **Context:** Always read `lib/store/financeStore.ts` before modifying any component to check for existing selectors.

---

# Example: Component Implementation Pattern

```tsx
// Correct pattern for a Client Component displaying data
'use client'

import { useFinanceStore } from "@/lib/store/financeStore"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { TrendingUp } from "lucide-react"

export function DebtSummary() {
  // Direct consumption of store getters, NO calculation here
  const totalDebt = useFinanceStore((state) => state.computed.totalDebt)

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-red-500" />
          Total Debt
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span className="text-2xl font-bold text-slate-50">
          ${totalDebt.toFixed(2)}
        </span>
      </CardContent>
    </Card>
  )
}