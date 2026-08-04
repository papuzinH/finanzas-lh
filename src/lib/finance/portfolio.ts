// src/lib/finance/portfolio.ts
import { parseLocalDate } from '@/lib/utils/dates'
import type {
  InvestmentAsset,
  InvestmentTransaction,
  MarketPrice,
  ExchangeRate,
  Saving,
} from '@/types/database'
import type { DolarBlue } from './types'

export type PortfolioDisplayCurrency = 'ARS' | 'USD_MEP' | 'USD_CCL' | 'USDT'

/** Datos crudos necesarios para valuar el portfolio (mismo shape que el estado del store). */
export interface PortfolioInputs {
  investmentAssets: InvestmentAsset[]
  investmentTransactions: InvestmentTransaction[]
  marketPrices: MarketPrice[]
  exchangeRates: ExchangeRate[]
  dolarBlue: DolarBlue | null
  savings: Saving[]
}

export interface PortfolioAssetStatus {
  id: string
  ticker: string
  name: string
  asset_type: string
  currency: string | null
  position: number
  ppc: number
  currentPrice: number
  currentValue: number
  investedValue: number
  unrealizedPL: number
  realizedPL: number
  totalPL: number
  plPercent: number
  lastUpdate: string | null
  source: string | null
  metadata: Record<string, unknown> | null
  profitAmount: number
  profitPercent: number
  lastPrice: number
  /**
   * `true` cuando valuar este activo requería una cotización que no está
   * disponible (ni en `exchange_rates` ni el dólar blue). Sus montos quedan en
   * 0: son un placeholder, NO un valor real. La UI debe mostrar "—".
   */
  valuationUnavailable: boolean
}

export interface PortfolioStatus {
  assets: PortfolioAssetStatus[]
  totalValue: number
  totalInvested: number
  totalUnrealizedPL: number
  totalRealizedPL: number
  totalPLPercent: number
  totalSavings: number
  savingsBreakdown: { ARS: number; USD: number }
  displayCurrency: string
  lastUpdate: string | null
  totalBalanceARS: number
  totalBalanceUSD: number
  totalProfitARS: number
  totalProfitUSD: number
  /** `true` si alguna parte del portfolio no se pudo valuar por falta de cotización. */
  valuationUnavailable: boolean
  /** Pairs que hicieron falta y no se pudieron resolver (ej. `USD_ARS_MEP`). */
  missingRates: string[]
}

/**
 * Valuación completa del portfolio de inversiones (v2: investment_assets +
 * investment_transactions + market_prices + exchange_rates + savings).
 *
 * Función PURA compartida por el store (getPortfolioStatus) y el chatbot
 * (handlePortfolio): PPC en ARS, devengado TNA para plazo_fijo/money_market
 * vía metadata, conversión USD con MEP/CCL, realized/unrealized P/L y savings.
 *
 * `now` solo afecta el devengado de plazo fijo/money market (default: hoy).
 */
