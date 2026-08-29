'use client'

import { useState, useEffect } from 'react'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency, formatUsd, cn } from '@/lib/utils'
import { budgetStatusLine, daysLeftInMonth } from '@/lib/utils/objetivos-copy'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { ActionSheet } from '@/components/ui/action-sheet'
import { ConfirmationModal } from '@/components/shared/confirmation-modal'
import { SwipeableRow } from '@/components/shared/swipeable-row'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EditBudgetDialog } from './edit-budget-dialog'
import { deleteCategoryBudget } from '@/app/dashboard/goals/actions'
import { Pencil, Trash2, MoreVertical } from 'lucide-react'
import { toast } from 'sonner'
import { useConfetti } from '@/components/shared/confetti'
import type { CategoryBudget } from '@/types/database'

interface Props {
  budget: CategoryBudget
}

/**
 * Un presupuesto mensual por categoría. Sin botones en la fila: editar y borrar
 * salen por tap (ActionSheet) o swipe en mobile, y por el kebab en desktop —
 * antes competían con el monto dentro de la misma línea.
 *
 * El emoji es el de la categoría del usuario: acá sí hay un ícono con
 * significado, así que la marca no se mete.
 */
/**
 * El badge de fin de mes aparece cuando el presupuesto viene bien y quedan 3
 * días o menos para que termine el mes. Puro para poder testearlo sin render.
 */
export function esFinDeMesConPresupuestoOk(
  status: string | undefined,
  hoy: Date = new Date(),
): boolean {
  if (status !== 'ok') return false
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  return hoy.getDate() >= ultimoDia - 3
}

export function CategoryBudgetCard({ budget }: Props) {
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  // El store entero, no sus getters sueltos (ver store-freshness.test.ts).
  const store = useFinanceStore()
  const { fetchGoalsData } = store
  const statusData = store.getCategoryBudgetStatus(budget.category_id)
  const projection = store.getBudgetProjection(budget.id)
  // Derivado: «el presupuesto va bien y estamos en los últimos días del mes».
  const showEndOfMonthBadge = esFinDeMesConPresupuestoOk(statusData?.status)
  const { celebrate } = useConfetti()
  const isMobile = useIsMobile()

  // El efecto queda sólo para el confetti y su marca en localStorage.
  useEffect(() => {
    if (!showEndOfMonthBadge) return
    if (typeof window === 'undefined') return
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const key = `confetti_budget_${budget.id}_${monthKey}`
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1')
      celebrate(true)
    }
  }, [showEndOfMonthBadge, budget.id, celebrate])

  if (!statusData) return null

  const { categoryName, categoryEmoji, spent, limit, percent, status } = statusData
  const money = (n: number) => (budget.currency === 'USD' ? formatUsd(n) : formatCurrency(n))

  const handleDelete = async () => {
    setDeleting(true)
    const res = await deleteCategoryBudget(budget.id)
    setDeleting(false)
    setConfirmOpen(false)
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

  const card = (
    <div
      className={cn(
        'group relative rounded-2xl border-[1.5px] border-border bg-surface p-3 px-3.5 grid gap-2 min-w-0',
        isMobile &&
          'cursor-pointer active:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      )}
      role={isMobile ? 'button' : undefined}
      tabIndex={isMobile ? 0 : undefined}
      aria-label={isMobile ? `Presupuesto de ${categoryName}. Abrir opciones.` : undefined}
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
      <div className="flex items-center gap-2 min-w-0">
        {categoryEmoji && <span className="text-[15px] flex-none">{categoryEmoji}</span>}
        <span className="min-w-0 flex-1 font-sans font-bold text-[13px] text-text truncate">{categoryName}</span>
        {showEndOfMonthBadge && (
          <span
            className="flex-none text-[10px] font-bold text-good border-[1.5px] border-good rounded-full px-2 py-0.5 leading-none"
            aria-label="Cerraste el mes dentro del presupuesto"
          >
            Al día
          </span>
        )}
        <span className="flex-none text-[12px] text-muted tnum whitespace-nowrap">
          <b className={status === 'exceeded' ? 'text-bad' : 'text-text'}>
            {money(spent)}
          </b>
          {' '}/ {money(limit)}
        </span>
      </div>

      <div>
        <ProgressBar
          value={Math.min(percent, 100)}
          tone={status === 'exceeded' ? 'bad' : status === 'warning' ? 'warn' : 'good'}
          height={7}
          label={`${categoryName}: ${Math.round(percent)}% del presupuesto`}
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

      <span className={`text-[11px] tnum ${lineaClase}`}>{linea.text}</span>

      {/* Desktop: las mismas dos acciones, en el kebab que aparece al pasar el mouse. */}
      {!isMobile && (
        <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Opciones del presupuesto de ${categoryName}`}
                className="h-8 w-8 text-muted hover:text-text hover:bg-surface-2"
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-surface border-[1.5px] border-border text-text">
              <DropdownMenuItem onClick={() => setEditOpen(true)} className="focus:bg-surface-2 cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Editar presupuesto
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
        title={`Eliminar el presupuesto de ${categoryName}`}
        description="Los gastos de la categoría quedan como están: se borra el límite, no los movimientos."
        onConfirm={handleDelete}
        isLoading={deleting}
        variant="destructive"
        confirmText="Eliminar presupuesto"
      />

      <SwipeableRow
        enabled={isMobile}
        onSwipeRight={() => setEditOpen(true)}
        onSwipeLeft={() => setConfirmOpen(true)}
      >
        {card}
      </SwipeableRow>

      <ActionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={`Presupuesto de ${categoryName}`}
        actions={[
          {
            label: 'Editar presupuesto',
            icon: <Pencil className="h-5 w-5" />,
            onClick: () => setEditOpen(true),
          },
          {
            label: 'Eliminar',
            icon: <Trash2 className="h-5 w-5" />,
            onClick: () => setConfirmOpen(true),
            variant: 'destructive' as const,
          },
        ]}
      />

      <EditBudgetDialog
        budget={budget}
        categoryName={categoryName}
        categoryEmoji={categoryEmoji}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  )
}
