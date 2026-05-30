const COINGECKO_TIMEOUT = 10000

export interface CryptoPrice {
  usd: number
  ars: number
}

// Map tickers comunes al coinId de CoinGecko. Cualquier ticker no listado
// se pasa en minúsculas tal cual (asumimos que el usuario ya escribió el coinId).
const TICKER_TO_COINGECKO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  MATIC: 'matic-network',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  TRX: 'tron',
  LINK: 'chainlink',
  LTC: 'litecoin',
  SHIB: 'shiba-inu',
  ATOM: 'cosmos',
  UNI: 'uniswap',
  XLM: 'stellar',
  NEAR: 'near',
  ARB: 'arbitrum',
  OP: 'optimism',
  ETC: 'ethereum-classic',
  FIL: 'filecoin',
  APT: 'aptos',
  BUSD: 'binance-usd',
  PEPE: 'pepe',
  BCH: 'bitcoin-cash',
}

export function resolveCoinId(ticker: string): string {
  const upper = ticker.toUpperCase().trim()
  return TICKER_TO_COINGECKO_ID[upper] ?? ticker.toLowerCase().trim()
}

/** Retorna precio en USD y ARS para una cripto por su ticker (BTC, ETH, ...) o coinId */
export async function fetchCryptoPrice(ticker: string): Promise<CryptoPrice | null> {
  try {
    const coinId = resolveCoinId(ticker)
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
