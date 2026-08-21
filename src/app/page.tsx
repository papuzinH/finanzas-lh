'use client';

import { useEffect, useState } from 'react';
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
import { Chancho } from '@/components/brand/chancho';
import { TransactionItem } from '@/components/shared/transaction-item';
import { StaggeredList, StaggeredItem } from '@/components/shared/staggered-list';
import { Modal } from '@/components/shared/modal';
import { DashboardSkeleton } from '@/components/ui/skeletons';
import { SectionTitle } from '@/components/shared/section-title';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { BalanceCard } from '@/components/dashboard/balance-card';
import { IncompleteCreditCardsBanner } from '@/components/dashboard/incomplete-credit-cards-banner';
import { ReconcileReminderCard } from '@/components/pocket/reconcile-reminder-card';
import { MetricGrid } from '@/components/dashboard/metric-grid';
import { BudgetGaugeCard } from '@/components/dashboard/budget-gauge-card';
import { SavingsGoalsRingsCard } from '@/components/dashboard/savings-goals-rings-card';
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
        icon={<Chancho className="w-9 text-text" />}
        kicker="tu resumen"
        title={`Hola, ${user?.first_name || 'vos'}`}
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

        <ReconcileReminderCard />

        {/* ── ABOVE THE FOLD ── */}

        {/* SECCIÓN A: ESTADO PATRIMONIAL — principal (hero + 4 KPIs) 2/3 + rail (consumo tarjeta + insights) 1/3 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 lg:grid-flow-row-dense lg:items-start gap-4">

          {/* Hero — principal, fila 1 (cols 1-2) */}
          <div data-tour="balance-card" className="lg:col-span-2">
            <BalanceCard />
          </div>

          {/* Insights — rail (col 3). Hijo directo: si retorna null, la celda colapsa. */}
          <InsightsCarousel className="lg:col-start-3" />

          {/* Las 4 KPIs — principal, fila 2 (cols 1-2) */}
          <MetricGrid
            className="lg:col-span-2"
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

        {/* PRESUPUESTOS Y METAS DE AHORRO */}
        <SectionTitle action="Ver todo" href="/objetivos">Presupuestos y metas</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <BudgetGaugeCard />
          <SavingsGoalsRingsCard />
        </div>

        {/* ── BELOW THE FOLD ── */}

        {/* SECCIÓN B: ANÁLISIS (tabs + toggle ARS/USD) */}
        <SectionTitle>Análisis</SectionTitle>
        <AnalysisSection />

        {/* SECCIÓN C: ÚLTIMOS MOVIMIENTOS */}
        <SectionTitle action="Ver todos" href="/movimientos">Últimos movimientos</SectionTitle>
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
                <p className="font-display tnum text-3xl text-good">{formatCurrency(monthlyIncome)}</p>
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
                <p className="font-display tnum text-3xl text-bad">{formatCurrency(monthlyVariableExpenses)}</p>
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
