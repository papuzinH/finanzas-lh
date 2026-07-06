import { describe, it, expect } from 'vitest'
import type { SavingsGoal, SavingsGoalContribution, CategoryBudget, Category } from '@/types/database'

// ============================================================
// FUNCIONES PURAS EXTRAÍDAS DEL STORE PARA TESTING
// Estas son versiones testables que no dependen de Zustand
// ============================================================

interface GoalProgress {
  goal: SavingsGoal
  totalContributed: number
  currentMonthContributed: number
  target: number
  percent: number
  remaining: number
  daysLeft: number | null
  status: 'active' | 'completed'
}

function calculateGoalProgress(
  goal: SavingsGoal,
  contributions: SavingsGoalContribution[],
  now: Date
): GoalProgress {
  const goalContributions = contributions.filter((c) => c.goal_id === goal.id)
  const totalContributed = goalContributions.reduce((acc, c) => acc + Number(c.amount), 0)

  const currentMonthContributed = goalContributions
    .filter((c) => {
      const [year, month] = c.date.split('-').map(Number)
      return year === now.getFullYear() && month === now.getMonth() + 1
    })
    .reduce((acc, c) => acc + Number(c.amount), 0)

  const target = Number(goal.target_amount)
  const effectiveContributed = goal.type === 'monthly' ? currentMonthContributed : totalContributed
  const percent = target > 0 ? Math.min((effectiveContributed / target) * 100, 100) : 0
  const remaining = Math.max(target - effectiveContributed, 0)

  let daysLeft: number | null = null
  if (goal.type === 'one_time' && goal.target_date) {
    const targetDate = new Date(goal.target_date)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diffMs = targetDate.getTime() - startOfToday.getTime()
    daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  }

  const status: 'active' | 'completed' = effectiveContributed >= target ? 'completed' : 'active'

  return { goal, totalContributed, currentMonthContributed, target, percent, remaining, daysLeft, status }
}

interface BudgetStatus {
  budget: CategoryBudget
  categoryName: string
  categoryEmoji: string | null
  spent: number
  limit: number
  percent: number
  status: 'ok' | 'warning' | 'exceeded'
}

function calculateBudgetStatus(
  budget: CategoryBudget,
  categories: Category[],
  expensesByCategory: Record<string, number>
): BudgetStatus {
  const category = categories.find((c) => c.id === budget.category_id)
  const categoryName = category?.name ?? 'Sin categoría'
  const categoryEmoji = category?.emoji ?? null
  const spent = expensesByCategory[categoryName] ?? 0
  const limit = Number(budget.amount)
  const percent = limit > 0 ? (spent / limit) * 100 : 0
  const status: 'ok' | 'warning' | 'exceeded' =
    percent >= 100 ? 'exceeded' : percent >= 80 ? 'warning' : 'ok'

  return { budget, categoryName, categoryEmoji, spent, limit, percent, status }
}

// ============================================================
// DATOS DE TEST
// ============================================================

