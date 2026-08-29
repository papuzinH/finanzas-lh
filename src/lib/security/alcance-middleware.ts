/**
 * A qué rutas NO les corre el gate de sesión del middleware.
 *
 * Antes esto se decidía con `pathname.includes('/auth')`, `includes('/login')`
 * y `includes('.')` — substrings sin anclar, así que `/movimientos/author` o
 * `/x.y` se salteaban el gate y se renderizaban sin sesión (RLS igual tapa los
 * datos: el efecto era una página vacía, no una filtración). Auditoría L1/L2.
 *
 * Sólo se saltean:
 * - el propio flujo de auth, que no puede exigir la sesión que está creando,
 * - las API routes, que resuelven su autorización adentro,
 * - los internos de Next.
 *
 * Las extensiones de archivo NO se filtran acá: eso lo hace el `matcher` de
 * `src/middleware.ts`, que ancla al final del path en vez de buscar un punto
 * en cualquier posición.
 */
export function debeSaltearElGate(pathname: string): boolean {
  if (pathname === '/login') return true
  if (pathname === '/auth' || pathname.startsWith('/auth/')) return true
  if (pathname === '/api' || pathname.startsWith('/api/')) return true
  if (pathname.startsWith('/_next/')) return true
  return false
}
