import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore } from '@/lib/store/financeStore';

// Stubea todos los getters que consume getInsights con salidas neutras
// (ningún insight dispara). Cada test sobreescribe solo lo relevante.
function seedNeutral() {
  useFinanceStore.setState({
    paymentMethods: [],
    getMonthlyComparison: () => ({
      currentMonthExpenses: 0,
      previousMonthExpenses: 0,
      percentageChange: 0,
    }),
    getCategoryComparison: () => [],
    getCurrentMonthInstallments: () => [],
    getCurrentMonthInstallmentsTotal: () => 0,
    getAllBudgetStatuses: () => [],
    getRegistrationStreak: () => ({ days: 0, isActiveToday: false }),
    getSavingsGoalsOverview: () => ({
      goals: [],
      totalSavedARS: 0,
      totalsByCurrency: { ARS: null, USD: null },
      activeCount: 0,
    }),
    getPortfolioStatus: () => ({ totalInvested: 0, totalPLPercent: 0 }),
  } as never);
}

beforeEach(() => {
  seedNeutral();
});

describe('getInsights - racha de registro', () => {
  it('muestra la racha con >= 3 días', () => {
    useFinanceStore.setState({ getRegistrationStreak: () => ({ days: 5, isActiveToday: true }) } as never);
    const insights = useFinanceStore.getState().getInsights();
    const racha = insights.find((i) => i.icon === 'Flame');
    expect(racha).toBeDefined();
    expect(racha!.type).toBe('positive');
    expect(racha!.message).toContain('5 días seguidos');
  });

  it('no muestra la racha con menos de 3 días', () => {
    useFinanceStore.setState({ getRegistrationStreak: () => ({ days: 2, isActiveToday: true }) } as never);
    const insights = useFinanceStore.getState().getInsights();
    expect(insights.find((i) => i.icon === 'Flame')).toBeUndefined();
  });
});

describe('getInsights - progreso de objetivo', () => {
  const goal = (percent: number, status: 'active' | 'completed') => ({
    getSavingsGoalsOverview: () => ({
      goals: [{ id: 'g1', name: 'Vacaciones', percent, currency: 'ARS' as const, status }],
      totalSavedARS: 0,
      totalsByCurrency: { ARS: null, USD: null },
      activeCount: 1,
    }),
  });

  it('muestra el objetivo activo con percent >= 50', () => {
    useFinanceStore.setState(goal(60, 'active') as never);
    const insights = useFinanceStore.getState().getInsights();
    const obj = insights.find((i) => i.message.includes('Vacaciones'));
    expect(obj).toBeDefined();
    expect(obj!.message).toContain('60% de Vacaciones');
  });

  it('no muestra el objetivo con percent < 50', () => {
    useFinanceStore.setState(goal(40, 'active') as never);
    const insights = useFinanceStore.getState().getInsights();
    expect(insights.find((i) => i.message.includes('Vacaciones'))).toBeUndefined();
  });

  it('ignora objetivos ya completados', () => {
    useFinanceStore.setState(goal(100, 'completed') as never);
    const insights = useFinanceStore.getState().getInsights();
    expect(insights.find((i) => i.message.includes('Vacaciones'))).toBeUndefined();
  });
});

describe('getInsights - rendimiento del portafolio', () => {
  it('muestra ganancia con PL positivo >= 3%', () => {
    useFinanceStore.setState({ getPortfolioStatus: () => ({ totalInvested: 1000, totalPLPercent: 8 }) } as never);
    const insights = useFinanceStore.getState().getInsights();
    const pf = insights.find((i) => i.message.includes('portafolio'));
    expect(pf).toBeDefined();
    expect(pf!.type).toBe('positive');
    expect(pf!.message).toContain('+8%');
  });

  it('muestra caída con PL negativo <= -3%', () => {
    useFinanceStore.setState({ getPortfolioStatus: () => ({ totalInvested: 1000, totalPLPercent: -8 }) } as never);
    const insights = useFinanceStore.getState().getInsights();
    const pf = insights.find((i) => i.message.includes('portafolio'));
    expect(pf).toBeDefined();
    expect(pf!.type).toBe('warning');
    expect(pf!.message).toContain('8%');
  });

  it('no muestra nada si el movimiento es menor al 3%', () => {
    useFinanceStore.setState({ getPortfolioStatus: () => ({ totalInvested: 1000, totalPLPercent: 1 }) } as never);
    expect(useFinanceStore.getState().getInsights().find((i) => i.message.includes('portafolio'))).toBeUndefined();
  });

  it('no muestra nada sin inversiones', () => {
    useFinanceStore.setState({ getPortfolioStatus: () => ({ totalInvested: 0, totalPLPercent: 20 }) } as never);
    expect(useFinanceStore.getState().getInsights().find((i) => i.message.includes('portafolio'))).toBeUndefined();
  });
});

describe('getInsights - tope de 6', () => {
  it('nunca devuelve más de 6 insights', () => {
    useFinanceStore.setState({
      getMonthlyComparison: () => ({ currentMonthExpenses: 100, previousMonthExpenses: 200, percentageChange: -50 }),
      getCategoryComparison: () => [{ category: 'Comida', emoji: '🍔', current: 200, previous: 100 }],
      getCurrentMonthInstallments: () => [{}],
      getCurrentMonthInstallmentsTotal: () => 5000,
      getAllBudgetStatuses: () => [{ categoryName: 'Ocio', categoryEmoji: null, percent: 80 }],
      getRegistrationStreak: () => ({ days: 5, isActiveToday: true }),
      getSavingsGoalsOverview: () => ({
        goals: [{ id: 'g1', name: 'Meta', percent: 70, currency: 'ARS', status: 'active' }],
        totalSavedARS: 0, totalsByCurrency: { ARS: null, USD: null }, activeCount: 1,
      }),
      getPortfolioStatus: () => ({ totalInvested: 1000, totalPLPercent: 8 }),
    } as never);
    // 7 generadores disparan → slice a 6
    expect(useFinanceStore.getState().getInsights().length).toBe(6);
  });
});
