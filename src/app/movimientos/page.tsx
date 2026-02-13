'use client';

import { useEffect, useState } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { MonthSelector } from '@/components/dashboard/month-selector';
import { parseISO, isSameDay, isSameMonth, parse, format } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Transaction } from '@/types/database';
import { TransactionItem } from '@/components/shared/transaction-item';
import { Filter, CreditCard, ChevronDown, ChevronRight, Tag, Plus } from 'lucide-react';
import { FullPageLoader } from '@/components/shared/loader';
import { Button } from '@/components/ui/button';
import { CreateTransactionDialog } from '@/components/transactions/create-transaction-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TransactionWithPeriod extends Transaction {
  periodDate?: string;
}

export default function MovimientosPage() {
  const [isFutureOpen, setIsFutureOpen] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const {
    transactions,
    paymentMethods,
    categories,
    fetchAllData,
    isInitialized,
    isLoading,
    getMonthlyBalance
  } = useFinanceStore();

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Obtener params de la URL o defaults
  const currentMonthStr = searchParams.get('month') || format(new Date(), 'yyyy-MM');
  const selectedPaymentMethodId = searchParams.get('paymentMethod') || 'all';
  const selectedCategoryId = searchParams.get('category') || 'all';

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
    const visualDateStr = (t as TransactionWithPeriod).periodDate || t.date;
    const visualDate = parseISO(visualDateStr);
    // Ajuste para evitar el desfase de zona horaria (UTC -> Local)
    const localVisualDate = new Date(visualDate.getTime() + visualDate.getTimezoneOffset() * 60000);

    // 1. Filtro de Mes (Ahora compara contra el mes visual/resumen)
    const isMonthMatch = isSameMonth(localVisualDate, currentMonthDate);

    // 2. Filtro de Medio de Pago
    let isMethodMatch = true;
    if (selectedPaymentMethodId !== 'all') {
      isMethodMatch = t.payment_method_id?.toString() === selectedPaymentMethodId;
    }

    // 3. Filtro de Categoría
    let isCategoryMatch = true;
    if (selectedCategoryId !== 'all') {
      isCategoryMatch = t.category_id === selectedCategoryId;
    }

    return isMonthMatch && isMethodMatch && isCategoryMatch;
  });

  // Agrupación por días/estado
  const groups: Record<string, Transaction[]> = {
    futuro: [],
    hoy: [],
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  filteredTransactions.forEach(t => {
    // Usamos una fecha con ajuste de zona horaria local para comparar días correctamente
    const tDate = parseISO(t.date);
    // Ajuste para evitar el desfase de zona horaria (UTC -> Local)
    const tDateOnly = new Date(tDate.getTime() + tDate.getTimezoneOffset() * 60000);
    tDateOnly.setHours(0, 0, 0, 0);

    if (tDateOnly > today) {
      groups.futuro.push(t);
    } else if (isSameDay(tDateOnly, today)) {
      groups.hoy.push(t);
    } else {
      const dateKey = format(tDateOnly, 'yyyy-MM-dd');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(t);
    }
  });

  // Obtener las fechas pasadas ordenadas descendente
  const pastDates = Object.keys(groups)
    .filter(key => key !== 'futuro' && key !== 'hoy')
    .sort((a, b) => b.localeCompare(a));

  // Función para actualizar filtros en URL
  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === 'all') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`);
  };

  // Cálculo del Balance Mensual (Suma de todos los movimientos filtrados)
  const monthlyBalance = getMonthlyBalance(currentMonthStr, selectedPaymentMethodId);

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
          
          <div className="flex items-center justify-between w-full md:w-auto md:flex md:items-center md:gap-4 border-t border-slate-800/50 pt-2 md:border-0 md:pt-0">
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
            <Button
              onClick={() => setIsCreateOpen(true)}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1" />
              Nuevo
            </Button>
          </div>
        </div>

        <div className="mx-auto max-w-[1440px] px-4 py-3 flex flex-wrap gap-3 items-center overflow-x-auto">
          <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-800 rounded-lg px-2 py-1 min-w-0 flex-wrap sm:flex-nowrap">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mr-1">Filtros</span>
            
            {/* Medio de Pago */}
            <Select 
              value={selectedPaymentMethodId} 
              onValueChange={(val) => handleFilterChange('paymentMethod', val)}
            >
              <SelectTrigger className="h-8 w-[120px] sm:w-[140px] bg-transparent border-none focus:ring-0 text-xs text-slate-300 hover:text-white transition-colors">
                <div className="flex items-center gap-2 truncate">
                  <CreditCard className="h-3 w-3 shrink-0" />
                  <SelectValue placeholder="Medio de Pago" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                <SelectItem value="all">Todos los medios</SelectItem>
                {paymentMethods.map((pm) => (
                  <SelectItem key={pm.id} value={pm.id.toString()}>
                    {pm.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="w-px h-4 bg-slate-800 mx-1" />

            {/* Categoría */}
            <Select 
              value={selectedCategoryId} 
              onValueChange={(val) => handleFilterChange('category', val)}
            >
              <SelectTrigger className="h-8 w-[120px] sm:w-[140px] bg-transparent border-none focus:ring-0 text-xs text-slate-300 hover:text-white transition-colors">
                <div className="flex items-center gap-2 truncate">
                  <Tag className="h-3 w-3 shrink-0" />
                  <SelectValue placeholder="Categoría" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.emoji} {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(selectedPaymentMethodId !== 'all' || selectedCategoryId !== 'all') && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.delete('paymentMethod');
                params.delete('category');
                router.replace(`${pathname}?${params.toString()}`);
              }}
              className="h-8 text-[10px] uppercase font-bold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
            >
              Limpiar Filtros
            </Button>
          )}
        </div>
      </header>

      <CreateTransactionDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

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
            
            {pastDates.map(dateKey => {
              const date = parseISO(dateKey);
              // Ajuste para evitar el desfase de zona horaria
              const localDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
              const title = new Intl.DateTimeFormat('es-AR', { 
                day: 'numeric', 
                month: 'long' 
              }).format(localDate);
              
              return (
                <div key={dateKey}>
                  {renderSection(title, groups[dateKey])}
                </div>
              );
            })}

            {renderSection('Proyección Futura', groups.futuro, "text-amber-500", true, isFutureOpen, () => setIsFutureOpen(!isFutureOpen))}
          </>
        )}
      </main>
    </div>
  );
}