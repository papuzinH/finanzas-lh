import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { destinoSeguro } from '@/lib/security/destino-redirect'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // El `next` viene de la query: sólo se acepta una ruta interna, si no la
  // sesión recién creada se podía llevar a otro host (auditoría L1).
  const destino = destinoSeguro(searchParams.get('next'))

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // El contexto de Route Handler permite setear cookies
            }
          },
        },
      }
    )
    
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${destino}`)
    }

    // El code no se pudo canjear. Antes de dar el login por perdido: en Android el
    // callback llega DOS veces con el mismo code (medido el 2026-09-01: 200 y a los
    // 800ms un 404; en otro intento dos 400 a 70ms de distancia), y para cuando
    // llega el segundo la primera ejecución ya dejó la sesión en las cookies. Si el
    // usuario ya está adentro, mandarlo a `/login?error=...` es mentirle -- y es lo
    // que lo hacía reintentar y abrir sesiones de más.
    const { data } = await supabase.auth.getUser()
    if (data.user) {
      return NextResponse.redirect(`${origin}${destino}`)
    }
  }

  // Retornar al login con error si algo falla
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}