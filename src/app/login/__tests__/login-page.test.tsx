import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/image', () => ({ default: () => null }))
vi.mock('../login-form', () => ({ LoginForm: () => <button>Entrar con Google</button> }))
vi.mock('@/components/shared/install-app', () => ({ InstallApp: () => null }))

import LoginPage from '../page'

describe('login', () => {
  it('avisa la política de privacidad antes de entrar, con link', () => {
    const out = renderToStaticMarkup(<LoginPage />)
    expect(out).toContain('href="/privacidad"')
    expect(out.toLowerCase()).toContain('política de privacidad')
  })
})
