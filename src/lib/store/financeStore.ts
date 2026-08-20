import { create } from 'zustand';
import { createClient } from '@/utils/supabase/client';
import {
  Transaction,
  InstallmentPlan,
  RecurringPlan,
  PaymentMethod,
  Investment,
  InvestmentAsset,
  InvestmentTransaction,
  MarketPrice,
  ExchangeRate,
  User,
  Category,
  Saving,
  InternalTransfer,
  SavingsGoal,
  SavingsGoalContribution,
  CategoryBudget,
} from '@/types/database';

import {
  getDate,
  format,
  subMonths,
  subWeeks,
  startOfWeek,
  endOfWeek,
  startOfDay,
  isSameMonth,
  parse,
  endOfMonth,
} from 'date-fns';
import { parseLocalDate } from '@/lib/utils/dates';
import {
  getCreditCycleDates,
  isExpenseInCurrentMonthScope,
  sameMonthYear,
} from '@/lib/finance/creditCycle';
import type { ProcessedTransaction, CreditCardCycleSummary as CreditCardCycleSummaryType, DolarBlue } from '@/lib/finance/types';
import { resolveRate, prepareTransactions, prepareRecurringPlans } from '@/lib/finance/prepare';
import { computePendingFixedExpenses } from '@/lib/finance/pending';
import {
  computePaymentMethodStatus,
  computeGlobalBalance,
  computePendingCreditCards,
  hasCardPaymentInCycle,
} from '@/lib/finance/balances';
import { computeExpensesByCategory, computeMonthlyBalance } from '@/lib/finance/analysis';
import { computeAvailableToSpend } from '@/lib/finance/pocket';
import type { AvailableToSpend, IncomeRhythm } from '@/lib/finance/pocket';
import { computePortfolioStatus } from '@/lib/finance/portfolio';
import type { PortfolioStatus, PortfolioDisplayCurrency } from '@/lib/finance/portfolio';
import { daysSinceLastRegistration } from '@/lib/finance/reconcile';

export type { ProcessedTransaction } from '@/lib/finance/types';
export { resolveRate } from '@/lib/finance/prepare';

export function parseInflation(
  raw: Array<{ fecha: string; valor: number }>,
): Array<{ month: string; rate: number }> {
  return raw.map((r) => ({ month: r.fecha.slice(0, 7), rate: r.valor }));
}

export type CreditCardCycleSummary = CreditCardCycleSummaryType;

interface FinanceState {
  // State Raw
  transactions: ProcessedTransaction[];
  installmentPlans: InstallmentPlan[];
  paymentMethods: PaymentMethod[];
  recurringPlans: RecurringPlan[];
  investments: Investment[];
  investmentAssets: InvestmentAsset[];
  investmentTransactions: InvestmentTransaction[];
  marketPrices: MarketPrice[];
  categories: Category[];
  savings: Saving[];
  internalTransfers: InternalTransfer[];
  /** Ritmo de cobro declarado por el usuario. Define qué compromisos descuenta el disponible. */
  incomeRhythm: IncomeRhythm;
  savingsGoals: SavingsGoal[];
  savingsGoalContributions: SavingsGoalContribution[];
  categoryBudgets: CategoryBudget[];
  dolarBlue: DolarBlue | null;
  exchangeRates: ExchangeRate[];
  inflationSeries: Array<{ month: string; rate: number }>;
  user: User | null;
  authEmail: string | null;
  authAvatarUrl: string | null;

  // Status
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;

  // Actions
  fetchAllData: () => Promise<void>;
  fetchGoalsData: () => Promise<void>;

  // Análisis
  displayCurrency: 'ARS' | 'USD';
  setDisplayCurrency: (c: 'ARS' | 'USD') => void;
  getUsdRate: () => number;
  toDisplay: (ars: number) => number;
  getInflationSeries: () => Array<{ month: string; rate: number }>;

  // Computed Getters (Logic)
  // El tipo sale de la función pura, NO se re-declara acá: duplicarlo hizo que
  // los campos nuevos de `PortfolioStatus` no llegaran a los consumidores.
  getPortfolioStatus: (displayCurrency?: PortfolioDisplayCurrency) => PortfolioStatus;
  getPortfolioDistribution: () => Array<{
    assetType: string;
    value: number;
    percentage: number;
    color: string;
  }>;
  getUpcomingPayments: (days?: number) => Array<{
    assetName: string;
    ticker: string;
    type: string;
    date: string;
    estimatedAmount: number;
    currency: string;
  }>;
  getAssetDetail: (assetId: string) => {
    asset: InvestmentAsset;
    transactions: InvestmentTransaction[];
    position: number;
    ppc: number;
    unrealizedPL: number;
    realizedPL: number;
    currentPrice: number;
    currentValue: number;
    investedValue: number;
    plPercent: number;
    marketData: MarketPrice | null;
    projectedValue: number | null;
  } | null;
  getBenchmarkComparison: (period: '1M' | '3M' | '6M' | 'YTD' | '1Y') => {
    portfolioReturn: number | null;
    inflationReturn: number | null;
    sp500Return: number | null;
    blueReturn: number | null;
    realReturn: number | null;
    period: string;
  };
  /**
   * El cálculo viejo: flujo acumulado desde el primer movimiento. NO es el disponible.
   * Se muestra únicamente en /puesta-a-punto, para explicarle al usuario por qué su
   * número cambió. Para el disponible, usar getAvailableToSpend().
   */
  getGlobalBalance: () => number;
  getExchangeRate: (pair: string) => number;
  getMonthlyBurnRate: () => number;
  getInstallmentStatus: (planId: string) => {
    paid: number;
    remaining: number;
    progress: number;
    installmentsPaid: number;
    remainingInstallments: number;
    isFinished: boolean;
    plan: InstallmentPlan | undefined;
  } | null;

  getPaymentMethodStatus: (methodId: string) => {
    currentConsumption: number;
    fixedCosts: number;
    projectedTotal: number;
    nextClosingDate?: Date;
    nextPaymentDate?: Date;
    usdExpenses: number;
    arsExpenses: number;
  };
  getDefaultPaymentMethod: () => PaymentMethod | undefined;
  getUnassignedTransactionsCount: () => number;
  isCreditCardCyclePaid: (methodId: string) => boolean;
  getPendingCreditCardByCard: () => CreditCardCycleSummary[];

  // Dashboard Helpers
  getCurrentMonthInstallmentsTotal: () => number;
  getCurrentMonthInstallments: () => Transaction[];
  getActiveRecurringPlans: () => RecurringPlan[];
  getGlobalIncome: () => number;
  getGlobalEffectiveExpenses: () => number;
  getExpensesByCategory: (scope: 'global' | 'current_month', type?: 'income' | 'expense') => Record<string, number>;
  getMonthlyBalance: (monthStr: string, paymentMethodId: string) => number;
  getPendingFixedExpenses: () => {
    total: number;
    items: Array<{ id: string; name: string; amount: number }>;
  };

  getRecurringBackfillPreview: () => {
    missingMonths: number;
    totalAmount: number;
    excessMonths: number;
    excessAmount: number;
  };
  /**
   * Disponible del modelo de bolsillo: saldos anclados menos los compromisos del
   * período.
   * Spec: docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md
   */
  getAvailableToSpend: () => AvailableToSpend;
  getCategoryBreakdown: (scope: 'global' | 'current_month', type?: 'income' | 'expense') => {
    total: number;
    items: Array<{
      name: string;
      value: number;
      percentage: number;
    }>;
  };
  getPaymentMethodTransactionsForCurrentMonth: (methodId: string) => ProcessedTransaction[];
  getMonthlyIncome: () => number;
  getMonthlyIncomeTransactions: () => ProcessedTransaction[];
  getMonthlyVariableExpenses: () => number;
  getMonthlyVariableExpenseTransactions: () => ProcessedTransaction[];
  getMonthlyExpensesBreakdown: () => {
    variableExpenses: number;
    installmentsTotal: number;
    subscriptionsCost: number;
    savingsTransfers: number;
    totalExpenses: number;
    income: number;
    netBalance: number;
  };

  // Balance líquido: excluye gastos de tarjetas de crédito aún no pagadas
  getMonthlyLiquidityBreakdown: () => {
    income: number;
    liquidVariableExpenses: number;
    liquidInstallments: number;
    liquidSubscriptions: number;
    savingsTransfers: number;
    liquidTotalExpenses: number;
    liquidNetBalance: number;
    pendingCreditTotal: number;
    pendingCards: CreditCardCycleSummary[];
  };
  // Goals Getters
  getSavingsGoalProgress: (goalId: string) => {
    goal: SavingsGoal;
    totalContributed: number;
    currentMonthContributed: number;
    target: number;
    percent: number;
    remaining: number;
    daysLeft: number | null;
    status: 'active' | 'completed';
  } | null;

  getSavingsGoalsOverview: () => {
    goals: Array<{
      id: string;
      name: string;
      percent: number;
      currency: 'ARS' | 'USD';
      status: 'active' | 'completed';
    }>;
    totalSavedARS: number;
    totalsByCurrency: { ARS: number | null; USD: number | null };
    activeCount: number;
  };

  getCategoryBudgetStatus: (categoryId: string) => {
    budget: CategoryBudget;
    categoryName: string;
    categoryEmoji: string | null;
    spent: number;
    limit: number;
    percent: number;
    status: 'ok' | 'warning' | 'exceeded';
  } | null;

  getAllBudgetStatuses: () => Array<{
    budget: CategoryBudget;
    categoryName: string;
    categoryEmoji: string | null;
    spent: number;
    limit: number;
    percent: number;
    status: 'ok' | 'warning' | 'exceeded';
  }>;

