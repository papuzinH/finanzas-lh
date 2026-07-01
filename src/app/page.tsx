'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFinanceStore } from '@/lib/store/financeStore';
import {
  CreditCard,
  CalendarClock,
  TrendingUp,
  PieChart as PieChartIcon,
  ShoppingBag,
  DollarSign,
  Flame,
} from 'lucide-react';
import { formatCurrency, formatCompact } from '@/lib/utils';
import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';
import { ScreenHeader } from '@/components/shared/screen-header';
import { TransactionItem } from '@/components/shared/transaction-item';
import { StaggeredList, StaggeredItem } from '@/components/shared/staggered-list';
import { Modal } from '@/components/shared/modal';
import { DashboardSkeleton } from '@/components/ui/skeletons';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { BalanceCard } from '@/components/dashboard/balance-card';
import { IncompleteCreditCardsBanner } from '@/components/dashboard/incomplete-credit-cards-banner';
import { EndOfMonthSavingsBanner } from '@/components/dashboard/end-of-month-savings-banner';
import { MetricRow } from '@/components/dashboard/metric-row';
import { BudgetOverviewStrip } from '@/components/goals/budget-overview-strip';
import { TrendChart } from '@/components/dashboard/trend-chart';
import { CategoryComparison } from '@/components/dashboard/category-comparison';
import { InsightsCarousel } from '@/components/dashboard/insights-carousel';
import { CreateTransactionDialog } from '@/components/transactions/create-transaction-dialog';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

