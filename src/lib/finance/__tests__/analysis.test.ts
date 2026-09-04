import { describe, it, expect } from 'vitest'
import { computeExpensesByCategory, computeMonthlyBalance } from '@/lib/finance/analysis'
import type { Category, PaymentMethod, RecurringPlan } from '@/types/database'
import type { ProcessedTransaction } from '@/lib/finance/types'

// Builders duplicados de src/lib/finance/__tests__/balances.test.ts (Task 4).
// YAGNI: no se extrae un helper compartido hasta el tercer uso real.
const credit = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: '1', user_id: '1', name: 'Visa', type: 'credit',
  default_closing_day: 19, default_payment_day: 1,
  is_default: false, is_personal: false, created_at: '2025-01-01',
  ...over,
} as PaymentMethod)

// Nota: amount siempre POSITIVO (schema real valida `z.number().positive()`;
// el signo de la transacción lo da `type`, no el monto). computeMonthlyBalance
// depende de esto (no aplica Math.abs), a diferencia de balances.ts.
// `category_id` admite null en el fixture: la DB lo tiene NOT NULL, pero el
// cálculo tolera null (fallback "Otros") y el test lo ejercita.
const tx = (
  over: Partial<Omit<ProcessedTransaction, 'category_id'>> & { category_id?: string | null } = {},
): ProcessedTransaction => ({
  id: '1', user_id: '1', description: 'x', amount: 100, date: '2026-07-05',
  type: 'expense', category_id: null, payment_method_id: '1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  periodDate: '2026-07-05', realPaymentDate: '2026-07-05',
  ...over,
} as ProcessedTransaction)

const category = (over: Partial<Category> = {}): Category => ({
  id: 'c1', user_id: 'u1', name: 'Comida', description: null, emoji: null,
  is_system: false, type: 'expense', created_at: '2025-01-01',
  ...over,
} as Category)

const plan = (over: Partial<RecurringPlan> = {}): RecurringPlan =>
  ({
    id: '1', description: 'Plan', amount: 1000, is_active: true,
    payment_method_id: '1', currency: 'ARS', original_amount: null,
    ...over,
  }) as RecurringPlan

describe('computeExpensesByCategory', () => {
  it('agrupa por nombre de categoría con fallback "Otros" para category_id null o inexistente', () => {
    const categories = [category({ id: 'c1', name: 'Comida' })]
    const transactions = [
      tx({ id: '1', category_id: 'c1', amount: 100 }),
      tx({ id: '2', category_id: 'c1', amount: 50 }),
      tx({ id: '3', category_id: null, amount: 30 }),
      tx({ id: '4', category_id: 'no-existe', amount: 20 }),
    ]
    const result = computeExpensesByCategory(transactions, [], categories, 'global', 'expense', new Date(2026, 6, 15))
    // Comida: 100 + 50 = 150; Otros: 30 (sin categoría) + 20 (categoría inexistente) = 50
    expect(result).toEqual({ Comida: 150, Otros: 50 })
  })

  it('excluye transacciones con card_payment_for aunque el tipo coincida', () => {
    const categories = [category({ id: 'c1', name: 'Comida' })]
    const transactions = [
      tx({ id: '1', category_id: 'c1', amount: 100 }),
      tx({ id: '2', category_id: 'c1', amount: 500, card_payment_for: '1' }),
    ]
    const result = computeExpensesByCategory(transactions, [], categories, 'global', 'expense', new Date(2026, 6, 15))
    expect(result).toEqual({ Comida: 100 })
  })

  it('scope current_month usa el ciclo de tarjeta para gastos y el mes calendario para ingresos', () => {
    const now = new Date(2026, 6, 15) // 15 jul 2026; tarjeta cierre 19 vence 1 -> nextPaymentDate = 1 ago 2026
    const paymentMethods = [credit()]
    const categories = [category({ id: 'c1', name: 'Comida' })]

    // Cuota cuyo vencimiento (t.date) cae en el ciclo vigente (agosto), aunque
    // su periodDate visual (junio) esté fuera del mes de "now" (julio):
    // demuestra que se usa el ciclo, no el mes calendario de periodDate.
    const cycleExpense = tx({
      id: '1', category_id: 'c1', amount: 1000, installment_plan_id: '7',
      date: '2026-08-01', periodDate: '2026-06-05', payment_method_id: '1',
    })
    // Cuota de un ciclo futuro (vence en septiembre) -> no pertenece al mes actual.
    const outOfCycleExpense = tx({
      id: '2', category_id: 'c1', amount: 2000, installment_plan_id: '7',
      date: '2026-09-01', periodDate: '2026-07-05', payment_method_id: '1',
    })
    const expensesResult = computeExpensesByCategory(
      [cycleExpense, outOfCycleExpense], paymentMethods, categories, 'current_month', 'expense', now,
    )
    expect(expensesResult).toEqual({ Comida: 1000 })

    // Ingresos: se filtran por mes calendario de periodDate (isSameMonth), no de
    // date -- date y periodDate se ponen a PROPOSITO en meses distintos y cruzados
    // (inMonthIncome: date fuera, periodDate dentro; outOfMonthIncome al reves) para
    // que el assert solo pueda dar { Comida: 500 } si el codigo mira periodDate. Un
    // fixture con periodDate === date (como tenia antes) no discrimina nada: pasaria
    // igual si alguien revierte el filtro a t.date (fix round 1 de la Task 4).
    const inMonthIncome = tx({ id: '3', category_id: 'c1', type: 'income', amount: 500, date: '2026-08-10', periodDate: '2026-07-10' })
    const outOfMonthIncome = tx({ id: '4', category_id: 'c1', type: 'income', amount: 900, date: '2026-07-10', periodDate: '2026-08-10' })
    const incomeResult = computeExpensesByCategory(
      [inMonthIncome, outOfMonthIncome], paymentMethods, categories, 'current_month', 'income', now,
    )
    expect(incomeResult).toEqual({ Comida: 500 })
  })

  it('los ajustes de saldo quedan fuera del desglose por categoria, en gasto y en ingreso', () => {
    const cats = [{ id: 'c1', name: 'Supermercado' }] as unknown as Category[];
    const ajusteGasto = {
      id: 'aj1', user_id: 'u1', type: 'expense', amount: 50000,
      date: '2026-08-19', periodDate: '2026-08-19', realPaymentDate: '2026-08-19',
      payment_method_id: 'deb', category_id: 'c1',
      installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
      is_balance_adjustment: true,
    } as unknown as ProcessedTransaction;
    const ajusteIngreso = { ...ajusteGasto, id: 'aj2', type: 'income' } as ProcessedTransaction;

    expect(computeExpensesByCategory([ajusteGasto], [], cats, 'global', 'expense', new Date(2026, 7, 20))).toEqual({});
    expect(computeExpensesByCategory([ajusteIngreso], [], cats, 'global', 'income', new Date(2026, 7, 20))).toEqual({});
  })
})

