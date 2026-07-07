# Fundación Agéntica del Chatbot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el pipeline one-shot del chatbot por un agente tool-use multi-paso (Gemini 2.5 Flash) con toolbox determinista y `lib/finance/` como fuente única de cálculos cliente/servidor.

**Architecture:** Loop de function calling en `/api/chat`: el modelo elige tools tipadas (Zod) que consultan/mutan Supabase con lógica financiera extraída del store a funciones puras. Máx. 6 pasos, techo de tokens, confirmaciones stateless. Spec: `docs/superpowers/specs/2026-07-07-chatbot-asistente-ia-design.md`.

**Tech Stack:** Next.js App Router · Supabase · Gemini 2.5 Flash vía `@google/genai` (SDK nuevo) · Zod 4 (`z.toJSONSchema`) · Vitest · date-fns.

## Global Constraints

- Rama de trabajo: `feat/chatbot-asistente-ia`. Prefijar comandos con `rtk` (ej. `rtk git commit`, `rtk npx vitest run`).
- **Todo número sale del código, nunca del LLM.** Las tools calculan; el modelo orquesta y redacta.
- Modelo: `gemini-2.5-flash`. SDK destino: `@google/genai` (el actual `@google/generative-ai@0.24.1` queda desinstalado en Task 14).
- Loop: máx. **6 pasos**, techo **50.000 tokens** acumulados por mensaje, anti-bucle (misma tool + mismos args = corte), `maxDuration = 60`.
- Toda tool de lectura devuelve JSON compacto, máx. **20 filas**.
- Toda tool de escritura valida args con Zod antes de tocar la DB. El modelo nunca genera SQL.
- Fechas: SIEMPRE `parseLocalDate`/`formatLocalDate` de `@/lib/utils/dates`. Nunca `new Date(str)` ni `toISOString()` para fechas locales.
- TypeScript: nunca `any`; imports absolutos `@/...`; tipos de `types/database.ts`.
- Los tests existentes del store (`src/lib/store/__tests__/analysis-getters.test.ts`, `disponible-real.test.ts`) deben pasar **sin modificarse** tras cada task de la Fase 1. (`dates.test.ts` tiene fallas preexistentes ajenas: ignorarlas.)
- Gotcha de IDs (**verificado en Task 7 contra `types/database.ts`**): `transactions`/`payment_methods`/`recurring_plans`/`installment_plans` filtran por `user_id` **numérico** (`public.users.id`); `categories`/`internal_transfers`/`savings_goals`/`category_budgets` por **UUID** de auth (`ctx.authUserId`). Nota: `handlers.ts` tiene un BUG preexistente filtrando `categories` por id numérico (líneas ~1188/1210/1390/1428) — corregirlo al envolver esos handlers en Tasks 12-13.
- No tocar: `/api/chat/onboarding`, `src/lib/ai/onboarding*`, schema SQL (no hay migraciones en este plan).
- Commits frecuentes: un commit por task como mínimo, mensajes `feat(chat): ...` / `refactor(finance): ...` con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
src/lib/finance/                    ← NUEVO: funciones puras compartidas
  types.ts          ProcessedTransaction, DolarBlue, CreditCardCycleSummary
  creditCycle.ts    getCreditCycleDates, isExpenseInCurrentMonthScope, sameMonthYear
  prepare.ts        resolveRate, prepareTransactions, prepareRecurringPlans
  pending.ts        computePendingFixedExpenses
  balances.ts       computePaymentMethodStatus, hasCardPaymentInCycle,
                    computePendingCreditCards, computeGlobalBalance
  analysis.ts       computeExpensesByCategory, computeMonthlyBalance
  __tests__/        tests unitarios directos

src/lib/ai/tools/                   ← NUEVO: toolbox del agente
  types.ts          AgentContext, ToolDef, ToolResult
  schema.ts         zodToGeminiSchema
  registry.ts       allTools, getFunctionDeclarations, executeTool
  dataLoader.ts     loadFinanceData (fetch + prepare server-side)
  readTools.ts      10 tools de lectura
  writeTools.ts     11 tools de escritura
  appHelp.ts        diccionario de conceptos + tool get_app_help
  __tests__/

src/lib/ai/
  agent.ts          runAgent (loop) + adapter Gemini      ← NUEVO
  agentPrompt.ts    buildAgentPrompt (system prompt corto) ← NUEVO
  handlers.ts       ← RECORTADO: quedan solo los write-handlers reutilizados
  intentParser.ts   ← SE BORRA (Task 14)
  chatPrompt.ts     ← SE BORRA (Task 14)

src/app/api/chat/route.ts           ← REESCRITO (Task 14)
src/lib/store/financeStore.ts       ← getters se vuelven wrappers (Fase 1)
src/components/chat/TypingIndicator.tsx ← frases rotativas (Task 15)
src/app/actions/ai.ts, src/app/onboarding/actions.ts ← migración mecánica de SDK (Task 14)
```

---

# FASE 1 — `lib/finance/`: extracción de lógica pura

### Task 1: `lib/finance/types.ts` + `creditCycle.ts`

**Files:**
- Create: `src/lib/finance/types.ts`
- Create: `src/lib/finance/creditCycle.ts`
- Create: `src/lib/finance/__tests__/creditCycle.test.ts`
- Modify: `src/lib/store/financeStore.ts` (líneas 22-26 tipo, 481-569 helpers → borrar e importar)

**Interfaces:**
- Consumes: `PaymentMethod`, `Transaction` de `@/types/database`; `parseLocalDate` de `@/lib/utils/dates`.
- Produces:
  - `type ProcessedTransaction = Transaction & { periodDate: string; realPaymentDate: string }`
  - `sameMonthYear(a: Date, b: Date): boolean`
  - `getCreditCycleDates(method: PaymentMethod, now: Date): { nextClosingDate: Date; nextPaymentDate: Date } | undefined`
  - `isExpenseInCurrentMonthScope(t: ProcessedTransaction, methods: PaymentMethod[], now: Date): boolean`

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/finance/__tests__/creditCycle.test.ts
import { describe, it, expect } from 'vitest'
import { getCreditCycleDates, isExpenseInCurrentMonthScope, sameMonthYear } from '@/lib/finance/creditCycle'
import type { PaymentMethod } from '@/types/database'
import type { ProcessedTransaction } from '@/lib/finance/types'

const credit = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: 1, user_id: 1, name: 'Visa', type: 'credit',
  default_closing_day: 19, default_payment_day: 1,
  is_default: false, is_personal: false, created_at: '2025-01-01',
  ...over,
} as PaymentMethod)

describe('getCreditCycleDates', () => {
  it('el día exacto del vencimiento sigue siendo el ciclo vigente', () => {
    // vence el 1: hoy 1 de julio → nextPaymentDate = 1 de julio (no avanza)
    const cycle = getCreditCycleDates(credit(), new Date(2026, 6, 1))
    expect(cycle?.nextPaymentDate.getDate()).toBe(1)
    expect(cycle?.nextPaymentDate.getMonth()).toBe(6) // julio
  })

  it('pasado el vencimiento avanza al mes siguiente', () => {
    const cycle = getCreditCycleDates(credit(), new Date(2026, 6, 2))
    expect(cycle?.nextPaymentDate.getMonth()).toBe(7) // agosto
  })

  it('paymentDay <= closingDay: el cierre cae el mes anterior al pago', () => {
    const cycle = getCreditCycleDates(credit(), new Date(2026, 6, 1))
    expect(cycle?.nextClosingDate.getMonth()).toBe(5) // junio (cierre 19/6, vence 1/7)
    expect(cycle?.nextClosingDate.getDate()).toBe(19)
  })

  it('devuelve undefined para débito o crédito sin ciclo', () => {
    expect(getCreditCycleDates(credit({ type: 'debit' }), new Date())).toBeUndefined()
    expect(getCreditCycleDates(credit({ default_closing_day: null }), new Date())).toBeUndefined()
  })
})

describe('isExpenseInCurrentMonthScope', () => {
  const tx = (over: Partial<ProcessedTransaction>): ProcessedTransaction => ({
    id: 1, user_id: 1, description: 'x', amount: 100, date: '2026-07-05',
    type: 'expense', category_id: null, payment_method_id: 1,
    installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
    periodDate: '2026-07-05', realPaymentDate: '2026-07-05',
    ...over,
  } as ProcessedTransaction)

  it('excluye ingresos y pagos de tarjeta', () => {
    const now = new Date(2026, 6, 15)
    expect(isExpenseInCurrentMonthScope(tx({ type: 'income' }), [credit()], now)).toBe(false)
    expect(isExpenseInCurrentMonthScope(tx({ card_payment_for: 2 }), [credit()], now)).toBe(false)
  })

  it('cuota de crédito pertenece al mes de su vencimiento', () => {
    // cierra 19, vence 1 → cuota con date 2026-08-01, hoy 15 de julio:
    // paymentDateForThisCycle = 1 de agosto → SÍ pertenece
    const t = tx({ installment_plan_id: 9, date: '2026-08-01', periodDate: '2026-07-01' })
    expect(isExpenseInCurrentMonthScope(t, [credit()], new Date(2026, 6, 15))).toBe(true)
  })

  it('gasto común usa periodDate con mes calendario', () => {
    const t = tx({ periodDate: '2026-06-20' })
    expect(isExpenseInCurrentMonthScope(t, [credit()], new Date(2026, 6, 15))).toBe(false)
  })
})

describe('sameMonthYear', () => {
  it('compara mes y año', () => {
    expect(sameMonthYear(new Date(2026, 6, 1), new Date(2026, 6, 31))).toBe(true)
    expect(sameMonthYear(new Date(2026, 6, 1), new Date(2025, 6, 1))).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `rtk npx vitest run src/lib/finance/__tests__/creditCycle.test.ts`
Expected: FAIL — "Cannot find module '@/lib/finance/creditCycle'"

- [ ] **Step 3: Crear `types.ts` y `creditCycle.ts` moviendo el código del store**

```ts
// src/lib/finance/types.ts
import type { Transaction } from '@/types/database'

