import * as cheerio from 'cheerio'
import { esFuentePermitida } from './fuente-permitida'

const IOL_TIMEOUT = 10000

function buildIOLUrl(ticker: string, market: string = 'BCBA'): string {
  return `https://iol.invertironline.com/titulo/cotizacion/${market}/${ticker}/1`
}

async function scrapeIOL(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(IOL_TIMEOUT),
    })
    if (!response.ok) return null

    const html = await response.text()
    const $ = cheerio.load(html)

    const priceText =
      $('span[data-field="UltimoPrecio"]').text().trim() || $('#IdPrecio').text().trim()

    if (!priceText) return null

    const cleaned = priceText.replace(/[$ \t]/g, '').replace(/\./g, '').replace(',', '.')
    const price = parseFloat(cleaned)
    return isNaN(price) ? null : price
  } catch (error) {
    console.error(`Error scraping IOL ${url}:`, error)
    return null
  }
}

export async function fetchBondPrice(ticker: string): Promise<number | null> {
  const baseTicker = ticker.toUpperCase().replace(/[DC]$/, '')
  return scrapeIOL(buildIOLUrl(baseTicker))
}

export async function fetchONPrice(ticker: string): Promise<number | null> {
  return scrapeIOL(buildIOLUrl(ticker.toUpperCase()))
}

export async function fetchFCIPrice(ticker: string): Promise<number | null> {
  return scrapeIOL(buildIOLUrl(ticker.toUpperCase()))
}

/** LECAPs y BONCAPs */
export async function fetchLetrasPrice(ticker: string): Promise<number | null> {
  return scrapeIOL(buildIOLUrl(ticker.toUpperCase()))
}

/**
 * Fetch desde una URL explícita de fuente de datos (data_source_url). Sólo la
 * página de IOL del propio ticker: el dispatcher ya filtra, y acá se repite por
 * defensa en profundidad — nadie llega a `fetch` con una URL ajena.
 */
export async function fetchFromUrl(url: string, ticker: string): Promise<number | null> {
  if (!esFuentePermitida(url, ticker)) return null
  return scrapeIOL(url)
}
