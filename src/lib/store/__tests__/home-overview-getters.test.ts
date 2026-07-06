import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useFinanceStore } from '@/lib/store/financeStore';

function seed(partial: Record<string, unknown>) {
  useFinanceStore.setState(partial as never);
}

beforeEach(() => {
  useFinanceStore.setState({
    transactions: [], installmentPlans: [], paymentMethods: [], recurringPlans: [],
    categories: [], categoryBudgets: [], savingsGoals: [], savingsGoalContributions: [],
    exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS', inflationSeries: [],
    internalTransfers: [],
  } as never);
});

describe('getBudgetsOverview', () => {
  it('retorna null si no hay presupuestos activos', () => {
    seed({ categoryBudgets: [] });
    expect(useFinanceStore.getState().getBudgetsOverview()).toBeNull();
  });

  it('retorna null si los presupuestos existentes estan inactivos', () => {
    seed({
      categoryBudgets: [
        { id: 'b1', category_id: 'cat-1', amount: 100000, currency: 'ARS', is_active: false },
      ],
    });
    expect(useFinanceStore.getState().getBudgetsOverview()).toBeNull();
  });

  it('agrega presupuestos en ARS y proyecta segun ritmo diario', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 10)); // 10 jul 2026: dia 10 de 31

    try {
      seed({
        categories: [
          { id: 'cat-1', name: 'Comida', emoji: '🍔' },
          { id: 'cat-2', name: 'Transporte', emoji: '🚗' },
        ],
        categoryBudgets: [
          { id: 'b1', category_id: 'cat-1', amount: 100000, currency: 'ARS', is_active: true },
          { id: 'b2', category_id: 'cat-2', amount: 50000, currency: 'ARS', is_active: true },
        ],
        transactions: [
          { id: 1, type: 'expense', amount: -40000, date: '2026-07-10', periodDate: '2026-07-10', category_id: 'cat-1', payment_method_id: null, installment_plan_id: null },
          { id: 2, type: 'expense', amount: -20000, date: '2026-07-10', periodDate: '2026-07-10', category_id: 'cat-2', payment_method_id: null, installment_plan_id: null },
        ],
      });

      const res = useFinanceStore.getState().getBudgetsOverview();
      expect(res).not.toBeNull();
      expect(res!.totalSpentARS).toBe(60000);
      expect(res!.totalLimitARS).toBe(150000);
      expect(res!.percent).toBeCloseTo(40);
      // proyectado: (40000/10*31) + (20000/10*31) = 124000 + 62000 = 186000
      expect(res!.projectedPercent).toBeCloseTo(124);
      expect(res!.status).toBe('ok');
      expect(res!.willExceed).toBe(true);
      expect(res!.exceededCount).toBe(0);
      expect(res!.warningCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('normaliza presupuestos mixtos ARS/USD a ARS via dolar blue', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 15)); // 15 abr 2026: dia 15 de 30

    try {
      seed({
        dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' },
        categories: [
          { id: 'cat-1', name: 'Comida', emoji: '🍔' },
          { id: 'cat-2', name: 'Transporte', emoji: '🚗' },
        ],
        categoryBudgets: [
          { id: 'b1', category_id: 'cat-1', amount: 100, currency: 'USD', is_active: true },
          { id: 'b2', category_id: 'cat-2', amount: 50000, currency: 'ARS', is_active: true },
        ],
        transactions: [
          { id: 1, type: 'expense', amount: -60000, date: '2026-04-15', periodDate: '2026-04-15', category_id: 'cat-1', payment_method_id: null, installment_plan_id: null },
          { id: 2, type: 'expense', amount: -10000, date: '2026-04-15', periodDate: '2026-04-15', category_id: 'cat-2', payment_method_id: null, installment_plan_id: null },
        ],
      });

      const res = useFinanceStore.getState().getBudgetsOverview();
      expect(res).not.toBeNull();
      // limite: 100*1000 (USD->ARS) + 50000 (ARS) = 150000
      expect(res!.totalLimitARS).toBe(150000);
      expect(res!.totalSpentARS).toBe(70000);
      expect(res!.percent).toBeCloseTo(46.666, 2);
      // proyectado: (60000/15*30) + (10000/15*30) = 120000 + 20000 = 140000
      expect(res!.projectedPercent).toBeCloseTo(93.333, 2);
      expect(res!.willExceed).toBe(false);
      // Comida (USD) queda "exceeded" a nivel de card individual por la
      // imprecision preexistente de getCategoryBudgetStatus (60000 spent vs
      // limit=100 sin convertir): documentado como fuera de alcance en el spec.
      expect(res!.exceededCount).toBe(1);
      expect(res!.warningCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getSavingsGoalsOverview', () => {
  it('retorna activeCount 0 y totalSavedARS 0 sin metas activas', () => {
    seed({ savingsGoals: [], savingsGoalContributions: [] });
    const res = useFinanceStore.getState().getSavingsGoalsOverview();
    expect(res.activeCount).toBe(0);
    expect(res.goals).toEqual([]);
    expect(res.totalSavedARS).toBe(0);
  });

  it('ignora metas inactivas', () => {
    seed({
      savingsGoals: [
        { id: 'g1', name: 'Vieja', type: 'one_time', target_amount: 1000, currency: 'ARS', target_date: null, is_active: false },
      ],
      savingsGoalContributions: [],
    });
    expect(useFinanceStore.getState().getSavingsGoalsOverview().activeCount).toBe(0);
  });

  it('calcula percent y totalSavedARS con metas solo en ARS', () => {
    seed({
      savingsGoals: [
        { id: 'g1', name: 'Vacaciones', type: 'one_time', target_amount: 100000, currency: 'ARS', target_date: null, is_active: true },
      ],
      savingsGoalContributions: [
        { id: 'c1', goal_id: 'g1', amount: 30000, currency: 'ARS', date: '2026-01-10' },
      ],
    });
    const res = useFinanceStore.getState().getSavingsGoalsOverview();
    expect(res.activeCount).toBe(1);
    expect(res.goals[0]).toMatchObject({ id: 'g1', name: 'Vacaciones', percent: 30, currency: 'ARS', status: 'active' });
    expect(res.totalSavedARS).toBe(30000);
  });

  it('convierte a ARS los aportes de metas en USD para el total', () => {
    seed({
      dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' },
      savingsGoals: [
        { id: 'g1', name: 'Auto', type: 'one_time', target_amount: 100000, currency: 'ARS', target_date: null, is_active: true },
        { id: 'g2', name: 'Viaje USA', type: 'one_time', target_amount: 500, currency: 'USD', target_date: null, is_active: true },
      ],
      savingsGoalContributions: [
        { id: 'c1', goal_id: 'g1', amount: 30000, currency: 'ARS', date: '2026-01-10' },
        { id: 'c2', goal_id: 'g2', amount: 200, currency: 'USD', date: '2026-01-10' },
      ],
    });
    const res = useFinanceStore.getState().getSavingsGoalsOverview();
    // 30000 (ARS) + 200*1000 (USD->ARS) = 230000
    expect(res.totalSavedARS).toBe(230000);
    const usdGoal = res.goals.find((g) => g.id === 'g2');
    expect(usdGoal).toMatchObject({ percent: 40, currency: 'USD', status: 'active' });
  });

  it('prioriza metas con fecha por daysLeft asc y despues por percent desc', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 1)); // 1 abr 2026

    try {
      seed({
        savingsGoals: [
          { id: 'x', name: 'Lejana', type: 'one_time', target_amount: 10000, currency: 'ARS', target_date: '2026-05-01', is_active: true }, // daysLeft 30
          { id: 'y', name: 'Cercana', type: 'one_time', target_amount: 10000, currency: 'ARS', target_date: '2026-04-06', is_active: true }, // daysLeft 5
          { id: 'z', name: 'Mensual alta', type: 'monthly', target_amount: 10000, currency: 'ARS', target_date: null, is_active: true }, // percent 80
          { id: 'w', name: 'Mensual baja', type: 'monthly', target_amount: 10000, currency: 'ARS', target_date: null, is_active: true }, // percent 50
        ],
        savingsGoalContributions: [
          { id: 'c-z', goal_id: 'z', amount: 8000, currency: 'ARS', date: '2026-04-01' },
          { id: 'c-w', goal_id: 'w', amount: 5000, currency: 'ARS', date: '2026-04-01' },
        ],
      });

      const res = useFinanceStore.getState().getSavingsGoalsOverview();
      expect(res.goals.map((g) => g.id)).toEqual(['y', 'x', 'z', 'w']);
    } finally {
      vi.useRealTimers();
    }
  });
});
