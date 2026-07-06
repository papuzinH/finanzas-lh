'use client'

import Link from 'next/link'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { AlertTriangle, XCircle, CheckCircle2, ArrowRight } from 'lucide-react'

export function BudgetOverviewStrip() {
  const getAllBudgetStatuses = useFinanceStore((s) => s.getAllBudgetStatuses)
  const getBudgetProjection = useFinanceStore((s) => s.getBudgetProjection)
  const statuses = getAllBudgetStatuses()

  if (statuses.length === 0) return null

  const exceeded = statuses.filter((s) => s.status === 'exceeded').length
  const warning = statuses.filter((s) => s.status === 'warning').length

  return (
    <Card className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-poster text-text text-[15px]">Presupuestos del mes</h3>
          {exceeded > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-bad font-medium">
              <XCircle className="w-3 h-3" />
              {exceeded} superado{exceeded > 1 ? 's' : ''}
            </span>
          )}
          {warning > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-warn font-medium">
              <AlertTriangle className="w-3 h-3" />
              {warning} en alerta
            </span>
          )}
          {exceeded === 0 && warning === 0 && (
            <span className="flex items-center gap-1 text-[10px] text-good font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Todo en orden
            </span>
          )}
        </div>
        <Link
          href="/objetivos"
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-deep transition-colors"
        >
          Ver todos
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Budget bars grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {statuses.slice(0, 6).map(({ budget, categoryName, categoryEmoji, spent, limit, percent, status }) => {
          const tone = status === 'exceeded' ? 'bad' : status === 'warning' ? 'warn' : 'good'

          const projection = getBudgetProjection(budget.id)
          const willExceed = projection?.isOverBudget ?? false

          return (
            <div key={budget.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text flex items-center gap-1 truncate">
                  {categoryEmoji && <span>{categoryEmoji}</span>}
                  <span className="truncate">{categoryName}</span>
                  {willExceed && (
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bad opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-bad" />
                    </span>
                  )}
                </span>
                <span className={`tnum shrink-0 ml-2 ${
                  status === 'exceeded' ? 'text-bad' :
                  status === 'warning' ? 'text-warn' :
                  'text-muted'
                }`}>
                  {Math.min(percent, 100).toFixed(0)}%
                </span>
              </div>
              <ProgressBar value={Math.min(percent, 100)} tone={tone} height={7} />
              <div className="flex justify-between text-[10px] text-muted tnum">
                <span>{formatCurrency(spent)}</span>
                <span>{formatCurrency(limit)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
