/**
 * Headers de seguridad de la app (auditoría 2026-08-26, M3).
 *
 * Vive acá y no dentro de `next.config.ts` para poder testearlo: la CSP es una
 * lista de permisos que rompe la app en silencio cuando le falta algo, y lo que
 * la app necesita se descubre leyendo el código, no copiando una plantilla.
 *
 * Por qué importa más que en una app cualquiera: las cookies de sesión de
 * `@supabase/ssr` NO son httpOnly (el cliente las lee, es su diseño), así que un
 * XSS futuro se lleva la sesión. La CSP es la segunda línea.
 *
 * ⚠️ Al agregar un fetch a un servicio externo **desde el cliente**, sumá su origen
 * a `ORIGENES_DE_DATOS` o el navegador lo va a bloquear. Los fetch del servidor
 * (las cinco fuentes de cotizaciones, Gemini) NO van acá: la CSP sólo gobierna al
 * navegador.
 */

/**
 * Servicios que el navegador consulta directo, sin pasar por nuestro servidor.
 * Hoy los dos salen de `financeStore.ts` dentro de `fetchAllData()`.
 */
export const ORIGENES_DE_DATOS = [
  'https://dolarapi.com', // dólar blue (financeStore.ts:573)
  'https://api.argentinadatos.com', // IPC (financeStore.ts:591)
] as const

/** Avatar de la cuenta de Google, que llega por `user_metadata.avatar_url`. */
const AVATAR_GOOGLE = 'https://lh3.googleusercontent.com'

/**
 * Arma la CSP. `supabaseUrl` se pasa por parámetro (no se hardcodea) porque
 * Preview apunta a DEV y producción a su propio proyecto: un host fijo dejaría
 * a los previews sin base.
 */
export function construirCSP(supabaseUrl: string | undefined): string {
  const supabase: string[] = []
  if (supabaseUrl) {
    supabase.push(supabaseUrl)
    // Realtime viaja por websocket sobre el mismo host, y `connect-src` no lo
    // deduce del origen https: hay que nombrarlo aparte.
    supabase.push(supabaseUrl.replace(/^https:/, 'wss:'))
  }

  return [
    "default-src 'self'",
    // 'unsafe-inline': los scripts inline de Next y el `theme-script` anti-flash.
    // Cambiarlo por nonces exige generarlos en el middleware y pasárselos a Next
    // (ver la nota de la auditoría). Aun con esto, el resto de la política cierra
    // exfiltración (`connect-src`), embebido (`frame-ancestors`) y `base-uri`.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${AVATAR_GOOGLE}`,
    "font-src 'self'", // next/font las self-hostea en el build
    `connect-src 'self' ${[...supabase, ...ORIGENES_DE_DATOS].join(' ')}`.trim(),
    "worker-src 'self'", // el service worker de next-pwa
    "manifest-src 'self'",
    "frame-ancestors 'none'", // clickjacking sobre «Borrar la cuenta»
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com", // el login sale a Google
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

export interface SecurityHeader {
  key: string
  value: string
}

/**
 * `reportOnly: true` manda la CSP como `Content-Security-Policy-Report-Only`: el
 * navegador reporta lo que habría bloqueado y no rompe nada. Sin `report-uri` los
 * reportes sólo se ven en la consola del navegador, así que report-only es útil
 * mientras alguien mira, no como estado permanente.
 */
export function construirSecurityHeaders(
  supabaseUrl: string | undefined,
  { reportOnly }: { reportOnly: boolean },
): SecurityHeader[] {
  return [
    {
      key: reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
      value: construirCSP(supabaseUrl),
    },
    // Redundante con `frame-ancestors` en navegadores modernos, y sigue haciendo
    // falta para los que no leen esa directiva.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // El micrófono queda habilitado para el propio origen: el chat dicta por voz
    // (`useSpeechRecognition`, es-AR). El resto, cerrado.
    { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), microphone=(self)' },
  ]
}
