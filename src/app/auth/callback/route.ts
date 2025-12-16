import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr' // Quité CookieOptions que no se usaba
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

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
              // Server Action / Route Handler context
            }
          },
        },
      }
    )
    
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Verificar si el usuario tiene telegram_chat_id
      const { data: { user } } = await supabase.auth.getUser()
      let redirectUrl = next

      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('telegram_chat_id')
          .eq('id', user.id)
          .single()

        if (!profile?.telegram_chat_id) {
          redirectUrl = '/onboarding'
        }
      }

      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${redirectUrl}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${redirectUrl}`)
      } else {
        return NextResponse.redirect(`${origin}${redirectUrl}`)
      }
    } else {
      // 🚨 AQUÍ ESTÁ EL CAMBIO: Logueamos el error
      console.error("🔴 Error en Auth Callback:", error)
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=no_code_provided`)
}