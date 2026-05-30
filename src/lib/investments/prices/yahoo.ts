const YAHOO_TIMEOUT = 10000

async function fetchYahoo(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(YAHOO_TIMEOUT),
    })
    if (!response.ok) return null
    const data = await response.json()
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    return typeof price === 'number' && !isNaN(price) ? price : null
  } catch (error) {
    console.error(`Error fetching Yahoo price for ${symbol}:`, error)
    return null
  }
}

/** Precio en pesos ARS para stocks/CEDEARs listados en BCBA (agrega .BA) */
export async function fetchStockPrice(
  ticker: string,
  options?: { market?: 'BCBA' | 'US' },
): Promise<number | null> {
  const market = options?.market ?? 'BCBA'
  const symbol = market === 'US' ? ticker.toUpperCase() : `${ticker.toUpperCase()}.BA`
  return fetchYahoo(symbol)
}

/** Precio en USD para stocks listados en NYSE/NASDAQ (sin suffix) */
export async function fetchUSPrice(ticker: string): Promise<number | null> {
  return fetchYahoo(ticker.toUpperCase())
}
