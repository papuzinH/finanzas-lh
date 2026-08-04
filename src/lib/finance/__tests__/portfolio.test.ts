import { describe, it, expect } from 'vitest'
import { computePortfolioStatus } from '@/lib/finance/portfolio'
import type { PortfolioInputs } from '@/lib/finance/portfolio'
import type {
  InvestmentAsset,
  InvestmentTransaction,
  MarketPrice,
  ExchangeRate,
  Saving,
} from '@/types/database'

const asset = (overrides: Partial<InvestmentAsset>) =>
  ({
    id: 'a1',
    user_id: 'uuid-1',
    ticker: 'GGAL',
    name: 'Grupo Galicia',
    asset_type: 'stock',
    currency: 'ARS',
    metadata: {},
    is_active: true,
    ...overrides,
  }) as InvestmentAsset

const invTx = (overrides: Partial<InvestmentTransaction>) =>
  ({
    id: 't1',
    asset_id: 'a1',
    user_id: 'uuid-1',
    type: 'buy',
    quantity: 1,
    price_per_unit: 100,
    total_amount: 100,
    fees: 0,
    currency: 'ARS',
    date: '2026-01-02',
    ...overrides,
  }) as InvestmentTransaction

const mp = (overrides: Partial<MarketPrice>) =>
  ({ ticker: 'GGAL', last_price: 100, last_update: '2026-07-01', ...overrides }) as MarketPrice

const rate = (pair: string, value: number) => ({ pair, rate: value }) as ExchangeRate

const saving = (currency: 'ARS' | 'USD', amount: number) =>
  ({ id: `s-${currency}-${amount}`, user_id: 'uuid-1', amount, currency, date: '2026-07-01' }) as Saving

const baseInputs = (overrides: Partial<PortfolioInputs> = {}): PortfolioInputs => ({
  investmentAssets: [],
  investmentTransactions: [],
  marketPrices: [],
  exchangeRates: [],
  dolarBlue: null,
  savings: [],
  ...overrides,
})

