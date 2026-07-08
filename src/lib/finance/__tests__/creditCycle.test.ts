import { describe, it, expect } from 'vitest'
import { getCreditCycleDates, isExpenseInCurrentMonthScope, sameMonthYear } from '@/lib/finance/creditCycle'
import type { PaymentMethod } from '@/types/database'
import type { ProcessedTransaction } from '@/lib/finance/types'

const credit = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: '1', user_id: '1', name: 'Visa', type: 'credit',
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
    id: '1', user_id: '1', description: 'x', amount: 100, date: '2026-07-05',
    type: 'expense', category_id: null, payment_method_id: '1',
    installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
    periodDate: '2026-07-05', realPaymentDate: '2026-07-05',
    ...over,
  } as ProcessedTransaction)

  it('excluye ingresos y pagos de tarjeta', () => {
    const now = new Date(2026, 6, 15)
    expect(isExpenseInCurrentMonthScope(tx({ type: 'income' }), [credit()], now)).toBe(false)
    expect(isExpenseInCurrentMonthScope(tx({ card_payment_for: '2' }), [credit()], now)).toBe(false)
  })

  it('cuota de crédito pertenece al mes de su vencimiento', () => {
    // cierra 19, vence 1 → cuota con date 2026-08-01, hoy 15 de julio:
    // paymentDateForThisCycle = 1 de agosto → SÍ pertenece
    const t = tx({ installment_plan_id: '9', date: '2026-08-01', periodDate: '2026-07-01' })
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
