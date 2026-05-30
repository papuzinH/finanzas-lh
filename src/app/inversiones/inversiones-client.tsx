'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { TrendingUp, BarChart3, Plus, Clock } from 'lucide-react'
import { useFinanceStore } from '@/lib/store/financeStore'
import { PageHeader } from '@/components/shared/page-header'
import { Card } from '@/components/ui/card'
import { CurrencyToggle, type DisplayCurrency } from '@/components/inversiones/currency-toggle'
import { AssetTypeBadge } from '@/components/inversiones/asset-type-badge'
import { ProfitBadge } from '@/components/inversiones/profit-badge'
import { PortfolioList } from '@/components/inversiones/portfolio-list'
import { QuickAddForm } from '@/components/inversiones/quick-add-form'
import { PortfolioDistribution } from '@/components/inversiones/portfolio-distribution'
import { PricesStatusBar } from '@/components/inversiones/prices-status-bar'
import { FailedPricesDialog } from '@/components/inversiones/failed-prices-dialog'
import { SavingsCard } from '@/components/inversiones/savings-card'
import { deleteAsset } from './actions'
import { cn } from '@/lib/utils'

const STALE_THRESHOLD_MS = 60 * 60 * 1000 // 1 hora

type ActiveTab = 'dashboard' | 'portfolio' | 'cargar'

const fmtCurrency = (n: number, currency = 'ARS') =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: ['ARS', 'USD'].includes(currency) ? currency : 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)

