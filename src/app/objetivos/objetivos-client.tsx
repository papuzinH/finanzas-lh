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
import { Wallet, PiggyBank, Plus } from 'lucide-react';

export function ObjetivosClient() {
  const [isCreateMetaOpen, setIsCreateMetaOpen] = useState(false);
  const [isCreateBudgetOpen, setIsCreateBudgetOpen] = useState(false);

  const {
    isInitialized,
    fetchAllData,
    savingsGoals,
    categoryBudgets,
    categories,
  } = useFinanceStore();

  useEffect(() => {
    if (!isInitialized) fetchAllData();
  }, [isInitialized, fetchAllData]);

  const activeGoals = savingsGoals.filter(g => g.is_active);
  const completedGoals = savingsGoals.filter(g => !g.is_active);
  const activeBudgets = categoryBudgets.filter(b => b.is_active);

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-28 md:pb-8">
      <ScreenHeader
        compact
        title="Objetivos"
        right={
          <AnimatedPlusButton
            label="Crear nueva meta"
            onClick={() => setIsCreateMetaOpen(true)}
            ariaLabel="Nueva meta de ahorro"
          />
        }
      />

      <main className="mx-auto max-w-[1440px] px-5 pb-4">

        {/* ── Metas de ahorro ── */}
        {/* data-tour="tabs-list": ancla del tour de onboarding (onboardingStore.ts:42) — las tabs
            murieron pero el paso del tour ahora señala esta sección; NO renombrar. */}
        <div className="flex items-baseline justify-between" data-tour="tabs-list">
          <h2 className="font-display text-text text-[18px]">Metas de ahorro</h2>
          <span className="text-[12px] text-muted">Ponele un objetivo a tu ahorro</span>
        </div>

        {activeGoals.length === 0 ? (
          <div className="mt-3 rounded-2xl border-[1.5px] border-dashed border-border bg-surface py-16 text-center flex flex-col items-center">
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
          <StaggeredList className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeGoals.map(goal => (
              <StaggeredItem key={goal.id}>
                <SavingsGoalCard goal={goal} />
              </StaggeredItem>
            ))}
          </StaggeredList>
        )}

        {completedGoals.length > 0 && (
          <details className="group mt-3">
            <summary className="cursor-pointer text-xs text-muted hover:text-text transition-colors select-none">
              {completedGoals.length} meta{completedGoals.length > 1 ? 's' : ''} inactiva{completedGoals.length > 1 ? 's' : ''} →
            </summary>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 opacity-60">
              {completedGoals.map(goal => <SavingsGoalCard key={goal.id} goal={goal} />)}
            </div>
          </details>
        )}

        {/* ── Presupuestos mensuales ── */}
        <div className="flex items-baseline justify-between mt-6">
          <h2 className="font-display text-text text-[18px]">Presupuestos mensuales</h2>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted">Controlá en qué gastás</span>
            {activeBudgets.length > 0 && (
              <button
                type="button"
                onClick={() => setIsCreateBudgetOpen(true)}
                aria-label="Nuevo presupuesto"
                className="grid place-items-center w-7 h-7 rounded-full bg-surface border-[1.5px] border-border text-text hover:bg-surface-2 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.6} />
              </button>
            )}
          </div>
        </div>

        {activeBudgets.length === 0 ? (
          <div className="mt-3 rounded-2xl border-[1.5px] border-dashed border-border bg-surface py-16 text-center flex flex-col items-center">
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
          <StaggeredList className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {activeBudgets.map(budget => (
              <StaggeredItem key={budget.id}>
                <CategoryBudgetCard budget={budget} />
              </StaggeredItem>
            ))}
          </StaggeredList>
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
