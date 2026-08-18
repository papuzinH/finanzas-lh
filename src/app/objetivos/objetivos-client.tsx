'use client';

import { useEffect, useState } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { SavingsGoalCard } from '@/components/goals/savings-goal-card';
import { CategoryBudgetCard } from '@/components/goals/category-budget-card';
import { CreateSavingsGoalDialog } from '@/components/goals/create-savings-goal-dialog';
import { CreateBudgetDialog } from '@/components/goals/create-budget-dialog';
import { StaggeredList, StaggeredItem } from '@/components/shared/staggered-list';
import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';
import { ScreenHeader } from '@/components/shared/screen-header';
import { TabsDS } from '@/components/ui/tabs-ds';
import {
  Wallet,
  PiggyBank,
} from 'lucide-react';

type ActiveTab = 'metas' | 'presupuestos';

const fmtCurrency = (amount: number, currency: 'ARS' | 'USD' = 'ARS') =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);

export function ObjetivosClient({ initialTab }: { initialTab: ActiveTab }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [isCreateMetaOpen, setIsCreateMetaOpen] = useState(false);
  const [isCreateBudgetOpen, setIsCreateBudgetOpen] = useState(false);

  const {
    isInitialized,
    fetchAllData,
    savingsGoals,
    categoryBudgets,
    categories,
    getAllBudgetStatuses,
    getSavingsGoalProgress,
  } = useFinanceStore();

  useEffect(() => {
    if (!isInitialized) fetchAllData();
  }, [isInitialized, fetchAllData]);

  const activeGoals = savingsGoals.filter(g => g.is_active);
  const completedGoals = savingsGoals.filter(g => !g.is_active);
  const activeBudgets = categoryBudgets.filter(b => b.is_active);
  const budgetStatuses = getAllBudgetStatuses();
  const exceededCount = budgetStatuses.filter(s => s.status === 'exceeded').length;
  const warningCount = budgetStatuses.filter(s => s.status === 'warning').length;

  const totalMetasARS = activeGoals.reduce((sum, g) => {
    const progress = getSavingsGoalProgress(g.id);
    return sum + (progress?.totalContributed ?? 0);
  }, 0);

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-28 md:pb-8">
      <ScreenHeader
        kicker="objetivos"
        title="Objetivos"
        right={
          <AnimatedPlusButton
            label={activeTab === 'metas' ? 'Crear nueva meta' : 'Crear presupuesto'}
            onClick={activeTab === 'metas'
              ? () => setIsCreateMetaOpen(true)
              : () => setIsCreateBudgetOpen(true)
            }
            triggerKey={activeTab}
            ariaLabel={activeTab === 'metas' ? 'Nueva meta de ahorro' : 'Nuevo presupuesto'}
          />
        }
      />

      <main className="mx-auto max-w-[1440px] px-5 space-y-5 pb-4">

        {/* Hero Card */}
        <div
          className="rounded-2xl bg-hero text-cream p-5"
          style={{ boxShadow: '0 18px 36px -18px rgba(28,42,71,0.70)' }}
        >
          <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-celeste">
            Total en Metas
          </p>
          <p className="font-display tnum text-[36px] leading-[0.95] mt-1 text-cream-light">
            {fmtCurrency(totalMetasARS)}
          </p>
          {(activeGoals.length > 0) && (
            <p className="text-[11px] text-celeste/70 mt-2">
              {activeGoals.length} meta{activeGoals.length > 1 ? 's' : ''} activa{activeGoals.length > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Tabs */}
        <div data-tour="tabs-list">
          <TabsDS
            tabs={[
              { id: 'metas', label: 'Metas', icon: 'piggy' },
              { id: 'presupuestos', label: 'Presupuestos', icon: 'wallet' },
            ]}
            active={activeTab}
            onChange={(id) => setActiveTab(id as ActiveTab)}
          />
        </div>

        {/* ── TAB: METAS ── */}
        {activeTab === 'metas' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-surface-2 border-[1.5px] border-border">
                <PiggyBank className="w-5 h-5 text-muted" />
              </div>
              <div>
                <h2 className="font-sans font-bold text-text">Metas de Ahorro</h2>
                <p className="text-xs text-muted">
                  {activeGoals.length === 0
                    ? 'Sin metas activas'
                    : `${activeGoals.length} meta${activeGoals.length > 1 ? 's' : ''} activa${activeGoals.length > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            {activeGoals.length === 0 ? (
              <div className="rounded-2xl border-[1.5px] border-dashed border-border bg-surface py-16 text-center flex flex-col items-center">
                <PiggyBank className="h-14 w-14 text-faint mx-auto mb-4" />
                <h3 className="font-sans font-bold text-text text-lg mb-2">Ponele un objetivo a tu ahorro</h3>
                <p className="text-muted text-sm max-w-xs mx-auto mb-6">
                  Definí metas concretas — un viaje, un fondo de emergencia, lo que sea — y seguí tu progreso mes a mes.
                </p>
                <AnimatedPlusButton
                  label="Crear meta"
                  onClick={() => setIsCreateMetaOpen(true)}
                  ariaLabel="Nueva meta de ahorro"
                />
              </div>
            ) : (
              <StaggeredList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeGoals.map(goal => (
                  <StaggeredItem key={goal.id}>
                    <SavingsGoalCard goal={goal} />
                  </StaggeredItem>
                ))}
              </StaggeredList>
            )}

            {completedGoals.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-xs text-muted hover:text-text transition-colors select-none">
                  {completedGoals.length} meta{completedGoals.length > 1 ? 's' : ''} inactiva{completedGoals.length > 1 ? 's' : ''} →
                </summary>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                  {completedGoals.map(goal => <SavingsGoalCard key={goal.id} goal={goal} />)}
                </div>
              </details>
            )}
          </section>
        )}

        {/* ── TAB: PRESUPUESTOS ── */}
        {activeTab === 'presupuestos' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-surface-2 border-[1.5px] border-border">
                <Wallet className="w-5 h-5 text-muted" />
              </div>
              <div>
                <h2 className="font-sans font-bold text-text">Presupuestos Mensuales</h2>
                <p className="text-xs text-muted">
                  {activeBudgets.length === 0 ? (
                    'Sin presupuestos activos'
                  ) : (
                    <>
                      {activeBudgets.length} categoría{activeBudgets.length > 1 ? 's' : ''}
                      {exceededCount > 0 && (
                        <span className="text-bad ml-1">· {exceededCount} superado{exceededCount > 1 ? 's' : ''}</span>
                      )}
                      {warningCount > 0 && (
                        <span className="text-warn ml-1">· {warningCount} en alerta</span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>

            {activeBudgets.length === 0 ? (
              <div className="rounded-2xl border-[1.5px] border-dashed border-border bg-surface py-16 text-center flex flex-col items-center">
                <Wallet className="h-14 w-14 text-faint mx-auto mb-4" />
                <h3 className="font-sans font-bold text-text text-lg mb-2">Controlá en qué gastás tu plata</h3>
                <p className="text-muted text-sm max-w-xs mx-auto mb-6">
                  Establecé límites de gasto mensual por categoría y recibí alertas antes de pasarte del presupuesto.
                </p>
                <AnimatedPlusButton
                  label="Crear presupuesto"
                  onClick={() => setIsCreateBudgetOpen(true)}
                  ariaLabel="Nuevo presupuesto"
                />
              </div>
            ) : (
              <StaggeredList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeBudgets.map(budget => (
                  <StaggeredItem key={budget.id}>
                    <CategoryBudgetCard budget={budget} />
                  </StaggeredItem>
                ))}
              </StaggeredList>
            )}
          </section>
        )}

      </main>

      <CreateSavingsGoalDialog
        open={isCreateMetaOpen}
        onOpenChange={setIsCreateMetaOpen}
      />
      <CreateBudgetDialog
        categories={categories.filter((c) => c.type === 'expense')}
        open={isCreateBudgetOpen}
        onOpenChange={setIsCreateBudgetOpen}
      />
    </div>
  );
}
