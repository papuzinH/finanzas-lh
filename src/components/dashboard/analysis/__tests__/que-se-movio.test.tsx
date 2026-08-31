import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useFinanceStore } from '@/lib/store/financeStore'
import { QueSeMovio, textoReferencia } from '../charts/que-se-movio'

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

// IPC de prueba para los tests que SÍ quieren `deflactado: true` (la mayoría: lo
// que se está probando ahí es agrupado/orden/toggle, no la honestidad de la
// unidad). Los tests dedicados a `deflactado: false` (fix-final, Important 3)
// usan `inflationSeries: []` explícito más abajo.
const IPC_PRUEBA = [
  { month: '2026-01', rate: 2 }, { month: '2026-02', rate: 2 }, { month: '2026-03', rate: 2 },
  { month: '2026-04', rate: 2 }, { month: '2026-05', rate: 2 }, { month: '2026-06', rate: 2 },
  { month: '2026-07', rate: 2 }, { month: '2026-08', rate: 2 },
]

describe('QueSeMovio', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      ...BASE,
      inflationSeries: IPC_PRUEBA,
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

  it('el toggle de vara llega a los 44px de touch target y expone cuál está activa', () => {
    const out = renderToStaticMarkup(<QueSeMovio onSelect={() => {}} />)
    expect(out).toContain('min-h-11')
    expect(out).toContain('aria-pressed="true"')
    expect(out).toContain('aria-pressed="false"')
  })
})

// Fix-final, ola 1 — Important 3: sin datos de IPC, todos los factores de
// `factorAPesosDeHoy` dan 1 y los montos son nominales. Antes el encabezado y el
// detalle igual imprimían "en pesos de hoy" (ajustado): una cifra que se dice
// ajustada sin estarlo es peor que una cifra sin etiquetar, porque afirma algo
// falso. `computeHistorico` ahora expone `deflactado` y la UI tiene que hablar
// en pesos corrientes cuando es `false`.
describe('QueSeMovio · sin datos de inflación (Important 3)', () => {
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

  it('dice "pesos corrientes" y NO afirma un ajuste que no hizo', () => {
    const out = renderToStaticMarkup(<QueSeMovio onSelect={() => {}} />)
    expect(out).toMatch(/pesos corrientes/i)
    expect(out).not.toMatch(/pesos de hoy/i)
    expect(out).not.toMatch(/ajusta por inflación/i)
  })
})

// Fix-final, ola 1 — punto 7: invariante del spec, testeable comparando el
// `indexOf` de dos nombres de categoría en el string de salida.
describe('QueSeMovio · orden de las filas (invariante del spec)', () => {
  it('"Cambió de nivel" ordena por |desvío| descendente y "Fue una vez" por monto del pico descendente', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15)) // 15 de agosto de 2026

    try {
      useFinanceStore.setState({
        ...BASE,
        inflationSeries: [],
        categories: [
          { id: 'c1', user_id: 'u1', name: 'Supermercado', emoji: '🛒', type: 'expense' },
          { id: 'c2', user_id: 'u1', name: 'Casa', emoji: '🏠', type: 'expense' },
          { id: 'c3', user_id: 'u1', name: 'Fernet', emoji: '🍷', type: 'expense' },
          { id: 'c4', user_id: 'u1', name: 'Uso personal', emoji: '💅', type: 'expense' },
        ],
        transactions: [
          // Supermercado: sube fuerte en agosto -> desvío grande (nivel)
          tx('2026-05-05', 100, 'c1'), tx('2026-06-05', 100, 'c1'), tx('2026-07-05', 100, 'c1'), tx('2026-08-05', 900, 'c1'),
          // Casa: sube poco -> desvío chico (nivel)
          tx('2026-05-05', 500, 'c2'), tx('2026-06-05', 500, 'c2'), tx('2026-07-05', 500, 'c2'), tx('2026-08-05', 600, 'c2'),
          // Fernet: pico grande en julio (evento)
          tx('2026-05-05', 10, 'c3'), tx('2026-06-05', 10, 'c3'), tx('2026-07-17', 5000, 'c3'),
          // Uso personal: pico chico en julio (evento)
          tx('2026-05-05', 10, 'c4'), tx('2026-06-05', 10, 'c4'), tx('2026-07-20', 100, 'c4'),
        ],
      } as never)

      const out = renderToStaticMarkup(<QueSeMovio onSelect={() => {}} />)

      // Cambió de nivel: Supermercado (desvío ~800%) antes que Casa (desvío ~20%).
      expect(out.indexOf('Supermercado')).toBeLessThan(out.indexOf('Casa'))
      // Fue una vez: Fernet (pico $5.000) antes que Uso personal (pico $100).
      expect(out.indexOf('Fernet')).toBeLessThan(out.indexOf('Uso personal'))
    } finally {
      vi.useRealTimers()
    }
  })
})

