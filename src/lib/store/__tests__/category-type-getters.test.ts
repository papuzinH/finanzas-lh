import { describe, it, expect, beforeEach } from 'vitest';
import { format } from 'date-fns';
import { useFinanceStore } from '@/lib/store/financeStore';

function seed(partial: Record<string, unknown>) {
  useFinanceStore.setState(partial as never);
}

beforeEach(() => {
  useFinanceStore.setState({
    transactions: [], installmentPlans: [], paymentMethods: [], recurringPlans: [],
    categories: [], exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS',
    inflationSeries: [],
  } as never);
});

const now = new Date();
const d = (day: number) => format(new Date(now.getFullYear(), now.getMonth(), day), 'yyyy-MM-dd');

describe('getFrequentCategories con filtro de tipo', () => {
  it('solo cuenta y devuelve categorías del tipo pedido', () => {
    seed({
      categories: [
        { id: 'c1', name: 'Comida', emoji: '🍔', type: 'expense' },
        { id: 'c2', name: 'Sueldo', emoji: '💰', type: 'income' },
        { id: 'c3', name: 'Freelance', emoji: '📈', type: 'income' },
      ],
      transactions: [
        { id: 1, type: 'expense', amount: -100, date: d(1), category_id: 'c1', installment_plan_id: null, payment_method_id: null },
        { id: 2, type: 'income', amount: 500, date: d(2), category_id: 'c2', installment_plan_id: null, payment_method_id: null },
        { id: 3, type: 'income', amount: 300, date: d(3), category_id: 'c2', installment_plan_id: null, payment_method_id: null },
      ],
    });

    const result = useFinanceStore.getState().getFrequentCategories(4, 'income');

    expect(result.every((c) => c.type === 'income')).toBe(true);
    expect(result.find((c) => c.id === 'c2')).toBeTruthy();
    expect(result.find((c) => c.id === 'c1')).toBeUndefined();
  });

  it('sin type pedido, mantiene el comportamiento previo (todas las categorías)', () => {
    seed({
      categories: [
        { id: 'c1', name: 'Comida', emoji: '🍔', type: 'expense' },
        { id: 'c2', name: 'Sueldo', emoji: '💰', type: 'income' },
      ],
      transactions: [
        { id: 1, type: 'expense', amount: -100, date: d(1), category_id: 'c1', installment_plan_id: null, payment_method_id: null },
      ],
    });

    const result = useFinanceStore.getState().getFrequentCategories(2);

    expect(result).toHaveLength(2);
  });
});

describe('getExpensesByCategory con parámetro type', () => {
  it('type="income" solo suma transacciones de ingreso, por categoría', () => {
    seed({
      categories: [
        { id: 'c1', name: 'Comida', emoji: '🍔', type: 'expense' },
        { id: 'c2', name: 'Sueldo', emoji: '💰', type: 'income' },
      ],
      transactions: [
        { id: 1, type: 'expense', amount: -100, date: d(1), category_id: 'c1', installment_plan_id: null, payment_method_id: null },
        { id: 2, type: 'income', amount: 500, date: d(2), category_id: 'c2', installment_plan_id: null, payment_method_id: null },
      ],
    });

    const result = useFinanceStore.getState().getExpensesByCategory('global', 'income');

    expect(result).toEqual({ Sueldo: 500 });
  });

  it('scope "current_month" con type="income" usa el mes calendario (no ciclo de tarjeta)', () => {
    seed({
      categories: [{ id: 'c2', name: 'Sueldo', emoji: '💰', type: 'income' }],
      transactions: [
        { id: 1, type: 'income', amount: 500, date: d(5), category_id: 'c2', installment_plan_id: null, payment_method_id: null },
      ],
    });

    const result = useFinanceStore.getState().getExpensesByCategory('current_month', 'income');

    expect(result).toEqual({ Sueldo: 500 });
  });

  it('sin type, el default sigue siendo "expense" (comportamiento previo)', () => {
    seed({
      categories: [{ id: 'c1', name: 'Comida', emoji: '🍔', type: 'expense' }],
      transactions: [
        { id: 1, type: 'expense', amount: -100, date: d(1), category_id: 'c1', installment_plan_id: null, payment_method_id: null },
        { id: 2, type: 'income', amount: 500, date: d(2), category_id: 'c1', installment_plan_id: null, payment_method_id: null },
      ],
    });

    const result = useFinanceStore.getState().getExpensesByCategory('global');

    expect(result).toEqual({ Comida: 100 });
  });
});

describe('getCategoryBreakdown con parámetro type', () => {
  it('reenvía el type a getExpensesByCategory', () => {
    seed({
      categories: [{ id: 'c2', name: 'Sueldo', emoji: '💰', type: 'income' }],
      transactions: [
        { id: 1, type: 'income', amount: 500, date: d(2), category_id: 'c2', installment_plan_id: null, payment_method_id: null },
      ],
    });

    const result = useFinanceStore.getState().getCategoryBreakdown('global', 'income');

    expect(result.total).toBe(500);
    expect(result.items).toEqual([{ name: 'Sueldo', value: 500, percentage: 100 }]);
  });
});
