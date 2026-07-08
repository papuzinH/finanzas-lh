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

  const getRate = (pair: string): number => {
    const r = exchangeRates.find((e) => e.pair === pair)
    if (r && r.rate > 0) return r.rate
    if (blueFallback) return blueFallback
    return 1
  }

  const mepRate = getRate('USD_ARS_MEP')
  const cclRate = getRate('USD_ARS_CCL')
  const usdtRate = getRate('USDT_ARS')

  const convertArsToDisplay = (arsValue: number): number => {
    if (displayCurrency === 'ARS') return arsValue
    if (displayCurrency === 'USD_MEP') return arsValue / mepRate
    if (displayCurrency === 'USD_CCL') return arsValue / cclRate
    if (displayCurrency === 'USDT') return arsValue / usdtRate
    return arsValue / mepRate
  }

  const convertToARS = (amount: number, fromCurrency: string): number => {
    if (fromCurrency === 'ARS') return amount
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

    const totalBuyQty = buys.reduce((s, t) => s + Number(t.quantity), 0)
    const totalSellQty = sells.reduce((s, t) => s + Number(t.quantity), 0)
    const position = Math.max(totalBuyQty - totalSellQty, 0)

    const totalBuyCostARS = buys.reduce((s, t) => {
      const costRaw = Number(t.quantity) * Number(t.price_per_unit) + Number(t.fees ?? 0)
      return s + convertToARS(costRaw, t.currency)
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
      currentPriceARS =
        Number(mp.price_usd) *
        (asset.asset_type === 'cedear' ? Number(mp.ccl_implicit || cclRate) : mepRate)
    }

    const currentValueARS = position * currentPriceARS
    const investedValueARS = position * ppcARS
    const unrealizedPLARS = currentValueARS - investedValueARS

    const realizedPLARS = sells.reduce((s, t) => {
      const sellRevenueARS = convertToARS(
        Number(t.quantity) * Number(t.price_per_unit) - Number(t.fees ?? 0),
        t.currency,
      )
      const originalCostARS = Number(t.quantity) * ppcARS
      return s + (sellRevenueARS - originalCostARS)
    }, 0)

    globalValueARS += currentValueARS
    globalInvestedARS += investedValueARS
    globalRealizedPLARS += realizedPLARS

    const plPercent = investedValueARS > 0 ? (unrealizedPLARS / investedValueARS) * 100 : 0

    return {
      id: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      asset_type: asset.asset_type,
      currency: asset.currency,
      position,
      ppc: convertArsToDisplay(ppcARS),
      currentPrice: convertArsToDisplay(currentPriceARS),
      currentValue: convertArsToDisplay(currentValueARS),
      investedValue: convertArsToDisplay(investedValueARS),
      unrealizedPL: convertArsToDisplay(unrealizedPLARS),
      realizedPL: convertArsToDisplay(realizedPLARS),
      totalPL: convertArsToDisplay(unrealizedPLARS + realizedPLARS),
      plPercent,
      lastUpdate: mp?.last_update ?? null,
      source: mp?.source ?? null,
      metadata: (asset.metadata as Record<string, unknown> | null) ?? null,
      profitAmount: convertArsToDisplay(unrealizedPLARS),
      profitPercent: plPercent,
      lastPrice: convertArsToDisplay(currentPriceARS),
    }
  })

  const totalUnrealizedPLDisplay = convertArsToDisplay(globalValueARS - globalInvestedARS)
  const totalRealizedPLDisplay = convertArsToDisplay(globalRealizedPLARS)
  const totalInvestedDisplay = convertArsToDisplay(globalInvestedARS)

  // Savings (tenencia de dólares/pesos sueltos)
  const arsSavingsRaw = savings
    .filter((s) => s.currency === 'ARS')
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const usdSavingsRaw = savings
    .filter((s) => s.currency === 'USD')
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const savingsInARS = arsSavingsRaw + usdSavingsRaw * mepRate

  return {
    assets,
    totalValue: convertArsToDisplay(globalValueARS + savingsInARS),
    totalInvested: totalInvestedDisplay,
    totalUnrealizedPL: totalUnrealizedPLDisplay,
    totalRealizedPL: totalRealizedPLDisplay,
    totalPLPercent:
      totalInvestedDisplay > 0
        ? ((totalUnrealizedPLDisplay + totalRealizedPLDisplay) / totalInvestedDisplay) * 100
        : 0,
    totalSavings: convertArsToDisplay(savingsInARS),
    savingsBreakdown: { ARS: arsSavingsRaw, USD: usdSavingsRaw },
    displayCurrency,
    lastUpdate,
    totalBalanceARS: displayCurrency === 'ARS' ? (globalValueARS + savingsInARS) : 0,
    totalBalanceUSD: displayCurrency !== 'ARS' ? convertArsToDisplay(globalValueARS + savingsInARS) : 0,
    totalProfitARS: displayCurrency === 'ARS' ? (globalValueARS - globalInvestedARS) : 0,
    totalProfitUSD: displayCurrency !== 'ARS' ? totalUnrealizedPLDisplay : 0,
  }
}
