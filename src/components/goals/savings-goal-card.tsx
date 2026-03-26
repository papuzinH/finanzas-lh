'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

  const barColor =
    status === 'completed' ? 'bg-emerald-500' :
    percent >= 75 ? 'bg-teal-400' :
    percent >= 40 ? 'bg-indigo-400' :
    'bg-slate-500'

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
    <div className="rounded-2xl border border-slate-800 bg-surface-raised/40 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {goal.type === 'one_time' ? (
              <Badge variant="outline" className="border-indigo-700/50 text-indigo-300 text-[10px] px-2 py-0">
                <Calendar className="w-2.5 h-2.5 mr-1" />
                Meta única
              </Badge>
            ) : (
              <Badge variant="outline" className="border-teal-700/50 text-teal-300 text-[10px] px-2 py-0">
                <RefreshCw className="w-2.5 h-2.5 mr-1" />
                Mensual
              </Badge>
            )}
            {status === 'completed' && showCelebration && (
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2 }}
              >
                <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px] px-2 py-0">
                  <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                  ¡Meta cumplida! 🎉
                </Badge>
              </motion.div>
            )}
            {status === 'completed' && !showCelebration && (
              <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px] px-2 py-0">
                <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                ¡Lograda!
              </Badge>
            )}
          </div>
          <h3 className="font-semibold text-slate-100 truncate">{goal.name}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <EditSavingsGoalDialog goal={goal} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Eliminar meta"
            className="h-11 w-11 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
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
          <span className="text-slate-400">
            {goal.currency === 'USD' ? 'USD ' : ''}
            {formatCurrency(effectiveContributed)}
          </span>
          <span className="font-semibold text-slate-200">
            de {goal.currency === 'USD' ? 'USD ' : ''}
            {formatCurrency(goal.target_amount)}
          </span>
        </div>
        <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-[11px] text-slate-500">
          <span>{percent.toFixed(1)}% completado</span>
          {goal.type === 'one_time' && daysLeft !== null && (
            <span className={daysLeft < 30 ? 'text-amber-400' : ''}>
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
        <p className="text-xs text-slate-500">
          Te faltan <span className="text-slate-300 font-medium">
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
            className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
          >
            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showHistory ? 'Ocultar' : `${goalContributions.length} aportes`}
          </button>
        )}
      </div>

      {/* Contribution history */}
      {showHistory && goalContributions.length > 0 && (
        <div className="border-t border-slate-800 pt-3 space-y-2">
          {goalContributions.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400">{c.date}</span>
                {c.note && <span className="text-slate-500 ml-2 italic">{c.note}</span>}
              </div>
              <span className="text-emerald-400 font-medium font-mono">
                +{c.currency === 'USD' ? 'USD ' : ''}{formatCurrency(c.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
