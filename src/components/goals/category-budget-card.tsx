'use client'

import { useState, useEffect } from 'react'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency } from '@/lib/utils'
import { budgetStatusLine, daysLeftInMonth } from '@/lib/utils/objetivos-copy'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { EditBudgetDialog } from './edit-budget-dialog'
import { deleteCategoryBudget } from '@/app/dashboard/goals/actions'
import { Trash2 } from 'lucide-react'
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

  const linea = budgetStatusLine({
    percent,
    spent,
    limit,
    currency: budget.currency,
    status,
    daysLeft: daysLeftInMonth(),
  })
  const lineaClase =
    linea.tone === 'bad' ? 'text-bad font-bold' : linea.tone === 'warn' ? 'text-warn font-bold' : 'text-muted'

  return (
    <div className="rounded-2xl border-[1.5px] border-border bg-surface p-3 px-3.5 grid gap-2">
      {/* Fila principal: emoji + nombre + montos + acciones */}
      <div className="flex items-center gap-2">
        {categoryEmoji && <span className="text-[15px]">{categoryEmoji}</span>}
        <span className="font-sans font-bold text-[13px] text-text truncate">{categoryName}</span>
        {showEndOfMonthBadge && (
          <span className="text-[10px] font-bold text-good" aria-label="Dentro del presupuesto">✓</span>
        )}
        <span className="ml-auto text-[12px] text-muted tnum whitespace-nowrap">
          <b className={status === 'exceeded' ? 'text-bad' : 'text-text'}>
            {budget.currency === 'USD' ? 'USD ' : ''}{formatCurrency(spent)}
          </b>
          {' '}/ {budget.currency === 'USD' ? 'USD ' : ''}{formatCurrency(limit)}
        </span>
        <div className="flex items-center shrink-0 -mr-1">
          <EditBudgetDialog budget={budget} categoryName={categoryName} categoryEmoji={categoryEmoji} />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Eliminar presupuesto de ${categoryName}`}
            className="h-9 w-9 text-muted hover:text-bad hover:bg-bad/10"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Barra + marcador de proyección (se conserva) */}
      <div>
        <ProgressBar
          value={Math.min(percent, 100)}
          tone={status === 'exceeded' ? 'bad' : status === 'warning' ? 'warn' : 'good'}
          height={7}
        />
        {projection && (
          <div
            className="relative h-0 pointer-events-none"
            style={{
              marginTop: -11,
              marginLeft: `${Math.min(projection.limit > 0 ? (projection.projected / projection.limit) * 100 : 0, 100)}%`,
              borderLeft: `2px dashed ${projection.isOverBudget ? 'var(--bad)' : 'var(--good)'}`,
              height: 7,
            }}
          />
        )}
      </div>

      {/* Línea de estado — copy del mock */}
      <span className={`text-[11px] ${lineaClase}`}>{linea.text}</span>
    </div>
  )
}
