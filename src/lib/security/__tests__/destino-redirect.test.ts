/**
 * L1 de la auditoría 2026-08-26: el callback de OAuth armaba el destino como
 * `${origin}${next}` con el `next` crudo de la query. Con `next=@evil.com` la
 * URL resultante es `https://michanchito.net@evil.com`, que el navegador lee
 * como "usuario michanchito.net en el host evil.com" y se va del sitio con la
 * sesión recién creada. Explotarlo pide un `code` válido del flujo de la
 * víctima — por eso es Low —, pero el arreglo es una línea.
 *
 * La regla: sólo se acepta una ruta interna, es decir una que empiece con UNA
 * barra y no pueda reinterpretarse como host.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { destinoSeguro } from '@/lib/security/destino-redirect'

describe('destinoSeguro', () => {
  it('deja pasar las rutas internas de la app', () => {
    expect(destinoSeguro('/movimientos')).toBe('/movimientos')
    expect(destinoSeguro('/ajustes/perfil')).toBe('/ajustes/perfil')
    expect(destinoSeguro('/')).toBe('/')
    expect(destinoSeguro('/objetivos?tab=metas')).toBe('/objetivos?tab=metas')
  })

  it('cae a la raíz cuando no hay destino', () => {
    expect(destinoSeguro(null)).toBe('/')
    expect(destinoSeguro('')).toBe('/')
  })

  it('rechaza el `@`, que convierte el origen en credencial de otro host', () => {
    // `https://michanchito.net` + `@evil.com` → el navegador va a evil.com
    expect(destinoSeguro('@evil.com')).toBe('/')
    expect(destinoSeguro('/@evil.com')).toBe('/')
    expect(destinoSeguro('/movimientos@evil.com')).toBe('/')
  })

  it('rechaza las rutas protocol-relative', () => {
    expect(destinoSeguro('//evil.com')).toBe('/')
    expect(destinoSeguro('//evil.com/algo')).toBe('/')
  })

  it('rechaza la barra invertida, que varios navegadores normalizan a barra', () => {
    expect(destinoSeguro('/\\evil.com')).toBe('/')
    expect(destinoSeguro('\\\\evil.com')).toBe('/')
  })

  it('rechaza las URLs absolutas', () => {
    expect(destinoSeguro('https://evil.com')).toBe('/')
    expect(destinoSeguro('http://evil.com')).toBe('/')
    expect(destinoSeguro('javascript:alert(1)')).toBe('/')
  })

  it('rechaza lo que no arranca con barra', () => {
    expect(destinoSeguro('movimientos')).toBe('/')
    expect(destinoSeguro('evil.com')).toBe('/')
  })
})

describe('el callback de OAuth usa el destino saneado', () => {
  it('no arma el redirect con el `next` crudo de la query', () => {
    const callback = readFileSync('src/app/auth/callback/route.ts', 'utf8')
    expect(callback).toContain("from '@/lib/security/destino-redirect'")
    // el destino que se interpola es el que salió del saneador, no el crudo
    expect(callback).toMatch(/const destino = destinoSeguro\(searchParams\.get\('next'\)\)/)
    expect(callback).toMatch(/redirect\(`\$\{origin\}\$\{destino\}`\)/)
    // el bug era exactamente esta interpolación con el valor sin validar
    expect(callback).not.toMatch(/\$\{origin\}\$\{next\}/)
  })
})