function CategoryBreakdownCard({
  title,
  data,
  total,
  icon: Icon,
  onClick,
  className,
}: {
  title: string;
  data: Array<{ name: string; value: number; percentage: number }>;
  total: number;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  className?: string;
}) {
  if (data.length === 0) {
    return (
      <div className={`rounded-2xl border-[1.5px] border-border bg-surface p-5 ${className ?? ''}`}>
        <h3 className="font-sans font-bold text-text text-sm flex items-center gap-2 mb-4">
          <Icon className="w-4 h-4 text-muted" aria-hidden="true" />
          {title}
        </h3>
        <div className="h-20 flex items-center justify-center text-xs text-muted italic">
          Sin datos para mostrar
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border-[1.5px] border-border bg-surface p-5 w-full text-left cursor-pointer hover:bg-surface-2/50 active:scale-[0.99] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${className ?? ''}`}
      aria-label={`Ver desglose de ${title}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-sans font-bold text-text text-sm flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted" aria-hidden="true" />
          {title}
        </h3>
        <span className="font-poster tnum text-xs text-muted">{formatCurrency(total)}</span>
      </div>
      <div className="space-y-2.5">
        {data.map((item, index) => (
          <div key={item.name}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  aria-hidden="true"
                />
                <span className="text-xs text-text truncate">{item.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span className="text-[10px] text-muted tnum">{item.percentage.toFixed(0)}%</span>
                <span className="font-poster tnum text-xs text-text">{formatCurrency(item.value)}</span>
              </div>
            </div>
            <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${item.percentage}%`,
                  backgroundColor: COLORS[index % COLORS.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const [isInstallmentsModalOpen, setIsInstallmentsModalOpen] = useState(false);
  const [isFixedCostsModalOpen, setIsFixedCostsModalOpen] = useState(false);
  const [isGlobalExpensesModalOpen, setIsGlobalExpensesModalOpen] = useState(false);
  const [isMonthlyExpensesModalOpen, setIsMonthlyExpensesModalOpen] = useState(false);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isVariableExpensesModalOpen, setIsVariableExpensesModalOpen] = useState(false);
  const [isCreateTxOpen, setIsCreateTxOpen] = useState(false);
  const [isTrendDetailOpen, setIsTrendDetailOpen] = useState(false);

  // Conectamos con el Store Global
  const {
    transactions,
    paymentMethods,
    isLoading,
    isInitialized,
    fetchAllData,
    getMonthlyBurnRate,
    getCurrentMonthInstallmentsTotal,
    getCurrentMonthInstallments,
    getActiveRecurringPlans,
    getCategoryBreakdown,
    getMonthlyIncome,
    getMonthlyIncomeTransactions,
    getMonthlyVariableExpenses,
    getMonthlyVariableExpenseTransactions,
    getMonthlyLiquidityBreakdown,
    getRegistrationStreak,
    getMonthlyTrend,
    user
  } = useFinanceStore();

  // Fetch inicial si no hay datos
  useEffect(() => {
    if (!isInitialized) {
      fetchAllData();
    }
  }, [isInitialized, fetchAllData]);

  // Función para refresh manual (pull-to-refresh)
  const handleManualRefresh = async () => {
    await fetchAllData();
  };

  // --- CÁLCULOS PARA LA VISTA ---
  
  const monthlyBurnRate = getMonthlyBurnRate();
  const currentMonthInstallments = getCurrentMonthInstallmentsTotal();
  const currentMonthInstallmentsList = getCurrentMonthInstallments();
  const activeRecurringPlans = getActiveRecurringPlans();
  const monthlyIncome = getMonthlyIncome();
  const monthlyIncomeTransactions = getMonthlyIncomeTransactions();
  const monthlyVariableExpenses = getMonthlyVariableExpenses();
  const monthlyVariableExpenseTransactions = getMonthlyVariableExpenseTransactions();
  const liquidBreakdown = getMonthlyLiquidityBreakdown();
  const streak = getRegistrationStreak();
  const trendData = getMonthlyTrend(6);

  // Datos para los Gráficos y Modales
  const globalBreakdown = getCategoryBreakdown('global');
  const currentMonthBreakdown = getCategoryBreakdown('current_month');

  const globalChartData = globalBreakdown.items.slice(0, 5);
  const currentMonthChartData = currentMonthBreakdown.items.slice(0, 5);

  // Mostrar skeleton mientras carga o si no está inicializado
  if (isLoading && !isInitialized) {
    return <DashboardSkeleton />;
  }

  // Componente del dashboard principal
  const dashboardContent = (
    <div className="min-h-screen bg-bg text-text font-sans pb-28 md:pb-8">
      <ScreenHeader
        kicker="tu resumen"
        title={`Hola, ${user?.first_name || 'vos'} 👋`}
        right={
          <div className="flex items-center gap-2">
            {streak.days > 0 && (
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warn/10 border border-warn/20"
                title={!streak.isActiveToday ? 'Registrá un gasto para mantener tu racha' : undefined}
              >
                <Flame
                  className={[
                    'w-3.5 h-3.5 text-warn',
                    streak.isActiveToday ? '' : 'opacity-50',
                    streak.days > 7 ? 'animate-pulse' : '',
                  ].join(' ')}
                />
                <span className="text-[11px] font-semibold text-warn leading-none">
                  {streak.days}d
                </span>
              </div>
            )}
            <div data-tour="add-transaction-button">
              <AnimatedPlusButton
                label="Crear transacción"
                onClick={() => setIsCreateTxOpen(true)}
                ariaLabel="Nueva transacción"
              />
            </div>
          </div>
        }
      />

      <main className="mx-auto max-w-[1440px] px-5 py-4 space-y-5">

        {/* Aviso: tarjetas de crédito sin fechas configuradas */}
        <IncompleteCreditCardsBanner />

        {/* ── ABOVE THE FOLD ── */}

        {/* SECCIÓN A: ESTADO PATRIMONIAL (Bento Grid) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Expandible Balance Card */}
          <div data-tour="balance-card" className="col-span-2 lg:col-span-4">
            <BalanceCard
              monthlyIncome={liquidBreakdown.income}
              monthlyExpenses={liquidBreakdown.liquidVariableExpenses}
              installments={liquidBreakdown.liquidInstallments}
              burnRate={liquidBreakdown.liquidSubscriptions}
              savingsTransfers={liquidBreakdown.savingsTransfers}
            />
          </div>

          {/* CTA ahorro: debajo de la card principal de balance */}
          <div className="col-span-2 lg:col-span-4">
            <EndOfMonthSavingsBanner />
          </div>

          {/* Insights Carousel */}
          <div className="col-span-2 lg:col-span-4">
            <InsightsCarousel />
          </div>

          {/* Metric Row 1: Ingresos y Gastos Variables */}
          <MetricRow
            items={[
              {
                label: "Ingresos mes",
                value: formatCurrency(monthlyIncome),
                sublabel: "Total percibido",
                color: "emerald",
                icon: DollarSign,
                sparklineType: "income",
                onClick: () => setIsIncomeModalOpen(true),
              },
              {
                label: "Variables mes",
                value: formatCurrency(monthlyVariableExpenses),
                sublabel: "Gastos del día a día",
                color: "rose",
                icon: ShoppingBag,
                sparklineType: "variable",
                onClick: () => setIsVariableExpensesModalOpen(true),
              },
            ]}
          />

          {/* Metric Row 2: Cuotas y Mensualidades */}
          <MetricRow
            items={[
              {
                label: "Cuotas mes",
                value: formatCurrency(currentMonthInstallments),
                sublabel: "Ciclo actual",
                color: "indigo",
                icon: CreditCard,
                onClick: () => setIsInstallmentsModalOpen(true),
                sparklineType: "installments",
              },
              {
                label: "Fijos mes",
                value: formatCurrency(monthlyBurnRate),
                sublabel: "Mensualidades",
                color: "amber",
                icon: CalendarClock,
                onClick: () => setIsFixedCostsModalOpen(true),
                sparklineType: "fixed",
              },
            ]}
          />
        </div>

        {/* PRESUPUESTOS DEL MES */}
        <BudgetOverviewStrip />

        {/* ── BELOW THE FOLD ── */}

        {/* Separador: Análisis */}
        <div className="flex items-center gap-2 mt-6 mb-2">
          <h2 className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-muted whitespace-nowrap">Análisis</h2>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* SECCIÓN B: ANÁLISIS VISUAL (Charts) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Gráfico 0: Tendencia Ingreso vs Gasto (6 meses) */}
          <div className="col-span-full rounded-2xl border-[1.5px] border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-sans font-bold text-text text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted" aria-hidden="true" />
                Tendencia Ingreso vs Gasto
              </h3>
              <div className="flex items-center gap-3 text-[10px] text-muted">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-good inline-block" aria-hidden="true" />Ingresos</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-bad inline-block" aria-hidden="true" />Gastos</span>
              </div>
            </div>
            <TrendChart onTap={() => setIsTrendDetailOpen(true)} />
          </div>

          {/* Gráfico 1: Gastos Globales */}
          <CategoryBreakdownCard
            title="Gastos Globales"
            data={globalChartData}
            total={globalBreakdown.total}
            icon={TrendingUp}
            onClick={() => setIsGlobalExpensesModalOpen(true)}
            className="col-span-1 lg:col-span-2"
          />

          <CategoryBreakdownCard
            title="Gastos este Mes"
            data={currentMonthChartData}
            total={currentMonthBreakdown.total}
            icon={PieChartIcon}
            onClick={() => setIsMonthlyExpensesModalOpen(true)}
            className="col-span-1 lg:col-span-2"
          />

          {/* Gráfico 3: Variación por Categoría */}
          <div className="col-span-1 md:col-span-2 lg:col-span-2">
            <CategoryComparison />
          </div>

        </div>

        {/* Separador: Últimos movimientos */}
        <div className="flex items-center gap-2 mt-6 mb-2">
          <h2 className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-muted whitespace-nowrap">Últimos movimientos</h2>
          <div className="flex-1 h-px bg-border" />
          <Link href="/movimientos" className="text-xs text-accent hover:text-accent-deep transition-colors">Ver todos</Link>
        </div>

        {/* SECCIÓN C: ÚLTIMOS MOVIMIENTOS */}
        <StaggeredList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {transactions
            .filter(t => !t.installment_plan_id)
            .slice(0, 6)
            .map((t) => {
            const paymentMethod = paymentMethods.find(pm => pm.id === t.payment_method_id);
            return (
              <StaggeredItem key={t.id}>
                <TransactionItem
                  transaction={t}
                  paymentMethodName={paymentMethod?.name}
                  paymentMethodType={paymentMethod?.type}
                  showDate={true}
                />
              </StaggeredItem>
            );
          })}
        </StaggeredList>

      </main>

      <Modal
        isOpen={isInstallmentsModalOpen}
        onClose={() => setIsInstallmentsModalOpen(false)}
        title="Cuotas a pagar este mes"
      >
        <div className="space-y-3">
          {currentMonthInstallmentsList.length > 0 ? (
            currentMonthInstallmentsList.map((t) => {
              const paymentMethod = paymentMethods.find(pm => pm.id === t.payment_method_id);
              return (
                <TransactionItem 
                  key={t.id} 
                  transaction={t} 
                  paymentMethodName={paymentMethod?.name}
                  paymentMethodType={paymentMethod?.type}
                  showDate={true}
                />
              );
            })
          ) : (
            <p className="text-muted text-center py-4">No hay cuotas para este mes.</p>
          )}
        </div>
      </Modal>
      <Modal
        isOpen={isFixedCostsModalOpen}
        onClose={() => setIsFixedCostsModalOpen(false)}
        title="Gastos Fijos Mensuales"
      >
        <div className="space-y-3">
          {activeRecurringPlans.length > 0 ? (
            activeRecurringPlans.map((plan) => {
              const paymentMethod = paymentMethods.find(pm => pm.id === plan.payment_method_id);
              // Adaptamos el plan a la estructura de TransactionItem
              const adaptedTransaction = {
                id: plan.id,
                amount: plan.amount,
                description: plan.description,
                date: new Date().toISOString(), // Fecha dummy, no se muestra
                category_id: plan.category_id,
                type: 'expense' as const,
                payment_method_id: plan.payment_method_id
              };

              return (
                <TransactionItem 
                  key={plan.id} 
                  transaction={adaptedTransaction} 
                  paymentMethodName={paymentMethod?.name}
                  paymentMethodType={paymentMethod?.type}
                  showDate={false}
                />
              );
            })
          ) : (
            <p className="text-muted text-center py-4">No hay gastos fijos activos.</p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isGlobalExpensesModalOpen}
        onClose={() => setIsGlobalExpensesModalOpen(false)}
        title="Desglose de Gastos Globales"
      >
        <div className="space-y-6">
          <div className="text-center py-4 border-b border-border">
            <p className="text-xs text-muted uppercase tracking-wider mb-1">Total Gastado</p>
            <p className="font-poster tnum text-3xl text-text">{formatCurrency(globalBreakdown.total)}</p>
          </div>
          <div className="space-y-4">
            {globalBreakdown.items.map((item, index) => (
              <div key={item.name} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-text flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    {item.name}
                  </span>
                  <span className="font-poster tnum text-text">{formatCurrency(item.value)}</span>
                </div>
                <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: COLORS[index % COLORS.length]
                    }}
                  />
                </div>
                <p className="text-[10px] text-right text-muted">{item.percentage.toFixed(1)}% del total</p>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isMonthlyExpensesModalOpen}
        onClose={() => setIsMonthlyExpensesModalOpen(false)}
        title="Desglose de Gastos del Mes"
      >
        <div className="space-y-6">
          <div className="text-center py-4 border-b border-border">
            <p className="text-xs text-muted uppercase tracking-wider mb-1">Total del Mes</p>
            <p className="font-poster tnum text-3xl text-text">{formatCurrency(currentMonthBreakdown.total)}</p>
          </div>
          {currentMonthBreakdown.items.length > 0 ? (
            <div className="space-y-4">
              {currentMonthBreakdown.items.map((item, index) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-text flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      {item.name}
                    </span>
                    <span className="font-poster tnum text-text">{formatCurrency(item.value)}</span>
                  </div>
                  <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: COLORS[index % COLORS.length]
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-right text-muted">{item.percentage.toFixed(1)}% del total</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted text-center py-4 italic">No hay gastos registrados este mes.</p>
          )}
        </div>
      </Modal>
      <Modal
        isOpen={isIncomeModalOpen}
        onClose={() => setIsIncomeModalOpen(false)}
        title="Ingresos del mes"
      >
        <div className="space-y-3">
          {monthlyIncomeTransactions.length > 0 ? (
            <>
              <div className="text-center py-3 border-b border-border mb-4">
                <p className="text-xs text-muted uppercase tracking-wider mb-1">Total percibido</p>
                <p className="font-poster tnum text-3xl text-good">{formatCurrency(monthlyIncome)}</p>
              </div>
              {monthlyIncomeTransactions.map((t) => {
                const paymentMethod = paymentMethods.find((pm) => pm.id === t.payment_method_id);
                return (
                  <TransactionItem
                    key={t.id}
                    transaction={t}
                    paymentMethodName={paymentMethod?.name}
                    paymentMethodType={paymentMethod?.type}
                    showDate={true}
                  />
                );
              })}
            </>
          ) : (
            <p className="text-muted text-center py-4 italic">No hay ingresos registrados este mes.</p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isVariableExpensesModalOpen}
        onClose={() => setIsVariableExpensesModalOpen(false)}
        title="Gastos variables del mes"
      >
        <div className="space-y-3">
          {monthlyVariableExpenseTransactions.length > 0 ? (
            <>
              <div className="text-center py-3 border-b border-border mb-4">
                <p className="text-xs text-muted uppercase tracking-wider mb-1">Total gastado</p>
                <p className="font-poster tnum text-3xl text-bad">{formatCurrency(monthlyVariableExpenses)}</p>
              </div>
              {monthlyVariableExpenseTransactions.map((t) => {
                const paymentMethod = paymentMethods.find((pm) => pm.id === t.payment_method_id);
                return (
                  <TransactionItem
                    key={t.id}
                    transaction={t}
                    paymentMethodName={paymentMethod?.name}
                    paymentMethodType={paymentMethod?.type}
                    showDate={true}
                  />
                );
              })}
            </>
          ) : (
            <p className="text-muted text-center py-4 italic">No hay gastos variables este mes.</p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isTrendDetailOpen}
        onClose={() => setIsTrendDetailOpen(false)}
        title="Detalle mensual"
      >
        <div className="space-y-3">
          {trendData.map((row, i) => {
            const isLast = i === trendData.length - 1;
            const savingsRate = row.income > 0 ? ((row.net / row.income) * 100) : null;
            return (
              <div
                key={row.month}
                className={`rounded-2xl border-[1.5px] p-4 space-y-3 ${isLast ? 'border-accent bg-accent/5' : 'border-border bg-surface'}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-extrabold uppercase tracking-widest ${isLast ? 'text-accent' : 'text-muted'}`}>
                    {row.month}{isLast ? ' · actual' : ''}
                  </span>
                  {savingsRate !== null && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${row.net >= 0 ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'}`}>
                      {row.net >= 0 ? '+' : ''}{savingsRate.toFixed(0)}% ahorro
                    </span>
                  )}
                </div>
                {/* Fila principal: ingreso / total gastos / balance */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-muted mb-0.5">Ingresos</p>
                    <p className="font-poster tnum text-sm text-good">{formatCompact(row.income)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted mb-0.5">Gastos</p>
                    <p className="font-poster tnum text-sm text-bad">{formatCompact(row.expenses)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted mb-0.5">Balance</p>
                    <p className={`font-poster tnum text-sm ${row.net >= 0 ? 'text-good' : 'text-bad'}`}>
                      {row.net >= 0 ? '+' : '−'}{formatCompact(Math.abs(row.net))}
                    </p>
                  </div>
                </div>

                {/* Desglose de gastos */}
                {row.expenses > 0 && (
                  <div className="bg-surface-2/60 rounded-xl px-3 py-2.5 space-y-1.5">
                    {row.variable > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted">Variables</span>
                        <span className="font-poster tnum text-[11px] text-text">{formatCompact(row.variable)}</span>
                      </div>
                    )}
                    {row.installments > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted">Cuotas</span>
                        <span className="font-poster tnum text-[11px] text-text">{formatCompact(row.installments)}</span>
                      </div>
                    )}
                    {row.recurring > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted">Mensualidades</span>
                        <span className="font-poster tnum text-[11px] text-text">{formatCompact(row.recurring)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* mini barra comparativa ingreso vs gasto */}
                {(row.income > 0 || row.expenses > 0) && (() => {
                  const maxVal = Math.max(row.income, row.expenses);
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-good shrink-0" />
                        <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                          <div className="h-full bg-good rounded-full" style={{ width: `${(row.income / maxVal) * 100}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-bad shrink-0" />
                        <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                          <div className="h-full bg-bad rounded-full" style={{ width: `${(row.expenses / maxVal) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </Modal>

      <CreateTransactionDialog open={isCreateTxOpen} onOpenChange={setIsCreateTxOpen} />
    </div>
  );

  // Retornar con pull-to-refresh envuelto
  return (
    <PullToRefresh onRefresh={handleManualRefresh}>
      {dashboardContent}
    </PullToRefresh>
  );
}
