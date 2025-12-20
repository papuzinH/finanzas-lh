import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
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
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANTE: Leemos el usuario para refrescar el token si venció
  const { data: { user } } = await supabase.auth.getUser()

  // Si hay usuario, verificamos si tiene el perfil completo (telegram_chat_id)
  let hasTelegramId = false
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', user.id)
      .single()
    
    hasTelegramId = !!profile?.telegram_chat_id
  }

  // PROTECCIÓN DE RUTAS
  // Si no está logueado y no está en login/auth, lo mandamos al login
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Si está logueado pero NO tiene telegram_chat_id y no está en onboarding/auth, lo mandamos a onboarding
  if (
    user &&
    !hasTelegramId &&
    !request.nextUrl.pathname.startsWith('/onboarding') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/login')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/onboarding'
    return NextResponse.redirect(url)
  }

  // Si YA está logueado y quiere ir al login, lo mandamos al home (o onboarding si le falta)
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = hasTelegramId ? '/' : '/onboarding'
    return NextResponse.redirect(url)
  }

  return response
}