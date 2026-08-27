/**
 * Allowlist de `data_source_url` (auditoría 2026-08-26, H1).
 *
 * La URL la elige el usuario y el server la fetchea; el precio que sale de ahí se
 * escribe con service_role en `market_prices`, que es global por ticker. Sin esta
 * frontera, un usuario envenenaba el precio de cualquier ticker para todos los
 * demás (o usaba el server como proxy). Se acepta una sola cosa: la página de
 * cotización de IOL del propio ticker — mismo host y misma forma que
 * `buildIOLUrl` en `iol.ts`.
 */
const HOST_IOL = 'iol.invertironline.com'

/** Sin el sufijo D/C que IOL usa para la versión en dólares del mismo bono. */
function tickerBase(ticker: string): string {
  return ticker.toUpperCase().replace(/[DC]$/, '')
}

export function esFuentePermitida(url: string, ticker: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.hostname !== HOST_IOL) return false
  // `new URL` ya normaliza `..`; igual se exige la forma exacta del path.
  const base = tickerBase(ticker)
  const patron = new RegExp(`^/titulo/cotizacion/[A-Z]+/${base}[DC]?/\\d+/?$`, 'i')
  return patron.test(u.pathname)
}

/** La URL del usuario si es permitida; si no, null → la fuente canónica. */
export function urlPermitida(url: string | null | undefined, ticker: string): string | null {
  return url && esFuentePermitida(url, ticker) ? url : null
}
