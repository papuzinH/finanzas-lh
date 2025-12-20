import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. EXCLUSIÓN: No procesar middleware para rutas de auth o archivos estáticos
  if (
    pathname.includes('/auth') || 
    pathname.includes('/login') || 
    pathname.includes('/signup') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
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
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
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
  // Usamos getUser() que es más seguro que getSession()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  // Si hay un error 403 o similar, tratamos al usuario como no logueado
  // pero evitamos redirigir si ya estamos en una ruta que no requiere auth (aunque ya filtramos arriba)
  if (authError) {
    console.error('Middleware Auth Error:', authError.message)
  }

  // 3. Protección de rutas: Si no hay usuario, al login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Limpiar parámetros de búsqueda para evitar llevar el 'code' al login
    url.search = ''
    return NextResponse.redirect(url)
  }

  // 4. Validación de telegram_chat_id
  if (!pathname.startsWith('/onboarding')) {
    try {
      const { data: profile, error: dbError } = await supabase
        .from('users')
        .select('telegram_chat_id')
        .eq('id', user.id)
        .single()

      if (dbError && dbError.code !== 'PGRST116') {
        console.error('Middleware DB Error:', dbError.message)
        return supabaseResponse
      }

      const telegramId = profile?.telegram_chat_id
      const isValid = telegramId && telegramId.trim().length > 0

      if (!isValid) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        
        const redirectResponse = NextResponse.redirect(url)
        
        // Copiar cookies de sesión a la respuesta de redirección
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