import { createClient } from '@/utils/supabase/server';
import { MonthSelector } from '@/components/month-selector';
import { 
  Coffee, 
  ShoppingBag, 
  Home as HomeIcon, 
  Car, 
  Smartphone,
  DollarSign,
  LayoutList
} from 'lucide-react';
import { format, parse, startOfMonth, endOfMonth, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { Transaction } from '@/types/database';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  const date = parse(dateString, 'yyyy-MM-dd', new Date());
  return format(date, 'dd/MM');
};

const getCategoryIcon = (category: string | null) => {
  const cat = category?.toLowerCase() || '';
  if (cat.includes('comida') || cat.includes('food') || cat.includes('restaurante')) return <Coffee className="h-5 w-5" />;
  if (cat.includes('compra') || cat.includes('shopping') || cat.includes('super')) return <ShoppingBag className="h-5 w-5" />;
  if (cat.includes('casa') || cat.includes('hogar') || cat.includes('alquiler')) return <HomeIcon className="h-5 w-5" />;
  if (cat.includes('auto') || cat.includes('transporte') || cat.includes('uber')) return <Car className="h-5 w-5" />;
  if (cat.includes('celular') || cat.includes('internet') || cat.includes('teléfono')) return <Smartphone className="h-5 w-5" />;
  return <DollarSign className="h-5 w-5" />;
};

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<{ month?: string; filter?: string }> }) {
  const params = await searchParams;
  const currentMonth = params.month || format(new Date(), 'yyyy-MM');
  const currentFilter = params.filter || 'all';
  
  // Date range calculation
  const date = parse(currentMonth, 'yyyy-MM', new Date());
  const startDate = format(startOfMonth(date), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(date), 'yyyy-MM-dd');

  const supabase = await createClient();

  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', 1)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  if (currentFilter === 'income') {
    query = query.eq('type', 'income');
  } else if (currentFilter === 'expense') {
    query = query.eq('type', 'expense');
  }

  const { data: rawTransactions } = await query;

  const transactions: Transaction[] = rawTransactions || [];

  // Grouping Transactions by Day
  const groupedTransactions = transactions.reduce((groups, transaction) => {
    const dateObj = parse(transaction.date, 'yyyy-MM-dd', new Date());
    const key = format(dateObj, 'yyyy-MM-dd');
    
    if (!groups[key]) {
      groups[key] = { 
        date: dateObj,
        transactions: [] 
      };
    }
    
    groups[key].transactions.push(transaction);
    return groups;
  }, {} as Record<string, { date: Date, transactions: Transaction[] }>);

  // Sort groups by date descending (keys are yyyy-MM-dd so string sort works)
  const sortedGroupKeys = Object.keys(groupedTransactions).sort().reverse();

  const getDayLabel = (date: Date) => {
    if (isToday(date)) return 'Hoy';
    if (isYesterday(date)) return 'Ayer';
    return format(date, 'EEE d', { locale: es }); // e.g., "Lun 12"
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-6">
            <MonthSelector currentMonth={currentMonth} baseUrl="/movimientos" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
              <LayoutList className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-100">Movimientos</h1>
        </div>

        {/* Filter Tabs */}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-900/50 p-1 border border-slate-800 mb-8">
            {[
                { id: 'all', label: 'Todos' },
                { id: 'income', label: 'Ingresos' },
                { id: 'expense', label: 'Gastos' },
            ].map((tab) => {
                const isActive = currentFilter === tab.id;
                return (
                    <Link
                        key={tab.id}
                        href={`/movimientos?month=${currentMonth}&filter=${tab.id}`}
                        className={`flex items-center justify-center rounded-lg py-2 text-sm font-medium transition-all ${
                            isActive 
                                ? 'bg-slate-800 text-white shadow-sm' 
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                        }`}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </div>

        {/* Transactions List */}
        <div className="space-y-8">
            {transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-slate-500">
                    <DollarSign className="h-8 w-8 mb-3 opacity-50" />
                    <p>No hay movimientos en este período.</p>
                </div>
            ) : (
                sortedGroupKeys.map((dateKey) => {
                    const group = groupedTransactions[dateKey];
                    return (
                        <div key={dateKey} className="space-y-3">
                            <h3 className="text-sm font-medium text-slate-400 capitalize px-1">
                                {getDayLabel(group.date)}
                            </h3>
                            <div className="space-y-2">
                                {group.transactions.map((t) => (
                                    <div key={t.id} className="group flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/40 p-3 transition-all hover:bg-slate-900 hover:border-slate-700">
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
                                                t.type === 'income' ? 'text-emerald-400' : 'text-red-400'
                                            }`}>
                                                {t.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(t.amount))}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-0.5">{formatDate(t.date)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
      </main>
    </div>
  );
}
