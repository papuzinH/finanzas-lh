'use client';

import { useEffect, useRef, useState } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { MonthSelector } from '@/components/dashboard/month-selector';
import { isSameDay, isSameMonth, parse, format } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Transaction } from '@/types/database';
import { TransactionItem } from '@/components/shared/transaction-item';
import { ChevronDown, ChevronRight, Search, X, CreditCard, Wallet, Receipt } from 'lucide-react';
import { TransactionListSkeleton } from '@/components/ui/skeletons';
import { Button } from '@/components/ui/button';
import { CreateTransactionDialog } from '@/components/transactions/create-transaction-dialog';
import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';
import { QuickAdd } from '@/components/transactions/quick-add';
import { AnimatePresence, motion } from 'framer-motion';
import { StaggeredList, StaggeredItem } from '@/components/shared/staggered-list';

interface TransactionWithPeriod extends Transaction {
  periodDate?: string;
}

export default function MovimientosPage() {
  const [isFutureOpen, setIsFutureOpen] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- FILTRADO Y AGRUPACIÓN ---

  const currentMonthDate = parse(currentMonthStr, 'yyyy-MM', new Date());

  const filteredTransactions = transactions.filter(t => {
    // CAMBIO CLAVE: Usamos 'periodDate' (la fecha virtual del store) si existe
    // Si no existe (porque t no es del store modificado o es legacy), fallback a t.date
    const visualDateStr = (t as TransactionWithPeriod).periodDate || t.date;
    // Parsear como fecha LOCAL
    const localVisualDate = parseLocalDate(visualDateStr);

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

  // Búsqueda sobre los ya filtrados
  const searchFilteredTransactions = debouncedQuery
    ? filteredTransactions.filter(t => {
        const q = debouncedQuery.toLowerCase();
        const cat = categories.find(c => c.id === t.category_id);
        return (
          t.description?.toLowerCase().includes(q) ||
          cat?.name.toLowerCase().includes(q) ||
          t.amount.toString().includes(q)
        );
      })
    : filteredTransactions;

  // Agrupación por días/estado
  const groups: Record<string, Transaction[]> = {
    futuro: [],
    hoy: [],
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  searchFilteredTransactions.forEach(t => {
    // Parsear como fecha LOCAL y luego usar para comparación de días
    const tDateOnly = parseLocalDate(t.date);
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
             isOpen ? <ChevronDown className="h-3 w-3 text-slate-400" aria-hidden="true" /> : <ChevronRight className="h-3 w-3 text-slate-400" aria-hidden="true" />
          )}
        </div>
        
        {(!collapsible || isOpen) && (
          <StaggeredList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map(t => {
              const paymentMethod = paymentMethods.find(pm => pm.id === t.payment_method_id);
              return (
                <StaggeredItem key={t.id}>
                  <TransactionItem
                    transaction={t}
                    paymentMethodName={paymentMethod?.name}
                    paymentMethodType={paymentMethod?.type}
                  />
                </StaggeredItem>
              );
            })}
          </StaggeredList>
        )}
      </div>
    );
  };

  if (isLoading && !isInitialized) {
    return <TransactionListSkeleton />;
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] text-slate-50 font-sans pb-24">
      {/* Header Sticky */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-[var(--surface)]/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 py-2 flex flex-col md:flex-row justify-between items-center gap-2 md:gap-0">
          
          
          <div className="flex items-center justify-between w-full md:w-auto md:flex md:items-center md:gap-4 border-b border-slate-800/50 py-2 pb-4 md:border-0 md:pt-0">
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
            <AnimatedPlusButton
              label="Crear transacción"
              onClick={() => setIsCreateOpen(true)}
              ariaLabel="Nueva transacción"
            />
          </div>
          <MonthSelector currentMonth={currentMonthStr} baseUrl="/movimientos" />
        </div>

        {/* Buscador + Chips integrados */}
        <div className="mx-auto max-w-[1440px] px-4 pb-3 pt-2" ref={searchContainerRef}>
          {/* Input de búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowFilters(true)}
              placeholder="Buscar o filtrar movimientos..."
              className={cn(
                "w-full bg-[var(--surface-overlay)]/50 border rounded-xl pl-9 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none transition-colors",
                showFilters
                  ? "border-indigo-500/50 ring-1 ring-indigo-500/20 rounded-b-none border-b-transparent"
                  : "border-slate-800"
              )}
            />
            {/* Indicador de filtros activos */}
            {!showFilters && (selectedPaymentMethodId !== 'all' || selectedCategoryId !== 'all') && (
              <span className="absolute right-9 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-indigo-400" />
            )}
            {searchQuery && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-300 transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Panel de filtros expandible */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="overflow-hidden border border-t-0 border-indigo-500/50 ring-1 ring-indigo-500/20 rounded-b-xl bg-[var(--surface)]/95 backdrop-blur-sm"
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="px-3 pt-3 pb-2 flex flex-col gap-2.5">
                  {/* Medios de pago */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5 px-0.5">Medio de pago</p>
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => handleFilterChange('paymentMethod', 'all')}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border whitespace-nowrap shrink-0 transition-colors",
                          selectedPaymentMethodId === 'all'
                            ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-300"
                            : "bg-[var(--surface-overlay)]/50 border-slate-800 text-slate-400 hover:text-slate-200"
                        )}
                      >
                        <Wallet className="h-3 w-3" />
                        Todos
                      </motion.button>
                      {paymentMethods.map((pm) => {
                        const isActive = selectedPaymentMethodId === pm.id.toString();
                        const Icon = pm.type === 'credit' ? CreditCard : Wallet;
                        return (
                          <motion.button
                            key={pm.id}
                            whileTap={{ scale: 0.92 }}
                            onClick={() => handleFilterChange('paymentMethod', pm.id.toString())}
                            className={cn(
                              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border whitespace-nowrap shrink-0 transition-colors",
                              isActive
                                ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-300"
                                : "bg-[var(--surface-overlay)]/50 border-slate-800 text-slate-400 hover:text-slate-200"
                            )}
                          >
                            <Icon className="h-3 w-3" />
                            {pm.name}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Categorías */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5 px-0.5">Categoría</p>
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => handleFilterChange('category', 'all')}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border whitespace-nowrap shrink-0 transition-colors",
                          selectedCategoryId === 'all'
                            ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-300"
                            : "bg-[var(--surface-overlay)]/50 border-slate-800 text-slate-400 hover:text-slate-200"
                        )}
                      >
                        <span>🏷️</span>
                        Todas
                      </motion.button>
                      {categories.map((cat) => {
                        const isActive = selectedCategoryId === cat.id;
                        return (
                          <motion.button
                            key={cat.id}
                            whileTap={{ scale: 0.92 }}
                            onClick={() => handleFilterChange('category', cat.id)}
                            className={cn(
                              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border whitespace-nowrap shrink-0 transition-colors",
                              isActive
                                ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-300"
                                : "bg-[var(--surface-overlay)]/50 border-slate-800 text-slate-400 hover:text-slate-200"
                            )}
                          >
                            <span>{cat.emoji}</span>
                            {cat.name}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer del panel */}
                  <div className="flex items-center justify-between pt-0.5 pb-1">
                    {debouncedQuery && (
                      <p className="text-xs text-slate-400 px-0.5">
                        {searchFilteredTransactions.length}{' '}
                        movimiento{searchFilteredTransactions.length !== 1 ? 's' : ''} encontrado{searchFilteredTransactions.length !== 1 ? 's' : ''}
                      </p>
                    )}
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
                        className="h-7 text-[10px] uppercase font-bold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 px-2 ml-auto"
                      >
                        Limpiar filtros
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Resultado de búsqueda fuera del panel */}
          {!showFilters && debouncedQuery && (
            <p className="text-xs text-slate-400 mt-1.5 px-1">
              {searchFilteredTransactions.length}{' '}
              movimiento{searchFilteredTransactions.length !== 1 ? 's' : ''} encontrado{searchFilteredTransactions.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </header>

      <CreateTransactionDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <main className="mx-auto max-w-[1440px] px-4 py-6">
        <div className="mb-4">
          <QuickAdd />
        </div>
        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-slate-800 bg-[var(--surface-raised)]/20 text-center">
            <Receipt className="h-16 w-16 text-slate-700 mb-4" />
            <h3 className="text-lg font-semibold text-slate-200 mb-2">Registrá tus movimientos</h3>
            <p className="text-sm text-slate-400 max-w-xs mb-6">
              Llevá un registro de tus ingresos y gastos para saber exactamente a dónde va tu plata cada mes.
            </p>
            <AnimatedPlusButton
              label="Agregar movimiento"
              onClick={() => setIsCreateOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 h-auto"
            />
          </div>
        ) : searchFilteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-slate-800 bg-[var(--surface-raised)]/20 text-center">
            <Search className="h-16 w-16 text-slate-700 mb-4" />
            <h3 className="text-base font-semibold text-slate-200 mb-1">Sin resultados para &ldquo;{debouncedQuery}&rdquo;</h3>
            <p className="text-sm text-slate-400">Probá con otra descripción, categoría o monto.</p>
          </div>
        ) : (
          <>
            {renderSection('Hoy', groups.hoy, "text-emerald-400")}
            
            {pastDates.map(dateKey => {
              // Parsear la fecha string como LOCAL
              const localDate = parseLocalDate(dateKey);
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