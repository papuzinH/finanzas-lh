"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Minus, CreditCard, Check, Clock } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { useFinanceStore } from "@/lib/store/financeStore"

interface BalanceCardProps {
  monthlyIncome: number
  monthlyExpenses: number
  installments: number
  burnRate: number
  savingsTransfers?: number
  currency?: string
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

export function BalanceCard({
  monthlyIncome,
  monthlyExpenses,
  installments,
  burnRate,
  savingsTransfers = 0,
}: BalanceCardProps) {
  const [expanded, setExpanded] = useState(false)
  const getMonthlyComparison = useFinanceStore((s) => s.getMonthlyComparison)
  const getPendingCreditCardByCard = useFinanceStore((s) => s.getPendingCreditCardByCard)
  const comparison = getMonthlyComparison()
  const allCreditCards = getPendingCreditCardByCard()
  const pendingCards = allCreditCards.filter((c) => c.isPending)
  const pendingCreditTotal = pendingCards.reduce((acc, c) => acc + c.total, 0)
  const hasCreditCards = allCreditCards.length > 0
  const allCardsPaid = hasCreditCards && pendingCards.length === 0

  const totalMonthlySpend = monthlyExpenses + installments + burnRate + savingsTransfers
  const monthBalance = monthlyIncome - totalMonthlySpend
  const balanceAfterCards = monthBalance - pendingCreditTotal
  const isPositive = monthBalance >= 0

  const spendPercent = monthlyIncome > 0 ? (totalMonthlySpend / monthlyIncome) * 100 : 0

  const { percentageChange } = comparison
  const trendUp = percentageChange > 1
  const trendDown = percentageChange < -1
  const trendNeutral = !trendUp && !trendDown

  const animatedBalance = useCountUp(monthBalance)

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount))

  // Color de la barra de progreso según porcentaje de gasto
  const progressColor =
    spendPercent > 90
      ? "var(--bad)"
      : spendPercent > 70
      ? "var(--warn)"
      : "var(--good)"

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
        aria-label="Ver desglose del balance mensual"
      >
        {/* Header siempre visible */}
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            {/* Left: balance + resumen */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-celeste">
                  Saldo del mes
                </p>
                <motion.div
                  className="ml-auto"
                  animate={{ rotate: expanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-4 w-4 text-celeste/70" aria-hidden="true" />
                </motion.div>
              </div>

              {/* Balance principal */}
              <div className="flex items-baseline gap-2 mt-1 overflow-hidden">
                <span className="font-poster tnum text-[38px] leading-[0.95] text-cream-light min-w-0 truncate">
                  {monthBalance < 0 ? "-" : ""}
                  {formatCurrency(animatedBalance)}
                </span>
              </div>

              {/* Sub-tarjetas ingresos / gastos */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-cream-light/10 border border-cream-light/15 px-3 py-2">
                  <div className="flex items-center gap-1 text-celeste text-[10px] font-bold uppercase tracking-wider mb-0.5">
                    <ArrowUpRight size={12} strokeWidth={2.6} />
                    Ingresos
                  </div>
                  <p className="font-poster tnum text-[15px] text-good truncate">
                    {formatCurrency(monthlyIncome)}
                  </p>
                </div>
                <div className="rounded-xl bg-cream-light/10 border border-cream-light/15 px-3 py-2">
                  <div className="flex items-center gap-1 text-celeste text-[10px] font-bold uppercase tracking-wider mb-0.5">
                    <ArrowDownRight size={12} strokeWidth={2.6} />
                    Gastos
                  </div>
                  <p className="font-poster tnum text-[15px] text-bad truncate">
                    {formatCurrency(totalMonthlySpend)}
                  </p>
                </div>
              </div>

              {/* Tendencia + badge tarjetas */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-light/12 px-2.5 py-1 text-[11.5px] font-bold text-celeste">
                  {trendUp && <><TrendingUp size={13} /> +{Math.abs(percentageChange).toFixed(1)}% vs anterior</>}
                  {trendDown && <><TrendingDown size={13} /> -{Math.abs(percentageChange).toFixed(1)}% vs anterior</>}
                  {trendNeutral && <><Minus size={13} /> Similar al anterior</>}
                </span>

                {hasCreditCards && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full",
                      allCardsPaid
                        ? "bg-cream-light/12 text-celeste"
                        : "bg-warn/20 text-warn"
                    )}
                  >
                    {allCardsPaid
                      ? <><Check size={11} />Tarjetas al día</>
                      : <><Clock size={11} />{pendingCards.length === 1 ? "1 tarjeta pendiente" : `${pendingCards.length} pendientes`}</>
                    }
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Barra de progreso */}
          <div
            className="mt-4 h-1.5 w-full rounded-full bg-cream-light/15 overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(spendPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Gasto del mes: ${Math.round(spendPercent)}%`}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: progressColor }}
              initial={{ width: "0%" }}
              animate={{ width: `${Math.min(spendPercent, 100)}%` }}
              transition={{ duration: 1.0, ease: "easeOut", delay: 0.3 }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-celeste/70 text-right tnum">
            {Math.round(spendPercent)}% del ingreso gastado
          </p>
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
                <p className="text-[10px] text-celeste uppercase tracking-[0.15em] font-extrabold">
                  Efectivo y débito
                </p>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-good" />
                    <span className="text-[13px] text-cream-light/80">Ingresos</span>
                  </div>
                  <span className="font-poster tnum text-[13px] text-good">
                    +{formatCurrency(monthlyIncome)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-bad" />
                    <span className="text-[13px] text-cream-light/80">Gastos variables</span>
                  </div>
                  <span className="font-poster tnum text-[13px] text-bad">
                    -{formatCurrency(monthlyExpenses)}
                  </span>
                </div>

                {installments > 0 && (
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-accent-soft" />
                      <span className="text-[13px] text-cream-light/80">Cuotas del mes</span>
                    </div>
                    <span className="font-poster tnum text-[13px] text-accent-soft">
                      -{formatCurrency(installments)}
                    </span>
                  </div>
                )}

                {burnRate > 0 && (
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-warn" />
                      <span className="text-[13px] text-cream-light/80">Mensualidades</span>
                    </div>
                    <span className="font-poster tnum text-[13px] text-warn">
                      -{formatCurrency(burnRate)}
                    </span>
                  </div>
                )}

                {savingsTransfers > 0 && (
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-good" />
                      <span className="text-[13px] text-cream-light/80">Ahorro transferido</span>
                    </div>
                    <span className="font-poster tnum text-[13px] text-good">
                      -{formatCurrency(savingsTransfers)}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-cream-light/15">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-cream-light/70">Balance líquido</span>
                    <span className={cn("font-poster tnum text-[15px]", isPositive ? "text-good" : "text-bad")}>
                      {isPositive ? "+" : "-"}{formatCurrency(monthBalance)}
                    </span>
                  </div>
                </div>

                {pendingCards.length > 0 && (
                  <>
                    <div className="h-px bg-cream-light/15" />
                    <p className="text-[10px] text-celeste uppercase tracking-[0.15em] font-extrabold flex items-center gap-1.5">
                      <CreditCard className="h-3 w-3" />
                      Tarjetas pendientes
                    </p>
                    {pendingCards.map((card) => {
                      const formattedDate = format(card.nextPaymentDate, "d 'de' MMM", { locale: es })
                      return (
                        <div key={card.methodId} className="flex justify-between items-center">
                          <div className="flex flex-col">
                            <span className="text-[13px] text-cream-light/80">{card.name}</span>
                            <span className="text-[11px] text-celeste/60">vence {formattedDate}</span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            {card.totalARS > 0 && (
                              <span className="font-poster tnum text-[13px] text-bad">-{formatCurrency(card.totalARS)}</span>
                            )}
                            {card.totalUSD > 0 && (
                              <span className="font-poster tnum text-[13px] text-bad">-u$s {card.totalUSD.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            )}
                            {card.totalARS === 0 && card.totalUSD === 0 && (
                              <span className="font-poster tnum text-[13px] text-bad">-{formatCurrency(card.total)}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <div className="pt-2 border-t border-cream-light/15">
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] font-bold text-cream-light/70">Tras pagar tarjetas</span>
                        <span className={cn("font-poster tnum text-[15px]", balanceAfterCards >= 0 ? "text-good" : "text-bad")}>
                          {balanceAfterCards >= 0 ? "+" : "-"}{formatCurrency(Math.abs(balanceAfterCards))}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
