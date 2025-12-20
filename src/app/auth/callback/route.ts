import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Obtener la URL base correcta para la redirección
  const getURL = () => {
    let url =
      process.env.NEXT_PUBLIC_SITE_URL ?? 
      process.env.NEXT_PUBLIC_VERCEL_URL ?? 
      'http://localhost:3000';
    url = url.includes('http') ? url : `https://${url}`;
    url = url.charAt(url.length - 1) === '/' ? url.slice(0, -1) : url;
    return url;
  };

  const origin = getURL();

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
      // Redirigir a la URL completa para evitar problemas de protocolo
      return NextResponse.redirect(`${origin}${next}`)
    }
    
    console.error("🔴 Error en exchangeCodeForSession:", error)
  }

  // Retornar al login con error si algo falla
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}