import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency } from '@/lib/utils'
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

  it('por default compara contra el promedio, y lo nombra', () => {
    const out = renderToStaticMarkup(<DetalleCategoria categoryId="c1" />)
    expect(out).toMatch(/contra tu promedio/)
  })
})

// Fix round 1 — Hallazgo 1: sólo se llega a este componente desde una fila de
// <QueSeMovio>, que tiene su propio toggle de vara ('promedio' | 'mes_anterior').
// Antes del fix, el modal llamaba getHistorico('promedio') fijo sin importar
// qué vara mostraba la fila que lo abrió — podía decir "Bajó" cuando la fila
// decía "Subió" para la MISMA categoría, en la MISMA sesión.
describe('DetalleCategoria · vara', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      installmentPlans: [], paymentMethods: [], recurringPlans: [], categoryBudgets: [],
      savingsGoals: [], savingsGoalContributions: [], exchangeRates: [], dolarBlue: null,
      displayCurrency: 'ARS', internalTransfers: [], isInitialized: true, inflationSeries: [],
      categories: [{ id: 'c1', user_id: 'u1', name: 'Casa', emoji: '🏠', type: 'expense' }],
      transactions: [tx('2026-05-05', 500), tx('2026-06-05', 550), tx('2026-07-05', 900)],
    } as never)
  })

  it('con vara "mes_anterior" nombra el mes pasado, no el promedio', () => {
    const out = renderToStaticMarkup(<DetalleCategoria categoryId="c1" vara="mes_anterior" />)
    expect(out).toMatch(/contra el mes pasado/)
    expect(out).not.toMatch(/contra tu promedio/)
  })
})

// Fix round 1 — Hallazgo 2: `ultimoCerrado` cae a `fila.puntos[length - 1]`
// cuando la categoría tiene UN SOLO punto y es el mes en curso (categoría
// nueva, o primer mes de uso de la app) — no es una anomalía de datos, es el
// flujo normal de un usuario nuevo. Antes del fix, la cifra hero mostraba ese
// total parcial sin ningún aviso pegado al número.
describe('DetalleCategoria · cifra hero parcial', () => {
  it('avisa con el mismo asterisco de las etiquetas de mes cuando el único punto es el mes en curso', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15)) // 15 de agosto de 2026: agosto es "hoy"

    try {
      useFinanceStore.setState({
        installmentPlans: [], paymentMethods: [], recurringPlans: [], categoryBudgets: [],
        savingsGoals: [], savingsGoalContributions: [], exchangeRates: [], dolarBlue: null,
        displayCurrency: 'ARS', internalTransfers: [], isInitialized: true, inflationSeries: [],
        categories: [{ id: 'c1', user_id: 'u1', name: 'Streaming', emoji: '📺', type: 'expense' }],
        // Único movimiento: cae dentro del mes en curso (agosto). Ningún mes cerrado.
        transactions: [tx('2026-08-05', 300)],
      } as never)

      const out = renderToStaticMarkup(<DetalleCategoria categoryId="c1" />)

      // La cifra hero (font-display) tiene que llevar el asterisco pegado al
      // número, no sólo la nota al pie del gráfico.
      expect(out).toContain(`${formatCurrency(300)}*`)
      expect(out).toMatch(/el mes todavía no cerró/)
    } finally {
      vi.useRealTimers()
    }
  })
})
