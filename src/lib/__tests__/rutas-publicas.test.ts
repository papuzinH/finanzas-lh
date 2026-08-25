/**
 * Las páginas públicas de contenido (hoy: /privacidad) tienen tres
 * consumidores que tienen que coincidir: el middleware (no manda al login ni
 * a onboarding), el AppShell (no dibuja nav/chat/tour) y la propia página.
 * Una sola lista evita el bug de agregar la ruta en un lugar y no en el otro.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { esRutaPublica, RUTAS_PUBLICAS } from '@/lib/rutas-publicas'

describe('rutas públicas de contenido', () => {
  it('/privacidad es pública; el resto de la app no', () => {
    expect(esRutaPublica('/privacidad')).toBe(true)
    expect(esRutaPublica('/')).toBe(false) // la raíz tiene su propio split por sesión
    expect(esRutaPublica('/movimientos')).toBe(false)
    expect(esRutaPublica('/privacidad/otra')).toBe(false) // match exacto, no prefijo
    expect(RUTAS_PUBLICAS).toContain('/privacidad')
  })

  it('middleware y AppShell consultan la misma lista', () => {
    const middleware = readFileSync('src/utils/supabase/middleware.ts', 'utf8')
    const appShell = readFileSync('src/components/layout/app-shell.tsx', 'utf8')
    expect(middleware).toContain("from '@/lib/rutas-publicas'")
    expect(middleware).toContain('esRutaPublica(pathname)')
    expect(appShell).toContain("from '@/lib/rutas-publicas'")
    expect(appShell).toContain('esRutaPublica(pathname)')
  })
})
