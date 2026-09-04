import { format } from 'date-fns'
import type { RecurringPlan, PaymentMethod } from '@/types/database'
import type { ProcessedTransaction } from './types'

/**
 * Las mensualidades que todavía requieren que el usuario haga algo este mes.
 *
 * ⚠️ Las facturadas en TARJETA quedan afuera, siempre: no se pagan aparte, se
 * cobran dentro del resumen y la plata sale cuando se paga la tarjeta.
 * `computeCommitments` (pocket.ts) ya las excluía del disponible por esta misma
 * razón, así que hasta el 2026-09-04 el repo tenía dos criterios en desacuerdo y la
 * pantalla reclamaba como pendiente algo que el disponible ya daba por cobrado.
 *
 * El síntoma que lo destapó era peor que un rótulo de más. `periodDate` es el
 * CIERRE del resumen, y acá se compara contra el mes CALENDARIO: si una tarjeta no
 * tiene ningún resumen que cierre en el mes en curso, ninguna de sus mensualidades
 * puede matchear y quedan "pendientes" para siempre. Caso real: la Mastercard de un
 * usuario tiene los cierres declarados el 27-ago y el 1-oct, así que su suscripción
 * a Claude figuraba impaga en septiembre con el cargo posteado y todo.
 */
export function computePendingFixedExpenses(
  recurringPlans: RecurringPlan[],
  transactions: ProcessedTransaction[],
  paymentMethods: PaymentMethod[],
  now: Date = new Date(),
): { total: number; items: Array<{ id: string; name: string; amount: number }> } {
  const currentMonth = format(now, 'yyyy-MM')
  const tarjetas = new Set(
    paymentMethods.filter((m) => m.type === 'credit').map((m) => m.id),
  )

  const items = recurringPlans
    .filter((p) => p.is_active)
    .filter((p) => !(p.payment_method_id && tarjetas.has(p.payment_method_id)))
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
