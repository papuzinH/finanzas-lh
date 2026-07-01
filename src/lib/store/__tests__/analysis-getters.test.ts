import { describe, it, expect, beforeEach, vi } from 'vitest';
import { format } from 'date-fns';
import { useFinanceStore, parseInflation } from '@/lib/store/financeStore';

// Helper: setear estado crudo del store en cada test
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

describe('displayCurrency slice', () => {
  it('default es ARS y toDisplay devuelve el mismo monto', () => {
    const s = useFinanceStore.getState();
    expect(s.displayCurrency).toBe('ARS');
    expect(s.toDisplay(1000)).toBe(1000);
  });

  it('setDisplayCurrency cambia el estado', () => {
    useFinanceStore.getState().setDisplayCurrency('USD');
    expect(useFinanceStore.getState().displayCurrency).toBe('USD');
  });

  it('getUsdRate usa MEP si existe, sino blue, sino 1', () => {
    seed({ dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' } });
    expect(useFinanceStore.getState().getUsdRate()).toBe(1000);
    seed({ exchangeRates: [{ pair: 'USD_ARS_MEP', rate: 1200 }] });
    expect(useFinanceStore.getState().getUsdRate()).toBe(1200);
  });

  it('toDisplay convierte a USD cuando displayCurrency=USD', () => {
    seed({ dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' }, displayCurrency: 'USD' });
    expect(useFinanceStore.getState().toDisplay(100000)).toBe(100);
  });
});

describe('parseInflation', () => {
  it('mapea fecha->yyyy-MM y valor->rate', () => {
    const out = parseInflation([
      { fecha: '2026-05-31', valor: 5.2 },
      { fecha: '2026-06-30', valor: 4.8 },
    ]);
    expect(out).toEqual([
      { month: '2026-05', rate: 5.2 },
      { month: '2026-06', rate: 4.8 },
    ]);
  });

  it('getInflationSeries devuelve lo seteado en estado', () => {
    seed({ inflationSeries: [{ month: '2026-06', rate: 4.8 }] });
    expect(useFinanceStore.getState().getInflationSeries()).toEqual([{ month: '2026-06', rate: 4.8 }]);
  });
});

describe('getMonthlySpendingPace', () => {
  it('acumula gasto por día y proyecta a fin de mes', () => {
    // Mock current date to July 2, 2026 to allow testing day 2
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 2)); // July 2, 2026

    try {
      const now = new Date();
      const y = now.getFullYear(); const m = now.getMonth();
      const d = (day: number) => format(new Date(y, m, day), 'yyyy-MM-dd');
      seed({
        transactions: [
          { id: 1, type: 'expense', amount: -1000, date: d(2), periodDate: d(2), realPaymentDate: d(2), payment_method_id: null, installment_plan_id: null },
          { id: 2, type: 'expense', amount: -500, date: d(2), periodDate: d(2), realPaymentDate: d(2), payment_method_id: null, installment_plan_id: null },
          { id: 3, type: 'income', amount: 50000, date: d(1), periodDate: d(1), realPaymentDate: d(1), payment_method_id: null, installment_plan_id: null },
        ],
        paymentMethods: [],
      });
      const res = useFinanceStore.getState().getMonthlySpendingPace();
      expect(res.income).toBe(50000);
      // gasto acumulado al día 2 = 1500
      const day2 = res.points.find((p) => p.day === 2);
      expect(day2?.cumulative).toBe(1500);
      expect(res.projectedTotal).toBeGreaterThanOrEqual(1500);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getCategoryFrequency', () => {
  it('cuenta transacciones por categoria y mes (no montos)', () => {
    const now = new Date();
    const d = (day: number) => format(new Date(now.getFullYear(), now.getMonth(), day), 'yyyy-MM-dd');
    seed({
      categories: [{ id: 10, name: 'Comida', emoji: '🍔' }],
      transactions: [
        { id: 1, type: 'expense', amount: -100, date: d(3), periodDate: d(3), category_id: 10, installment_plan_id: null, realPaymentDate: d(3), payment_method_id: null },
        { id: 2, type: 'expense', amount: -200, date: d(5), periodDate: d(5), category_id: 10, installment_plan_id: null, realPaymentDate: d(5), payment_method_id: null },
        { id: 3, type: 'income', amount: 999, date: d(5), periodDate: d(5), category_id: 10, realPaymentDate: d(5), payment_method_id: null },
      ],
    });
    const res = useFinanceStore.getState().getCategoryFrequency(3);
    expect(res.months).toHaveLength(3);
    const comida = res.rows.find((r) => r.category === 'Comida');
    // 2 gastos este mes (income excluido)
    expect(comida?.counts[2]).toBe(2);
    expect(comida?.emoji).toBe('🍔');
  });
});