describe('computeMonthlyBalance', () => {
  it('ingresos suman, gastos restan, y un plan recurrente sin transacción resta solo en el mes actual (sin doble conteo si ya tiene tx)', () => {
    const now = new Date(2026, 6, 15) // julio 2026
    const recurringPlans = [plan({ id: '5', amount: 3000, payment_method_id: '1', is_active: true })]
    const transactions = [
      tx({ id: '1', type: 'income', amount: 10000, date: '2026-07-05', periodDate: '2026-07-05', payment_method_id: '1' }),
      tx({ id: '2', type: 'expense', amount: 1000, date: '2026-07-06', periodDate: '2026-07-06', payment_method_id: '1' }),
    ]

    // Mes actual: 10000 (ingreso) - 1000 (gasto) - 3000 (plan sin tx vinculada) = 6000
    const current = computeMonthlyBalance(transactions, recurringPlans, '2026-07', 'all', now)
    expect(current).toBe(6000)

    // Mes pasado (junio): mismos montos, pero el plan NO se resta (solo aplica al mes actual).
    // 10000 - 1000 = 9000
    const pastTransactions = [
      tx({ id: '1', type: 'income', amount: 10000, date: '2026-06-05', periodDate: '2026-06-05', payment_method_id: '1' }),
      tx({ id: '2', type: 'expense', amount: 1000, date: '2026-06-06', periodDate: '2026-06-06', payment_method_id: '1' }),
    ]
    const past = computeMonthlyBalance(pastTransactions, recurringPlans, '2026-06', 'all', now)
    expect(past).toBe(9000)

    // Mes actual con tx ya vinculada al plan: NO se resta de nuevo (evita doble conteo).
    // 10000 - 1000 - 3000 (tx del plan, ya se restó como gasto) = 6000, igual que sin pagar.
    const currentWithPlanTx = [
      ...transactions,
      tx({ id: '3', type: 'expense', amount: 3000, date: '2026-07-10', periodDate: '2026-07-10', payment_method_id: '1', recurring_plan_id: '5' }),
    ]
    const currentPaid = computeMonthlyBalance(currentWithPlanTx, recurringPlans, '2026-07', 'all', now)
    expect(currentPaid).toBe(6000)
  })

  it('filtra por medio de pago específico; "all" incluye todos los medios', () => {
    const now = new Date(2026, 6, 15)
    const transactions = [
      tx({ id: '1', type: 'income', amount: 5000, date: '2026-07-05', periodDate: '2026-07-05', payment_method_id: '1' }),
      tx({ id: '2', type: 'income', amount: 2000, date: '2026-07-06', periodDate: '2026-07-06', payment_method_id: '2' }),
    ]
    const resultAll = computeMonthlyBalance(transactions, [], '2026-07', 'all', now)
    expect(resultAll).toBe(7000)

    const resultMethod1 = computeMonthlyBalance(transactions, [], '2026-07', '1', now)
    expect(resultMethod1).toBe(5000)
  })
})
