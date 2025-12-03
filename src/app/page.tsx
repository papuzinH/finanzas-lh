import { createClient } from '@/utils/supabase/server';
import { ArrowRight, CreditCard, CalendarClock, TrendingUp, Wallet } from 'lucide-react';
import Link from 'next/link';
import { format, differenceInMonths, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { Transaction, InstallmentPlan, RecurringPlan } from '@/types/database';
import { TransactionList } from '@/components/transaction-list';
import { BalanceCard } from '@/components/balance-card';
import { QuickActions } from '@/components/quick-actions';
import ExpensesChart from '@/app/components/ExpensesChart';
import { cn } from '@/lib/utils';

export const revalidate = 0;

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const CHART_COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1'];

export default async function Home() {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  // Query A: Global Data (All time transactions for balance & chart)
  // We need category and date for the chart
  const { data: balanceData } = await supabase
    .from('transactions')
    .select('amount, type, installment_plan_id, category, date')
    .eq('user_id', 1)
    .lte('date', todayStr);

  // Query B: Recent Activity (Last 5 for the list)
  const { data: recentData } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', 1)
    .lte('date', todayStr)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5);

  // Query C: Installment Plans
  const { data: plansData } = await supabase
    .from('installment_plans')
    .select('*')
    .eq('user_id', 1);

  // Query D: Recurring Plans (Mensualidades)
  const { data: recurringData } = await supabase
    .from('recurring_plans')
    .select('*')
    .eq('user_id', 1)
    .eq('is_active', true);

  const allTransactions = balanceData || [];
  const recentTransactions: Transaction[] = recentData || [];
  const installmentPlans: InstallmentPlan[] = plansData || [];
  const recurringPlans: RecurringPlan[] = recurringData || [];

  // --- Logic: Global Balance ---
  const nonInstallmentTransactions = allTransactions.filter(t => !t.installment_plan_id);
  const baseBalance = nonInstallmentTransactions.reduce((acc, curr) => acc + curr.amount, 0);

  let activeQuotasTotal = 0;
  
  // --- Logic: Debt KPI ---
  let totalDebtOriginal = 0;
  let totalDebtPaid = 0;
  let activePlansCount = 0;

  installmentPlans.forEach(plan => {
    const purchaseDate = parseISO(plan.purchase_date);
    const monthsPassed = differenceInMonths(today, purchaseDate);
    
    // Active Quotas for Balance Calculation
    // If plan is active (months passed < installments count)
    if (monthsPassed >= 0 && monthsPassed < plan.installments_count) {
        const quotaValue = plan.total_amount / plan.installments_count;
        activeQuotasTotal += quotaValue;
        activePlansCount++;
    }

    // Debt Calculation
    // We assume linear payment based on months passed
    let paid = 0;
    if (monthsPassed >= plan.installments_count) {
      paid = plan.total_amount; // Fully paid
    } else if (monthsPassed > 0) {
      paid = (plan.total_amount / plan.installments_count) * monthsPassed;
    }
    // If monthsPassed <= 0, paid is 0

    totalDebtOriginal += plan.total_amount;
    totalDebtPaid += paid;
  });

  const totalDebtRemaining = totalDebtOriginal - totalDebtPaid;
  const debtProgress = totalDebtOriginal > 0 ? (totalDebtPaid / totalDebtOriginal) * 100 : 0;

  // --- Logic: Fixed Costs KPI ---
  const totalFixedCost = recurringPlans.reduce((acc, curr) => acc + curr.amount, 0);

  // Final Balance
  const recurringTotal = totalFixedCost; // Assuming all active recurring plans are deducted monthly
  const totalBalance = baseBalance - activeQuotasTotal - recurringTotal;
  
  const totalIncome = allTransactions
    .filter(t => t.amount > 0)
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalExpense = allTransactions
    .filter(t => t.amount < 0)
    .reduce((acc, curr) => acc + curr.amount, 0); 

  // --- Logic: Chart Data (Current Month Expenses) ---
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const currentMonthExpenses = allTransactions.filter(t => {
    const tDate = parseISO(t.date);
    return (
      isWithinInterval(tDate, { start: monthStart, end: monthEnd }) &&
      (t.type === 'expense' || t.amount < 0) // Safety check for expense type
    );
  });

  const expensesByCategory: Record<string, number> = {};
  currentMonthExpenses.forEach(t => {
    const cat = t.category || 'Otros';
    const amount = Math.abs(t.amount);
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + amount;
  });

  const chartData = Object.entries(expensesByCategory)
    .map(([name, value], index) => ({
      name,
      value,
      color: CHART_COLORS[index % CHART_COLORS.length]
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30 pb-24">
      {/* Header / Hero Section */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md pt-8 pb-8">
        <div className="mx-auto max-w-2xl px-6">
          <div className="flex flex-col items-center justify-center text-center space-y-6">
            
            {/* Section A: Estado Patrimonial */}
            <div className="w-full transform transition-all hover:scale-[1.01]">
              <BalanceCard 
                balance={totalBalance} 
                income={totalIncome} 
                expense={totalExpense} 
              />
            </div>

            <QuickActions />

          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8 space-y-8">
        
        {/* Section B: Salud Financiera (Bento Grid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Card 1: Deuda Pendiente */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <CreditCard className="h-12 w-12 text-rose-500" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2 text-rose-400">
                <CreditCard className="h-4 w-4" />
                <h3 className="text-xs font-medium uppercase tracking-wider">Deuda Cuotas</h3>
              </div>
              <p className="text-2xl font-bold font-mono text-slate-100 mb-4">
                {formatCurrency(totalDebtRemaining)}
              </p>
              
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Progreso de pago</span>
                  <span>{Math.round(debtProgress)}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-rose-500 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${debtProgress}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 text-right pt-1">
                  {activePlansCount} planes activos
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Gastos Fijos */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <CalendarClock className="h-12 w-12 text-amber-500" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2 text-amber-400">
                <CalendarClock className="h-4 w-4" />
                <h3 className="text-xs font-medium uppercase tracking-wider">Fijos Mensuales</h3>
              </div>
              <p className="text-2xl font-bold font-mono text-slate-100 mb-1">
                {formatCurrency(totalFixedCost)}
              </p>
              <p className="text-xs text-slate-500">
                Se debita automáticamente
              </p>
              <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                <Wallet className="h-3 w-3" />
                <span>{recurringPlans.length} suscripciones activas</span>
              </div>
            </div>
          </div>

        </div>

        {/* Section C: Análisis Visual */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-medium text-slate-200">Distribución de Gastos (Este Mes)</h3>
          </div>
          <ExpensesChart data={chartData} />
        </div>

        {/* Section D: Últimos Movimientos */}
        <div className="space-y-4 pt-4 border-t border-slate-800/50">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-medium text-slate-200">Últimos Movimientos</h3>
            <Link 
              href="/movimientos"
              className="flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
            >
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <TransactionList transactions={recentTransactions} />
        </div>
      </main>
    </div>
  );
}
