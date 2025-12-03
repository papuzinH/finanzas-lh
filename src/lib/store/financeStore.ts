import { create } from 'zustand';
import { createClient } from '@/utils/supabase/client';
import { Transaction, InstallmentPlan, RecurringPlan, PaymentMethod } from '@/types/database';
import { addMonths, setDate, getDate, parseISO, format } from 'date-fns';

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
  };
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  transactions: [],
  installmentPlans: [],
  paymentMethods: [],
  recurringPlans: [],
  isLoading: false,
  error: null,
  isInitialized: false,

  fetchAllData: async () => {
    set({ isLoading: true, error: null });
    const supabase = createClient();

    try {
      const [
        { data: transactionsData, error: txError },
        { data: installments, error: instError },
        { data: paymentMethodsData, error: pmError },
        { data: recurring, error: recError }
      ] = await Promise.all([
        supabase.from('transactions').select('*').order('date', { ascending: false }),
        supabase.from('installment_plans').select('*'),
        supabase.from('payment_methods').select('*'),
        supabase.from('recurring_plans').select('*')
      ]);

      if (txError) throw txError;
      if (instError) throw instError;
      if (pmError) throw pmError;
      if (recError) throw recError;

      const rawTransactions = (transactionsData as Transaction[]) || [];
      const methods = (paymentMethodsData as PaymentMethod[]) || [];

      const processedTransactions = rawTransactions.map((t) => {
        const method = methods.find((m) => m.id === t.payment_method_id);
        
        if (method && method.type === 'credit' && method.default_closing_day && method.default_payment_day) {
          const tDate = parseISO(t.date);
          const closingDay = method.default_closing_day;
          const paymentDay = method.default_payment_day;
          
          let paymentDate;
          if (getDate(tDate) <= closingDay) {
             paymentDate = setDate(addMonths(tDate, 1), paymentDay);
          } else {
             paymentDate = setDate(addMonths(tDate, 2), paymentDay);
          }

          return {
            ...t,
            date: format(paymentDate, 'yyyy-MM-dd')
          };
        }
        return t;
      });

      processedTransactions.sort((a, b) => {
          if (a.date > b.date) return -1;
          if (a.date < b.date) return 1;
          return 0;
      });

      set({
        transactions: processedTransactions,
        installmentPlans: (installments as InstallmentPlan[]) || [],
        paymentMethods: methods,
        recurringPlans: (recurring as RecurringPlan[]) || [],
        isInitialized: true,
      });
    } catch (error) {
      console.error('Error fetching finance data:', error);
      const message = error instanceof Error ? error.message : 'Error al cargar datos';
      set({ error: message });
    } finally {
      set({ isLoading: false });
    }
  },

  getGlobalBalance: () => {
    const { transactions } = get();
    // Suma simple de todas las transacciones (ingresos - gastos)
    // Asumiendo que 'amount' ya viene con signo o se usa 'type'
    // En tu DB actual, parece que 'amount' es absoluto y 'type' define el signo.
    // Ajustaremos la lógica para ser robustos.
    return transactions.reduce((acc, t) => {
      const amount = Number(t.amount);
      if (t.type === 'income') return acc + amount;
      if (t.type === 'expense') return acc - amount;
      // Si no tiene type (legacy), asumimos expense si es negativo o income si positivo?
      // Mejor usar la lógica de type.
      return acc - amount; // Default to expense logic if type missing/unknown for safety
    }, 0);
  },

  getMonthlyBurnRate: () => {
    const { recurringPlans } = get();
    return recurringPlans
      .filter(p => p.is_active)
      .reduce((acc, p) => acc + Number(p.amount), 0);
  },

  getInstallmentStatus: (planId: number) => {
    const { installmentPlans, transactions } = get();
    const plan = installmentPlans.find(p => p.id === planId);
    
    if (!plan) return null;

    // Filtramos las transacciones hijas de este plan
    const relatedTransactions = transactions.filter(t => t.installment_plan_id === planId);
    
    // FECHA DE CORTE: HOY
    // Solo contamos como "pagado" lo que tiene fecha <= HOY
    // (O si quieres ser más estricto: lo que ya cerró en la tarjeta anterior)
    const now = new Date();
    
    const paidTransactions = relatedTransactions.filter(t => {
      const transactionDate = new Date(t.date);
      // Consideramos pagado si la fecha de pago ya pasó o es hoy
      return transactionDate <= now;
    });

    // Sumamos monto PAGADO REAL (solo las vencidas)
    const paidAmount = paidTransactions.reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
    
    // Total del plan
    const totalAmount = Number(plan.total_amount);
    
    // Cuotas pagadas reales (cantidad de transacciones vencidas)
    const installmentsPaidCount = paidTransactions.length;

    // Calculamos restante
    const remainingAmount = Math.max(totalAmount - paidAmount, 0);
    const remainingInstallments = Math.max(plan.installments_count - installmentsPaidCount, 0);
    
    // Progreso
    const progress = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;

    return {
      paid: paidAmount,
      remaining: remainingAmount,
      progress,
      installmentsPaid: installmentsPaidCount,
      remainingInstallments,
      // Solo está terminado si ya pagamos todo Y no queda deuda futura
      isFinished: remainingAmount <= 100, // Usamos un margen de error de $100 por redondeos decimales
      plan
    };
  },

  getPaymentMethodStatus: (methodId: number) => {
    const { transactions, recurringPlans, paymentMethods } = get();
    const method = paymentMethods.find(m => m.id === methodId);
    
    if (!method) return { currentConsumption: 0, fixedCosts: 0, projectedTotal: 0 };

    // 1. Consumo Actual (Ciclo)
    const now = new Date();
    let targetDate = now;

    // Si es tarjeta de crédito, calculamos la fecha de pago del ciclo actual
    if (method.type === 'credit' && method.default_closing_day && method.default_payment_day) {
      const closingDay = method.default_closing_day;
      const paymentDay = method.default_payment_day;
      
      if (getDate(now) <= closingDay) {
        targetDate = setDate(addMonths(now, 1), paymentDay);
      } else {
        targetDate = setDate(addMonths(now, 2), paymentDay);
      }
    }

    const targetMonth = targetDate.getMonth();
    const targetYear = targetDate.getFullYear();

    const transactionsSum = transactions
      .filter(t => t.payment_method_id === methodId)
      .reduce((acc, t) => {
        const amount = Number(t.amount);
        
        if (t.type === 'income') {
          return acc + amount;
        }
        
        const tDate = parseISO(t.date);
        if (tDate.getMonth() === targetMonth && tDate.getFullYear() === targetYear) {
          return acc - amount;
        }
        
        return acc;
      }, 0);

    // 2. Costos Fijos asociados a este medio
    const fixedCosts = recurringPlans
      .filter(p => p.payment_method_id === methodId && p.is_active)
      .reduce((acc, p) => acc + Number(p.amount), 0);
      
    const currentConsumption = transactionsSum - fixedCosts;

    return {
      currentConsumption,
      fixedCosts,
      projectedTotal: currentConsumption
    };
  }
}));
