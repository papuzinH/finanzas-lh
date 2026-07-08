'use client'

import Link from 'next/link'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, ArrowRight, X, CreditCard } from 'lucide-react'
import { useFinanceStore } from '@/lib/store/financeStore'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'chanchito.incompleteCardsBannerDismissedAt'
/** El banner se vuelve a mostrar después de 7 días de descartado */
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Banner que aparece cuando hay tarjetas de crédito sin día de cierre
 * o vencimiento configurado. El usuario puede:
 * - Ir a /medios-pago a completarlas (CTA)
 * - Descartarlo (vuelve a aparecer en 7 días)
 *
 * Se muestra solo si hay >=1 tarjeta credit incompleta y el usuario no
 * descartó en los últimos 7 días.
 */
export function IncompleteCreditCardsBanner() {
  const paymentMethods = useFinanceStore((s) => s.paymentMethods)
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const dismissedAt = Number(raw)
    if (isNaN(dismissedAt)) return false
    return Date.now() - dismissedAt < DISMISS_DURATION_MS
  })

  const incomplete = paymentMethods.filter(
    (m) =>
      m.type === 'credit' &&
      (m.default_closing_day == null || m.default_payment_day == null)
  )

  if (dismissed || incomplete.length === 0) return null

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()))
    setDismissed(true)
  }

  const count = incomplete.length
  const namesList = incomplete.slice(0, 3).map((m) => m.name).join(', ')
  const extra = count > 3 ? ` y ${count - 3} más` : ''

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className={cn(
          'relative rounded-xl border-[1.5px] border-warn/40 bg-warn/10 p-4',
          'flex items-start gap-3'
        )}
      >
        <div className="rounded-lg bg-warn/15 p-2 shrink-0">
          <CreditCard className="h-4 w-4 text-warn" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-warn mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text">
                {count === 1
                  ? 'Tu tarjeta no tiene cierre/vencimiento'
                  : `${count} tarjetas sin cierre/vencimiento`}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {namesList}{extra}. Completalas para que Chanchito pueda
                calcular bien las cuotas y avisarte de los vencimientos.
              </p>
            </div>
          </div>

          <Link
            href="/ajustes/medios"
            className="inline-flex items-center gap-1 mt-2.5 text-xs font-medium text-warn hover:text-warn/80 transition-colors"
          >
            Completar ahora
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded hover:bg-warn/10 text-warn/70 hover:text-warn transition-colors"
          aria-label="Descartar aviso"
          title="Recordame en 7 días"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    </AnimatePresence>
  )
}
