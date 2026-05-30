'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, PiggyBank, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency } from '@/lib/utils'
import { createEndOfMonthSurplusTransfer } from '@/app/dashboard/actions'
import { cn } from '@/lib/utils'

export function EndOfMonthSavingsBanner() {
  const fetchAllData = useFinanceStore((s) => s.fetchAllData)
  const getMonthlyExpensesBreakdown = useFinanceStore((s) => s.getMonthlyExpensesBreakdown)
  const internalTransfers = useFinanceStore((s) => s.internalTransfers)

  const { suggestedAmount, alreadyTransferred } = useMemo(() => {
    const now = new Date()
    const periodMonthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const suggestedAmountValue = Math.max(getMonthlyExpensesBreakdown().netBalance, 0)
    const alreadyTransferredValue = internalTransfers.some((transfer) => {
      const transferMonth = transfer.period_date?.slice(0, 7)
      return transfer.transfer_type === 'end_of_month_surplus' && transferMonth === periodMonthValue
    })

    return {
      suggestedAmount: suggestedAmountValue,
      alreadyTransferred: alreadyTransferredValue,
    }
  }, [getMonthlyExpensesBreakdown, internalTransfers])
  const [isSaving, setIsSaving] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(true)

  const handleSaveSurplus = async () => {
    if (suggestedAmount <= 0 || alreadyTransferred) return

    setIsSaving(true)
    const res = await createEndOfMonthSurplusTransfer({ amount: suggestedAmount, currency: 'ARS' })

    if (res.error) {
      toast.error(res.error)
      setIsSaving(false)
      return
    }

    toast.success(`Guardaste ${formatCurrency(suggestedAmount)} en tu chanchito`)
    await fetchAllData()
    setIsSaving(false)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className={cn(
          'relative rounded-xl border border-emerald-500/30 bg-linear-to-br from-emerald-500/15 via-emerald-500/5 to-cyan-500/10 p-4'
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="rounded-lg bg-emerald-500/15 p-2 shrink-0">
              <PiggyBank className="h-4 w-4 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-emerald-100">Guardar sobrante en el chanchito</p>
              <p className="text-[11px] text-emerald-200/70">
                {alreadyTransferred
                  ? 'Ya transferiste este mes'
                  : suggestedAmount > 0
                    ? `Disponible para ahorrar: ${formatCurrency(suggestedAmount)}`
                    : 'Sin sobrante positivo por ahora'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="shrink-0 rounded-md p-1 text-emerald-200/80 hover:bg-emerald-500/10 hover:text-emerald-100 transition-colors"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expandir banner de ahorro' : 'Colapsar banner de ahorro'}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', !isCollapsed && 'rotate-180')} />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="pt-3 flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-emerald-300 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-emerald-200/80">
                    {suggestedAmount > 0
                      ? `Sugerencia actual: ${formatCurrency(suggestedAmount)} para pasar a ahorro y no sobreestimar tu disponible.`
                      : 'Cuando el resultado mensual sea positivo, vas a poder mover el sobrante directo desde acá.'}
                  </p>

                  <button
                    type="button"
                    onClick={handleSaveSurplus}
                    disabled={isSaving || alreadyTransferred || suggestedAmount <= 0}
                    className={cn(
                      'mt-3 inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold',
                      'bg-emerald-400 text-emerald-950 hover:bg-emerald-300 transition-colors',
                      'disabled:opacity-60 disabled:cursor-not-allowed'
                    )}
                  >
                    {isSaving
                      ? 'Guardando...'
                      : alreadyTransferred
                        ? 'Ya guardaste este mes'
                        : suggestedAmount <= 0
                          ? 'Sin sobrante por ahora'
                          : 'Guardar en Chanchito'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}
