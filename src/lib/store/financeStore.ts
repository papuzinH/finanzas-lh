import { create } from 'zustand';
import { createClient } from '@/utils/supabase/client';
import {
  Transaction,
  InstallmentPlan,
  RecurringPlan,
  PaymentMethod,
} from '@/types/database';
import {
  addMonths,
  setDate,
  getDate,
  parseISO,
  format,
  subMonths,
  isAfter,
  startOfDay,
  isSameDay,
  endOfMonth,
} from 'date-fns';

interface FinanceState {
  // State Raw
  transactions: Transaction[];
  installmentPlans: InstallmentPlan[];
  paymentMethods: PaymentMethod[];
  recurringPlans: RecurringPlan[];

  // Status
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;

  // Actions
  fetchAllData: () => Promise<void>;

  // Computed Getters (Logic)
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
  getGlobalIncome: () => number;
  getGlobalEffectiveExpenses: () => number;
  getExpensesByCategory: (scope: 'global' | 'current_month') => Record<string, number>;
}

// Helper para determinar si un gasto corresponde al mes actual (Scope)
const isExpenseInCurrentMonthScope = (t: Transaction, methods: PaymentMethod[], now: Date) => {
  if (t.type !== 'expense') return false;
  
  const tDate = parseISO(t.date);
  
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
              tDate.getMonth() === paymentDateForThisCycle.getMonth() &&
              tDate.getFullYear() === paymentDateForThisCycle.getFullYear()
           );
      }
  }
  
  // 2. Si NO es cuota (o no es tarjeta con ciclo definido) -> Usar Mes Calendario
  const localTDate = new Date(
      tDate.valueOf() + tDate.getTimezoneOffset() * 60 * 1000
  );
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
  isLoading: false,
  error: null,
  isInitialized: false,

  fetchAllData: async () => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    const supabase = createClient();

    try {
      const [
        { data: transactionsData, error: txError },
        { data: installments, error: instError },
        { data: paymentMethodsData, error: pmError },
        { data: recurring, error: recError },
      ] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false }),
        supabase.from('installment_plans').select('*'),
        supabase.from('payment_methods').select('*'),
        supabase.from('recurring_plans').select('*'),
      ]);

      if (txError) throw txError;

      const methods = (paymentMethodsData as PaymentMethod[]) || [];
      const rawTransactions = (transactionsData as Transaction[]) || [];

      // PROCESAMIENTO INTELIGENTE DEL FRONTEND
      // Creamos 'periodDate' para agrupar visualmente en el mes del resumen
      const processedTransactions = rawTransactions.map((t) => {
        const method = methods.find((m) => m.id === t.payment_method_id);
        let periodDate = t.date; // Default: Misma fecha

        if (method && method.type === 'credit') {
          const tDate = parseISO(t.date);
          const dayOfMonth = getDate(tDate);

          // Si la fecha de pago es a principio de mes (ej: día 6) y la tarjeta vence cerca (ej: día 6)
          // Significa que corresponde al consumo del mes ANTERIOR.
          if (
            method.default_payment_day &&
            dayOfMonth <= method.default_payment_day + 2
          ) {
            const visualDate = subMonths(tDate, 1);
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
        isInitialized: true,
      });
    } catch (error) {
      console.error(error);
    } finally {
      set({ isLoading: false });
    }
  },

  getGlobalBalance: () => {
    const { transactions, getCurrentMonthInstallmentsTotal, getMonthlyBurnRate } = get();

    // 1. Suma de todos los ingresos
    const totalIncome = transactions
      .filter((t) => t.type === 'income')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    // 2. Suma de gastos que NO son cuotas
    const totalNonInstallmentExpenses = transactions
      .filter((t) => t.type === 'expense' && !t.installment_plan_id)
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    // 3. Cuotas del mes actual
    const currentMonthInstallments = getCurrentMonthInstallmentsTotal();

    // 4. Gastos fijos mensuales
    const monthlyBurnRate = getMonthlyBurnRate();

    return totalIncome - totalNonInstallmentExpenses - currentMonthInstallments - monthlyBurnRate;
  },

  getMonthlyBurnRate: () => {
    const { recurringPlans } = get();
    return recurringPlans
      .filter((p) => p.is_active)
      .reduce((acc, p) => acc + Number(p.amount), 0);
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
      const transactionDate = new Date(t.date);
      return transactionDate <= now;
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

      // Aproximación del cierre de este mes
      const closingDateThisMonth = setDate(now, closingDay);
      
      // Si hoy es antes del cierre, estamos en el ciclo que cierra este mes.
      // Si hoy es después del cierre, estamos en el ciclo que cierra el mes que viene.
      if (isAfter(now, closingDateThisMonth)) {
         nextClosingDate = setDate(addMonths(now, 1), closingDay);
      } else {
         nextClosingDate = closingDateThisMonth;
      }

      // Fecha de inicio del ciclo (aprox 1 mes antes del cierre)
      startDate = subMonths(nextClosingDate, 1);
      endDate = nextClosingDate;

      // Calcular vencimiento asociado a este cierre
      let paymentDate = setDate(nextClosingDate, paymentDay);
      if (paymentDay <= closingDay) {
        paymentDate = addMonths(paymentDate, 1);
      }
      nextPaymentDate = paymentDate;

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
             const tDate = parseISO(t.date);
             const localTDate = new Date(tDate.valueOf() + tDate.getTimezoneOffset() * 60 * 1000);
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
             const tDate = parseISO(t.date);
             const localTDate = new Date(tDate.valueOf() + tDate.getTimezoneOffset() * 60 * 1000);
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
             const tDate = parseISO(t.date);
             return (
                tDate.getMonth() === nextPaymentDate.getMonth() &&
                tDate.getFullYear() === nextPaymentDate.getFullYear()
             );
        } 
        
        // DÉBITO/EFECTIVO (o Crédito sin fechas): Histórico hasta fin de mes
        const tDate = parseISO(t.date);
        const localTDate = new Date(tDate.valueOf() + tDate.getTimezoneOffset() * 60 * 1000);
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

  getCurrentMonthInstallmentsTotal: () => {
    const { transactions, paymentMethods } = get();
    const now = new Date();

    return transactions
      .filter((t) => t.installment_plan_id && isExpenseInCurrentMonthScope(t, paymentMethods, now))
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
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
    const { transactions, paymentMethods } = get();
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
        const cat = t.category || 'Otros';
        acc[cat] = (acc[cat] || 0) + Math.abs(Number(t.amount));
        return acc;
      }, {} as Record<string, number>);
  },
}));
