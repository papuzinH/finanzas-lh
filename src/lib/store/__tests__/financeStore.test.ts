import { describe, it, expect } from 'vitest'
import type { Transaction, RecurringPlan } from '@/types/database'

/**
 * FUNCIONES PURAS EXTRAÍDAS DEL STORE PARA TESTING
 * Estas son versiones testables que no dependen de Zustand
 */

// Calcular balance global
// currentMonth: 'YYYY-MM' del mes a considerar para cuotas (default: mes actual)
function calculateGlobalBalance(
  transactions: Transaction[],
  recurringPlans: RecurringPlan[] = [],
  currentMonthStr?: string,
): number {
  const now = new Date()
  const yearMonth = currentMonthStr ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [y, m] = yearMonth.split('-').map(Number)

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + Number(t.amount), 0)

  // Gastos variables históricos (sin cuotas ni Mensualidades recurrentes)
  const variableExpenses = transactions
    .filter((t) => t.type === 'expense' && !t.installment_plan_id && !t.recurring_plan_id)
    .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0)

  // Solo cuotas del mes actual
  const currentMonthInstallments = transactions
    .filter((t) => {
      if (t.type !== 'expense' || !t.installment_plan_id) return false
      const [ty, tm] = t.date.split('-').map(Number)
      return ty === y && tm === m
    })
    .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0)

  // Mensualidades/fijos activos (burn rate)
  const burnRate = recurringPlans
    .filter((p) => p.is_active)
    .reduce((acc, p) => acc + Math.abs(Number(p.amount)), 0)

  return totalIncome - variableExpenses - currentMonthInstallments - burnRate
}

// Calcular monthly burn rate
function calculateMonthlyBurnRate(recurringPlans: RecurringPlan[]): number {
  return recurringPlans
    .filter((p) => p.is_active)
    .reduce((acc, p) => acc + Math.abs(Number(p.amount)), 0)
}

// Calcular monthly variable expenses
function calculateMonthlyVariableExpenses(
  transactions: Transaction[],
  now: Date
): number {
  return transactions
    .filter((t) => {
      if (t.type !== 'expense') return false
      if (t.installment_plan_id) return false
      if (t.recurring_plan_id) return false

      // Parsear fecha como local (sin conversión UTC)
      const dateStr = t.date
      const [year, month, day] = dateStr.split('-').map(Number)
      const localDate = new Date(year, month - 1, day)

      return (
        localDate.getMonth() === now.getMonth() &&
        localDate.getFullYear() === now.getFullYear()
      )
    })
    .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0)
}

