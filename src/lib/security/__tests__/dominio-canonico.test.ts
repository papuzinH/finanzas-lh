/**
 * Un solo hostname para la app.
 *
 * El bug que cierra esto: el login con Google rebotaba al `/login` hasta tres
 * veces. `www.michanchito.net` servía la app igual que el apex, y la server
 * action arma el `redirectTo` del OAuth con el header `host` — así que entrando
 * por www le pedía a Supabase volver a `https://www.michanchito.net/auth/callback`,
 * que no está en la allow-list. Supabase descarta el destino y cae al `site_url`
 * (el apex): el usuario aterriza en `/` sin sesión y el middleware lo manda al
 * login. Como ese rebote lo deja parado en el apex, el intento siguiente entra —
 * por eso el bug se autocuraba y nunca se vio.
 *
 * Medido en los logs de producción del 2026-08-29: los `authorize` de 13:55:50 y
 * 14:18:20 pidieron el callback en www y fallaron; el de 14:18:34 lo pidió en el
 * apex y entró.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { construirRedirectsCanonicos, HOST_CANONICO, HOST_WWW } from '../dominio-canonico'

describe('el hostname canónico', () => {
  it('el canónico es el apex, que es lo que Supabase tiene como site_url', () => {
    expect(HOST_CANONICO).toBe('michanchito.net')
    expect(HOST_WWW).toBe('www.michanchito.net')
  })
})

describe('construirRedirectsCanonicos', () => {
  const reglas = construirRedirectsCanonicos()
  const www = reglas.find((r) => r.has?.some((c) => c.value === HOST_WWW))

  it('manda www al apex', () => {
    expect(www).toBeDefined()
    expect(www!.destination).toBe(`https://${HOST_CANONICO}/:path*`)
  })

  it('condiciona por host, no por path: cualquier ruta de www se va', () => {
    expect(www!.source).toBe('/:path*')
    expect(www!.has).toEqual([{ type: 'host', value: HOST_WWW }])
  })

  it('preserva la ruta, que es lo que salva el callback de OAuth', () => {
    // Si el redirect tirara todo a la raíz, `/auth/callback?code=…` perdería el
    // código y el login quedaría igual de roto, sólo que de otra forma.
    expect(www!.destination).toContain('/:path*')
  })

  it('es permanente (308): la canonicalización de dominio no es temporal', () => {
    expect(www!.permanent).toBe(true)
  })

  it('no toca ningún otro host', () => {
    // localhost y los dominios de preview de Vercel tienen que seguir andando:
    // `localhost:3000/auth/callback` está en la allow-list de Supabase y es por
    // donde se desarrolla.
    expect(reglas).toHaveLength(1)
  })
})

describe('quién la usa', () => {
  it('next.config.ts la aplica, y no define redirects a mano', () => {
    const config = readFileSync('next.config.ts', 'utf8')
    expect(config).toContain('construirRedirectsCanonicos')
    expect(config).toContain('async redirects()')
  })
})
