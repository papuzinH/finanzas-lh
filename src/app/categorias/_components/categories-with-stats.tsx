'use client'

import { useFinanceStore } from '@/lib/store/financeStore'
import { CategoryCardActions } from '@/components/categories/category-card-actions'
import { formatCurrency } from '@/lib/utils'
import { Tag, TrendingDown, Calendar, History } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { Category } from '@/types/database'
import { CreateCategoryDialog } from '@/components/categories/create-category-dialog'

interface Props {
  categories: Category[]
}

export function CategoriesWithStats({ categories }: Props) {
  const getCategoryBreakdown = useFinanceStore((s) => s.getCategoryBreakdown)

  const monthly = getCategoryBreakdown('current_month')
  const global = getCategoryBreakdown('global')

  const topMonthly = monthly.items[0] ?? null

  return (
    <>
      {/* ── Summary header ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Card className="bg-slate-900/40 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Gastos este mes</p>
              <p className="text-base font-semibold text-slate-100 truncate">
                {formatCurrency(monthly.total)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-400">
              <TrendingDown className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Mayor gasto del mes</p>
              {topMonthly ? (
                <p className="text-base font-semibold text-slate-100 truncate">
                  {topMonthly.name}{' '}
                  <span className="text-sm font-normal text-slate-400">
                    ({topMonthly.percentage.toFixed(0)}%)
                  </span>
                </p>
              ) : (
                <p className="text-sm text-slate-500">Sin datos</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <History className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Total histórico</p>
              <p className="text-base font-semibold text-slate-100 truncate">
                {formatCurrency(global.total)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Category grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {categories.map((cat) => {
          const monthlySpent = monthly.items.find((i) => i.name === cat.name)
          const globalSpent = global.items.find((i) => i.name === cat.name)

          return (
            <div
              key={cat.id}
              className="group relative flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-all hover:bg-slate-900 hover:border-slate-700"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-800 text-lg group-hover:text-white transition-colors select-none">
                  {cat.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-sm text-slate-200 group-hover:text-white transition-colors truncate">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                    {cat.description || 'Sin descripción'}
                  </p>
                </div>
                <CategoryCardActions category={cat} allCategories={categories} />
              </div>

              {/* ── Spending row ── */}
              {(monthlySpent || globalSpent) && (
                <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between gap-2 text-xs">
                  {monthlySpent ? (
                    <span className="text-indigo-400 font-medium">
                      {formatCurrency(monthlySpent.value)}{' '}
                      <span className="text-slate-500 font-normal">este mes</span>
                    </span>
                  ) : (
                    <span className="text-slate-600">Sin gastos este mes</span>
                  )}
                  {globalSpent && (
                    <span className="text-slate-500 truncate">
                      {formatCurrency(globalSpent.value)} total
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {categories.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 text-center">
            <Tag className="h-16 w-16 text-slate-700 mb-4" />
            <h3 className="text-lg font-semibold text-slate-200 mb-2">Organizá tus gastos por categoría</h3>
            <p className="text-sm text-slate-500 max-w-xs mb-6">
              Creá categorías con emojis y descripción para que la IA clasifique tus movimientos automáticamente.
            </p>
            <CreateCategoryDialog />
          </div>
        )}
      </div>
    </>
  )
}