describe('financeStore - Pure Functions', () => {
  describe('calculateGlobalBalance', () => {
    it('calcula balance correcto con solo ingresos', () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'income',
          amount: 1000,
          date: '2024-03-15',
          description: 'Salary',
          payment_method_id: 1,
          category_id: 1,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-15',
        },
        {
          id: 2,
          user_id: 'user1',
          type: 'income',
          amount: 500,
          date: '2024-03-20',
          description: 'Freelance',
          payment_method_id: 1,
          category_id: 1,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-20',
        },
      ]

      const balance = calculateGlobalBalance(transactions)
      expect(balance).toBe(1500)
    })

    it('calcula balance correcto con ingresos y gastos', () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'income',
          amount: 1000,
          date: '2024-03-15',
          description: 'Salary',
          payment_method_id: 1,
          category_id: 1,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-15',
        },
        {
          id: 2,
          user_id: 'user1',
          type: 'expense',
          amount: -300,
          date: '2024-03-16',
          description: 'Groceries',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-16',
        },
        {
          id: 3,
          user_id: 'user1',
          type: 'expense',
          amount: -200,
          date: '2024-03-17',
          description: 'Gas',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-17',
        },
      ]

      const balance = calculateGlobalBalance(transactions)
      expect(balance).toBe(500) // 1000 - 300 - 200
    })

    it('maneja montos negativos en gastos correctamente', () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'income',
          amount: 2000,
          date: '2024-03-15',
          description: 'Salary',
          payment_method_id: 1,
          category_id: 1,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-15',
        },
        {
          id: 2,
          user_id: 'user1',
          type: 'expense',
          amount: -1500,
          date: '2024-03-16',
          description: 'Rent',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-16',
        },
      ]

      const balance = calculateGlobalBalance(transactions)
      expect(balance).toBe(500) // 2000 - 1500
    })

    it('retorna 0 cuando no hay transacciones', () => {
      const transactions: Transaction[] = []
      const balance = calculateGlobalBalance(transactions)
      expect(balance).toBe(0)
    })

    it('balance negativo cuando gastos superen ingresos', () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'income',
          amount: 500,
          date: '2024-03-15',
          description: 'Salary',
          payment_method_id: 1,
          category_id: 1,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-15',
        },
        {
          id: 2,
          user_id: 'user1',
          type: 'expense',
          amount: -1000,
          date: '2024-03-16',
          description: 'Emergency',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-16',
        },
      ]

      const balance = calculateGlobalBalance(transactions)
      expect(balance).toBe(-500)
    })

    it('solo resta las cuotas del mes actual, no las de otros meses', () => {
      // Plan de 9000 en 3 cuotas de 3000 (marzo, abril, mayo)
      // Evaluado en marzo: solo resta la cuota de marzo
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'income',
          amount: 10000,
          date: '2024-03-01',
          description: 'Salary',
          payment_method_id: 1,
          category_id: 1,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-01',
        },
        {
          id: 2,
          user_id: 'user1',
          type: 'expense',
          amount: -3000,
          date: '2024-03-20', // mes actual ✓
          description: 'TV cuota 1/3',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: 1,
          recurring_plan_id: null,
          created_at: '2024-03-01',
        },
        {
          id: 3,
          user_id: 'user1',
          type: 'expense',
          amount: -3000,
          date: '2024-04-20', // otro mes → NO contar
          description: 'TV cuota 2/3',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: 1,
          recurring_plan_id: null,
          created_at: '2024-03-01',
        },
        {
          id: 4,
          user_id: 'user1',
          type: 'expense',
          amount: -3000,
          date: '2024-05-20', // otro mes → NO contar
          description: 'TV cuota 3/3',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: 1,
          recurring_plan_id: null,
          created_at: '2024-03-01',
        },
      ]
      const balance = calculateGlobalBalance(transactions, [], '2024-03')
      expect(balance).toBe(7000) // 10000 - 3000 (solo la cuota de marzo)
    })

    it('no resta cuotas de meses anteriores ni futuros', () => {
      // En mayo: solo resta la cuota de mayo aunque haya cuotas pasadas (mar, abr)
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'income',
          amount: 10000,
          date: '2024-03-01',
          description: 'Salary',
          payment_method_id: 1,
          category_id: 1,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-01',
        },
        {
          id: 2,
          user_id: 'user1',
          type: 'expense',
          amount: -3000,
          date: '2024-03-20',
          description: 'TV cuota 1/3',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: 1,
          recurring_plan_id: null,
          created_at: '2024-03-01',
        },
        {
          id: 3,
          user_id: 'user1',
          type: 'expense',
          amount: -3000,
          date: '2024-04-20',
          description: 'TV cuota 2/3',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: 1,
          recurring_plan_id: null,
          created_at: '2024-03-01',
        },
        {
          id: 4,
          user_id: 'user1',
          type: 'expense',
          amount: -3000,
          date: '2024-05-20',
          description: 'TV cuota 3/3',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: 1,
          recurring_plan_id: null,
          created_at: '2024-03-01',
        },
      ]
      const balance = calculateGlobalBalance(transactions, [], '2024-05')
      expect(balance).toBe(7000) // 10000 - 3000 (solo la cuota de mayo)
    })
  })

  describe('calculateMonthlyBurnRate', () => {
    it('suma correcta de Mensualidades activas', () => {
      const recurringPlans: RecurringPlan[] = [
        {
          id: 1,
          user_id: 'user1',
          name: 'Netflix',
          amount: 100,
          is_active: true,
          payment_method_id: 1,
          created_at: '2024-03-01',
          recurring_plan_id: null,
        },
        {
          id: 2,
          user_id: 'user1',
          name: 'Spotify',
          amount: 50,
          is_active: true,
          payment_method_id: 1,
          created_at: '2024-03-01',
          recurring_plan_id: null,
        },
        {
          id: 3,
          user_id: 'user1',
          name: 'Gym',
          amount: 75,
          is_active: true,
          payment_method_id: 1,
          created_at: '2024-03-01',
          recurring_plan_id: null,
        },
      ]

      const burnRate = calculateMonthlyBurnRate(recurringPlans)
      expect(burnRate).toBe(225) // 100 + 50 + 75
    })

    it('ignora Mensualidades inactivas', () => {
      const recurringPlans: RecurringPlan[] = [
        {
          id: 1,
          user_id: 'user1',
          name: 'Netflix',
          amount: 100,
          is_active: true,
          payment_method_id: 1,
          created_at: '2024-03-01',
          recurring_plan_id: null,
        },
        {
          id: 2,
          user_id: 'user1',
          name: 'Old Service',
          amount: 50,
          is_active: false,
          payment_method_id: 1,
          created_at: '2024-03-01',
          recurring_plan_id: null,
        },
        {
          id: 3,
          user_id: 'user1',
          name: 'Gym',
          amount: 75,
          is_active: true,
          payment_method_id: 1,
          created_at: '2024-03-01',
          recurring_plan_id: null,
        },
      ]

      const burnRate = calculateMonthlyBurnRate(recurringPlans)
      expect(burnRate).toBe(175) // 100 + 75 (ignora Old Service)
    })

    it('retorna 0 si no hay Mensualidades', () => {
      const recurringPlans: RecurringPlan[] = []
      const burnRate = calculateMonthlyBurnRate(recurringPlans)
      expect(burnRate).toBe(0)
    })

    it('retorna 0 si todas las Mensualidades están inactivas', () => {
      const recurringPlans: RecurringPlan[] = [
        {
          id: 1,
          user_id: 'user1',
          name: 'Old Service 1',
          amount: 100,
          is_active: false,
          payment_method_id: 1,
          created_at: '2024-03-01',
          recurring_plan_id: null,
        },
        {
          id: 2,
          user_id: 'user1',
          name: 'Old Service 2',
          amount: 50,
          is_active: false,
          payment_method_id: 1,
          created_at: '2024-03-01',
          recurring_plan_id: null,
        },
      ]

      const burnRate = calculateMonthlyBurnRate(recurringPlans)
      expect(burnRate).toBe(0)
    })

    it('maneja montos negativos correctamente (usa absolute value)', () => {
      const recurringPlans: RecurringPlan[] = [
        {
          id: 1,
          user_id: 'user1',
          name: 'Netflix',
          amount: -100,
          is_active: true,
          payment_method_id: 1,
          created_at: '2024-03-01',
          recurring_plan_id: null,
        },
      ]

      const burnRate = calculateMonthlyBurnRate(recurringPlans)
      expect(burnRate).toBe(100) // Debe ser positivo
    })
  })

  describe('calculateMonthlyVariableExpenses', () => {
    const now = new Date(2024, 2, 19) // 19 Marzo 2024

    it('incluye gastos variables del mes actual', () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'expense',
          amount: -100,
          date: '2024-03-10',
          description: 'Groceries',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-10',
        },
        {
          id: 2,
          user_id: 'user1',
          type: 'expense',
          amount: -50,
          date: '2024-03-15',
          description: 'Gas',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-15',
        },
      ]

      const varExpenses = calculateMonthlyVariableExpenses(transactions, now)
      expect(varExpenses).toBe(150) // 100 + 50
    })

    it('excluye gastos de installment_plan', () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'expense',
          amount: -100,
          date: '2024-03-10',
          description: 'Variable expense',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-10',
        },
        {
          id: 2,
          user_id: 'user1',
          type: 'expense',
          amount: -200,
          date: '2024-03-15',
          description: 'Installment payment',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: 1, // Esta es una cuota
          recurring_plan_id: null,
          created_at: '2024-03-15',
        },
      ]

      const varExpenses = calculateMonthlyVariableExpenses(transactions, now)
      expect(varExpenses).toBe(100) // Solo la variable
    })

    it('excluye gastos de recurring_plan', () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'expense',
          amount: -100,
          date: '2024-03-10',
          description: 'Variable expense',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-10',
        },
        {
          id: 2,
          user_id: 'user1',
          type: 'expense',
          amount: -150,
          date: '2024-03-15',
          description: 'Subscription payment',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: 1, // Esta es una suscripción
          created_at: '2024-03-15',
        },
      ]

      const varExpenses = calculateMonthlyVariableExpenses(transactions, now)
      expect(varExpenses).toBe(100) // Solo la variable
    })

    it('excluye gastos de meses anteriores', () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'expense',
          amount: -100,
          date: '2024-02-28',
          description: 'Previous month',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-02-28',
        },
        {
          id: 2,
          user_id: 'user1',
          type: 'expense',
          amount: -50,
          date: '2024-03-10',
          description: 'Current month',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-10',
        },
      ]

      const varExpenses = calculateMonthlyVariableExpenses(transactions, now)
      expect(varExpenses).toBe(50) // Solo el de marzo
    })

    it('excluye gastos de meses posteriores', () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'expense',
          amount: -100,
          date: '2024-03-10',
          description: 'Current month',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-10',
        },
        {
          id: 2,
          user_id: 'user1',
          type: 'expense',
          amount: -50,
          date: '2024-04-15',
          description: 'Next month',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-04-15',
        },
      ]

      const varExpenses = calculateMonthlyVariableExpenses(transactions, now)
      expect(varExpenses).toBe(100) // Solo el de marzo
    })

    it('excluye ingresos', () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'income',
          amount: 1000,
          date: '2024-03-15',
          description: 'Salary',
          payment_method_id: 1,
          category_id: 1,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-15',
        },
        {
          id: 2,
          user_id: 'user1',
          type: 'expense',
          amount: -100,
          date: '2024-03-20',
          description: 'Groceries',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-20',
        },
      ]

      const varExpenses = calculateMonthlyVariableExpenses(transactions, now)
      expect(varExpenses).toBe(100) // Solo el gasto
    })

    it('retorna 0 cuando no hay gastos variables en el mes', () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'income',
          amount: 1000,
          date: '2024-03-15',
          description: 'Salary',
          payment_method_id: 1,
          category_id: 1,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-15',
        },
      ]

      const varExpenses = calculateMonthlyVariableExpenses(transactions, now)
      expect(varExpenses).toBe(0)
    })

    it('maneja montos negativos correctamente (usa absolute value)', () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          user_id: 'user1',
          type: 'expense',
          amount: -100,
          date: '2024-03-10',
          description: 'Groceries',
          payment_method_id: 1,
          category_id: 2,
          installment_plan_id: null,
          recurring_plan_id: null,
          created_at: '2024-03-10',
        },
      ]

      const varExpenses = calculateMonthlyVariableExpenses(transactions, now)
      expect(varExpenses).toBe(100) // Debe ser positivo
    })
  })
})
