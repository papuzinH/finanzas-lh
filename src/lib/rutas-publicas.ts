/**
 * Páginas públicas de contenido: se ven sin sesión, sin el shell de la app
 * (nav, chat, tour) y sin pasar por los gates de onboarding. Hoy: la política
 * de privacidad. La raíz NO está acá: `/` tiene su propio split por sesión
 * (landing al anónimo, dashboard al logueado) en `app/page.tsx`.
 *
 * La consumen el middleware y el AppShell — una sola lista para que agregar
 * una ruta en un lado y olvidarla en el otro sea imposible
 * (`lib/__tests__/rutas-publicas.test.ts`).
 */
export const RUTAS_PUBLICAS = ['/privacidad'] as const

export function esRutaPublica(pathname: string): boolean {
  return (RUTAS_PUBLICAS as readonly string[]).includes(pathname)
}
