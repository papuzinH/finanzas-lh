/**
 * Vaciar el CacheStorage del service worker al cerrar sesión.
 *
 * La PWA cachea navegaciones enteras (`cacheOnFrontEndNav` y
 * `aggressiveFrontEndNavCaching` en `next.config.ts`), así que en un teléfono
 * compartido el siguiente en usarlo puede ver por un instante una pantalla del
 * anterior servida de caché. Los datos ya no llegan —la sesión se fue—, pero
 * el HTML sí. Auditoría 2026-08-26, L6.
 *
 * Nunca lanza: limpiar es higiene, cerrar sesión es lo importante. El SW
 * repuebla el precache solo en la próxima carga.
 *
 * @returns cuántas caches se borraron (0 si no hay CacheStorage).
 */
export async function limpiarCachesDeLaApp(): Promise<number> {
  const store = (globalThis as { caches?: CacheStorage }).caches
  if (!store) return 0

  try {
    const nombres = await store.keys()
    const resultados = await Promise.all(
      nombres.map((nombre) => store.delete(nombre).catch(() => false))
    )
    return resultados.filter(Boolean).length
  } catch {
    return 0
  }
}
