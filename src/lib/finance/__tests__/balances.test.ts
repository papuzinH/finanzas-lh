import { describe, it, expect } from 'vitest'
import {
  computePaymentMethodStatus,
  computeGlobalBalance,
  computePendingCreditCards,
  hasCardPaymentInCycle,
} from '@/lib/finance/balances'
import type { PaymentMethod, RecurringPlan } from '@/types/database'
import type { ProcessedTransaction } from '@/lib/finance/types'

// Builders duplicados de src/lib/finance/__tests__/creditCycle.test.ts (Task 1).
// YAGNI: no se extrae un helper compartido hasta el tercer uso real.
const credit = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: '1', user_id: '1', name: 'Visa', type: 'credit',
  default_closing_day: 19, default_payment_day: 1,
  is_default: false, is_personal: false, created_at: '2025-01-01',
  ...over,
} as PaymentMethod)

const tx = (over: Partial<ProcessedTransaction> = {}): ProcessedTransaction => ({
  id: '1', user_id: '1', description: 'x', amount: 100, date: '2026-07-05',
  type: 'expense', category_id: null, payment_method_id: '1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  periodDate: '2026-07-05', realPaymentDate: '2026-07-05',
  ...over,
} as ProcessedTransaction)

const plan = (over: Partial<RecurringPlan> = {}): RecurringPlan =>
  ({
    id: '1', description: 'Plan', amount: 1000, is_active: true,
    payment_method_id: '1', currency: 'ARS', original_amount: null,
    ...over,
  }) as RecurringPlan

describe('computePaymentMethodStatus (crédito)', () => {
  it('suma al ciclo solo tx cuyo t.date cae en el mes de nextPaymentDate; separa ARS/USD', () => {
    // tarjeta cierre 19 vence 1; hoy 15 jul 2026 -> nextPaymentDate = 1 ago 2026
    const now = new Date(2026, 6, 15)
    const transactions = [
      tx({ payment_method_id: '1', type: 'expense', date: '2026-08-01', amount: -1000 }),
      tx({
        id: '2', payment_method_id: '1', type: 'expense', date: '2026-08-01',
        amount: -12000, original_currency: 'USD', original_amount: 10,
      }),
    ]
    const status = computePaymentMethodStatus(credit(), transactions, [], now)
    expect(status.nextPaymentDate?.getMonth()).toBe(7) // agosto
    expect(status.arsExpenses).toBe(1000)
    expect(status.usdExpenses).toBe(10)
    // expensesInCycleArs = 1000 + 12000 = 13000 -> projectedTotal = -13000
    expect(status.projectedTotal).toBe(-13000)
  })

  it('mensualidad adherida sin tx en el ciclo se suma; con tx en el ciclo NO se duplica', () => {
    const now = new Date(2026, 6, 15) // nextPaymentDate = 1 ago 2026
    const recurringPlans = [plan({ id: '5', payment_method_id: '1', amount: 2000, currency: 'ARS' })]

    // Sin tx vinculada: la mensualidad se suma al ciclo.
    const withoutTx = computePaymentMethodStatus(credit(), [], recurringPlans, now)
    expect(withoutTx.fixedCosts).toBe(2000)
    expect(withoutTx.projectedTotal).toBe(-2000)

    // Con tx vinculada (recurring_plan_id 5) dentro del ciclo: no se duplica.
    const transactions = [
      tx({ payment_method_id: '1', type: 'expense', date: '2026-08-01', amount: -2000, recurring_plan_id: '5' }),
    ]
    const withTx = computePaymentMethodStatus(credit(), transactions, recurringPlans, now)
    expect(withTx.projectedTotal).toBe(-2000)
  })

  it('reintegros (income del ciclo) restan', () => {
    const now = new Date(2026, 6, 15) // nextPaymentDate = 1 ago 2026
    const baseTransactions = [
      tx({ payment_method_id: '1', type: 'expense', date: '2026-08-01', amount: -1000 }),
    ]
    const withoutRefund = computePaymentMethodStatus(credit(), baseTransactions, [], now)
    expect(withoutRefund.projectedTotal).toBe(-1000)

    const withRefund = computePaymentMethodStatus(
      credit(),
      [...baseTransactions, tx({ id: '2', payment_method_id: '1', type: 'income', date: '2026-08-01', amount: 500 })],
      [],
      now,
    )
    // -1000 + 500 = -500 (sube 500 respecto de -1000)
    expect(withRefund.projectedTotal).toBe(-500)
    expect(withRefund.projectedTotal - withoutRefund.projectedTotal).toBe(500)
  })
})

describe('computePaymentMethodStatus (débito)', () => {
  it('saldo histórico ingresos − gastos, cuotas hasta fin de mes', () => {
    const now = new Date(2026, 6, 15) // 15 jul 2026, fin de mes = 31 jul
    const method = credit({ type: 'debit', default_closing_day: null, default_payment_day: null })
    const transactions = [
      tx({ payment_method_id: '1', type: 'income', amount: 10000 }),
      tx({ id: '2', payment_method_id: '1', type: 'expense', amount: -3000 }),
      tx({
        id: '3', payment_method_id: '1', type: 'expense', amount: -1000,
        installment_plan_id: '7', date: '2026-07-31', periodDate: '2026-07-31',
      }),
    ]
    const status = computePaymentMethodStatus(method, transactions, [], now)
    expect(status.nextPaymentDate).toBeUndefined()
    // 10000 - 3000 - 1000 = 6000
    expect(status.projectedTotal).toBe(6000)
  })
})

