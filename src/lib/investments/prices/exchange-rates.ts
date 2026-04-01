import { fetchUSDTPrice } from './coingecko'

export interface ExchangeRateResult {
  USD_ARS_BLUE: { buy: number; sell: number } | null
  USD_ARS_MEP: { buy: number; sell: number } | null
  USD_ARS_CCL: { buy: number; sell: number } | null
  USDT_ARS: number | null
}

const DOLAR_TIMEOUT = 5000

async function fetchDolar(endpoint: string): Promise<{ compra: number; venta: number } | null> {
  try {
    const res = await fetch(`https://dolarapi.com/v1/dolares/${endpoint}`, {
      signal: AbortSignal.timeout(DOLAR_TIMEOUT),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (typeof data?.compra !== 'number' || typeof data?.venta !== 'number') return null
    return { compra: data.compra, venta: data.venta }
  } catch {
    return null
  }
}

/** Obtiene todas las cotizaciones: Blue, MEP, CCL y USDT */
export async function fetchAllRates(): Promise<ExchangeRateResult> {
  const [blue, mep, ccl, usdt] = await Promise.allSettled([
    fetchDolar('blue'),
    fetchDolar('bolsa'),
    fetchDolar('contadoconliqui'),
    fetchUSDTPrice(),
  ])

  return {
    USD_ARS_BLUE:
      blue.status === 'fulfilled' && blue.value
        ? { buy: blue.value.compra, sell: blue.value.venta }
        : null,
    USD_ARS_MEP:
      mep.status === 'fulfilled' && mep.value
        ? { buy: mep.value.compra, sell: mep.value.venta }
        : null,
    USD_ARS_CCL:
      ccl.status === 'fulfilled' && ccl.value
        ? { buy: ccl.value.compra, sell: ccl.value.venta }
        : null,
    USDT_ARS: usdt.status === 'fulfilled' ? usdt.value : null,
  }
}