/** Transacción con campos de procesamiento (periodDate visual + fecha real de pago). */
export type ProcessedTransaction = Transaction & {
  periodDate: string
  realPaymentDate: string
}

export interface DolarBlue {
  compra: number
  venta: number
  fechaActualizacion: string
}

export type CreditCardCycleSummary = {
  methodId: number
  name: string
  total: number
  totalARS: number
  totalUSD: number
  nextPaymentDate: Date
  isCycleClosed: boolean
  isPending: boolean
  isPaidManually: boolean
}
```

`creditCycle.ts`: mover **verbatim** desde `financeStore.ts` las funciones `isExpenseInCurrentMonthScope` (líneas 481-524, con su docstring 455-480), `sameMonthYear` (526-528) y `getCreditCycleDates` (530-569, con docstring), convirtiéndolas en `export function`. Cabecera del archivo:

```ts
// src/lib/finance/creditCycle.ts
import { addMonths, setDate, subMonths, isBefore, startOfDay } from 'date-fns'
import { parseLocalDate } from '@/lib/utils/dates'
import type { PaymentMethod } from '@/types/database'
import type { ProcessedTransaction } from './types'

// ... funciones movidas verbatim, ahora con `export` ...
```

- [ ] **Step 4: Rewire del store**

En `financeStore.ts`:
1. Borrar el tipo local `ProcessedTransaction` (líneas 22-26) y las tres funciones movidas (455-569).
2. Agregar imports y re-export (por si otros módulos consumen el tipo desde el store):

```ts
import {
  getCreditCycleDates,
  isExpenseInCurrentMonthScope,
  sameMonthYear,
} from '@/lib/finance/creditCycle'
import type { ProcessedTransaction, CreditCardCycleSummary as CreditCardCycleSummaryType } from '@/lib/finance/types'

export type { ProcessedTransaction } from '@/lib/finance/types'
```

3. Reemplazar la definición local de `CreditCardCycleSummary` (líneas 77-87) por `export type CreditCardCycleSummary = CreditCardCycleSummaryType` (mantiene el import path actual de los componentes).
4. Verificar consumidores externos: `rtk grep "from '@/lib/store/financeStore'" src | grep -E "ProcessedTransaction|CreditCardCycleSummary"` — deben seguir compilando gracias a los re-exports.

- [ ] **Step 5: Verificar verde y commitear**

Run: `rtk npx vitest run src/lib/finance src/lib/store && rtk npx tsc --noEmit`
Expected: PASS creditCycle.test + tests del store intactos; tsc sin errores.

```bash
rtk git add src/lib/finance src/lib/store/financeStore.ts
rtk git commit -m "refactor(finance): extraer ciclo de tarjeta a lib/finance/creditCycle"
```

---

### Task 2: `lib/finance/prepare.ts` — pipeline de preparación de datos

**Files:**
- Create: `src/lib/finance/prepare.ts`
- Create: `src/lib/finance/__tests__/prepare.test.ts`
- Modify: `src/lib/store/financeStore.ts` (líneas 46-75 `DolarBlue`/`resolveRate`, 761-806 procesamiento en `fetchAllData`)

**Interfaces:**
- Consumes: `ProcessedTransaction`, `DolarBlue` de `./types`; `parseLocalDate` de `@/lib/utils/dates`.
- Produces:
  - `resolveRate(pair: string | null, exchangeRates: ExchangeRate[], dolarBlue: DolarBlue | null, fallback?: number | null): number`
  - `prepareTransactions(raw: Transaction[], methods: PaymentMethod[], exchangeRates: ExchangeRate[], dolarBlue: DolarBlue | null): ProcessedTransaction[]`
  - `prepareRecurringPlans(raw: RecurringPlan[], exchangeRates: ExchangeRate[], dolarBlue: DolarBlue | null): RecurringPlan[]`

- [ ] **Step 1: Test que falla**

```ts
// src/lib/finance/__tests__/prepare.test.ts
import { describe, it, expect } from 'vitest'
import { prepareTransactions, prepareRecurringPlans, resolveRate } from '@/lib/finance/prepare'
import type { Transaction, PaymentMethod, RecurringPlan } from '@/types/database'

const visa = {
  id: 1, name: 'Visa', type: 'credit',
  default_closing_day: 19, default_payment_day: 1,
} as PaymentMethod

describe('prepareTransactions', () => {
  it('crédito con paymentDay < closingDay: periodDate retrocede un mes', () => {
    const raw = [{ id: 1, date: '2026-08-01', amount: 100, payment_method_id: 1, type: 'expense' }] as Transaction[]
    const [t] = prepareTransactions(raw, [visa], [], null)
    expect(t.periodDate).toBe('2026-07-01')
    expect(t.realPaymentDate).toBe('2026-08-01')
  })

  it('convierte USD a ARS con resolveRate', () => {
    const raw = [{
      id: 1, date: '2026-07-05', amount: 0, payment_method_id: null, type: 'expense',
      original_currency: 'USD', original_amount: 10, rate_pair: null, exchange_rate: 1200,
    }] as unknown as Transaction[]
    const [t] = prepareTransactions(raw, [], [], null)
    expect(t.amount).toBe(12000) // fallback al snapshot exchange_rate
  })
})

describe('prepareRecurringPlans', () => {
  it('plan en USD queda con amount en ARS', () => {
    const raw = [{ id: 1, amount: 0, currency: 'USD', original_amount: 5, rate_pair: null, exchange_rate: 1000 }] as unknown as RecurringPlan[]
    const [p] = prepareRecurringPlans(raw, [], null)
    expect(p.amount).toBe(5000)
  })
})

