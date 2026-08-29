'use client'

import { useState, useEffect } from 'react'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency, formatUsd, cn } from '@/lib/utils'
import { goalSubtitle } from '@/lib/utils/objetivos-copy'
import { ChanchoGauge } from '@/components/brand/chancho-gauge'
import { ActionSheet } from '@/components/ui/action-sheet'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmationModal } from '@/components/shared/confirmation-modal'
import { SwipeableRow } from '@/components/shared/swipeable-row'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { AddContributionDialog } from './add-contribution-dialog'
import { EditSavingsGoalDialog } from './edit-savings-goal-dialog'
import { deleteSavingsGoal } from '@/app/dashboard/goals/actions'
import { PiggyBank, Pencil, Trash2, History, MoreVertical } from 'lucide-react'
import { toast } from 'sonner'
import { useConfetti } from '@/components/shared/confetti'
import type { SavingsGoal } from '@/types/database'

interface Props {
  goal: SavingsGoal
}

/**
 * Una meta de ahorro. **La card no tiene botones**: el chancho medidor es el dato
 * y las acciones viven detrás del tap (ActionSheet) y del swipe, igual que un
 * movimiento o una cuota.
 *
 * Antes traía cuatro controles propios —aportar, historial, editar, borrar— con
 * el tacho a 4px del lápiz y ambos por debajo del mínimo táctil de 44px.
 *
 * `savings_goals` no tiene emoji en la base, así que el chancho es el único
 * distintivo visual de cada meta: llenándose según el progreso, deja de ser
 * decoración repetida y pasa a ser la información.
 */
export function SavingsGoalCard({ goal }: Props) {
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [contributeOpen, setContributeOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  // El store entero, no sus getters sueltos (ver store-freshness.test.ts).
  const store = useFinanceStore()
  const { fetchGoalsData, savingsGoalContributions } = store
  const progress = store.getSavingsGoalProgress(goal.id)
  // Derivado, no estado: ponerlo en un efecto costaba un render de más y
  // dibujaba «¡Lograda!» sin el 🎉 en la primera pasada.
  const showCelebration = (progress?.percent ?? 0) >= 100
  const { celebrate } = useConfetti()
  const isMobile = useIsMobile()

  // El efecto queda sólo para lo que de verdad es un efecto: tirar el confetti
  // una única vez y dejar la marca en localStorage.
  useEffect(() => {
    if (!showCelebration) return
    if (typeof window === 'undefined') return
    const key = `confetti_goal_${goal.id}`
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1')
      celebrate()
    }
  }, [showCelebration, goal.id, celebrate])

  if (!progress) return null

  const { percent, totalContributed, currentMonthContributed, status } = progress
  const effectiveContributed = goal.type === 'monthly' ? currentMonthContributed : totalContributed
  const aportes = savingsGoalContributions.filter((c) => c.goal_id === goal.id).length
  const lograda = status === 'completed'
  // En dólares va `u$s`, no `US$ $`: formatCurrency ya trae su propio símbolo.
  const money = (n: number) => (goal.currency === 'USD' ? formatUsd(n) : formatCurrency(n))

  const handleDelete = async () => {
    setDeleting(true)
    const res = await deleteSavingsGoal(goal.id)
    setDeleting(false)
    setConfirmOpen(false)
    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success('Meta eliminada')
      await fetchGoalsData()
    }
  }

  const card = (
    <div
      className={cn(
        'group relative h-full rounded-[18px] border-[1.5px] border-border bg-surface shadow-card p-3.5 grid gap-2 min-w-0 content-start',
        isMobile &&
          'cursor-pointer active:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      )}
      role={isMobile ? 'button' : undefined}
      tabIndex={isMobile ? 0 : undefined}
      aria-label={isMobile ? `${goal.name}, ${Math.round(percent)}% de la meta. Abrir opciones.` : undefined}
      onClick={isMobile ? () => setSheetOpen(true) : undefined}
      onKeyDown={
        isMobile
          ? (e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              setSheetOpen(true)
            }
          : undefined
      }
    >
      <div className="flex items-center gap-3 min-w-0">
        <ChanchoGauge
          percent={percent}
          className={cn('w-[46px] flex-none', lograda ? 'text-good' : 'text-accent')}
          slot="var(--surface)"
          title={`${Math.round(percent)}% de ${goal.name}`}
        />
        <span
          className={cn(
            'ml-auto font-display tnum text-[15px] flex-none',
            lograda ? 'text-good' : 'text-accent-deep',
          )}
        >
          {Math.round(percent)}%
        </span>
      </div>

      <div className="min-w-0 grid gap-px">
        <span className="font-sans font-bold text-[13.5px] text-text truncate">{goal.name}</span>
        <span className="text-[11.5px] text-muted truncate">{goalSubtitle(goal)}</span>
      </div>

      <div className="text-[12px] text-muted tnum min-w-0">
        <b className="text-text">{money(effectiveContributed)}</b>
        <span className="text-faint"> de </span>
        {money(Number(goal.target_amount))}
      </div>

      {lograda && (
        <span className="text-[11.5px] font-bold text-good">
          ¡Lograda!{showCelebration ? ' 🎉' : ''}
        </span>
      )}

      {/* Desktop no tiene gesto ni tap: las mismas acciones, en el kebab de siempre. */}
      {!isMobile && (
        <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Opciones de ${goal.name}`}
                className="h-8 w-8 text-muted hover:text-text hover:bg-surface-2"
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-surface border-[1.5px] border-border text-text">
              <DropdownMenuItem onClick={() => setContributeOpen(true)} className="focus:bg-surface-2 cursor-pointer">
                <PiggyBank className="mr-2 h-4 w-4" />
                Aportar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditOpen(true)} className="focus:bg-surface-2 cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Editar meta
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setConfirmOpen(true)}
                disabled={deleting}
                className="text-bad focus:bg-bad/10 focus:text-bad cursor-pointer"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )

  return (
    <>
      <ConfirmationModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Eliminar «${goal.name}»`}
        description="Se borra la meta y todos sus aportes. No se puede deshacer."
        onConfirm={handleDelete}
        isLoading={deleting}
        variant="destructive"
        confirmText="Eliminar meta"
      />

      <SwipeableRow
        enabled={isMobile}
        rounded="rounded-[18px]"
        rightLabel="Aportar"
        onSwipeRight={() => setContributeOpen(true)}
        onSwipeLeft={() => setConfirmOpen(true)}
      >
        {card}
      </SwipeableRow>

      <ActionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={goal.name}
        actions={[
          {
            label: 'Aportar',
            icon: <PiggyBank className="h-5 w-5" />,
            onClick: () => setContributeOpen(true),
          },
          {
            label: 'Editar meta',
            icon: <Pencil className="h-5 w-5" />,
            onClick: () => setEditOpen(true),
          },
          {
            label: aportes > 0 ? `Ver los ${aportes} aportes` : 'Todavía no hay aportes',
            icon: <History className="h-5 w-5" />,
            onClick: () => setContributeOpen(true),
            disabled: aportes === 0,
            disabledHint: 'Cargá el primero desde «Aportar».',
          },
          {
            label: 'Eliminar',
            icon: <Trash2 className="h-5 w-5" />,
            onClick: () => setConfirmOpen(true),
            variant: 'destructive' as const,
          },
        ]}
      />

      <AddContributionDialog goal={goal} open={contributeOpen} onOpenChange={setContributeOpen} />
      <EditSavingsGoalDialog goal={goal} open={editOpen} onOpenChange={setEditOpen} />
    </>
  )
}
