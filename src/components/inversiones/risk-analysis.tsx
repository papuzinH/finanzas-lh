'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useFinanceStore } from '@/lib/store/financeStore'
import { getAssetTypeLabel } from './asset-type-badge'
import { cn } from '@/lib/utils'

const PIE_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
  'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)', 'var(--chart-9)',
]

const CURRENCY_COLORS: Record<string, string> = {
  ARS: 'var(--chart-ars)',
  USD: 'var(--chart-usd)',
}

function computeDiversificationScore(typeCount: number, percentages: number[]): number {
  if (percentages.length === 0) return 0
  let score = Math.min(typeCount * 2, 6)
  const maxPct = Math.max(...percentages)
  if (maxPct < 40) score += 3
  else if (maxPct < 60) score += 2
  else if (maxPct < 80) score += 1
  return Math.min(Math.max(Math.round(score), 1), 10)
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)

export function RiskAnalysis() {
  const { getPortfolioDistribution, getPortfolioStatus } = useFinanceStore()

  const distribution = getPortfolioDistribution()
  const portfolio = getPortfolioStatus()

  const typeData = useMemo(
    () => distribution.map((d) => ({
      name: getAssetTypeLabel(d.assetType),
      value: d.value,
      percentage: d.percentage,
    })),
    [distribution]
  )

  const currencyData = useMemo(() => {
    const grouped: Record<string, number> = {}
    for (const asset of portfolio.assets) {
      const cur = asset.currency ?? 'ARS'
      grouped[cur] = (grouped[cur] ?? 0) + asset.currentValue
    }
    const total = Object.values(grouped).reduce((s, v) => s + v, 0)
    return Object.entries(grouped).map(([name, value]) => ({
      name,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
    }))
  }, [portfolio.assets])

  const totalValue = portfolio.totalValue

  // Concentration warning: any single asset > 30% of total
  const concentratedAsset = portfolio.assets.find(
    (a) => totalValue > 0 && (a.currentValue / totalValue) * 100 > 30
  )

  const typeCount = distribution.length
  const typePercentages = distribution.map((d) => d.percentage)
  const score = computeDiversificationScore(typeCount, typePercentages)

  const scoreColor =
    score >= 7 ? 'text-emerald-400' :
    score >= 4 ? 'text-amber-400' :
    'text-rose-400'

  const scoreBarColor =
    score >= 7 ? 'bg-emerald-500' :
    score >= 4 ? 'bg-amber-500' :
    'bg-rose-500'

  const scoreLabel =
    score >= 7 ? 'Cartera bien diversificada' :
    score >= 4 ? 'Diversificación moderada' :
    'Diversificación baja — considerá incorporar más tipos de activos'

  if (portfolio.assets.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center flex flex-col items-center gap-3">
        <p className="text-slate-500 text-sm">Sin activos para analizar</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Concentration warning */}
      {concentratedAsset && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Alta concentración detectada</p>
            <p className="text-xs text-slate-400 mt-0.5">
              <span className="font-bold text-amber-400">{concentratedAsset.ticker}</span> representa el{' '}
              {((concentratedAsset.currentValue / totalValue) * 100).toFixed(1)}% de tu portfolio (
              {fmtCurrency(concentratedAsset.currentValue)}). Considerá diversificar.
            </p>
          </div>
        </div>
      )}

      {/* Diversification score */}
      <Card className="bg-slate-900/40 border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase font-medium text-slate-500 tracking-wider">Score de Diversificación</p>
          <span className={cn('text-2xl font-bold font-mono', scoreColor)}>
            {score}<span className="text-sm text-slate-500">/10</span>
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', scoreBarColor)}
            style={{ width: `${score * 10}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          {typeCount} {typeCount === 1 ? 'tipo de activo' : 'tipos de activos'} · {scoreLabel}
        </p>
      </Card>

      {/* Two pie charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By asset type */}
        <Card className="bg-slate-900/40 border-slate-800 p-4">
          <p className="text-xs font-semibold text-slate-300 mb-3">Por tipo de activo</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="50%"
                  innerRadius="38%"
                  outerRadius="58%"
                  paddingAngle={3}
                  dataKey="value"
                >
                  {typeData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [fmtCurrency(value), name]}
                  contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px', fontSize: '11px', color: 'var(--text)' }}
                />
                <Legend wrapperStyle={{ color: 'var(--muted)', fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* By currency */}
        <Card className="bg-slate-900/40 border-slate-800 p-4">
          <p className="text-xs font-semibold text-slate-300 mb-3">Por moneda original</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={currencyData}
                  cx="50%"
                  cy="50%"
                  innerRadius="38%"
                  outerRadius="58%"
                  paddingAngle={3}
                  dataKey="value"
                >
                  {currencyData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={CURRENCY_COLORS[entry.name] ?? PIE_COLORS[i % PIE_COLORS.length]}
                      stroke="none"
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [fmtCurrency(value), name]}
                  contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px', fontSize: '11px', color: 'var(--text)' }}
                />
                <Legend wrapperStyle={{ color: 'var(--muted)', fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}
