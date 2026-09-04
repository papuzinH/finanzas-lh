import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Un usuario de la beta reportó el 2026-09-01 que la app le pedía "confirmar" en
 * cada login. No era un bug de sesión: `signInWithGoogle` mandaba `prompt: 'consent'`,
 * que le ordena a Google mostrar la pantalla de permisos SIEMPRE, aunque el usuario
 * ya la haya aceptado. Y cada rebote del login (ver el callback) costaba una más.
 *
 * `access_type: 'offline'` iba de la mano: pide un refresh token de Google que la
 * app no usa nunca -- la sesión la maneja Supabase con el suyo.
 */

const { signInWithOAuth } = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { signInWithOAuth } }),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Map([['host', 'michanchito.net']]),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/v2/auth' }, error: null })
})

describe('signInWithGoogle', () => {
  it('no fuerza la pantalla de consentimiento en cada login', async () => {
    const { signInWithGoogle } = await import('@/app/login/actions')

    await signInWithGoogle().catch(() => {}) // el redirect final lanza

    const opciones = signInWithOAuth.mock.calls[0][0].options
    expect(opciones.queryParams?.prompt).toBeUndefined()
    expect(opciones.queryParams?.access_type).toBeUndefined()
  })

  it('sigue mandando el destino del callback', async () => {
    const { signInWithGoogle } = await import('@/app/login/actions')

    await signInWithGoogle().catch(() => {})

    const opciones = signInWithOAuth.mock.calls[0][0].options
    expect(opciones.redirectTo).toBe('https://michanchito.net/auth/callback')
  })
})
