'use client'

import { useState, useEffect } from 'react'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency } from '@/lib/utils'
import { goalSubtitle } from '@/lib/utils/objetivos-copy'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Chancho } from '@/components/brand/chancho'
import { AddContributionDialog } from './add-contribution-dialog'
import { EditSavingsGoalDialog } from './edit-savings-goal-dialog'
import { deleteSavingsGoal } from '@/app/dashboard/goals/actions'
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { useConfetti } from '@/components/shared/confetti'
import type { SavingsGoal } from '@/types/database'

interface Props {
  goal: SavingsGoal
}

export function SavingsGoalCard({ goal }: Props) {
  const [deleting, setDeleting] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const { getSavingsGoalProgress, savingsGoalContributions, fetchGoalsData } = useFinanceStore()
  const progress = getSavingsGoalProgress(goal.id)
  const { celebrate } = useConfetti()

  useEffect(() => {
    if (!progress) return
    if (progress.percent < 100) return
    const key = `confetti_goal_${goal.id}`
    if (typeof window !== 'undefined' && !localStorage.getItem(key)) {
      localStorage.setItem(key, '1')
      celebrate()
      setShowCelebration(true)
    } else if (typeof window !== 'undefined' && localStorage.getItem(key)) {
      setShowCelebration(true)
    }
  }, [progress?.percent, goal.id, celebrate])

  if (!progress) return null

  const { percent, totalContributed, currentMonthContributed, remaining, status } = progress
  const effectiveContributed = goal.type === 'monthly' ? currentMonthContributed : totalContributed

  const goalContributions = savingsGoalContributions
    .filter((c) => c.goal_id === goal.id)
    .slice(0, 5)

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar la meta "${goal.name}"? También se eliminarán todos sus aportes.`)) return
    setDeleting(true)
    const res = await deleteSavingsGoal(goal.id)
    setDeleting(false)
    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success('Meta eliminada')
      await fetchGoalsData()
    }
  }

  return (
    <div className="rounded-[18px] border-[1.5px] border-border bg-surface shadow-card p-3.5 grid gap-2.5">
      {/* Fila principal: slot + nombre/sub + % */}
      <div className="flex items-center gap-2.5">
        <span className="w-[38px] h-[38px] flex-none grid place-items-center bg-surface-2 border-[1.5px] border-border rounded-xl text-accent-deep">
          <Chancho className="w-[21px]" slot="var(--surface-2)" />
        </span>
        <div className="min-w-0 grid gap-px">
          <span className="font-sans font-bold text-[13.5px] text-text truncate">{goal.name}</span>
          <span className="text-[11.5px] text-muted truncate">{goalSubtitle(goal)}</span>
        </div>
        <span className={`ml-auto font-display tnum text-[15px] ${status === 'completed' ? 'text-good' : 'text-accent-deep'}`}>
          {Math.round(percent)}%
        </span>
      </div>

      {/* Barra */}
      <ProgressBar value={percent} tone={status === 'completed' ? 'good' : 'accent'} height={8} />

      {/* Pie de montos */}
      <div className="flex justify-between text-[12px] text-muted tnum">
        <span>
          <b className="text-text">{goal.currency === 'USD' ? 'USD ' : ''}{formatCurrency(effectiveContributed)}</b>
          {' '}de {goal.currency === 'USD' ? 'USD ' : ''}{formatCurrency(goal.target_amount)}
        </span>
        {status === 'completed' ? (
          <span className="text-good font-bold">¡Lograda!{showCelebration ? ' 🎉' : ''}</span>
        ) : (
          <span>faltan {goal.currency === 'USD' ? 'USD ' : ''}{formatCurrency(remaining)}</span>
        )}
      </div>

      {/* Acciones — el mock no las dibuja; se conservan compactas */}
      <div className="flex items-center justify-between border-t border-border pt-2.5">
        <AddContributionDialog goal={goal} />
        <div className="flex items-center gap-0.5">
          {goalContributions.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-[11px] text-muted hover:text-text flex items-center gap-1 transition-colors px-2 py-1.5"
            >
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {goalContributions.length} aportes
            </button>
          )}
          <EditSavingsGoalDialog goal={goal} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Eliminar meta"
            className="h-9 w-9 text-muted hover:text-bad hover:bg-bad/10"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Historial de aportes (se conserva) */}
      {showHistory && goalContributions.length > 0 && (
        <div className="border-t border-border pt-2.5 space-y-2">
          {goalContributions.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs">
              <div>
                <span className="text-muted">{c.date}</span>
                {c.note && <span className="text-faint ml-2 italic">{c.note}</span>}
              </div>
              <span className="text-good font-display tnum">
                +{c.currency === 'USD' ? 'USD ' : ''}{formatCurrency(c.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
