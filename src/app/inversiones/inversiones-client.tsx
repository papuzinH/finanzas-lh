'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { TrendingUp, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/lib/store/financeStore'
import { ScreenHeader } from '@/components/shared/screen-header'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CurrencyToggle, type DisplayCurrency } from '@/components/inversiones/currency-toggle'
import { getAssetTypeLabel } from '@/components/inversiones/asset-type-badge'
import { PortfolioList } from '@/components/inversiones/portfolio-list'
import { QuickAddForm } from '@/components/inversiones/quick-add-form'
import { PortfolioDistribution } from '@/components/inversiones/portfolio-distribution'
import { PricesStatusBar } from '@/components/inversiones/prices-status-bar'
import { FailedPricesDialog } from '@/components/inversiones/failed-prices-dialog'
import { SavingsCard } from '@/components/inversiones/savings-card'
import { BannerDS } from '@/components/ui/banner-ds'
import { deleteAsset } from './actions'

const STALE_THRESHOLD_MS = 60 * 60 * 1000

const fmtCurrency = (n: number, currency = 'ARS') =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: ['ARS', 'USD'].includes(currency) ? currency : 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)

/** Nombres de las pairs de `missingRates` en criollo, para el banner. */
const RATE_LABELS: Record<string, string> = {
  USD_ARS_BLUE: 'dólar blue',
  USD_ARS_MEP: 'dólar MEP',
  USD_ARS_CCL: 'dólar CCL',
  USDT_ARS: 'USDT',
}

