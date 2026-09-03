/**
 * Repaso de los cobros de fin de mes cargados antes de que existiera la
 * imputacion (ver src/lib/finance/imputacion-ingresos.ts). El caso mas frecuente
 * es que no haya ninguno: el banner tiene que rendir vacio sin romper nada, igual
 * que OverdueCardPaymentBanner.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useFinanceStore } from '@/lib/store/financeStore'
import { CobrosSinImputarBanner } from '../cobros-sin-imputar-banner'

beforeEach(() => {
  useFinanceStore.setState({
    transactions: [], paymentMethods: [], installmentPlans: [], recurringPlans: [],
    categories: [], categoryBudgets: [], savingsGoals: [], savingsGoalContributions: [],
    exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS', inflationSeries: [],
    internalTransfers: [], incomeCountsNextMonth: null,
  } as never)
})

describe('getCobrosSinImputar', () => {
  it('lista los ingresos del borde que no tienen mes declarado', () => {
    useFinanceStore.setState({
      transactions: [
        { id: 'a', type: 'income', date: '2026-08-29', income_period: null, amount: 100,
          is_balance_adjustment: false },
        { id: 'b', type: 'income', date: '2026-08-29', income_period: '2026-09-01', amount: 100,
          is_balance_adjustment: false },
        { id: 'c', type: 'income', date: '2026-08-15', income_period: null, amount: 100,
          is_balance_adjustment: false },
        { id: 'd', type: 'expense', date: '2026-08-29', income_period: null, amount: 100,
          is_balance_adjustment: false },
      ] as never,
    })
    expect(useFinanceStore.getState().getCobrosSinImputar().map((t) => t.id)).toEqual(['a'])
  })
})

describe('CobrosSinImputarBanner', () => {
  it('no se muestra si no hay cobros ambiguos', () => {
    expect(renderToStaticMarkup(<CobrosSinImputarBanner />)).toBe('')
  })

  /**
   * El caso CON cobros no se monta acá a propósito -- igual que
   * OverdueCardPaymentBanner (ver su test). `useFinanceStore()` (el store entero)
   * usa, bajo `useSyncExternalStore`, el getServerSnapshot de zustand ==
   * `api.getInitialState()`, fijo al crear el store -- en cualquier render sin
   * hidratación real, que es exactamente lo que hace `renderToStaticMarkup`. Un
   * `store.<campo>` accedido así siempre ve el estado INICIAL, nunca lo que
   * `setState` haya puesto después (los GETTERS sí ven estado fresco: llaman a
   * `get()` en el momento de ejecutarse, no leen el snapshot memoizado del hook).
   * En el navegador esto no aplica: tras la hidratación, `useSyncExternalStore`
   * pasa a usar `getSnapshot` (en vivo) en cada re-render. La cobertura de
   * `mesPorDefecto` en sí vive en lib/finance/__tests__/imputacion-ingresos.test.ts.
   */
})
