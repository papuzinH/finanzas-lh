'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { investmentSchema, type InvestmentSchema } from '@/lib/schemas/investment'
import * as cheerio from 'cheerio'

type ActionResponse = {
  error?: string
  success?: boolean
}

// --- INVESTMENTS ---

function buildDataSourceUrl(ticker: string, type: string): string {
  const t = ticker.toUpperCase()
  if (type === 'crypto') {
    return `https://iol.invertironline.com/titulo/cotizacion/CRIPTO/${t}/1`
  }
  return `https://iol.invertironline.com/titulo/cotizacion/BCBA/${t}/1`
}

export async function createInvestment(data: InvestmentSchema): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const validated = investmentSchema.safeParse(data)
    if (!validated.success) {
      return { error: `Datos invalidos: ${validated.error.issues.map(i => i.message).join(', ')}` }
    }

    const dataSourceUrl = validated.data.data_source_url || buildDataSourceUrl(validated.data.ticker, validated.data.type)

    const insertData = {
      user_id: user.id,
      ticker: validated.data.ticker,
      name: validated.data.name,
      type: validated.data.type,
      quantity: validated.data.quantity,
      avg_buy_price: validated.data.avg_buy_price ?? null,
      currency: validated.data.currency || 'ARS',
      data_source_url: dataSourceUrl,
    }

    const { error } = await supabase
      .from('investments')
      .insert(insertData as any)

    if (error) {
      console.error('Error creating investment:', error)
      return { error: `Error al crear la inversion: ${error.message}` }
    }

    // Fetch initial market price only if no existing entry for this ticker
    try {
      const { data: existing, error: lookupError } = await supabase
        .from('market_prices')
        .select('ticker')
        .eq('ticker', validated.data.ticker)
        .maybeSingle()

      if (!lookupError && !existing) {
        const price = await fetchPriceForInvestment(
          validated.data.ticker,
          validated.data.type,
          dataSourceUrl,
        )
        if (price !== null) {
          const ok = await upsertMarketPrice(supabase, validated.data.ticker, price)
          console.log(`Market price for ${validated.data.ticker}: ${price} (upserted: ${ok})`)
        } else {
          console.log(`Could not fetch price for ${validated.data.ticker} (type: ${validated.data.type})`)
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    if (!data.amount || data.amount <= 0) {
      return { error: 'El monto debe ser positivo' }
    }

    const { error } = await supabase
      .from('savings')
      .insert({
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { error } = await supabase
      .from('savings')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

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

// Strategy 1: Scrape IOL for ON, bonds, FCI
async function fetchIOLPrice(dataSourceUrl: string): Promise<number | null> {
  try {
    const response = await fetch(dataSourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) return null

    const html = await response.text()
    const $ = cheerio.load(html)

    const priceText = $('span[data-field="UltimoPrecio"]').text().trim()
      || $('#IdPrecio').text().trim()

    if (!priceText) return null

    const cleaned = priceText
      .replace(/[$ \t]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')

    const price = parseFloat(cleaned)
    return isNaN(price) ? null : price
  } catch (error) {
    console.error(`Error scraping IOL ${dataSourceUrl}:`, error)
    return null
  }
}

// Strategy 2: Yahoo Finance for stocks and CEDEARs
async function fetchYahooPrice(ticker: string): Promise<number | null> {
  try {
    const yahooTicker = `${ticker.toUpperCase()}.BA`
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}`
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) return null

    const data = await response.json()
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    return typeof price === 'number' && !isNaN(price) ? price : null
  } catch (error) {
    console.error(`Error fetching Yahoo price for ${ticker}:`, error)
    return null
  }
}

// Strategy 3: CoinGecko for crypto
async function fetchCoinGeckoPrice(ticker: string): Promise<number | null> {
  try {
    const coinId = ticker.toLowerCase()
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) return null

    const data = await response.json()
    const price = data?.[coinId]?.usd
    return typeof price === 'number' && !isNaN(price) ? price : null
  } catch (error) {
    console.error(`Error fetching CoinGecko price for ${ticker}:`, error)
    return null
  }
}

// Dispatcher: picks the right strategy based on investment type
async function fetchPriceForInvestment(
  ticker: string,
  type: string,
  dataSourceUrl?: string | null,
): Promise<number | null> {
  switch (type) {
    case 'stock':
    case 'cedear':
      return fetchYahooPrice(ticker)
    case 'crypto':
      return fetchCoinGeckoPrice(ticker)
    case 'on':
    case 'bond':
    case 'fci': {
      const url = dataSourceUrl || buildDataSourceUrl(ticker, type)
      return fetchIOLPrice(url)
    }
    default:
      return null
  }
}

// Upsert a single market price
async function upsertMarketPrice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticker: string,
  price: number,
): Promise<boolean> {
  const { error } = await supabase
    .from('market_prices')
    .upsert({
      ticker,
      last_price: price,
      last_update: new Date().toISOString(),
    }, { onConflict: 'ticker' })
  return !error
}

export async function updateMarketPrices(): Promise<ActionResponse & { updated?: number }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { data: investments, error: invError } = await supabase
      .from('investments')
      .select('ticker, type, data_source_url')
      .eq('user_id', user.id)

    if (invError || !investments) {
      return { error: 'Error al obtener inversiones' }
    }

    let updatedCount = 0
    const batchSize = 5

    for (let i = 0; i < investments.length; i += batchSize) {
      const batch = investments.slice(i, i + batchSize)

      const results = await Promise.allSettled(
        batch.map(async (inv) => {
          const price = await fetchPriceForInvestment(inv.ticker, inv.type, inv.data_source_url)
          if (price !== null) {
            return { ticker: inv.ticker, price }
          }
          return null
        })
      )

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const ok = await upsertMarketPrice(supabase, result.value.ticker, result.value.price)
          if (ok) updatedCount++
        }
      }
    }

    revalidatePath('/inversiones')
    return { success: true, updated: updatedCount }
  } catch (error) {
    console.error('Error updating market prices:', error)
    return { error: 'Ocurrio un error inesperado' }
  }
}
