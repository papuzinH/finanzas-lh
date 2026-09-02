import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/image', () => ({ default: () => null }))
vi.mock('../login-form', () => ({
  LoginForm: ({ conEmail }: { conEmail?: boolean }) => (
    <div>
      <button>Continuar con Google</button>
      {conEmail && (
        <form>
          <input name="email" />
          <button>Entrar con email</button>
        </form>
      )}
    </div>
  ),
}))
vi.mock('@/components/shared/install-app', () => ({ InstallApp: () => null }))

import LoginPage from '../page'

const URL_PROD = 'https://mkkgdjxaotgimqwhyesx.supabase.co'
const URL_DEV = 'https://hgxuxoqyrooaariimqmg.supabase.co'

describe('login', () => {
  it('avisa la política de privacidad antes de entrar, con link', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_DEV)
    const out = renderToStaticMarkup(<LoginPage />)
    expect(out).toContain('href="/privacidad"')
    expect(out.toLowerCase()).toContain('política de privacidad')
    vi.unstubAllEnvs()
  })

  it('en producción no ofrece login por email', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_PROD)
    const out = renderToStaticMarkup(<LoginPage />)
    expect(out).not.toContain('name="email"')
    expect(out).not.toContain('Entrar con email')
    expect(out).toContain('Continuar con Google')
    vi.unstubAllEnvs()
  })

  it('fuera de producción ofrece login por email además de Google', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_DEV)
    const out = renderToStaticMarkup(<LoginPage />)
    expect(out).toContain('name="email"')
    expect(out).toContain('Entrar con email')
    expect(out).toContain('Continuar con Google')
    vi.unstubAllEnvs()
  })
})
