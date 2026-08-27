'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { investmentSchema, type InvestmentSchema } from '@/lib/schemas/investment'
import { investmentAssetSchema } from '@/lib/schemas/investment-asset'
import { investmentTransactionSchema } from '@/lib/schemas/investment-transaction'
import { detectCurrencyFromTicker } from '@/lib/utils'
import { fetchPriceForAsset } from '@/lib/investments/prices/dispatcher'
import { runUpdatePrices } from '@/lib/investments/update-prices-core'
import type { ASSET_TYPES } from '@/lib/schemas/investment-asset'

type ActionResponse = {
  error?: string
  success?: boolean
}

// --- INVESTMENTS ---

export async function createInvestment(data: InvestmentSchema): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const validated = investmentSchema.safeParse(data)
    if (!validated.success) {
      return { error: `Datos invalidos: ${validated.error.issues.map((i) => i.message).join(', ')}` }
    }

    // Detectar moneda automáticamente si no fue especificada
    const detectedCurrency = detectCurrencyFromTicker(validated.data.ticker)
    const finalCurrency =
      validated.data.currency || detectedCurrency || (validated.data.type === 'crypto' ? 'USD' : 'ARS')

    // Construir URL de fuente de datos
    const dataSourceUrl =
      validated.data.data_source_url ||
      buildDataSourceUrl(validated.data.ticker, validated.data.type)

    const insertData = {
      user_id: user.id,
      ticker: validated.data.ticker,
      name: validated.data.name,
      type: validated.data.type,
      quantity: validated.data.quantity,
      avg_buy_price: validated.data.avg_buy_price ?? null,
      currency: finalCurrency,
      data_source_url: dataSourceUrl,
    }

    const { error } = await supabase.from('investments').insert(insertData as any)

    if (error) {
      console.error('Error creating investment:', error)
      return { error: `Error al crear la inversion: ${error.message}` }
    }

    // Fetch precio inicial si no hay entrada existente para este ticker
    try {
      const { data: existing, error: lookupError } = await supabase
        .from('market_prices')
        .select('ticker')
        .eq('ticker', validated.data.ticker)
        .maybeSingle()

      if (!lookupError && !existing) {
        const assetType = validated.data.type as (typeof ASSET_TYPES)[number]
        const priceResult = await fetchPriceForAsset({
          ticker: validated.data.ticker,
          asset_type: assetType,
          data_source_url: dataSourceUrl,
        })
        if (priceResult !== null) {
          // `market_prices` es global (sin user_id): la escritura va con service_role.
          await createAdminClient().from('market_prices').upsert(
            {
              ticker: validated.data.ticker,
              last_price: priceResult.price_ars,
              price_usd: priceResult.price_usd ?? null,
              ccl_implicit: priceResult.ccl_implicit ?? null,
              currency: finalCurrency,
              source: priceResult.source,
              last_update: new Date().toISOString(),
            },
            { onConflict: 'ticker' },
          )
        }
      }
    } catch (e) {
      console.error('Error fetching initial market price:', e)
    }

    revalidatePath('/inversiones')
    return { success: true }
  } catch (error) {
    console.error('Unexpected error:', error)
    return { error: 'Ocurrio un error inesperado' }
  }
}

// --- SAVINGS ---

export async function createSaving(data: {
  amount: number
  currency: 'ARS' | 'USD'
}): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    if (!data.amount || data.amount <= 0) {
      return { error: 'El monto debe ser positivo' }
    }

    const { error } = await supabase.from('savings').insert({
      user_id: user.id,
      amount: data.amount,
      currency: data.currency,
    } as any)

    if (error) {
      console.error('Error creating saving:', error)
      return { error: `Error al guardar: ${error.message}` }
    }

    revalidatePath('/inversiones')
    return { success: true }
  } catch (error) {
    console.error('Unexpected error:', error)
    return { error: 'Ocurrio un error inesperado' }
  }
}

export async function deleteSaving(id: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { error } = await supabase.from('savings').delete().eq('id', id).eq('user_id', user.id)

    if (error) {
      console.error('Error deleting saving:', error)
      return { error: `Error al eliminar: ${error.message}` }
    }

    revalidatePath('/inversiones')
    return { success: true }
  } catch (error) {
    console.error('Unexpected error:', error)
    return { error: 'Ocurrio un error inesperado' }
  }
}