// Fix round 1 — Hallazgo 1: mesesDeReferencia sale de computeHistorico ordenado
// nuevo→viejo (índice 0 = el mes más reciente antes de mesAncla); el header
// tiene que decir el rango viejo→nuevo (orden cronológico natural), no al revés.
// Hallazgo 2: mesesDeReferencia es la ventana ESTRUCTURAL, pero el promedio de
// cada fila corre sólo sobre SUS meses con actividad — el texto no puede
// prometer que promedia sobre toda la ventana.
describe('textoReferencia', () => {
  it('nombra el rango en orden cronológico ascendente (viejo → nuevo)', () => {
    // Tal como lo entrega computeHistorico: índice 0 = más nuevo.
    expect(textoReferencia('promedio', ['2026-06', '2026-05', '2026-04', '2026-03', '2026-02']))
      .toBe('según lo que tengas cargado entre febrero y junio')
  })

  it('no afirma que promedia sobre toda la ventana — sólo nombra el rango de datos', () => {
    const texto = textoReferencia('promedio', ['2026-07', '2026-06', '2026-05', '2026-04', '2026-03'])
    expect(texto).not.toMatch(/^de /) // "de marzo a julio" prometía que TODOS entraron al promedio
    expect(texto).toMatch(/según lo que tengas cargado/)
  })

  it('con un solo mes de referencia no repite el mes', () => {
    expect(textoReferencia('promedio', ['2026-06'])).toBe('según lo que tengas cargado en junio')
  })

  it('con mes_anterior nombra el mes exacto de comparación, sin ventana (es preciso, no una ventana)', () => {
    expect(textoReferencia('mes_anterior', ['2026-06', '2026-05', '2026-04'])).toBe('contra junio')
  })

  it('sin meses de referencia no hay nada que nombrar', () => {
    expect(textoReferencia('promedio', [])).toBeNull()
  })
})

describe('QueSeMovio · encabezado del rango (integración, fecha controlada)', () => {
  it('el header muestra el rango en orden cronológico ascendente', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 15)) // 15 de julio de 2026: día ≥3, no cae a mes cerrado

    try {
      useFinanceStore.setState({
        ...BASE,
        inflationSeries: [],
        categories: [{ id: 'c1', user_id: 'u1', name: 'Casa', emoji: '🏠', type: 'expense' }],
        transactions: [
          tx('2026-05-05', 500, 'c1'), tx('2026-06-05', 550, 'c1'), tx('2026-07-05', 900, 'c1'),
        ],
      } as never)

      // Ground truth verificado contra computeHistorico para este escenario:
      // mesAncla '2026-07', mesesDeReferencia = ['2026-06','2026-05','2026-04','2026-03','2026-02'].
      const out = renderToStaticMarkup(<QueSeMovio onSelect={() => {}} />)
      expect(out).toContain('según lo que tengas cargado entre febrero y junio')
      expect(out).not.toContain('de junio a febrero')
    } finally {
      vi.useRealTimers()
    }
  })
})
