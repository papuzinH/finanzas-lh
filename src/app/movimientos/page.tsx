'use client';

import { useEffect, useState } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { MonthSelector } from '@/components/dashboard/month-selector';
import { parseISO, isThisWeek, isSameDay, isSameMonth, parse, format } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Transaction } from '@/types/database';
import { TransactionItem } from '@/components/shared/transaction-item';
import { Filter, CreditCard, Wallet, ChevronDown, ChevronRight } from 'lucide-react';
import { FullPageLoader } from '@/components/shared/loader';

export default function MovimientosPage() {
  const [isFutureOpen, setIsFutureOpen] = useState(true);
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

  // Cálculo del Balance Mensual (Suma de todos los movimientos filtrados)
  const monthlyBalance = filteredTransactions.reduce((acc, t) => acc + Number(t.amount), 0);

  // Helper de renderizado
  const renderSection = (
    title: string, 
    items: Transaction[], 
    colorClass: string = "text-slate-400",
    collapsible: boolean = false,
    isOpen: boolean = true,
    onToggle?: () => void
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div 
          className={cn(
            "flex items-center gap-2 mb-3 px-1 select-none", 
            collapsible ? "cursor-pointer hover:opacity-80" : ""
          )}
          onClick={collapsible ? onToggle : undefined}
        >
          <h3 className={cn("text-xs font-semibold uppercase tracking-wider flex items-center gap-2", colorClass)}>
            {title}
            <span className="text-[10px] font-normal opacity-60 bg-slate-800 px-1.5 py-0.5 rounded-full">
              {items.length}
            </span>
          </h3>
          {collapsible && (
             isOpen ? <ChevronDown className="h-3 w-3 text-slate-500" /> : <ChevronRight className="h-3 w-3 text-slate-500" />
          )}
        </div>
        
        {(!collapsible || isOpen) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map(t => {
              const paymentMethod = paymentMethods.find(pm => pm.id === t.payment_method_id);
              return (
                <TransactionItem 
                  key={t.id} 
                  transaction={t} 
                  paymentMethodName={paymentMethod?.name}
                  paymentMethodType={paymentMethod?.type}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (isLoading && !isInitialized) {
    return <FullPageLoader text="Cargando movimientos..." />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans pb-24">
      {/* Header Sticky */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 py-2 flex flex-col md:flex-row justify-between items-center gap-2 md:gap-0">
          <MonthSelector currentMonth={currentMonthStr} baseUrl="/movimientos" />
          
          <div className="flex items-center justify-between w-full md:w-auto md:block md:text-right border-t border-slate-800/50 pt-2 md:border-0 md:pt-0">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider md:hidden">Balance Total</span>
            <div className="text-right">
              <p className="hidden md:block text-[10px] text-slate-400 uppercase tracking-wider font-medium">Balance Mensual</p>
              <p className={cn(
                "text-lg font-bold font-mono leading-none",
                monthlyBalance >= 0 ? "text-emerald-400" : "text-red-400"
              )}>
                {formatCurrency(monthlyBalance)}
              </p>
            </div>
          </div>
        </div>

        {/* Filtros de Medios de Pago (Chips con scroll horizontal) */}
        <div className="mx-auto max-w-[1440px] px-4 pb-3 overflow-x-auto no-scrollbar">
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

      <main className="mx-auto max-w-[1440px] px-4 py-6">
        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 opacity-60">
            <div className="h-20 w-20 rounded-full bg-slate-900 flex items-center justify-center mb-4 border border-slate-800">
              <Filter className="h-10 w-10 opacity-40" />
            </div>
            <p>No hay movimientos en este filtro</p>
          </div>
        ) : (
          <>
            {renderSection('Hoy', groups.hoy, "text-emerald-400")}
            {renderSection('Ayer', groups.ayer, "text-indigo-400")}
            {renderSection('Esta semana', groups.semana)}
            {renderSection('Anteriores', groups.pasado)}
            {renderSection('Proyección Futura', groups.futuro, "text-amber-500", true, isFutureOpen, () => setIsFutureOpen(!isFutureOpen))}
          </>
        )}
      </main>
    </div>
  );
}