describe('computePortfolioStatus', () => {
  it('activo ARS simple con precio de mercado: PPC, valor y P/L correctos', () => {
    const r = computePortfolioStatus(
      baseInputs({
        investmentAssets: [asset({})],
        investmentTransactions: [invTx({ quantity: 10, price_per_unit: 100 })],
        marketPrices: [mp({ last_price: 150 })],
      }),
    )
    expect(r.assets).toHaveLength(1)
    const a = r.assets[0]
    expect(a.position).toBe(10)
    expect(a.ppc).toBe(100)
    expect(a.currentPrice).toBe(150)
    expect(a.currentValue).toBe(1500)
    expect(a.investedValue).toBe(1000)
    expect(a.unrealizedPL).toBe(500)
    expect(a.plPercent).toBe(50)
    expect(r.totalValue).toBe(1500)
    expect(r.totalInvested).toBe(1000)
    expect(r.totalUnrealizedPL).toBe(500)
    expect(r.lastUpdate).toBe('2026-07-01')
  })

  it('cedear en USD usa price_usd × ccl_implicit y convierte compras con MEP', () => {
    const r = computePortfolioStatus(
      baseInputs({
        investmentAssets: [asset({ ticker: 'AAPL', name: 'Apple', asset_type: 'cedear', currency: 'USD' })],
        // 2 × 8 USD = 16 USD → 16.000 ARS con MEP 1000 → PPC 8.000 ARS
        investmentTransactions: [invTx({ quantity: 2, price_per_unit: 8, currency: 'USD' })],
        marketPrices: [mp({ ticker: 'AAPL', last_price: 9999, price_usd: 10, ccl_implicit: 1200 })],
        exchangeRates: [rate('USD_ARS_MEP', 1000), rate('USD_ARS_CCL', 1100)],
      }),
    )
    const a = r.assets[0]
    expect(a.ppc).toBe(8000)
    // precio actual = 10 USD × ccl_implicit 1200 (NO last_price ni MEP)
    expect(a.currentPrice).toBe(12000)
    expect(a.currentValue).toBe(24000)
    expect(a.investedValue).toBe(16000)
    expect(a.unrealizedPL).toBe(8000)
    expect(a.plPercent).toBe(50)
  })

  it('plazo fijo devenga TNA lineal según metadata y `now`', () => {
    const r = computePortfolioStatus(
      baseInputs({
        investmentAssets: [
          asset({
            ticker: 'PF1',
            name: 'Plazo fijo',
            asset_type: 'plazo_fijo',
            metadata: { tna: 0.365, start_date: '2026-01-01' },
          }),
        ],
        investmentTransactions: [invTx({ quantity: 1, price_per_unit: 100000 })],
      }),
      'ARS',
      new Date(2026, 0, 11), // 10 días desde el alta → 1 + 0.365 × (10/365) = 1.01
    )
    const a = r.assets[0]
    expect(a.currentPrice).toBeCloseTo(101000, 5)
    expect(a.currentValue).toBeCloseTo(101000, 5)
    expect(a.unrealizedPL).toBeCloseTo(1000, 5)
  })

  it('plazo fijo no devenga más allá de end_date', () => {
    const r = computePortfolioStatus(
      baseInputs({
        investmentAssets: [
          asset({
            ticker: 'PF1',
            name: 'Plazo fijo',
            asset_type: 'plazo_fijo',
            metadata: { tna: 0.365, start_date: '2026-01-01', end_date: '2026-01-31' },
          }),
        ],
        investmentTransactions: [invTx({ quantity: 1, price_per_unit: 100000 })],
      }),
      'ARS',
      new Date(2026, 5, 1), // mucho después del vencimiento → capea en 30 días
    )
    expect(r.assets[0].currentValue).toBeCloseTo(100000 * (1 + 0.365 * (30 / 365)), 5)
  })

  it('venta calcula realized P/L contra el PPC y reduce la posición', () => {
    const r = computePortfolioStatus(
      baseInputs({
        investmentAssets: [asset({})],
        investmentTransactions: [
          invTx({ id: 'b1', type: 'buy', quantity: 10, price_per_unit: 100 }),
          invTx({ id: 's1', type: 'sell', quantity: 4, price_per_unit: 150 }),
        ],
        marketPrices: [mp({ last_price: 150 })],
      }),
    )
    const a = r.assets[0]
    expect(a.position).toBe(6)
    // realized = 4×150 − 4×PPC(100) = 200
    expect(a.realizedPL).toBe(200)
    expect(a.currentValue).toBe(900)
    expect(a.unrealizedPL).toBe(300)
    expect(r.totalRealizedPL).toBe(200)
  })

  it('savings ARS + USD (a MEP) se suman al totalValue y al breakdown', () => {
    const r = computePortfolioStatus(
      baseInputs({
        investmentAssets: [asset({})],
        investmentTransactions: [invTx({ quantity: 10, price_per_unit: 100 })],
        marketPrices: [mp({ last_price: 150 })],
        exchangeRates: [rate('USD_ARS_MEP', 1000)],
        savings: [saving('ARS', 5000), saving('USD', 10)],
      }),
    )
    // savings = 5.000 ARS + 10 USD × 1.000 = 15.000 ARS
    expect(r.totalSavings).toBe(15000)
    expect(r.savingsBreakdown).toEqual({ ARS: 5000, USD: 10 })
    expect(r.totalValue).toBe(1500 + 15000)
  })

  it('sin exchange_rates usa el dólar blue como fallback de todas las pairs', () => {
    const r = computePortfolioStatus(
      baseInputs({
        investmentAssets: [asset({ ticker: 'AL30', name: 'Bono', asset_type: 'bond', currency: 'USD' })],
        // 1 × 10 USD → convertToARS con blue 1200 = 12.000 ARS
        investmentTransactions: [invTx({ quantity: 1, price_per_unit: 10, currency: 'USD' })],
        dolarBlue: { compra: 1180, venta: 1200, fechaActualizacion: '2026-07-08' },
        savings: [saving('USD', 5)],
      }),
    )
    expect(r.assets[0].ppc).toBe(12000)
    // sin market price → currentPrice = PPC, y savings USD también al blue
    expect(r.totalSavings).toBe(6000)
    expect(r.totalValue).toBe(12000 + 6000)
  })
})

