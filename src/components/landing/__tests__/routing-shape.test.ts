/**
 * `/` sirve dos mundos: la landing al anónimo y el dashboard al logueado.
 * Estos tests fijan la forma del split — page.tsx tiene que ser Server
 * Component (sin 'use client') y delegar en los dos lados — porque el bug
 * más fácil acá es que alguien vuelva a poner lógica de cliente en page.tsx
 * y rompa la decisión por sesión en el server.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/app/page.tsx', 'utf8')
const dashboard = readFileSync('src/app/dashboard-client.tsx', 'utf8')

describe('el split de /', () => {
  it('page.tsx es Server Component: decide por sesión, no renderiza UI propia', () => {
    expect(page).not.toMatch(/^'use client'/)
    expect(page).toContain("from '@/utils/supabase/server'")
  })
  it('page.tsx conecta los dos mundos', () => {
    expect(page).toContain('DashboardClient')
    expect(page).toContain('Landing')
  })
  it('el dashboard se movió entero, no se reescribió: sigue siendo client', () => {
    expect(dashboard).toMatch(/^'use client'/)
    expect(dashboard).toContain('useFinanceStore')
    expect(dashboard).toContain('PullToRefresh')
  })
})
