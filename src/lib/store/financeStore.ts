import { create } from 'zustand';
import { createClient } from '@/utils/supabase/client';
import {
  Transaction,
  InstallmentPlan,
  RecurringPlan,
  PaymentMethod,
  Investment,
  MarketPrice,
  User,
  Category,
  Saving,
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
  parseISO,
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

interface FinanceState {
  // State Raw
  transactions: ProcessedTransaction[];
  installmentPlans: InstallmentPlan[];
  paymentMethods: PaymentMethod[];
  recurringPlans: RecurringPlan[];
  investments: Investment[];
  marketPrices: MarketPrice[];
  categories: Category[];
  savings: Saving[];
  savingsGoals: SavingsGoal[];
  savingsGoalContributions: SavingsGoalContribution[];
  categoryBudgets: CategoryBudget[];
  dolarBlue: DolarBlue | null;
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

  // Computed Getters (Logic)
  getPortfolioStatus: () => {
    assets: Array<Investment & {
      currentValue: number;
      investedValue: number;
      profitAmount: number;
      profitPercent: number;
      lastPrice: number;
      lastUpdate: string | null;
    }>;
    totalBalanceARS: number;
    totalBalanceUSD: number;
    totalProfitARS: number;
    totalProfitUSD: number;
    lastUpdate: string | null;
  };
  getGlobalBalance: () => number;
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
  };
  
  // Dashboard Helpers
  getCurrentMonthInstallmentsTotal: () => number;
  getCurrentMonthInstallments: () => Transaction[];
  getActiveRecurringPlans: () => RecurringPlan[];
  getGlobalIncome: () => number;
  getGlobalEffectiveExpenses: () => number;
  getExpensesByCategory: (scope: 'global' | 'current_month') => Record<string, number>;
  getMonthlyBalance: (monthStr: string, paymentMethodId: string) => number;
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
  getMonthlyVariableExpenses: () => number;
  getMonthlyExpensesBreakdown: () => {
    variableExpenses: number;
    installmentsTotal: number;
    subscriptionsCost: number;
    totalExpenses: number;
    income: number;
    netBalance: number;
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

  getMonthlyComparison: () => {
    currentMonthExpenses: number;
    previousMonthExpenses: number;
    percentageChange: number;
  };

  getWeeklySnapshot: (type: 'income' | 'variable' | 'installments' | 'fixed') => number[];

  getMonthlyTrend: (months?: number) => Array<{
    month: string;
    income: number;
    expenses: number;
    net: number;
  }>;

  getCategoryComparison: () => Array<{
    category: string;
    emoji: string;
    current: number;
    previous: number;
    change: number;
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
const isExpenseInCurrentMonthScope = (t: Transaction, methods: PaymentMethod[], now: Date) => {
  if (t.type !== 'expense') return false;

  // Parsear la fecha correctamente como LOCAL (no UTC)
  const localTDate = parseLocalDate(t.date);

  // 1. Si es Cuota (Installment) -> Usar lógica de Ciclo de Tarjeta
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

      return (
        localTDate.getMonth() === paymentDateForThisCycle.getMonth() &&
        localTDate.getFullYear() === paymentDateForThisCycle.getFullYear()
      );
    }
  }

  // 2. Si NO es cuota (o no es tarjeta con ciclo definido) -> Usar Mes Calendario
  return (
    localTDate.getMonth() === now.getMonth() &&
    localTDate.getFullYear() === now.getFullYear()
  );
};

export const useFinanceStore = create<FinanceState>((set, get) => ({
  transactions: [],
  installmentPlans: [],
  paymentMethods: [],
  recurringPlans: [],
  investments: [],
  categories: [],
  marketPrices: [],
  savings: [],
  savingsGoals: [],
  savingsGoalContributions: [],
  categoryBudgets: [],
  dolarBlue: null,
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
        { data: savingsGoalsData, error: goalsError },
        { data: contributionsData, error: contribError },
        { data: budgetsData, error: budgetsError },
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

      if (txError) throw txError;
      if (instError) throw instError;
      if (pmError) throw pmError;
      if (recError) throw recError;
      if (catError) throw catError;
      if (savError) throw savError;
      if (userError && userError.code !== 'PGRST116') throw userError; // PGRST116 is "no rows returned"
      // Goals errors are non-blocking (tables may not exist yet in DEV)
      if (goalsError) console.warn('Goals fetch error (may be missing migration):', goalsError.message);
      if (contribError) console.warn('Contributions fetch error:', contribError.message);
      if (budgetsError) console.warn('Budgets fetch error:', budgetsError.message);

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

          // Si la fecha de pago es a principio de mes (ej: día 6) y la tarjeta vence cerca (ej: día 6)
          // Significa que corresponde al consumo del mes ANTERIOR.
          if (
            method.default_payment_day &&
            dayOfMonth <= method.default_payment_day + 2
          ) {
            const visualDate = subMonths(localTDate, 1);
            periodDate = format(visualDate, 'yyyy-MM-dd');
          }
        }

        return {
          ...t,
          periodDate, // Usar esta para filtros de mes
          realPaymentDate: t.date, // Usar esta para mostrar "Vence el..."
        };
      });

      set({
        transactions: processedTransactions,
        installmentPlans: (installments as InstallmentPlan[]) || [],
        paymentMethods: methods,
        recurringPlans: (recurring as RecurringPlan[]) || [],
        investments: (investments as Investment[]) || [],
        marketPrices: (marketPrices as MarketPrice[]) || [],
        categories: (categories as Category[]) || [],
        savings: (savingsData as Saving[]) || [],
        savingsGoals: (savingsGoalsData as SavingsGoal[]) || [],
        savingsGoalContributions: (contributionsData as SavingsGoalContribution[]) || [],
        categoryBudgets: (budgetsData as CategoryBudget[]) || [],
        dolarBlue,
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

  getPortfolioStatus: () => {
    const { investments, marketPrices } = get();
    
    let totalBalanceARS = 0;
    let totalBalanceUSD = 0;
    let totalProfitARS = 0;
    let totalProfitUSD = 0;
    let lastUpdate: string | null = null;

    const assets = investments.map((inv) => {
      const marketData = marketPrices.find((mp) => mp.ticker === inv.ticker);
      const lastPrice = marketData?.last_price ?? inv.avg_buy_price ?? 0; // Fallback to buy price or 0
      const currentUpdate = marketData?.last_update ?? null;

      // Update global last update if this one is more recent
      if (currentUpdate) {
        if (!lastUpdate || new Date(currentUpdate) > new Date(lastUpdate)) {
          lastUpdate = currentUpdate;
        }
      }

      const quantity = Number(inv.quantity);
      const avgBuyPrice = Number(inv.avg_buy_price || 0);
      
      const currentValue = quantity * lastPrice;
      const investedValue = quantity * avgBuyPrice;
      const profitAmount = currentValue - investedValue;
      const profitPercent = investedValue !== 0 ? (profitAmount / investedValue) * 100 : 0;

      // Accumulate totals
      if (inv.currency === 'USD') {
        totalBalanceUSD += currentValue;
        totalProfitUSD += profitAmount;
      } else {
        totalBalanceARS += currentValue;
        totalProfitARS += profitAmount;
      }

      return {
        ...inv,
        currentValue,
        investedValue,
        profitAmount,
        profitPercent,
        lastPrice,
        lastUpdate: currentUpdate,
      };
    });

    return {
      assets,
      totalBalanceARS,
      totalBalanceUSD,
      totalProfitARS,
      totalProfitUSD,
      lastUpdate,
    };
  },

  /**
   * FÓRMULA DEL BALANCE GLOBAL DE CHANCHITO
   * ==========================================
   * Balance = ingresos globales
   *         - gastos globales (sin cuotas: variables + mensualidades históricas)
   *         - cuotas del mes actual solamente
   *
   * Las cuotas pre-generadas de meses pasados y futuros NO se restan.
   * Solo impactan cuando llega su mes (via getCurrentMonthInstallmentsTotal).
   *
   * NO incluye:
   * - Cuotas de otros meses (ni pasadas ni futuras)
   * - Ahorros (tabla separada, no son transacciones)
   */
  getGlobalBalance: () => {
    const { transactions, getCurrentMonthInstallmentsTotal } = get();

    const totalIncome = transactions
      .filter((t) => t.type === 'income')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    // Todos los gastos excepto cuotas (variables + suscripciones históricas)
    const regularExpenses = transactions
      .filter((t) => t.type === 'expense' && !t.installment_plan_id)
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    // Solo las cuotas del mes actual
    const currentInstallments = getCurrentMonthInstallmentsTotal();

    return totalIncome - regularExpenses - currentInstallments;
  },

  /**
   * Retorna la suma de TODAS las suscripciones activas.
   *
   * Este es un INDICADOR PROYECTADO de gasto mensual recurrente, no una cantidad
   * de gasto realizado. Útil para:
   * - Estimar flujo de caja futuro
   * - Alertas si el burn rate es alto
   * - Dashboard de suscripciones
   *
   * NOTA: NO se resta de getGlobalBalance() para evitar double-counting.
   * Los gastos reales de suscripciones SÍ aparecen como transacciones.
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
   * - Retorna currentConsumption = ingresos - gastos - cuotas - suscripciones
   *
   * Para débito/efectivo:
   * - Usa mes calendario
   * - currentConsumption es el balance histórico hasta fin de mes
   *
   * Resultado:
   * - currentConsumption: Balance neto del período (consumo real - ingresos)
   * - fixedCosts: Suscripciones activas en este método
   * - projectedTotal: Mismo que currentConsumption (consistencia)
   * - nextClosingDate: Próxima fecha de cierre (solo crédito)
   * - nextPaymentDate: Próxima fecha de vencimiento (solo crédito)
   */
  getPaymentMethodStatus: (methodId: number) => {
    const { transactions, recurringPlans, paymentMethods } = get();
    const method = paymentMethods.find((m) => m.id === methodId);
    const now = new Date();

    if (!method)
      return { currentConsumption: 0, fixedCosts: 0, projectedTotal: 0 };

    // 1. Definir el rango de fechas (Scope)
    let startDate: Date;
    let endDate: Date;
    let nextClosingDate: Date | undefined;
    let nextPaymentDate: Date | undefined;

    if (method.type === 'credit' && method.default_closing_day && method.default_payment_day) {
      // Lógica de Ciclo de Tarjeta
      const closingDay = method.default_closing_day;
      const paymentDay = method.default_payment_day;

      // Encontrar la próxima fecha de pago/vencimiento.
      // El ciclo termina cuando se PAGA, no cuando se cierra.
      // Ej: cierra 19/3 y vence 1/4 → mientras no llegue el 1/4 seguimos en ese ciclo.
      let nextPaymentCandidate = setDate(now, paymentDay);
      if (!isAfter(startOfDay(nextPaymentCandidate), startOfDay(now))) {
        nextPaymentCandidate = addMonths(nextPaymentCandidate, 1);
      }
      nextPaymentDate = nextPaymentCandidate;

      // Derivar el cierre a partir del vencimiento.
      // Si paymentDay > closingDay: cierran en el mismo mes (ej: cierra 10, vence 25).
      // Si paymentDay <= closingDay: el pago es el mes siguiente al cierre (ej: cierra 19, vence 1).
      if (paymentDay > closingDay) {
        nextClosingDate = setDate(nextPaymentDate, closingDay);
      } else {
        nextClosingDate = setDate(subMonths(nextPaymentDate, 1), closingDay);
      }

      // Fecha de inicio del ciclo (aprox 1 mes antes del cierre)
      startDate = subMonths(nextClosingDate, 1);
      endDate = nextClosingDate;

    } else {
      // Lógica de Mes Calendario (Débito / Efectivo)
      startDate = startOfDay(setDate(now, 1)); // 1ro del mes
      endDate = endOfMonth(now);
    }

    // 2. Calcular Componentes de la Fórmula

    // A) Ingresos
    const income = transactions
      .filter(t => {
        if (t.payment_method_id !== methodId || t.type !== 'income') return false;
        
        // Para Crédito CON fechas: Solo ingresos del ciclo
        if (method.type === 'credit' && startDate && endDate) {
             const localTDate = parseLocalDate(t.date);
             return localTDate >= startDate && localTDate <= endDate;
        }
        
        // Para Débito/Efectivo (o Crédito sin fechas): Histórico completo
        return true;
      })
      .reduce((acc, t) => acc + Number(t.amount), 0);

    // B) Gastos (NO Cuotas)
    const expensesNonInstallment = transactions
      .filter(t => {
        if (t.payment_method_id !== methodId || t.type !== 'expense' || t.installment_plan_id) return false;
        
        // Para Crédito CON fechas: Solo gastos del ciclo
        if (method.type === 'credit' && startDate && endDate) {
             const localTDate = parseLocalDate(t.date);
             return localTDate >= startDate && localTDate <= endDate;
        }

        // Para Débito/Efectivo (o Crédito sin fechas): Histórico completo
        return true;
      })
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    // C) Cuotas
    const installments = transactions
      .filter(t => {
        if (t.payment_method_id !== methodId || t.type !== 'expense' || !t.installment_plan_id) return false;
        
        // CRÉDITO CON FECHAS: Solo las del ciclo actual
        if (method.type === 'credit' && nextPaymentDate) {
             const localTDate = parseLocalDate(t.date);
             return (
                localTDate.getMonth() === nextPaymentDate.getMonth() &&
                localTDate.getFullYear() === nextPaymentDate.getFullYear()
             );
        }

        // DÉBITO/EFECTIVO (o Crédito sin fechas): Histórico hasta fin de mes
        const localTDate = parseLocalDate(t.date);
        return localTDate <= endOfMonth(now);
      })
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    // D) Fijos Mensuales
    const fixedCosts = recurringPlans
      .filter((p) => p.payment_method_id === methodId && p.is_active)
      .reduce((acc, p) => acc + Number(p.amount), 0);

    // 3. Fórmula Final
    // Income - Expenses(Non-Quota) - Quotas - Fixed
    const netResult = income - expensesNonInstallment - installments - fixedCosts;

    return {
      currentConsumption: netResult, // Usamos el resultado neto
      fixedCosts,
      projectedTotal: netResult, // Mismo valor para consistencia
      nextClosingDate,
      nextPaymentDate,
    };
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
      .filter((t) => t.type === 'expense' && !t.installment_plan_id)
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    return totalNonInstallmentExpenses + getCurrentMonthInstallmentsTotal() + getMonthlyBurnRate();
  },

  getExpensesByCategory: (scope) => {
    const { transactions, paymentMethods, categories } = get();
    const now = new Date();

    return transactions
      .filter((t) => {
        if (t.type !== 'expense') return false;
        
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

    return transactions.filter(t => {
      if (t.payment_method_id !== methodId) return false;

      const localTDate = parseLocalDate(t.date);
      
      if (t.type === 'income') {
        return isSameMonth(localTDate, now);
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

  /**
   * Retorna la suma de gastos VARIABLES del mes actual.
   *
   * Solo incluye:
   * - Gastos normales (sin cuota de plan de cuotas)
   * - Sin suscripciones (sin recurring_plan_id)
   *
   * Excluye:
   * - Cuotas (installment_plan_id)
   * - Suscripciones activas (recurring_plan_id)
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
   * - variableExpenses: Gastos sin cuotas ni suscripciones
   * - installmentsTotal: Cuotas que vencen este mes
   * - subscriptionsCost: Suscripciones activas (burn rate)
   * - totalExpenses: Suma de los tres anteriores
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
    } = get();

    const variableExpenses = getMonthlyVariableExpenses();
    const installmentsTotal = getCurrentMonthInstallmentsTotal();
    const subscriptionsCost = getMonthlyBurnRate();
    const totalExpenses = variableExpenses + installmentsTotal + subscriptionsCost;
    const income = getMonthlyIncome();
    const netBalance = income - totalExpenses;

    return {
      variableExpenses,
      installmentsTotal,
      subscriptionsCost,
      totalExpenses,
      income,
      netBalance,
    };
  },

  getMonthlyComparison: () => {
    const { transactions, paymentMethods, recurringPlans } = get();
    const now = new Date();
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
   * Retorna un snapshot de 7 semanas para sparklines en el dashboard.
   *
   * Cada valor representa el total de la semana (lunes a domingo) para las
   * últimas 7 semanas, de más antigua (índice 0) a más reciente (índice 6).
   *
   * Tipos:
   * - 'income': Ingresos por semana
   * - 'variable': Gastos variables (sin cuotas ni suscripciones) por semana
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
    const { transactions } = get();
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
      const expenses = monthTxs
        .filter((t) => t.type === 'expense')
        .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
      return {
        month: MONTH_NAMES[ref.getMonth()],
        income,
        expenses,
        net: income - expenses,
      };
    });
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
