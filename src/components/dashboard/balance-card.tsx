"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface BalanceCardProps {
  globalBalance: number
  monthlyIncome: number
  monthlyExpenses: number
  installments: number
  burnRate: number
  currency?: string
}

export function BalanceCard({
  globalBalance,
  monthlyIncome,
  monthlyExpenses,
  installments,
  burnRate,
  currency = "ARS"
}: BalanceCardProps) {
  const [expanded, setExpanded] = useState(false)

  const totalMonthlySpend = monthlyExpenses + installments + burnRate
  const monthBalance = monthlyIncome - totalMonthlySpend
  const isPositive = monthBalance >= 0

  // Formato de moneda argentino
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount))
  }

  return (
    <div className="col-span-2 lg:col-span-4">
      <motion.div
        className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
        whileTap={{ scale: 0.99 }}
      >
        {/* Header siempre visible */}
        <div className="p-5">
          <div className="flex items-start justify-between mb-1">
            <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">Balance disponible</span>
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </motion.div>
          </div>

          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-white tracking-tight">
              {formatCurrency(globalBalance)}
            </span>
          </div>

          {/* Resumen del mes — siempre visible pero compacto */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs text-slate-400">{formatCurrency(monthlyIncome)}</span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center gap-1">
              <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-xs text-slate-400">{formatCurrency(totalMonthlySpend)}</span>
            </div>
            <div className={cn(
              "ml-auto text-xs font-medium px-2 py-0.5 rounded-full",
              isPositive
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
            )}>
              {isPositive ? "+" : ""}{formatCurrency(monthBalance)} este mes
            </div>
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
              <div className="border-t border-slate-800 px-5 py-4 space-y-3">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Desglose del mes</p>

                {/* Ingresos */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-sm text-slate-300">Ingresos</span>
                  </div>
                  <span className="text-sm font-medium text-emerald-400">+{formatCurrency(monthlyIncome)}</span>
                </div>

                {/* Variables */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-rose-400" />
                    <span className="text-sm text-slate-300">Gastos variables</span>
                  </div>
                  <span className="text-sm font-medium text-rose-400">-{formatCurrency(monthlyExpenses)}</span>
                </div>

                {/* Cuotas */}
                {installments > 0 && (
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-indigo-400" />
                      <span className="text-sm text-slate-300">Cuotas del mes</span>
                    </div>
                    <span className="text-sm font-medium text-indigo-400">-{formatCurrency(installments)}</span>
                  </div>
                )}

                {/* Suscripciones */}
                {burnRate > 0 && (
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-amber-400" />
                      <span className="text-sm text-slate-300">Suscripciones</span>
                    </div>
                    <span className="text-sm font-medium text-amber-400">-{formatCurrency(burnRate)}</span>
                  </div>
                )}

                {/* Divider y resultado del mes */}
                <div className="pt-2 border-t border-slate-800">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-300">Resultado del mes</span>
                    <span className={cn(
                      "text-sm font-bold",
                      isPositive ? "text-emerald-400" : "text-rose-400"
                    )}>
                      {isPositive ? "+" : ""}{formatCurrency(monthBalance)}
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