  getBudgetsOverview: () => {
    percent: number;
    projectedPercent: number;
    status: 'ok' | 'warning' | 'exceeded';
    willExceed: boolean;
    exceededCount: number;
    warningCount: number;
    totalSpentARS: number;
    totalLimitARS: number;
  } | null;

  getMonthlyComparison: (monthStr?: string) => {
    currentMonthExpenses: number;
    previousMonthExpenses: number;
    percentageChange: number;
  };

  getWeeklySnapshot: (type: 'income' | 'variable' | 'installments' | 'fixed') => number[];

  getMonthlyTrend: (months?: number) => Array<{
    month: string;
    income: number;
    expenses: number;
    variable: number;
    installments: number;
    recurring: number;
    net: number;
  }>;

  getMonthlySpendingPace: () => {
    points: Array<{ day: number; cumulative: number }>;
    projectedTotal: number;
    income: number;
    todayDay: number;
    daysInMonth: number;
  };

  getSavingsRateSeries: (months?: number) => Array<{
    month: string;
    rate: number;
    net: number;
    tone: 'good' | 'warn' | 'bad';
  }>;

  getRealAdjustedTrend: (months?: number) => {
    available: boolean;
    rows: Array<{ month: string; nominalExpenses: number; realExpenses: number }>;
  };

  getInstallmentsRealCost: () => {
    remainingARS: number;
    remainingUSD: number;
    realTodayARS: number;
    savedARS: number;
    savedPct: number;
    monthlyInflation: number;
    hasInflation: boolean;
    hasData: boolean;
  };

  getCurrencyExposure: () => {
    arsShare: number;
    usdShare: number;
    arsAmount: number;
    usdAmountOriginal: number;
    totalARS: number;
  };

  getCategoryComparison: () => Array<{
    category: string;
    emoji: string;
    current: number;
    previous: number;
    change: number;
  }>;

  getCategoryFrequencyRanking: (scope: 'global' | 'current_month') => Array<{
    category: string;
    emoji: string;
    count: number;
    total: number;
    avg: number;
  }>;

  getBudgetProjection: (budgetId: string) => {
    spent: number;
    projected: number;
    limit: number;
    isOverBudget: boolean;
  } | null;

  getFrequentTransactions: (n?: number) => Array<{
    description: string;
    count: number;
    lastCategoryId: string | null;
    lastCategoryEmoji: string | null;
    avgAmount: number;
    type: 'expense' | 'income';
  }>;

  getFrequentCategories: (n?: number, type?: 'income' | 'expense') => Category[];

  /** Montos rápidos sugeridos para el AmountField, basados en el historial del usuario por tipo y moneda. */
  getQuickAmounts: (type: 'expense' | 'income', currency?: 'ARS' | 'USD', n?: number) => number[];

  getInsights: () => Array<{
    type: 'positive' | 'warning' | 'info';
    message: string;
    icon: string;
  }>;

  getRegistrationStreak: () => {
    days: number;
    isActiveToday: boolean;
  };

  /** Días desde el último registro. null = nunca registró nada. */
  getDaysSinceLastRegistration: () => number | null;
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  transactions: [],
  installmentPlans: [],
  paymentMethods: [],
  recurringPlans: [],
  investments: [],
  investmentAssets: [],
  investmentTransactions: [],
  categories: [],
  marketPrices: [],
  savings: [],
  internalTransfers: [],
  incomeRhythm: 'monthly',
  savingsGoals: [],
  savingsGoalContributions: [],
  categoryBudgets: [],
  dolarBlue: null,
  displayCurrency: 'ARS',
  inflationSeries: [],
  exchangeRates: [],
  user: null,
  authEmail: null,
  authAvatarUrl: null,
  isLoading: true, // Start loading by default to prevent flash of empty content
  error: null,
  isInitialized: false,

