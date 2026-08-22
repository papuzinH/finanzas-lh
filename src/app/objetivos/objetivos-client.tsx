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
import { EmptyState } from '@/components/shared/empty-state';
import { Chancho } from '@/components/brand/chancho';
import { Button } from '@/components/ui/button';
import { Plus, Wallet } from 'lucide-react';

export function ObjetivosClient() {
  const [isCreateMetaOpen, setIsCreateMetaOpen] = useState(false);
  const [isCreateBudgetOpen, setIsCreateBudgetOpen] = useState(false);

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
      {/* Sin botón en el header: crear una meta y crear un presupuesto son dos acciones
          distintas, y cada una vive en el encabezado de su propia sección. Antes había
          un «+» acá que abría un sheet preguntando cuál de las dos querías. */}
      <ScreenHeader compact title="Objetivos" />

      <main className="mx-auto max-w-[1440px] px-5 pb-4 space-y-5">

        {/* Cuánto llevás: la cifra de la pantalla, con la firma de la marca. */}
        <GoalsHeroCard />

        {/* ── Metas de ahorro ── */}
        {/* data-tour="tabs-list": ancla del tour de onboarding (onboardingStore.ts:42) — las tabs
            murieron pero el paso del tour ahora señala esta sección; NO renombrar. */}
        <section className="space-y-3" data-tour="tabs-list">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-text text-[18px]">Metas de ahorro</h2>
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Vacío no lleva subtítulo: el EmptyState de abajo dice lo mismo y quedaban
                  repetidos uno encima del otro. */}
              {activeGoals.length > 0 && (
                <span className="text-[12px] text-muted">
                  {activeGoals.length} activa{activeGoals.length === 1 ? '' : 's'}
                </span>
              )}
              <Button
                variant="soft"
                size="icon"
                className="h-11 w-11"
                onClick={() => setIsCreateMetaOpen(true)}
                aria-label="Nueva meta de ahorro"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {activeGoals.length === 0 ? (
            <EmptyState
              icon={<Chancho className="w-6" slot="var(--surface-2)" />}
              title="Ponele un objetivo a tu ahorro"
              description="Un viaje, un fondo para imprevistos, lo que se te cante. Vos ponés la meta y el chancho se va llenando."
              action={
                <AnimatedPlusButton
                  label="Crear meta"
                  onClick={() => setIsCreateMetaOpen(true)}
                  ariaLabel="Nueva meta de ahorro"
                  align="center"
                />
              }
            />
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-text text-[18px]">Presupuestos mensuales</h2>
            <div className="flex items-center gap-2.5 shrink-0">
              {activeBudgets.length > 0 && <span className="text-[12px] text-muted">Este mes</span>}
              <Button
                variant="soft"
                size="icon"
                className="h-11 w-11"
                onClick={() => setIsCreateBudgetOpen(true)}
                aria-label="Nuevo presupuesto"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {activeBudgets.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-5 w-5" />}
              title="Controlá en qué gastás"
              description="Ponele un techo mensual a una categoría y mirá cómo venís sin sacar la cuenta."
              action={
                <AnimatedPlusButton
                  label="Crear presupuesto"
                  onClick={() => setIsCreateBudgetOpen(true)}
                  ariaLabel="Nuevo presupuesto"
                  align="center"
                />
              }
            />
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

      <CreateSavingsGoalDialog open={isCreateMetaOpen} onOpenChange={setIsCreateMetaOpen} />
      <CreateBudgetDialog
        categories={categories.filter((c) => c.type === 'expense')}
        open={isCreateBudgetOpen}
        onOpenChange={setIsCreateBudgetOpen}
      />
    </div>
  );
}
