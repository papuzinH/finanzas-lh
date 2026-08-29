import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { esRutaPublica } from '@/lib/rutas-publicas'
import { debeSaltearElGate } from '@/lib/security/alcance-middleware'
import { esArranqueDeAppInstalada, PARAM_ARRANQUE } from '@/lib/pwa/arranque'

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. EXCLUSIÓN: el flujo de auth, las API routes y los internos de Next.
  // La decisión vive en `alcance-middleware.ts` con prefijos anclados: antes
  // era por substring y cualquier ruta que *contuviera* `/auth` o un punto se
  // salteaba el gate (auditoría L2). Los archivos los filtra el `matcher`.
  if (debeSaltearElGate(pathname)) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 2. Verificamos el usuario
  const { data: { user } } = await supabase.auth.getUser()

  // 3. Protección de rutas: sin usuario, al login — salvo la raíz, que desde
  // 2026-08-22 sirve la landing pública y decide en el server qué renderizar,
  // y las páginas públicas de contenido (`lib/rutas-publicas.ts`).
  if (!user) {
    // La app instalada abriéndose sin sesión va derecho al login: la landing y
    // su «usar en el navegador» no son para alguien que ya la tiene puesta.
    // Va acá y no en `page.tsx` porque el `loading.tsx` de la raíz hace que
    // para entonces la respuesta ya esté streameando y el redirect se degrade
    // a un salto de cliente. Ver `lib/pwa/arranque.ts`.
    if (esArranqueDeAppInstalada(pathname, request.nextUrl.searchParams.get(PARAM_ARRANQUE))) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.delete(PARAM_ARRANQUE)
      return NextResponse.redirect(url)
    }
    if (pathname === '/' || esRutaPublica(pathname)) {
      return supabaseResponse
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 4. Validación de onboarding completado
  // Solo si no estamos ya en onboarding y no es una ruta de auth
  // Las páginas públicas tampoco pasan por acá: la política de privacidad se
  // tiene que poder leer con la cuenta a medio configurar.
  if (
    !pathname.startsWith('/onboarding') &&
    !pathname.startsWith('/puesta-a-punto') &&
    !esRutaPublica(pathname)
  ) {
    try {
      const { data: profile, error: dbError } = await supabase
        .from('users')
        .select('onboarding_completed, pocket_setup_completed')
        .eq('id', user.id)
        .single()

      if (dbError && dbError.code !== 'PGRST116') {
        console.error('Middleware DB Error:', dbError)
        return supabaseResponse
      }

      const isOnboarded = profile?.onboarding_completed === true

      if (!isOnboarded) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'

        const redirectResponse = NextResponse.redirect(url)
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value, {
            path: cookie.path,
            domain: cookie.domain,
            maxAge: cookie.maxAge,
            expires: cookie.expires,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
          })
        })

        return redirectResponse
      }

      // Modelo de bolsillo: el usuario que ya venía usando la app tiene todos sus
      // medios sin anclar, así que su disponible sigue siendo el flujo acumulado.
      // Una sola vez, se lo manda a declarar saldos, reservas y ritmo.
      if (profile?.pocket_setup_completed !== true) {
        const url = request.nextUrl.clone()
        url.pathname = '/puesta-a-punto'

        const redirectResponse = NextResponse.redirect(url)
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value, {
            path: cookie.path,
            domain: cookie.domain,
            maxAge: cookie.maxAge,
            expires: cookie.expires,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
          })
        })

        return redirectResponse
      }
    } catch (error) {
      console.error('Middleware Unexpected Error:', error)
      return supabaseResponse
    }
  }

  return supabaseResponse
}