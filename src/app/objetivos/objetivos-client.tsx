'use client';

import { useEffect, useState } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { SavingsGoalCard } from '@/components/goals/savings-goal-card';
import { CategoryBudgetCard } from '@/components/goals/category-budget-card';
import { CreateSavingsGoalDialog } from '@/components/goals/create-savings-goal-dialog';
import { CreateBudgetDialog } from '@/components/goals/create-budget-dialog';
import { StaggeredList, StaggeredItem } from '@/components/shared/staggered-list';
import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';
import { PageHeader } from '@/components/shared/page-header';
import { cn } from '@/lib/utils';
import {
  Target,
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

  // ── Goals & Budgets ───────────────────────────────────────────────────────
  const activeGoals = savingsGoals.filter(g => g.is_active);
  const completedGoals = savingsGoals.filter(g => !g.is_active);
  const activeBudgets = categoryBudgets.filter(b => b.is_active);
  const budgetStatuses = getAllBudgetStatuses();
  const exceededCount = budgetStatuses.filter(s => s.status === 'exceeded').length;
  const warningCount = budgetStatuses.filter(s => s.status === 'warning').length;

  // ── Hero: total metas ─────────────────────────────────────────────────────
  const totalMetasARS = activeGoals.reduce((sum, g) => {
    const progress = getSavingsGoalProgress(g.id);
    return sum + (progress?.totalContributed ?? 0);
  }, 0);

  return (
    <div className="min-h-screen bg-surface text-slate-50 pb-24">
      <PageHeader
        title="Objetivos"
        subtitle="Metas y presupuestos"
        icon={<Target className="h-5 w-5" />}
        containerClassName="max-w-[1440px]"
      >
        <AnimatedPlusButton
          label={activeTab === 'metas' ? 'Crear nueva meta' : 'Crear presupuesto'}
          onClick={activeTab === 'metas' 
            ? () => setIsCreateMetaOpen(true) 
            : () => setIsCreateBudgetOpen(true)
          }
          triggerKey={activeTab}
          ariaLabel={activeTab === 'metas' ? 'Nueva meta de ahorro' : 'Nuevo presupuesto'}
          className={activeTab === 'metas' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20' : ''}
        />
      </PageHeader>

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 space-y-6">

        {/* Hero Card: Total en Metas */}
        <div className="rounded-2xl border border-indigo-500/20 bg-linear-to-br from-indigo-500/10 via-violet-500/5 to-slate-950 p-5 md:p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Target className="w-16 md:w-20 h-16 md:h-20 text-indigo-400" />
          </div>
          <p className="text-[10px] md:text-xs font-medium text-indigo-300 uppercase tracking-wider mb-1.5">Total en Metas</p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline gap-1 sm:gap-x-6 sm:gap-y-2">
            <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white font-mono tracking-tight">
              {fmtCurrency(totalMetasARS)}
            </p>
          </div>
        </div>

        {/* Segmented Control */}
        <div data-tour="tabs-list" className="flex gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-800 w-full justify-between">
          <button
            onClick={() => setActiveTab('metas')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all w-full justify-center',
              activeTab === 'metas'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            <PiggyBank className="h-4 w-4" />
            Metas
            {activeGoals.length > 0 && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', activeTab === 'metas' ? 'bg-white/20' : 'bg-slate-800')}>{activeGoals.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('presupuestos')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all w-full justify-center',
              activeTab === 'presupuestos'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            <Wallet className="h-4 w-4" />
            Presupuestos
            {activeBudgets.length > 0 && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', activeTab === 'presupuestos' ? 'bg-white/20' : 'bg-slate-800')}>{activeBudgets.length}</span>
            )}
          </button>
        </div>

        {/* ── TAB: METAS ── */}
        {activeTab === 'metas' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/10">
                <PiggyBank className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">Metas de Ahorro</h2>
                <p className="text-xs text-slate-500">
                  {activeGoals.length === 0
                    ? 'Sin metas activas'
                    : `${activeGoals.length} meta${activeGoals.length > 1 ? 's' : ''} activa${activeGoals.length > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            {activeGoals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-surface-raised/20 py-16 text-center flex flex-col items-center">
                <PiggyBank className="h-16 w-16 text-slate-700 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Ponele un objetivo a tu ahorro</h3>
                <p className="text-slate-500 text-sm max-w-xs mx-auto mb-6">
                  Definí metas concretas — un viaje, un fondo de emergencia, lo que sea — y seguí tu progreso mes a mes.
                </p>
                <AnimatedPlusButton
                  label="Crear meta"
                  onClick={() => setIsCreateMetaOpen(true)}
                  ariaLabel="Nueva meta de ahorro"
                  className="bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeGoals.map(goal => <SavingsGoalCard key={goal.id} goal={goal} />)}
              </div>
            )}

            {completedGoals.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300 transition-colors select-none">
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
              <div className="p-2 rounded-xl bg-indigo-500/10">
                <Wallet className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">Presupuestos Mensuales</h2>
                <p className="text-xs text-slate-500">
                  {activeBudgets.length === 0 ? (
                    'Sin presupuestos activos'
                  ) : (
                    <>
                      {activeBudgets.length} categoría{activeBudgets.length > 1 ? 's' : ''}
                      {exceededCount > 0 && (
                        <span className="text-rose-400 ml-1">· {exceededCount} superado{exceededCount > 1 ? 's' : ''}</span>
                      )}
                      {warningCount > 0 && (
                        <span className="text-amber-400 ml-1">· {warningCount} en alerta</span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>

            {activeBudgets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-surface-raised/20 py-16 text-center flex flex-col items-center">
                <Wallet className="h-16 w-16 text-slate-700 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Controlá en qué gastás tu plata</h3>
                <p className="text-slate-500 text-sm max-w-xs mx-auto mb-6">
                  Establecé límites de gasto mensual por categoría y recibí alertas antes de pasarte del presupuesto.
                </p>
                <AnimatedPlusButton
                  label="Crear presupuesto"
                  onClick={() => setIsCreateBudgetOpen(true)}
                  ariaLabel="Nuevo presupuesto"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeBudgets.map(budget => <CategoryBudgetCard key={budget.id} budget={budget} />)}
              </div>
            )}
          </section>
        )}



      </main>

      {/* Modales controlados */}
      <CreateSavingsGoalDialog 
        open={isCreateMetaOpen} 
        onOpenChange={setIsCreateMetaOpen} 
      />
      <CreateBudgetDialog 
        categories={categories}
        open={isCreateBudgetOpen} 
        onOpenChange={setIsCreateBudgetOpen} 
      />
    </div>
  );
}
