'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { motion } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import { CreditCardCycleChip } from '@/components/compromisos/credit-card-cycle-card'
import { useFinanceStore } from '@/lib/store/financeStore'
import { avisoDeVencidos } from '@/lib/utils/compromisos-copy'

/**
 * Aviso de resúmenes de tarjeta que ya vencieron y no tienen pago registrado.
 *
 * A diferencia de los otros dos banners del home, este NO se puede descartar, y es
 * deliberado: mientras el resumen siga sin marcarse, `computePendingCreditCards` lo
 * retiene y ese monto sigue restado del disponible. Esconder el aviso dejaría al
 * usuario con la plata retenida y sin ninguna explicación a la vista de por qué su
 * número está más bajo. El banner de tarjetas incompletas es informativo y el de
 * conciliación es una sugerencia; este es la explicación de una cifra y la única
 * manera de saldarla, así que se queda hasta que se resuelva.
 *
 * El chip de pago es el MISMO de /compromisos: reusarlo evita una segunda forma de
 * registrar un pago, y conserva la elección del medio con el que se paga.
 */
export function OverdueCardPaymentBanner() {
  // El store entero, no sus getters sueltos: son referencias estables y el
  // React Compiler congelaría el resultado (ver store-freshness.test.ts).
  const store = useFinanceStore()
  const cards = store.getPendingCreditCardByCard()
  const aviso = avisoDeVencidos(cards)
  if (!aviso) return null

  const vencidos = cards.filter((c) => c.isOverdue)

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border-[1.5px] border-warn/40 bg-warn/10 p-4 flex items-start gap-3"
    >
      <div className="rounded-lg bg-warn/15 p-2 shrink-0">
        <AlertCircle className="h-4 w-4 text-warn" aria-hidden="true" />
      </div>

      <div className="flex-1 min-w-0 grid gap-2.5">
        <div>
          <p className="text-sm font-bold font-sans text-text">{aviso.titulo}</p>
          <p className="text-xs text-muted mt-0.5">{aviso.detalle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {vencidos.map((card) => (
            <CreditCardCycleChip
              key={card.methodId}
              card={card}
              formattedDate={format(card.nextPaymentDate, "d 'de' MMM", { locale: es })}
            />
          ))}
        </div>
      </div>
    </motion.div>
  )
}
