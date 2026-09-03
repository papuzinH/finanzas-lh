import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFinanceStore } from '@/lib/store/financeStore'

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
