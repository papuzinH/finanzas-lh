import { describe, it, expect, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useFinanceStore } from '@/lib/store/financeStore'
import { QueSeMovio } from '../charts/que-se-movio'

const tx = (date: string, amount: number, category_id: string) => ({
  id: date + amount + category_id, user_id: 'u1', description: 'x', amount, date,
  type: 'expense', category_id, payment_method_id: 'p1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  is_balance_adjustment: false, periodDate: date, realPaymentDate: date,
})

const BASE = {
  installmentPlans: [], paymentMethods: [], recurringPlans: [], categoryBudgets: [],
  savingsGoals: [], savingsGoalContributions: [], exchangeRates: [], dolarBlue: null,
  displayCurrency: 'ARS', internalTransfers: [], isInitialized: true,
}

describe('QueSeMovio', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      ...BASE,
      inflationSeries: [],
      categories: [
        { id: 'c1', user_id: 'u1', name: 'Casa', emoji: '🏠', type: 'expense' },
        { id: 'c2', user_id: 'u1', name: 'Fernet', emoji: '🍷', type: 'expense' },
      ],
      transactions: [
        tx('2026-05-05', 500, 'c1'), tx('2026-06-05', 550, 'c1'), tx('2026-07-05', 900, 'c1'),
        tx('2026-05-05', 10, 'c2'), tx('2026-06-05', 10, 'c2'), tx('2026-07-17', 5000, 'c2'),
      ],
    } as never)
  })

  it('separa las que cambiaron de nivel de las que fueron una vez', () => {
    const out = renderToStaticMarkup(<QueSeMovio onSelect={() => {}} />)

    expect(out).toContain('Cambió de nivel')
    expect(out).toContain('Fue una vez')
  })

  it('dice contra qué compara, para que no haya que adivinarlo', () => {
    const out = renderToStaticMarkup(<QueSeMovio onSelect={() => {}} />)
    expect(out).toMatch(/promedio/i)
  })

  it('aclara que los montos están en pesos de hoy', () => {
    const out = renderToStaticMarkup(<QueSeMovio onSelect={() => {}} />)
    expect(out).toMatch(/pesos de hoy/i)
  })
})
