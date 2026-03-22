'use client'

import { useEffect } from 'react'
import { useFinanceStore } from '@/lib/store/financeStore'
import { SavingsGoalCard } from '@/components/goals/savings-goal-card'
import { CategoryBudgetCard } from '@/components/goals/category-budget-card'
import { CreateSavingsGoalDialog } from '@/components/goals/create-savings-goal-dialog'
import { CreateBudgetDialog } from '@/components/goals/create-budget-dialog'
import { Target, Wallet, PiggyBank } from 'lucide-react'

export default function ObjetivosPage() {
  const {
    isInitialized,
    fetchAllData,
    savingsGoals,
    categoryBudgets,
    categories,
    getAllBudgetStatuses,
  } = useFinanceStore()

  useEffect(() => {
    if (!isInitialized) {
      fetchAllData()
    }
  }, [isInitialized, fetchAllData])

  const activeGoals = savingsGoals.filter((g) => g.is_active)
  const completedGoals = savingsGoals.filter((g) => !g.is_active)
  const activeBudgets = categoryBudgets.filter((b) => b.is_active)
  const budgetStatuses = getAllBudgetStatuses()
  const exceededCount = budgetStatuses.filter((s) => s.status === 'exceeded').length
  const warningCount = budgetStatuses.filter((s) => s.status === 'warning').length

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-4">
          <h1 className="text-xl font-bold tracking-tight text-white">Objetivos</h1>
          <p className="text-sm text-slate-400 mt-0.5">Metas de ahorro y presupuestos mensuales</p>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 space-y-10">

        {/* ========== SECCIÓN: METAS DE AHORRO ========== */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
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
            <CreateSavingsGoalDialog />
          </div>

          {activeGoals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-10 text-center">
              <Target className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 text-sm font-medium">No tenés metas de ahorro todavía</p>
              <p className="text-slate-500 text-xs mt-1">
                Creá tu primera meta para empezar a trackear tu progreso de ahorro
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeGoals.map((goal) => (
                <SavingsGoalCard key={goal.id} goal={goal} />
              ))}
            </div>
          )}

          {/* Completed goals (collapsed) */}
          {completedGoals.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300 transition-colors select-none">
                {completedGoals.length} meta{completedGoals.length > 1 ? 's' : ''} inactiva{completedGoals.length > 1 ? 's' : ''} →
              </summary>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                {completedGoals.map((goal) => (
                  <SavingsGoalCard key={goal.id} goal={goal} />
                ))}
              </div>
            </details>
          )}
        </section>

        {/* Divider */}
        <div className="border-t border-slate-800" />

        {/* ========== SECCIÓN: PRESUPUESTOS POR CATEGORÍA ========== */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
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
            <CreateBudgetDialog categories={categories} />
          </div>

          {activeBudgets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-10 text-center">
              <Wallet className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 text-sm font-medium">No tenés presupuestos configurados</p>
              <p className="text-slate-500 text-xs mt-1">
                Establecé límites de gasto mensual por categoría y recibí alertas cuando te acercás al límite
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeBudgets.map((budget) => (
                <CategoryBudgetCard key={budget.id} budget={budget} />
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