export function InversionesClient() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard')
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('ARS')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefreshResult, setLastRefreshResult] = useState<{
    updated: number
    failed: string[]
    timestamp: string
  } | null>(null)
  const [failedDialogOpen, setFailedDialogOpen] = useState(false)
  const autoRefreshAttempted = useRef(false)

  const {
    isInitialized,
    fetchAllData,
    getPortfolioStatus,
    investmentAssets,
    investmentTransactions,
    exchangeRates,
  } = useFinanceStore()

  useEffect(() => {
    if (!isInitialized) fetchAllData()
  }, [isInitialized, fetchAllData])

  const portfolio = getPortfolioStatus(displayCurrency)
  const currencyLabel = ['ARS'].includes(displayCurrency) ? 'ARS' : 'USD'

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch('/api/investments/update-prices', { method: 'POST' })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
        return
      }
      const updated: number = json.updated ?? 0
      const failed: string[] = json.failed ?? []
      setLastRefreshResult({ updated, failed, timestamp: new Date().toISOString() })
      if (failed.length > 0) {
        toast.warning(`Precios actualizados: ${updated} OK · ${failed.length} fallaron`)
      } else {
        toast.success(`Precios actualizados: ${updated} ${updated === 1 ? 'activo' : 'activos'}`)
      }
      await fetchAllData()
    } catch {
      toast.error('Error al actualizar precios')
    } finally {
      setIsRefreshing(false)
    }
  }

  // Auto-refresh on-mount si los precios son viejos (>1h) o si faltan tipos de cambio
  useEffect(() => {
    if (autoRefreshAttempted.current) return
    if (!isInitialized) return
    if (isRefreshing) return
    if (investmentAssets.length === 0) return

    const requiredPairs = ['USD_ARS_MEP', 'USD_ARS_CCL', 'USDT_ARS']
    const missingRates = requiredPairs.some(
      (pair) => !exchangeRates.find((r) => r.pair === pair && r.rate > 0),
    )

    const stale =
      portfolio.lastUpdate &&
      Date.now() - new Date(portfolio.lastUpdate).getTime() > STALE_THRESHOLD_MS

    if (stale || missingRates) {
      autoRefreshAttempted.current = true
      handleRefresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, portfolio.lastUpdate, investmentAssets.length, exchangeRates.length])

  const handleDeleteAsset = async (assetId: string) => {
    const result = await deleteAsset(assetId)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Activo dado de baja')
      await fetchAllData()
    }
  }

  // Mejor y peor activo
  const sortedByPL = [...portfolio.assets].sort((a, b) => b.plPercent - a.plPercent)
  const best = sortedByPL[0] ?? null
  const worst = sortedByPL[sortedByPL.length - 1] ?? null

  // Distribucion consistente con moneda seleccionada
  const groupedByType = portfolio.assets.reduce<Record<string, number>>((acc, asset) => {
    acc[asset.asset_type] = (acc[asset.asset_type] ?? 0) + asset.currentValue
    return acc
  }, {})

  const pieData = Object.entries(groupedByType)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value }))

  return (
    <div className="min-h-screen bg-surface text-slate-50 pb-24">
      <PageHeader
        title="Inversiones"
        subtitle="Portfolio bimonetario"
        icon={<TrendingUp className="h-5 w-5" />}
        containerClassName="max-w-[1440px]"
      />

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 space-y-6">

        {/* Currency Toggle + Status de precios */}
        <div className="space-y-3">
          <CurrencyToggle value={displayCurrency} onChange={setDisplayCurrency} />
          <PricesStatusBar
            lastUpdate={portfolio.lastUpdate}
            isRefreshing={isRefreshing}
            lastResult={lastRefreshResult}
            onRefresh={handleRefresh}
            onOpenFailed={() => setFailedDialogOpen(true)}
          />
        </div>

        {/* Hero Card */}
        <div className="rounded-2xl border border-indigo-500/20 bg-linear-to-br from-indigo-500/10 via-violet-500/5 to-slate-950 p-5 md:p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingUp className="w-20 h-20 text-indigo-400" />
          </div>
          <p className="text-[10px] md:text-xs font-medium text-indigo-300 uppercase tracking-wider mb-1.5">
            Valor Total del Portfolio
          </p>
          <p className="text-3xl md:text-4xl font-bold text-white font-mono tracking-tight">
            {fmtCurrency(portfolio.totalValue, currencyLabel)}
          </p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-xs text-slate-400">
              Invertido: {fmtCurrency(portfolio.totalInvested, currencyLabel)}
            </span>
            {portfolio.totalSavings > 0 && (
              <span className="text-xs text-amber-300/80">
                Ahorros: {fmtCurrency(portfolio.totalSavings, currencyLabel)}
              </span>
            )}
            {portfolio.totalInvested > 0 && (
              <ProfitBadge
                percent={portfolio.totalPLPercent}
                amount={portfolio.totalUnrealizedPL}
                currency={currencyLabel}
                showAmount
              />
            )}
          </div>
        </div>

        {/* Metric Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="bg-slate-900/40 border-slate-800 p-4">
            <p className="text-[10px] uppercase text-slate-500 font-medium mb-1">Ganancia Total</p>
            <p className="text-xl font-bold text-slate-100 font-mono">
              {fmtCurrency(portfolio.totalUnrealizedPL + portfolio.totalRealizedPL, currencyLabel)}
            </p>
            {portfolio.totalPLPercent !== 0 && (
              <ProfitBadge percent={portfolio.totalPLPercent} className="mt-1" />
            )}
          </Card>

          <Card className="bg-slate-900/40 border-slate-800 p-4">
            <p className="text-[10px] uppercase text-slate-500 font-medium mb-1">Mejor activo</p>
            {best ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-slate-100">{best.ticker}</span>
                  <AssetTypeBadge assetType={best.asset_type} />
                </div>
                <ProfitBadge percent={best.plPercent} />
              </>
            ) : (
              <p className="text-sm text-slate-600">—</p>
            )}
          </Card>

          <Card className="bg-slate-900/40 border-slate-800 p-4">
            <p className="text-[10px] uppercase text-slate-500 font-medium mb-1">Peor activo</p>
            {worst && worst.id !== best?.id ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-slate-100">{worst.ticker}</span>
                  <AssetTypeBadge assetType={worst.asset_type} />
                </div>
                <ProfitBadge percent={worst.plPercent} />
              </>
            ) : (
              <p className="text-sm text-slate-600">—</p>
            )}
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-800 w-full justify-between">
          {([
            { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { key: 'portfolio', label: 'Portfolio', icon: TrendingUp },
            { key: 'cargar',    label: 'Cargar',    icon: Plus },
          ] as { key: ActiveTab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all w-full justify-center',
                activeTab === key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab: Dashboard */}
        {activeTab === 'dashboard' && (
          <section className="space-y-4">
            {portfolio.assets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center flex flex-col items-center gap-3">
                <TrendingUp className="h-16 w-16 text-slate-700" />
                <h3 className="text-lg font-semibold text-slate-200">Sin activos registrados</h3>
                <p className="text-slate-500 text-sm max-w-xs">
                  Usá la pestaña &quot;Cargar&quot; para registrar tus primeras inversiones.
                </p>
              </div>
            ) : (
              <div className="h-80">
                <PortfolioDistribution data={pieData} />
              </div>
            )}

            {/* Tabla resumen en dashboard */}
            {portfolio.assets.length > 0 && (
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800">
                  <p className="text-xs font-medium text-slate-400">Resumen de posiciones</p>
                </div>
                <div className="divide-y divide-slate-800/60">
                  {[...portfolio.assets]
                    .sort((a, b) => b.currentValue - a.currentValue)
                    .slice(0, 8)
                    .map((asset) => (
                      <div key={asset.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-sm text-slate-100 shrink-0">{asset.ticker}</span>
                          <AssetTypeBadge assetType={asset.asset_type} />
                          <span className="text-xs text-slate-500 truncate hidden sm:block">{asset.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-mono text-slate-200">
                            {fmtCurrency(asset.currentValue, currencyLabel)}
                          </span>
                          <ProfitBadge percent={asset.plPercent} />
                        </div>
                      </div>
                    ))}
                </div>
                {portfolio.assets.length > 8 && (
                  <div className="px-4 py-2 border-t border-slate-800">
                    <button
                      onClick={() => setActiveTab('portfolio')}
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Ver todos ({portfolio.assets.length} activos) →
                    </button>
                  </div>
                )}
              </div>
            )}

            <SavingsCard displayCurrency={displayCurrency} />
          </section>
        )}

        {/* Tab: Portfolio */}
        {activeTab === 'portfolio' && (
          <section>
            {portfolio.assets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center flex flex-col items-center gap-3">
                <Clock className="h-16 w-16 text-slate-700" />
                <p className="text-slate-500 text-sm">Sin posiciones abiertas</p>
              </div>
            ) : (
              <PortfolioList
                assets={portfolio.assets}
                transactions={investmentTransactions}
                displayCurrency={displayCurrency}
                onDeleteAsset={handleDeleteAsset}
              />
            )}
          </section>
        )}

        {/* Tab: Cargar */}
        {activeTab === 'cargar' && (
          <section>
            <div className="max-w-lg mx-auto">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 md:p-6">
                <div className="flex items-center gap-2 mb-5">
                  <div className="p-2 rounded-xl bg-indigo-500/10">
                    <Plus className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-100">Nueva operación</h2>
                    <p className="text-xs text-slate-500">Registrá una compra en tu portfolio</p>
                  </div>
                </div>
                <QuickAddForm />
              </div>
            </div>
          </section>
        )}

      </main>

      <FailedPricesDialog
        open={failedDialogOpen}
        onOpenChange={setFailedDialogOpen}
        failedTickers={lastRefreshResult?.failed ?? []}
        assets={investmentAssets.map((a) => ({
          ticker: a.ticker,
          name: a.name,
          asset_type: a.asset_type,
          currency: a.currency,
          data_source_url: a.data_source_url,
        }))}
        onRetried={({ updated, failed }) =>
          setLastRefreshResult({ updated, failed, timestamp: new Date().toISOString() })
        }
      />
    </div>
  )
}