describe('resolveRate', () => {
  it('prioridad: par exacto → blue → fallback → 1', () => {
    expect(resolveRate('USD_BLUE', [{ pair: 'USD_BLUE', rate: 1300 }] as never, null)).toBe(1300)
    expect(resolveRate(null, [], { compra: 1, venta: 1250, fechaActualizacion: '' })).toBe(1250)
    expect(resolveRate(null, [], null, 1100)).toBe(1100)
    expect(resolveRate(null, [], null)).toBe(1)
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `rtk npx vitest run src/lib/finance/__tests__/prepare.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `prepare.ts`**

Mover `resolveRate` (financeStore 52-69) verbatim. `DolarBlue` ya vive en `types.ts` (Task 1): borrar la interface local del store e importarla. Implementar los prepare extrayendo la lógica de `fetchAllData` (763-806):

```ts
// src/lib/finance/prepare.ts
import { format, getDate, subMonths } from 'date-fns'
import { parseLocalDate } from '@/lib/utils/dates'
import type { Transaction, PaymentMethod, RecurringPlan, ExchangeRate } from '@/types/database'
import type { ProcessedTransaction, DolarBlue } from './types'

export function resolveRate(/* movido verbatim del store */) { /* ... */ }

/**
 * Convierte filas crudas de `transactions` en ProcessedTransaction:
 * calcula periodDate (mes visual según ciclo de crédito) y normaliza amount a ARS.
 * Misma lógica que usaba fetchAllData — extraída para que el servidor la comparta.
 */
export function prepareTransactions(
  raw: Transaction[],
  methods: PaymentMethod[],
  exchangeRates: ExchangeRate[],
  dolarBlue: DolarBlue | null,
): ProcessedTransaction[] {
  return raw.map((t) => {
    const method = methods.find((m) => m.id === t.payment_method_id)
    let periodDate = t.date

    if (method && method.type === 'credit') {
      const localTDate = parseLocalDate(t.date)
      const dayOfMonth = getDate(localTDate)
      if (
        method.default_payment_day &&
        method.default_closing_day &&
        method.default_payment_day < method.default_closing_day &&
        dayOfMonth <= method.default_payment_day + 2
      ) {
        periodDate = format(subMonths(localTDate, 1), 'yyyy-MM-dd')
      }
    }

    const amountArs =
      t.original_currency === 'USD' && t.original_amount != null
        ? t.original_amount * resolveRate(t.rate_pair, exchangeRates, dolarBlue, t.exchange_rate)
        : t.amount

    return { ...t, amount: amountArs, periodDate, realPaymentDate: t.date }
  })
}

export function prepareRecurringPlans(
  raw: RecurringPlan[],
  exchangeRates: ExchangeRate[],
  dolarBlue: DolarBlue | null,
): RecurringPlan[] {
  return raw.map((plan) => {
    if (plan.currency === 'USD' && plan.original_amount != null) {
      const rate = resolveRate(plan.rate_pair, exchangeRates, dolarBlue, plan.exchange_rate)
      return { ...plan, amount: plan.original_amount * rate }
    }
    return plan
  })
}
```

- [ ] **Step 4: Rewire de `fetchAllData` + re-export**

En `financeStore.ts`: borrar `resolveRate` y la interface `DolarBlue` locales; agregar `export { resolveRate } from '@/lib/finance/prepare'` e `import type { DolarBlue } from '@/lib/finance/types'`. Reemplazar el bloque 763-806 por:

```ts
const processedTransactions = prepareTransactions(rawTransactions, methods, (exchangeRatesData as ExchangeRate[]) || [], dolarBlue)
const recomputedRecurring = prepareRecurringPlans(((recurring as RecurringPlan[]) || []), (exchangeRatesData as ExchangeRate[]) || [], dolarBlue)
```

Verificar consumidores de `resolveRate`/`parseInflation`: `rtk grep "resolveRate\|parseInflation" src --files-with-matches` y ajustar imports si alguno importaba desde el store (el re-export los cubre).

- [ ] **Step 5: Verde + commit**

Run: `rtk npx vitest run src/lib/finance src/lib/store && rtk npx tsc --noEmit`
Expected: PASS.

```bash
rtk git add -A src/lib
rtk git commit -m "refactor(finance): extraer pipeline de preparación de datos a lib/finance/prepare"
```

---

### Task 3: `lib/finance/pending.ts`

**Files:**
- Create: `src/lib/finance/pending.ts`
- Create: `src/lib/finance/__tests__/pending.test.ts`
- Modify: `src/lib/store/financeStore.ts:1608-1630` (getter → wrapper)

**Interfaces:**
- Produces: `computePendingFixedExpenses(recurringPlans: RecurringPlan[], transactions: ProcessedTransaction[], now?: Date): { total: number; items: Array<{ id: number; name: string; amount: number }> }`

- [ ] **Step 1: Test que falla**

```ts
// src/lib/finance/__tests__/pending.test.ts
import { describe, it, expect } from 'vitest'
import { computePendingFixedExpenses } from '@/lib/finance/pending'
import type { RecurringPlan } from '@/types/database'
import type { ProcessedTransaction } from '@/lib/finance/types'

const plan = (id: number, amount: number, active = true) =>
  ({ id, description: `Plan ${id}`, amount, is_active: active }) as RecurringPlan

describe('computePendingFixedExpenses', () => {
  const now = new Date(2026, 6, 15) // julio 2026

  it('plan activo sin transacción este mes está pendiente', () => {
    const r = computePendingFixedExpenses([plan(1, 5000)], [], now)
    expect(r.total).toBe(5000)
    expect(r.items).toEqual([{ id: 1, name: 'Plan 1', amount: 5000 }])
  })

  it('plan con transacción del mes (por periodDate) NO está pendiente', () => {
    const tx = { recurring_plan_id: 1, periodDate: '2026-07-03', date: '2026-07-03' } as ProcessedTransaction
    expect(computePendingFixedExpenses([plan(1, 5000)], [tx], now).total).toBe(0)
  })

  it('planes inactivos no cuentan', () => {
    expect(computePendingFixedExpenses([plan(1, 5000, false)], [], now).total).toBe(0)
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `rtk npx vitest run src/lib/finance/__tests__/pending.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

Mover la lógica de `getPendingFixedExpenses` (store 1608-1630) parametrizando estado y fecha:

```ts
// src/lib/finance/pending.ts
import { format } from 'date-fns'
import type { RecurringPlan } from '@/types/database'
import type { ProcessedTransaction } from './types'

export function computePendingFixedExpenses(
  recurringPlans: RecurringPlan[],
  transactions: ProcessedTransaction[],
  now: Date = new Date(),
): { total: number; items: Array<{ id: number; name: string; amount: number }> } {
  const currentMonth = format(now, 'yyyy-MM')

  const items = recurringPlans
    .filter((p) => p.is_active)
    .filter((plan) => {
      const hasTransactionThisMonth = transactions.some(
        (t) =>
          t.recurring_plan_id === plan.id &&
          (t.periodDate || t.date)?.slice(0, 7) === currentMonth,
      )
      return !hasTransactionThisMonth
    })
    .map((plan) => ({
      id: plan.id,
      name: plan.description,
      amount: Math.abs(Number(plan.amount)),
    }))

  const total = items.reduce((acc, i) => acc + i.amount, 0)
  return { total, items }
}
```

Wrapper en el store:

```ts
getPendingFixedExpenses: () => {
  const { recurringPlans, transactions } = get();
  return computePendingFixedExpenses(recurringPlans, transactions);
},
```

- [ ] **Step 4: Verde**

Run: `rtk npx vitest run src/lib/finance src/lib/store` → PASS (disponible-real.test.ts intacto).

- [ ] **Step 5: Commit**

```bash
rtk git add -A src/lib
rtk git commit -m "refactor(finance): extraer mensualidades pendientes a lib/finance/pending"
```

---

### Task 4: `lib/finance/balances.ts` — tarjetas y balance global

**Files:**
- Create: `src/lib/finance/balances.ts`
- Create: `src/lib/finance/__tests__/balances.test.ts`
- Modify: `src/lib/store/financeStore.ts` — `getGlobalBalance` (1173-1224), `isCreditCardCyclePaid` (1315-1326), `getPaymentMethodStatus` (1328-1445), `getPendingCreditCardByCard` (1447-1488) → wrappers.

**Interfaces:**
- Consumes: Task 1 (`creditCycle.ts`, `types.ts`), Task 3 (`computePendingFixedExpenses`).
- Produces:

```ts
export interface PaymentMethodStatus {
  currentConsumption: number; fixedCosts: number; projectedTotal: number;
  nextClosingDate?: Date; nextPaymentDate?: Date; usdExpenses: number; arsExpenses: number;
}
export function computePaymentMethodStatus(method: PaymentMethod | undefined, transactions: ProcessedTransaction[], recurringPlans: RecurringPlan[], now: Date): PaymentMethodStatus
export function hasCardPaymentInCycle(transactions: ProcessedTransaction[], method: PaymentMethod, now: Date): boolean
export function computePendingCreditCards(paymentMethods: PaymentMethod[], transactions: ProcessedTransaction[], recurringPlans: RecurringPlan[], now: Date): CreditCardCycleSummary[]
export function computeGlobalBalance(transactions: ProcessedTransaction[], paymentMethods: PaymentMethod[], internalTransfers: InternalTransfer[], pendingFixedTotal: number, now: Date): number
```

- [ ] **Step 1: Test que falla** — cubrir los invariantes documentados en CLAUDE.md:

```ts
// src/lib/finance/__tests__/balances.test.ts
import { describe, it, expect } from 'vitest'
import { computePaymentMethodStatus, computeGlobalBalance, computePendingCreditCards, hasCardPaymentInCycle } from '@/lib/finance/balances'
// fixtures: reutilizar los builders credit()/tx() del test de creditCycle (duplicarlos acá,
// son ~15 líneas; NO crear un helper compartido todavía — YAGNI hasta el tercer uso)

describe('computePaymentMethodStatus (crédito)', () => {
  it('suma al ciclo solo tx cuyo t.date cae en el mes de nextPaymentDate; separa ARS/USD', () => { /* tarjeta cierre 19 vence 1; tx date 2026-08-01 ARS 1000 y USD (original_amount 10, amount 12000); hoy 2026-07-15 → projectedTotal -13000, arsExpenses 1000, usdExpenses 10 */ })
  it('mensualidad adherida sin tx en el ciclo se suma; con tx en el ciclo NO se duplica', () => { /* plan amount 2000 payment_method_id 1 → suma; luego agregar tx con recurring_plan_id del plan en el ciclo → total no cambia */ })
  it('reintegros (income del ciclo) restan', () => { /* income 500 en el ciclo → projectedTotal sube 500 */ })
})

describe('computePaymentMethodStatus (débito)', () => {
  it('saldo histórico ingresos − gastos, cuotas hasta fin de mes', () => { /* income 10000, gasto 3000, cuota date fin de mes 1000 → 6000 */ })
})

describe('computeGlobalBalance', () => {
  it('resta mensualidades históricas + pendientes del mes (no el burn rate)', () => { /* income 100k, tx recurring pagada mes pasado 10k, pendingFixedTotal 10k → 80k */ })
  it('excluye pagos de tarjeta (card_payment_for) del gasto', () => { /* gasto con card_payment_for no resta */ })
  it('cuotas futuras no restan; cuota del mes según ciclo sí', () => { /* cuota date mes+2 → no resta */ })
})

describe('computePendingCreditCards', () => {
  it('isPending true hasta el día del vencimiento inclusive; isPaidManually si hay card_payment_for en el mes del vencimiento', () => { /* ... */ })
  it('isCycleClosed cuando el cierre ya pasó', () => { /* ... */ })
})
```

Escribir los cuerpos completos de los tests con los fixtures (el implementador expande los comentarios en asserts reales usando los mismos builders del Task 1).

- [ ] **Step 2: Verificar que falla** → `rtk npx vitest run src/lib/finance/__tests__/balances.test.ts` → FAIL.

- [ ] **Step 3: Implementar `balances.ts`**

Mover los cuerpos de los getters del store parametrizando `get()` por argumentos:
- `computePaymentMethodStatus`: cuerpo de `getPaymentMethodStatus` (1328-1445) reemplazando `const { transactions, recurringPlans, paymentMethods } = get()` y el lookup del método por los parámetros. Importa `getCreditCycleDates`, `sameMonthYear`, `parseLocalDate`, `endOfMonth`.
- `hasCardPaymentInCycle`: cuerpo de `isCreditCardCyclePaid` (1315-1326) parametrizado (recibe `method`, no `methodId`).
- `computePendingCreditCards`: cuerpo de `getPendingCreditCardByCard` (1447-1488), usando `computePaymentMethodStatus` y `hasCardPaymentInCycle` en lugar de `get().…`.
- `computeGlobalBalance`: cuerpo de `getGlobalBalance` (1173-1224); el término de mensualidades usa el parámetro `pendingFixedTotal` en lugar de `getPendingFixedExpenses().total`.

Wrappers en el store (API pública idéntica):

```ts
getGlobalBalance: () => {
  const { transactions, paymentMethods, internalTransfers, getPendingFixedExpenses } = get();
  return computeGlobalBalance(transactions, paymentMethods, internalTransfers, getPendingFixedExpenses().total, new Date());
},
getPaymentMethodStatus: (methodId: number) => {
  const { transactions, recurringPlans, paymentMethods } = get();
  return computePaymentMethodStatus(paymentMethods.find((m) => m.id === methodId), transactions, recurringPlans, new Date());
},
isCreditCardCyclePaid: (methodId: number) => {
  const { transactions, paymentMethods } = get();
  const method = paymentMethods.find((m) => m.id === methodId);
  return method ? hasCardPaymentInCycle(transactions, method, new Date()) : false;
},
getPendingCreditCardByCard: () => {
  const { paymentMethods, transactions, recurringPlans } = get();
  return computePendingCreditCards(paymentMethods, transactions, recurringPlans, new Date());
},
```

- [ ] **Step 4: Verde** — `rtk npx vitest run src/lib/finance src/lib/store && rtk npx tsc --noEmit` → PASS. **Los tests de `disponible-real.test.ts` sin tocar son el gate de esta task.**

- [ ] **Step 5: Commit**

```bash
rtk git add -A src/lib
rtk git commit -m "refactor(finance): extraer balances y ciclos de tarjeta a lib/finance/balances"
```

---

### Task 5: `lib/finance/analysis.ts`

**Files:**
- Create: `src/lib/finance/analysis.ts`
- Create: `src/lib/finance/__tests__/analysis.test.ts`
- Modify: `src/lib/store/financeStore.ts` — `getExpensesByCategory` (1540-1565), `getMonthlyBalance` (1567-1606) → wrappers.

**Interfaces:**
- Produces:
  - `computeExpensesByCategory(transactions: ProcessedTransaction[], paymentMethods: PaymentMethod[], categories: Category[], scope: 'global' | 'current_month', type: 'income' | 'expense', now: Date): Record<string, number>`
  - `computeMonthlyBalance(transactions: ProcessedTransaction[], recurringPlans: RecurringPlan[], monthStr: string, paymentMethodId: string, now: Date): number`

- [ ] **Step 1: Test que falla** — casos: agrupa por nombre de categoría con fallback `'Otros'`; excluye `card_payment_for`; scope `current_month` usa ciclo para gastos y mes calendario para ingresos; `computeMonthlyBalance` resta planes recurrentes sin transacción solo en el mes actual. Escribir asserts completos con los mismos builders de fixtures.

- [ ] **Step 2: Verificar que falla** → FAIL módulo inexistente.

- [ ] **Step 3: Implementar** — mover cuerpos de los dos getters parametrizando `get()`. Wrappers en el store igual que Task 4.

- [ ] **Step 4: Verde** — `rtk npx vitest run src/lib/finance src/lib/store && rtk npx tsc --noEmit` → PASS (gate: `analysis-getters.test.ts` intacto).

- [ ] **Step 5: Commit** — `rtk git commit -m "refactor(finance): extraer análisis por categoría y balance mensual"`

---

# FASE 2 — Toolbox del agente

### Task 6: Infraestructura de tools (`types.ts`, `schema.ts`, `registry.ts`)

**Files:**
- Create: `src/lib/ai/tools/types.ts`, `src/lib/ai/tools/schema.ts`, `src/lib/ai/tools/registry.ts`
- Create: `src/lib/ai/tools/__tests__/registry.test.ts`

**Interfaces:**
- Produces:

```ts
// types.ts
export interface AgentContext {
  supabase: SupabaseClient   // cliente del usuario autenticado (RLS)
  userId: number             // public.users.id (transactions, payment_methods, …)
  authUserId: string         // UUID de auth (savings_goals, category_budgets, …)
  today: string              // YYYY-MM-DD local
}
export interface ToolResult { ok: boolean; data?: unknown; error?: string; mutated?: boolean }
export interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string
  description: string        // en español, orientada al modelo: cuándo usarla y qué devuelve
  kind: 'read' | 'write'
  schema: S
  execute: (args: z.infer<S>, ctx: AgentContext) => Promise<ToolResult>
}
// schema.ts
export function zodToGeminiSchema(schema: z.ZodTypeAny): Record<string, unknown>
// registry.ts
export const allTools: ToolDef[]                     // se llena en Tasks 8-13
export function getFunctionDeclarations(): Array<{ name: string; description: string; parameters: Record<string, unknown> }>
export async function executeTool(name: string, rawArgs: unknown, ctx: AgentContext): Promise<ToolResult>
```

- [ ] **Step 1: Test que falla**

```ts
// src/lib/ai/tools/__tests__/registry.test.ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { zodToGeminiSchema } from '@/lib/ai/tools/schema'
import { executeToolWith } from '@/lib/ai/tools/registry'
import type { ToolDef, AgentContext } from '@/lib/ai/tools/types'

const ctx = {} as AgentContext

const echoTool: ToolDef = {
  name: 'echo', description: 'test', kind: 'read',
  schema: z.object({ msg: z.string() }),
  execute: async (args) => ({ ok: true, data: args }),
}

describe('zodToGeminiSchema', () => {
  it('produce JSON Schema sin $schema ni additionalProperties', () => {
    const s = zodToGeminiSchema(z.object({ a: z.string().describe('la a'), b: z.number().optional() }))
    expect(s.$schema).toBeUndefined()
    expect(s.additionalProperties).toBeUndefined()
    expect(s.type).toBe('object')
    expect((s.properties as Record<string, { description?: string }>).a.description).toBe('la a')
    expect(s.required).toEqual(['a'])
  })
})

describe('executeToolWith', () => {
  it('valida args con Zod y ejecuta', async () => {
    const r = await executeToolWith([echoTool], 'echo', { msg: 'hola' }, ctx)
    expect(r).toEqual({ ok: true, data: { msg: 'hola' } })
  })
  it('args inválidos → error legible, nunca throw', async () => {
    const r = await executeToolWith([echoTool], 'echo', { msg: 42 }, ctx)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('msg')
  })
  it('tool inexistente → error', async () => {
    const r = await executeToolWith([echoTool], 'nope', {}, ctx)
    expect(r.ok).toBe(false)
  })
  it('excepción dentro de execute → capturada como error', async () => {
    const boom: ToolDef = { ...echoTool, name: 'boom', execute: async () => { throw new Error('db down') } }
    const r = await executeToolWith([boom], 'boom', { msg: 'x' }, ctx)
    expect(r).toEqual({ ok: false, error: 'db down' })
  })
})
```

- [ ] **Step 2: Verificar que falla** → FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/ai/tools/schema.ts
import { z } from 'zod'

/** Limpia recursivamente claves que Gemini no acepta en function declarations. */
function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean)
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) {
      if (k === '$schema' || k === 'additionalProperties') continue
      out[k] = clean(v)
    }
    return out
  }
  return node
}

export function zodToGeminiSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return clean(z.toJSONSchema(schema)) as Record<string, unknown>
}
```

```ts
// src/lib/ai/tools/registry.ts
import type { AgentContext, ToolDef, ToolResult } from './types'
import { zodToGeminiSchema } from './schema'

// Tasks 8-13 agregan sus tools a este array vía los spreads.
export const allTools: ToolDef[] = []

export function getFunctionDeclarations(tools: ToolDef[] = allTools) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: zodToGeminiSchema(t.schema),
  }))
}

/** Variante inyectable para tests; executeTool usa el registro global. */
export async function executeToolWith(
  tools: ToolDef[],
  name: string,
  rawArgs: unknown,
  ctx: AgentContext,
): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === name)
  if (!tool) return { ok: false, error: `Tool desconocida: ${name}` }

  const parsed = tool.schema.safeParse(rawArgs ?? {})
  if (!parsed.success) {
    return { ok: false, error: `Argumentos inválidos: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` }
  }

  try {
    return await tool.execute(parsed.data, ctx)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error inesperado en la tool' }
  }
}

export function executeTool(name: string, rawArgs: unknown, ctx: AgentContext) {
  return executeToolWith(allTools, name, rawArgs, ctx)
}
```

`types.ts` como está arriba en Interfaces (imports: `SupabaseClient` de `@supabase/supabase-js`, `z` de `zod`).

- [ ] **Step 4: Verde** — `rtk npx vitest run src/lib/ai/tools` → PASS.
- [ ] **Step 5: Commit** — `rtk git commit -m "feat(chat): infraestructura del toolbox del agente (registry + zod→gemini)"`

---

### Task 7: `dataLoader.ts` — snapshot financiero server-side

**Files:**
- Create: `src/lib/ai/tools/dataLoader.ts`
- Create: `src/lib/ai/tools/__tests__/dataLoader.test.ts`

**Interfaces:**
- Consumes: `prepareTransactions`, `prepareRecurringPlans` (Task 2); `AgentContext` (Task 6).
- Produces:

```ts
export interface FinanceData {
  transactions: ProcessedTransaction[]
  paymentMethods: PaymentMethod[]
  recurringPlans: RecurringPlan[]
  internalTransfers: InternalTransfer[]
  categories: Category[]
  installmentPlans: InstallmentPlan[]
}
export async function loadFinanceData(ctx: AgentContext): Promise<FinanceData>
export async function fetchDolarBlue(): Promise<DolarBlue | null>  // timeout 2s, null en error
```

- [ ] **Step 0: Verificar el criterio de user_id de `categories`**

Leer `types/database.ts` (tipo `Category.user_id`) y confirmar contra una fila real si hace falta (`rtk grep "user_id" src/types/database.ts -n -A 2 -B 2`). Documentar el criterio en un comentario del dataLoader y usarlo consistentemente. Si `handleDelete` (caso `categoria`) usa el criterio equivocado, anotar `// BUG preexistente` — se corrige al envolverlo en Task 13.

- [ ] **Step 1: Test que falla** — con un mock encadenable de supabase (`from().select().eq()` → data fija): `loadFinanceData` devuelve transacciones procesadas (con `periodDate`) y planes en ARS; `fetchDolarBlue` devuelve `null` si `fetch` rechaza (mockear `global.fetch`).

- [ ] **Step 2: FAIL** → `rtk npx vitest run src/lib/ai/tools/__tests__/dataLoader.test.ts`

- [ ] **Step 3: Implementar**

```ts
// src/lib/ai/tools/dataLoader.ts
import { prepareTransactions, prepareRecurringPlans } from '@/lib/finance/prepare'
import type { DolarBlue } from '@/lib/finance/types'
import type { AgentContext } from './types'
// ... imports de tipos de database ...

export async function fetchDolarBlue(): Promise<DolarBlue | null> {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/blue', { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return null
    return (await res.json()) as DolarBlue
  } catch {
    return null // resolveRate cae al snapshot exchange_rate de cada fila
  }
}

export async function loadFinanceData(ctx: AgentContext): Promise<FinanceData> {
  const { supabase, userId } = ctx
  const [tx, pm, rp, it, cat, ip, er, blue] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', userId),
    supabase.from('payment_methods').select('*').eq('user_id', userId),
    supabase.from('recurring_plans').select('*').eq('user_id', userId),
    supabase.from('internal_transfers').select('*').eq('user_id', userId),
    supabase.from('categories').select('*'), // RLS filtra; ver criterio user_id del Step 0
    supabase.from('installment_plans').select('*').eq('user_id', userId),
    supabase.from('exchange_rates').select('*'),
    fetchDolarBlue(),
  ])
  const methods = (pm.data ?? []) as PaymentMethod[]
  const rates = (er.data ?? []) as ExchangeRate[]
  return {
    transactions: prepareTransactions((tx.data ?? []) as Transaction[], methods, rates, blue),
    paymentMethods: methods,
    recurringPlans: prepareRecurringPlans((rp.data ?? []) as RecurringPlan[], rates, blue),
    internalTransfers: (it.data ?? []) as InternalTransfer[],
    categories: (cat.data ?? []) as Category[],
    installmentPlans: (ip.data ?? []) as InstallmentPlan[],
  }
}
```

Ajustar la query de `categories` al criterio confirmado en Step 0 (ej. `.or(\`user_id.eq.${ctx.authUserId},is_system.eq.true\`)` como hace la route actual en la línea 152).

- [ ] **Step 4: Verde + commit** — `rtk git commit -m "feat(chat): dataLoader server-side con pipeline compartido de lib/finance"`

---

### Task 8: Read tools A — balance, tarjetas, resumen mensual

**Files:**
- Create: `src/lib/ai/tools/readTools.ts`
- Create: `src/lib/ai/tools/__tests__/readTools.test.ts`
- Modify: `src/lib/ai/tools/registry.ts` (spread `...readTools` en `allTools`)

**Interfaces:**
- Consumes: `loadFinanceData` (Task 7); `computeGlobalBalance`, `computePendingCreditCards`, `computePaymentMethodStatus` (Task 4); `computePendingFixedExpenses` (Task 3); `computeMonthlyBalance` (Task 5).
- Produces: `export const readTools: ToolDef[]` con `get_balance_snapshot`, `get_payment_method_status`, `get_monthly_summary` (esta task) — Tasks 9-10 le agregan el resto al mismo array.

- [ ] **Step 1: Test que falla** — mockear `loadFinanceData` (vi.mock del módulo) con un dataset fijo pequeño; asserts sobre la forma del JSON devuelto:

```ts
it('get_balance_snapshot devuelve disponibleReal, saldoBruto y pendientes', async () => {
  const r = await executeToolWith(readTools, 'get_balance_snapshot', {}, ctx)
  expect(r.ok).toBe(true)
  const d = r.data as Record<string, unknown>
  expect(d).toHaveProperty('disponibleReal')
  expect(d).toHaveProperty('saldoBruto')
  expect(d).toHaveProperty('mensualidadesPendientes')
  expect(d).toHaveProperty('tarjetasPendientes')
})
it('get_payment_method_status con nombre inexistente → error con lista de medios disponibles', async () => { /* ... */ })
it('get_monthly_summary sin mes usa el mes actual', async () => { /* ... */ })
```

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implementar.** Patrón de cada tool (números SIEMPRE de lib/finance; salida compacta):

```ts
// src/lib/ai/tools/readTools.ts (extracto — implementar las 3 de esta task)
export const readTools: ToolDef[] = [
  {
    name: 'get_balance_snapshot',
    description: 'Disponible Real del usuario: cuánta plata libre tiene hoy, saldo bruto y compromisos pendientes (mensualidades y tarjetas). Usar para "cuánta plata tengo".',
    kind: 'read',
    schema: z.object({}),
    execute: async (_args, ctx) => {
      const data = await loadFinanceData(ctx)
      const now = new Date()
      const pendingFixed = computePendingFixedExpenses(data.recurringPlans, data.transactions, now)
      const disponibleReal = computeGlobalBalance(data.transactions, data.paymentMethods, data.internalTransfers, pendingFixed.total, now)
      const pendingCards = computePendingCreditCards(data.paymentMethods, data.transactions, data.recurringPlans, now).filter((c) => c.isPending)
      const pendingCardTotal = pendingCards.reduce((a, c) => a + c.total, 0)
      return {
        ok: true,
        data: {
          disponibleReal: Math.round(disponibleReal),
          saldoBruto: Math.round(disponibleReal + pendingFixed.total + pendingCardTotal),
          mensualidadesPendientes: pendingFixed,
          tarjetasPendientes: pendingCards.map((c) => ({
            tarjeta: c.name, total: Math.round(c.total),
            vence: formatLocalDate(c.nextPaymentDate),
            estado: c.isCycleClosed ? 'cerrado' : 'en curso',
          })),
        },
      }
    },
  },
  // get_payment_method_status: schema z.object({ nombre: z.string().optional().describe('Nombre del medio; si falta, lista todos') });
  //   resuelve por ilike sobre data.paymentMethods; crédito → computePaymentMethodStatus con
  //   totalAPagar/vencimiento/cierre/ars/usd; débito → saldo. Nombre no encontrado →
  //   { ok:false, error: `No encontré "${nombre}". Medios: ${names.join(', ')}` }.
  // get_monthly_summary: schema z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/).optional() });
  //   ingresos/gastos del mes por periodDate + computeMonthlyBalance(..., 'all', now).
]
```

Escribir las tres completas (los comentarios de arriba definen el contrato exacto; expandirlos a código).

- [ ] **Step 4: Verde + commit** — `rtk git commit -m "feat(chat): read tools de balance, tarjetas y resumen mensual"`

---

### Task 9: Read tools B — categorías, búsqueda, cuotas, mensualidades, metas, portfolio

**Files:**
- Modify: `src/lib/ai/tools/readTools.ts` (agregar 6 tools al array)
- Modify: `src/lib/ai/tools/__tests__/readTools.test.ts`
- Modify: `src/lib/ai/handlers.ts` (exportar `handlePortfolio` — o su lógica — para reutilizarla)

**Interfaces (contratos exactos):**

| Tool | Schema (Zod) | Devuelve |
|------|-------------|----------|
| `get_expenses_by_category` | `{ mes?: 'YYYY-MM', tipo?: 'expense'\|'income' }` | `computeExpensesByCategory` ordenado desc, top 20, con total y % |
| `search_transactions` | `{ texto?, categoria?, medio?, desde?: 'YYYY-MM-DD', hasta?, limite?: number ≤ 20 (default 10) }` | filas `{ id, fecha, descripcion, monto, categoria, medio }` filtrando en memoria sobre `loadFinanceData` |
| `get_installments_status` | `{ busqueda?: string }` | por plan: descripción, cuotas pagadas/restantes, monto restante (lógica de `getInstallmentStatus` del store 1245-1286, replicada sobre datos del loader — es corta y no está en scope de extracción) |
| `list_recurring_plans` | `{}` | activas con monto ARS + flag `pendienteEsteMes` (usa `computePendingFixedExpenses`) |
| `list_goals_and_budgets` | `{}` | queries directas a `savings_goals`/`savings_goal_contributions`/`category_budgets` por `authUserId` (misma lógica del goalContext de la route actual, líneas 141-206) |
| `get_portfolio_status` | `{}` | reutiliza la query/formato de `handlePortfolio` (handlers.ts 980-1020) devolviendo `{ resumen: string }` |

- [ ] **Step 1: Tests que fallan** — uno por tool con el mock de datos; para `search_transactions` verificar el tope de 20 filas aunque `limite` pida más.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar las 6 tools** siguiendo el patrón de Task 8.
- [ ] **Step 4: Verde + commit** — `rtk git commit -m "feat(chat): read tools de análisis, búsqueda, compromisos y portfolio"`

---

### Task 10: `get_app_help` — diccionario de conceptos

**Files:**
- Create: `src/lib/ai/tools/appHelp.ts`
- Create: `src/lib/ai/tools/__tests__/appHelp.test.ts`
- Modify: `src/lib/ai/tools/registry.ts` (agregar `appHelpTool`)

**Interfaces:**
- Produces: `export const appHelpTool: ToolDef` — schema `{ tema: z.string() }`; matchea por inclusión case/acentos-insensible contra un `Record<string, { titulo: string; explicacion: string }>`.

- [ ] **Step 1: Test que falla** — `'disponible real'`, `'Disponible Real'` y `'disponible'` devuelven la misma entrada; tema desconocido → `ok: true` con lista de temas disponibles (el modelo la ofrece al usuario).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar.** Entradas mínimas (redactar la explicación completa de cada una a partir de CLAUDE.md, en voz de Chanchito, 2-4 oraciones):
  `disponible-real`, `saldo-bruto`, `ciclo-de-tarjeta` (cerrado vs. en curso, por qué una tarjeta muestra un período anterior), `mensualidades` (= transacciones reales, marcar pagada no mueve el disponible), `pago-de-tarjeta` (neutro global, baja el medio financiador), `cuotas`, `medio-predeterminado`, `metas-y-presupuestos`, `periodDate-vs-fecha-real` (por qué un gasto de crédito aparece en otro mes).
- [ ] **Step 4: Verde + commit** — `rtk git commit -m "feat(chat): tool get_app_help con diccionario de conceptos"`

---

### Task 11: Write tools A — transacción, cuotas, mensualidad, categoría, medio, fechas de tarjeta

**Files:**
- Create: `src/lib/ai/tools/writeTools.ts`
- Create: `src/lib/ai/tools/__tests__/writeTools.test.ts`
- Modify: `src/lib/ai/handlers.ts` (agregar `export` a `handleTransaction`, `handleInstallment`, `handleSubscription`, `handleCardConfig`)
- Modify: `src/lib/ai/tools/registry.ts` (spread `...writeTools`)

**Interfaces:**

```ts
export const writeTools: ToolDef[]
// create_transaction — schema:
z.object({
  descripcion: z.string().min(1),
  monto: z.number().positive(),
  tipo: z.enum(['expense', 'income']),
  categoria_id: z.string().nullable().describe('UUID del DICCIONARIO DE CATEGORÍAS del prompt; null si ninguna aplica'),
  medio_pago: z.string().nullable().describe('Nombre del medio; null usa el predeterminado'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD; si el usuario no dice, la fecha de hoy del contexto'),
})
// execute: mapea a TransactionData { description, amount, type, categoryId, categoryName: null,
// paymentMethodName: medio_pago, date: fecha, isReal: true } y llama handleTransaction(data, ctx.userId).
// ToolResult: { ok: res.success, data: { mensaje: res.message }, mutated: res.success }
```

- `create_installment_plan`: `{ descripcion, monto_total: z.number().positive(), cantidad_cuotas: z.number().int().min(2).max(60), categoria_id, medio_pago, fecha }` → `handleInstallment` (amount = monto_total/cantidad).
- `create_recurring_plan`: `{ descripcion, monto: positive, moneda: z.enum(['ARS','USD']).default('ARS'), categoria_id, medio_pago }` → `handleSubscription` (frequency `'monthly'`).
- `set_card_dates`: `{ medio_pago: z.string(), dia_cierre: z.number().int().min(1).max(31), dia_vencimiento: z.number().int().min(1).max(31) }` → `handleCardConfig`.
- `create_category` (**nueva capacidad**): `{ nombre: z.string().min(1), tipo: z.enum(['expense','income']), emoji: z.string().optional() }` → verificar duplicado por `ilike` exacto → insert directo en `categories` (con el criterio de user_id del Task 7 Step 0) → `{ ok, data: { mensaje }, mutated: true }`.
- `create_payment_method` (**nueva capacidad**): `{ nombre: z.string().min(1), tipo: z.enum(['credit','debit','cash']), dia_cierre?: int 1-31, dia_vencimiento?: int 1-31 }` → verificar duplicado → insert en `payment_methods` (`default_closing_day`/`default_payment_day` solo si `tipo==='credit'`).

- [ ] **Step 1: Tests que fallan** — mockear `@/utils/supabase/server` (los handlers crean su propio client) y/o los handlers exportados con `vi.mock`; verificar: mapeo de args → `handleTransaction` llamado con `TransactionData` correcto; `mutated: true` solo si `success`; `create_category` rechaza duplicado con mensaje claro; montos negativos rechazados por Zod sin tocar DB.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** las 6 tools + exports en handlers.ts.
- [ ] **Step 4: Verde + commit** — `rtk git commit -m "feat(chat): write tools de carga y creación de estructuras"`

---

### Task 12: Refactor stateless de `handleDelete` (borra el Map)

**Files:**
- Modify: `src/lib/ai/handlers.ts:1274-1535` (`handleDelete`) y borrar `pendingActions` (38-48) + `handleConfirmAction` (1540-1690)
- Create: `src/lib/ai/__tests__/handleDelete.test.ts`

**Interfaces:**
- Produces: `export async function handleDelete(data: DeleteData & { confirmed?: boolean; reassignTo?: string | null }, userId: number): Promise<ChatResponse>`
- El campo `data.confirmed === true` reemplaza al flujo `pendingActions`/`handleConfirmAction`.

- [ ] **Step 1: Tests que fallan** (mock de supabase):
  - medio de pago con dependencias y `confirmed: false` → `success: true`, mensaje `⚠️ … ¿confirmás?`, **no** llama `.delete()`.
  - mismo caso con `confirmed: true` → ejecuta `.delete()` (o reasigna si `reassignTo` viene con nombre de otro medio).
  - dos llamadas independientes (simulando lambdas distintas) funcionan sin estado compartido.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar.** En cada caso con dependencias (medio_pago 1346-1367, categoria 1407-1422, cuota 1494-1509): reemplazar `pendingActions.set(...)` por `if (!data.confirmed) return { success: true, message: '⚠️ …' }` conservando el texto actual, y a continuación el bloque de ejecución (delete directo, o la lógica de reasignación que hoy vive en `handleConfirmAction` 1561+ movida inline al caso correspondiente cuando `data.reassignTo` está presente). Borrar `pendingActions`, `PendingAction` y `handleConfirmAction` enteros.
- [ ] **Step 4: Verde** — `rtk npx vitest run src/lib/ai && rtk npx tsc --noEmit`. Nota: `handleIntent` aún referencia `confirm_action` — eliminar ese case también (el switch se borra entero en Task 14; acá solo dejar compilando).
- [ ] **Step 5: Commit** — `rtk git commit -m "refactor(chat): confirmación de borrados stateless (fix Map en memoria serverless)"`

---

### Task 13: Write tools B — update, delete, metas y presupuestos

**Files:**
- Modify: `src/lib/ai/tools/writeTools.ts` (+5 tools)
- Modify: `src/lib/ai/handlers.ts` (exportar `handleEdit`, `handleCreateGoal`, `handleCreateBudget`, `handleGoalContribution`)
- Modify: `src/lib/ai/tools/__tests__/writeTools.test.ts`

**Interfaces:**

- `update_entity`: `{ entidad: z.enum(['transaccion','medio_pago','categoria','suscripcion','cuota','objetivo','presupuesto']), busqueda: z.string(), cambios: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }` → `handleEdit`/`handleEditGoal` según entidad.
- `delete_entity`: `{ entidad: <mismo enum sin objetivo/presupuesto> , busqueda: z.string(), confirmed: z.boolean().default(false).describe('true SOLO si el usuario ya confirmó explícitamente en este hilo'), reasignar_a: z.string().nullable().optional() }` → `handleDelete` de Task 12. Descripción de la tool: «Primera llamada siempre con confirmed=false; si la respuesta pide confirmación, preguntá al usuario y recién en el próximo mensaje llamá con confirmed=true».
- `delete_goal_or_budget`: `{ entidad: z.enum(['objetivo','presupuesto']), busqueda: z.string() }` → `handleDeleteGoal` (sin dependencias → no necesita confirmación en dos pasos; la descripción instruye confirmar conversacionalmente antes).
- `create_goal`: `{ nombre, tipo: z.enum(['one_time','monthly']), monto_objetivo: positive, moneda: enum ARS/USD default ARS, fecha_objetivo: z.string().nullable() }` → `handleCreateGoal`.
- `create_budget`: `{ categoria_id: z.string(), monto_limite: positive, moneda: default ARS }` → `handleCreateBudget` (resolver `categoryName` desde el contexto de categorías del loader).
- `contribute_to_goal`: `{ busqueda, monto: positive, moneda: default ARS, nota: z.string().nullable(), fecha: 'YYYY-MM-DD' }` → `handleGoalContribution`.

- [ ] **Step 1: Tests que fallan** — por tool: mapeo correcto de args al handler mockeado; `delete_entity` propaga `confirmed`; `mutated: true` solo en éxito real (el mensaje `⚠️` de confirmación pendiente devuelve `mutated: false`; detectar por prefijo `⚠️` en `res.message` o porque no hubo delete — implementar `mutated: res.success && !res.message.startsWith('⚠️')`).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Verde + commit** — `rtk git commit -m "feat(chat): write tools de edición, borrado y objetivos"`

---

# FASE 3 — Agent loop

### Task 14a: `agentPrompt.ts` + `agent.ts` + instalación del SDK

**Files:**
- Create: `src/lib/ai/agentPrompt.ts`, `src/lib/ai/agent.ts`
- Create: `src/lib/ai/__tests__/agent.test.ts`
- Modify: `package.json` (`rtk npm install @google/genai`)

**Interfaces:**

```ts
// agentPrompt.ts
export function buildAgentPrompt(opts: {
  categories: Array<{ id: string; name: string; emoji: string | null; type: 'income' | 'expense' }>
  paymentMethods: Array<{ name: string; type: string; isDefault: boolean }>
  today: string
  cardAlerts: string[]
}): string

// agent.ts
export interface ModelTurn {
  functionCalls?: Array<{ name: string; args: Record<string, unknown> }>
  text?: string
  inputTokens: number
  outputTokens: number
}
export interface AgentModel {
  generate(opts: { contents: unknown[]; systemInstruction: string; withTools: boolean }): Promise<ModelTurn>
}
export interface AgentResult { message: string; mutated: boolean; inputTokens: number; outputTokens: number }
export const MAX_STEPS = 6
export const TOKEN_CEILING = 50_000
export async function runAgent(opts: {
  message: string
  history: Array<{ role: 'user' | 'chanchito'; content: string }>
  ctx: AgentContext
  model: AgentModel                       // inyectable → tests sin red
  execute?: typeof executeTool            // inyectable → tests
}): Promise<AgentResult>
export function createGeminiModel(apiKey: string): AgentModel  // adapter @google/genai
```

- [ ] **Step 1: Instalar SDK** — `rtk npm install @google/genai`. (El viejo se desinstala en Task 14b.)

- [ ] **Step 2: Tests del loop que fallan** (modelo guionado, sin red):

```ts
// src/lib/ai/__tests__/agent.test.ts — esqueleto de los casos; escribir asserts completos
const scripted = (turns: ModelTurn[]): AgentModel => {
  let i = 0
  return { generate: async () => turns[Math.min(i++, turns.length - 1)] }
}
const okTool = async () => ({ ok: true, data: { x: 1 } })

it('texto directo en el primer turno → responde sin tools', async () => { /* turns: [{ text: 'Hola', inputTokens: 10, outputTokens: 5 }] → message 'Hola', mutated false, tokens sumados */ })
it('functionCall → ejecuta tool → segunda llamada con functionResponse → texto final', async () => { /* verificar que contents crece con functionCall + functionResponse y execute recibió name/args */ })
it('mutated true si una write tool devolvió mutated', async () => { /* execute mock devuelve { ok:true, mutated:true } */ })
it('tope de 6 pasos: al 7mo turno con functionCall fuerza withTools=false y devuelve el texto', async () => { /* 6 turns con functionCall + 1 final con text; assert que la última generate recibió withTools false */ })
it('anti-bucle: misma tool con mismos args dos veces → corta y fuerza final', async () => { /* ... */ })
it('techo de tokens: turnos con inputTokens enormes → corta antes de MAX_STEPS', async () => { /* ... */ })
it('tool con error → el functionResponse lleva { ok:false, error } y el loop sigue', async () => { /* ... */ })
```

- [ ] **Step 3: FAIL** → `rtk npx vitest run src/lib/ai/__tests__/agent.test.ts`

- [ ] **Step 4: Implementar `agent.ts`**

```ts
// src/lib/ai/agent.ts (estructura completa del loop)
export async function runAgent({ message, history, ctx, model, execute = executeTool }: RunAgentOpts): Promise<AgentResult> {
  const contents: unknown[] = [
    ...history.slice(-10).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ]
  const systemInstruction = /* buildAgentPrompt se llama en la route y llega por opts — ver route */
  let mutated = false
  let inputTokens = 0, outputTokens = 0
  const seenCalls = new Set<string>()

  for (let step = 0; step < MAX_STEPS; step++) {
    const overBudget = inputTokens + outputTokens > TOKEN_CEILING
    const turn = await model.generate({ contents, systemInstruction, withTools: !overBudget })
    inputTokens += turn.inputTokens
    outputTokens += turn.outputTokens

    if (!turn.functionCalls?.length || overBudget) {
      return { message: turn.text ?? 'No pude generar una respuesta, probá de nuevo.', mutated, inputTokens, outputTokens }
    }

    const call = turn.functionCalls[0]
    const key = `${call.name}:${JSON.stringify(call.args)}`
    if (seenCalls.has(key)) break // anti-bucle → final forzado abajo
    seenCalls.add(key)

    const result = await execute(call.name, call.args, ctx)
    if (result.ok && result.mutated) mutated = true

    contents.push({ role: 'model', parts: [{ functionCall: { name: call.name, args: call.args } }] })
    contents.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: result as unknown as Record<string, unknown> } }] })
  }

  // Pasos agotados o anti-bucle: llamada final sin tools, honesta.
  contents.push({ role: 'user', parts: [{ text: 'No hagas más consultas: respondé ahora con la información que ya tenés, y si te faltó algo decilo honestamente.' }] })
  const final = await model.generate({ contents, systemInstruction, withTools: false })
  inputTokens += final.inputTokens
  outputTokens += final.outputTokens
  return { message: final.text ?? 'Me quedé sin pasos para resolver esto, ¿probamos de nuevo?', mutated, inputTokens, outputTokens }
}
```

Nota de implementación: `systemInstruction` viaja en `opts` (agregarlo a `RunAgentOpts` como `systemInstruction: string`). `createGeminiModel` adapta `@google/genai`:

```ts
import { GoogleGenAI } from '@google/genai'
export function createGeminiModel(apiKey: string): AgentModel {
  const ai = new GoogleGenAI({ apiKey })
  return {
    async generate({ contents, systemInstruction, withTools }) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction,
          ...(withTools ? { tools: [{ functionDeclarations: getFunctionDeclarations() }] } : {}),
        },
      })
      return {
        functionCalls: response.functionCalls?.map((fc) => ({ name: fc.name ?? '', args: (fc.args ?? {}) as Record<string, unknown> })),
        text: response.text,
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      }
    },
  }
}
```

(Si la firma real del SDK difiere, consultar los tipos del paquete instalado en `node_modules/@google/genai/dist/*.d.ts` y ajustar el adapter — el resto del loop no cambia porque `AgentModel` lo aísla.)

- [ ] **Step 5: Implementar `agentPrompt.ts`** — prompt corto (~60 líneas), en español rioplatense:
  1. Identidad: «Sos Chanchito 🐷, asistente financiero de una app de finanzas personales argentina…».
  2. **Reglas duras**: nunca inventes números — todo dato financiero sale de una tool; si una tool falla, decilo; ante ambigüedad (monto sin contexto, medio de pago dudoso sin default) preguntá antes de escribir; escrituras destructivas siguen el protocolo confirmed de `delete_entity`.
  3. Contexto: fecha de hoy, DICCIONARIO DE CATEGORÍAS (`- emoji nombre (tipo): uuid` por línea), medios de pago (`- nombre (tipo)(predeterminado?)`), alertas de tarjeta si hay.
  4. Estilo: respuestas cortas, montos con formato `$14.500`, negritas `**…**` para cifras clave.
  Test golden simple: el prompt contiene el diccionario, la fecha y las reglas de números.

- [ ] **Step 6: Verde + commit**

Run: `rtk npx vitest run src/lib/ai && rtk npx tsc --noEmit` → PASS.

```bash
rtk git add -A
rtk git commit -m "feat(chat): agent loop con function calling, anti-bucle y techo de tokens"
```

---

# FASE 4 — Swap de la route y limpieza

### Task 14b: Reescribir `/api/chat` + borrar el motor viejo + migrar SDK restante

**Files:**
- Modify: `src/app/api/chat/route.ts` (reescritura)
- Modify: `src/app/actions/ai.ts`, `src/app/onboarding/actions.ts` (migración mecánica de SDK)
- Delete: `src/lib/ai/intentParser.ts`, `src/lib/ai/chatPrompt.ts`, `src/lib/ai/__tests__/intentParser.test.ts`, `src/lib/ai/__tests__/chatPrompt.test.ts`
- Modify: `src/lib/ai/handlers.ts` (borrar `handleIntent`, `handleQuery` y todos los `handleQuery*`/`handle*Mes`/`handleBusqueda`/`handleUltimosMovimientos`/`handleProyeccionMes`/`handleQueryGoal` — todo lo no exportado para tools)
- Modify: `package.json` (`rtk npm uninstall @google/generative-ai`)

**Interfaces:**
- Consumes: `runAgent`, `createGeminiModel`, `buildAgentPrompt` (Task 14a); `checkAndIncrementUsage`, `accumulateBudget` (existentes).
- Produces: respuesta HTTP idéntica al contrato actual: `{ success: boolean; message: string; mutated: boolean }` (+ los mismos 401/429/500). `chatStore` no se toca.

- [ ] **Step 1: Reescribir la route.** Estructura (conservar de la actual: auth (56-94), guard de cuota (96-118), alertas de tarjeta (211-239), `truncateHistory` (33-54)):

```ts
export const maxDuration = 60

export async function POST(req: NextRequest) {
  // 1-3. auth + dbUser/tier + checkAndIncrementUsage (SIN CAMBIOS, copiar de la route actual)
  // 4. categorías y medios para el prompt:
  const [{ data: categories }, { data: methods }] = await Promise.all([
    supabase.from('categories').select('id, name, emoji, type'/* criterio Task 7 */),
    supabase.from('payment_methods').select('name, type, is_default').eq('user_id', userId),
  ])
  // 5. cardAlerts (copiar bloque actual)
  // 6. contexto y agente:
  const ctx: AgentContext = { supabase, userId, authUserId: user.id, today: todayString() }
  const systemInstruction = buildAgentPrompt({ categories: categories ?? [], paymentMethods: (methods ?? []).map(m => ({ name: m.name, type: m.type, isDefault: m.is_default })), today: ctx.today, cardAlerts })
  const model = createGeminiModel(process.env.GOOGLE_API_KEY || '')
  const result = await runAgent({ message, history: truncateHistory(history || [], 10, 2000), ctx, model, systemInstruction })
  // 7. presupuesto: tokens de TODO el loop
  try { await accumulateBudget(supabase, result.inputTokens, result.outputTokens) } catch (e) { console.error(e) }
  // 8. respuesta
  return NextResponse.json({ success: true, message: result.message, mutated: result.mutated })
}
```

El try/catch global actual se conserva (500 genérico). Se elimina el goalContext gigante de la route (141-209): ahora es la tool `list_goals_and_budgets`.

- [ ] **Step 2: Borrar el motor viejo.** Eliminar los archivos listados y recortar `handlers.ts`: quedan solo `resolvePaymentMethod`, `calculateRealPaymentDate`, `checkBudgetAlert`, `formatMoney`, y los handlers exportados que las tools usan (`handleTransaction`, `handleInstallment`, `handleSubscription`, `handleCardConfig`, `handleEdit`, `handleDelete`, `handleCreateGoal`, `handleCreateBudget`, `handleEditGoal`, `handleDeleteGoal`, `handleGoalContribution`, `handlePortfolio` o su lógica). Borrar los tipos huérfanos que quedaron sin uso (importar los `*Data` desde un nuevo `src/lib/ai/handlerTypes.ts` — mover ahí las interfaces `TransactionData`, `InstallmentData`, `SubscriptionData`, `CardConfigData`, `EditData`, `DeleteData`, `CreateGoalData`, `CreateBudgetData`, `GoalEditData`, `GoalDeleteData`, `GoalContributionData` que hoy viven en `intentParser.ts`).

- [ ] **Step 3: Migración mecánica de SDK en `app/actions/ai.ts` y `app/onboarding/actions.ts`** — reemplazar `new GoogleGenerativeAI(key).getGenerativeModel({model}).generateContent(...)` por el equivalente `new GoogleGenAI({ apiKey }).models.generateContent({ model, contents })`, conservando prompts y manejo de errores. Después: `rtk npm uninstall @google/generative-ai` y `rtk grep "generative-ai" src` → 0 resultados.

- [ ] **Step 4: Verificación completa**

Run: `rtk npx vitest run src && rtk npm run lint && rtk npm run build`
Expected: tests PASS (menos `dates.test.ts` preexistente), lint limpio, build OK.

- [ ] **Step 5: Commit**

```bash
rtk git add -A
rtk git commit -m "feat(chat)!: swap al motor agéntico y retiro del pipeline one-shot"
```

---

# FASE 5 — UX + QA

### Task 15: Frases rotativas en el TypingIndicator

**Files:**
- Modify: `src/components/chat/TypingIndicator.tsx`

- [ ] **Step 1: Implementar** — rotar frases cada ~2,5 s mientras está montado, manteniendo los tokens del design system (`text-muted`, `font-sans`, sin colores hardcodeados):

```tsx
const FRASES = [
  'Pensando… 🐷', 'Revisando tus cuentas…', 'Haciendo números…',
  'Consultando tus movimientos…', 'Ya casi…',
]
// useState + useEffect con setInterval de 2500ms que avanza el índice (cleanup al desmontar).
// Renderizar la frase junto a la animación de puntos existente.
```

- [ ] **Step 2: Verificación visual** — `rtk npm run dev`, abrir el chat, mandar una consulta compleja y confirmar la rotación. Commit: `rtk git commit -m "feat(chat): frases rotativas durante el procesamiento del agente"`

### Task 16: QA manual — criterios de éxito del spec

- [ ] **Step 1: Correr el checklist completo del spec** (sección «Criterios de éxito») contra Supabase DEV con `rtk npm run dev`. Los números deben coincidir EXACTO con la UI (home y Compromisos abiertos al lado del chat):
  1. «¿Cuánto me va a venir de la Visa?» · 2. «¿Cuánta plata tengo disponible?» · 3. «¿En qué categoría gasto más este mes?» · 4. «¿Cuánto gasté en delivery en mayo?» · 5. «Cloná el alquiler del mes pasado con 12% de aumento» · 6. «Creá una categoría Mascotas» · 7. «Agregá Lemon como medio de pago» · 8. «Borrá la categoría Mascotas» → pide confirmación → «sí, borrala» ejecuta · 9. «¿Qué significa Disponible Real?» · 10. «gasté 5 lucas» → pregunta en vez de adivinar.
- [ ] **Step 2: Documentar resultados** — anotar cualquier desvío como issue en el plan (checkbox por frase); si un número difiere de la UI, es bug de Fase 1/2: volver a la task correspondiente antes de dar por terminado.
- [ ] **Step 3: Commit final + push** — `rtk git push`. Al terminar, usar el skill superpowers:finishing-a-development-branch.

---

## Self-Review del plan (ya aplicado)

- **Cobertura del spec**: arquitectura/loop → 14a; toolbox 21 tools → 8-13 (10 lecturas: 3+6+1; 11 escrituras: 6+5); confirmación stateless → 12-13; lib/finance → 1-5; errores/límites/costos → 6 (executeTool), 14a (topes), 14b (accumulateBudget, maxDuration); UX latencia → 15; testing → en cada task; migración/borrados → 14b; criterios de éxito → 16.
- **Sin placeholders**: los bloques comentados dentro de tests/tools definen contrato y casos exactos a expandir, con datos y valores esperados concretos.
- **Consistencia de tipos**: `ToolResult`/`AgentContext` (Task 6) se usan idénticos en 7-13; `ModelTurn`/`AgentModel` (14a) en el adapter y los tests; wrappers del store conservan firmas públicas exactas.