export function InversionesClient() {
  const [isCargarOpen, setIsCargarOpen] = useState(false)
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('ARS')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefreshResult, setLastRefreshResult] = useState<{
    updated: number
    failed: string[]
    failedRates: string[]
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
      const failedRates: string[] = json.failedRates ?? []
      setLastRefreshResult({ updated, failed, failedRates, timestamp: new Date().toISOString() })
      if (failed.length > 0) {
        toast.warning(`Precios actualizados: ${updated} OK · ${failed.length} fallaron`)
      } else if (failedRates.length > 0) {
        // Los activos pueden haber salido bien y las cotizaciones no: sin esto
        // el usuario veía "todo OK" con el dólar sin actualizar.
        toast.warning(
          `Precios actualizados, pero no se pudo traer ${failedRates.map((p) => RATE_LABELS[p] ?? p).join(', ')}`,
        )
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

  const groupedByType = portfolio.assets.reduce<Record<string, number>>((acc, asset) => {
    acc[asset.asset_type] = (acc[asset.asset_type] ?? 0) + asset.currentValue
    return acc
  }, {})

  const pieData = Object.entries(groupedByType)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name: getAssetTypeLabel(name), value }))

  // Sin cotización no hay total que mostrar: los montos vienen en 0 como
  // placeholder y renderizarlos sería afirmar un número que no tenemos.
  const unvaluedAssets = portfolio.assets.filter((a) => a.valuationUnavailable).length
  const heroMoney = (n: number) =>
    portfolio.valuationUnavailable ? '—' : fmtCurrency(n, currencyLabel)

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-28 md:pb-8">
      <ScreenHeader
        compact
        title="Inversiones"
        right={<CurrencyToggle value={displayCurrency} onChange={setDisplayCurrency} />}
      />

      <main className="mx-auto max-w-[1440px] px-5 pb-4">
        <PricesStatusBar
          lastUpdate={portfolio.lastUpdate}
          isRefreshing={isRefreshing}
          lastResult={lastRefreshResult}
          onRefresh={handleRefresh}
          onOpenFailed={() => setFailedDialogOpen(true)}
        />

        {portfolio.valuationUnavailable && (
          <div className="mt-3">
            <BannerDS
              icon="alert"
              tone="warn"
              title="No pudimos valuar todo el portfolio"
              body={
                unvaluedAssets > 0
                  ? `Falta la cotización (${portfolio.missingRates.map((p) => RATE_LABELS[p] ?? p).join(', ')}), así que ${unvaluedAssets === 1 ? '1 activo quedó' : `${unvaluedAssets} activos quedaron`} sin valuar. Los montos aparecen como "—" hasta que se actualice.`
                  : `Falta la cotización (${portfolio.missingRates.map((p) => RATE_LABELS[p] ?? p).join(', ')}) para expresar los montos en esta moneda. Probá actualizar los precios.`
              }
            />
          </div>
        )}

        {/* Hero: Tu cartera */}
        <div className="mt-3 rounded-[26px] bg-surface border-[1.5px] border-border shadow-card p-5">
          <p className="font-sans text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent-deep">Tu cartera</p>
          <p className="font-display tnum text-[clamp(1.65rem,8vw,2.375rem)] leading-[var(--leading-display)] mt-2.5 text-text [text-shadow:var(--shadow-bandera)] pr-1.5 pb-1 break-words">
            {heroMoney(portfolio.totalValue)}
          </p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {portfolio.totalInvested > 0 ? (
              <>
                <span className={cn('flex items-center gap-1 font-display tnum text-[14px]', portfolio.totalUnrealizedPL >= 0 ? 'text-good' : 'text-bad')}>
                  <TrendingUp className={cn('h-3.5 w-3.5', portfolio.totalUnrealizedPL < 0 && 'rotate-180 -scale-x-100')} aria-hidden="true" />
                  {portfolio.totalUnrealizedPL >= 0 ? '+ ' : '− '}{heroMoney(Math.abs(portfolio.totalUnrealizedPL))}
                </span>
                <span className="text-[12px] text-muted tnum">
                  {portfolio.totalPLPercent >= 0 ? '+' : ''}{portfolio.totalPLPercent.toFixed(1).replace('.', ',')}% desde el inicio
                </span>
              </>
            ) : (
              <span className="text-[12px] text-muted">Todavía sin posiciones valuadas</span>
            )}
          </div>
          <p className="text-[11px] text-faint mt-2 tnum break-words">
            Invertido: {heroMoney(portfolio.totalInvested)}
            {portfolio.totalRealizedPL !== 0 && <> · Realizadas: {fmtCurrency(portfolio.totalRealizedPL, currencyLabel)}</>}
            {portfolio.totalSavings > 0 && <> · Ahorros: {fmtCurrency(portfolio.totalSavings, currencyLabel)}</>}
          </p>
        </div>

        {/* Composición */}
        {pieData.length > 0 && (
          <div className="mt-3">
            <PortfolioDistribution data={pieData} />
          </div>
        )}

        {/* Activos */}
        <div className="flex items-baseline justify-between mt-5">
          <h2 className="font-display text-text text-[18px]">Activos</h2>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-bold text-muted">
              {portfolio.assets.length} activo{portfolio.assets.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => setIsCargarOpen(true)}
              aria-label="Nueva operación"
              className="grid place-items-center w-7 h-7 rounded-full bg-surface border-[1.5px] border-border text-text hover:bg-surface-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.6} />
            </button>
          </div>
        </div>

        {portfolio.assets.length === 0 ? (
          <div className="mt-3 rounded-2xl border-[1.5px] border-dashed border-border py-16 text-center flex flex-col items-center gap-3">
            <TrendingUp className="h-14 w-14 text-faint" />
            <h3 className="font-sans font-bold text-text text-lg">Sin activos registrados</h3>
            <p className="text-muted text-sm max-w-xs">
              Registrá tus primeras inversiones para ver tu portfolio y rendimiento.
            </p>
            <Button variant="accent" onClick={() => setIsCargarOpen(true)} className="mt-1">
              <Plus className="h-4 w-4 mr-1.5" />
              Cargar mi primera inversión
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            <PortfolioList
              assets={portfolio.assets}
              transactions={investmentTransactions}
              displayCurrency={displayCurrency}
              onDeleteAsset={handleDeleteAsset}
            />
          </div>
        )}

        <div className="mt-2.5">
          <SavingsCard displayCurrency={displayCurrency} />
        </div>
      </main>

      {/* Cargar: el form existente, ahora en diálogo */}
      <Dialog open={isCargarOpen} onOpenChange={setIsCargarOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto bg-surface border-border text-text">
          <DialogHeader>
            <DialogTitle className="text-text">Nueva operación</DialogTitle>
          </DialogHeader>
          <QuickAddForm />
        </DialogContent>
      </Dialog>

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
        onRetried={({ updated, failed, failedRates }) =>
          setLastRefreshResult({ updated, failed, failedRates, timestamp: new Date().toISOString() })
        }
      />
    </div>
  )
}
