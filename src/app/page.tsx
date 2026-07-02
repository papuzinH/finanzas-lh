'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFinanceStore } from '@/lib/store/financeStore';
import {
  CreditCard,
  CalendarClock,
  ShoppingBag,
  DollarSign,
  Flame,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';
import { ScreenHeader } from '@/components/shared/screen-header';
import { TransactionItem } from '@/components/shared/transaction-item';
import { StaggeredList, StaggeredItem } from '@/components/shared/staggered-list';
import { Modal } from '@/components/shared/modal';
import { DashboardSkeleton } from '@/components/ui/skeletons';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { BalanceCard } from '@/components/dashboard/balance-card';
import { NextMonthCardExposureCard } from '@/components/dashboard/next-month-card-exposure-card';
import { IncompleteCreditCardsBanner } from '@/components/dashboard/incomplete-credit-cards-banner';
import { EndOfMonthSavingsBanner } from '@/components/dashboard/end-of-month-savings-banner';
import { MetricRow } from '@/components/dashboard/metric-row';
import { BudgetOverviewStrip } from '@/components/goals/budget-overview-strip';
import { InsightsCarousel } from '@/components/dashboard/insights-carousel';
import { AnalysisSection } from '@/components/dashboard/analysis/analysis-section';
import { CreateTransactionDialog } from '@/components/transactions/create-transaction-dialog';

export default function DashboardPage() {
  const [isInstallmentsModalOpen, setIsInstallmentsModalOpen] = useState(false);
  const [isFixedCostsModalOpen, setIsFixedCostsModalOpen] = useState(false);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isVariableExpensesModalOpen, setIsVariableExpensesModalOpen] = useState(false);
  const [isCreateTxOpen, setIsCreateTxOpen] = useState(false);

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
    getMonthlyIncome,
    getMonthlyIncomeTransactions,
    getMonthlyVariableExpenses,
    getMonthlyVariableExpenseTransactions,
    getRegistrationStreak,
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
  const streak = getRegistrationStreak();

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
            <BalanceCard />
          </div>

          {/* Nivel 3: Fondo de Ojo — consumo de tarjeta del proximo mes */}
          <div className="col-span-2 lg:col-span-4">
            <NextMonthCardExposureCard />
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

        {/* SECCIÓN B: ANÁLISIS (tabs + toggle ARS/USD) */}
        <AnalysisSection />

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
