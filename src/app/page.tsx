import { createClient } from '@/utils/supabase/server';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
} from 'lucide-react';
import { startOfMonth, endOfMonth, format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import ExpensesChart from './components/ExpensesChart';
import { MonthSelector } from '@/components/month-selector';
import { Transaction } from '@/types/database';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const CATEGORY_COLORS: Record<string, string> = {
  'comida': '#10b981', 
  'food': '#10b981',
  'restaurante': '#10b981',
  'compra': '#3b82f6', 
  'shopping': '#3b82f6',
  'super': '#3b82f6',
  'casa': '#f59e0b', 
  'hogar': '#f59e0b',
  'alquiler': '#f59e0b',
  'transporte': '#6366f1', 
  'auto': '#6366f1',
  'uber': '#6366f1',
  'celular': '#ec4899', 
  'internet': '#ec4899',
  'teléfono': '#ec4899',
};

const DEFAULT_COLOR = '#64748b';

export default async function Home({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const currentMonth = params.month || format(new Date(), 'yyyy-MM');
  
  // Date range calculation
  const date = parse(currentMonth, 'yyyy-MM', new Date());
  const startDate = startOfMonth(date).toISOString();
  const endDate = endOfMonth(date).toISOString();

  const supabase = await createClient();

  const { data: rawTransactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', 1)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  const transactions: Transaction[] = rawTransactions || [];

  // Calculations
  const totalIncome = transactions
    .filter((t) => t.type === 'income' || (t.amount > 0 && t.type !== 'expense'))
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalExpense = transactions
    .filter((t) => t.type === 'expense' || (t.amount < 0 && t.type !== 'income'))
    .reduce((acc, curr) => acc + Math.abs(curr.amount), 0);

  const totalBalance = totalIncome - totalExpense;

  // Chart Data Preparation
  const expensesByCategory = transactions
    .filter((t) => t.type === 'expense' || (t.amount < 0 && t.type !== 'income'))
    .reduce((acc, curr) => {
      const cat = curr.category || 'Otros';
      acc[cat] = (acc[cat] || 0) + Math.abs(curr.amount);
      return acc;
    }, {} as Record<string, number>);

  const chartData = Object.entries(expensesByCategory).map(([name, value]) => ({
    name,
    value,
    color: CATEGORY_COLORS[name.toLowerCase()] || DEFAULT_COLOR,
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30 pb-24">
      {/* Header & Month Selector */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-6">
            <MonthSelector currentMonth={currentMonth} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: KPIs */}
            <div className="lg:col-span-2 space-y-8">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Balance */}
                    <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm transition-all hover:bg-slate-900/80">
                        <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-emerald-500/5 blur-2xl"></div>
                        <div className="flex items-center gap-2 text-slate-400 mb-2">
                            <Wallet className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-wider">Balance</span>
                        </div>
                        <div className="text-2xl font-bold text-white tracking-tight font-mono">
                            {formatCurrency(totalBalance)}
                        </div>
                    </div>

                    {/* Income */}
                    <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm transition-all hover:bg-slate-900/80">
                        <div className="flex items-center gap-2 text-emerald-500 mb-2">
                            <div className="flex items-center justify-center h-5 w-5 rounded-full bg-emerald-500/10">
                                <TrendingUp className="h-3 w-3" />
                            </div>
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Ingresos</span>
                        </div>
                        <div className="text-xl font-bold text-emerald-400 tracking-tight font-mono">
                            {formatCurrency(totalIncome)}
                        </div>
                    </div>

                    {/* Expenses */}
                    <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm transition-all hover:bg-slate-900/80">
                        <div className="flex items-center gap-2 text-red-400 mb-2">
                            <div className="flex items-center justify-center h-5 w-5 rounded-full bg-red-500/10">
                                <TrendingDown className="h-3 w-3" />
                            </div>
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Gastos</span>
                        </div>
                        <div className="text-xl font-bold text-red-400 tracking-tight font-mono">
                            {formatCurrency(totalExpense)}
                        </div>
                    </div>
                </div>
                
                {/* Placeholder for future content or list summary */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 text-center">
                    <p className="text-sm text-slate-500">
                        Mostrando datos del mes de <span className="font-bold text-slate-300 capitalize">{format(date, 'MMMM', { locale: es })}</span>.
                        Ve a la pestaña &quot;Movimientos&quot; para ver el detalle.
                    </p>
                </div>
            </div>

            {/* Right Column: Charts */}
            <div className="space-y-6">
                <ExpensesChart data={chartData} />
                
                {/* Insight Card */}
                <div className="rounded-xl border border-slate-800 bg-linear-to-br from-slate-900 to-slate-950 p-5">
                    <h3 className="text-sm font-medium text-slate-300 mb-2">Resumen Mensual</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        {totalExpense > totalIncome 
                            ? 'Tus gastos superan tus ingresos este mes. Revisa tus categorías de mayor consumo.' 
                            : '¡Buen trabajo! Estás manteniendo un balance positivo este mes.'}
                    </p>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}
