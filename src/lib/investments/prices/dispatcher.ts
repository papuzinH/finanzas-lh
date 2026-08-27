import { fetchStockPrice, fetchUSPrice } from './yahoo'
import { fetchBondPrice, fetchONPrice, fetchFCIPrice, fetchLetrasPrice, fetchFromUrl } from './iol'
import { fetchCryptoPrice } from './coingecko'
import { urlPermitida } from './fuente-permitida'
import type { ASSET_TYPES } from '@/lib/schemas/investment-asset'

type AssetType = (typeof ASSET_TYPES)[number]

export interface PriceResult {
  price_ars: number
  price_usd?: number
  ccl_implicit?: number
  tir?: number
  source: string
}

interface AssetInput {
  ticker: string
  asset_type: AssetType
  data_source_url?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Router de cotizaciones: elige la estrategia correcta por asset_type.
 * Para CEDEARs calcula CCL implícito si hay precio en el exterior.
 * Retorna null para activos que no se cotizan en mercado (plazo_fijo, money_market).
 */
export async function fetchPriceForAsset(asset: AssetInput): Promise<PriceResult | null> {
  const { ticker, asset_type, data_source_url, metadata } = asset
  const market = typeof metadata?.market === 'string' ? metadata.market.toUpperCase() : null
  const isInternational =
    metadata?.is_international === true ||
    market === 'US' ||
    market === 'NYSE' ||
    market === 'NASDAQ'

  switch (asset_type) {
    case 'stock': {
      if (isInternational) {
        const price_usd = await fetchUSPrice(ticker)
        if (price_usd === null) return null
        return { price_ars: price_usd, price_usd, source: 'yahoo_us' }
      }

      const price_ars = await fetchStockPrice(ticker)
      if (price_ars === null) return null
      return { price_ars, source: 'yahoo' }
    }

    case 'cedear': {
      const [price_ars, price_usd] = await Promise.all([
        fetchStockPrice(ticker),
        fetchUSPrice(ticker),
      ])
      if (price_ars === null) return null

      let ccl_implicit: number | undefined
      if (price_usd !== null && price_usd > 0) {
        const ratio = typeof metadata?.ratio === 'number' ? metadata.ratio : 1
        ccl_implicit = (price_ars / price_usd) * ratio
      }

      return {
        price_ars,
        price_usd: price_usd ?? undefined,
        ccl_implicit,
        source: 'yahoo',
      }
    }

    case 'bond':
    case 'bopreal': {
      // IOL cotiza renta fija por cada 100 VN. Normalizamos a precio por 1 nominal.
      const url = urlPermitida(data_source_url, ticker)
      const raw = url ? await fetchFromUrl(url, ticker) : await fetchBondPrice(ticker)
      if (raw === null) return null
      return { price_ars: raw / 100, source: 'iol' }
    }

    case 'on': {
      const url = urlPermitida(data_source_url, ticker)
      const raw = url ? await fetchFromUrl(url, ticker) : await fetchONPrice(ticker)
      if (raw === null) return null
      return { price_ars: raw / 100, source: 'iol' }
    }

    case 'lecap':
    case 'boncap': {
      const url = urlPermitida(data_source_url, ticker)
      const raw = url ? await fetchFromUrl(url, ticker) : await fetchLetrasPrice(ticker)
      if (raw === null) return null
      return { price_ars: raw / 100, source: 'iol' }
    }

    case 'fci':
    case 'etf': {
      const url = urlPermitida(data_source_url, ticker)
      if (url) {
        const price_ars = await fetchFromUrl(url, ticker)
        if (price_ars === null) return null
        return { price_ars, source: 'iol' }
      }

      // ETFs internacionales (VOO, QQQ, etc.) priorizan precio en USD
      const etfUsd = await fetchUSPrice(ticker)
      if (etfUsd !== null) {
        return { price_ars: etfUsd, price_usd: etfUsd, source: 'yahoo_us' }
      }

      const price_ars = await fetchFCIPrice(ticker)
      if (price_ars === null) return null
      return { price_ars, source: 'iol' }
    }

    case 'crypto':
    case 'stablecoin': {
      const result = await fetchCryptoPrice(ticker)
      if (!result) return null
      return {
        price_ars: result.ars,
        price_usd: result.usd,
        source: 'coingecko',
      }
    }

    case 'plazo_fijo':
    case 'money_market':
      // Se calculan en el store, no tienen cotización de mercado
      return null

    default:
      return null
  }
}
