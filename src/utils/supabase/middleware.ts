import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. EXCLUSIÓN: No procesar middleware para rutas de auth o archivos estáticos
  if (
    pathname.startsWith('/auth') || 
    pathname.startsWith('/login') || 
    pathname.startsWith('/signup') ||
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
  const { data: { user } } = await supabase.auth.getUser()

  // 3. Protección de rutas: Si no hay usuario, al login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 4. Validación de telegram_chat_id
  // Solo si no estamos ya en onboarding y no es una ruta de auth
  if (!pathname.startsWith('/onboarding')) {
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('telegram_chat_id')
        .eq('id', user.id)
        .single()

      const telegramId = profile?.telegram_chat_id
      const isValid = telegramId && telegramId.trim().length > 0

      if (!isValid) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        // Redirigimos a onboarding. Las cookies de sesión ya van en la request.
        return NextResponse.redirect(url)
      }
    } catch (error) {
      // Si hay un error de DB, permitimos el paso para evitar bloquear al usuario
      console.error('Middleware DB Error:', error)
    }
  }

  return supabaseResponse
}