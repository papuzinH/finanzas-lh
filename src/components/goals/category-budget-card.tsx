'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
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

  const progressTone = status === 'exceeded' ? 'bad' : status === 'warning' ? 'warn' : 'good'

  const statusBadge =
    status === 'exceeded' ? (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-bad/10 text-bad border border-bad/20">
        <XCircle className="w-2.5 h-2.5" />
        Superado
      </span>
    ) : status === 'warning' ? (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-warn/10 text-warn border border-warn/20">
        <AlertTriangle className="w-2.5 h-2.5" />
        Cuidado
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-good/10 text-good border border-good/20">
        <CheckCircle2 className="w-2.5 h-2.5" />
        OK
      </span>
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
    <div className="rounded-2xl border-[1.5px] border-border bg-surface p-5 space-y-3">
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
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-good/10 text-good border border-good/20">
                  ¡Dentro del presupuesto!
                </span>
              </motion.div>
            )}
          </div>
          <h3 className="font-sans font-bold text-text">
            {categoryEmoji && <span className="mr-1">{categoryEmoji}</span>}
            {categoryName}
          </h3>
          <p className="text-xs text-muted mt-0.5">Presupuesto mensual</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <EditBudgetDialog budget={budget} categoryName={categoryName} categoryEmoji={categoryEmoji} />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Eliminar presupuesto de ${categoryName}`}
            className="h-11 w-11 text-muted hover:text-bad hover:bg-bad/10"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <ProgressBar
          value={Math.min(percent, 100)}
          tone={progressTone}
          height={10}
        />
        {projection && (
          <div
            className="relative h-0 pointer-events-none"
            style={{
              marginTop: -14,
              marginLeft: `${Math.min(projection.limit > 0 ? (projection.projected / projection.limit) * 100 : 0, 100)}%`,
              borderLeft: `2px dashed ${projection.isOverBudget ? 'var(--bad)' : 'var(--good)'}`,
              height: 10,
            }}
          />
        )}
        <div className="flex justify-between text-xs">
          <span className={
            status === 'exceeded' ? 'font-display tnum text-bad font-semibold' :
            status === 'warning' ? 'font-display tnum text-warn font-semibold' :
            'font-display tnum text-muted'
          }>
            {budget.currency === 'USD' ? 'USD ' : ''}
            {formatCurrency(spent)} gastados
          </span>
          <span className="font-display tnum text-muted">
            límite: {budget.currency === 'USD' ? 'USD ' : ''}
            {formatCurrency(limit)}
          </span>
        </div>
        {projection && (
          <div className={`text-[11px] font-medium ${projection.isOverBudget ? 'text-bad' : 'text-good'}`}>
            {projection.isOverBudget
              ? `Proyección: ${budget.currency === 'USD' ? 'USD ' : ''}${formatCurrency(projection.projected)} (excede por ${budget.currency === 'USD' ? 'USD ' : ''}${formatCurrency(projection.projected - projection.limit)})`
              : `Proyección: ${budget.currency === 'USD' ? 'USD ' : ''}${formatCurrency(projection.projected)}`
            }
          </div>
        )}
      </div>

      {/* Context message */}
      {status === 'exceeded' && (
        <p className="text-xs text-bad/80">
          Superaste el límite por {budget.currency === 'USD' ? 'USD ' : ''}
          {formatCurrency(spent - limit)}
        </p>
      )}
      {status === 'warning' && (
        <p className="text-xs text-warn/80">
          Solo te quedan {budget.currency === 'USD' ? 'USD ' : ''}
          {formatCurrency(limit - spent)} hasta el límite
        </p>
      )}
      {status === 'ok' && (
        <p className="text-xs text-muted">
          {(100 - percent).toFixed(0)}% disponible este mes
        </p>
      )}
    </div>
  )
}
