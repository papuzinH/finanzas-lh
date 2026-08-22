'use client';

import { useEffect, useState } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { SavingsGoalCard } from '@/components/goals/savings-goal-card';
import { CategoryBudgetCard } from '@/components/goals/category-budget-card';
import { GoalsHeroCard } from '@/components/goals/goals-hero-card';
import { CreateSavingsGoalDialog } from '@/components/goals/create-savings-goal-dialog';
import { CreateBudgetDialog } from '@/components/goals/create-budget-dialog';
import { StaggeredList, StaggeredItem } from '@/components/shared/staggered-list';
import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';
import { ScreenHeader } from '@/components/shared/screen-header';
import { Chancho } from '@/components/brand/chancho';
import { ActionSheet } from '@/components/ui/action-sheet';
import { PiggyBank, Wallet } from 'lucide-react';

export function ObjetivosClient() {
  const [isCreateMetaOpen, setIsCreateMetaOpen] = useState(false);
  const [isCreateBudgetOpen, setIsCreateBudgetOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

  // El store entero, no sus getters sueltos (ver store-freshness.test.ts).
  const store = useFinanceStore();
  const { isInitialized, fetchAllData, savingsGoals, categoryBudgets, categories } = store;

  useEffect(() => {
    if (!isInitialized) fetchAllData();
  }, [isInitialized, fetchAllData]);

  const activeGoals = savingsGoals.filter((g) => g.is_active);
  const inactiveGoals = savingsGoals.filter((g) => !g.is_active);
  const activeBudgets = categoryBudgets.filter((b) => b.is_active);

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-28 md:pb-8">
      <ScreenHeader
        compact
        title="Objetivos"
        right={
          <AnimatedPlusButton
            label="Crear"
            onClick={() => setIsCreateSheetOpen(true)}
            ariaLabel="Crear meta o presupuesto"
          />
        }
      />

      <main className="mx-auto max-w-[1440px] px-5 pb-4 space-y-5">

        {/* Cuánto llevás: la cifra de la pantalla, con la firma de la marca. */}
        <GoalsHeroCard />

        {/* ── Metas de ahorro ── */}
        {/* data-tour="tabs-list": ancla del tour de onboarding (onboardingStore.ts:42) — las tabs
            murieron pero el paso del tour ahora señala esta sección; NO renombrar. */}
        <section className="space-y-3" data-tour="tabs-list">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-text text-[18px]">Metas de ahorro</h2>
            <span className="text-[12px] text-muted">
              {activeGoals.length > 0
                ? `${activeGoals.length} activa${activeGoals.length === 1 ? '' : 's'}`
                : 'Ponele un objetivo a tu ahorro'}
            </span>
          </div>

          {activeGoals.length === 0 ? (
            <div className="rounded-2xl border-[1.5px] border-dashed border-border bg-surface py-14 px-5 text-center flex flex-col items-center gap-2">
              <Chancho className="w-16 text-faint mb-2" slot="var(--surface)" />
              <h3 className="font-sans font-bold text-text text-lg">Ponele un objetivo a tu ahorro</h3>
              <p className="text-muted text-sm max-w-xs mb-4">
                Definí metas concretas — un viaje, un fondo de emergencia, lo que sea — y seguí tu
                progreso mes a mes.
              </p>
              <AnimatedPlusButton
                label="Crear meta"
                onClick={() => setIsCreateMetaOpen(true)}
                ariaLabel="Nueva meta de ahorro"
              />
            </div>
          ) : (
            <StaggeredList className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {activeGoals.map((goal) => (
                <StaggeredItem key={goal.id} className="min-w-0">
                  <SavingsGoalCard goal={goal} />
                </StaggeredItem>
              ))}
            </StaggeredList>
          )}

          {inactiveGoals.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 min-h-11 text-[12px] font-bold text-muted hover:text-text transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded-full">
                {inactiveGoals.length} meta{inactiveGoals.length > 1 ? 's' : ''} guardada
                {inactiveGoals.length > 1 ? 's' : ''}
                <span className="transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
              </summary>
              <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3 opacity-70">
                {inactiveGoals.map((goal) => (
                  <SavingsGoalCard key={goal.id} goal={goal} />
                ))}
              </div>
            </details>
          )}
        </section>

        {/* ── Presupuestos mensuales ── */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-text text-[18px]">Presupuestos mensuales</h2>
            <span className="text-[12px] text-muted">
              {activeBudgets.length > 0 ? 'Este mes' : 'Controlá en qué gastás'}
            </span>
          </div>

          {activeBudgets.length === 0 ? (
            <div className="rounded-2xl border-[1.5px] border-dashed border-border bg-surface py-14 px-5 text-center flex flex-col items-center gap-2">
              <Wallet className="h-12 w-12 text-faint mb-2" aria-hidden="true" />
              <h3 className="font-sans font-bold text-text text-lg">Controlá en qué gastás tu plata</h3>
              <p className="text-muted text-sm max-w-xs mb-4">
                Establecé límites de gasto mensual por categoría y recibí alertas antes de pasarte
                del presupuesto.
              </p>
              <AnimatedPlusButton
                label="Crear presupuesto"
                onClick={() => setIsCreateBudgetOpen(true)}
                ariaLabel="Nuevo presupuesto"
              />
            </div>
          ) : (
            <StaggeredList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {activeBudgets.map((budget) => (
                <StaggeredItem key={budget.id}>
                  <CategoryBudgetCard budget={budget} />
                </StaggeredItem>
              ))}
            </StaggeredList>
          )}
        </section>

      </main>

      {/* Un solo «+» para la pantalla: pregunta qué querés crear en vez de repartir
          dos botones distintos por sección. */}
      <ActionSheet
        open={isCreateSheetOpen}
        onOpenChange={setIsCreateSheetOpen}
        title="Qué querés crear"
        actions={[
          {
            label: 'Una meta de ahorro',
            icon: <PiggyBank className="h-5 w-5" />,
            onClick: () => setIsCreateMetaOpen(true),
          },
          {
            label: 'Un presupuesto mensual',
            icon: <Wallet className="h-5 w-5" />,
            onClick: () => setIsCreateBudgetOpen(true),
          },
        ]}
      />

      <CreateSavingsGoalDialog open={isCreateMetaOpen} onOpenChange={setIsCreateMetaOpen} />
      <CreateBudgetDialog
        categories={categories.filter((c) => c.type === 'expense')}
        open={isCreateBudgetOpen}
        onOpenChange={setIsCreateBudgetOpen}
      />
    </div>
  );
}
