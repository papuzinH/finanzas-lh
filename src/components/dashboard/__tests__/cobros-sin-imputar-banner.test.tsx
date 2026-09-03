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

  /**
   * Un reintegro de tarjeta no se pregunta (el ciclo le gana a income_period), y
   * ademas su `t.date` es el VENCIMIENTO que escribio el server, no el dia en que
   * entro la plata: el test del borde y `mesesCandidatos` saldrian de la fecha
   * equivocada. Sin este filtro, cualquier tarjeta que venza a fin de mes metia
   * TODOS sus reintegros en el banner ofreciendo los meses del vencimiento.
   */
  it('deja afuera los reintegros de tarjeta, por cycle_id y por tipo de medio', () => {
    useFinanceStore.setState({
      paymentMethods: [
        { id: 'visa', name: 'Visa', type: 'credit' },
        { id: 'mp', name: 'Mercado Pago', type: 'debit' },
      ] as never,
      transactions: [
        // Imputado a un resumen: la pertenencia ya la decide el ciclo.
        { id: 'ciclo', type: 'income', date: '2026-08-29', income_period: null, amount: 100,
          is_balance_adjustment: false, cycle_id: 'cy1', payment_method_id: 'visa' },
        // Sin ciclo materializado, pero el medio ES una tarjeta: t.date sigue siendo
        // el vencimiento, asi que tampoco se pregunta por el.
        { id: 'sinCiclo', type: 'income', date: '2026-08-29', income_period: null, amount: 100,
          is_balance_adjustment: false, cycle_id: null, payment_method_id: 'visa' },
        // Este si: plata que entro a una cuenta, en el borde del mes.
        { id: 'debito', type: 'income', date: '2026-08-29', income_period: null, amount: 100,
          is_balance_adjustment: false, cycle_id: null, payment_method_id: 'mp' },
        // Sin medio asignado tampoco se pierde: no hay nada que lo haga de credito.
        { id: 'sinMedio', type: 'income', date: '2026-08-29', income_period: null, amount: 100,
          is_balance_adjustment: false, cycle_id: null, payment_method_id: null },
      ] as never,
    })
    expect(useFinanceStore.getState().getCobrosSinImputar().map((t) => t.id))
      .toEqual(['debito', 'sinMedio'])
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
