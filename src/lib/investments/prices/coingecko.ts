const COINGECKO_TIMEOUT = 10000

export interface CryptoPrice {
  usd: number
  ars: number
}

/** Retorna precio en USD y ARS para una cripto por su CoinGecko coin ID */
export async function fetchCryptoPrice(ticker: string): Promise<CryptoPrice | null> {
  try {
    const coinId = ticker.toLowerCase()
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd,ars`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(COINGECKO_TIMEOUT),
    })
    if (!response.ok) return null

    const data = await response.json()
    const usd = data?.[coinId]?.usd
    const ars = data?.[coinId]?.ars

    if (typeof usd !== 'number' || typeof ars !== 'number') return null
    return { usd, ars }
  } catch (error) {
    console.error(`Error fetching CoinGecko price for ${ticker}:`, error)
    return null
  }
}

/** Precio ARS de Tether (USDT) via CoinGecko */
export async function fetchUSDTPrice(): Promise<number | null> {
  const result = await fetchCryptoPrice('tether')
  return result?.ars ?? null
}
