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
   * Este caso SÍ se puede montar acá, a diferencia de lo que decía una versión
   * anterior de este comentario: `store.getCobrosSinImputar()` es un GETTER, y un
   * getter de zustand llama a `get()` en el momento de ejecutarse -- lee estado
   * fresco sin importar por dónde entró el store al componente. Lo que SÍ queda
   * congelado bajo `renderToStaticMarkup` (sin hidratación real) es un CAMPO leído
   * directo del objeto que devuelve el hook (`store.incomeCountsNextMonth`): ahí
   * `useSyncExternalStore` usa el getServerSnapshot de zustand, `api.getInitialState()`,
   * fijo al crear el store. Por eso la preselección por preferencia se extrajo a
   * `FilaDeCobro` (componente puro, sin store) y se testea sola, con `value` como
   * prop, en `fila-de-cobro.test.tsx` -- ahí sí se ejercitan los dos valores
   * posibles sin depender del snapshot congelado del hook.
   */
  it('lista un cobro con sus dos meses candidatos', () => {
    useFinanceStore.setState({
      transactions: [
        { id: 'a', type: 'income', date: '2026-08-29', income_period: null, amount: 12345,
          is_balance_adjustment: false, description: 'Sueldo' },
      ] as never,
    })
    const html = renderToStaticMarkup(<CobrosSinImputarBanner />)
    expect(html).toContain('Sueldo')
    expect(html).toContain('Agosto')
    expect(html).toContain('Septiembre')
    expect(html).toContain('min-h-11')
  })
})