export function computePortfolioStatus(
  inputs: PortfolioInputs,
  displayCurrency: PortfolioDisplayCurrency = 'ARS',
  now: Date = new Date(),
): PortfolioStatus {
  const { investmentAssets, investmentTransactions, marketPrices, exchangeRates, dolarBlue, savings } = inputs

  // Fallback al dolar blue (dolarapi.com, non-blocking en fetchAllData) cuando
  // la tabla exchange_rates aún no tiene la pair específica.
  const blueFallback = dolarBlue?.venta && dolarBlue.venta > 0 ? dolarBlue.venta : null

  // Devuelve la cotización o null. NUNCA inventa un valor: antes caía a 1, lo
  // que convertía USD→ARS por 1 y mostraba un portfolio ~1000x más chico con la
  // misma pinta que uno correcto.
  const resolveRate = (pair: string): number | null => {
    const r = exchangeRates.find((e) => e.pair === pair)
    if (r && r.rate > 0) return r.rate
    return blueFallback
  }

  const mepRate = resolveRate('USD_ARS_MEP')
  const cclRate = resolveRate('USD_ARS_CCL')
  const usdtRate = resolveRate('USDT_ARS')

  // Se llenan solo cuando la conversión se INTENTA y falla: un portfolio 100%
  // en pesos y en display ARS no necesita ninguna pair y no reporta faltantes.
  const missingRates = new Set<string>()
  const missing = (pair: string): null => {
    missingRates.add(pair)
    return null
  }

  const displayPair =
    displayCurrency === 'USD_CCL' ? 'USD_ARS_CCL'
    : displayCurrency === 'USDT' ? 'USDT_ARS'
    : 'USD_ARS_MEP'
  const displayRate =
    displayCurrency === 'USD_CCL' ? cclRate : displayCurrency === 'USDT' ? usdtRate : mepRate

  const convertArsToDisplay = (arsValue: number): number | null => {
    if (displayCurrency === 'ARS') return arsValue
    if (displayRate === null) return missing(displayPair)
    return arsValue / displayRate
  }

  /** Igual que `convertArsToDisplay` pero colapsa el faltante a 0 (placeholder). */
  const toDisplay = (arsValue: number): number => convertArsToDisplay(arsValue) ?? 0

  const convertToARS = (amount: number, fromCurrency: string): number | null => {
    if (fromCurrency === 'ARS') return amount
    if (mepRate === null) return missing('USD_ARS_MEP')
    return amount * mepRate
  }

  let globalValueARS = 0
  let globalInvestedARS = 0
  let globalRealizedPLARS = 0
  let lastUpdate: string | null = null

  const assets = investmentAssets.map((asset) => {
    const txs = investmentTransactions.filter((t) => t.asset_id === asset.id)
    const buys = txs.filter((t) => t.type === 'buy')
    const sells = txs.filter((t) => t.type === 'sell')

    // Se prende si alguna conversión que este activo necesita no tuvo cotización.
    let unavailable = false

    const totalBuyQty = buys.reduce((s, t) => s + Number(t.quantity), 0)
    const totalSellQty = sells.reduce((s, t) => s + Number(t.quantity), 0)
    const position = Math.max(totalBuyQty - totalSellQty, 0)

    const totalBuyCostARS = buys.reduce((s, t) => {
      const costRaw = Number(t.quantity) * Number(t.price_per_unit) + Number(t.fees ?? 0)
      const costARS = convertToARS(costRaw, t.currency)
      if (costARS === null) {
        unavailable = true
        return s
      }
      return s + costARS
    }, 0)

    const ppcARS = totalBuyQty > 0 ? totalBuyCostARS / totalBuyQty : 0

    const mp = marketPrices.find((m) => m.ticker === asset.ticker)
    if (mp?.last_update && (!lastUpdate || new Date(mp.last_update) > new Date(lastUpdate))) {
      lastUpdate = mp.last_update
    }

    let currentPriceARS = mp?.last_price ?? ppcARS

    if (asset.asset_type === 'plazo_fijo' || asset.asset_type === 'money_market') {
      const meta = asset.metadata as Record<string, unknown>
      const tna = typeof meta?.tna === 'number' ? meta.tna : 0
      const startStr = typeof meta?.start_date === 'string' ? meta.start_date : null
      const endStr = typeof meta?.end_date === 'string' ? meta.end_date : null

      if (tna > 0 && startStr && totalBuyCostARS > 0) {
        const startD = parseLocalDate(startStr)
        const endD = endStr ? parseLocalDate(endStr) : null
        const today = now
        const elapsedDays = Math.min(
          (today.getTime() - startD.getTime()) / 86400000,
          endD ? (endD.getTime() - startD.getTime()) / 86400000 : 365,
        )
        const dailyAccruedMultiplier = 1 + (tna * (Math.max(elapsedDays, 0) / 365))
        currentPriceARS = position > 0 ? (totalBuyCostARS * dailyAccruedMultiplier) / position : ppcARS
      }
    } else if (asset.currency === 'USD' && mp?.price_usd) {
      // Los CEDEARs valúan por su CCL implícito; si no vino, caen al CCL general.
      const cclImplicit = Number(mp.ccl_implicit)
      const isCedear = asset.asset_type === 'cedear'
      const fx = isCedear ? (cclImplicit > 0 ? cclImplicit : cclRate) : mepRate

      if (fx === null) {
        unavailable = true
        missing(isCedear ? 'USD_ARS_CCL' : 'USD_ARS_MEP')
      } else {
        currentPriceARS = Number(mp.price_usd) * fx
      }
    }

    const currentValueARS = position * currentPriceARS
    const investedValueARS = position * ppcARS
    const unrealizedPLARS = currentValueARS - investedValueARS

    const realizedPLARS = sells.reduce((s, t) => {
      const sellRevenueARS = convertToARS(
        Number(t.quantity) * Number(t.price_per_unit) - Number(t.fees ?? 0),
        t.currency,
      )
      if (sellRevenueARS === null) {
        unavailable = true
        return s
      }
      const originalCostARS = Number(t.quantity) * ppcARS
      return s + (sellRevenueARS - originalCostARS)
    }, 0)

    // Un activo que no se pudo valuar NO aporta a los totales: sus montos son
    // placeholders, sumarlos ensuciaría el total con ceros disfrazados de datos.
    if (!unavailable) {
      globalValueARS += currentValueARS
      globalInvestedARS += investedValueARS
      globalRealizedPLARS += realizedPLARS
    }

    const plPercent =
      unavailable || investedValueARS <= 0 ? 0 : (unrealizedPLARS / investedValueARS) * 100

    /** 0 cuando el activo no se pudo valuar; la UI lo renderiza como "—". */
    const show = (arsValue: number): number => (unavailable ? 0 : toDisplay(arsValue))

    return {
      id: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      asset_type: asset.asset_type,
      currency: asset.currency,
      position,
      ppc: show(ppcARS),
      currentPrice: show(currentPriceARS),
      currentValue: show(currentValueARS),
      investedValue: show(investedValueARS),
      unrealizedPL: show(unrealizedPLARS),
      realizedPL: show(realizedPLARS),
      totalPL: show(unrealizedPLARS + realizedPLARS),
      plPercent,
      lastUpdate: mp?.last_update ?? null,
      source: mp?.source ?? null,
      metadata: (asset.metadata as Record<string, unknown> | null) ?? null,
      profitAmount: show(unrealizedPLARS),
      profitPercent: plPercent,
      lastPrice: show(currentPriceARS),
      valuationUnavailable: unavailable,
    }
  })

  const totalUnrealizedPLDisplay = toDisplay(globalValueARS - globalInvestedARS)
  const totalRealizedPLDisplay = toDisplay(globalRealizedPLARS)
  const totalInvestedDisplay = toDisplay(globalInvestedARS)

  // Savings (tenencia de dólares/pesos sueltos)
  const arsSavingsRaw = savings
    .filter((s) => s.currency === 'ARS')
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const usdSavingsRaw = savings
    .filter((s) => s.currency === 'USD')
    .reduce((acc, s) => acc + Number(s.amount), 0)

  // Los dólares sueltos entran al total solo si hay con qué convertirlos: sin
  // cotización quedan afuera y se reportan en `missingRates` (antes se sumaban
  // a 1:1 con los pesos, que es peor que no sumarlos).
  let savingsInARS = arsSavingsRaw
  if (usdSavingsRaw > 0) {
    if (mepRate === null) missing('USD_ARS_MEP')
    else savingsInARS += usdSavingsRaw * mepRate
  }

  const totalValueDisplay = toDisplay(globalValueARS + savingsInARS)
  const totalSavingsDisplay = toDisplay(savingsInARS)

  return {
    assets,
    totalValue: totalValueDisplay,
    totalInvested: totalInvestedDisplay,
    totalUnrealizedPL: totalUnrealizedPLDisplay,
    totalRealizedPL: totalRealizedPLDisplay,
    totalPLPercent:
      totalInvestedDisplay > 0
        ? ((totalUnrealizedPLDisplay + totalRealizedPLDisplay) / totalInvestedDisplay) * 100
        : 0,
    totalSavings: totalSavingsDisplay,
    savingsBreakdown: { ARS: arsSavingsRaw, USD: usdSavingsRaw },
    displayCurrency,
    lastUpdate,
    totalBalanceARS: displayCurrency === 'ARS' ? (globalValueARS + savingsInARS) : 0,
    totalBalanceUSD: displayCurrency !== 'ARS' ? totalValueDisplay : 0,
    totalProfitARS: displayCurrency === 'ARS' ? (globalValueARS - globalInvestedARS) : 0,
    totalProfitUSD: displayCurrency !== 'ARS' ? totalUnrealizedPLDisplay : 0,
    valuationUnavailable: missingRates.size > 0,
    missingRates: [...missingRates],
  }
}
