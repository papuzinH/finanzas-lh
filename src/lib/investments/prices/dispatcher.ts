import { fetchStockPrice, fetchUSPrice } from './yahoo'
import { fetchBondPrice, fetchONPrice, fetchFCIPrice, fetchLetrasPrice, fetchFromUrl } from './iol'
import { fetchCryptoPrice } from './coingecko'
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

  switch (asset_type) {
    case 'stock': {
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
      const url = data_source_url || null
      const price_ars = url ? await fetchFromUrl(url) : await fetchBondPrice(ticker)
      if (price_ars === null) return null
      return { price_ars, source: 'iol' }
    }

    case 'on': {
      const url = data_source_url || null
      const price_ars = url ? await fetchFromUrl(url) : await fetchONPrice(ticker)
      if (price_ars === null) return null
      return { price_ars, source: 'iol' }
    }

    case 'lecap':
    case 'boncap': {
      const url = data_source_url || null
      const price_ars = url ? await fetchFromUrl(url) : await fetchLetrasPrice(ticker)
      if (price_ars === null) return null
      return { price_ars, source: 'iol' }
    }

    case 'fci':
    case 'etf': {
      const url = data_source_url || null
      const price_ars = url ? await fetchFromUrl(url) : await fetchFCIPrice(ticker)
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