const makeGoal = (overrides: Partial<SavingsGoal> = {}): SavingsGoal => ({
  id: 'goal-1',
  user_id: 'user-1',
  name: 'Vacaciones',
  type: 'one_time',
  target_amount: 100000,
  currency: 'ARS',
  target_date: '2026-12-31',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const makeContribution = (overrides: Partial<SavingsGoalContribution> = {}): SavingsGoalContribution => ({
  id: 'contrib-1',
  goal_id: 'goal-1',
  user_id: 'user-1',
  amount: 10000,
  currency: 'ARS',
  note: null,
  date: '2026-03-15',
  created_at: '2026-03-15T00:00:00Z',
  ...overrides,
})

const makeBudget = (overrides: Partial<CategoryBudget> = {}): CategoryBudget => ({
  id: 'budget-1',
  user_id: 'user-1',
  category_id: 'cat-1',
  amount: 80000,
  currency: 'ARS',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'cat-1',
  user_id: 'user-1',
  name: 'Comida',
  emoji: '🍔',
  description: null,
  is_system: false,
  type: 'expense',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const NOW = new Date('2026-03-22T12:00:00Z')

// ============================================================
// TESTS: METAS DE AHORRO
// ============================================================

describe('calculateGoalProgress - one_time', () => {
  it('retorna progreso 0 sin contribuciones', () => {
    const goal = makeGoal()
    const result = calculateGoalProgress(goal, [], NOW)

    expect(result.totalContributed).toBe(0)
    expect(result.percent).toBe(0)
    expect(result.remaining).toBe(100000)
    expect(result.status).toBe('active')
  })

  it('calcula progreso correcto con una contribución', () => {
    const goal = makeGoal()
    const contributions = [makeContribution({ amount: 25000 })]
    const result = calculateGoalProgress(goal, contributions, NOW)

    expect(result.totalContributed).toBe(25000)
    expect(result.percent).toBe(25)
    expect(result.remaining).toBe(75000)
    expect(result.status).toBe('active')
  })

  it('calcula progreso correcto con múltiples contribuciones', () => {
    const goal = makeGoal()
    const contributions = [
      makeContribution({ id: 'c1', amount: 30000, date: '2026-01-15' }),
      makeContribution({ id: 'c2', amount: 50000, date: '2026-02-10' }),
    ]
    const result = calculateGoalProgress(goal, contributions, NOW)

    expect(result.totalContributed).toBe(80000)
    expect(result.percent).toBe(80)
    expect(result.remaining).toBe(20000)
    expect(result.status).toBe('active')
  })

  it('marca como completada cuando se alcanza o supera el target', () => {
    const goal = makeGoal()
    const contributions = [makeContribution({ amount: 100000 })]
    const result = calculateGoalProgress(goal, contributions, NOW)

    expect(result.percent).toBe(100)
    expect(result.remaining).toBe(0)
    expect(result.status).toBe('completed')
  })

  it('limita el porcentaje a 100% aunque se supere el target', () => {
    const goal = makeGoal()
    const contributions = [makeContribution({ amount: 150000 })]
    const result = calculateGoalProgress(goal, contributions, NOW)

    expect(result.percent).toBe(100) // Capped at 100
    expect(result.status).toBe('completed')
  })

  it('filtra contribuciones por goal_id correctamente', () => {
    const goal = makeGoal({ id: 'goal-A' })
    const contributions = [
      makeContribution({ id: 'c1', goal_id: 'goal-A', amount: 40000 }),
      makeContribution({ id: 'c2', goal_id: 'goal-B', amount: 60000 }), // Different goal
    ]
    const result = calculateGoalProgress(goal, contributions, NOW)

    expect(result.totalContributed).toBe(40000) // Only goal-A contributions
  })

  it('calcula daysLeft correctamente para metas con fecha', () => {
    const goal = makeGoal({ target_date: '2026-03-29' }) // 7 days from NOW
    const result = calculateGoalProgress(goal, [], NOW)

    expect(result.daysLeft).toBe(7)
  })

  it('retorna daysLeft null para metas sin fecha', () => {
    const goal = makeGoal({ target_date: null })
    const result = calculateGoalProgress(goal, [], NOW)

    expect(result.daysLeft).toBeNull()
  })
})

describe('calculateGoalProgress - monthly', () => {
  it('usa solo contribuciones del mes actual para metas mensuales', () => {
    const goal = makeGoal({ type: 'monthly', target_date: null })
    const contributions = [
      makeContribution({ id: 'c1', amount: 20000, date: '2026-02-15' }), // Previous month
      makeContribution({ id: 'c2', amount: 30000, date: '2026-03-10' }), // Current month
    ]
    const result = calculateGoalProgress(goal, contributions, NOW)

    expect(result.currentMonthContributed).toBe(30000)
    expect(result.totalContributed).toBe(50000) // All contributions
    expect(result.percent).toBe(30) // Only current month vs target
  })

  it('resetea el progreso si no hay contribuciones este mes', () => {
    const goal = makeGoal({ type: 'monthly', target_amount: 50000, target_date: null })
    const contributions = [
      makeContribution({ id: 'c1', amount: 50000, date: '2026-02-15' }), // Last month
    ]
    const result = calculateGoalProgress(goal, contributions, NOW)

    expect(result.currentMonthContributed).toBe(0)
    expect(result.percent).toBe(0)
    expect(result.status).toBe('active')
  })

  it('retorna daysLeft null para metas mensuales', () => {
    const goal = makeGoal({ type: 'monthly', target_date: null })
    const result = calculateGoalProgress(goal, [], NOW)

    expect(result.daysLeft).toBeNull()
  })
})

// ============================================================
// TESTS: PRESUPUESTOS POR CATEGORÍA
// ============================================================

describe('calculateBudgetStatus', () => {
  it('retorna status ok cuando el gasto está por debajo del 80%', () => {
    const budget = makeBudget({ amount: 100000 })
    const categories = [makeCategory()]
    const expenses = { 'Comida': 50000 }
    const result = calculateBudgetStatus(budget, categories, expenses)

    expect(result.spent).toBe(50000)
    expect(result.limit).toBe(100000)
    expect(result.percent).toBe(50)
    expect(result.status).toBe('ok')
  })

  it('retorna status warning cuando el gasto está entre 80% y 100%', () => {
    const budget = makeBudget({ amount: 100000 })
    const categories = [makeCategory()]
    const expenses = { 'Comida': 85000 }
    const result = calculateBudgetStatus(budget, categories, expenses)

    expect(result.percent).toBe(85)
    expect(result.status).toBe('warning')
  })

  it('retorna status exceeded cuando el gasto supera el 100%', () => {
    const budget = makeBudget({ amount: 80000 })
    const categories = [makeCategory()]
    const expenses = { 'Comida': 95000 }
    const result = calculateBudgetStatus(budget, categories, expenses)

    expect(result.spent).toBe(95000)
    expect(result.limit).toBe(80000)
    expect(result.percent).toBeCloseTo(118.75)
    expect(result.status).toBe('exceeded')
  })

  it('retorna 0 de gasto si no hay transacciones en esa categoría', () => {
    const budget = makeBudget({ amount: 50000 })
    const categories = [makeCategory()]
    const expenses = {} // No expenses for Comida
    const result = calculateBudgetStatus(budget, categories, expenses)

    expect(result.spent).toBe(0)
    expect(result.percent).toBe(0)
    expect(result.status).toBe('ok')
  })

  it('retorna categoryName y categoryEmoji correctamente', () => {
    const budget = makeBudget()
    const categories = [makeCategory({ name: 'Transporte', emoji: '🚗' })]
    const expenses = { 'Transporte': 30000 }
    const result = calculateBudgetStatus(budget, categories, expenses)

    expect(result.categoryName).toBe('Transporte')
    expect(result.categoryEmoji).toBe('🚗')
  })

  it('usa "Sin categoría" si no encuentra la categoría', () => {
    const budget = makeBudget({ category_id: 'unknown-cat' })
    const categories = [makeCategory({ id: 'other-cat' })]
    const expenses = {}
    const result = calculateBudgetStatus(budget, categories, expenses)

    expect(result.categoryName).toBe('Sin categoría')
    expect(result.categoryEmoji).toBeNull()
  })

  it('retorna exactamente 80% como warning (límite inferior)', () => {
    const budget = makeBudget({ amount: 100000 })
    const categories = [makeCategory()]
    const expenses = { 'Comida': 80000 }
    const result = calculateBudgetStatus(budget, categories, expenses)

    expect(result.percent).toBe(80)
    expect(result.status).toBe('warning')
  })

  it('retorna exactamente 100% como exceeded', () => {
    const budget = makeBudget({ amount: 100000 })
    const categories = [makeCategory()]
    const expenses = { 'Comida': 100000 }
    const result = calculateBudgetStatus(budget, categories, expenses)

    expect(result.percent).toBe(100)
    expect(result.status).toBe('exceeded')
  })
})
