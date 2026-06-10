'use client';

import { useEffect, useState } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { MonthSelector } from '@/components/dashboard/month-selector';
import { isSameDay, isSameMonth, parse, format } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Transaction } from '@/types/database';
import { TransactionItem } from '@/components/shared/transaction-item';
import { ChevronDown, ChevronRight, Search, X, Receipt, RefreshCw, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { updateExchangeRates } from '@/app/movimientos/actions';
import { TransactionListSkeleton } from '@/components/ui/skeletons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreateTransactionDialog } from '@/components/transactions/create-transaction-dialog';
import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';
import { Chip } from '@/components/ui/chip';

interface TransactionWithPeriod extends Transaction {
  periodDate?: string;
}

export default function MovimientosPage() {
  const [isFutureOpen, setIsFutureOpen] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isRefreshingRates, setIsRefreshingRates] = useState(false);
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

  const { monthlyIncome, monthlyExpense } = filteredTransactions.reduce(
    (acc, t) => {
      if (t.type === 'income') acc.monthlyIncome += t.amount;
      else if (t.type === 'expense') acc.monthlyExpense += t.amount;
      return acc;
    },
    { monthlyIncome: 0, monthlyExpense: 0 }
  );

  const handleRefreshRates = async () => {
    setIsRefreshingRates(true);
    try {
      const result = await updateExchangeRates();
      if (result.error) {
        toast.error(result.error);
      } else {
        await fetchAllData();
        toast.success('Cotización actualizada');
      }
    } finally {
      setIsRefreshingRates(false);
    }
  };

  // Helper de renderizado
  const renderSection = (
    title: string,
    items: Transaction[],
    colorClass: string = "text-muted",
    collapsible: boolean = false,
    isOpen: boolean = true,
    onToggle?: () => void
  ) => {
    if (items.length === 0) return null;

    const dailyNet = items.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);

    return (
      <div className="mb-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div
          className={cn(
            "flex items-center justify-between mb-1.5 px-1 select-none",
            collapsible ? "cursor-pointer hover:opacity-80" : ""
          )}
          onClick={collapsible ? onToggle : undefined}
        >
          <h3 className={cn("font-sans text-[11px] font-extrabold uppercase tracking-[0.15em] flex items-center gap-2", colorClass)}>
            {title}
            {collapsible && (
              isOpen ? <ChevronDown className="h-3 w-3 text-muted" aria-hidden="true" /> : <ChevronRight className="h-3 w-3 text-muted" aria-hidden="true" />
            )}
          </h3>
          <span className={cn(
            "font-sans text-[11px] font-bold tnum",
            dailyNet >= 0 ? "text-good" : "text-bad"
          )}>
            {dailyNet >= 0 ? '+' : ''}{formatCurrency(dailyNet)}
          </span>
        </div>

        {(!collapsible || isOpen) && (
          <Card className="overflow-hidden">
            {items.map((t, i) => {
              const paymentMethod = paymentMethods.find(pm => pm.id === t.payment_method_id);
              return (
                <div key={t.id} className={cn(i > 0 && "border-t-[1.5px] border-border")}>
                  <TransactionItem
                    transaction={t}
                    paymentMethodName={paymentMethod?.name}
                    paymentMethodType={paymentMethod?.type}
                    grouped
                  />
                </div>
              );
            })}
          </Card>
        )}
      </div>
    );
  };

  if (isLoading && !isInitialized) {
    return <TransactionListSkeleton />;
  }

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-28 md:pb-8">
      {/* Header Sticky */}
      <header className="sticky top-0 z-20 bg-bg-2/95 backdrop-blur-md border-b-[1.5px] border-border">
        <div className="mx-auto max-w-[1440px]">
          {/* Row 1: Título + Month + Plus */}
          <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.22em] text-accent-deep mb-0.5">
                Tus mangos
              </p>
              <h1 className="font-poster text-text text-[26px] leading-none">Movimientos</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <MonthSelector currentMonth={currentMonthStr} baseUrl="/movimientos" />
              <AnimatedPlusButton
                label="Crear transacción"
                onClick={() => setIsCreateOpen(true)}
                ariaLabel="Nueva transacción"
              />
            </div>
          </div>

          {/* Row 2: Search */}
          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por descripción, categoría o monto..."
                className="w-full bg-surface border-[1.5px] border-border rounded-xl pl-9 pr-10 py-2.5 text-sm text-text placeholder:text-faint focus:outline-none focus:border-accent/40 transition-colors font-sans"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted hover:text-text transition-colors rounded-lg"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {debouncedQuery && (
              <p className="text-[11px] text-muted mt-1.5 px-1">
                {searchFilteredTransactions.length}{' '}
                movimiento{searchFilteredTransactions.length !== 1 ? 's' : ''} encontrado{searchFilteredTransactions.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </header>

      <CreateTransactionDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <main className="mx-auto max-w-[1440px] px-5 py-6">

        {/* Resumen del mes */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <Card className="p-3.5">
            <div className="flex items-center gap-1.5 text-good text-[10.5px] font-bold uppercase tracking-wider mb-1">
              <ArrowDownLeft className="h-3 w-3" aria-hidden="true" />
              Ingresos
            </div>
            <p className="font-poster text-good text-[20px] tnum leading-none">
              {formatCurrency(monthlyIncome)}
            </p>
          </Card>
          <Card className="p-3.5">
            <div className="flex items-center gap-1.5 text-bad text-[10.5px] font-bold uppercase tracking-wider mb-1">
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              Gastos
            </div>
            <p className="font-poster text-bad text-[20px] tnum leading-none">
              {formatCurrency(monthlyExpense)}
            </p>
          </Card>
        </div>

        {/* Botón de actualizar cotización */}
        <div className="flex justify-end mb-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRefreshRates}
            disabled={isRefreshingRates}
            className="text-muted hover:text-text gap-1.5 text-xs"
            aria-label="Actualizar cotización del dólar"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshingRates && 'animate-spin')} />
            Actualizar cotización
          </Button>
        </div>

        {/* Filtros siempre visibles */}
        <div className="mb-5 space-y-2">
          {/* Medios de pago */}
          <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 scrollbar-hide">
            <Chip
              active={selectedPaymentMethodId === 'all'}
              onClick={() => handleFilterChange('paymentMethod', 'all')}
              icon="wallet"
            >
              Todos
            </Chip>
            {paymentMethods.map((pm) => (
              <Chip
                key={pm.id}
                active={selectedPaymentMethodId === pm.id.toString()}
                onClick={() => handleFilterChange('paymentMethod', pm.id.toString())}
                icon={pm.type === 'credit' ? 'credit-card' : 'wallet'}
              >
                {pm.name}
              </Chip>
            ))}
          </div>

          {/* Categorías */}
          <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 scrollbar-hide">
            <Chip
              active={selectedCategoryId === 'all'}
              onClick={() => handleFilterChange('category', 'all')}
              icon="tag"
            >
              Todas
            </Chip>
            {categories.map((cat) => (
              <Chip
                key={cat.id}
                active={selectedCategoryId === cat.id}
                onClick={() => handleFilterChange('category', cat.id)}
              >
                <span aria-hidden="true">{cat.emoji}</span> {cat.name}
              </Chip>
            ))}
          </div>

          {/* Limpiar filtros activos */}
          {(selectedPaymentMethodId !== 'all' || selectedCategoryId !== 'all') && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete('paymentMethod');
                  params.delete('category');
                  router.replace(`${pathname}?${params.toString()}`);
                }}
                className="text-[11px] uppercase font-bold text-accent hover:text-accent-deep px-2"
              >
                Limpiar filtros
              </Button>
            </div>
          )}
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl border-[1.5px] border-dashed border-border bg-surface text-center">
            <Receipt className="h-16 w-16 text-faint mb-4" />
            <h3 className="font-sans font-bold text-text text-lg mb-2">Registrá tus movimientos</h3>
            <p className="text-sm text-muted max-w-xs mb-6">
              Llevá un registro de tus ingresos y gastos para saber exactamente a dónde va tu plata cada mes.
            </p>
            <AnimatedPlusButton
              label="Agregar movimiento"
              onClick={() => setIsCreateOpen(true)}
            />
          </div>
        ) : searchFilteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl border-[1.5px] border-dashed border-border bg-surface text-center">
            <Search className="h-16 w-16 text-faint mb-4" />
            <h3 className="font-sans font-bold text-text text-base mb-1">Sin resultados para &ldquo;{debouncedQuery}&rdquo;</h3>
            <p className="text-sm text-muted">Probá con otra descripción, categoría o monto.</p>
          </div>
        ) : (
          <>
            {renderSection('Hoy', groups.hoy, "text-good")}
            
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

            {renderSection('Proyección Futura', groups.futuro, "text-warn", true, isFutureOpen, () => setIsFutureOpen(!isFutureOpen))}
          </>
        )}
      </main>
    </div>
  );
}