/**
 * L2 de la auditoría 2026-08-26: el middleware decidía a qué rutas NO les
 * corre el gate de sesión con `includes`, que matchea en cualquier posición
 * del path. `/movimientos/author` contiene `/auth`, `/x.y` contiene `.`: esas
 * páginas se renderizaban sin gate. RLS sigue tapando los datos —el efecto es
 * una página vacía o rota, no una filtración—, pero el gate es el gate.
 *
 * La regla nueva: prefijo anclado o igualdad exacta, nunca `includes`. Las
 * extensiones de archivo las resuelve el `matcher` de `src/middleware.ts`,
 * que ancla al final del path (`$`) en vez de mirar si hay un punto suelto.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { debeSaltearElGate } from '@/lib/security/alcance-middleware'

describe('debeSaltearElGate', () => {
  it('saltea el propio flujo de auth', () => {
    expect(debeSaltearElGate('/auth/callback')).toBe(true)
    expect(debeSaltearElGate('/login')).toBe(true)
  })

  it('saltea las API routes, que hacen su propia autorización', () => {
    expect(debeSaltearElGate('/api/chat')).toBe(true)
    expect(debeSaltearElGate('/api/investments/update-prices')).toBe(true)
  })

  it('saltea los internos de Next', () => {
    expect(debeSaltearElGate('/_next/data/build/algo.json')).toBe(true)
  })

  it('NO saltea una página cuyo nombre contiene una palabra excluida', () => {
    // el bug: `includes('/auth')` daba true acá
    expect(debeSaltearElGate('/movimientos/author')).toBe(false)
    expect(debeSaltearElGate('/logins')).toBe(false)
    expect(debeSaltearElGate('/objetivos/api')).toBe(false)
    expect(debeSaltearElGate('/mi-login')).toBe(false)
  })

  it('NO saltea una ruta sólo porque tenga un punto', () => {
    // el bug: `includes('.')` daba true acá
    expect(debeSaltearElGate('/x.y')).toBe(false)
    expect(debeSaltearElGate('/movimientos/2026.08')).toBe(false)
  })

  it('NO saltea las pantallas de la app', () => {
    for (const ruta of [
      '/',
      '/movimientos',
      '/compromisos',
      '/objetivos',
      '/inversiones',
      '/ajustes',
      '/ajustes/perfil',
      '/onboarding',
      '/puesta-a-punto',
      '/privacidad', // pública, pero eso lo decide esRutaPublica más abajo
    ]) {
      expect(debeSaltearElGate(ruta), ruta).toBe(false)
    }
  })
})

describe('el matcher de src/middleware.ts', () => {
  /** Extrae el patrón del `matcher` y lo compila para probarlo de verdad. */
  function matcherDelMiddleware(): RegExp {
    const fuente = readFileSync('src/middleware.ts', 'utf8')
    const m = fuente.match(/'(\/\(\(\?!.+?)'/)
    if (!m) throw new Error('no se pudo leer el matcher de src/middleware.ts')
    return new RegExp(`^${m[1].replace(/\\\\/g, '\\')}$`)
  }

  it('deja fuera cualquier archivo con extensión, no sólo la lista vieja', () => {
    const matcher = matcherDelMiddleware()
    for (const archivo of [
      '/icon-192.png',
      '/brand/chancho.svg',
      '/sw.js',
      '/manifest.webmanifest',
      '/favicon.ico',
      '/robots.txt', // no existe hoy: el punto es que si se agrega, no pide sesión
      '/sitemap.xml',
      '/fuentes/asap.woff2',
      '/_next/static/chunks/main.js',
    ]) {
      expect(matcher.test(archivo), archivo).toBe(false)
    }
  })

  it('sigue alcanzando a las pantallas de la app', () => {
    const matcher = matcherDelMiddleware()
    for (const ruta of ['/', '/movimientos', '/ajustes/perfil', '/objetivos', '/x.y/z']) {
      expect(matcher.test(ruta), ruta).toBe(true)
    }
  })
})

describe('el middleware usa la función y no `includes`', () => {
  it('no quedó ninguna exclusión por substring', () => {
    const fuente = readFileSync('src/utils/supabase/middleware.ts', 'utf8')
    expect(fuente).toContain("from '@/lib/security/alcance-middleware'")
    expect(fuente).toContain('debeSaltearElGate(pathname)')
    expect(fuente).not.toMatch(/pathname\.includes\(/)
  })
})
