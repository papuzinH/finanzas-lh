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
