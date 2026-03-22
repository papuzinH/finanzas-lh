'use client'

import Link from 'next/link'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency } from '@/lib/utils'
import { AlertTriangle, XCircle, CheckCircle2, ArrowRight } from 'lucide-react'

export function BudgetOverviewStrip() {
  const getAllBudgetStatuses = useFinanceStore((s) => s.getAllBudgetStatuses)
  const statuses = getAllBudgetStatuses()

  if (statuses.length === 0) return null

  const exceeded = statuses.filter((s) => s.status === 'exceeded').length
  const warning = statuses.filter((s) => s.status === 'warning').length

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200">Presupuestos del mes</h3>
          {exceeded > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-rose-400 font-medium">
              <XCircle className="w-3 h-3" />
              {exceeded} superado{exceeded > 1 ? 's' : ''}
            </span>
          )}
          {warning > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
              <AlertTriangle className="w-3 h-3" />
              {warning} en alerta
            </span>
          )}
          {exceeded === 0 && warning === 0 && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Todo en orden
            </span>
          )}
        </div>
        <Link
          href="/objetivos"
          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Ver todos
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Budget bars grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {statuses.slice(0, 6).map(({ budget, categoryName, categoryEmoji, spent, limit, percent, status }) => {
          const barColor =
            status === 'exceeded' ? 'bg-rose-500' :
            status === 'warning' ? 'bg-amber-500' :
            'bg-emerald-500'

          return (
            <div key={budget.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-1 truncate">
                  {categoryEmoji && <span>{categoryEmoji}</span>}
                  <span className="truncate">{categoryName}</span>
                </span>
                <span className={`font-mono shrink-0 ml-2 ${
                  status === 'exceeded' ? 'text-rose-400' :
                  status === 'warning' ? 'text-amber-400' :
                  'text-slate-400'
                }`}>
                  {Math.min(percent, 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>{formatCurrency(spent)}</span>
                <span>{formatCurrency(limit)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
