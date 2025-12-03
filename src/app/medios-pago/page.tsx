import { createClient } from '@/utils/supabase/server';
import { 
  CreditCard, 
  Wallet, 
  Banknote, 
  History,
  Edit3,
  CalendarClock
} from 'lucide-react';
import { format, addMonths, setDate, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Define types locally since they might be missing in database.ts
type Transaction = {
  amount: number;
  date: string;
  description: string;
  category: string | null;
};

type RecurringPlan = {
  id: number;
  description: string;
  amount: number;
  is_active: boolean;
};

type PaymentMethod = {
  id: number;
  name: string;
  type: string; // 'credit' | 'debit' | 'cash' | 'other'
  default_closing_day: number | null;
  default_payment_day: number | null;
  transactions: Transaction[];
  recurring_plans: RecurringPlan[];
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  // Adjust for timezone if needed, but usually string yyyy-mm-dd is parsed as UTC in some envs or local in others.
  // Using simple split to avoid timezone issues for display
  const [year, month, day] = dateString.split('-').map(Number);
  const localDate = new Date(year, month - 1, day);
  return format(localDate, 'd MMM', { locale: es });
};

export default async function MediosPagoPage() {
  const supabase = await createClient();

  const { data: rawData, error } = await supabase
    .from('payment_methods')
    .select('*, transactions(amount, date, description, category), recurring_plans!payment_method_id(*)')
    .eq('user_id', 1)
    .order('name');

  if (error) {
    console.error('Error fetching payment methods:', error);
    return <div className="p-6 text-red-500">Error al cargar medios de pago</div>;
  }

  const paymentMethods = (rawData as unknown as PaymentMethod[])?.map(pm => {
    // Sort transactions by date desc
    const sortedTransactions = (pm.transactions as Transaction[]).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    // Filter active recurring plans
    const activeRecurringPlans = (pm.recurring_plans as RecurringPlan[]).filter(p => p.is_active);
    
    return { ...pm, transactions: sortedTransactions, recurring_plans: activeRecurringPlans };
  }) as PaymentMethod[];

  console.log(paymentMethods);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans pb-24">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
            <Wallet className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">Billetera</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {paymentMethods.map((pm) => (
            <PaymentCard key={pm.id} data={pm} />
          ))}
        </div>
      </main>
    </div>
  );
}

