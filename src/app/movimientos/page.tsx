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
import { ChevronDown, ChevronRight, Search, X, Receipt, RefreshCw, ArrowDownLeft, ArrowUpRight, Clock, SlidersHorizontal } from 'lucide-react';
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
  // Filtros en mobile: colapsados por defecto, se despliegan con el botón "Filtros".
  const [filtersOpen, setFiltersOpen] = useState(false);
  const {
    transactions,
    paymentMethods,
    categories,
    fetchAllData,
    isInitialized,
    isLoading,
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

  const netBalance = monthlyIncome - monthlyExpense;
  const activeFilterCount = (selectedPaymentMethodId !== 'all' ? 1 : 0) + (selectedCategoryId !== 'all' ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('paymentMethod');
    params.delete('category');
    router.replace(`${pathname}?${params.toString()}`);
  };

  // Chips de filtro reutilizables: 'scroll' (mobile, scroll horizontal) | 'wrap' (rail desktop)
  const renderFilters = (variant: 'scroll' | 'wrap') => {
    const rowClass = variant === 'scroll'
      ? 'flex gap-2 overflow-x-auto pb-1 scrollbar-hide'
      : 'flex flex-wrap gap-2';
    const groupLabel = (text: string) =>
      variant === 'wrap' ? (
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-muted mb-1.5">{text}</p>
      ) : null;

    return (
      <div className={variant === 'wrap' ? 'space-y-3.5' : 'space-y-2'}>
        <div>
          {groupLabel('Medio de pago')}
          <div className={rowClass}>
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
        </div>

        <div>
          {groupLabel('Categoría')}
          <div className={rowClass}>
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
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-[11px] uppercase font-bold text-accent hover:text-accent-deep px-2"
            >
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>
    );
  };

  const ratesButton = (
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
  );

  // Helper de renderizado
  const renderSection = (
    title: string,
    items: Transaction[],
    colorClass: string = "text-muted",
    collapsible: boolean = false,
    isOpen: boolean = true,
    onToggle?: () => void,
    showItemDate: boolean = false
  ) => {
    if (items.length === 0) return null;

    const dailyNet = items.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
    const collapsiblePanelId = 'movimientos-proyeccion-futura-panel';

    return (
      <div className="mb-5 animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
        <div className="flex items-center justify-between mb-1.5 px-1 select-none">
          {collapsible ? (
            <h3 className={cn("font-sans text-[11px] font-extrabold uppercase tracking-[0.15em]", colorClass)}>
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                aria-controls={collapsiblePanelId}
                className="flex items-center gap-2 -m-1 p-1 rounded-md hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <Clock className="h-3 w-3 text-muted" aria-hidden="true" />
                {title}
                {isOpen ? <ChevronDown className="h-3 w-3 text-muted" aria-hidden="true" /> : <ChevronRight className="h-3 w-3 text-muted" aria-hidden="true" />}
              </button>
            </h3>
          ) : (
            <h3 className={cn("font-sans text-[11px] font-extrabold uppercase tracking-[0.15em] flex items-center gap-2", colorClass)}>
              {title}
            </h3>
          )}
          <span className={cn(
            "font-sans text-[11px] font-bold tnum",
            dailyNet >= 0 ? "text-good" : "text-bad"
          )}>
            {dailyNet >= 0 ? '+' : ''}{formatCurrency(dailyNet)}
          </span>
        </div>

        {(!collapsible || isOpen) && (
          <Card id={collapsible ? collapsiblePanelId : undefined} className="overflow-hidden">
            {items.map((t, i) => {
              const paymentMethod = paymentMethods.find(pm => pm.id === t.payment_method_id);
              return (
                <div key={t.id} className={cn(i > 0 && "border-t-[1.5px] border-border")}>
                  <TransactionItem
                    transaction={t}
                    paymentMethodName={paymentMethod?.name}
                    paymentMethodType={paymentMethod?.type}
                    showDate={showItemDate}
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
        <div className="mx-auto max-w-[1160px]">
          {/* Fila título + selector + plus: una sola línea en desktop; en mobile el selector
              baja a su propia fila (basis-full). Un único MonthSelector → data-tour intacto. */}
          <div className="px-5 pt-3 md:pt-4 pb-2.5 md:pb-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
              <div className="min-w-0 mr-auto order-1">
                <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.22em] text-accent-deep mb-0.5">
                  Tus mangos
                </p>
                <h1 className="font-poster text-text text-[24px] md:text-[26px] leading-none">Movimientos</h1>
              </div>
              {/* Crear: solo mobile (en desktop va a la derecha del buscador) */}
              <div className="order-2 md:hidden">
                <AnimatedPlusButton
                  label="Crear transacción"
                  onClick={() => setIsCreateOpen(true)}
                  ariaLabel="Nueva transacción"
                />
              </div>
              {/* Selector de mes: mobile fila propia (basis-full); desktop pill al extremo derecho con badge arriba */}
              <div className="order-3 md:order-2 basis-full md:basis-auto">
                <MonthSelector currentMonth={currentMonthStr} baseUrl="/movimientos" compact />
              </div>
            </div>
          </div>

          {/* Search + crear (desktop: botón a la derecha del input) */}
          <div className="px-5 pb-2.5 md:pb-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 md:flex-none md:w-[420px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por descripción, categoría o monto..."
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label="Buscar movimientos"
                className="w-full bg-surface border-[1.5px] border-border rounded-xl pl-9 pr-10 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors font-sans"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted hover:text-text transition-colors rounded-lg"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              </div>

              {/* Filtros: solo mobile/tablet (en desktop viven siempre visibles en el rail) */}
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                aria-controls="movimientos-filtros-mobile"
                className="lg:hidden relative shrink-0 min-h-11 min-w-11 flex items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-border bg-surface px-3 text-sm font-semibold text-text transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                <span>Filtros</span>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink border-[1.5px] border-accent-deep">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              <div className="hidden md:block">
                <AnimatedPlusButton
                  label="Crear transacción"
                  onClick={() => setIsCreateOpen(true)}
                  ariaLabel="Nueva transacción"
                />
              </div>
            </div>
            {debouncedQuery && (
              <p role="status" aria-live="polite" className="text-[11px] text-muted mt-1.5 px-1">
                {searchFilteredTransactions.length}{' '}
                movimiento{searchFilteredTransactions.length !== 1 ? 's' : ''} encontrado{searchFilteredTransactions.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </header>

      <CreateTransactionDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <main className="mx-auto max-w-[1160px] px-5 py-6">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8 lg:items-start">
          {/* ===================== Columna ledger ===================== */}
          <div className="min-w-0">
            {/* Resumen + cotización + filtros: solo mobile/tablet (en desktop viven en el rail) */}
            <div className="lg:hidden">
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

              {/* Neto del mes */}
              <Card className="p-3.5 mb-4 flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted">
                  Neto
                </span>
                <span className={cn(
                  "font-poster text-[18px] tnum leading-none",
                  netBalance >= 0 ? "text-good" : "text-bad"
                )}>
                  {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)}
                </span>
              </Card>

              {/* Botón de actualizar cotización */}
              <div className="flex justify-end mb-3">
                {ratesButton}
              </div>

              {/* Filtros: se despliegan con el botón "Filtros".
                  Animamos la altura con el truco de grid-rows 0fr→1fr para no generar CLS. */}
              <div
                id="movimientos-filtros-mobile"
                inert={!filtersOpen}
                aria-hidden={!filtersOpen}
                className={cn(
                  'grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none',
                  filtersOpen
                    ? 'grid-rows-[1fr] opacity-100 mb-5'
                    : 'grid-rows-[0fr] opacity-0 mb-0 pointer-events-none'
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  {renderFilters('scroll')}
                </div>
              </div>
            </div>

            {/* Lista de movimientos */}
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

                {renderSection('Proyección Futura', groups.futuro, "text-muted", true, isFutureOpen, () => setIsFutureOpen(!isFutureOpen), true)}
              </>
            )}
          </div>

          {/* ===================== Rail (solo desktop) ===================== */}
          <aside className="hidden lg:flex lg:flex-col gap-4">
            {/* Resumen del mes */}
            <Card className="p-4">
              <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-deep mb-3">
                Resumen del mes
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-good text-[11px] font-bold uppercase tracking-wider">
                    <ArrowDownLeft className="h-3 w-3" aria-hidden="true" />
                    Ingresos
                  </span>
                  <span className="font-poster text-good text-[16px] tnum leading-none">
                    {formatCurrency(monthlyIncome)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-bad text-[11px] font-bold uppercase tracking-wider">
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    Gastos
                  </span>
                  <span className="font-poster text-bad text-[16px] tnum leading-none">
                    {formatCurrency(monthlyExpense)}
                  </span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                    Neto
                  </span>
                  <span className={cn(
                    "font-poster text-[18px] tnum leading-none",
                    netBalance >= 0 ? "text-good" : "text-bad"
                  )}>
                    {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)}
                  </span>
                </div>
              </div>
            </Card>

            {/* Filtros */}
            <Card className="p-4">
              <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-deep mb-3">
                Filtros
              </p>
              {renderFilters('wrap')}
            </Card>

            {/* Cotización */}
            <div className="flex justify-center">
              {ratesButton}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}