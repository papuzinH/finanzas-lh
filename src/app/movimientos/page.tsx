import { createClient } from '@/utils/supabase/server';
import { MonthSelector } from '@/components/month-selector';
import { 
  Coffee, 
  ShoppingBag, 
  Home as HomeIcon, 
  Car, 
  Smartphone,
  DollarSign,
  CreditCard,
  Filter
} from 'lucide-react';
import { 
  format, 
  parse, 
  startOfMonth, 
  endOfMonth, 
  isFuture, 
  isThisWeek,
  isSameDay,
  setDate,
  addMonths,
  subMonths
} from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Transaction } from '@/types/database';

// Extended type for the join
interface TransactionWithPayment extends Omit<Transaction, 'payment_method'> {
  payment_methods: {
    name: string;
    type: string;
    default_closing_day: number | null;
    default_payment_day: number | null;
  } | null;
  // Keep the original column if needed, though the join replaces it in usage
  payment_method?: string | null; 
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
  const date = parse(dateString, 'yyyy-MM-dd', new Date());
  return format(date, 'd MMM', { locale: es });
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

const calculatePaymentDate = (transactionDate: Date, closingDay: number, paymentDay: number) => {
  let cycleEndDate: Date;

  // If transaction is before or on closing day, it belongs to the cycle ending this month
  if (transactionDate.getDate() <= closingDay) {
    cycleEndDate = setDate(transactionDate, closingDay);
  } else {
    // Otherwise it belongs to the cycle ending next month
    cycleEndDate = setDate(addMonths(transactionDate, 1), closingDay);
  }

  // Payment is usually the month after the closing date
  // We set the day to paymentDay and month to cycleEndDate's month + 1
  const paymentDate = setDate(addMonths(cycleEndDate, 1), paymentDay);
  
  return paymentDate;
};

export default async function MovimientosPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ month?: string; paymentMethod?: string }> 
}) {
  const params = await searchParams;
  const currentMonth = params.month || format(new Date(), 'yyyy-MM');
  const selectedPaymentMethod = params.paymentMethod || 'all';
  
  const date = parse(currentMonth, 'yyyy-MM', new Date());
  const startDate = format(startOfMonth(date), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(date), 'yyyy-MM-dd');

  const supabase = await createClient();

  // Fetch Payment Methods for Filter
  const { data: paymentMethodsData } = await supabase
    .from('payment_methods')
    .select('name, type')
    .order('name');

  const paymentMethods = paymentMethodsData || [];

  // Fetch Transactions with Join
  let query = supabase
    .from('transactions')
    .select('*, payment_methods (name, type, default_closing_day, default_payment_day)')
    .eq('user_id', 1) // Assuming user_id 1 for now as per previous code
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  // Apply Payment Method Filter
  if (selectedPaymentMethod !== 'all') {
    query = query.eq('payment_methods.name', selectedPaymentMethod);
  }

  const { data: rawTransactions, error } = await query;
  
  if (error) {
    console.error('Error fetching transactions:', error);
  }

  let transactions: TransactionWithPayment[] = (rawTransactions as unknown as TransactionWithPayment[]) || [];

  // In-memory filter if query filter wasn't applied or to be safe
  if (selectedPaymentMethod !== 'all') {
    transactions = transactions.filter(t => t.payment_methods?.name === selectedPaymentMethod);
  }

  // Grouping Logic
  const groups = {
    hoy: [] as TransactionWithPayment[],
    ayer: [] as TransactionWithPayment[],
    semana: [] as TransactionWithPayment[],
    futuro: [] as TransactionWithPayment[],
    pasado: [] as TransactionWithPayment[],
  };

  const today = new Date();
  // Reset time for accurate date comparison
  today.setHours(0, 0, 0, 0);

  // Check if we are viewing a past month
  const currentMonthDate = parse(currentMonth, 'yyyy-MM', new Date());
  const isPastMonth = format(currentMonthDate, 'yyyy-MM') < format(today, 'yyyy-MM');

  transactions.forEach(t => {
    let tDate = parse(t.date, 'yyyy-MM-dd', new Date());
    
    // Logic to adjust date for Credit Card Pending Payments
    // Only apply if we are NOT viewing a past month
    if (
      !isPastMonth &&
      t.payment_methods?.type === 'credit' && 
      t.payment_methods.default_closing_day && 
      t.payment_methods.default_payment_day
    ) {
      const paymentDate = calculatePaymentDate(
        tDate, 
        t.payment_methods.default_closing_day, 
        t.payment_methods.default_payment_day
      );
      
      // If the calculated payment date is in the future (relative to today), 
      // we use it as the display date to show it as "Pending" on the correct due date.
      if (paymentDate > today) {
        tDate = paymentDate;
        // Update the date string for display
        t.date = format(paymentDate, 'yyyy-MM-dd');
      }
    }

    tDate.setHours(0, 0, 0, 0);

    if (isSameDay(tDate, today)) {
      groups.hoy.push(t);
    } else if (isSameDay(tDate, new Date(today.getTime() - 86400000))) { // Yesterday
      groups.ayer.push(t);
    } else if (tDate > today) {
      groups.futuro.push(t);
    } else if (isThisWeek(tDate, { weekStartsOn: 1 })) {
      groups.semana.push(t);
    } else {
      groups.pasado.push(t);
    }
  });

  // Helper to render a section
  const renderSection = (title: string, items: TransactionWithPayment[], colorClass: string = "text-slate-400") => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h3 className={cn("text-sm font-medium mb-3 px-1 flex items-center gap-2", colorClass)}>
          {title}
          <span className="text-xs font-normal opacity-60">({items.length})</span>
        </h3>
        <div className="space-y-2">
          {items.map(t => (
            <TransactionRow key={t.id} transaction={t} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <MonthSelector currentMonth={currentMonth} baseUrl="/movimientos" />
        </div>
        
        {/* Payment Method Filters */}
        <div className="mx-auto max-w-2xl px-4 pb-3 overflow-x-auto no-scrollbar">
          <div className="flex gap-2">
            <Link
              href={`/movimientos?month=${currentMonth}&paymentMethod=all`}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-all border",
                selectedPaymentMethod === 'all'
                  ? "bg-slate-100 text-slate-900 border-slate-100"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200"
              )}
            >
              Todos
            </Link>
            {paymentMethods.map((pm: { name: string; type: string }) => (
              <Link
                key={pm.name}
                href={`/movimientos?month=${currentMonth}&paymentMethod=${encodeURIComponent(pm.name)}`}
                className={cn(
                  "whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-all border flex items-center gap-1.5",
                  selectedPaymentMethod === pm.name
                    ? "bg-slate-100 text-slate-900 border-slate-100"
                    : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200"
                )}
              >
                {pm.type === 'credit' && <CreditCard className="h-3 w-3" />}
                {pm.name}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <div className="h-16 w-16 rounded-full bg-slate-900 flex items-center justify-center mb-4 border border-slate-800">
              <Filter className="h-8 w-8 opacity-50" />
            </div>
            <p>No se encontraron movimientos</p>
          </div>
        ) : (
          <>
            {renderSection('Futuro / Proyección', groups.futuro, "text-amber-500")}
            {renderSection('Hoy', groups.hoy, "text-emerald-400")}
            {renderSection('Ayer', groups.ayer)}
            {renderSection('Esta semana', groups.semana)}
            {renderSection('Pasado', groups.pasado)}
          </>
        )}
      </main>
    </div>
  );
}

function TransactionRow({ transaction }: { transaction: TransactionWithPayment }) {
  const isFutureDate = isFuture(parse(transaction.date, 'yyyy-MM-dd', new Date()));
  const isCredit = transaction.payment_methods?.type === 'credit';

  return (
    <div className="group relative flex items-center justify-between rounded-2xl border border-slate-800/50 bg-slate-900/20 p-3.5 transition-all hover:bg-slate-900/60 hover:border-slate-700">
      {/* Left: Icon */}
      <div className="flex items-center gap-4">
        <div className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full border transition-colors",
          transaction.type === 'income'
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
            : "bg-slate-800/50 border-slate-700/50 text-slate-400 group-hover:text-slate-300"
        )}>
          {getCategoryIcon(transaction.category)}
        </div>

        {/* Center: Info */}
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-sm text-slate-200 line-clamp-1">
            {transaction.description}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            {transaction.payment_methods && (
              <span className="flex items-center gap-1 text-slate-400">
                {isCredit && <CreditCard className="h-3 w-3" />}
                {transaction.payment_methods.name}
              </span>
            )}
            {transaction.payment_methods && <span className="text-slate-700">•</span>}
            <span className="capitalize">{transaction.category || 'Sin categoría'}</span>
          </div>
        </div>
      </div>

      {/* Right: Amount & Status */}
      <div className="flex flex-col items-end gap-0.5">
        <span className={cn(
          "font-bold text-sm font-mono tracking-tight",
          transaction.type === 'income' ? "text-emerald-400" : "text-red-400"
        )}>
          {transaction.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount))}
        </span>
        
        {isFutureDate ? (
          <>
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500 ring-1 ring-inset ring-amber-500/20">
              Pendiente
            </span>
            <span className="text-[10px] text-slate-500">
              {formatDate(transaction.date)}
            </span>
          </>
        ) : (
          <span className="text-xs text-slate-500">
            {formatDate(transaction.date)}
          </span>
        )}
      </div>
    </div>
  );
}