  fetchAllData: async () => {
    set({ isLoading: true, error: null });
    const supabase = createClient();

    try {
      // 1. Primero obtenemos el usuario para poder filtrar todo lo demás
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser) {
        set({ isLoading: false, isInitialized: true, user: null, authEmail: null, authAvatarUrl: null });
        return;
      }

      // 2. Traemos todos los datos filtrados por user_id
      const [
        { data: transactionsData, error: txError },
        { data: installments, error: instError },
        { data: paymentMethodsData, error: pmError },
        { data: recurring, error: recError },
        { data: investments, error: invError },
        { data: marketPrices, error: mpError },
        { data: categories, error: catError },
        { data: userData, error: userError },
        { data: savingsData, error: savError },
        { data: internalTransfersData, error: internalTransfersError },
        { data: savingsGoalsData, error: goalsError },
        { data: contributionsData, error: contribError },
        { data: budgetsData, error: budgetsError },
        { data: exchangeRatesData, error: exchangeRatesError },
        { data: investmentAssetsData, error: investmentAssetsError },
        { data: investmentTransactionsData, error: investmentTransactionsError },
      ] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', authUser.id)
          .order('date', { ascending: false }),
        supabase
          .from('installment_plans')
          .select('*')
          .eq('user_id', authUser.id),
        supabase
          .from('payment_methods')
          .select('*')
          .eq('user_id', authUser.id),
        supabase
          .from('recurring_plans')
          .select('*')
          .eq('user_id', authUser.id),
        supabase
          .from('investments')
          .select('*')
          .eq('user_id', authUser.id),
        supabase
          .from('market_prices')
          .select('*'), // Global
        supabase
          .from('categories')
          .select('*')
          .or(`user_id.eq.${authUser.id},is_system.eq.true`)
          .order('name'),
        supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single(),
        supabase
          .from('savings')
          .select('*')
          .eq('user_id', authUser.id)
          .order('date', { ascending: false }),
        supabase
          .from('internal_transfers')
          .select('*')
          .eq('user_id', authUser.id)
          .order('period_date', { ascending: false }),
        supabase
          .from('savings_goals')
          .select('*')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('savings_goal_contributions')
          .select('*')
          .eq('user_id', authUser.id)
          .order('date', { ascending: false }),
        supabase
          .from('category_budgets')
          .select('*')
          .eq('user_id', authUser.id),
        supabase
          .from('exchange_rates')
          .select('*'),
        supabase
          .from('investment_assets')
          .select('*')
          .eq('user_id', authUser.id)
          .eq('is_active', true),
        supabase
          .from('investment_transactions')
          .select('*')
          .eq('user_id', authUser.id)
          .order('date', { ascending: true }),
      ]);

      // Fetch dolar blue rate (non-blocking)
      let dolarBlue: DolarBlue | null = null;
      try {
        const dolarRes = await fetch('https://dolarapi.com/v1/dolares/blue', {
          signal: AbortSignal.timeout(5000),
        });
        if (dolarRes.ok) {
          const dolarData = await dolarRes.json();
          dolarBlue = {
            compra: dolarData.compra,
            venta: dolarData.venta,
            fechaActualizacion: dolarData.fechaActualizacion,
          };
        }
      } catch {
        // Dolar API is optional, don't fail the whole fetch
      }

      // Fetch inflación IPC (non-blocking, opcional)
      let inflationSeries: Array<{ month: string; rate: number }> = [];
      try {
        const ipcRes = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/inflacion', {
          signal: AbortSignal.timeout(5000),
        });
        if (ipcRes.ok) {
          const ipcData = (await ipcRes.json()) as Array<{ fecha: string; valor: number }>;
          inflationSeries = parseInflation(ipcData).slice(-24); // últimos 24 meses
        }
      } catch {
        // API de inflación es opcional, no rompe el fetch
      }

      if (txError) throw txError;
      if (instError) throw instError;
      if (pmError) throw pmError;
      if (recError) throw recError;
      if (catError) throw catError;
      if (savError) throw savError;
      if (userError && userError.code !== 'PGRST116') throw userError; // PGRST116 is "no rows returned"
      if (internalTransfersError) console.warn('Internal transfers fetch error (may be missing migration):', internalTransfersError.message);
      // Goals errors are non-blocking (tables may not exist yet in DEV)
      if (goalsError) console.warn('Goals fetch error (may be missing migration):', goalsError.message);
      if (contribError) console.warn('Contributions fetch error:', contribError.message);
      if (budgetsError) console.warn('Budgets fetch error:', budgetsError.message);
      if (exchangeRatesError) console.warn('Exchange rates fetch error (may be missing migration):', exchangeRatesError.message);
      if (investmentAssetsError) console.warn('Investment assets fetch error (may be missing migration):', investmentAssetsError.message);
      if (investmentTransactionsError) console.warn('Investment transactions fetch error (may be missing migration):', investmentTransactionsError.message);

      const methods = (paymentMethodsData as PaymentMethod[]) || [];
      const rawTransactions = (transactionsData as Transaction[]) || [];

      // PROCESAMIENTO INTELIGENTE DEL FRONTEND
      // Creamos 'periodDate' para agrupar visualmente en el mes del resumen
      const processedTransactions = prepareTransactions(rawTransactions, methods, (exchangeRatesData as ExchangeRate[]) || [], dolarBlue);
      const recomputedRecurring = prepareRecurringPlans(((recurring as RecurringPlan[]) || []), (exchangeRatesData as ExchangeRate[]) || [], dolarBlue);

      set({
        transactions: processedTransactions,
        installmentPlans: (installments as InstallmentPlan[]) || [],
        paymentMethods: methods,
        recurringPlans: recomputedRecurring,
        investments: (investments as Investment[]) || [],
        investmentAssets: (investmentAssetsData as InvestmentAsset[]) || [],
        investmentTransactions: (investmentTransactionsData as InvestmentTransaction[]) || [],
        marketPrices: (marketPrices as MarketPrice[]) || [],
        categories: (categories as Category[]) || [],
        savings: (savingsData as Saving[]) || [],
        internalTransfers: (internalTransfersData as InternalTransfer[]) || [],
        savingsGoals: (savingsGoalsData as SavingsGoal[]) || [],
        savingsGoalContributions: (contributionsData as SavingsGoalContribution[]) || [],
        categoryBudgets: (budgetsData as CategoryBudget[]) || [],
        dolarBlue,
        inflationSeries,
        exchangeRates: (exchangeRatesData as ExchangeRate[]) || [],
        user: (userData as User) || null,
        // Viaja en el select('*') de users que ya se hace arriba: sin query nueva.
        incomeRhythm: (userData as User)?.income_rhythm ?? 'monthly',
        authEmail: authUser.email ?? null,
        authAvatarUrl: (authUser.user_metadata?.avatar_url as string) ?? null,
        isInitialized: true,
      });
    } catch (error) {
      console.error('Failed to fetch financial data:', error);
      set({ error: 'Unable to load financial data. Please try again later.', isInitialized: true });
    } finally {
      set({ isLoading: false });
    }
  },

  getPortfolioStatus: (displayCurrency = 'ARS') => {
    const { investmentAssets, investmentTransactions, marketPrices, exchangeRates, dolarBlue, savings } = get();
    return computePortfolioStatus(
      { investmentAssets, investmentTransactions, marketPrices, exchangeRates, dolarBlue, savings },
      displayCurrency,
    );
  },

  getPortfolioDistribution: () => {
    const { assets } = get().getPortfolioStatus();

    // Escala categorica de la marca (--chart-N), no la paleta default de Tailwind.
    const COLOR_MAP: Record<string, string> = {
      stock: 'var(--chart-1)', cedear: 'var(--chart-1)', etf: 'var(--chart-1)',
      bond: 'var(--chart-5)', on: 'var(--chart-5)', bopreal: 'var(--chart-5)',
      lecap: 'var(--chart-6)', boncap: 'var(--chart-6)',
      crypto: 'var(--chart-3)', stablecoin: 'var(--chart-3)',
      plazo_fijo: 'var(--chart-2)', money_market: 'var(--chart-2)',
      fci: 'var(--chart-8)',
    };

    const grouped: Record<string, number> = {};
    for (const asset of assets) {
      grouped[asset.asset_type] = (grouped[asset.asset_type] ?? 0) + asset.currentValue;
    }

    const total = Object.values(grouped).reduce((s, v) => s + v, 0);

    return Object.entries(grouped)
      .filter(([, value]) => value > 0)
      .map(([assetType, value]) => ({
        assetType,
        value,
        percentage: total > 0 ? (value / total) * 100 : 0,
        color: COLOR_MAP[assetType] ?? 'var(--chart-8)',
      }))
      .sort((a, b) => b.value - a.value);
  },

  getUpcomingPayments: (days = 90) => {
    const { marketPrices, investmentAssets, investmentTransactions } = get();
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 86400000);

    return marketPrices
      .filter((mp) => {
        if (!mp.next_coupon_date) return false;
        const couponDate = parseLocalDate(mp.next_coupon_date);
        return couponDate >= now && couponDate <= cutoff;
      })
      .map((mp) => {
        const asset = investmentAssets.find(a => a.ticker === mp.ticker);
        if (!asset) return null;

        const txs = investmentTransactions.filter(t => t.asset_id === asset.id);
        const buys = txs.filter(t => t.type === 'buy');
        const sells = txs.filter(t => t.type === 'sell');
        const totalBuyQty = buys.reduce((s, t) => s + Number(t.quantity), 0);
        const totalSellQty = sells.reduce((s, t) => s + Number(t.quantity), 0);
        const position = Math.max(totalBuyQty - totalSellQty, 0);

        return {
          assetName: asset.name,
          ticker: mp.ticker,
          type: asset.asset_type,
          date: mp.next_coupon_date!,
          estimatedAmount: (mp.next_coupon_amount ?? 0) * position,
          currency: asset.currency ?? 'ARS',
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  getAssetDetail: (assetId: string) => {
    const { investmentAssets, investmentTransactions, marketPrices } = get();
    const asset = investmentAssets.find(a => a.id === assetId);
    if (!asset) return null;

    const txs = investmentTransactions.filter(t => t.asset_id === assetId);
    const buys = txs.filter(t => t.type === 'buy');
    const sells = txs.filter(t => t.type === 'sell');

    const totalBuyQty = buys.reduce((s, t) => s + Number(t.quantity), 0);
    const totalSellQty = sells.reduce((s, t) => s + Number(t.quantity), 0);
    const position = Math.max(totalBuyQty - totalSellQty, 0);

    const totalBuyCost = buys.reduce((s, t) => s + Number(t.quantity) * Number(t.price_per_unit), 0);
    const ppc = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;

    const mp = marketPrices.find(m => m.ticker === asset.ticker) ?? null;
    let currentPrice = mp?.last_price ?? ppc;
    let projectedValue: number | null = null;

    if (asset.asset_type === 'plazo_fijo' || asset.asset_type === 'money_market') {
      const meta = asset.metadata as Record<string, unknown>;
      const tna = typeof meta?.tna === 'number' ? meta.tna : 0;
      const startStr = typeof meta?.start_date === 'string' ? meta.start_date : null;
      const endStr = typeof meta?.end_date === 'string' ? meta.end_date : null;

      if (tna > 0 && startStr && totalBuyCost > 0) {
        const startD = parseLocalDate(startStr);
        const endD = endStr ? parseLocalDate(endStr) : null;
        const today = new Date();
        const msDay = 86400000;
        const maxDays = endD ? (endD.getTime() - startD.getTime()) / msDay : 365;
        const elapsed = Math.min((today.getTime() - startD.getTime()) / msDay, maxDays);
        projectedValue = totalBuyCost * (1 + tna * (elapsed / 365));
        currentPrice = position > 0 ? projectedValue / position : ppc;
      } else {
        currentPrice = ppc;
      }
    }

    const currentValue = position * currentPrice;
    const investedValue = position * ppc;
    const unrealizedPL = (currentPrice - ppc) * position;
    const realizedPL = sells.reduce((s, t) => s + (Number(t.price_per_unit) - ppc) * Number(t.quantity), 0);
    const plPercent = investedValue > 0 ? (unrealizedPL / investedValue) * 100 : 0;

    return {
      asset, transactions: txs, position, ppc, unrealizedPL, realizedPL,
      currentPrice, currentValue, investedValue, plPercent,
      marketData: mp, projectedValue,
    };
  },

  getBenchmarkComparison: (period) => {
    // Datos históricos no disponibles aún. Wave 9 completará la integración.
    return {
      portfolioReturn: null,
      inflationReturn: null,
      sp500Return: null,
      blueReturn: null,
      realReturn: null,
      period,
    };
  },

  /**
   * FÓRMULA DEL BALANCE DISPONIBLE (Opción A: "Caja actual")
   * =========================================================
   * Refleja el dinero real que tenés disponible HOY, considerando:
   *
   * Balance = ingresos históricos
   *         - gastos variables históricos (sin cuotas, sin Mensualidades)
   *         - cuotas YA pagadas (fecha visual <= hoy)
   *         - cuotas que vencen este mes (según ciclo de tarjeta)
   *         - Mensualidades activas × 1 (solo el mes actual)
   *
   * Decisiones de diseño:
   * - Cuotas FUTURAS: NO se restan. Todavía no salieron de tu bolsillo.
   *   Solo impactan cuando llega su mes.
   * - Mensualidades: se restan UNA vez (mes actual) porque no generan
   *   transacciones reales. No se multiplican por meses pasados para
   *   evitar inventar datos históricos que no existen en la base.
   *
   * NO incluye:
   * - Cuotas de meses futuros
   * - Ahorros (tabla separada, no son transacciones)
   */
  getExchangeRate: (pair: string) => {
    const { exchangeRates, dolarBlue } = get();
    return resolveRate(pair, exchangeRates, dolarBlue);
  },

  setDisplayCurrency: (c) => set({ displayCurrency: c }),

  getUsdRate: () => {
    const { exchangeRates, dolarBlue } = get();
    return resolveRate('USD_ARS_MEP', exchangeRates, dolarBlue);
  },

  toDisplay: (ars) => {
    const { displayCurrency, getUsdRate } = get();
    if (displayCurrency === 'USD') {
      const rate = getUsdRate();
      return rate > 0 ? ars / rate : ars;
    }
    return ars;
  },

  getInflationSeries: () => get().inflationSeries,

  getGlobalBalance: () => {
    const { transactions, paymentMethods, internalTransfers, getPendingFixedExpenses } = get();
    return computeGlobalBalance(transactions, paymentMethods, internalTransfers, getPendingFixedExpenses().total, new Date());
  },

  /**
   * Retorna la suma de TODAS las Mensualidades activas.
   *
   * Este es un INDICADOR PROYECTADO de gasto mensual recurrente, no una cantidad
   * de gasto realizado. Útil para:
   * - Estimar flujo de caja futuro
   * - Alertas si el burn rate es alto
   * - Dashboard de Mensualidades
   *
   * NOTA: NO se resta de getGlobalBalance() para evitar double-counting.
   * Los gastos reales de Mensualidades SÍ aparecen como transacciones.
   */
  getMonthlyBurnRate: () => {
    const { recurringPlans } = get();
    return recurringPlans
      .filter((p) => p.is_active)
      .reduce((acc, p) => acc + Math.abs(Number(p.amount)), 0);
  },

  getInstallmentStatus: (planId: string) => {
    const { installmentPlans, transactions } = get();
    const plan = installmentPlans.find((p) => p.id === planId);

    if (!plan) return null;

    const relatedTransactions = transactions.filter(
      (t) => t.installment_plan_id === planId
    );

    const now = new Date();

    const paidTransactions = relatedTransactions.filter((t) => {
      const transactionDate = parseLocalDate(t.date);
      return transactionDate <= startOfDay(now);
    });

    const paidAmount = paidTransactions.reduce(
      (acc, t) => acc + Math.abs(Number(t.amount)),
      0
    );

    const totalAmount = Number(plan.total_amount);
    const installmentsPaidCount = paidTransactions.length;
    const remainingAmount = Math.max(totalAmount - paidAmount, 0);
    const remainingInstallments = Math.max(
      plan.installments_count - installmentsPaidCount,
      0
    );

    const progress = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;

    return {
      paid: paidAmount,
      remaining: remainingAmount,
      progress,
      installmentsPaid: installmentsPaidCount,
      remainingInstallments,
      isFinished: remainingAmount <= 100,
      plan,
    };
  },

  /**
   * Retorna el estado de consumo de un método de pago.
   *
   * Para tarjetas de crédito:
   * - Calcula el período actual según closing_day/payment_day
   * - Agrupa ingresos, gastos y cuotas del ciclo
   * - Retorna currentConsumption = ingresos - gastos - cuotas - Mensualidades
   *
   * Para débito/efectivo:
   * - Usa mes calendario
   * - currentConsumption es el balance histórico hasta fin de mes
   *
   * Resultado:
   * - currentConsumption: Balance neto del período (consumo real - ingresos)
   * - fixedCosts: Mensualidades activas en este método
   * - projectedTotal: Mismo que currentConsumption (consistencia)
   * - nextClosingDate: Próxima fecha de cierre (solo crédito)
   * - nextPaymentDate: Próxima fecha de vencimiento (solo crédito)
   */
  getDefaultPaymentMethod: () => {
    return get().paymentMethods.find((m) => m.is_default);
  },

  getUnassignedTransactionsCount: () => {
    return get().transactions.filter((t) => t.payment_method_id == null).length;
  },

  isCreditCardCyclePaid: (methodId: string) => {
    const { transactions, paymentMethods } = get();
    const method = paymentMethods.find((m) => m.id === methodId);
    return method ? hasCardPaymentInCycle(transactions, method, new Date()) : false;
  },

  getPaymentMethodStatus: (methodId: string) => {
    const { transactions, recurringPlans, paymentMethods } = get();
    return computePaymentMethodStatus(paymentMethods.find((m) => m.id === methodId), transactions, recurringPlans, new Date());
  },

  getPendingCreditCardByCard: () => {
    const { paymentMethods, transactions, recurringPlans } = get();
    return computePendingCreditCards(paymentMethods, transactions, recurringPlans, new Date());
  },

  /**
   * Retorna la suma total de cuotas que vencen en el mes actual.
   *
   * La "mes actual" se define según el tipo de pago:
   * - Tarjeta de crédito: Mes de vencimiento según ciclo de facturación (closing_day/payment_day)
   * - Débito/Efectivo: Mes calendario (hoy pertenece a este mes)
   *
   * Ej: Si hoy es 19 de marzo y la tarjeta cierra día 20 con pago día 6:
   *   - Cuotas con fecha 2-20 marzo = vencimiento 6 de abril = SÍ se incluyen
   *   - Cuotas con fecha 21 marzo+ = vencimiento 6 de mayo = NO se incluyen
   */
  getCurrentMonthInstallmentsTotal: () => {
    const { transactions, paymentMethods } = get();
    const now = new Date();

    return transactions
      .filter((t) => t.installment_plan_id && isExpenseInCurrentMonthScope(t, paymentMethods, now))
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
  },

  getCurrentMonthInstallments: () => {
    const { transactions, paymentMethods } = get();
    const now = new Date();

    return transactions
      .filter((t) => t.installment_plan_id && isExpenseInCurrentMonthScope(t, paymentMethods, now));
  },

  getActiveRecurringPlans: () => {
    const { recurringPlans } = get();
    return recurringPlans.filter((p) => p.is_active);
  },

  getGlobalIncome: () => {
    const { transactions } = get();
    return transactions
      .filter((t) => t.type === 'income')
      .reduce((acc, t) => acc + Number(t.amount), 0);
  },

  getGlobalEffectiveExpenses: () => {
    const { transactions, getCurrentMonthInstallmentsTotal, getMonthlyBurnRate } = get();

    const totalNonInstallmentExpenses = transactions
      .filter((t) => t.type === 'expense' && !t.installment_plan_id && !t.card_payment_for && !t.is_balance_adjustment)
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    return totalNonInstallmentExpenses + getCurrentMonthInstallmentsTotal() + getMonthlyBurnRate();
  },

  getExpensesByCategory: (scope, type = 'expense') => {
    const { transactions, paymentMethods, categories } = get();
    return computeExpensesByCategory(transactions, paymentMethods, categories, scope, type, new Date());
  },

  getMonthlyBalance: (monthStr, paymentMethodId) => {
    const { transactions, recurringPlans } = get();
    return computeMonthlyBalance(transactions, recurringPlans, monthStr, paymentMethodId, new Date());
  },

  getPendingFixedExpenses: () => {
    const { recurringPlans, transactions } = get();
    return computePendingFixedExpenses(recurringPlans, transactions);
  },

  /**
   * Meses PASADOS de mensualidades activas sin transacción registrada
   * (desde el mes de creación de cada plan hasta el mes pasado inclusive).
   * Alimenta el banner de regularización en Compromisos; el backfill real
   * lo hace la server action backfillRecurringPlansHistory con esta misma lógica.
   */
  getRecurringBackfillPreview: () => {
    const { recurringPlans, transactions } = get();
    const currentMonth = format(new Date(), 'yyyy-MM');

    // Piso del historial: mes del primer INGRESO del usuario. Antes de ese mes
    // la app no tiene ingresos registrados, así que backfillear mensualidades
    // ahí resta gastos sin contrapartida y hunde el saldo. Ojo: NO alcanza con
    // "primera transacción" — una cuota/gasto anterior al primer sueldo NO debe
    // fijar el piso (bug que materializaba meses fantasma sin ingreso detrás).
    let floorMonth = currentMonth;
    for (const t of transactions) {
      if (t.type !== 'income') continue;
      const m = String(t.date).slice(0, 7);
      if (m < floorMonth) floorMonth = m;
    }

    // Meses ya cubiertos por plan (por fecha real de la transacción) y
    // exceso: pagos generados en meses anteriores al piso.
    const covered = new Map<string, Set<string>>();
    let excessMonths = 0;
    let excessAmount = 0;
    for (const t of transactions) {
      if (!t.recurring_plan_id) continue;
      const m = String(t.date).slice(0, 7);
      if (m < floorMonth) {
        excessMonths += 1;
        excessAmount += Math.abs(Number(t.amount));
        continue;
      }
      if (!covered.has(t.recurring_plan_id)) covered.set(t.recurring_plan_id, new Set());
      covered.get(t.recurring_plan_id)!.add(m);
    }

    let missingMonths = 0;
    let totalAmount = 0;
    for (const plan of recurringPlans) {
      if (!plan.is_active || !plan.created_at) continue;
      const start = new Date(plan.created_at);
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const coveredSet = covered.get(plan.id) ?? new Set<string>();
      while (format(cursor, 'yyyy-MM') < currentMonth) {
        const monthKey = format(cursor, 'yyyy-MM');
        if (monthKey >= floorMonth && !coveredSet.has(monthKey)) {
          missingMonths += 1;
          totalAmount += Math.abs(Number(plan.amount));
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    return { missingMonths, totalAmount, excessMonths, excessAmount };
  },

  getAvailableToSpend: () => {
    const { transactions, paymentMethods, recurringPlans, internalTransfers, incomeRhythm } = get();
    const pendingCards = get().getPendingCreditCardByCard();
    return computeAvailableToSpend({
      paymentMethods,
      transactions,
      transfers: internalTransfers,
      recurringPlans,
      pendingCards,
      rhythm: incomeRhythm ?? 'monthly',
    });
  },

  /**
   * Retorna desglose de gastos por categoría con porcentajes.
   *
   * @param scope - 'global' = todos los gastos históricos, 'current_month' = mes actual
   *
   * Retorna:
   * - total: Suma total de gastos en el scope
   * - items: Array de {name, value, percentage} ordenado por mayor gasto
   *
   * Nota: La "mes actual" respeta ciclos de tarjeta si aplica.
   * Útil para dashboard de análisis de gastos por categoría.
   */
  getCategoryBreakdown: (scope, type = 'expense') => {
    const expenses = get().getExpensesByCategory(scope, type);
    const total = Object.values(expenses).reduce((acc, val) => acc + val, 0);

    const items = Object.entries(expenses).map(([name, value]) => ({
      name,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0
    })).sort((a, b) => b.value - a.value);

    return { total, items };
  },

  getPaymentMethodTransactionsForCurrentMonth: (methodId) => {
    const { transactions, paymentMethods } = get();
    const now = new Date();
    const method = paymentMethods.find((m) => m.id === methodId);
    const nextPaymentDate = method ? getCreditCycleDates(method, now)?.nextPaymentDate : undefined;

    return transactions.filter(t => {
      if (t.payment_method_id !== methodId) return false;

      // Crédito con ciclo: gastos e ingresos pertenecen al ciclo si su fecha de
      // vencimiento (t.date) cae en el mes de nextPaymentDate. Así la lista cuadra
      // exactamente con el número "A pagar en el vencimiento".
      if (nextPaymentDate) {
        return sameMonthYear(parseLocalDate(t.date), nextPaymentDate);
      }

      // Débito/efectivo (o crédito sin ciclo): mes calendario.
      if (t.type === 'income') {
        return isSameMonth(parseLocalDate(t.date), now);
      }
      return isExpenseInCurrentMonthScope(t, paymentMethods, now);
    });
  },

  getMonthlyIncome: () => {
    const { transactions } = get();
    const now = new Date();
    return transactions
      .filter((t) => {
        if (t.type !== 'income' || t.is_balance_adjustment) return false;
        const localTDate = parseLocalDate(t.date);
        return isSameMonth(localTDate, now);
      })
      .reduce((acc, t) => acc + Number(t.amount), 0);
  },

  getMonthlyIncomeTransactions: () => {
    const { transactions } = get();
    const now = new Date();
    return transactions.filter((t) => {
      if (t.type !== 'income' || t.is_balance_adjustment) return false;
      const localTDate = parseLocalDate(t.date);
      return isSameMonth(localTDate, now);
    });
  },

  getMonthlyVariableExpenseTransactions: () => {
    const { transactions, paymentMethods } = get();
    const now = new Date();
    return transactions.filter(
      (t) =>
        t.type === 'expense' &&
        !t.installment_plan_id &&
        !t.recurring_plan_id &&
        isExpenseInCurrentMonthScope(t, paymentMethods, now)
    );
  },

  /**
   * Retorna la suma de gastos VARIABLES del mes actual.
   *
   * Solo incluye:
   * - Gastos normales (sin cuota de plan de cuotas)
   * - Sin Mensualidades (sin recurring_plan_id)
   *
   * Excluye:
   * - Cuotas (installment_plan_id)
   * - Mensualidades activas (recurring_plan_id)
   *
   * Útil para:
   * - Ver qué se gastó en consumo real (no recurrente)
   * - Presupuestar variable vs. fijo
   * - Dashboard de gastos mensuales
   *
   * Nota: La "mes actual" respeta el ciclo de tarjeta si aplica (ver isExpenseInCurrentMonthScope)
   */
  getMonthlyVariableExpenses: () => {
    const { transactions, paymentMethods } = get();
    const now = new Date();
    return transactions
      .filter((t) =>
        t.type === 'expense' &&
        !t.installment_plan_id &&
        !t.recurring_plan_id &&
        isExpenseInCurrentMonthScope(t, paymentMethods, now)
      )
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
  },

  /**
   * Retorna un desglose completo de gastos del mes actual por tipo.
   *
   * Útil para:
   * - Dashboard mobile con resumen de gastos
   * - Análisis de composición del gasto (variable vs fijo vs cuotas)
   * - Proyección de flujo de caja mensual
   *
   * Retorna:
   * - variableExpenses: Gastos sin cuotas ni Mensualidades
   * - installmentsTotal: Cuotas que vencen este mes
   * - subscriptionsCost: Mensualidades activas (burn rate)
  * - savingsTransfers: Transferencias a ahorro del mes
  * - totalExpenses: Suma de gastos + transferencias a ahorro
   * - income: Ingresos del mes actual
   * - netBalance: income - totalExpenses (balance DEL MES, no histórico)
   *
   * IMPORTANTE: netBalance es diferente de getGlobalBalance():
   * - netBalance = proyección mensual (puede ser negativo en mes malo)
   * - getGlobalBalance() = histórico acumulado real
   */
  getMonthlyExpensesBreakdown: () => {
    const {
      getMonthlyVariableExpenses,
      getCurrentMonthInstallmentsTotal,
      getMonthlyBurnRate,
      getMonthlyIncome,
      internalTransfers,
    } = get();
    const now = new Date();
    const currentMonth = format(now, 'yyyy-MM');

    const variableExpenses = getMonthlyVariableExpenses();
    const installmentsTotal = getCurrentMonthInstallmentsTotal();
    const subscriptionsCost = getMonthlyBurnRate();
    const savingsTransfers = internalTransfers
      .filter((transfer) => transfer.period_date?.slice(0, 7) === currentMonth)
      .reduce((acc, transfer) => acc + Math.abs(Number(transfer.amount)), 0);
    const totalExpenses = variableExpenses + installmentsTotal + subscriptionsCost + savingsTransfers;
    const income = getMonthlyIncome();
    const netBalance = income - totalExpenses;

    return {
      variableExpenses,
      installmentsTotal,
      subscriptionsCost,
      savingsTransfers,
      totalExpenses,
      income,
      netBalance,
    };
  },

  getMonthlyLiquidityBreakdown: () => {
    const {
      transactions,
      paymentMethods,
      recurringPlans,
      internalTransfers,
      getPendingCreditCardByCard,
      getMonthlyIncome,
    } = get();
    const now = new Date();
    const currentMonth = format(now, 'yyyy-MM');

    // Tarjetas de crédito pendientes de pago (no pagadas aún este ciclo)
    const pendingCards = getPendingCreditCardByCard().filter((c) => c.isPending);
    const pendingCardIds = new Set(pendingCards.map((c) => c.methodId));
    const pendingCreditTotal = pendingCards.reduce((acc, c) => acc + c.total, 0);

    // Gastos variables del mes EXCLUYENDO los de tarjetas pendientes
    const liquidVariableExpenses = transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          !t.installment_plan_id &&
          !t.recurring_plan_id &&
          isExpenseInCurrentMonthScope(t, paymentMethods, now) &&
          !pendingCardIds.has(t.payment_method_id ?? ''),
      )
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    // Cuotas del mes EXCLUYENDO las de tarjetas pendientes
    const liquidInstallments = transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          !!t.installment_plan_id &&
          isExpenseInCurrentMonthScope(t, paymentMethods, now) &&
          !pendingCardIds.has(t.payment_method_id ?? ''),
      )
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    // Mensualidades activas EXCLUYENDO las de tarjetas pendientes
    const liquidSubscriptions = recurringPlans
      .filter((p) => p.is_active && !pendingCardIds.has(p.payment_method_id ?? ''))
      .reduce((acc, p) => acc + Math.abs(Number(p.amount)), 0);

    const savingsTransfers = internalTransfers
      .filter((transfer) => transfer.period_date?.slice(0, 7) === currentMonth)
      .reduce((acc, transfer) => acc + Math.abs(Number(transfer.amount)), 0);

    const income = getMonthlyIncome();
    const liquidTotalExpenses = liquidVariableExpenses + liquidInstallments + liquidSubscriptions + savingsTransfers;
    const liquidNetBalance = income - liquidTotalExpenses;

    return {
      income,
      liquidVariableExpenses,
      liquidInstallments,
      liquidSubscriptions,
      savingsTransfers,
      liquidTotalExpenses,
      liquidNetBalance,
      pendingCreditTotal,
      pendingCards,
    };
  },

  getMonthlyComparison: (monthStr?: string) => {
    const { transactions, paymentMethods, recurringPlans } = get();
    const now = monthStr ? parse(monthStr, 'yyyy-MM', new Date()) : new Date();
    const prev = subMonths(now, 1);

    const calcTotalExpenses = (ref: Date) => {
      const variable = transactions
        .filter((t) =>
          t.type === 'expense' &&
          !t.installment_plan_id &&
          !t.recurring_plan_id &&
          isExpenseInCurrentMonthScope(t, paymentMethods, ref)
        )
        .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

      const installmentsTotal = transactions
        .filter((t) => t.installment_plan_id && isExpenseInCurrentMonthScope(t, paymentMethods, ref))
        .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

      const subscriptions = recurringPlans
        .filter((p) => p.is_active)
        .reduce((acc, p) => acc + Number(p.amount), 0);

      return variable + installmentsTotal + subscriptions;
    };

    const currentMonthExpenses = calcTotalExpenses(now);
    const previousMonthExpenses = calcTotalExpenses(prev);
    const percentageChange =
      previousMonthExpenses === 0
        ? 0
        : ((currentMonthExpenses - previousMonthExpenses) / previousMonthExpenses) * 100;

    return { currentMonthExpenses, previousMonthExpenses, percentageChange };
  },

  /**
   * Recarga solo los datos de objetivos (metas + aportes + presupuestos).
   * Útil después de CRUD de objetivos sin necesidad de recargar todo.
   */
  fetchGoalsData: async () => {
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const [
      { data: savingsGoalsData },
      { data: contributionsData },
      { data: budgetsData },
    ] = await Promise.all([
      supabase.from('savings_goals').select('*').eq('user_id', authUser.id).order('created_at', { ascending: false }),
      supabase.from('savings_goal_contributions').select('*').eq('user_id', authUser.id).order('date', { ascending: false }),
      supabase.from('category_budgets').select('*').eq('user_id', authUser.id),
    ]);

    set({
      savingsGoals: (savingsGoalsData as SavingsGoal[]) || [],
      savingsGoalContributions: (contributionsData as SavingsGoalContribution[]) || [],
      categoryBudgets: (budgetsData as CategoryBudget[]) || [],
    });
  },


  /**
   * Retorna el progreso de una meta de ahorro específica.
   *
   * Para metas 'one_time':
   *   - totalContributed: suma de TODOS los aportes históricos
   *   - daysLeft: días hasta target_date (null si no hay fecha)
   *   - status: 'completed' si totalContributed >= target
   *
   * Para metas 'monthly':
   *   - currentMonthContributed: suma de aportes del mes actual
   *   - totalContributed: suma histórica (informativo)
   *   - daysLeft: null (no aplica)
   *   - status: 'completed' si currentMonthContributed >= target
   */
  getSavingsGoalProgress: (goalId: string) => {
    const { savingsGoals, savingsGoalContributions } = get();
    const goal = savingsGoals.find((g) => g.id === goalId);
    if (!goal) return null;

    const goalContributions = savingsGoalContributions.filter((c) => c.goal_id === goalId);
    const totalContributed = goalContributions.reduce((acc, c) => acc + Number(c.amount), 0);

    const now = new Date();
    const currentMonthContributed = goalContributions
      .filter((c) => {
        const [year, month] = c.date.split('-').map(Number);
        return year === now.getFullYear() && month === now.getMonth() + 1;
      })
      .reduce((acc, c) => acc + Number(c.amount), 0);

    const target = Number(goal.target_amount);

    // Para metas mensuales el progreso es del mes actual
    const effectiveContributed = goal.type === 'monthly' ? currentMonthContributed : totalContributed;
    const percent = target > 0 ? Math.min((effectiveContributed / target) * 100, 100) : 0;
    const remaining = Math.max(target - effectiveContributed, 0);

    let daysLeft: number | null = null;
    if (goal.type === 'one_time' && goal.target_date) {
      const targetDate = parseLocalDate(goal.target_date);
      const diffMs = targetDate.getTime() - startOfDay(now).getTime();
      daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }

    const status: 'active' | 'completed' = effectiveContributed >= target ? 'completed' : 'active';

    return {
      goal,
      totalContributed,
      currentMonthContributed,
      target,
      percent,
      remaining,
      daysLeft,
      status,
    };
  },

  /**
   * Agregado de metas de ahorro activas para la card de anillos del inicio.
   *
   * Orden de prioridad: las metas con fecha límite (`daysLeft` no nulo) van
   * primero, ordenadas por `daysLeft` ascendente (las que vencen antes,
   * primero); las metas sin fecha (mensuales) van después, ordenadas por
   * `percent` descendente (las más avanzadas primero).
   *
   * `totalSavedARS` suma TODAS las metas activas (no solo las priorizadas para
   * mostrar), convirtiendo los aportes de metas en USD a ARS vía dólar blue.
   *
   * `totalsByCurrency` es el total "según corresponda", SIN convertir nunca
   * entre monedas: suma nativa de aportes por cada moneda que tenga al menos
   * una meta activa. Si el usuario solo tiene metas ARS, `USD` queda `null`
   * (no se muestra esa fila); si tiene de las dos, se muestran ambas nativas
   * en vez de mezclarlas en un unico ARS-equivalente (una meta en USD no debe
   * verse "convertida a pesos" solo porque conviva con otras en ARS).
   */
  getSavingsGoalsOverview: () => {
    const { savingsGoals, dolarBlue, getSavingsGoalProgress } = get();
    const blue = dolarBlue?.venta && dolarBlue.venta > 0 ? dolarBlue.venta : null;

    const withProgress = savingsGoals
      .filter((g) => g.is_active)
      .map((g) => getSavingsGoalProgress(g.id))
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const sorted = [...withProgress].sort((a, b) => {
      if (a.daysLeft !== null && b.daysLeft !== null) return a.daysLeft - b.daysLeft;
      if (a.daysLeft !== null) return -1;
      if (b.daysLeft !== null) return 1;
      return b.percent - a.percent;
    });

    const goals = sorted.map((p) => ({
      id: p.goal.id,
      name: p.goal.name,
      percent: p.percent,
      currency: p.goal.currency,
      status: p.status,
    }));

    const totalSavedARS = withProgress.reduce((sum, p) => {
      const contributed = p.totalContributed;
      return sum + (p.goal.currency === 'USD' && blue ? contributed * blue : contributed);
    }, 0);

    const sumNative = (currency: 'ARS' | 'USD') => {
      const matching = withProgress.filter((p) => p.goal.currency === currency);
      return matching.length > 0 ? matching.reduce((sum, p) => sum + p.totalContributed, 0) : null;
    };
    const totalsByCurrency: { ARS: number | null; USD: number | null } = {
      ARS: sumNative('ARS'),
      USD: sumNative('USD'),
    };

    return { goals, totalSavedARS, totalsByCurrency, activeCount: goals.length };
  },

  /**
   * Retorna el estado de un presupuesto mensual por categoría.
   *
   * El gasto se calcula dinámicamente usando getExpensesByCategory('current_month')
   * que ya maneja la lógica de ciclos de tarjeta.
   *
   * Estados:
   * - 'ok': < 75% del límite
   * - 'warning': 75–100% del límite
   * - 'exceeded': > 100% del límite
   */
  getCategoryBudgetStatus: (categoryId: string) => {
    const { categoryBudgets, categories, getExpensesByCategory } = get();
    const budget = categoryBudgets.find((b) => b.category_id === categoryId && b.is_active);
    if (!budget) return null;

    const category = categories.find((c) => c.id === categoryId);
    const categoryName = category?.name ?? 'Sin categoría';
    const categoryEmoji = category?.emoji ?? null;

    const expensesByCategory = getExpensesByCategory('current_month');
    const spent = expensesByCategory[categoryName] ?? 0;
    const limit = Number(budget.amount);
    const percent = limit > 0 ? (spent / limit) * 100 : 0;

    const status: 'ok' | 'warning' | 'exceeded' =
      percent >= 100 ? 'exceeded' : percent >= 75 ? 'warning' : 'ok';

    return { budget, categoryName, categoryEmoji, spent, limit, percent, status };
  },

  /**
   * Retorna el estado de TODOS los presupuestos activos del usuario.
   * Ordenados por porcentaje de gasto (mayor primero) para mostrar las alertas más urgentes.
   */
  getAllBudgetStatuses: () => {
    const { categoryBudgets, getCategoryBudgetStatus } = get();
    return categoryBudgets
      .filter((b) => b.is_active)
      .map((b) => getCategoryBudgetStatus(b.category_id))
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => b.percent - a.percent);
  },

  /**
   * Agregado de presupuestos activos para el gauge del inicio. `spent`/`projected`
   * de cada presupuesto ya vienen en ARS (derivan de `getExpensesByCategory`, que
   * trabaja siempre en ARS); solo `limit` está en la moneda propia del presupuesto
   * y necesita conversión vía dólar blue.
   *
   * `exceededCount`/`warningCount` reusan el `status` por presupuesto de
   * `getAllBudgetStatuses()` (puede ser impreciso para presupuestos en USD, ver
   * nota en `getCategoryBudgetStatus`; fuera de alcance arreglarlo acá).
   */
  getBudgetsOverview: () => {
    const { categoryBudgets, dolarBlue, getAllBudgetStatuses, getBudgetProjection } = get();
    if (!categoryBudgets.some((b) => b.is_active)) return null;

    const blue = dolarBlue?.venta && dolarBlue.venta > 0 ? dolarBlue.venta : null;
    const statuses = getAllBudgetStatuses();

    let totalSpentARS = 0;
    let totalLimitARS = 0;
    let projectedTotalARS = 0;

    for (const s of statuses) {
      totalSpentARS += s.spent;
      totalLimitARS += s.budget.currency === 'USD' && blue ? s.limit * blue : s.limit;
      const projection = getBudgetProjection(s.budget.id);
      projectedTotalARS += projection?.projected ?? s.spent;
    }

    const percent = totalLimitARS > 0 ? (totalSpentARS / totalLimitARS) * 100 : 0;
    const projectedPercent = totalLimitARS > 0 ? (projectedTotalARS / totalLimitARS) * 100 : 0;

    const status: 'ok' | 'warning' | 'exceeded' =
      percent >= 100 ? 'exceeded' : percent >= 75 ? 'warning' : 'ok';

    return {
      percent,
      projectedPercent,
      status,
      willExceed: projectedPercent > 100,
      exceededCount: statuses.filter((s) => s.status === 'exceeded').length,
      warningCount: statuses.filter((s) => s.status === 'warning').length,
      totalSpentARS,
      totalLimitARS,
    };
  },

  /**
   * Retorna un snapshot de 7 semanas para sparklines en el dashboard.
   *
   * Cada valor representa el total de la semana (lunes a domingo) para las
   * últimas 7 semanas, de más antigua (índice 0) a más reciente (índice 6).
   *
   * Tipos:
   * - 'income': Ingresos por semana
   * - 'variable': Gastos variables (sin cuotas ni Mensualidades) por semana
   * - 'installments': Cuotas por semana
   * - 'fixed': Costo mensual de planes recurrentes dividido en 7 semanas iguales
   */
  getWeeklySnapshot: (type) => {
    const { transactions, recurringPlans } = get();
    const now = new Date();
    const WEEK_OPTIONS = { weekStartsOn: 1 as const };

    return Array.from({ length: 7 }, (_, i) => {
      const weekRef = subWeeks(now, 6 - i);
      const weekStart = startOfWeek(weekRef, WEEK_OPTIONS);
      const weekEnd = endOfWeek(weekRef, WEEK_OPTIONS);

      if (type === 'fixed') {
        const monthlyFixed = recurringPlans
          .filter((p) => p.is_active)
          .reduce((acc, p) => acc + Number(p.amount), 0);
        return monthlyFixed / 4.33;
      }

      return transactions
        .filter((t) => {
          const d = parseLocalDate(t.date);
          if (d < weekStart || d > weekEnd) return false;
          if (type === 'income') return t.type === 'income';
          if (type === 'variable') return t.type === 'expense' && !t.installment_plan_id && !t.recurring_plan_id;
          if (type === 'installments') return t.type === 'expense' && !!t.installment_plan_id;
          return false;
        })
        .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
    });
  },

  getMonthlyTrend: (months = 6) => {
    const { transactions, recurringPlans } = get();
    const now = new Date();
    const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    return Array.from({ length: months }, (_, i) => {
      const ref = subMonths(now, months - 1 - i);
      const monthTxs = transactions.filter((t) => {
        const dateStr = t.periodDate || t.date;
        return isSameMonth(parseLocalDate(dateStr), ref);
      });
      const income = monthTxs
        .filter((t) => t.type === 'income')
        .reduce((acc, t) => acc + Number(t.amount), 0);
      const installments = monthTxs
        .filter((t) => t.type === 'expense' && !!t.installment_plan_id)
        .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
      const recurringFromTx = monthTxs
        .filter((t) => t.type === 'expense' && !!t.recurring_plan_id)
        .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
      // Compromisos fijos (recurring_plans) no generan transaccion automatica: se proyecta
      // el monto del plan para los planes activos que ya existian ese mes y que todavia no
      // tienen una transaccion cargada ese mes (evita duplicar si el usuario ya la registro).
      const recurringPlanIdsInMonth = new Set(
        monthTxs.filter((t) => t.recurring_plan_id).map((t) => t.recurring_plan_id as string),
      );
      const monthEnd = endOfMonth(ref);
      const recurringProjected = recurringPlans
        .filter((p) => p.is_active && !recurringPlanIdsInMonth.has(p.id) && new Date(p.created_at) <= monthEnd)
        .reduce((acc, p) => acc + Math.abs(Number(p.amount)), 0);
      const recurring = recurringFromTx + recurringProjected;
      const variable = monthTxs
        .filter((t) => t.type === 'expense' && !t.installment_plan_id && !t.recurring_plan_id)
        .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
      const expenses = variable + installments + recurring;
      return {
        month: MONTH_NAMES[ref.getMonth()],
        income,
        expenses,
        variable,
        installments,
        recurring,
        net: income - expenses,
      };
    });
  },

  getMonthlySpendingPace: () => {
    const { transactions, paymentMethods, getMonthlyIncome } = get();
    const now = new Date();
    const daysInMonth = endOfMonth(now).getDate();
    const todayDay = now.getDate();

    // gasto por día del mes actual (scope de ciclo) — siempre en ARS, conversión a
    // moneda de visualización se hace en el componente vía toDisplay()
    const perDay = new Array(daysInMonth + 1).fill(0);
    transactions
      .filter((t) => t.type === 'expense' && isExpenseInCurrentMonthScope(t, paymentMethods, now))
      .forEach((t) => {
        const dt = parseLocalDate(t.periodDate || t.date);
        if (isSameMonth(dt, now)) perDay[dt.getDate()] += Math.abs(Number(t.amount));
      });

    const points: Array<{ day: number; cumulative: number }> = [];
    let acc = 0;
    for (let day = 1; day <= todayDay; day++) {
      acc += perDay[day];
      points.push({ day, cumulative: acc });
    }

    const spentSoFar = acc;
    const projectedTotal = todayDay > 0 ? (spentSoFar / todayDay) * daysInMonth : 0;

    return {
      points,
      projectedTotal,
      income: getMonthlyIncome(),
      todayDay,
      daysInMonth,
    };
  },

  getSavingsRateSeries: (months = 6) => {
    return get().getMonthlyTrend(months).map((row) => {
      const rate = row.income > 0 ? (row.net / row.income) * 100 : 0;
      const tone: 'good' | 'warn' | 'bad' = rate >= 15 ? 'good' : rate >= 0 ? 'warn' : 'bad';
      return { month: row.month, net: row.net, rate, tone };
    });
  },

  getRealAdjustedTrend: (months = 6) => {
    const { getMonthlyTrend, getInflationSeries } = get();
    const inflation = getInflationSeries();
    if (inflation.length === 0) return { available: false, rows: [] };

    const now = new Date();
    const trend = getMonthlyTrend(months);
    const inflByMonth = new Map(inflation.map((r) => [r.month, r.rate]));

    // factor de deflación: producto de (1 + ipc/100) desde el mes ref+1 hasta hoy
    const rows = trend.map((row, i) => {
      let factor = 1;
      for (let k = 0; k < months - 1 - i; k++) {
        const fm = format(subMonths(now, k), 'yyyy-MM');
        const ipc = inflByMonth.get(fm) ?? 0;
        factor *= 1 + ipc / 100;
      }
      return {
        month: row.month,
        nominalExpenses: row.expenses,
        realExpenses: row.expenses * factor,
      };
    });

    return { available: true, rows };
  },

  getInstallmentsRealCost: () => {
    const { transactions, getUsdRate, inflationSeries } = get();
    const now = new Date();
    const future = transactions.filter(
      (t) => t.installment_plan_id && parseLocalDate(t.date) > now,
    );
    const remainingARS = future.reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
    const rate = getUsdRate();

    // Inflación mensual proyectada = promedio del IPC real de los últimos 3 meses.
    const recent = inflationSeries.slice(-3);
    const monthlyInflation =
      recent.length > 0 ? recent.reduce((a, r) => a + r.rate, 0) / recent.length : 0;
    const hasInflation = recent.length > 0 && monthlyInflation > 0;

    // Valor "a plata de hoy": cada cuota futura se descuenta por la inflación
    // proyectada según cuántos meses falten para pagarla.
    const realTodayARS = hasInflation
      ? future.reduce((acc, t) => {
          const d = parseLocalDate(t.date);
          const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
          const factor = Math.pow(1 + monthlyInflation / 100, Math.max(0, months));
          return acc + Math.abs(Number(t.amount)) / factor;
        }, 0)
      : remainingARS;

    const savedARS = remainingARS - realTodayARS;
    const savedPct = remainingARS > 0 ? (savedARS / remainingARS) * 100 : 0;

    return {
      remainingARS,
      remainingUSD: rate > 0 ? remainingARS / rate : 0,
      realTodayARS,
      savedARS,
      savedPct,
      monthlyInflation,
      hasInflation,
      hasData: future.length > 0,
    };
  },

  getCurrencyExposure: () => {
    const { transactions, paymentMethods } = get();
    const now = new Date();
    let arsAmount = 0, usdAmountARS = 0, usdAmountOriginal = 0;

    transactions
      .filter((t) => t.type === 'expense' && isExpenseInCurrentMonthScope(t, paymentMethods, now))
      .forEach((t) => {
        const ars = Math.abs(Number(t.amount));
        if (t.original_currency === 'USD') {
          usdAmountARS += ars;
          usdAmountOriginal += Math.abs(Number(t.original_amount ?? 0));
        } else {
          arsAmount += ars;
        }
      });

    const totalARS = arsAmount + usdAmountARS;
    return {
      arsAmount,
      usdAmountOriginal,
      totalARS,
      arsShare: totalARS > 0 ? (arsAmount / totalARS) * 100 : 0,
      usdShare: totalARS > 0 ? (usdAmountARS / totalARS) * 100 : 0,
    };
  },

  getCategoryComparison: () => {
    const { transactions, paymentMethods, categories } = get();
    const now = new Date();
    const prev = subMonths(now, 1);

    const calcExpensesByCategory = (ref: Date): Record<string, number> =>
      transactions
        .filter((t) => t.type === 'expense' && isExpenseInCurrentMonthScope(t, paymentMethods, ref))
        .reduce((acc, t) => {
          const cat = categories.find((c) => c.id === t.category_id)?.name ?? 'Otros';
          acc[cat] = (acc[cat] || 0) + Math.abs(Number(t.amount));
          return acc;
        }, {} as Record<string, number>);

    const currentExpenses = calcExpensesByCategory(now);
    const previousExpenses = calcExpensesByCategory(prev);
    const allCategories = new Set([...Object.keys(currentExpenses), ...Object.keys(previousExpenses)]);

    return Array.from(allCategories)
      .map((name) => {
        const current = currentExpenses[name] ?? 0;
        const previous = previousExpenses[name] ?? 0;
        const categoryObj = categories.find((c) => c.name === name);
        return {
          category: name,
          emoji: categoryObj?.emoji ?? '',
          current,
          previous,
          change: current - previous,
        };
      })
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  },

  getCategoryFrequencyRanking: (scope) => {
    const { transactions, categories, paymentMethods } = get();
    const now = new Date();

    const acc = new Map<string, { count: number; total: number; emoji: string }>();
    transactions
      .filter((t) => {
        if (t.type !== 'expense') return false;
        if (scope === 'current_month') {
          return isExpenseInCurrentMonthScope(t, paymentMethods, now);
        }
        return true;
      })
      .forEach((t) => {
        const cat = categories.find((c) => c.id === t.category_id);
        const name = cat?.name ?? 'Otros';
        const entry = acc.get(name) ?? { count: 0, total: 0, emoji: cat?.emoji ?? '' };
        entry.count += 1;
        entry.total += Math.abs(Number(t.amount));
        acc.set(name, entry);
      });

    return Array.from(acc.entries())
      .map(([category, { count, total, emoji }]) => ({
        category,
        emoji,
        count,
        total,
        avg: count > 0 ? total / count : 0,
      }))
      .sort((a, b) => b.count - a.count);
  },

  /**
   * Proyecta el gasto de un presupuesto activo al final del mes
   * basándose en el ritmo diario actual: (gasto actual / días transcurridos) * días totales del mes.
   *
   * Retorna null si el presupuesto no existe o no está activo.
   */
  getBudgetProjection: (budgetId: string) => {
    const { categoryBudgets, categories, getExpensesByCategory } = get();
    const budget = categoryBudgets.find((b) => b.id === budgetId && b.is_active);
    if (!budget) return null;

    const category = categories.find((c) => c.id === budget.category_id);
    const categoryName = category?.name ?? 'Sin categoría';

    const expensesByCategory = getExpensesByCategory('current_month');
    const spent = expensesByCategory[categoryName] ?? 0;
    const limit = Number(budget.amount);

    const now = new Date();
    const dayOfMonth = getDate(now);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projected = dayOfMonth > 0 ? (spent / dayOfMonth) * daysInMonth : 0;

    return {
      spent,
      projected,
      limit,
      isOverBudget: projected > limit,
    };
  },

  getFrequentTransactions: (n = 5) => {
    const { transactions, categories } = get();

    const map: Record<string, {
      count: number;
      totalAmount: number;
      lastCategoryId: string | null;
      lastDate: string;
      type: 'expense' | 'income';
    }> = {};

    for (const t of transactions) {
      const key = t.description.trim().toLowerCase();
      if (!key) continue;
      const existing = map[key];
      if (!existing || t.date > existing.lastDate) {
        map[key] = {
          count: (existing?.count ?? 0) + 1,
          totalAmount: (existing?.totalAmount ?? 0) + t.amount,
          lastCategoryId: t.category_id ?? null,
          lastDate: t.date,
          type: t.type as 'expense' | 'income',
        };
      } else {
        existing.count += 1;
        existing.totalAmount += t.amount;
      }
    }

    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, n)
      .map(([description, data]) => {
        const category = categories.find((c) => c.id === data.lastCategoryId);
        return {
          description,
          count: data.count,
          lastCategoryId: data.lastCategoryId,
          lastCategoryEmoji: category?.emoji ?? null,
          avgAmount: data.count > 0 ? data.totalAmount / data.count : 0,
          type: data.type,
        };
      });
  },

  getFrequentCategories: (n = 4, type) => {
    const { transactions, categories } = get();
    const pool = type ? categories.filter((c) => c.type === type) : categories;
    const poolIds = new Set(pool.map((c) => c.id));

    const countMap: Record<string, number> = {};
    for (const t of transactions) {
      if (!t.category_id || !poolIds.has(t.category_id)) continue;
      countMap[t.category_id] = (countMap[t.category_id] ?? 0) + 1;
    }

    const sorted = Object.entries(countMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id]) => pool.find((c) => c.id === id))
      .filter((c): c is Category => c != null);

    // Fallback for new users with no transaction history
    if (sorted.length < n) {
      const usedIds = new Set(sorted.map((c) => c.id));
      for (const c of pool) {
        if (sorted.length >= n) break;
        if (!usedIds.has(c.id)) sorted.push(c);
      }
    }

    return sorted;
  },

  getQuickAmounts: (type, currency = 'ARS', n = 3) => {
    const { transactions } = get();

    const relevant = transactions.filter((t) => {
      if (t.type !== type) return false;
      return currency === 'USD'
        ? t.original_currency === 'USD' && t.original_amount != null
        : t.original_currency !== 'USD';
    });

    const countMap = new Map<number, number>();
    for (const t of relevant) {
      const raw = currency === 'USD' ? (t.original_amount as number) : t.amount;
      const rounded = Math.round(Math.abs(raw));
      if (rounded <= 0) continue;
      countMap.set(rounded, (countMap.get(rounded) ?? 0) + 1);
    }

    const fromHistory = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([amount]) => amount);

    // Fallback razonable si no hay historial suficiente para completar n sugerencias.
    const fallback = currency === 'USD' ? [10, 50, 100] : [500, 1000, 2000];
    const merged = [...fromHistory];
    for (const amount of fallback) {
      if (merged.length >= n) break;
      if (!merged.includes(amount)) merged.push(amount);
    }

    return merged.slice(0, n).sort((a, b) => a - b);
  },

  /**
   * Genera un array de insights financieros basados en el estado actual.
   *
   * Insights generados:
   * 1. Ahorro vs mes anterior: Si el gasto bajó, muestra el porcentaje ahorrado.
   * 2. Categoría con mayor subida: Si alguna categoría subió >20%, avisa.
   * 3. Cuotas del mes: Cantidad y total de cuotas que vencen este mes.
   * 4. Alerta de presupuesto: Categoría más cerca del límite con días restantes.
   * 5. Tarjetas que necesitan actualización de fechas de cierre/vencimiento.
   * 6. Progreso de objetivo de ahorro: objetivo activo con mayor avance, >= 50%.
   * 7. Racha de registro: días seguidos anotando movimientos, >= 3 días.
   * 8. Rendimiento del portafolio: ganancia o caída con |PL%| >= 3%.
   *
   * Tope: devuelve como máximo 6 insights (los primeros que dispararon).
   *
   * Cada insight tiene:
   * - type: 'positive' | 'warning' | 'info'
   * - message: Texto del insight listo para mostrar
   * - icon: Nombre del ícono de lucide-react
   */
  getInsights: () => {
    const {
      getMonthlyComparison,
      getCategoryComparison,
      getCurrentMonthInstallments,
      getCurrentMonthInstallmentsTotal,
      getAllBudgetStatuses,
      paymentMethods,
      getSavingsGoalsOverview,
      getRegistrationStreak,
      getPortfolioStatus,
    } = get();

    const insights: Array<{ type: 'positive' | 'warning' | 'info'; message: string; icon: string }> = [];

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - now.getDate();

    // 1. Comparación de gasto vs mes anterior
    const { currentMonthExpenses, previousMonthExpenses, percentageChange } = getMonthlyComparison();
    if (previousMonthExpenses > 0) {
      if (percentageChange < 0) {
        const saved = Math.abs(percentageChange).toFixed(0);
        insights.push({
          type: 'positive',
          message: `Gastaste un ${saved}% menos que el mes pasado. ¡Bien ahí! 🎉`,
          icon: 'TrendingDown',
        });
      } else if (percentageChange > 15) {
        const increase = percentageChange.toFixed(0);
        insights.push({
          type: 'warning',
          message: `Ojo que tu gasto subió un ${increase}% contra el mes pasado 👀`,
          icon: 'TrendingUp',
        });
      }
    }

    // 2. Categoría con mayor suba (>20%)
    const categoryComparison = getCategoryComparison();
    const biggestRise = categoryComparison.find(
      (c) => c.previous > 0 && ((c.current - c.previous) / c.previous) * 100 > 20
    );
    if (biggestRise) {
      const pct = (((biggestRise.current - biggestRise.previous) / biggestRise.previous) * 100).toFixed(0);
      const emoji = biggestRise.emoji ? `${biggestRise.emoji} ` : '';
      insights.push({
        type: 'warning',
        message: `Ojo con ${emoji}${biggestRise.category}: subió un ${pct}% este mes 👀`,
        icon: 'AlertTriangle',
      });
    }

    // 3. Cuotas que vencen este mes
    const installments = getCurrentMonthInstallments();
    const installmentsTotal = getCurrentMonthInstallmentsTotal();
    if (installments.length > 0) {
      const totalFormatted = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(installmentsTotal);
      insights.push({
        type: 'info',
        message: `Este mes se vienen ${installments.length} cuota${installments.length > 1 ? 's' : ''} por ${totalFormatted} 💳`,
        icon: 'CreditCard',
      });
    }

    // 4. Presupuesto más cercano al límite
    const budgetStatuses = getAllBudgetStatuses();
    const criticalBudget = budgetStatuses.find((b) => b.percent >= 75);
    if (criticalBudget) {
      const emoji = criticalBudget.categoryEmoji ? `${criticalBudget.categoryEmoji} ` : '';
      const pct = criticalBudget.percent.toFixed(0);
      insights.push({
        type: criticalBudget.percent >= 100 ? 'warning' : 'info',
        message: `Ya vas al ${pct}% del presupuesto de ${emoji}${criticalBudget.categoryName}, con ${daysRemaining} días por delante`,
        icon: criticalBudget.percent >= 100 ? 'AlertCircle' : 'Target',
      });
    }

    // 5. Tarjetas que necesitan actualización de fechas (día después del vencimiento)
    const todayDay = now.getDate();
    const creditCardsNeedingUpdate = paymentMethods.filter((m) => {
      if (m.type !== 'credit' || !m.default_payment_day) return false;
      const paymentDay = m.default_payment_day;
      if (todayDay === paymentDay + 1) return true;
      if (todayDay === 1) {
        const lastDayOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        return paymentDay >= lastDayOfPrevMonth;
      }
      return false;
    });
    for (const card of creditCardsNeedingUpdate) {
      insights.push({
        type: 'warning',
        message: `Che, actualizá el cierre y vencimiento de ${card.name} para el nuevo ciclo 📅`,
        icon: 'CreditCard',
      });
    }

    // 6. Progreso de objetivo de ahorro (activo con mayor avance, >= 50%)
    const { goals } = getSavingsGoalsOverview();
    const topGoal = goals
      .filter((g) => g.status === 'active')
      .sort((a, b) => b.percent - a.percent)[0];
    if (topGoal && topGoal.percent >= 50) {
      insights.push({
        type: 'info',
        message: `Ya llevás ${Math.round(topGoal.percent)}% de ${topGoal.name}. ¡Se viene! 🎯`,
        icon: 'Target',
      });
    }

    // 7. Racha de registro
    const { days } = getRegistrationStreak();
    if (days >= 3) {
      insights.push({
        type: 'positive',
        message: `Venís ${days} días seguidos anotando todo. ¡Así se hace! 🔥`,
        icon: 'Flame',
      });
    }

    // 8. Rendimiento del portafolio
    const { totalInvested, totalPLPercent } = getPortfolioStatus();
    if (totalInvested > 0 && Math.abs(totalPLPercent) >= 3) {
      const pct = Math.abs(totalPLPercent).toFixed(0);
      if (totalPLPercent > 0) {
        insights.push({
          type: 'positive',
          message: `Tu portafolio viene +${pct}% arriba. ¡Joya! 📈`,
          icon: 'TrendingUp',
        });
      } else {
        insights.push({
          type: 'warning',
          message: `Tu portafolio cayó ${pct}%. Tranqui, es parte del juego 📉`,
          icon: 'TrendingDown',
        });
      }
    }

    return insights.slice(0, 6);
  },

  getRegistrationStreak: () => {
    const { transactions } = get();
    const now = new Date();
    const today = startOfDay(now);

    const datesWithTransactions = new Set(
      transactions.map((t) => startOfDay(parseLocalDate(t.date)).getTime())
    );

    const isActiveToday = datesWithTransactions.has(today.getTime());

    let days = 0;
    let current = isActiveToday ? today : new Date(today.getTime() - 86400000);

    while (datesWithTransactions.has(current.getTime())) {
      days++;
      current = new Date(current.getTime() - 86400000);
    }

    return { days, isActiveToday };
  },

  getDaysSinceLastRegistration: () => {
    const { transactions, internalTransfers } = get();
    return daysSinceLastRegistration(transactions, new Date(), internalTransfers);
  },
}));
