import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * El login rebotaba en Android: medido el 2026-09-01, 6 de 17 intentos fallaron y
 * en tres el callback se ejecutó DOS veces con el mismo code (200 seguido de 404 a
 * los 800ms; dos 400 a los 70ms). La segunda ejecución falla porque el code ya se
 * consumió -- pero para entonces la PRIMERA ya dejó la sesión en las cookies.
 *
 * El route mandaba esa segunda a `/login?error=auth_callback_failed`, así que el
 * usuario veía el login con error estando ya logueado, y volvía a apretar: de ahí
 * las 5 sesiones vivas en 23 horas de un mismo usuario.
 *
 * Por qué el doble hit ocurre (Custom Tab de Android abriendo dos contextos sobre
 * el mismo redirect) queda como hipótesis sin confirmar. Lo que estos tests fijan
 * es que la app no puede tirar al login a alguien que YA tiene sesión.
 */

const { exchangeCodeForSession, getUser } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { exchangeCodeForSession, getUser } }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})

async function llamar(url: string) {
  const { GET } = await import('@/app/auth/callback/route')
  const res = await GET(new Request(url))
  return res.headers.get('location')
}

const SIN_SESION = { data: { user: null }, error: null }
const CON_SESION = { data: { user: { id: 'uid-1' } }, error: null }

describe('callback de OAuth', () => {
  it('con un code válido lleva al destino', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })

    const destino = await llamar('https://michanchito.net/auth/callback?code=abc')

    expect(destino).toBe('https://michanchito.net/')
  })

  it('con el code ya consumido pero sesión viva, sigue al destino', async () => {
    // Segunda ejecución del mismo callback: el code murió, la sesión existe.
    exchangeCodeForSession.mockResolvedValue({ error: new Error('invalid request') })
    getUser.mockResolvedValue(CON_SESION)

    const destino = await llamar('https://michanchito.net/auth/callback?code=abc')

    expect(destino).toBe('https://michanchito.net/')
  })

  it('con el code caído y sin sesión, vuelve al login con error', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error('invalid request') })
    getUser.mockResolvedValue(SIN_SESION)

    const destino = await llamar('https://michanchito.net/auth/callback?code=abc')

    expect(destino).toBe('https://michanchito.net/login?error=auth_callback_failed')
  })

  it('sin code y sin sesión, vuelve al login con error', async () => {
    getUser.mockResolvedValue(SIN_SESION)

    const destino = await llamar('https://michanchito.net/auth/callback')

    expect(destino).toBe('https://michanchito.net/login?error=auth_callback_failed')
  })

  it('respeta el next interno al recuperar una sesión ya creada', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error('invalid request') })
    getUser.mockResolvedValue(CON_SESION)

    const destino = await llamar('https://michanchito.net/auth/callback?code=abc&next=/movimientos')

    expect(destino).toBe('https://michanchito.net/movimientos')
  })

  it('un next externo no sobrevive ni con sesión viva', async () => {
    // destinoSeguro sigue mandando: `${origin}@evil.com` es una URL cuyo host es
    // evil.com (auditoría L1). Recuperar la sesión no puede aflojar eso.
    exchangeCodeForSession.mockResolvedValue({ error: new Error('invalid request') })
    getUser.mockResolvedValue(CON_SESION)

    const destino = await llamar('https://michanchito.net/auth/callback?code=abc&next=@evil.com')

    expect(destino).toBe('https://michanchito.net/')
  })
})
