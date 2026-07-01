'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { AddContributionDialog } from './add-contribution-dialog'
import { EditSavingsGoalDialog } from './edit-savings-goal-dialog'
import { deleteSavingsGoal } from '@/app/dashboard/goals/actions'
import { Trash2, Calendar, RefreshCw, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
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

  const { percent, totalContributed, currentMonthContributed, remaining, daysLeft, status } = progress
  const effectiveContributed = goal.type === 'monthly' ? currentMonthContributed : totalContributed

  const progressTone = status === 'completed' ? 'good' : percent >= 75 ? 'accent' : 'accent'

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
    <div className="rounded-2xl border-[1.5px] border-border bg-surface p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {goal.type === 'one_time' ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-accent/20 text-accent bg-accent-soft/30">
                <Calendar className="w-2.5 h-2.5" />
                Meta única
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-border text-muted bg-surface-2">
                <RefreshCw className="w-2.5 h-2.5" />
                Mensual
              </span>
            )}
            {status === 'completed' && showCelebration && (
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2 }}
              >
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-good/10 text-good border border-good/20">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  ¡Meta cumplida! 🎉
                </span>
              </motion.div>
            )}
            {status === 'completed' && !showCelebration && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-good/10 text-good border border-good/20">
                <CheckCircle2 className="w-2.5 h-2.5" />
                ¡Lograda!
              </span>
            )}
          </div>
          <h3 className="font-sans font-bold text-text truncate">{goal.name}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <EditSavingsGoalDialog goal={goal} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Eliminar meta"
            className="h-11 w-11 text-muted hover:text-bad hover:bg-bad/10"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between items-end text-sm">
          <span className="font-poster tnum text-[14px] text-good">
            {goal.currency === 'USD' ? 'USD ' : ''}
            {formatCurrency(effectiveContributed)}
          </span>
          <span className="font-poster tnum text-[13px] text-text">
            de {goal.currency === 'USD' ? 'USD ' : ''}
            {formatCurrency(goal.target_amount)}
          </span>
        </div>
        <ProgressBar value={percent} tone={progressTone} />
        <div className="flex justify-between items-center text-[11px] text-muted">
          <span>{percent.toFixed(1)}% completado</span>
          {goal.type === 'one_time' && daysLeft !== null && (
            <span className={daysLeft < 30 ? 'text-warn' : ''}>
              {daysLeft > 0 ? `${daysLeft} días restantes` : daysLeft === 0 ? '¡Hoy es el día!' : 'Fecha vencida'}
            </span>
          )}
          {goal.type === 'monthly' && (
            <span>Se resetea el 1° del próximo mes</span>
          )}
        </div>
      </div>

      {/* Remaining */}
      {status !== 'completed' && remaining > 0 && (
        <p className="text-xs text-muted">
          Te faltan <span className="text-text font-bold">
            {goal.currency === 'USD' ? 'USD ' : ''}{formatCurrency(remaining)}
          </span> para llegar a tu meta
          {goal.type === 'monthly' ? ' este mes' : ''}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 flex-col gap-2">
        <AddContributionDialog goal={goal} />
        {goalContributions.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-muted hover:text-text flex items-center gap-1 transition-colors"
          >
            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showHistory ? 'Ocultar' : `${goalContributions.length} aportes`}
          </button>
        )}
      </div>

      {/* Contribution history */}
      {showHistory && goalContributions.length > 0 && (
        <div className="border-t border-border pt-3 space-y-2">
          {goalContributions.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs">
              <div>
                <span className="text-muted">{c.date}</span>
                {c.note && <span className="text-faint ml-2 italic">{c.note}</span>}
              </div>
              <span className="text-good font-poster tnum">
                +{c.currency === 'USD' ? 'USD ' : ''}{formatCurrency(c.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