// --- MARKET PRICES ---

export async function updateMarketPrices(): Promise<ActionResponse & { updated?: number; skipped?: boolean }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    // `skipped` viaja hacia afuera: sin él, un refresco salteado por el umbral
    // (M6) se reporta igual que uno que corrió y no encontró nada que cambiar.
    const { updated, skipped } = await runUpdatePrices(supabase, user.id)

    revalidatePath('/inversiones')
    return { success: true, updated, skipped }
  } catch (error) {
    console.error('Error updating market prices:', error)
    return { error: 'Ocurrio un error inesperado' }
  }
}

// --- INVESTMENT ASSETS (v2) ---

export async function createAsset(data: {
  ticker: string
  name: string
  asset_type: string
  currency?: string
  data_source_url?: string
  metadata?: Record<string, unknown>
}): Promise<ActionResponse & { id?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const validated = investmentAssetSchema.safeParse(data)
    if (!validated.success) {
      return { error: `Datos invalidos: ${validated.error.issues.map((i) => i.message).join(', ')}` }
    }

    const { data: inserted, error } = await supabase
      .from('investment_assets')
      .insert({
        user_id: user.id,
        ticker: validated.data.ticker,
        name: validated.data.name,
        asset_type: validated.data.asset_type,
        currency: validated.data.currency ?? null,
        data_source_url: validated.data.data_source_url || null,
        metadata: validated.data.metadata ?? {},
      } as any)
      .select('id')
      .single()

    if (error) return { error: `Error al crear activo: ${error.message}` }

    revalidatePath('/inversiones')
    return { success: true, id: inserted.id }
  } catch {
    return { error: 'Ocurrio un error inesperado' }
  }
}

export async function createTransaction(data: {
  asset_id: string
  type: string
  quantity: number
  price_per_unit: number
  fees?: number
  currency: string
  date: string
  notes?: string
}): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const validated = investmentTransactionSchema.safeParse(data)
    if (!validated.success) {
      return { error: `Datos invalidos: ${validated.error.issues.map((i) => i.message).join(', ')}` }
    }

    const total_amount = validated.data.quantity * validated.data.price_per_unit

    const { error } = await supabase.from('investment_transactions').insert({
      user_id: user.id,
      asset_id: validated.data.asset_id,
      type: validated.data.type,
      quantity: validated.data.quantity,
      price_per_unit: validated.data.price_per_unit,
      total_amount,
      fees: validated.data.fees ?? 0,
      currency: validated.data.currency,
      date: validated.data.date,
      notes: validated.data.notes ?? null,
    } as any)

    if (error) return { error: `Error al crear transaccion: ${error.message}` }

    revalidatePath('/inversiones')
    return { success: true }
  } catch {
    return { error: 'Ocurrio un error inesperado' }
  }
}

