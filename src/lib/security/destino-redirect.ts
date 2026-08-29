/**
 * Adónde puede mandar el callback de OAuth después de crear la sesión.
 *
 * El `next` llega de la query string, o sea del atacante si la víctima abre un
 * link armado. Componerlo como `${origin}${next}` sin mirar deja pasar
 * `@evil.com`: `https://michanchito.net@evil.com` es una URL válida cuyo host
 * es `evil.com` — el `michanchito.net` de adelante queda como credencial.
 *
 * La política es allowlist, no blocklist: sólo se acepta una ruta interna
 * (empieza con UNA barra) que no pueda reinterpretarse como host. Cualquier
 * otra cosa cae a la raíz. Auditoría 2026-08-26, L1.
 */
export function destinoSeguro(raw: string | null | undefined): string {
  if (!raw) return '/'
  if (!raw.startsWith('/')) return '/' // absolutas, esquemas raros, rutas sueltas
  if (raw.startsWith('//')) return '/' // protocol-relative: //evil.com
  if (raw.startsWith('/\\')) return '/' // varios navegadores normalizan \ a /
  if (raw.includes('@')) return '/' // el origen pasa a ser credencial de otro host
  return raw
}
