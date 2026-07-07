'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CreateTransactionDialog } from '@/components/transactions/create-transaction-dialog';
import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';
import { Chip } from '@/components/ui/chip';

/** Tamaño de fuente del monto según cantidad de dígitos, para que nunca overflowee la card. */
const amountFontClass = (formatted: string) => {
  const digits = formatted.replace(/[^\d]/g, '').length;
  if (digits > 9) return 'text-[14px]';
  if (digits > 7) return 'text-[16px]';
  return 'text-[19px]';
};

interface TransactionWithPeriod extends Transaction {
  periodDate?: string;
}

export default function MovimientosPage() {
  const [isFutureOpen, setIsFutureOpen] = useState(false);
  const [isPendingOpen, setIsPendingOpen] = useState(false);
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
    getPendingFixedExpenses,
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
    // Los pagos de tarjeta (card_payment_for) NO son consumo nuevo: las compras del
    // resumen ya están itemizadas como transacciones propias, así que contar el pago
    // duplicaría esa plata (se notaba sobre todo en meses ya pagados). Se excluyen de
    // toda la vista —lista y totales— igual que hacen las analíticas del store.
    if (t.card_payment_for) return false;

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

  // Primer ítem deslizable REALMENTE visible al entrar a la pantalla (Hoy → días pasados).
  // "Proyección Futura" arranca colapsada, así que sus filas no están montadas todavía
  // y no pueden mostrar el peek; por eso queda afuera de este cálculo.
  const firstSwipeableId = [...groups.hoy, ...pastDates.flatMap((d) => groups[d])]
    .find((t) => !t.installment_plan_id)?.id ?? null;

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

  // getPendingFixedExpenses() está anclado al mes real de hoy (no al mes que se esté
  // viendo acá), así que solo aplica cuando currentMonthStr es el mes actual.
  const isViewingCurrentMonth = currentMonthStr === format(new Date(), 'yyyy-MM');
  const pendingFixed = isViewingCurrentMonth ? getPendingFixedExpenses() : { total: 0, items: [] };
  // "Gastos" incluye las mensualidades pendientes (las transacciones de Proyección
  // Futura ya están en monthlyExpense, son transacciones reales con fecha futura dentro
  // del mes) para que Neto = Ingresos − Gastos cierre con lo que se ve en pantalla.
  const displayedExpense = monthlyExpense + pendingFixed.total;
  const netBalance = monthlyIncome - displayedExpense;
  const activeFilterCount = (selectedPaymentMethodId !== 'all' ? 1 : 0) + (selectedCategoryId !== 'all' ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;
  // Las mensualidades pendientes no tienen medio de pago/categoría propios: no son
  // parte del resultado de una búsqueda o filtro, así que solo se muestran en la vista default.
  const showPendingSection = isViewingCurrentMonth && !debouncedQuery && !hasActiveFilters && pendingFixed.items.length > 0;

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('paymentMethod');
    params.delete('category');
    router.replace(`${pathname}?${params.toString()}`);
  };

  // Chips de filtro: se usan tanto en el bottom sheet (mobile) como en el rail (desktop).
  const renderFilters = () => {
    const rowClass = 'flex flex-wrap gap-2';
    const groupLabel = (text: string) => (
      <p className="font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-muted mb-1.5">{text}</p>
    );

    return (
      <div className="space-y-3.5">
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
                className="flex items-center gap-2 -m-1 p-1 rounded-md hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg uppercase"
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
                    peekOnMount={t.id === firstSwipeableId}
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
          {/* El selector de mes reemplaza al título de la pantalla (es tappable: abre
              el picker de mes/año; el chevron es la pista visual de que se puede tocar). */}
          <div className="px-5 pt-3 md:pt-4 pb-2.5 md:pb-3">
            <div className="flex items-center justify-between gap-3">
              <MonthSelector currentMonth={currentMonthStr} baseUrl="/movimientos" />
              <div className="md:hidden shrink-0">
                <AnimatedPlusButton
                  label="Crear transacción"
                  onClick={() => setIsCreateOpen(true)}
                  ariaLabel="Nueva transacción"
                />
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

              {/* Filtros: solo mobile/tablet (en desktop viven siempre visibles en el rail). Abre un bottom sheet, no afecta el layout de la página. */}
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
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

      {/* Filtros (mobile): bottom sheet, no afecta el layout de la página al abrir/cerrar. */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto bg-surface border-border text-text">
          <DialogHeader>
            <DialogTitle className="text-text">Filtros</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {renderFilters()}
            <div className="flex justify-center pt-3 border-t-[1.5px] border-border">
              {ratesButton}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <main className="mx-auto max-w-[1160px] px-5 py-6">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8 lg:items-start">
          {/* ===================== Columna ledger ===================== */}
          <div className="min-w-0">
            {/* Resumen: solo mobile/tablet (en desktop vive en el rail) */}
            <div className="lg:hidden">
              <Card className="p-3.5 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-good text-[10.5px] font-bold uppercase tracking-wider mb-1">
                      <ArrowDownLeft className="h-3 w-3 shrink-0" aria-hidden="true" />
                      Ingresos
                    </div>
                    <p
                      title={formatCurrency(monthlyIncome)}
                      className={cn("font-poster text-good tnum leading-none truncate", amountFontClass(formatCurrency(monthlyIncome)))}
                    >
                      {formatCurrency(monthlyIncome)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-bad text-[10.5px] font-bold uppercase tracking-wider mb-1">
                      <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                      Gastos
                    </div>
                    <p
                      title={formatCurrency(displayedExpense)}
                      className={cn("font-poster text-bad tnum leading-none truncate", amountFontClass(formatCurrency(displayedExpense)))}
                    >
                      {formatCurrency(displayedExpense)}
                    </p>
                  </div>
                </div>

                <div className="h-px bg-border my-3" />

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted shrink-0">
                    Neto
                  </span>
                  <span
                    title={formatCurrency(netBalance)}
                    className={cn(
                      "font-poster tnum leading-none truncate",
                      netBalance >= 0 ? "text-good" : "text-bad",
                      amountFontClass(formatCurrency(netBalance))
                    )}
                  >
                    {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)}
                  </span>
                </div>
              </Card>
            </div>

            {/* Mensualidades pendientes del mes: no tienen transacción propia todavía
                (por eso no aparecían acá) y el Neto de arriba ya las descuenta.
                Colapsada por defecto, mismo patrón que "Proyección Futura". */}
            {showPendingSection && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1.5 px-1 select-none">
                  <h3 className="font-sans text-[11px] font-extrabold uppercase tracking-[0.15em] text-muted">
                    <button
                      type="button"
                      onClick={() => setIsPendingOpen((v) => !v)}
                      aria-expanded={isPendingOpen}
                      aria-controls="movimientos-pendientes-panel"
                      className="flex items-center gap-2 -m-1 p-1 rounded-md hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg uppercase"
                    >
                      <Clock className="h-3 w-3 text-muted" aria-hidden="true" />
                      Mensualidades pendientes
                      {isPendingOpen ? <ChevronDown className="h-3 w-3 text-muted" aria-hidden="true" /> : <ChevronRight className="h-3 w-3 text-muted" aria-hidden="true" />}
                    </button>
                  </h3>
                  <span className="font-sans text-[11px] font-bold tnum text-bad">
                    -{formatCurrency(pendingFixed.total)}
                  </span>
                </div>
                {isPendingOpen && (
                  <Card id="movimientos-pendientes-panel" className="overflow-hidden border-dashed">
                    {pendingFixed.items.map((item, i) => (
                      <Link
                        key={item.id}
                        href="/compromisos"
                        className={cn(
                          "flex items-center justify-between gap-3 p-3 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
                          i > 0 && "border-t-[1.5px] border-border"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 min-w-9 rounded-xl bg-surface-2 border-[1.5px] border-border grid place-items-center shrink-0">
                            <Clock className="h-4 w-4 text-muted" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-sans font-bold text-[13.5px] text-text truncate">{item.name}</span>
                            <span className="text-[11px] text-muted">Pendiente este mes · ver en Compromisos</span>
                          </div>
                        </div>
                        <span className="font-poster tnum text-[15px] text-muted whitespace-nowrap shrink-0">
                          {formatCurrency(item.amount)}
                        </span>
                      </Link>
                    ))}
                  </Card>
                )}
              </div>
            )}

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
                {renderSection('Proyección Futura', groups.futuro, "text-muted", true, isFutureOpen, () => setIsFutureOpen(!isFutureOpen), true)}

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
                  <span className="flex items-center gap-1.5 text-good text-[11px] font-bold uppercase tracking-wider shrink-0">
                    <ArrowDownLeft className="h-3 w-3" aria-hidden="true" />
                    Ingresos
                  </span>
                  <span
                    title={formatCurrency(monthlyIncome)}
                    className={cn("font-poster text-good tnum leading-none truncate min-w-0", amountFontClass(formatCurrency(monthlyIncome)))}
                  >
                    {formatCurrency(monthlyIncome)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-bad text-[11px] font-bold uppercase tracking-wider shrink-0">
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    Gastos
                  </span>
                  <span
                    title={formatCurrency(displayedExpense)}
                    className={cn("font-poster text-bad tnum leading-none truncate min-w-0", amountFontClass(formatCurrency(displayedExpense)))}
                  >
                    {formatCurrency(displayedExpense)}
                  </span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted shrink-0">
                    Neto
                  </span>
                  <span
                    title={formatCurrency(netBalance)}
                    className={cn(
                      "font-poster tnum leading-none truncate min-w-0",
                      netBalance >= 0 ? "text-good" : "text-bad",
                      amountFontClass(formatCurrency(netBalance))
                    )}
                  >
                    {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)}
                  </span>
                </div>
              </div>
            </Card>

            {showPendingSection && (
              <Card className="p-4 border-dashed">
                <button
                  type="button"
                  onClick={() => setIsPendingOpen((v) => !v)}
                  aria-expanded={isPendingOpen}
                  aria-controls="movimientos-pendientes-rail-panel"
                  className="w-full flex items-center justify-between gap-2 -m-1 p-1 rounded-md font-sans text-[11px] font-extrabold uppercase tracking-[0.15em] text-muted hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="flex items-center gap-1.5 uppercase">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Mensualidades pendientes
                  </span>
                  {isPendingOpen ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />}
                </button>
                {isPendingOpen && (
                  <div id="movimientos-pendientes-rail-panel" className="space-y-2 mt-3 uppercase">
                    {pendingFixed.items.map((item) => (
                      <Link
                        key={item.id}
                        href="/compromisos"
                        className="flex items-center justify-between gap-3 rounded-lg -mx-1.5 px-1.5 py-1 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent uppercase"
                      >
                        <span className="text-[12.5px] text-text truncate uppercase">{item.name}</span>
                        <span className="text-[12.5px] text-muted tnum shrink-0">{formatCurrency(item.amount)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Filtros */}
            <Card className="p-4">
              <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-deep mb-3">
                Filtros
              </p>
              {renderFilters()}
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