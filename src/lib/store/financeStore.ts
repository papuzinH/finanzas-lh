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

// Extended transaction type with processing fields
type ProcessedTransaction = Transaction & {
  periodDate: string;
  realPaymentDate: string;
};
import {
  addMonths,
  setDate,
  getDate,
  format,
  subMonths,
  subWeeks,
  startOfWeek,
  endOfWeek,
  isAfter,
  startOfDay,
  isSameDay,
  isSameMonth,
  parse,
  endOfMonth,
} from 'date-fns';
import { parseLocalDate } from '@/lib/utils/dates';

interface DolarBlue {
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

/**
 * Resuelve la cotización ARS de un par dado.
 * Prioridad: rate del par en exchange_rates → dólar blue (venta) → fallback (snapshot) → 1.
 */
export function resolveRate(
  pair: string | null,
  exchangeRates: ExchangeRate[],
  dolarBlue: DolarBlue | null,
  fallback?: number | null,
): number {
  if (pair) {
    const r = exchangeRates.find((e) => e.pair === pair);
    if (r && r.rate > 0) return r.rate;
  }
  if (dolarBlue?.venta && dolarBlue.venta > 0) return dolarBlue.venta;
  if (fallback && fallback > 0) return fallback;
  return 1;
}

export function parseInflation(
  raw: Array<{ fecha: string; valor: number }>,
): Array<{ month: string; rate: number }> {
  return raw.map((r) => ({ month: r.fecha.slice(0, 7), rate: r.valor }));
}

export type CreditCardCycleSummary = {
  methodId: number
  name: string
  total: number     // full ARS equivalent (for balance calculations)
  totalARS: number  // ARS-only expenses in the cycle
  totalUSD: number  // USD-only expenses (original amount, for display)
  nextPaymentDate: Date
  isPending: boolean
  isPaidManually: boolean
}

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
  getPortfolioStatus: (displayCurrency?: 'ARS' | 'USD_MEP' | 'USD_CCL' | 'USDT') => {
    assets: Array<{
      id: string;
      ticker: string;
      name: string;
      asset_type: string;
      currency: string | null;
      position: number;
      ppc: number;
      currentPrice: number;
      currentValue: number;
      investedValue: number;
      unrealizedPL: number;
      realizedPL: number;
      totalPL: number;
      plPercent: number;
      lastUpdate: string | null;
      source: string | null;
      metadata: Record<string, unknown> | null;
      profitAmount: number;
      profitPercent: number;
      lastPrice: number;
    }>;
    totalValue: number;
    totalInvested: number;
    totalUnrealizedPL: number;
    totalRealizedPL: number;
    totalPLPercent: number;
    totalSavings: number;
    savingsBreakdown: { ARS: number; USD: number };
    displayCurrency: string;
    lastUpdate: string | null;
    totalBalanceARS: number;
    totalBalanceUSD: number;
    totalProfitARS: number;
    totalProfitUSD: number;
  };
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
  getGlobalBalance: () => number;
  getExchangeRate: (pair: string) => number;
  getMonthlyBurnRate: () => number;
  getInstallmentStatus: (planId: number) => {
    paid: number;
    remaining: number;
    progress: number;
    installmentsPaid: number;
    remainingInstallments: number;
    isFinished: boolean;
    plan: InstallmentPlan | undefined;
  } | null;