describe('computeGlobalBalance', () => {
  it('resta mensualidades históricas + pendientes del mes (no el burn rate)', () => {
    const now = new Date(2026, 6, 15) // 15 jul 2026
    const transactions = [
      tx({ payment_method_id: '1', type: 'income', amount: 100000 }),
      tx({
        id: '2', payment_method_id: '1', type: 'expense', amount: -10000,
        recurring_plan_id: '9', date: '2026-06-05', periodDate: '2026-06-05',
      }),
    ]
    // recurringPaid (10000, mes pasado) + pendingFixedTotal (10000, mes actual) = 20000
    // 100000 - 20000 = 80000
    const result = computeGlobalBalance(transactions, [credit()], [], 10000, now)
    expect(result).toBe(80000)
  })

  it('excluye pagos de tarjeta (card_payment_for) del gasto', () => {
    const now = new Date(2026, 6, 15)
    const transactions = [
      tx({ payment_method_id: '1', type: 'income', amount: 100000 }),
      tx({ id: '2', payment_method_id: '1', type: 'expense', amount: -20000, card_payment_for: '1' }),
    ]
    // El gasto con card_payment_for no resta: solo queda el ingreso.
    const result = computeGlobalBalance(transactions, [credit()], [], 0, now)
    expect(result).toBe(100000)
  })

  it('cuotas futuras no restan; cuota del mes según ciclo sí', () => {
    const now = new Date(2026, 6, 15) // cierre 19, vence 1 -> ciclo vigente vence 1 ago 2026
    const method = credit() // closing 19, payment 1
    const transactions = [
      // cuota que vence en el ciclo vigente (agosto) -> SÍ resta
      tx({
        payment_method_id: '1', type: 'expense', installment_plan_id: '7',
        date: '2026-08-01', periodDate: '2026-08-01', amount: -5000,
      }),
      // cuota de un ciclo futuro (octubre) -> NO resta
      tx({
        id: '2', payment_method_id: '1', type: 'expense', installment_plan_id: '7',
        date: '2026-10-01', periodDate: '2026-10-01', amount: -5000,
      }),
    ]
    const result = computeGlobalBalance(transactions, [method], [], 0, now)
    expect(result).toBe(-5000)
  })
})

describe('computePendingCreditCards', () => {
  it('isPending true hasta el día del vencimiento inclusive; isPaidManually si hay card_payment_for en el mes del vencimiento', () => {
    // Master: cierra 2, vence 13. Hoy = 13 jul (día exacto del vencimiento).
    const method = credit({ id: '1', name: 'Master', default_closing_day: 2, default_payment_day: 13 })
    const now = new Date(2026, 6, 13, 10, 0, 0)
    const baseTransactions = [
      tx({ payment_method_id: '1', type: 'expense', date: '2026-07-13', periodDate: '2026-07-13', amount: -50000 }),
    ]

    const before = computePendingCreditCards([method], baseTransactions, [], now)
    expect(before[0].isPending).toBe(true)
    expect(before[0].isPaidManually).toBe(false)

    const paidTransactions = [
      ...baseTransactions,
      tx({
        id: '2', payment_method_id: '2', type: 'expense', date: '2026-07-05',
        periodDate: '2026-07-05', amount: -50000, card_payment_for: '1',
      }),
    ]
    const after = computePendingCreditCards([method], paidTransactions, [], now)
    expect(after[0].isPaidManually).toBe(true)
    expect(after[0].isPending).toBe(false)
  })

  it('isCycleClosed cuando el cierre ya pasó', () => {
    const now = new Date(2026, 6, 7, 10, 0, 0) // 7 jul 2026
    // Master cerró el 2 jul (vence 13 jul) -> cerrado
    const master = credit({ id: '1', name: 'Master', default_closing_day: 2, default_payment_day: 13 })
    // Visa cierra el 23 jul (vence 3 ago) -> en curso
    const visa = credit({ id: '2', name: 'Visa', default_closing_day: 23, default_payment_day: 3 })
    const transactions = [
      tx({ payment_method_id: '1', type: 'expense', date: '2026-07-13', periodDate: '2026-07-13', amount: -50000 }),
      tx({ id: '2', payment_method_id: '2', type: 'expense', date: '2026-08-03', periodDate: '2026-08-03', amount: -90000 }),
    ]
    const result = computePendingCreditCards([master, visa], transactions, [], now)
    const masterItem = result.find((i) => i.methodId === '1')
    const visaItem = result.find((i) => i.methodId === '2')
    expect(masterItem?.isCycleClosed).toBe(true)
    expect(visaItem?.isCycleClosed).toBe(false)
  })
})

describe('hasCardPaymentInCycle', () => {
  it('true si hay una transacción card_payment_for con fecha en el mes del vencimiento vigente', () => {
    const method = credit({ id: '1', default_closing_day: 2, default_payment_day: 13 })
    const now = new Date(2026, 6, 13)
    const transactions = [
      tx({ payment_method_id: '2', type: 'expense', date: '2026-07-05', card_payment_for: '1', amount: -50000 }),
    ]
    expect(hasCardPaymentInCycle(transactions, method, now)).toBe(true)
  })

  it('false sin pago vinculado o si el método no tiene ciclo de crédito', () => {
    const method = credit({ id: '1', default_closing_day: 2, default_payment_day: 13 })
    const now = new Date(2026, 6, 13)
    expect(hasCardPaymentInCycle([], method, now)).toBe(false)

    const debit = credit({ id: '2', type: 'debit', default_closing_day: null, default_payment_day: null })
    expect(hasCardPaymentInCycle([tx({ card_payment_for: '2' })], debit, now)).toBe(false)
  })
})
