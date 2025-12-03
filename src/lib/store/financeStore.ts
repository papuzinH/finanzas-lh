import { create } from 'zustand';
import { createClient } from '@/utils/supabase/client';
import { Transaction, InstallmentPlan, RecurringPlan, PaymentMethod } from '@/types/database';

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
        { data: transactions, error: txError },
        { data: installments, error: instError },
        { data: paymentMethods, error: pmError },
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

      set({
        transactions: (transactions as Transaction[]) || [],
        installmentPlans: (installments as InstallmentPlan[]) || [],
        paymentMethods: (paymentMethods as PaymentMethod[]) || [],
        recurringPlans: (recurring as RecurringPlan[]) || [],
        isInitialized: true,
      });
    } catch (err: any) {
      console.error('Error fetching finance data:', err);
      set({ error: err.message || 'Error al cargar datos' });
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

    // Lógica basada en HISTORIAL REAL de pagos
    // Filtramos transacciones vinculadas a este plan
    const relatedTransactions = transactions.filter(t => t.installment_plan_id === planId);
    
    const paidAmount = relatedTransactions.reduce((acc, t) => acc + Number(t.amount), 0);
    const totalAmount = Number(plan.total_amount);
    
    // Calculamos restante
    const remaining = Math.max(totalAmount - paidAmount, 0);
    
    // Progreso
    const progress = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;

    return {
      paid: paidAmount,
      remaining,
      progress,
      isFinished: remaining <= 0,
      plan
    };
  },

  getPaymentMethodStatus: (methodId: number) => {
    const { transactions, recurringPlans, paymentMethods } = get();
    const method = paymentMethods.find(m => m.id === methodId);
    
    if (!method) return { currentConsumption: 0, fixedCosts: 0, projectedTotal: 0 };

    // 1. Consumo Actual (Ciclo)
    // Nota: Para hacerlo perfecto necesitaríamos la lógica de fechas de cierre.
    // Por simplicidad en esta versión v1 del store, sumaremos todo lo del mes actual.
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const currentConsumption = transactions
      .filter(t => {
        const tDate = new Date(t.date);
        return (
          t.payment_method_id === methodId &&
          t.type === 'expense' &&
          tDate.getMonth() === currentMonth &&
          tDate.getFullYear() === currentYear
        );
      })
      .reduce((acc, t) => acc + Number(t.amount), 0);

    // 2. Costos Fijos asociados a este medio
    const fixedCosts = recurringPlans
      .filter(p => p.payment_method_id === methodId && p.is_active)
      .reduce((acc, p) => acc + Number(p.amount), 0);

    return {
      currentConsumption,
      fixedCosts,
      projectedTotal: currentConsumption + fixedCosts
    };
  }
}));
