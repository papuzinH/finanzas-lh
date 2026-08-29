import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Todo menos:
     * - los internos de Next (_next/static, _next/image, _next/data…)
     * - cualquier archivo con extensión AL FINAL del path (.png, .svg, .js,
     *   .webmanifest, y también .txt/.xml/.woff2, que la lista vieja no
     *   nombraba: un robots.txt agregado mañana no tiene que pedir sesión).
     *
     * El ancla `$` es la diferencia con el viejo `pathname.includes('.')` del
     * middleware, que excluía del gate cualquier ruta con un punto en el medio
     * (auditoría L2). `/x.y/z` es una ruta y sí pasa por acá.
     */
    '/((?!_next/|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)',
  ],
}