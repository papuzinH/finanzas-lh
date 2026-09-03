import { describe, it, expect } from 'vitest'
import { prepareTransactions, prepareRecurringPlans, resolveRate } from '@/lib/finance/prepare'
import type { Transaction, PaymentMethod, RecurringPlan } from '@/types/database'
import type { CreditCardCycle } from '@/lib/finance/cycles'

describe('prepareTransactions', () => {
  it('periodDate sale del cierre del ciclo, no de adivinar por el dia del mes', () => {
    const visa = { id: 'visa', type: 'credit', default_closing_day: 20, default_payment_day: 1 } as PaymentMethod
    const ciclos: CreditCardCycle[] = [
      { id: 'ago', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'generated', created_at: '2026-01-01T00:00:00Z', reminder_dismissed_at: null },
    ]
    const raw = [{ id: 't1', date: '2026-09-01', cycle_id: 'ago', payment_method_id: 'visa', amount: 1000, type: 'expense', original_currency: 'ARS' }] as unknown as Transaction[]

    const [t] = prepareTransactions(raw, [visa], [], null, ciclos)
    expect(t.periodDate).toBe('2026-08-20')
  })

  it('con ciclos desparejos NO usa la heuristica del dia del mes', () => {
    // Vencimiento 9-oct con cierre 1-oct: la heuristica vieja (dayOfMonth <= paymentDay + 2)
    // no habria retrocedido el mes, y el consumo de octubre se mostraba en octubre
    // cuando pertenece al resumen que cerro el 1. El ciclo lo dice sin adivinar.
    const master = { id: 'm', type: 'credit', default_closing_day: 27, default_payment_day: 4 } as PaymentMethod
    const ciclos: CreditCardCycle[] = [
      { id: 'oct', user_id: 'u1', payment_method_id: 'm', closing_date: '2026-10-01', due_date: '2026-10-09', source: 'declared', created_at: '2026-01-01T00:00:00Z', reminder_dismissed_at: null },
    ]
    const raw = [{ id: 't2', date: '2026-10-09', cycle_id: 'oct', payment_method_id: 'm', amount: 500, type: 'expense', original_currency: 'ARS' }] as unknown as Transaction[]

    const [t] = prepareTransactions(raw, [master], [], null, ciclos)
    expect(t.periodDate).toBe('2026-10-01')
  })

  it('sin ciclo asignado, periodDate cae a t.date sin inventar un corrimiento', () => {
    const visa = { id: 'visa', type: 'credit', default_closing_day: 20, default_payment_day: 1 } as PaymentMethod
    const raw = [{ id: 't3', date: '2026-09-01', cycle_id: null, payment_method_id: 'visa', amount: 1000, type: 'expense', original_currency: 'ARS' }] as unknown as Transaction[]

    const [t] = prepareTransactions(raw, [visa], [], null, [])
    expect(t.periodDate).toBe('2026-09-01')
  })

  it('convierte USD a ARS con resolveRate', () => {
    const raw = [{
      id: '1', date: '2026-07-05', amount: 0, payment_method_id: null, type: 'expense',
      original_currency: 'USD', original_amount: 10, rate_pair: null, exchange_rate: 1200,
    }] as unknown as Transaction[]
    const [t] = prepareTransactions(raw, [], [], null, [])
    expect(t.amount).toBe(12000) // fallback al snapshot exchange_rate
  })
})

describe('prepareRecurringPlans', () => {
  it('plan en USD queda con amount en ARS', () => {
    const raw = [{ id: '1', amount: 0, currency: 'USD', original_amount: 5, rate_pair: null, exchange_rate: 1000 }] as unknown as RecurringPlan[]
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

describe('prepareTransactions e income_period', () => {
  const ingreso = (over: Partial<Transaction> = {}): Transaction => ({
    id: 't1', user_id: 'u1', description: 'Sueldo', amount: 1_850_000,
    date: '2026-08-29', category_id: 'c1', type: 'income',
    payment_method_id: null, cycle_id: null, purchase_date: null,
    income_period: null, installment_plan_id: null, recurring_plan_id: null,
    card_payment_for: null, is_balance_adjustment: false,
    original_amount: null, original_currency: 'ARS', rate_pair: null,
    exchange_rate: null, confirmation_status: 'confirmed', source: 'manual',
    created_at: '2026-08-29T12:00:00Z',
    ...over,
  } as Transaction)

  const sinMedios: PaymentMethod[] = []

  it('sin income_period, el mes visual sigue siendo el de la fecha', () => {
    const [p] = prepareTransactions([ingreso()], sinMedios, [], null, [])
    expect(p.periodDate).toBe('2026-08-29')
  })

  it('con income_period, el cobro cuenta para ese mes', () => {
    const [p] = prepareTransactions(
      [ingreso({ income_period: '2026-09-01' })], sinMedios, [], null, [],
    )
    expect(p.periodDate).toBe('2026-09-01')
  })

  it('no toca realPaymentDate: la plata entro cuando entro', () => {
    const [p] = prepareTransactions(
      [ingreso({ income_period: '2026-09-01' })], sinMedios, [], null, [],
    )
    expect(p.realPaymentDate).toBe('2026-08-29')
  })

  it('el ciclo de tarjeta le gana a income_period', () => {
    // En la practica un cycle_id solo lo asigna el flujo de tarjeta, que es
    // siempre 'expense' — la combinacion con income_period es teorica (el CHECK
    // de la migracion no la prohibe: solo exige `income_period is null or type =
    // 'income'`). La construimos igual, con los dos campos NO nulos, para que
    // compitan de verdad y quede fijado que el ciclo gana.
    const ciclo: CreditCardCycle = {
      id: 'cy1', user_id: 'u1', payment_method_id: 'visa',
      closing_date: '2026-08-20', due_date: '2026-09-01',
      source: 'generated', created_at: '2026-01-01T00:00:00Z',
      reminder_dismissed_at: null,
    }
    const [p] = prepareTransactions(
      [ingreso({ cycle_id: 'cy1', income_period: '2026-09-01' })],
      sinMedios, [], null, [ciclo],
    )
    expect(p.periodDate).toBe('2026-08-20')
  })
})
