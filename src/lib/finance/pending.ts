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
