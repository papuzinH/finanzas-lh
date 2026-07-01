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
        className="relative rounded-xl border-[1.5px] border-good/25 bg-good/8 p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="rounded-lg bg-good/12 p-2 shrink-0">
              <PiggyBank className="h-4 w-4 text-good" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">Guardar sobrante en el chanchito</p>
              <p className="text-[11px] text-muted">
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
            className="shrink-0 rounded-md p-2 text-muted hover:bg-good/10 hover:text-good transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-good/50"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expandir banner de ahorro' : 'Colapsar banner de ahorro'}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', !isCollapsed && 'rotate-180')} aria-hidden="true" />
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
              <div className=" flex items-start gap-2">
                {suggestedAmount < 0 && <Sparkles className="h-4 w-4 text-good mt-0.5 shrink-0" aria-hidden="true" />}
                <div className="flex-1 min-w-0">
                  {suggestedAmount < 0 &&
                    <p className="text-xs text-muted">
                      Cuando el resultado mensual sea positivo, vas a poder mover el sobrante directo desde acá.
                    </p>
                  }

                  <button
                    type="button"
                    onClick={handleSaveSurplus}
                    disabled={isSaving || alreadyTransferred || suggestedAmount <= 0}
                    className={cn(
                      'mt-3 inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold min-h-11',
                      'bg-good text-accent-ink hover:opacity-90 active:scale-[0.98] transition-all duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-good/50',
                      'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100'
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
