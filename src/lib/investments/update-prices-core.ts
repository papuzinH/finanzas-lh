import { fetchPriceForAsset } from './prices/dispatcher'
import { fetchAllRates } from './prices/exchange-rates'
import { createAdminClient } from '@/utils/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { InvestmentAsset } from '@/types/database'
import type { ASSET_TYPES } from '@/lib/schemas/investment-asset'

const BATCH_SIZE = 5

export interface UpdatePricesResult {
  updated: number
  failed: string[]
  rates_updated: boolean
}

/**
 * Refresca precios y cotizaciones. `supabase` es el cliente de SESIÓN y se usa
 * solo para leer los activos del usuario (RLS por `user_id`); las escrituras a
 * las tablas globales `market_prices`/`exchange_rates` van con `service_role`,
 * que es el único rol autorizado a escribirlas.
 */
export async function runUpdatePrices(
  supabase: SupabaseClient,
  userId: string,
): Promise<UpdatePricesResult> {
  // Fail fast: si falta la key es un error de configuración, no de scraping.
  const admin = createAdminClient()

  const { data: assets, error: assetsError } = await supabase
    .from('investment_assets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (assetsError || !assets) {
    throw new Error('Error al obtener activos')
  }

  let updated = 0
  const failed: string[] = []

  for (let i = 0; i < assets.length; i += BATCH_SIZE) {
    const batch = (assets as InvestmentAsset[]).slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (asset) => {
        if (asset.asset_type === 'plazo_fijo' || asset.asset_type === 'money_market') {
          return { asset, priceResult: null, isFixedTerm: true }
        }

        const priceResult = await fetchPriceForAsset({
          ticker: asset.ticker,
          asset_type: asset.asset_type as (typeof ASSET_TYPES)[number],
          data_source_url: asset.data_source_url,
          metadata: asset.metadata as Record<string, unknown> | null,
        })
        return { asset, priceResult, isFixedTerm: false }
      }),
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        continue
      }

      const { asset, priceResult, isFixedTerm } = result.value

      if (isFixedTerm) {
        updated++
        continue
      }

      if (!priceResult) {
        failed.push(asset.ticker)
        continue
      }

      const { error: upsertError } = await admin.from('market_prices').upsert(
        {
          ticker: asset.ticker,
          last_price: priceResult.price_ars,
          price_usd: priceResult.price_usd ?? null,
          ccl_implicit: priceResult.ccl_implicit ?? null,
          currency: asset.currency ?? 'ARS',
          source: priceResult.source,
          last_update: new Date().toISOString(),
        },
        { onConflict: 'ticker' },
      )

      if (upsertError) {
        console.error(`Error upserting price for ${asset.ticker}:`, upsertError)
        failed.push(asset.ticker)
      } else {
        updated++
      }
    }
  }

  // Actualizar exchange_rates
  let rates_updated = false
  try {
    const rates = await fetchAllRates()
    const now = new Date().toISOString()

    const rateEntries = [
      rates.USD_ARS_BLUE && { pair: 'USD_ARS_BLUE', rate: rates.USD_ARS_BLUE.sell, source: 'dolarapi' },
      rates.USD_ARS_MEP && { pair: 'USD_ARS_MEP', rate: rates.USD_ARS_MEP.sell, source: 'dolarapi' },
      rates.USD_ARS_CCL && { pair: 'USD_ARS_CCL', rate: rates.USD_ARS_CCL.sell, source: 'dolarapi' },
      rates.USDT_ARS !== null && { pair: 'USDT_ARS', rate: rates.USDT_ARS, source: 'coingecko' },
    ].filter(Boolean) as { pair: string; rate: number; source: string }[]

    if (rateEntries.length > 0) {
      const { error: ratesError } = await admin.from('exchange_rates').upsert(
        rateEntries.map((entry) => ({ ...entry, last_update: now })),
        { onConflict: 'pair' },
      )
      rates_updated = !ratesError
      if (ratesError) console.error('Error upserting exchange rates:', ratesError)
    }
  } catch (e) {
    console.error('Error fetching exchange rates:', e)
  }

  return { updated, failed, rates_updated }
}
