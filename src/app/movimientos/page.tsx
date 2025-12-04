'use client';

import { useEffect } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { MonthSelector } from '@/components/month-selector';
import {
  Coffee,
  ShoppingBag,
  Home as HomeIcon,
  Car,
  Smartphone,
  DollarSign,
  CreditCard,
  Filter,
  Wallet
} from 'lucide-react';
import {
  format,
  parseISO,
  isFuture,
  isThisWeek,
  isSameDay,
  isSameMonth,
  parse
} from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Transaction, PaymentMethod } from '@/types/database';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  const date = parseISO(dateString);
  return format(date, 'd MMM', { locale: es });
};

const getCategoryIcon = (category: string | null) => {
  const cat = category?.toLowerCase() || '';
  if (cat.includes('comida') || cat.includes('delivery') || cat.includes('restaurant')) return <Coffee className="h-5 w-5" />;
  if (cat.includes('compra') || cat.includes('super') || cat.includes('ropa')) return <ShoppingBag className="h-5 w-5" />;
  if (cat.includes('casa') || cat.includes('alquiler') || cat.includes('servicios')) return <HomeIcon className="h-5 w-5" />;
  if (cat.includes('transporte') || cat.includes('auto') || cat.includes('viajes')) return <Car className="h-5 w-5" />;
  if (cat.includes('internet') || cat.includes('celular') || cat.includes('tecnología')) return <Smartphone className="h-5 w-5" />;
  return <DollarSign className="h-5 w-5" />;
};

export default function MovimientosPage() {
  const {
    transactions,
    paymentMethods,
    fetchAllData,
    isInitialized,
    isLoading
  } = useFinanceStore();

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Obtener params de la URL o defaults
  const currentMonthStr = searchParams.get('month') || format(new Date(), 'yyyy-MM');
  const selectedPaymentMethodId = searchParams.get('paymentMethod') || 'all';

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  // --- FILTRADO Y AGRUPACIÓN ---

  const currentMonthDate = parse(currentMonthStr, 'yyyy-MM', new Date());

  const filteredTransactions = transactions.filter(t => {
    // CAMBIO CLAVE: Usamos 'periodDate' (la fecha virtual del store) si existe
    // Si no existe (porque t no es del store modificado o es legacy), fallback a t.date
    const visualDateStr = (t as any).periodDate || t.date;
    const visualDate = parseISO(visualDateStr);

    // 1. Filtro de Mes (Ahora compara contra el mes visual/resumen)
    const isMonthMatch = isSameMonth(visualDate, currentMonthDate);

    // 2. Filtro de Medio de Pago
    let isMethodMatch = true;
    if (selectedPaymentMethodId !== 'all') {
      isMethodMatch = t.payment_method_id === Number(selectedPaymentMethodId);
    }

    return isMonthMatch && isMethodMatch;
  });

  // Agrupación por días/estado
  const groups = {
    futuro: [] as Transaction[],
    hoy: [] as Transaction[],
    ayer: [] as Transaction[],
    semana: [] as Transaction[],
    pasado: [] as Transaction[],
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  filteredTransactions.forEach(t => {
    // Usamos una fecha con ajuste de zona horaria local para comparar días correctamente
    const tDate = parseISO(t.date);

    if (tDate > today && !isSameDay(tDate, today)) {
      groups.futuro.push(t);
    } else if (isSameDay(tDate, today)) {
      groups.hoy.push(t);
    } else if (isSameDay(tDate, new Date(today.getTime() - 86400000))) {
      groups.ayer.push(t);
    } else if (isThisWeek(tDate, { weekStartsOn: 1 })) {
      groups.semana.push(t);
    } else {
      groups.pasado.push(t);
    }
  });

  // Función para actualizar filtros en URL
  const handlePaymentFilter = (methodId: string) => {
    const params = new URLSearchParams(searchParams);
    if (methodId === 'all') {
      params.delete('paymentMethod');
    } else {
      params.set('paymentMethod', methodId);
    }
    router.replace(`${pathname}?${params.toString()}`);
  };

  console.log('Grupos de movimientos:', groups);

  // Helper de renderizado
  const renderSection = (title: string, items: Transaction[], colorClass: string = "text-slate-400") => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <h3 className={cn("text-xs font-semibold uppercase tracking-wider mb-3 px-1 flex items-center gap-2", colorClass)}>
          {title}
          <span className="text-[10px] font-normal opacity-60 bg-slate-800 px-1.5 py-0.5 rounded-full">
            {items.length}
          </span>
        </h3>
        <div className="space-y-2">
          {items.map(t => (
            <TransactionRow key={t.id} transaction={t} paymentMethods={paymentMethods} />
          ))}
        </div>
      </div>
    );
  };

  if (isLoading && !isInitialized) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 animate-pulse">Cargando movimientos...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans pb-24">
      {/* Header Sticky */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <MonthSelector currentMonth={currentMonthStr} baseUrl="/movimientos" />
        </div>

        {/* Filtros de Medios de Pago (Chips con scroll horizontal) */}
        <div className="mx-auto max-w-2xl px-4 pb-3 overflow-x-auto no-scrollbar">
          <div className="flex gap-2">
            <button
              onClick={() => handlePaymentFilter('all')}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-all border flex items-center gap-1.5",
                selectedPaymentMethodId === 'all'
                  ? "bg-indigo-500 text-white border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200"
              )}
            >
              <Filter className="h-3 w-3" />
              Todos
            </button>

            {paymentMethods.map((pm) => (
              <button
                key={pm.id}
                onClick={() => handlePaymentFilter(pm.id.toString())}
                className={cn(
                  "whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-all border flex items-center gap-1.5",
                  selectedPaymentMethodId === pm.id.toString()
                    ? "bg-indigo-500 text-white border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]"
                    : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200"
                )}
              >
                {pm.type === 'credit' ? <CreditCard className="h-3 w-3" /> : <Wallet className="h-3 w-3" />}
                {pm.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 opacity-60">
            <div className="h-20 w-20 rounded-full bg-slate-900 flex items-center justify-center mb-4 border border-slate-800">
              <Filter className="h-10 w-10 opacity-40" />
            </div>
            <p>No hay movimientos en este filtro</p>
          </div>
        ) : (
          <>
            {renderSection('Proyección Futura', groups.futuro, "text-amber-500")}
            {renderSection('Hoy', groups.hoy, "text-emerald-400")}
            {renderSection('Ayer', groups.ayer, "text-indigo-400")}
            {renderSection('Esta semana', groups.semana)}
            {renderSection('Anteriores', groups.pasado)}
          </>
        )}
      </main>
    </div>
  );
}