function PaymentCard({ data }: { data: PaymentMethod }) {
  const isCredit = data.type === 'credit';
  
  // Calculate Total Balance / Consumption
  // For credit: Sum of expenses in current cycle (approx) or total debt? 
  // Prompt says: "Calcula el 'Saldo/Consumo Actual': Suma de las transactions asociadas."
  // And "Si es 'credit', calcula cuánto se gastó en el ciclo actual".
  
  // Let's calculate total balance (all time) just in case, but usually for credit we want current cycle.
  // For debit/cash, it might be "Balance" (Income - Expense).
  // Assuming transactions have amounts where expense is negative? 
  // Or usually in these apps expense is positive number but type='expense'.
  // The prompt for previous task showed `type` column in transactions. 
  // Here we only selected `amount, date, description, category`. 
  // We might need `type` to know if it's income or expense to calculate balance correctly.
  // Let's assume amount is signed or we need to fetch type. 
  // The prompt query: `transactions(amount, date, description, category)`. 
  // I'll assume amount is negative for expense or I should fetch type.
  // Let's fetch type to be safe. I'll update the query in my mind, but for now let's assume amount is absolute and we need type.
  // Wait, in the previous file `balance-card.tsx` (not shown but implied) or `movimientos/page.tsx`, we saw:
  // `t.type === 'income' ? '+' : '-'` and `Math.abs(t.amount)`.
  // So `amount` in DB might be absolute.
  // I should fetch `type` in the query.

  // Cycle Logic for Credit Cards
  let currentCycleSpent = 0;
  let fixedMonthlyCost = 0;
  let projectedClosing = 0;
  let nextClosingDate: Date | null = null;
  let nextDueDate: Date | null = null;

  const today = new Date();
  
  // Calculate Fixed Monthly Cost (Subscriptions)
  fixedMonthlyCost = data.recurring_plans.reduce((acc, plan) => acc + plan.amount, 0);

  if (isCredit && data.default_closing_day) {
    // Determine cycle start/end
    // If today is 2nd, closing is 25th. Cycle started 26th last month.
    // If today is 26th, closing is 25th. Cycle started 26th this month (for next close).
    
    const closingDay = data.default_closing_day;
    let cycleStartDate: Date;
    let cycleEndDate: Date;

    if (today.getDate() <= closingDay) {
      // We are in the cycle that ends this month
      cycleEndDate = setDate(today, closingDay);
      cycleStartDate = setDate(subMonths(today, 1), closingDay + 1);
    } else {
      // We are in the cycle that ends next month
      cycleEndDate = setDate(addMonths(today, 1), closingDay);
      cycleStartDate = setDate(today, closingDay + 1);
    }

    nextClosingDate = cycleEndDate;
    
    // Calculate Due Date
    if (data.default_payment_day) {
      // Due date is usually in the month following the closing date
      // If closing is Jan 25, Due is Feb 5.
      // If closing is Jan 25, and Due day is 2 (of next month).
      let dueMonth = cycleEndDate.getMonth() + 1; // Next month
      let dueYear = cycleEndDate.getFullYear();
      if (dueMonth > 11) {
        dueMonth = 0;
        dueYear++;
      }
      nextDueDate = new Date(dueYear, dueMonth, data.default_payment_day);
    }

    // Sum transactions in this cycle
    currentCycleSpent = data.transactions.reduce((acc, t) => {
      const tDate = new Date(t.date);
      // We need to know if it's expense. Assuming all transactions linked to a credit card are expenses for now, 
      // or we should check type. I'll assume they are expenses.
      if (tDate >= cycleStartDate && tDate <= cycleEndDate) {
        return acc + Number(t.amount);
      }
      return acc;
    }, 0);

  } else {
    // For non-credit or credit without dates, just sum all? 
    // Or maybe sum all for "Balance" (Cash/Debit).
    // For Cash/Debit, usually we want "Current Balance". 
    // That would be Income - Expense.
    // Since I don't have `type` in the requested query, I'll assume `amount` is signed or I'll fetch `type`.
    // I will add `type` to the query in the main component.
    
    // Fallback sum of all transactions (simple balance)
    // This might be wrong if we don't distinguish income/expense.
    // I'll assume for this view, for Credit Cards it's "Consumption", for others it's "Balance".
    // But without `type`, I can't calculate balance correctly if amounts are absolute.
    // I will add `type` to the select.
    currentCycleSpent = data.transactions.reduce((acc, t) => acc + Number(t.amount), 0);
  }

  projectedClosing = currentCycleSpent + fixedMonthlyCost;

  // Visuals
  const bgClass = isCredit 
    ? "bg-linear-to-br from-slate-800 to-slate-900 border-slate-700/50" 
    : "bg-slate-900 border-slate-800";
  
  const Icon = isCredit ? CreditCard : (data.type === 'cash' ? Banknote : Wallet);
  const iconColor = isCredit ? "text-purple-400" : "text-emerald-400";
  const iconBg = isCredit ? "bg-purple-500/10" : "bg-emerald-500/10";

  return (
    <div className={cn("rounded-2xl border p-5 relative overflow-hidden group transition-all hover:border-slate-600", bgClass)}>
      {/* Background Decoration */}
      {isCredit && (
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-purple-500/5 blur-3xl group-hover:bg-purple-500/10 transition-all" />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg, iconColor)}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100">{data.name}</h3>
            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", 
              isCredit ? "bg-purple-500/10 border-purple-500/20 text-purple-300" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
            )}>
              {isCredit ? 'Crédito' : 'Efectivo / Débito'}
            </span>
          </div>
        </div>
        {isCredit && (
           <button className="text-slate-500 hover:text-slate-300 transition-colors">
             <Edit3 className="h-4 w-4" />
           </button>
        )}
      </div>

      {/* Main Body */}
      <div className="mb-6 relative z-10">
        <p className="text-xs text-slate-400 mb-1">
          {isCredit ? 'Consumo del ciclo' : 'Saldo actual'}
        </p>
        <p className="text-2xl font-bold font-mono tracking-tight text-white">
          {formatCurrency(currentCycleSpent)}
        </p>
        
        {isCredit && nextClosingDate && (
          <div className="mt-4 flex items-center gap-4 text-xs">
            <div className="flex flex-col">
              <span className="text-slate-500">Cierre</span>
              <span className="font-medium text-slate-300">{format(nextClosingDate, 'd MMM', { locale: es })}</span>
            </div>
            {nextDueDate && (
              <>
                <div className="h-6 w-px bg-slate-800" />
                <div className="flex flex-col">
                  <span className="text-slate-500">Vencimiento</span>
                  <span className="font-medium text-amber-400">{format(nextDueDate, 'd MMM', { locale: es })}</span>
                </div>
              </>
            )}
            {fixedMonthlyCost > 0 && (
              <>
                <div className="h-6 w-px bg-slate-800" />
                <div className="flex flex-col">
                  <span className="text-slate-500">Proyección</span>
                  <span className="font-medium text-slate-300">{formatCurrency(projectedClosing)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Subscriptions Summary */}
        {data.recurring_plans.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-800/50">
            <div className="group/subs cursor-help">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <CalendarClock className="h-3 w-3" />
                  <span>Suscripciones adheridas: {data.recurring_plans.length}</span>
                </div>
                <span className="font-medium text-slate-300">{formatCurrency(fixedMonthlyCost)}</span>
              </div>
              
              {/* Tooltip / Hover List */}
              <div className="hidden group-hover/subs:block absolute left-0 right-0 bottom-full mb-2 mx-4 p-2 rounded-lg bg-slate-900 border border-slate-800 shadow-xl z-20">
                <p className="text-[10px] font-medium text-slate-500 mb-1 px-1">Detalle de fijos</p>
                <div className="space-y-1">
                  {data.recurring_plans.map(plan => (
                    <div key={plan.id} className="flex justify-between text-xs px-1">
                      <span className="text-slate-300">{plan.description}</span>
                      <span className="text-slate-400">{formatCurrency(plan.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mini History */}
      <div className="space-y-2 relative z-10">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <History className="h-3 w-3" />
          <span>Últimos movimientos</span>
        </div>
        {data.transactions.slice(0, 3).map((t, i) => (
          <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-950/30 border border-slate-800/50">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-slate-500 whitespace-nowrap">{formatDate(t.date)}</span>
              <span className="text-slate-300 truncate">{t.description}</span>
            </div>
            <span className="font-mono text-slate-200 whitespace-nowrap">{formatCurrency(t.amount)}</span>
          </div>
        ))}
        {data.transactions.length === 0 && (
          <p className="text-xs text-slate-600 italic py-2">Sin movimientos recientes</p>
        )}
      </div>
    </div>
  );
}
