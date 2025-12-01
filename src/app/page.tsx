import { createClient } from '@/utils/supabase/server';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { format, differenceInMonths, parseISO } from 'date-fns';
import { Transaction, InstallmentPlan, RecurringPlan } from '@/types/database';
import { TransactionList } from '@/components/transaction-list';
import { BalanceCard } from '@/components/balance-card';
import { QuickActions } from '@/components/quick-actions';

export const revalidate = 0;

export default async function Home() {
  const supabase = await createClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  // Query A: Global KPIs (All time balance)
  const { data: balanceData } = await supabase
    .from('transactions')
    .select('amount, type, installment_plan_id')
    .eq('user_id', 1)
    .lte('date', today);

  // Query B: Recent Activity (Last 15)
  const { data: recentData } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', 1)
    .lte('date', today)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(15);

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

  // Calculate Global Balance
  // 1. Sum of all non-installment transactions (Income + Cash Expenses)
  const nonInstallmentTransactions = allTransactions.filter(t => !t.installment_plan_id);
  const baseBalance = nonInstallmentTransactions.reduce((acc, curr) => acc + curr.amount, 0);

  // 2. Subtract ONE quota value for each ACTIVE installment plan
  let activeQuotasTotal = 0;
  const now = new Date();

  installmentPlans.forEach(plan => {
    const purchaseDate = parseISO(plan.purchase_date);
    const monthsPassed = differenceInMonths(now, purchaseDate);
    
    // Check if plan is active (months passed is less than total installments)
    // And monthsPassed >= 0 ensures we don't count future plans yet
    if (monthsPassed >= 0 && monthsPassed < plan.installments_count) {
        const quotaValue = plan.total_amount / plan.installments_count;
        activeQuotasTotal += quotaValue;
    }
  });

  // 3. Subtract Recurring Plans (Mensualidades)
  const recurringTotal = recurringPlans.reduce((acc, curr) => acc + curr.amount, 0);

  // Final Balance = Base Balance - Active Quotas - Recurring Plans
  const totalBalance = baseBalance - activeQuotasTotal - recurringTotal;
  
  // KPIs for display
  const totalIncome = allTransactions
    .filter(t => t.amount > 0)
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalExpense = allTransactions
    .filter(t => t.amount < 0)
    .reduce((acc, curr) => acc + curr.amount, 0); 

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30 pb-24">
      {/* Header / Hero Section */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md pt-8 pb-8">
        <div className="mx-auto max-w-2xl px-6">
          <div className="flex flex-col items-center justify-center text-center space-y-6">
            
            <BalanceCard 
              balance={totalBalance} 
              income={totalIncome} 
              expense={totalExpense} 
            />

            <QuickActions />

          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {/* Recent Transactions List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-semibold text-slate-200">Últimos Movimientos</h3>
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