// Componente de Fila optimizado
function TransactionRow({ transaction, paymentMethods }: { transaction: Transaction, paymentMethods: PaymentMethod[] }) {
  const isFutureDate = isFuture(parseISO(transaction.date));
  const isIncome = transaction.type === 'income';

  // Buscar el nombre del medio de pago localmente
  const paymentMethod = paymentMethods.find(pm => pm.id === transaction.payment_method_id);
  const isCredit = paymentMethod?.type === 'credit';

  return (
    <div className="group relative flex items-center justify-between rounded-xl border border-slate-800/40 bg-slate-900/20 p-3 transition-all hover:bg-slate-900/60 hover:border-slate-700 hover:shadow-lg hover:shadow-black/20">

      {/* Left: Icon & Info */}
      <div className="flex items-center gap-3 overflow-hidden">
        <div className={cn(
          "flex h-10 w-10 min-w-10 items-center justify-center rounded-full border transition-colors",
          isIncome
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
            : "bg-slate-800/50 border-slate-700/50 text-slate-400 group-hover:text-slate-300"
        )}>
          {getCategoryIcon(transaction.category)}
        </div>

        <div className="flex flex-col min-w-0">
          <span className="font-medium text-sm text-slate-200 truncate">
            {transaction.description}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
            {paymentMethod && (
              <span className="flex items-center gap-1 text-slate-400">
                {isCredit && <CreditCard className="h-2.5 w-2.5" />}
                {paymentMethod.name}
              </span>
            )}
            {paymentMethod && <span className="text-slate-700">•</span>}
            <span className="capitalize">{transaction.category || 'Varios'}</span>
          </div>
        </div>
      </div>

      {/* Right: Amount & Status */}
      <div className="flex flex-col items-end gap-0.5 pl-2">
        <span className={cn(
          "font-bold text-sm font-mono tracking-tight whitespace-nowrap",
          isIncome ? "text-emerald-400" : "text-slate-200"
        )}>
          {isIncome ? '+' : ''} {formatCurrency(Math.abs(transaction.amount))}
        </span>

        {isFutureDate ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-amber-500/80 font-medium">
              {formatDate(transaction.date)}
            </span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          </div>
        ) : (
          <span className="text-[10px] text-slate-500">
            {formatDate(transaction.date)}
          </span>
        )}
      </div>
    </div>
  );
}