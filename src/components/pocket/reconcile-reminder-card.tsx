'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, PencilLine } from 'lucide-react'
import { useFinanceStore } from '@/lib/store/financeStore'
import { CreateTransactionDialog } from '@/components/transactions/create-transaction-dialog'
import { AdjustBalanceDialog } from '@/components/pocket/adjust-balance-dialog'

const STORAGE_KEY = 'chanchito.reconcileReminderSnoozedUntil'
/** Dos días es agresivo a propósito, pero tiene que poder silenciarse. */
const DAYS_WITHOUT_REGISTERING = 2
const SNOOZE_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Camino principal de la conciliación: recuperar el dato antes de tocar el número.
 * Un gasto anotado conserva monto, categoría y medio; un ajuste borra esa información,
 * por eso "Ya anoté todo" es la opción secundaria.
 */
export function ReconcileReminderCard() {
  const days = useFinanceStore((s) => s.getDaysSinceLastRegistration())
  const [snoozed, setSnoozed] = useState(() => {
    if (typeof window === 'undefined') return false
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const until = Number(raw)
    return !isNaN(until) && Date.now() < until
  })
  const [anotando, setAnotando] = useState(false)
  const [ajustando, setAjustando] = useState(false)

  if (snoozed || days === null || days < DAYS_WITHOUT_REGISTERING) return null

  const posponer = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now() + SNOOZE_MS))
    setSnoozed(true)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative flex items-start gap-3 rounded-2xl border-[1.5px] border-border bg-surface p-4 pr-12"
      >
        <div className="rounded-lg bg-accent-soft/30 p-2 shrink-0 text-accent-deep">
          <PencilLine className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-sans text-sm font-bold text-text">¿Te falta anotar algo?</p>
          <p className="font-sans text-xs text-muted mt-0.5">
            Hace {days} días que no registrás nada. Si gastaste y no lo anotaste, tu plata libre
            está diciendo de más.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setAnotando(true)}
              className="inline-flex min-h-11 items-center font-sans text-xs font-bold text-text underline decoration-2 underline-offset-2"
            >
              Anotar ahora
            </button>
            <button
              type="button"
              onClick={() => setAjustando(true)}
              className="inline-flex min-h-11 items-center font-sans text-xs text-muted transition-colors hover:text-text"
            >
              Ya está todo anotado
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={posponer}
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-faint transition-colors hover:text-text"
          aria-label="Recordarme en 2 días"
          title="Recordarme en 2 días"
        >
          <X className="h-4 w-4" />
        </button>
      </motion.div>

      <CreateTransactionDialog open={anotando} onOpenChange={setAnotando} />
      <AdjustBalanceDialog open={ajustando} onOpenChange={setAjustando} />
    </>
  )
}
