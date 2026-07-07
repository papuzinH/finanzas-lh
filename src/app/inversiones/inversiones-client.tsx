'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { TrendingUp, BarChart3, Plus, Clock } from 'lucide-react'
import { useFinanceStore } from '@/lib/store/financeStore'
import { ScreenHeader } from '@/components/shared/screen-header'
import { TabsDS } from '@/components/ui/tabs-ds'
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

const STALE_THRESHOLD_MS = 60 * 60 * 1000

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

  const sortedByPL = [...portfolio.assets].sort((a, b) => b.plPercent - a.plPercent)
  const best = sortedByPL[0] ?? null
  const worst = sortedByPL[sortedByPL.length - 1] ?? null

  const groupedByType = portfolio.assets.reduce<Record<string, number>>((acc, asset) => {
    acc[asset.asset_type] = (acc[asset.asset_type] ?? 0) + asset.currentValue
    return acc
  }, {})

  const pieData = Object.entries(groupedByType)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value }))

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-28 md:pb-8">
      <ScreenHeader
        kicker="inversiones"
        title="Inversiones"
        sub="Portfolio bimonetario"
      />

      <main className="mx-auto max-w-[1440px] px-5 space-y-5 pb-4">

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
        <div
          className="rounded-2xl bg-hero text-cream p-5"
          style={{ boxShadow: '0 18px 36px -18px rgba(28,42,71,0.70)' }}
        >
          <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-celeste">
            Valor Total del Portfolio
          </p>
          <p className="font-poster tnum text-[clamp(1.65rem,8vw,2.25rem)] leading-[0.95] mt-1 text-cream-light break-words">
            {fmtCurrency(portfolio.totalValue, currencyLabel)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="min-w-0 rounded-xl bg-cream-light/10 border-[1.5px] border-cream-light/15 px-3 py-2">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-celeste">Invertido</p>
              <p className="font-poster tnum text-[15px] mt-0.5 text-cream-light break-words">
                {fmtCurrency(portfolio.totalInvested, currencyLabel)}
              </p>
            </div>
            <div className="min-w-0 rounded-xl bg-cream-light/10 border-[1.5px] border-cream-light/15 px-3 py-2">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-celeste">P&L</p>
              <div className="mt-0.5 min-w-0">
                {portfolio.totalInvested > 0 ? (
                  <ProfitBadge
                    percent={portfolio.totalPLPercent}
                    amount={portfolio.totalUnrealizedPL}
                    currency={currencyLabel}
                    showAmount
                    className="max-w-full [overflow-wrap:anywhere]"
                  />
                ) : (
                  <p className="font-poster tnum text-[15px] text-cream-light/50">—</p>
                )}
              </div>
            </div>
          </div>
          {portfolio.totalSavings > 0 && (
            <p className="text-[11px] text-celeste/70 mt-2 break-words">
              Ahorros: {fmtCurrency(portfolio.totalSavings, currencyLabel)}
            </p>
          )}
        </div>

        {/* Metric Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4 min-w-0">
            <p className="text-[10px] uppercase text-muted font-bold mb-1">Ganancia Total</p>
            <p className="font-poster tnum text-[20px] text-text break-words">
              {fmtCurrency(portfolio.totalUnrealizedPL + portfolio.totalRealizedPL, currencyLabel)}
            </p>
            {portfolio.totalPLPercent !== 0 && (
              <ProfitBadge percent={portfolio.totalPLPercent} className="mt-1 max-w-full [overflow-wrap:anywhere]" />
            )}
          </Card>

          <Card className="p-4 min-w-0">
            <p className="text-[10px] uppercase text-muted font-bold mb-1">Mejor activo</p>
            {best ? (
              <>
                <div className="flex items-center gap-2 mb-1 min-w-0">
                  <span className="font-sans font-bold text-sm text-text truncate">{best.ticker}</span>
                  <AssetTypeBadge assetType={best.asset_type} className="shrink-0" />
                </div>
                <ProfitBadge percent={best.plPercent} />
              </>
            ) : (
              <p className="text-sm text-faint">—</p>
            )}
          </Card>

          <Card className="p-4 min-w-0">
            <p className="text-[10px] uppercase text-muted font-bold mb-1">Peor activo</p>
            {worst && worst.id !== best?.id ? (
              <>
                <div className="flex items-center gap-2 mb-1 min-w-0">
                  <span className="font-sans font-bold text-sm text-text truncate">{worst.ticker}</span>
                  <AssetTypeBadge assetType={worst.asset_type} className="shrink-0" />
                </div>
                <ProfitBadge percent={worst.plPercent} />
              </>
            ) : (
              <p className="text-sm text-faint">—</p>
            )}
          </Card>
        </div>

        {/* Tabs */}
        <TabsDS
          tabs={[
            { id: 'dashboard', label: 'Dashboard', icon: 'chart' },
            { id: 'portfolio', label: 'Portfolio', icon: 'trending-up' },
            { id: 'cargar', label: 'Cargar', icon: 'plus' },
          ]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as ActiveTab)}
        />

        {/* Tab: Dashboard */}
        {activeTab === 'dashboard' && (
          <section className="space-y-4">
            {portfolio.assets.length === 0 ? (
              <div className="rounded-2xl border-[1.5px] border-dashed border-border py-16 text-center flex flex-col items-center gap-3">
                <TrendingUp className="h-14 w-14 text-faint" />
                <h3 className="font-sans font-bold text-text text-lg">Sin activos registrados</h3>
                <p className="text-muted text-sm max-w-xs">
                  Usá la pestaña &quot;Cargar&quot; para registrar tus primeras inversiones.
                </p>
              </div>
            ) : (
              <div className="h-80">
                <PortfolioDistribution data={pieData} />
              </div>
            )}

            {portfolio.assets.length > 0 && (
              <div className="rounded-2xl border-[1.5px] border-border overflow-hidden">
                <div className="px-4 py-2.5 bg-surface-2 border-b border-border">
                  <p className="text-xs font-bold text-muted">Resumen de posiciones</p>
                </div>
                <div className="divide-y divide-border/60">
                  {[...portfolio.assets]
                    .sort((a, b) => b.currentValue - a.currentValue)
                    .slice(0, 8)
                    .map((asset) => (
                      <div key={asset.id} className="px-4 py-2.5 flex items-center justify-between gap-3 bg-surface">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-sans font-bold text-sm text-text shrink-0">{asset.ticker}</span>
                          <AssetTypeBadge assetType={asset.asset_type} className="shrink-0" />
                          <span className="text-xs text-muted truncate hidden sm:block">{asset.name}</span>
                        </div>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-poster tnum text-sm text-text truncate">
                            {fmtCurrency(asset.currentValue, currencyLabel)}
                          </span>
                          <ProfitBadge percent={asset.plPercent} className="shrink-0" />
                        </div>
                      </div>
                    ))}
                </div>
                {portfolio.assets.length > 8 && (
                  <div className="px-4 py-2 border-t border-border bg-surface">
                    <button
                      onClick={() => setActiveTab('portfolio')}
                      className="text-xs text-accent hover:text-accent-deep transition-colors"
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
              <div className="rounded-2xl border-[1.5px] border-dashed border-border py-16 text-center flex flex-col items-center gap-3">
                <Clock className="h-14 w-14 text-faint" />
                <p className="text-muted text-sm">Sin posiciones abiertas</p>
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
              <div className="rounded-2xl border-[1.5px] border-border bg-surface p-5 md:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 rounded-xl bg-surface-2 border-[1.5px] border-border">
                    <Plus className="w-5 h-5 text-muted" />
                  </div>
                  <div>
                    <h2 className="font-sans font-bold text-text">Nueva operación</h2>
                    <p className="text-xs text-muted">Registrá una compra en tu portfolio</p>
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
