import { describe, it, expect, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useFinanceStore } from '@/lib/store/financeStore'
import { DetalleCategoria } from '../charts/detalle-categoria'

const tx = (date: string, amount: number) => ({
  id: date + amount, user_id: 'u1', description: 'x', amount, date,
  type: 'expense', category_id: 'c1', payment_method_id: 'p1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  is_balance_adjustment: false, periodDate: date, realPaymentDate: date,
})

describe('DetalleCategoria', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      installmentPlans: [], paymentMethods: [], recurringPlans: [], categoryBudgets: [],
      savingsGoals: [], savingsGoalContributions: [], exchangeRates: [], dolarBlue: null,
      displayCurrency: 'ARS', internalTransfers: [], isInitialized: true, inflationSeries: [],
      categories: [{ id: 'c1', user_id: 'u1', name: 'Casa', emoji: '🏠', type: 'expense' }],
      transactions: [tx('2026-05-05', 500), tx('2026-06-05', 550), tx('2026-07-05', 900)],
    } as never)
  })

  it('muestra el nombre de la categoría y una barra por mes', () => {
    const out = renderToStaticMarkup(<DetalleCategoria categoryId="c1" />)

    expect(out).toContain('Casa')
    expect(out.match(/data-barra/g)!.length).toBeGreaterThanOrEqual(3)
  })

  it('aclara la unidad, porque el número no coincide con Movimientos', () => {
    const out = renderToStaticMarkup(<DetalleCategoria categoryId="c1" />)
    expect(out).toMatch(/pesos de hoy/i)
  })

  it('no rompe con una categoría que no tiene datos', () => {
    expect(() => renderToStaticMarkup(<DetalleCategoria categoryId="no-existe" />)).not.toThrow()
  })
})