/**
 * Sin ninguna cotización (ni exchange_rates ni dólar blue) el portfolio NO puede
 * valuar nada que dependa de USD. Antes se usaba 1 como tasa: un activo de
 * USD 10.000 se mostraba como ARS 10.000 (~1000x menos) con la misma pinta que
 * un número correcto. Ahora se marca como no valuable y la UI muestra "—".
 */
describe('computePortfolioStatus · sin cotizaciones disponibles', () => {
  const noRates = (overrides: Partial<PortfolioInputs> = {}) =>
    baseInputs({ exchangeRates: [], dolarBlue: null, ...overrides })

  it('NO valúa un activo en USD con tasa 1: lo marca no valuable', () => {
    const r = computePortfolioStatus(
      noRates({
        investmentAssets: [asset({ ticker: 'AL30', name: 'Bono', asset_type: 'bond', currency: 'USD' })],
        investmentTransactions: [invTx({ quantity: 1000, price_per_unit: 10, currency: 'USD' })],
      }),
    )
    const a = r.assets[0]
    expect(a.valuationUnavailable).toBe(true)
    // lo importante: NO aparece 10.000 (el valor USD tomado como si fueran pesos)
    expect(a.ppc).not.toBe(10)
    expect(a.currentValue).not.toBe(10000)
    expect(a.currentValue).toBe(0)
    expect(r.valuationUnavailable).toBe(true)
    expect(r.missingRates).toContain('USD_ARS_MEP')
  })

  it('un activo en ARS se valúa igual: no necesita cotización', () => {
    const r = computePortfolioStatus(
      noRates({
        investmentAssets: [asset({})],
        investmentTransactions: [invTx({ quantity: 10, price_per_unit: 100 })],
        marketPrices: [mp({ last_price: 150 })],
      }),
    )
    expect(r.assets[0].valuationUnavailable).toBe(false)
    expect(r.assets[0].currentValue).toBe(1500)
    expect(r.valuationUnavailable).toBe(false)
    expect(r.missingRates).toEqual([])
  })

  it('savings en USD no se suman al total y quedan marcados', () => {
    const r = computePortfolioStatus(
      noRates({ savings: [saving('ARS', 5000), saving('USD', 10)] }),
    )
    // 10 USD NO valen 10 ARS: solo entra la parte en pesos
    expect(r.totalSavings).toBe(5000)
    expect(r.savingsBreakdown).toEqual({ ARS: 5000, USD: 10 })
    expect(r.valuationUnavailable).toBe(true)
    expect(r.missingRates).toContain('USD_ARS_MEP')
  })

  it('pedir el display en USD sin tasa marca todo el portfolio no valuable', () => {
    const r = computePortfolioStatus(
      noRates({
        investmentAssets: [asset({})],
        investmentTransactions: [invTx({ quantity: 10, price_per_unit: 100 })],
        marketPrices: [mp({ last_price: 150 })],
      }),
      'USD_MEP',
    )
    expect(r.valuationUnavailable).toBe(true)
    expect(r.missingRates).toContain('USD_ARS_MEP')
    expect(r.totalValue).toBe(0)
  })

  it('con blue disponible sigue valuando (el fallback no se rompe)', () => {
    const r = computePortfolioStatus(
      baseInputs({
        investmentAssets: [asset({ ticker: 'AL30', name: 'Bono', asset_type: 'bond', currency: 'USD' })],
        investmentTransactions: [invTx({ quantity: 1, price_per_unit: 10, currency: 'USD' })],
        dolarBlue: { compra: 1180, venta: 1200, fechaActualizacion: '2026-07-08' },
      }),
    )
    expect(r.assets[0].valuationUnavailable).toBe(false)
    expect(r.assets[0].ppc).toBe(12000)
    expect(r.valuationUnavailable).toBe(false)
  })
})
