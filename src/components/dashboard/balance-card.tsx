"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, CreditCard } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinanceStore } from "@/lib/store/financeStore"

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
    pendingFixedItems,
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
        <div className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-celeste">
              Tu plata libre para hoy
            </p>
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
            <span className="font-poster tnum text-[38px] leading-[0.95] text-cream-light min-w-0 truncate">
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
                  <span className="text-[13px] text-cream-light/80">Cuenta total</span>
                  <span className="font-poster tnum text-[13px] text-good">
                    +{formatCurrency(saldoBruto)}
                  </span>
                </div>

                {pendingFixedExpenses > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] text-cream-light/80">Gastos fijos por pagar</span>
                      <span className="font-poster tnum text-[13px] text-warn">
                        -{formatCurrency(pendingFixedExpenses)}
                      </span>
                    </div>
                    {pendingFixedItems.map((item) => (
                      <div key={item.id} className="flex justify-between items-center pl-3">
                        <span className="text-[11px] text-celeste/70">{item.name}</span>
                        <span className="font-poster tnum text-[11px] text-celeste/70">
                          -{formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {pendingCardTotal > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] text-cream-light/80 flex items-center gap-1.5">
                        <CreditCard className="h-3 w-3" />
                        Tarjeta de este mes
                      </span>
                      <span className="font-poster tnum text-[13px] text-bad">
                        -{formatCurrency(pendingCardTotal)}
                      </span>
                    </div>
                    {pendingCardItems.map((card) => (
                      <div key={card.methodId} className="flex justify-between items-center pl-3">
                        <span className="text-[11px] text-celeste/70">{card.name}</span>
                        <span className="font-poster tnum text-[11px] text-celeste/70">
                          -{formatCurrency(card.total)}
                        </span>
                      </div>
                    ))}
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
