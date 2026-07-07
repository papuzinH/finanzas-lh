"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, CreditCard } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { useFinanceStore } from "@/lib/store/financeStore"
import { InfoHint } from "@/components/ui/info-hint"

// Frena la propagación del click/teclado para que tocar un botón de info
// no colapse la hero card (que es clickeable para expandir/contraer).
function HintStop({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </span>
  )
}

// Count-up animado con requestAnimationFrame
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0)
  const frameRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const prevTargetRef = useRef<number>(0)

  useEffect(() => {
    const from = prevTargetRef.current
    prevTargetRef.current = target

    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    startRef.current = null

    const animate = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(from + (target - from) * eased)
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      }
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [target, duration])

  return value
}

export function BalanceCard() {
  const [expanded, setExpanded] = useState(false)
  const getRealAvailableBalance = useFinanceStore((s) => s.getRealAvailableBalance)
  const {
    saldoBruto,
    pendingFixedExpenses,
    pendingCardTotal,
    pendingCardItems,
    disponibleReal,
  } = getRealAvailableBalance()

  const animatedBalance = useCountUp(disponibleReal)
  const isNegative = disponibleReal < 0

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount))

  return (
    <div>
      <motion.div
        className="rounded-2xl bg-hero text-cream overflow-hidden cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        style={{ boxShadow: '0 18px 36px -18px rgba(28,42,71,0.7)' }}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
        whileTap={{ scale: 0.99 }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Ver desglose de tu plata disponible"
      >
        {/* Header siempre visible */}
        <div className="p-5 lg:p-6">
          <div className="flex items-center gap-1.5 mb-1">
            <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-celeste">
              Tu plata libre para hoy
            </p>
            <HintStop>
              <InfoHint label="Qué es tu plata libre para hoy" className="text-celeste/70 hover:text-cream">
                Lo que realmente podés gastar hoy sin comprometerte: tu plata en cuentas menos lo que
                ya debés este mes (gastos fijos sin pagar + tarjeta sin pagar). No importa cuándo
                cobres. Al pagar algo pendiente, este número no cambia: esa plata ya estaba apartada.
              </InfoHint>
            </HintStop>
            <motion.div
              className="ml-auto"
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4 text-celeste/70" aria-hidden="true" />
            </motion.div>
          </div>

          {/* Disponible Real */}
          <div className="flex items-baseline gap-2 mt-1 overflow-hidden">
            <span className="font-poster tnum text-[38px] lg:text-[46px] leading-[0.95] text-cream-light min-w-0 truncate">
              {isNegative ? "-" : ""}
              {formatCurrency(animatedBalance)}
            </span>
          </div>
        </div>

        {/* Detalle expandible */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="border-t border-cream-light/15 px-5 py-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-cream-light/80">
                    Cuenta total
                    <HintStop>
                      <InfoHint label="Cómo se calcula la cuenta total" className="text-celeste/70 hover:text-cream">
                        Toda tu plata acumulada: ingresos menos gastos, cuotas y ahorros de todo tu
                        historial. Es lo que tenés en cuentas hoy, antes de apartar lo que debés este mes.
                      </InfoHint>
                    </HintStop>
                  </span>
                  <span className="font-poster tnum text-[13px] text-good">
                    +{formatCurrency(saldoBruto)}
                  </span>
                </div>

                {pendingFixedExpenses > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-cream-light/80">
                      Gastos fijos por pagar
                      <HintStop>
                        <InfoHint label="Cómo se calculan los gastos fijos por pagar" className="text-celeste/70 hover:text-cream">
                          Tus mensualidades activas (alquiler, internet, etc.) que todavía no
                          marcaste como pagadas este mes. Al marcarlas pagadas en Compromisos, salen
                          de acá y tu plata libre no cambia.
                        </InfoHint>
                      </HintStop>
                    </span>
                    <span className="font-poster tnum text-[13px] text-warn">
                      -{formatCurrency(pendingFixedExpenses)}
                    </span>
                  </div>
                )}

                {pendingCardTotal > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] text-cream-light/80 flex items-center gap-1.5">
                        <CreditCard className="h-3 w-3" />
                        Tarjeta de este mes
                        <HintStop>
                          <InfoHint label="Cómo se calcula la tarjeta de este mes" className="text-celeste/70 hover:text-cream">
                            El total del resumen de tus tarjetas de crédito que vence este ciclo y
                            todavía no pagaste. Al marcarlo pagado en Compromisos, tu plata libre no
                            cambia: ese gasto ya estaba contado.
                          </InfoHint>
                        </HintStop>
                      </span>
                      <span className="font-poster tnum text-[13px] text-bad">
                        -{formatCurrency(pendingCardTotal)}
                      </span>
                    </div>

                    {/* Detalle por tarjeta con su fecha de vencimiento vigente */}
                    <ul className="pl-[18px] space-y-1">
                      {pendingCardItems.map((card) => (
                        <li key={card.methodId} className="flex justify-between items-baseline gap-2">
                          <span className="min-w-0 truncate text-[11px] text-cream-light/60">
                            {card.name} · {card.isCycleClosed ? "cerrado" : "en curso"} · vence{" "}
                            {format(card.nextPaymentDate, "d MMM", { locale: es })}
                          </span>
                          <span className="shrink-0 font-poster tnum text-[11px] text-cream-light/70">
                            -{formatCurrency(card.total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-2 border-t border-cream-light/15">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-cream-light/70">Disponible Real</span>
                    <span className={cn("font-poster tnum text-[15px]", isNegative ? "text-bad" : "text-good")}>
                      {isNegative ? "-" : "+"}{formatCurrency(disponibleReal)}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
