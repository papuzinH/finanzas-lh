import { createClient } from '@/utils/supabase/server';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Coffee, 
  ShoppingBag, 
  Home as HomeIcon, 
  Car, 
  Smartphone,
} from 'lucide-react';
import { isToday, isYesterday, isThisWeek, parseISO } from 'date-fns';
import ExpensesChart from './components/ExpensesChart';

interface Transaction {
  id: number;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: 'income' | 'expense';
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
};

const getCategoryIcon = (category: string) => {
  const cat = category?.toLowerCase() || '';
  if (cat.includes('comida') || cat.includes('food') || cat.includes('restaurante')) return <Coffee className="h-5 w-5" />;
  if (cat.includes('compra') || cat.includes('shopping') || cat.includes('super')) return <ShoppingBag className="h-5 w-5" />;
  if (cat.includes('casa') || cat.includes('hogar') || cat.includes('alquiler')) return <HomeIcon className="h-5 w-5" />;
  if (cat.includes('auto') || cat.includes('transporte') || cat.includes('uber')) return <Car className="h-5 w-5" />;
  if (cat.includes('celular') || cat.includes('internet') || cat.includes('teléfono')) return <Smartphone className="h-5 w-5" />;
  return <DollarSign className="h-5 w-5" />;
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

export default async function Home() {
  const supabase = await createClient();

  const { data: rawTransactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', 1)
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

  // Grouping Transactions
  const groupedTransactions = transactions.reduce((groups, transaction) => {
    const date = parseISO(transaction.date);
    let key = 'Anteriores';
    
    if (isToday(date)) key = 'Hoy';
    else if (isYesterday(date)) key = 'Ayer';
    else if (isThisWeek(date)) key = 'Esta Semana';

    if (!groups[key]) {
      groups[key] = { transactions: [], total: 0 };
    }
    
    groups[key].transactions.push(transaction);
    if (transaction.type === 'expense' || (transaction.amount < 0 && transaction.type !== 'income')) {
        groups[key].total += Math.abs(transaction.amount);
    }
    
    return groups;
  }, {} as Record<string, { transactions: Transaction[], total: number }>);

  const groupOrder = ['Hoy', 'Ayer', 'Esta Semana', 'Anteriores'];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <Wallet className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-100">Mi Billetera</h1>
          </div>
          <div className="h-9 w-9 overflow-hidden rounded-full border border-slate-700 bg-slate-800 ring-2 ring-slate-800 transition-all hover:ring-slate-700">
             <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-400 bg-linear-to-br from-slate-800 to-slate-900">
                AD
             </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Summary & List */}
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

                {/* Transactions List */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-200">Movimientos</h2>
                        <button className="text-xs font-medium text-emerald-500 hover:text-emerald-400 transition-colors">Ver todos</button>
                    </div>
                    
                    {transactions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-slate-500">
                            <div className="mb-3 rounded-full bg-slate-800 p-3">
                            <DollarSign className="h-6 w-6 text-slate-600" />
                            </div>
                            <p>No hay transacciones registradas.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {groupOrder.map((groupKey) => {
                                const group = groupedTransactions[groupKey];
                                if (!group) return null;

                                return (
                                    <div key={groupKey} className="space-y-3">
                                        <div className="flex items-center justify-between px-1">
                                            <h3 className="text-sm font-medium text-slate-400">{groupKey}</h3>
                                            {group.total > 0 && (
                                                <span className="text-xs font-mono text-slate-500">
                                                    Total gastado: {formatCurrency(group.total)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            {group.transactions.map((t) => (
                                                <div key={t.id} className="group flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/40 p-3 transition-all hover:bg-slate-900 hover:border-slate-700 hover:shadow-md hover:shadow-black/20">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 ${
                                                            t.type === 'income' 
                                                                ? 'bg-emerald-500/5 text-emerald-500 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/20' 
                                                                : 'bg-slate-800/50 text-slate-400 group-hover:bg-slate-800 group-hover:text-slate-300'
                                                        } transition-colors`}>
                                                            {getCategoryIcon(t.category)}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-sm text-slate-200 group-hover:text-white transition-colors">{t.description}</p>
                                                            <p className="text-xs text-slate-500 capitalize">{t.category}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={`font-bold text-sm font-mono tracking-tight ${
                                                            t.type === 'income' ? 'text-emerald-400' : 'text-slate-200'
                                                        }`}>
                                                            {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                                                        </p>
                                                        <p className="text-xs text-slate-500 mt-0.5">{formatDate(t.date)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Charts & Extras */}
            <div className="space-y-6">
                <ExpensesChart data={chartData} />
                
                {/* Quick Actions or Promo (Placeholder) */}
                <div className="rounded-xl border border-slate-800 bg-linear-to-br from-slate-900 to-slate-950 p-5">
                    <h3 className="text-sm font-medium text-slate-300 mb-2">Consejo Financiero</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        Tus gastos en comida han aumentado un 15% esta semana. Considera cocinar en casa para ahorrar.
                    </p>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}
