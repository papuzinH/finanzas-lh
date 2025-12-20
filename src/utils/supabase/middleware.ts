import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // 1. Creamos una respuesta inicial base
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
          // 🛑 AQUÍ ESTÁ EL TRUCO PARA SOLUCIONAR EL BUG DEL F5 🛑
          
          // A. Actualizamos el REQUEST: Esto permite que supabase.auth.getUser() 
          // vea la sesión actualizada INMEDIATAMENTE en esta misma ejecución.
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          
          // B. Actualizamos el RESPONSE: Recreamos la respuesta para asegurar 
          // que las cookies viajen al navegador.
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

  // 2. Verificamos el usuario. 
  // IMPORTANTE: Al haber hecho el paso A arriba, getUser() ya no devolverá null falsamente.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 3. Lógica de Protección de Rutas
  // Si NO hay usuario y NO estamos en una ruta pública -> Redirigir a Login
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 4. Lógica para usuarios autenticados
  if (user) {
    // A. Si ya hay usuario y trata de entrar al login -> Mandar al home
    if (request.nextUrl.pathname.startsWith('/login')) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }

    // B. Verificar telegram_chat_id para redirigir a onboarding si falta
    // Excluimos rutas de auth, onboarding y archivos estáticos
    if (
      !request.nextUrl.pathname.startsWith('/onboarding') &&
      !request.nextUrl.pathname.startsWith('/auth') &&
      !request.nextUrl.pathname.includes('.')
    ) {
      const { data: profile } = await supabase
        .from('users')
        .select('telegram_chat_id')
        .eq('id', user.id)
        .single()

      if (!profile?.telegram_chat_id) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}