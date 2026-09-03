import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFinanceStore } from '@/lib/store/financeStore'
import { prepareTransactions } from '@/lib/finance/prepare'
import type { CreditCardCycle } from '@/lib/finance/cycles'
import type { Transaction } from '@/types/database'

describe('getMonthlyIncome con cobros imputados', () => {
  beforeEach(() => {
    // Reloj congelado a proposito: el 2026-08-31 un test de paridad pasaba por
    // casualidad del calendario y se habria roto solo en octubre.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T12:00:00'))
  })
  afterEach(() => { vi.useRealTimers() })

  it('cuenta en septiembre un cobro del 29 de agosto imputado a septiembre', () => {
    useFinanceStore.setState({
      transactions: [
        {
          id: 't1', type: 'income', amount: 1_850_000, date: '2026-08-29',
          periodDate: '2026-09-01', realPaymentDate: '2026-08-29',
          income_period: '2026-09-01', is_balance_adjustment: false,
        },
      ] as never,
    })
    expect(useFinanceStore.getState().getMonthlyIncome()).toBe(1_850_000)
  })

  it('sin imputar, ese mismo cobro no cuenta para septiembre', () => {
    useFinanceStore.setState({
      transactions: [
        {
          id: 't1', type: 'income', amount: 1_850_000, date: '2026-08-29',
          periodDate: '2026-08-29', realPaymentDate: '2026-08-29',
          income_period: null, is_balance_adjustment: false,
        },
      ] as never,
    })
    expect(useFinanceStore.getState().getMonthlyIncome()).toBe(0)
  })

  it('getMonthlyIncomeTransactions devuelve las mismas filas que suma getMonthlyIncome', () => {
    useFinanceStore.setState({
      transactions: [
        { id: 't1', type: 'income', amount: 1_000, date: '2026-08-29',
          periodDate: '2026-09-01', income_period: '2026-09-01', is_balance_adjustment: false },
        { id: 't2', type: 'income', amount: 500, date: '2026-08-29',
          periodDate: '2026-08-29', income_period: null, is_balance_adjustment: false },
      ] as never,
    })
    const s = useFinanceStore.getState()
    const suma = s.getMonthlyIncomeTransactions().reduce((a, t) => a + Number(t.amount), 0)
    expect(suma).toBe(s.getMonthlyIncome())
    expect(s.getMonthlyIncome()).toBe(1_000)
  })
})

/**
 * CAMBIO DE COMPORTAMIENTO DECLARADO (2026-09-03).
 *
 * Pasar de `t.date` a `t.periodDate || t.date` no solo movio a los cobros
 * imputados: un ingreso CON cycle_id -- un reintegro de tarjeta -- antes contaba
 * en el mes del VENCIMIENTO y ahora cuenta en el del CIERRE, porque esa es la
 * precedencia que arma prepare.ts (ciclo > income_period > fecha). Cuando las dos
 * fechas caen en meses distintos, el reintegro se corre un mes.
 *
 * El numero nuevo es el correcto y esta decidido: computeMonthlyBalance ya iba por
 * periodDate, o sea que la pantalla se contradecia a si misma. Medido contra
 * produccion: 2 reintegros en tarjeta en total, 1 cambia de mes, 2 usuarios. Este
 * test existe para que el cambio quede FIJADO y no vuelva por accidente.
 *
 * Se arma pasando por prepareTransactions -- no sembrando periodDate a mano --
 * para que el cierre y el vencimiento sean los del ciclo de verdad.
 */
describe('getMonthlyIncome y los reintegros de tarjeta', () => {
  // Cierre en agosto, vencimiento en septiembre: meses distintos a proposito.
  const ciclo: CreditCardCycle = {
    id: 'cy1', user_id: 'u1', payment_method_id: 'visa',
    closing_date: '2026-08-20', due_date: '2026-09-05',
    source: 'generated', created_at: '2026-01-01T00:00:00Z',
    reminder_dismissed_at: null,
  }

  // Para un movimiento de credito, `date` es el VENCIMIENTO: lo escribe el server.
  const reintegro = {
    id: 't1', user_id: 'u1', description: 'Devolucion de una compra',
    amount: 50_000, date: '2026-09-05', category_id: 'c1', type: 'income',
    payment_method_id: 'visa', cycle_id: 'cy1', purchase_date: null,
    income_period: null, installment_plan_id: null, recurring_plan_id: null,
    card_payment_for: null, is_balance_adjustment: false,
    original_amount: null, original_currency: 'ARS', rate_pair: null,
    exchange_rate: null, confirmation_status: 'confirmed', source: 'manual',
    created_at: '2026-08-15T12:00:00Z',
  } as Transaction

  beforeEach(() => {
    vi.useFakeTimers()
    useFinanceStore.setState({
      transactions: prepareTransactions([reintegro], [], [], null, [ciclo]),
    } as never)
  })
  afterEach(() => { vi.useRealTimers() })

  it('cuenta en el mes del CIERRE del resumen', () => {
    vi.setSystemTime(new Date('2026-08-25T12:00:00'))
    expect(useFinanceStore.getState().getMonthlyIncome()).toBe(50_000)
  })

  it('NO cuenta en el mes del vencimiento, que es como contaba antes', () => {
    vi.setSystemTime(new Date('2026-09-15T12:00:00'))
    expect(useFinanceStore.getState().getMonthlyIncome()).toBe(0)
  })

  it('getMonthlyIncomeTransactions lista exactamente lo que suma getMonthlyIncome', () => {
    vi.setSystemTime(new Date('2026-08-25T12:00:00'))
    const s = useFinanceStore.getState()
    expect(s.getMonthlyIncomeTransactions().map((t) => t.id)).toEqual(['t1'])
    expect(s.getMonthlyIncomeTransactions().reduce((a, t) => a + Number(t.amount), 0))
      .toBe(s.getMonthlyIncome())
  })
})