export async function quickAdd(data: {
  ticker: string
  name: string
  asset_type: string
  quantity: number
  price_per_unit: number
  date: string
  currency?: string
  fees?: number
  notes?: string
  data_source_url?: string
  tna?: number
  end_date?: string
  entity?: string
}): Promise<ActionResponse & { priceFetched?: boolean; currentPrice?: number; source?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    // Normalizar especie base para bonos/ONs/BOPREAL (AL30D/AL30C -> AL30)
    let baseTicker = data.ticker.toUpperCase().trim()
    if (['bond', 'on', 'bopreal'].includes(data.asset_type)) {
      baseTicker = baseTicker.replace(/[DC]$/, '')
    }

    // Buscar o crear el activo
    const { data: existing } = await supabase
      .from('investment_assets')
      .select('id, currency')
      .eq('user_id', user.id)
      .eq('ticker', baseTicker)
      .eq('is_active', true)
      .maybeSingle()

    let assetId: string
    const isNewAsset = !existing
    const assetCurrency = existing?.currency || data.currency || (data.asset_type === 'crypto' ? 'USD' : 'ARS')
    const assetMetadata: Record<string, unknown> = {}

    if (existing) {
      assetId = existing.id
    } else {
      // Construir metadata para tipos especiales
      if (data.tna) assetMetadata.tna = data.tna / 100 // guardar como decimal
      if (data.end_date) assetMetadata.end_date = data.end_date
      if (data.entity) assetMetadata.entity = data.entity
      // start_date de la inversión en plazo_fijo
      if (data.asset_type === 'plazo_fijo' || data.asset_type === 'money_market') {
        assetMetadata.start_date = data.date
      }

      const assetResult = await createAsset({
        ticker: baseTicker,
        name: data.name,
        asset_type: data.asset_type,
        currency: assetCurrency,
        data_source_url: data.data_source_url || undefined,
        metadata: assetMetadata,
      })

      if (assetResult.error || !assetResult.id) {
        return { error: assetResult.error ?? 'Error al crear activo' }
      }
      assetId = assetResult.id
    }

    // Crear la transacción
    const txResult = await createTransaction({
      asset_id: assetId,
      type: 'buy',
      quantity: data.quantity,
      price_per_unit: data.price_per_unit,
      fees: data.fees ?? 0,
      currency: data.currency ?? 'ARS',
      date: data.date,
      notes: data.notes,
    })

    if (txResult.error) {
      return txResult
    }

    // Fetch inicial de precio si es un asset nuevo y no es PF/MM
    const isFixedTerm = data.asset_type === 'plazo_fijo' || data.asset_type === 'money_market'
    let priceFetched = false
    let currentPrice: number | undefined
    let source: string | undefined

    if (isNewAsset && !isFixedTerm) {
      try {
        const { data: existingPrice } = await supabase
          .from('market_prices')
          .select('ticker')
          .eq('ticker', baseTicker)
          .maybeSingle()

        if (!existingPrice) {
          const priceResult = await fetchPriceForAsset({
            ticker: baseTicker,
            asset_type: data.asset_type as (typeof ASSET_TYPES)[number],
            data_source_url: data.data_source_url || null,
            metadata: assetMetadata,
          })
          if (priceResult !== null) {
            // `market_prices` es global (sin user_id): la escritura va con service_role.
            await createAdminClient().from('market_prices').upsert(
              {
                ticker: baseTicker,
                last_price: priceResult.price_ars,
                price_usd: priceResult.price_usd ?? null,
                ccl_implicit: priceResult.ccl_implicit ?? null,
                currency: assetCurrency,
                source: priceResult.source,
                last_update: new Date().toISOString(),
              },
              { onConflict: 'ticker' },
            )
            priceFetched = true
            currentPrice = priceResult.price_ars
            source = priceResult.source
          }
        }
      } catch (e) {
        console.error('Error fetching initial price in quickAdd:', e)
      }
    }

    return { success: true, priceFetched, currentPrice, source }
  } catch (error) {
    console.error('Unexpected error in quickAdd:', error)
    return { error: 'Ocurrio un error inesperado' }
  }
}

export async function deleteAsset(assetId: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { error } = await supabase
      .from('investment_assets')
      .update({ is_active: false } as any)
      .eq('id', assetId)
      .eq('user_id', user.id)

    if (error) return { error: `Error al dar de baja: ${error.message}` }

    revalidatePath('/inversiones')
    return { success: true }
  } catch {
    return { error: 'Ocurrio un error inesperado' }
  }
}

export async function deleteTransaction(txId: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { error } = await supabase
      .from('investment_transactions')
      .delete()
      .eq('id', txId)
      .eq('user_id', user.id)

    if (error) return { error: `Error al eliminar transaccion: ${error.message}` }

    revalidatePath('/inversiones')
    return { success: true }
  } catch {
    return { error: 'Ocurrio un error inesperado' }
  }
}

// --- HELPERS ---

function buildDataSourceUrl(ticker: string, type: string): string {
  const t = ticker.toUpperCase()
  if (type === 'crypto') {
    return `https://iol.invertironline.com/titulo/cotizacion/CRIPTO/${t}/1`
  }
  const baseTicker = type === 'bond' ? t.replace(/[DC]$/, '') : t
  return `https://iol.invertironline.com/titulo/cotizacion/BCBA/${baseTicker}/1`
}
