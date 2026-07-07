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
