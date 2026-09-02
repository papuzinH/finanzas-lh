/**
 * Detección de entorno a partir de la URL de Supabase.
 *
 * Existe una sola señal confiable de "esto es producción": el ref del
 * proyecto de Supabase al que apunta `NEXT_PUBLIC_SUPABASE_URL`. Vercel
 * arma un preview por rama contra la base DEV (`hgxuxoqyrooaariimqmg`), que
 * tiene el provider de email habilitado con autoconfirm porque Google NO
 * está configurado ahí — sin eso nadie puede entrar a un preview desde el
 * celular. Producción es al revés: solo Google, el provider de email está
 * apagado. El login por email tiene que renderizar y funcionar en DEV/local
 * y desaparecer del todo en producción, así que la decisión no puede vivir
 * en una env var de feature flag: sale de la misma URL que ya define contra
 * qué base corre la app.
 *
 * El chequeo es por **hostname exacto** (primer label), el mismo patrón que
 * usan los scripts (`scripts/verificar-escenarios-tarjeta.mjs` y otros) para
 * no tocar producción por accidente.
 */
const REF_PRODUCCION = 'mkkgdjxaotgimqwhyesx'

/** true si `url` apunta al proyecto de Supabase de producción. */
export function esBaseDeProduccion(url: string | undefined): boolean {
  if (!url) return false
  try {
    return new URL(url).hostname.split('.')[0] === REF_PRODUCCION
  } catch {
    return false
  }
}

/**
 * Si el login por email/contraseña puede mostrarse y funcionar en este
 * entorno. Fail-closed: sin `NEXT_PUBLIC_SUPABASE_URL` (no debería pasar,
 * pero mejor no asumir) no se muestra.
 */
export function permiteLoginPorEmail(
  url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): boolean {
  if (!url) return false
  return !esBaseDeProduccion(url)
}
