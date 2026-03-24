'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EditBudgetDialog } from './edit-budget-dialog'
import { deleteCategoryBudget } from '@/app/dashboard/goals/actions'
import { Trash2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useConfetti } from '@/components/shared/confetti'
import type { CategoryBudget } from '@/types/database'

interface Props {
  budget: CategoryBudget
}

export function CategoryBudgetCard({ budget }: Props) {
  const [deleting, setDeleting] = useState(false)
  const [showEndOfMonthBadge, setShowEndOfMonthBadge] = useState(false)
  const { getCategoryBudgetStatus, getBudgetProjection, fetchGoalsData } = useFinanceStore()
  const statusData = getCategoryBudgetStatus(budget.category_id)
  const projection = getBudgetProjection(budget.id)
  const { celebrate } = useConfetti()

  useEffect(() => {
    if (!statusData || statusData.status !== 'ok') return
    const now = new Date()
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    if (now.getDate() < lastDayOfMonth - 3) return
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const key = `confetti_budget_${budget.id}_${monthKey}`
    if (typeof window !== 'undefined') {
      setShowEndOfMonthBadge(true)
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, '1')
        celebrate(true)
      }
    }
  }, [statusData?.status, budget.id, celebrate])

  if (!statusData) return null

  const { categoryName, categoryEmoji, spent, limit, percent, status } = statusData

  const barColor =
    status === 'exceeded' ? 'bg-rose-500' :
    status === 'warning' ? 'bg-amber-500' :
    'bg-emerald-500'

  const statusBadge =
    status === 'exceeded' ? (
      <Badge className="bg-rose-500/20 text-rose-300 border-0 text-[10px] px-2 py-0">
        <XCircle className="w-2.5 h-2.5 mr-1" />
        Superado
      </Badge>
    ) : status === 'warning' ? (
      <Badge className="bg-amber-500/20 text-amber-300 border-0 text-[10px] px-2 py-0">
        <AlertTriangle className="w-2.5 h-2.5 mr-1" />
        Cuidado
      </Badge>
    ) : (
      <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px] px-2 py-0">
        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
        OK
      </Badge>
    )

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar el presupuesto de ${categoryName}?`)) return
    setDeleting(true)
    const res = await deleteCategoryBudget(budget.id)
    setDeleting(false)
    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success('Presupuesto eliminado')
      await fetchGoalsData()
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-surface-raised/40 p-5 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {statusBadge}
            {showEndOfMonthBadge && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Badge className="bg-teal-500/20 text-teal-300 border-0 text-[10px] px-2 py-0">
                  ¡Dentro del presupuesto!
                </Badge>
              </motion.div>
            )}
          </div>
          <h3 className="font-semibold text-slate-100">
            {categoryEmoji && <span className="mr-1">{categoryEmoji}</span>}
            {categoryName}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Presupuesto mensual</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <EditBudgetDialog budget={budget} categoryName={categoryName} categoryEmoji={categoryEmoji} />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Eliminar presupuesto de ${categoryName}`}
            className="h-11 w-11 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="relative">
          <div
            className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(Math.min(percent, 100))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${categoryName}: ${Math.round(Math.min(percent, 100))}% del presupuesto`}
          >
            <div
              className={`h-full rounded-full transition-all duration-700 ${barColor}`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
          {projection && (
            <div
              className="absolute top-0 h-2.5 pointer-events-none"
              style={{
                left: `${Math.min(projection.limit > 0 ? (projection.projected / projection.limit) * 100 : 0, 100)}%`,
                borderLeft: `2px dashed ${projection.isOverBudget ? '#fb7185' : '#34d399'}`,
              }}
            />
          )}
        </div>
        <div className="flex justify-between text-xs">
          <span className={
            status === 'exceeded' ? 'text-rose-400 font-semibold' :
            status === 'warning' ? 'text-amber-400 font-semibold' :
            'text-slate-400'
          }>
            {budget.currency === 'USD' ? 'USD ' : ''}
            {formatCurrency(spent)} gastados
          </span>
          <span className="text-slate-400">
            límite: {budget.currency === 'USD' ? 'USD ' : ''}
            {formatCurrency(limit)}
          </span>
        </div>
        {projection && (
          <div className={`text-[11px] font-medium ${projection.isOverBudget ? 'text-rose-400' : 'text-emerald-400'}`}>
            {projection.isOverBudget
              ? `Proyección: ${budget.currency === 'USD' ? 'USD ' : ''}${formatCurrency(projection.projected)} (excede por ${budget.currency === 'USD' ? 'USD ' : ''}${formatCurrency(projection.projected - projection.limit)})`
              : `Proyección: ${budget.currency === 'USD' ? 'USD ' : ''}${formatCurrency(projection.projected)}`
            }
          </div>
        )}
      </div>

      {/* Context message */}
      {status === 'exceeded' && (
        <p className="text-xs text-rose-400/80">
          Superaste el límite por {budget.currency === 'USD' ? 'USD ' : ''}
          {formatCurrency(spent - limit)}
        </p>
      )}
      {status === 'warning' && (
        <p className="text-xs text-amber-400/80">
          Solo te quedan {budget.currency === 'USD' ? 'USD ' : ''}
          {formatCurrency(limit - spent)} hasta el límite
        </p>
      )}
      {status === 'ok' && (
        <p className="text-xs text-slate-400">
          {(100 - percent).toFixed(0)}% disponible este mes
        </p>
      )}
    </div>
  )
}
