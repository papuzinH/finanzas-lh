// src/lib/finance/analysis.ts
import { isSameMonth, parse } from 'date-fns'
import { parseLocalDate } from '@/lib/utils/dates'
import { isExpenseInCurrentMonthScope } from '@/lib/finance/creditCycle'
import type { PaymentMethod, RecurringPlan, Category } from '@/types/database'
import type { ProcessedTransaction } from './types'

/**
 * Desglose de transacciones agrupadas por nombre de categoría.
 *
 * - scope 'global': incluye todo el histórico.
 * - scope 'current_month': para gastos respeta el ciclo de tarjeta
 *   (isExpenseInCurrentMonthScope); para ingresos usa el mes de periodDate, que
 *   es el mes declarado por el usuario si imputo el cobro a otro mes, y el de la
 *   fecha si no (mismo criterio que getMonthlyIncome()).
 * - Excluye siempre pagos de tarjeta (card_payment_for) y ajustes de saldo
 *   (is_balance_adjustment): ninguno de los dos es consumo nuevo.
 * - Categoría sin match (category_id null o inexistente) cae en 'Otros'.
 */
export function computeExpensesByCategory(
  transactions: ProcessedTransaction[],
  paymentMethods: PaymentMethod[],
  categories: Category[],
  scope: 'global' | 'current_month',
  type: 'income' | 'expense',
  now: Date,
): Record<string, number> {
  return transactions
    .filter((t) => {
      if (t.type !== type || t.card_payment_for || t.is_balance_adjustment) return false

      if (scope === 'current_month') {
        // isExpenseInCurrentMonthScope solo entiende gastos (ciclos de
        // tarjeta de cuotas); para ingresos se usa el mismo criterio de
        // periodDate que getMonthlyIncome().
        return type === 'expense'
          ? isExpenseInCurrentMonthScope(t, paymentMethods, now)
          : isSameMonth(parseLocalDate(t.periodDate || t.date), now)
      }

      return true // Global includes all history
    })
    .reduce((acc, t) => {
      const categoryObj = categories.find((c) => c.id === t.category_id)
      const cat = categoryObj ? categoryObj.name : 'Otros'
      acc[cat] = (acc[cat] || 0) + Math.abs(Number(t.amount))
      return acc
    }, {} as Record<string, number>)
}

/**
 * Balance de un mes visual (periodDate || date) para un medio de pago
 * (o todos si paymentMethodId === 'all').
 *
 * Ingresos suman, gastos y mensualidades ya registradas (recurring_plan_id)
 * restan. Si el mes consultado es el mes actual, además resta los planes
 * recurrentes activos del medio que todavía NO tienen transacción asociada
 * ese mes (compromiso pendiente).
 */
export function computeMonthlyBalance(
  transactions: ProcessedTransaction[],
  recurringPlans: RecurringPlan[],
  monthStr: string,
  paymentMethodId: string,
  now: Date,
): number {
  const currentMonthDate = parse(monthStr, 'yyyy-MM', now)
  const isCurrentMonth = isSameMonth(currentMonthDate, now)

  const filtered = transactions.filter((t) => {
    const visualDateStr = t.periodDate || t.date
    // Parsear como fecha LOCAL
    const localVisualDate = parseLocalDate(visualDateStr)
    const isMonthMatch = isSameMonth(localVisualDate, currentMonthDate)
    let isMethodMatch = true
    if (paymentMethodId !== 'all') {
      isMethodMatch = t.payment_method_id?.toString() === paymentMethodId
    }
    return isMonthMatch && isMethodMatch
  })

  const transactionsBalance = filtered.reduce((acc, t) => {
    if (t.type === 'income') return acc + Number(t.amount)
    // Gastos y mensualidades (recurring_plan_id) se restan
    return acc - Number(t.amount)
  }, 0)

  // Si es el mes actual, restamos los planes recurrentes que NO tengan una transacción asociada aún
  let pendingRecurringAmount = 0
  if (isCurrentMonth) {
    const activePlans = recurringPlans.filter(
      (p) => p.is_active && (paymentMethodId === 'all' || p.payment_method_id?.toString() === paymentMethodId),
    )

    activePlans.forEach((plan) => {
      const hasTransaction = filtered.some((t) => t.recurring_plan_id === plan.id)
      if (!hasTransaction) {
        pendingRecurringAmount += Number(plan.amount)
      }
    })
  }

  return transactionsBalance - pendingRecurringAmount
}
