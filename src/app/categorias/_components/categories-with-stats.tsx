'use client'

import { useState } from 'react'
import { useFinanceStore } from '@/lib/store/financeStore'
import { CategoryCardActions } from '@/components/categories/category-card-actions'
import { formatCurrency } from '@/lib/utils'
import { Tag, TrendingDown, TrendingUp, Calendar, History } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { TabsDS } from '@/components/ui/tabs-ds'
import type { Category } from '@/types/database'
import { CreateCategoryDialog } from '@/components/categories/create-category-dialog'
import { EmptyState } from '@/components/shared/empty-state'

interface Props {
  categories: Category[]
}

const TAB_LABELS: Record<'expense' | 'income', {
  emptyTitle: string
  emptyDescription: string
  monthLabel: string
  topLabel: string
}> = {
  expense: {
    emptyTitle: 'Organizá tus gastos por categoría',
    emptyDescription: 'Creá categorías con emojis y descripción para que la IA clasifique tus movimientos automáticamente.',
    monthLabel: 'Gastos este mes',
    topLabel: 'Mayor gasto del mes',
  },
  income: {
    emptyTitle: 'Organizá tus ingresos por categoría',
    emptyDescription: 'Creá categorías de ingreso para que la IA clasifique tus cobros automáticamente.',
    monthLabel: 'Ingresos este mes',
    topLabel: 'Mayor ingreso del mes',
  },
}

export function CategoriesWithStats({ categories }: Props) {
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense')
  // El store entero, no sus getters sueltos: son referencias estables y el
  // React Compiler congelaría el resultado (ver store-freshness.test.ts).
  const store = useFinanceStore()

  const monthly = store.getCategoryBreakdown('current_month', activeTab)
  const global = store.getCategoryBreakdown('global', activeTab)
  const topMonthly = monthly.items[0] ?? null
  const visibleCategories = categories.filter((c) => c.type === activeTab)
  const labels = TAB_LABELS[activeTab]

  return (
    <>
      {/* ── Tabs ── */}
      <div className="mb-6">
        <TabsDS
          tabs={[
            { id: 'expense', label: 'Gastos' },
            { id: 'income', label: 'Ingresos' },
          ]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as 'expense' | 'income')}
          ariaLabel="Tipo de categoría"
        />
      </div>

      {/* ── Summary header ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Card className="bg-surface-2/40 border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-deep">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted">{labels.monthLabel}</p>
              <p className="text-base font-semibold text-text truncate">
                {formatCurrency(monthly.total)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface-2/40 border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-deep">
              {activeTab === 'expense' ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted">{labels.topLabel}</p>
              {topMonthly ? (
                <p className="text-base font-semibold text-text truncate">
                  {topMonthly.name}{' '}
                  <span className="text-sm font-normal text-muted">
                    ({topMonthly.percentage.toFixed(0)}%)
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted">Sin datos</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface-2/40 border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-good/10 text-good">
              <History className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted">Total histórico</p>
              <p className="text-base font-semibold text-text truncate">
                {formatCurrency(global.total)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Category grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {visibleCategories.map((cat) => {
          const monthlySpent = monthly.items.find((i) => i.name === cat.name)
          const globalSpent = global.items.find((i) => i.name === cat.name)

          return (
            <div
              key={cat.id}
              className="group relative flex flex-col justify-between rounded-xl border border-border bg-surface-2/40 p-4 transition-all hover:bg-surface-2 hover:border-border"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-lg group-hover:text-text transition-colors select-none">
                  {cat.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-sm text-text group-hover:text-text transition-colors truncate">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-muted line-clamp-2 mt-1">
                    {cat.description || 'Sin descripción'}
                  </p>
                </div>
                <CategoryCardActions category={cat} allCategories={categories} />
              </div>

              {/* ── Spending row ── */}
              {(monthlySpent || globalSpent) && (
                <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2 text-xs">
                  {monthlySpent ? (
                    <span className="text-accent-deep font-medium">
                      {formatCurrency(monthlySpent.value)}{' '}
                      <span className="text-muted font-normal">este mes</span>
                    </span>
                  ) : (
                    <span className="text-muted">Sin movimientos este mes</span>
                  )}
                  {globalSpent && (
                    <span className="text-muted truncate">
                      {formatCurrency(globalSpent.value)} total
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {visibleCategories.length === 0 && (
          <EmptyState
            className="col-span-full"
            icon={<Tag className="h-5 w-5" />}
            title={labels.emptyTitle}
            description={labels.emptyDescription}
            action={<CreateCategoryDialog />}
          />
        )}
      </div>
    </>
  )
}
