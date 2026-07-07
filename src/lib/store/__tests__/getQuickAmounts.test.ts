import { describe, it, expect, beforeEach } from 'vitest';
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

describe('getQuickAmounts', () => {
  it('sugiere los montos ARS más frecuentes del historial de gastos, ordenados ascendente', () => {
    seed({
      transactions: [
        { id: 1, type: 'expense', amount: -1000, date: '2026-06-01', original_currency: 'ARS' },
        { id: 2, type: 'expense', amount: -1000, date: '2026-06-02', original_currency: 'ARS' },
        { id: 3, type: 'expense', amount: -500, date: '2026-06-03', original_currency: 'ARS' },
        { id: 4, type: 'expense', amount: -500, date: '2026-06-04', original_currency: 'ARS' },
        { id: 5, type: 'expense', amount: -2000, date: '2026-06-05', original_currency: 'ARS' },
        { id: 6, type: 'expense', amount: -2000, date: '2026-06-06', original_currency: 'ARS' },
      ],
    });
    const result = useFinanceStore.getState().getQuickAmounts('expense', 'ARS', 3);
    expect(result).toEqual([500, 1000, 2000]);
  });

  it('no mezcla montos de income con los de expense', () => {
    seed({
      transactions: [
        { id: 1, type: 'expense', amount: -300, date: '2026-06-01', original_currency: 'ARS' },
        { id: 2, type: 'expense', amount: -300, date: '2026-06-02', original_currency: 'ARS' },
        { id: 3, type: 'income', amount: 90000, date: '2026-06-03', original_currency: 'ARS' },
        { id: 4, type: 'income', amount: 90000, date: '2026-06-04', original_currency: 'ARS' },
      ],
    });
    const expenses = useFinanceStore.getState().getQuickAmounts('expense', 'ARS', 1);
    const incomes = useFinanceStore.getState().getQuickAmounts('income', 'ARS', 1);
    expect(expenses).toEqual([300]);
    expect(incomes).toEqual([90000]);
  });

  it('en moneda USD usa original_amount, no el monto convertido a ARS', () => {
    seed({
      transactions: [
        { id: 1, type: 'expense', amount: -50000, date: '2026-06-01', original_currency: 'USD', original_amount: 50 },
        { id: 2, type: 'expense', amount: -50000, date: '2026-06-02', original_currency: 'USD', original_amount: 50 },
        // gasto en ARS puro: no debe filtrarse dentro del pool USD
        { id: 3, type: 'expense', amount: -999999, date: '2026-06-03', original_currency: 'ARS' },
      ],
    });
    const result = useFinanceStore.getState().getQuickAmounts('expense', 'USD', 1);
    expect(result).toEqual([50]);
  });

  it('completa con un fallback razonable si no hay historial suficiente', () => {
    seed({ transactions: [] });
    const arsResult = useFinanceStore.getState().getQuickAmounts('expense', 'ARS', 3);
    const usdResult = useFinanceStore.getState().getQuickAmounts('expense', 'USD', 3);
    expect(arsResult).toEqual([500, 1000, 2000]);
    expect(usdResult).toEqual([10, 50, 100]);
  });

  it('completa con fallback lo que falte cuando hay historial parcial', () => {
    seed({
      transactions: [
        { id: 1, type: 'expense', amount: -1500, date: '2026-06-01', original_currency: 'ARS' },
      ],
    });
    const result = useFinanceStore.getState().getQuickAmounts('expense', 'ARS', 3);
    expect(result).toHaveLength(3);
    expect(result).toContain(1500);
  });
});
