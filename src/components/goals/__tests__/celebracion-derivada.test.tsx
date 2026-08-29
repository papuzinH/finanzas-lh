/**
 * `showCelebration` y `showEndOfMonthBadge` eran estado que un `useEffect`
 * ponía en `true` justo después del primer render — el patrón que
 * `react-hooks/set-state-in-effect` marca, y que cuesta un render de más y un
 * parpadeo: la meta se dibuja «¡Lograda!» sin 🎉 y recién en la pasada
 * siguiente aparece el emoji.
 *
 * Los dos valores son DERIVADOS (`percent >= 100`, «faltan ≤3 días para fin de
 * mes y el presupuesto va ok»), así que se calculan durante el render y el
 * efecto queda sólo para lo que de verdad es un efecto: el confetti y su marca
 * en localStorage.
 *
 * Este test mide la diferencia donde se puede ver: `renderToStaticMarkup` no
 * corre efectos, así que con el estado viejo el 🎉 NO estaba en el markup
 * inicial y con el valor derivado sí.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useFinanceStore } from '@/lib/store/financeStore'
import { SavingsGoalCard } from '../savings-goal-card'
import { esFinDeMesConPresupuestoOk } from '../category-budget-card'
import type { SavingsGoal } from '@/types/database'

const UID = '11111111-1111-4111-8111-111111111111'
const GOAL_ID = 'aaaaaaaa-0000-4000-8000-00000000000a'

const META_CUMPLIDA: SavingsGoal = {
  id: GOAL_ID,
  user_id: UID,
  name: 'Vacaciones',
  target_amount: 100000,
  target_date: null,
  type: 'one_time',
  currency: 'ARS',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
}

const BASE = {
  transactions: [], installmentPlans: [], paymentMethods: [], recurringPlans: [],
  categories: [], categoryBudgets: [], exchangeRates: [], dolarBlue: null,
  displayCurrency: 'ARS', inflationSeries: [], internalTransfers: [],
  isInitialized: true,
}

describe('SavingsGoalCard: la celebración se calcula, no se espera a un efecto', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      ...BASE,
      savingsGoals: [META_CUMPLIDA],
      savingsGoalContributions: [
        { id: 'c1', goal_id: GOAL_ID, user_id: UID, amount: 100000, currency: 'ARS', date: '2026-08-01', note: null, created_at: '2026-08-01T00:00:00Z' },
      ],
    } as never)
  })

  it('una meta al 100% ya sale festejada en el primer render', () => {
    const out = renderToStaticMarkup(<SavingsGoalCard goal={META_CUMPLIDA} />)

    expect(out).toContain('¡Lograda!')
    expect(out).toContain('🎉')
  })

  it('una meta a mitad de camino no muestra el festejo', () => {
    useFinanceStore.setState({
      savingsGoalContributions: [
        { id: 'c1', goal_id: GOAL_ID, user_id: UID, amount: 40000, currency: 'ARS', date: '2026-08-01', note: null, created_at: '2026-08-01T00:00:00Z' },
      ],
    } as never)

    const out = renderToStaticMarkup(<SavingsGoalCard goal={META_CUMPLIDA} />)

    expect(out).not.toContain('¡Lograda!')
    expect(out).not.toContain('🎉')
  })
})

describe('esFinDeMesConPresupuestoOk', () => {
  it('no muestra el badge si el presupuesto no viene bien', () => {
    // 30 de septiembre: último día del mes, pero el presupuesto está excedido.
    expect(esFinDeMesConPresupuestoOk('over', new Date(2026, 8, 30))).toBe(false)
    expect(esFinDeMesConPresupuestoOk(undefined, new Date(2026, 8, 30))).toBe(false)
  })

  it('muestra el badge en los últimos tres días del mes', () => {
    // Septiembre tiene 30: entra desde el 27.
    expect(esFinDeMesConPresupuestoOk('ok', new Date(2026, 8, 27))).toBe(true)
    expect(esFinDeMesConPresupuestoOk('ok', new Date(2026, 8, 30))).toBe(true)
  })

  it('no lo muestra antes de esos tres días', () => {
    expect(esFinDeMesConPresupuestoOk('ok', new Date(2026, 8, 26))).toBe(false)
    expect(esFinDeMesConPresupuestoOk('ok', new Date(2026, 8, 1))).toBe(false)
  })

  it('cuenta bien en febrero, que no tiene 30 días', () => {
    // 2026 no es bisiesto: febrero tiene 28, así que entra desde el 25.
    expect(esFinDeMesConPresupuestoOk('ok', new Date(2026, 1, 25))).toBe(true)
    expect(esFinDeMesConPresupuestoOk('ok', new Date(2026, 1, 24))).toBe(false)
  })
})
