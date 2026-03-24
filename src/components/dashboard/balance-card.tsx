"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinanceStore } from "@/lib/store/financeStore"

interface BalanceCardProps {
  globalBalance: number
  monthlyIncome: number
  monthlyExpenses: number
  installments: number
  burnRate: number
  currency?: string
}

// SVG circular progress ring
function ProgressRing({
  percentage,
  size = 72,
  strokeWidth = 5,
}: {
  percentage: number
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clampedPct = Math.min(Math.max(percentage, 0), 100)
  const offset = circumference - (clampedPct / 100) * circumference

  const ringColor =
    clampedPct > 90
      ? "#f43f5e" // rose-500
      : clampedPct > 70
      ? "#f59e0b" // amber-500
      : "#10b981" // emerald-500

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} role="img" aria-label={`${Math.round(clampedPct)}% del ingreso gastado`}>
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#1e293b"
        strokeWidth={strokeWidth}
      />
      {/* Progress */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={ringColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
      />
    </svg>
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
      // ease-out cubic
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
  globalBalance,
  monthlyIncome,
  monthlyExpenses,
  installments,
  burnRate,
}: BalanceCardProps) {
  const [expanded, setExpanded] = useState(false)
  const getMonthlyComparison = useFinanceStore((s) => s.getMonthlyComparison)
  const comparison = getMonthlyComparison()

  const totalMonthlySpend = monthlyExpenses + installments + burnRate
  const monthBalance = monthlyIncome - totalMonthlySpend
  const isPositive = monthBalance >= 0

  // Porcentaje de gasto vs ingreso
  const spendPercent = monthlyIncome > 0 ? (totalMonthlySpend / monthlyIncome) * 100 : 0

  // Tendencia mes vs mes anterior
  const { percentageChange } = comparison
  const trendUp = percentageChange > 1
  const trendDown = percentageChange < -1
  const trendNeutral = !trendUp && !trendDown

  const animatedBalance = useCountUp(globalBalance)

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount))

  const spendPctLabel =
    spendPercent > 90 ? "rose" : spendPercent > 70 ? "amber" : "emerald"

  const ringTextColor =
    spendPercent > 90
      ? "text-rose-400"
      : spendPercent > 70
      ? "text-amber-400"
      : "text-emerald-400"

  return (
    <div>
      <motion.div
        className="card-elevated rounded-2xl bg-[var(--surface-raised)] border border-slate-800 overflow-hidden cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
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
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">
                  Balance disponible
                </span>
                <motion.div
                  animate={{ rotate: expanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </motion.div>
              </div>

              {/* Balance principal con count-up */}
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-bold text-white tracking-tight">
                  {globalBalance < 0 ? "-" : ""}
                  {formatCurrency(animatedBalance)}
                </span>
              </div>

              {/* Ingreso / Gasto + badge "este mes" */}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <div className="flex items-center gap-1">
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs text-slate-400">{formatCurrency(monthlyIncome)}</span>
                </div>
                <div className="h-3 w-px bg-slate-800" />
                <div className="flex items-center gap-1">
                  <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />
                  <span className="text-xs text-slate-400">{formatCurrency(totalMonthlySpend)}</span>
                </div>

                {/* Badge resultado mes */}
                <div
                  className={cn(
                    "ml-auto text-sm font-semibold px-3 py-1 rounded-full",
                    isPositive
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  )}
                >
                  {isPositive ? "+" : "-"}{formatCurrency(monthBalance)} este mes
                </div>
              </div>

              {/* Tendencia vs mes anterior */}
              <div className="flex items-center gap-1.5 mt-2">
                {trendUp && (
                  <>
                    <TrendingUp className="h-3.5 w-3.5 text-rose-400" />
                    <span className="text-xs text-rose-400">
                      +{Math.abs(percentageChange).toFixed(1)}% vs mes anterior
                    </span>
                  </>
                )}
                {trendDown && (
                  <>
                    <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-xs text-emerald-400">
                      -{Math.abs(percentageChange).toFixed(1)}% vs mes anterior
                    </span>
                  </>
                )}
                {trendNeutral && (
                  <>
                    <Minus className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs text-slate-400">Similar al mes anterior</span>
                  </>
                )}
              </div>
            </div>

            {/* Right: anillo de progreso */}
            <div className="relative flex-shrink-0 flex items-center justify-center">
              <ProgressRing percentage={spendPercent} size={72} strokeWidth={5} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn("text-sm font-bold leading-none", ringTextColor)}>
                  {Math.min(Math.round(spendPercent), 999)}%
                </span>
                <span className="text-[9px] text-slate-400 mt-0.5 leading-none">gastado</span>
              </div>
            </div>
          </div>

          {/* Barra de progreso lineal secundaria */}
          <div
            className="mt-4 h-1 w-full rounded-full bg-slate-800 overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(spendPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Gasto del mes: ${Math.round(spendPercent)}%`}
          >
            <motion.div
              className={cn(
                "h-full rounded-full",
                spendPctLabel === "rose"
                  ? "bg-rose-500"
                  : spendPctLabel === "amber"
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              )}
              initial={{ width: "0%" }}
              animate={{ width: `${Math.min(spendPercent, 100)}%` }}
              transition={{ duration: 1.0, ease: "easeOut", delay: 0.3 }}
            />
          </div> {/* progressbar */}
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
              <div className="border-t border-slate-800 px-5 py-4 space-y-3">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">
                  Desglose del mes
                </p>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-sm text-slate-300">Ingresos</span>
                  </div>
                  <span className="text-sm font-medium text-emerald-400">
                    +{formatCurrency(monthlyIncome)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-rose-400" />
                    <span className="text-sm text-slate-300">Gastos variables</span>
                  </div>
                  <span className="text-sm font-medium text-rose-400">
                    -{formatCurrency(monthlyExpenses)}
                  </span>
                </div>

                {installments > 0 && (
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-indigo-400" />
                      <span className="text-sm text-slate-300">Cuotas del mes</span>
                    </div>
                    <span className="text-sm font-medium text-indigo-400">
                      -{formatCurrency(installments)}
                    </span>
                  </div>
                )}

                {burnRate > 0 && (
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-amber-400" />
                      <span className="text-sm text-slate-300">Suscripciones</span>
                    </div>
                    <span className="text-sm font-medium text-amber-400">
                      -{formatCurrency(burnRate)}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-300">Resultado del mes</span>
                    <span
                      className={cn(
                        "text-sm font-bold",
                        isPositive ? "text-emerald-400" : "text-rose-400"
                      )}
                    >
                      {isPositive ? "+" : "-"}{formatCurrency(monthBalance)}
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