  getPaymentMethodStatus: (methodId: number) => {
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
  isCreditCardCyclePaid: (methodId: number) => boolean;

  // Credit card cycle tracking (localStorage-backed)
  paidCycles: Record<number, { year: number; month: number }>;
  markCreditCardCyclePaid: (methodId: number) => void;
  unmarkCreditCardCyclePaid: (methodId: number) => void;
  getPendingCreditCardByCard: () => CreditCardCycleSummary[];

  // Dashboard Helpers
  getCurrentMonthInstallmentsTotal: () => number;
  getCurrentMonthInstallments: () => Transaction[];
  getActiveRecurringPlans: () => RecurringPlan[];
  getGlobalIncome: () => number;
  getGlobalEffectiveExpenses: () => number;
  getExpensesByCategory: (scope: 'global' | 'current_month') => Record<string, number>;
  getMonthlyBalance: (monthStr: string, paymentMethodId: string) => number;
  getPendingFixedExpenses: () => {
    total: number;
    items: Array<{ id: number; name: string; amount: number }>;
  };

  getRecurringBackfillPreview: () => {
    missingMonths: number;
    totalAmount: number;
    excessMonths: number;
    excessAmount: number;
  };
  getRealAvailableBalance: () => {
    saldoBruto: number;
    pendingFixedExpenses: number;
    pendingFixedItems: Array<{ id: number; name: string; amount: number }>;
    pendingCardTotal: number;
    pendingCardItems: CreditCardCycleSummary[];
    disponibleReal: number;
  };
  getNextMonthCardExposure: () => {
    nextCyclePurchases: number;
    futureInstallments: number;
    total: number;
  };
  getCategoryBreakdown: (scope: 'global' | 'current_month') => {
    total: number;
    items: Array<{
      name: string;
      value: number;
      percentage: number;
    }>;
  };
  getPaymentMethodTransactionsForCurrentMonth: (methodId: number) => ProcessedTransaction[];
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
  getEndOfMonthSurplusSuggestion: () => {
    suggestedAmount: number;
    isEndOfMonth: boolean;
    alreadyTransferred: boolean;
    periodMonth: string;
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

  getFrequentCategories: (n?: number) => Category[];

  getInsights: () => Array<{
    type: 'positive' | 'warning' | 'info';
    message: string;
    icon: string;
  }>;

  getRegistrationStreak: () => {
    days: number;
    isActiveToday: boolean;
  };
}

/**
 * Determina si un gasto (transaction) pertenece al "mes actual" según su tipo y método de pago.
 *
 * Lógica:
 * 1. Si es cuota de plan (installment_plan_id) en tarjeta de crédito:
 *    -> Pertenece al mes si su fecha cae en el mes de VENCIMIENTO (payment_day)
 *       de la tarjeta. Se calcula según closing_day/payment_day.
 *
 * 2. Para todo lo demás:
 *    -> Mes calendario simple (basado en today's month)
 *
 * Ejemplo:
 * - Tarjeta cierra día 24, vence día 6
 * - Cuota registrada el 10 de marzo (durante el ciclo de cierre 24-23)
 * - Pertenece al mes de vencimiento = ABRIL (día 6)
 * - Si hoy es 19 de marzo, esta cuota SÍ se incluye en "mes actual" (si vence en abril)
 * - Si hoy es 19 de abril, esta cuota SÍ se incluye en "mes actual" (mes de vencimiento actual)
 *
 * @param t - Transaction a evaluar
 * @param methods - Array de PaymentMethod para lookup
 * @param now - Fecha de referencia (típicamente today)
 * @returns true si el gasto pertenece al mes actual según su contexto
 */
const isExpenseInCurrentMonthScope = (t: ProcessedTransaction, methods: PaymentMethod[], now: Date) => {
  if (t.type !== 'expense') return false;
  // Los pagos de tarjeta no son consumo: no participan de las analíticas de gasto.
  if (t.card_payment_for) return false;

  // 1. Si es Cuota (Installment) -> Usar lógica de Ciclo de Tarjeta
  // t.date para cuotas siempre es la fecha de pago calculada
  if (t.installment_plan_id) {
    const method = methods.find((m) => m.id === t.payment_method_id);
    if (
      method &&
      method.type === 'credit' &&
      method.default_closing_day &&
      method.default_payment_day
    ) {
      const closingDay = method.default_closing_day;
      const paymentDay = method.default_payment_day;

      // Fecha de cierre de este mes
      const closingDateThisMonth = setDate(now, closingDay);

      // Fecha de pago correspondiente a ese cierre
      let paymentDateForThisCycle = setDate(closingDateThisMonth, paymentDay);
      if (paymentDay <= closingDay) {
        paymentDateForThisCycle = addMonths(paymentDateForThisCycle, 1);
      }

      const localTDate = parseLocalDate(t.date);
      return (
        localTDate.getMonth() === paymentDateForThisCycle.getMonth() &&
        localTDate.getFullYear() === paymentDateForThisCycle.getFullYear()
      );
    }
  }

  // 2. Para todo lo demás: usar periodDate (ya tiene la lógica de ciclo de tarjeta aplicada).
  // periodDate refleja el mes visual correcto tanto para gastos directos de crédito
  // (donde t.date = fecha de pago) como para débito/efectivo (donde t.date = fecha de compra).
  const localPeriodDate = parseLocalDate(t.periodDate);
  return (
    localPeriodDate.getMonth() === now.getMonth() &&
    localPeriodDate.getFullYear() === now.getFullYear()
  );
};

/** Mismo mes y año entre dos fechas. */
const sameMonthYear = (a: Date, b: Date) =>
  a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

/**
 * Fechas de cierre y vencimiento del ciclo VIGENTE de una tarjeta de crédito.
 * El ciclo termina cuando se PAGA (no cuando cierra): mientras no llegue el vencimiento,
 * seguimos en ese ciclo. Devuelve undefined si el método no es crédito con ciclo configurado.
 *
 * Como `transactions.date` de crédito ya es la fecha de vencimiento calculada
 * (ver calculateCreditPaymentDate), un movimiento pertenece a este ciclo sii su
 * `t.date` cae en el mismo mes/año que `nextPaymentDate`.
 */
const getCreditCycleDates = (
  method: PaymentMethod,
  now: Date
): { nextClosingDate: Date; nextPaymentDate: Date } | undefined => {
  if (
    method.type !== 'credit' ||
    !method.default_closing_day ||
    !method.default_payment_day
  ) {
    return undefined;
  }
  const closingDay = method.default_closing_day;
  const paymentDay = method.default_payment_day;

  let nextPaymentDate = setDate(now, paymentDay);
  if (!isAfter(startOfDay(nextPaymentDate), startOfDay(now))) {
    nextPaymentDate = addMonths(nextPaymentDate, 1);
  }

  // paymentDay > closingDay: cierran en el mismo mes (ej: cierra 10, vence 25).
  // paymentDay <= closingDay: el pago es el mes siguiente al cierre (ej: cierra 19, vence 1).
  const nextClosingDate =
    paymentDay > closingDay
      ? setDate(nextPaymentDate, closingDay)
      : setDate(subMonths(nextPaymentDate, 1), closingDay);

  return { nextClosingDate, nextPaymentDate };
};

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
  paidCycles: (() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(localStorage.getItem('chanchito_paid_cycles') ?? '{}') as Record<number, { year: number; month: number }>
    } catch {
      return {}
    }
  })(),

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
      const processedTransactions = rawTransactions.map((t) => {
        const method = methods.find((m) => m.id === t.payment_method_id);
        let periodDate = t.date; // Default: Misma fecha

        if (method && method.type === 'credit') {
          const localTDate = parseLocalDate(t.date);
          const dayOfMonth = getDate(localTDate);

          // t.date = fecha de pago calculada al crear la transacción.
          // Si paymentDay < closingDay: el pago vence el mes SIGUIENTE al cierre,
          // por lo que el período visual corresponde al mes anterior al pago.
          // Si paymentDay >= closingDay: el pago vence el mismo mes del cierre,
          // el período visual ES el mes del pago (sin ajuste).
          if (
            method.default_payment_day &&
            method.default_closing_day &&
            method.default_payment_day < method.default_closing_day &&
            dayOfMonth <= method.default_payment_day + 2
          ) {
            const visualDate = subMonths(localTDate, 1);
            periodDate = format(visualDate, 'yyyy-MM-dd');
          }
        }

        const amountArs =
          t.original_currency === 'USD' && t.original_amount != null
            ? t.original_amount * resolveRate(t.rate_pair, (exchangeRatesData as ExchangeRate[]) || [], dolarBlue, t.exchange_rate)
            : t.amount;

        return {
          ...t,
          amount: amountArs,
          periodDate, // Usar esta para filtros de mes
          realPaymentDate: t.date, // Usar esta para mostrar "Vence el..."
        };
      });

      const recomputedRecurring = ((recurring as RecurringPlan[]) || []).map((plan) => {
        if (plan.currency === 'USD' && plan.original_amount != null) {
          const rate = resolveRate(plan.rate_pair, (exchangeRatesData as ExchangeRate[]) || [], dolarBlue, plan.exchange_rate);
          return { ...plan, amount: plan.original_amount * rate };
        }
        return plan;
      });

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

    // Fallback al dolar blue (dolarapi.com, non-blocking en fetchAllData) cuando
    // la tabla exchange_rates aún no tiene la pair específica.
    const blueFallback = dolarBlue?.venta && dolarBlue.venta > 0 ? dolarBlue.venta : null;

    const getRate = (pair: string): number => {
      const r = exchangeRates.find((e) => e.pair === pair);
      if (r && r.rate > 0) return r.rate;
      if (blueFallback) return blueFallback;
      return 1;
    };

    const mepRate = getRate('USD_ARS_MEP');
    const cclRate = getRate('USD_ARS_CCL');
    const usdtRate = getRate('USDT_ARS');

    const convertArsToDisplay = (arsValue: number): number => {
      if (displayCurrency === 'ARS') return arsValue;
      if (displayCurrency === 'USD_MEP') return arsValue / mepRate;
      if (displayCurrency === 'USD_CCL') return arsValue / cclRate;
      if (displayCurrency === 'USDT') return arsValue / usdtRate;
      return arsValue / mepRate;
    };

    const convertToARS = (amount: number, fromCurrency: string): number => {
      if (fromCurrency === 'ARS') return amount;
      return amount * mepRate;
    };

    let globalValueARS = 0;
    let globalInvestedARS = 0;
    let globalRealizedPLARS = 0;
    let lastUpdate: string | null = null;

    const assets = investmentAssets.map((asset) => {
      const txs = investmentTransactions.filter((t) => t.asset_id === asset.id);
      const buys = txs.filter((t) => t.type === 'buy');
      const sells = txs.filter((t) => t.type === 'sell');

      const totalBuyQty = buys.reduce((s, t) => s + Number(t.quantity), 0);
      const totalSellQty = sells.reduce((s, t) => s + Number(t.quantity), 0);
      const position = Math.max(totalBuyQty - totalSellQty, 0);

      const totalBuyCostARS = buys.reduce((s, t) => {
        const costRaw = Number(t.quantity) * Number(t.price_per_unit) + Number(t.fees ?? 0);
        return s + convertToARS(costRaw, t.currency);
      }, 0);

      const ppcARS = totalBuyQty > 0 ? totalBuyCostARS / totalBuyQty : 0;

      const mp = marketPrices.find((m) => m.ticker === asset.ticker);
      if (mp?.last_update && (!lastUpdate || new Date(mp.last_update) > new Date(lastUpdate))) {
        lastUpdate = mp.last_update;
      }

      let currentPriceARS = mp?.last_price ?? ppcARS;

      if (asset.asset_type === 'plazo_fijo' || asset.asset_type === 'money_market') {
        const meta = asset.metadata as Record<string, unknown>;
        const tna = typeof meta?.tna === 'number' ? meta.tna : 0;
        const startStr = typeof meta?.start_date === 'string' ? meta.start_date : null;
        const endStr = typeof meta?.end_date === 'string' ? meta.end_date : null;

        if (tna > 0 && startStr && totalBuyCostARS > 0) {
          const startD = parseLocalDate(startStr);
          const endD = endStr ? parseLocalDate(endStr) : null;
          const today = new Date();
          const elapsedDays = Math.min(
            (today.getTime() - startD.getTime()) / 86400000,
            endD ? (endD.getTime() - startD.getTime()) / 86400000 : 365,
          );
          const dailyAccruedMultiplier = 1 + (tna * (Math.max(elapsedDays, 0) / 365));
          currentPriceARS = position > 0 ? (totalBuyCostARS * dailyAccruedMultiplier) / position : ppcARS;
        }
      } else if (asset.currency === 'USD' && mp?.price_usd) {
        currentPriceARS =
          Number(mp.price_usd) *
          (asset.asset_type === 'cedear' ? Number(mp.ccl_implicit || cclRate) : mepRate);
      }

      const currentValueARS = position * currentPriceARS;
      const investedValueARS = position * ppcARS;
      const unrealizedPLARS = currentValueARS - investedValueARS;

      const realizedPLARS = sells.reduce((s, t) => {
        const sellRevenueARS = convertToARS(
          Number(t.quantity) * Number(t.price_per_unit) - Number(t.fees ?? 0),
          t.currency,
        );
        const originalCostARS = Number(t.quantity) * ppcARS;
        return s + (sellRevenueARS - originalCostARS);
      }, 0);

      globalValueARS += currentValueARS;
      globalInvestedARS += investedValueARS;
      globalRealizedPLARS += realizedPLARS;

      const plPercent = investedValueARS > 0 ? (unrealizedPLARS / investedValueARS) * 100 : 0;

      return {
        id: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        asset_type: asset.asset_type,
        currency: asset.currency,
        position,
        ppc: convertArsToDisplay(ppcARS),
        currentPrice: convertArsToDisplay(currentPriceARS),
        currentValue: convertArsToDisplay(currentValueARS),
        investedValue: convertArsToDisplay(investedValueARS),
        unrealizedPL: convertArsToDisplay(unrealizedPLARS),
        realizedPL: convertArsToDisplay(realizedPLARS),
        totalPL: convertArsToDisplay(unrealizedPLARS + realizedPLARS),
        plPercent,
        lastUpdate: mp?.last_update ?? null,
        source: mp?.source ?? null,
        metadata: (asset.metadata as Record<string, unknown> | null) ?? null,
        profitAmount: convertArsToDisplay(unrealizedPLARS),
        profitPercent: plPercent,
        lastPrice: convertArsToDisplay(currentPriceARS),
      };
    });

    const totalUnrealizedPLDisplay = convertArsToDisplay(globalValueARS - globalInvestedARS);
    const totalRealizedPLDisplay = convertArsToDisplay(globalRealizedPLARS);
    const totalInvestedDisplay = convertArsToDisplay(globalInvestedARS);

    // Savings (tenencia de dólares/pesos sueltos)
    const arsSavingsRaw = savings
      .filter((s) => s.currency === 'ARS')
      .reduce((acc, s) => acc + Number(s.amount), 0);
    const usdSavingsRaw = savings
      .filter((s) => s.currency === 'USD')
      .reduce((acc, s) => acc + Number(s.amount), 0);
    const savingsInARS = arsSavingsRaw + usdSavingsRaw * mepRate;

    return {
      assets,
      totalValue: convertArsToDisplay(globalValueARS + savingsInARS),
      totalInvested: totalInvestedDisplay,
      totalUnrealizedPL: totalUnrealizedPLDisplay,
      totalRealizedPL: totalRealizedPLDisplay,
      totalPLPercent:
        totalInvestedDisplay > 0
          ? ((totalUnrealizedPLDisplay + totalRealizedPLDisplay) / totalInvestedDisplay) * 100
          : 0,
      totalSavings: convertArsToDisplay(savingsInARS),
      savingsBreakdown: { ARS: arsSavingsRaw, USD: usdSavingsRaw },
      displayCurrency,
      lastUpdate,
      totalBalanceARS: displayCurrency === 'ARS' ? (globalValueARS + savingsInARS) : 0,
      totalBalanceUSD: displayCurrency !== 'ARS' ? convertArsToDisplay(globalValueARS + savingsInARS) : 0,
      totalProfitARS: displayCurrency === 'ARS' ? (globalValueARS - globalInvestedARS) : 0,
      totalProfitUSD: displayCurrency !== 'ARS' ? totalUnrealizedPLDisplay : 0,
    };
  },

  getPortfolioDistribution: () => {
    const { assets } = get().getPortfolioStatus();

    const COLOR_MAP: Record<string, string> = {
      stock: '#6366f1', cedear: '#6366f1', etf: '#6366f1',
      bond: '#8b5cf6', on: '#8b5cf6', bopreal: '#8b5cf6',
      lecap: '#a78bfa', boncap: '#a78bfa',
      crypto: '#f59e0b', stablecoin: '#f59e0b',
      plazo_fijo: '#10b981', money_market: '#10b981',
      fci: '#06b6d4',
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
        color: COLOR_MAP[assetType] ?? '#64748b',
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
    const { transactions, paymentMethods, getPendingFixedExpenses, internalTransfers } = get();
    const now = new Date();
    const todayStart = startOfDay(now);

    const totalIncome = transactions
      .filter((t) => t.type === 'income')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    // 1. Gastos variables históricos (sin cuotas ni Mensualidades recurrentes).
    //    Se excluyen los pagos de tarjeta (card_payment_for): no son consumo nuevo,
    //    las compras ya se restaron; el pago solo baja el saldo del medio financiador.
    const variableExpenses = transactions
      .filter((t) => t.type === 'expense' && !t.installment_plan_id && !t.recurring_plan_id && !t.card_payment_for)
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    // 2. Cuotas pagadas + cuotas que vencen este mes.
    //    - Mes actual: respeta el ciclo de tarjeta (closing/payment day).
    //    - Pasadas: cualquier cuota cuya fecha visual ya pasó.
    //    - Futuras: NO se incluyen.
    const installmentsExpense = transactions
      .filter((t) => {
        if (t.type !== 'expense' || !t.installment_plan_id) return false;

        // ¿Es cuota del mes actual según ciclo de tarjeta?
        if (isExpenseInCurrentMonthScope(t, paymentMethods, now)) return true;

        // ¿O es cuota de un mes anterior (ya pasó)?
        const visualDateStr = t.periodDate || t.date;
        const visualDate = parseLocalDate(visualDateStr);
        return visualDate < todayStart && !isSameMonth(visualDate, now);
      })
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    // 3. Mensualidades: pagos reales históricos (transacciones vinculadas a un
    //    plan recurrente, de cualquier mes) + el compromiso del mes en curso que
    //    aún no registra pago. Los meses pasados restan lo realmente pagado; el
    //    mes actual resta el compromiso completo (pagado o pendiente), así
    //    marcar una mensualidad como pagada NO mueve el balance.
    const recurringPaid = transactions
      .filter((t) => t.type === 'expense' && !!t.recurring_plan_id)
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
    const recurringExpense = recurringPaid + getPendingFixedExpenses().total;

    // 4. Ahorros transferidos (tabla separada): dejan de ser saldo gastable.
    const transferredToSavings = internalTransfers.reduce(
      (acc, transfer) => acc + Math.abs(Number(transfer.amount)),
      0
    );

    return totalIncome - variableExpenses - installmentsExpense - recurringExpense - transferredToSavings;
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

  getInstallmentStatus: (planId: number) => {
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

  isCreditCardCyclePaid: (methodId: number) => {
    const { transactions, paymentMethods } = get();
    const method = paymentMethods.find((m) => m.id === methodId);
    if (!method) return false;
    const cycle = getCreditCycleDates(method, new Date());
    if (!cycle) return false;
    return transactions.some(
      (t) =>
        t.card_payment_for === methodId &&
        sameMonthYear(parseLocalDate(t.date), cycle.nextPaymentDate)
    );
  },

  getPaymentMethodStatus: (methodId: number) => {
    const { transactions, recurringPlans, paymentMethods } = get();
    const method = paymentMethods.find((m) => m.id === methodId);
    const now = new Date();

    if (!method)
      return { currentConsumption: 0, fixedCosts: 0, projectedTotal: 0, usdExpenses: 0, arsExpenses: 0 };

    // Fechas de cierre/vencimiento del ciclo vigente (solo crédito con ciclo).
    const cycleDates = getCreditCycleDates(method, now);
    const nextClosingDate = cycleDates?.nextClosingDate;
    const nextPaymentDate = cycleDates?.nextPaymentDate;

    // Mensualidades activas del medio (para el bloque "servicios adheridos").
    const fixedCosts = recurringPlans
      .filter((p) => p.payment_method_id === methodId && p.is_active)
      .reduce((acc, p) => acc + Number(p.amount), 0);

    // ===================================================================
    // CRÉDITO CON CICLO → "A pagar en el vencimiento"
    // = gastos que vencen en nextPaymentDate (cuotas + compras + mensualidades) − reintegros.
    // Regla ÚNICA de pertenencia al ciclo: t.date (que en crédito ya es la fecha de
    // vencimiento calculada) cae en el mismo mes/año que nextPaymentDate. Aplica igual
    // a compras normales, cuotas e ingresos, de modo que el número coincide con la
    // lista de movimientos del medio.
    // ===================================================================
    if (nextPaymentDate) {
      const recurringPlanIdsInCycle = new Set<number>();
      let expensesInCycleArs = 0; // total en ARS (USD convertido) → alimenta projectedTotal
      let usdExpenses = 0; // desglose: importe original USD
      let arsExpenses = 0; // desglose: importe ARS puro

      for (const t of transactions) {
        if (t.payment_method_id !== methodId || t.type !== 'expense') continue;
        if (!sameMonthYear(parseLocalDate(t.date), nextPaymentDate)) continue;
        if (t.recurring_plan_id) recurringPlanIdsInCycle.add(t.recurring_plan_id);
        expensesInCycleArs += Math.abs(Number(t.amount));
        if (t.original_currency === 'USD' && t.original_amount) {
          usdExpenses += Math.abs(Number(t.original_amount));
        } else {
          arsExpenses += Math.abs(Number(t.amount));
        }
      }

      // Mensualidades adheridas al medio que todavía no tienen transacción en el ciclo.
      // (recomputedRecurring ya deja p.amount en ARS, incluso para planes en USD.)
      for (const p of recurringPlans) {
        if (p.payment_method_id !== methodId || !p.is_active) continue;
        if (recurringPlanIdsInCycle.has(p.id)) continue;
        expensesInCycleArs += Math.abs(Number(p.amount));
        if (p.currency === 'USD' && p.original_amount) {
          usdExpenses += Math.abs(Number(p.original_amount));
        } else {
          arsExpenses += Math.abs(Number(p.amount));
        }
      }

      // Reintegros/ingresos que vencen en el mismo ciclo.
      const refundsInCycle = transactions
        .filter(
          (t) =>
            t.payment_method_id === methodId &&
            t.type === 'income' &&
            sameMonthYear(parseLocalDate(t.date), nextPaymentDate)
        )
        .reduce((acc, t) => acc + Number(t.amount), 0);

      const amountToPay = expensesInCycleArs - refundsInCycle;
      // Contrato existente: projectedTotal negativo = se debe dinero a la tarjeta.
      const netResult = -amountToPay;

      return {
        currentConsumption: netResult,
        fixedCosts,
        projectedTotal: netResult,
        nextClosingDate,
        nextPaymentDate,
        usdExpenses,
        arsExpenses,
      };
    }

    // ===================================================================
    // DÉBITO / EFECTIVO (o crédito sin ciclo configurado) → "Saldo disponible"
    // = ingresos históricos − gastos históricos (cuotas hasta fin de mes).
    // No se restan mensualidades futuras: las ya debitadas ya están en los gastos.
    // ===================================================================
    const income = transactions
      .filter((t) => t.payment_method_id === methodId && t.type === 'income')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const expensesNonInstallment = transactions
      .filter(
        (t) =>
          t.payment_method_id === methodId &&
          t.type === 'expense' &&
          !t.installment_plan_id
      )
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    const installments = transactions
      .filter((t) => {
        if (t.payment_method_id !== methodId || t.type !== 'expense' || !t.installment_plan_id)
          return false;
        return parseLocalDate(t.date) <= endOfMonth(now);
      })
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    const netResult = income - expensesNonInstallment - installments;

    return {
      currentConsumption: netResult,
      fixedCosts,
      projectedTotal: netResult,
      usdExpenses: 0,
      arsExpenses: 0,
    };
  },

  getPendingCreditCardByCard: (): CreditCardCycleSummary[] => {
    const { paymentMethods } = get()
    const now = new Date()
    const creditCards = paymentMethods.filter((m) => m.type === 'credit')

    return creditCards.reduce<CreditCardCycleSummary[]>((acc, method) => {
      const status = get().getPaymentMethodStatus(method.id)
      const { projectedTotal, nextPaymentDate, usdExpenses, arsExpenses } = status

      // projectedTotal = income - expenses (negative when user owes money to the card)
      if (!nextPaymentDate || projectedTotal >= 0) return acc

      // El estado "pagada" se deriva de la existencia de una transacción de pago
      // (card_payment_for) cuya fecha cae en el mes del vencimiento del ciclo.
      const isPaidManually = get().isCreditCardCyclePaid(method.id)

      const isPending = !isPaidManually && now < nextPaymentDate

      acc.push({
        methodId: method.id,
        name: method.name,
        total: Math.abs(projectedTotal),
        totalARS: arsExpenses,
        totalUSD: usdExpenses,
        nextPaymentDate,
        isPending,
        isPaidManually,
      })
      return acc
    }, [])
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
      .filter((t) => t.type === 'expense' && !t.installment_plan_id && !t.card_payment_for)
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    return totalNonInstallmentExpenses + getCurrentMonthInstallmentsTotal() + getMonthlyBurnRate();
  },

  getExpensesByCategory: (scope) => {
    const { transactions, paymentMethods, categories } = get();
    const now = new Date();

    return transactions
      .filter((t) => {
        if (t.type !== 'expense' || t.card_payment_for) return false;

        if (scope === 'current_month') {
            return isExpenseInCurrentMonthScope(t, paymentMethods, now);
        }

        return true; // Global includes all history
      })
      .reduce((acc, t) => {
        const categoryObj = categories.find(c => c.id === t.category_id);
        const cat = categoryObj ? categoryObj.name : 'Otros';
        acc[cat] = (acc[cat] || 0) + Math.abs(Number(t.amount));
        return acc;
      }, {} as Record<string, number>);
  },

  getMonthlyBalance: (monthStr, paymentMethodId) => {
    const { transactions, recurringPlans } = get();
    const currentMonthDate = parse(monthStr, 'yyyy-MM', new Date());
    const isCurrentMonth = isSameMonth(currentMonthDate, new Date());

    const filtered = transactions.filter(t => {
      const visualDateStr = t.periodDate || t.date;
      // Parsear como fecha LOCAL
      const localVisualDate = parseLocalDate(visualDateStr);
      const isMonthMatch = isSameMonth(localVisualDate, currentMonthDate);
      let isMethodMatch = true;
      if (paymentMethodId !== 'all') {
        isMethodMatch = t.payment_method_id?.toString() === paymentMethodId;
      }
      return isMonthMatch && isMethodMatch;
    });

    const transactionsBalance = filtered.reduce((acc, t) => {
      if (t.type === 'income') return acc + Number(t.amount);
      // Gastos y mensualidades (recurring_plan_id) se restan
      return acc - Number(t.amount);
    }, 0);

    // Si es el mes actual, restamos los planes recurrentes que NO tengan una transacción asociada aún
    let pendingRecurringAmount = 0;
    if (isCurrentMonth) {
      const activePlans = recurringPlans.filter(p => 
        p.is_active && (paymentMethodId === 'all' || p.payment_method_id?.toString() === paymentMethodId)
      );
      
      activePlans.forEach(plan => {
        const hasTransaction = filtered.some(t => t.recurring_plan_id === plan.id);
        if (!hasTransaction) {
          pendingRecurringAmount += Number(plan.amount);
        }
      });
    }

    return transactionsBalance - pendingRecurringAmount;
  },

  getPendingFixedExpenses: () => {
    const { recurringPlans, transactions } = get();
    const currentMonth = format(new Date(), 'yyyy-MM');

    const items = recurringPlans
      .filter((p) => p.is_active)
      .filter((plan) => {
        const hasTransactionThisMonth = transactions.some(
          (t) =>
            t.recurring_plan_id === plan.id &&
            (t.periodDate || t.date)?.slice(0, 7) === currentMonth,
        );
        return !hasTransactionThisMonth;
      })
      .map((plan) => ({
        id: plan.id,
        name: plan.description,
        amount: Math.abs(Number(plan.amount)),
      }));

    const total = items.reduce((acc, i) => acc + i.amount, 0);
    return { total, items };
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

    // Piso del historial: mes de la primera transacción REAL del usuario
    // (excluye las vinculadas a mensualidades, que genera esta misma feature).
    // Antes de ese mes la app no tiene ingresos registrados, así que backfillear
    // ahí distorsiona el saldo.
    let floorMonth = currentMonth;
    for (const t of transactions) {
      if (t.recurring_plan_id) continue;
      const m = String(t.date).slice(0, 7);
      if (m < floorMonth) floorMonth = m;
    }

    // Meses ya cubiertos por plan (por fecha real de la transacción) y
    // exceso: pagos generados en meses anteriores al piso.
    const covered = new Map<number, Set<string>>();
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

  getRealAvailableBalance: () => {
    const { getGlobalBalance, getPendingCreditCardByCard, getPendingFixedExpenses } = get();

    // El TOTAL se ancla a getGlobalBalance(): el patrimonio líquido real,
    // calculado con UNA sola fórmula consistente (ingresos - gastos históricos
    // - cuotas del mes/pasadas - mensualidades del mes - ahorro). Es lo que te
    // queda tras honrar los compromisos ya cargados de este mes.
    //
    // El desglose (saldoBruto - pendingFixed - pendingCard) se deriva de ese
    // total para que SIEMPRE cuadre y ninguna plata se pierda ni se duplique:
    //   saldoBruto := disponibleReal + pendingFixed + pendingCard
    // Así "Cuenta total" = plata en cuentas antes de apartar los compromisos, y
    // pagar la tarjeta / un gasto fijo mueve el bucket sin cambiar el total
    // (getGlobalBalance es invariante a marcar como pagado).
    const disponibleReal = getGlobalBalance();

    const pendingCardItems = getPendingCreditCardByCard().filter((c) => c.isPending);
    const pendingCardTotal = pendingCardItems.reduce((acc, c) => acc + c.total, 0);

    const { total: pendingFixedExpenses, items: pendingFixedItems } = getPendingFixedExpenses();

    const saldoBruto = disponibleReal + pendingFixedExpenses + pendingCardTotal;

    return {
      saldoBruto,
      pendingFixedExpenses,
      pendingFixedItems,
      pendingCardTotal,
      pendingCardItems,
      disponibleReal,
    };
  },

  getNextMonthCardExposure: () => {
    const { transactions, paymentMethods } = get();
    const now = new Date();
    const nextMonthKey = format(new Date(now.getFullYear(), now.getMonth() + 1, 1), 'yyyy-MM');

    const creditIds = new Set(
      paymentMethods.filter((m) => m.type === 'credit').map((m) => m.id),
    );

    const monthKey = (t: ProcessedTransaction) =>
      format(parseLocalDate(t.periodDate || t.date), 'yyyy-MM');

    // Todos los gastos hechos con tarjeta de CRÉDITO cuyo período visual cae en
    // el mes calendario siguiente: cuotas + compras normales. No toca el número
    // de hoy; anticipa lo que va a impactar el mes que viene.
    const nextMonthCardTx = transactions.filter(
      (t) =>
        t.type === 'expense' &&
        creditIds.has(t.payment_method_id ?? -1) &&
        monthKey(t) === nextMonthKey,
    );

    const futureInstallments = nextMonthCardTx
      .filter((t) => !!t.installment_plan_id)
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    const nextCyclePurchases = nextMonthCardTx
      .filter((t) => !t.installment_plan_id)
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    return {
      nextCyclePurchases,
      futureInstallments,
      total: nextCyclePurchases + futureInstallments,
    };
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
  getCategoryBreakdown: (scope) => {
    const expenses = get().getExpensesByCategory(scope);
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
        if (t.type !== 'income') return false;
        const localTDate = parseLocalDate(t.date);
        return isSameMonth(localTDate, now);
      })
      .reduce((acc, t) => acc + Number(t.amount), 0);
  },

  getMonthlyIncomeTransactions: () => {
    const { transactions } = get();
    const now = new Date();
    return transactions.filter((t) => {
      if (t.type !== 'income') return false;
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
          !pendingCardIds.has(t.payment_method_id ?? -1),
      )
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    // Cuotas del mes EXCLUYENDO las de tarjetas pendientes
    const liquidInstallments = transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          !!t.installment_plan_id &&
          isExpenseInCurrentMonthScope(t, paymentMethods, now) &&
          !pendingCardIds.has(t.payment_method_id ?? -1),
      )
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    // Mensualidades activas EXCLUYENDO las de tarjetas pendientes
    const liquidSubscriptions = recurringPlans
      .filter((p) => p.is_active && !pendingCardIds.has(p.payment_method_id ?? -1))
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

  getEndOfMonthSurplusSuggestion: () => {
    const { getMonthlyExpensesBreakdown, internalTransfers } = get();
    const now = new Date();
    const lastDay = endOfMonth(now).getDate();
    const isEndOfMonth = now.getDate() >= Math.max(lastDay - 4, 1);
    const periodMonth = format(now, 'yyyy-MM');
    const suggestedAmount = Math.max(getMonthlyExpensesBreakdown().netBalance, 0);

    const alreadyTransferred = internalTransfers.some((transfer) => {
      const transferMonth = transfer.period_date?.slice(0, 7);
      return transfer.transfer_type === 'end_of_month_surplus' && transferMonth === periodMonth;
    });

    return {
      suggestedAmount,
      isEndOfMonth,
      alreadyTransferred,
      periodMonth,
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

  markCreditCardCyclePaid: (methodId: number) => {
    const { getPaymentMethodStatus, paidCycles } = get()
    const status = getPaymentMethodStatus(methodId)
    if (!status.nextPaymentDate) return
    const entry = {
      year: status.nextPaymentDate.getFullYear(),
      month: status.nextPaymentDate.getMonth(), // 0-indexed (Date.prototype.getMonth)
    }
    const updated = { ...paidCycles, [methodId]: entry }
    set({ paidCycles: updated })
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('chanchito_paid_cycles', JSON.stringify(updated))
      } catch {
        // Storage quota exceeded or private browsing — in-memory state already updated
      }
    }
  },

  unmarkCreditCardCyclePaid: (methodId: number) => {
    const { paidCycles } = get()
    const updated = { ...paidCycles }
    delete updated[methodId]
    set({ paidCycles: updated })
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('chanchito_paid_cycles', JSON.stringify(updated))
      } catch {
        // Storage quota exceeded or private browsing — in-memory state already updated
      }
    }
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

    return { goals, totalSavedARS, activeCount: goals.length };
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
        monthTxs.filter((t) => t.recurring_plan_id).map((t) => t.recurring_plan_id as number),
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

  getFrequentCategories: (n = 4) => {
    const { transactions, categories } = get();

    const countMap: Record<string, number> = {};
    for (const t of transactions) {
      if (!t.category_id) continue;
      countMap[t.category_id] = (countMap[t.category_id] ?? 0) + 1;
    }

    const sorted = Object.entries(countMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id]) => categories.find((c) => c.id === id))
      .filter((c): c is Category => c != null);

    // Fallback for new users with no transaction history
    if (sorted.length < n) {
      const usedIds = new Set(sorted.map((c) => c.id));
      for (const c of categories) {
        if (sorted.length >= n) break;
        if (!usedIds.has(c.id)) sorted.push(c);
      }
    }

    return sorted;
  },

  /**
   * Genera un array de insights financieros basados en el estado actual.
   *
   * Insights generados:
   * 1. Ahorro vs mes anterior: Si el gasto bajó, muestra el porcentaje ahorrado.
   * 2. Categoría con mayor subida: Si alguna categoría subió >20%, avisa.
   * 3. Cuotas del mes: Cantidad y total de cuotas que vencen este mes.
   * 4. Alerta de presupuesto: Categoría más cerca del límite con días restantes.
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
          message: `Gastaste un ${saved}% menos que el mes pasado 🎉`,
          icon: 'TrendingDown',
        });
      } else if (percentageChange > 15) {
        const increase = percentageChange.toFixed(0);
        insights.push({
          type: 'warning',
          message: `Tu gasto subió un ${increase}% respecto al mes pasado`,
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
        message: `Tu gasto en ${emoji}${biggestRise.category} subió un ${pct}% este mes`,
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
        message: `Tenés ${installments.length} cuota${installments.length > 1 ? 's' : ''} este mes por ${totalFormatted}`,
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
        message: `Vas al ${pct}% del presupuesto de ${emoji}${criticalBudget.categoryName} con ${daysRemaining} días restantes`,
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
        message: `Actualizá el cierre y vencimiento de ${card.name} para el nuevo ciclo 📅`,
        icon: 'CreditCard',
      });
    }

    return insights;
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
}));
