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
import {
  construirRedirectsCanonicos,
  origenCanonico,
  HOST_CANONICO,
  HOST_WWW,
} from '../dominio-canonico'

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

describe('origenCanonico', () => {
  it('acepta el apex por https: es el origen de producción', () => {
    expect(origenCanonico('michanchito.net', 'https')).toBe('https://michanchito.net')
  })

  it('acepta localhost:3000, que es por donde se desarrolla', () => {
    // Está en la allow-list de Supabase, así que el callback funciona ahí.
    expect(origenCanonico('localhost:3000', 'http')).toBe('http://localhost:3000')
  })

  it('www NO se usa como origen: cae al canónico', () => {
    // El corazón del bug. Aunque el 308 hace que nadie llegue parado en www,
    // esto evita que un alias nuevo reabra el mismo agujero en silencio.
    expect(origenCanonico('www.michanchito.net', 'https')).toBe('https://michanchito.net')
  })

  it('un host desconocido cae al canónico', () => {
    // Previews de Vercel: hosts dinámicos, nunca estuvieron en la allow-list y
    // apuntan a DEV, que no tiene Google configurado.
    expect(origenCanonico('finanzas-lh-abc123.vercel.app', 'https')).toBe('https://michanchito.net')
    expect(origenCanonico(null, null)).toBe('https://michanchito.net')
  })

  it('normaliza un x-forwarded-proto con varios valores', () => {
    // Un proxy puede mandarlo como lista ("https,https"). Concatenado crudo da
    // un origen roto (`https,https://michanchito.net`) que Supabase rechaza, y
    // el usuario vuelve al login sin que nada lo explique.
    expect(origenCanonico('michanchito.net', 'https,https')).toBe('https://michanchito.net')
  })

  it('el protocolo tiene que coincidir: el apex por http no es el origen bueno', () => {
    expect(origenCanonico('michanchito.net', 'http')).toBe('https://michanchito.net')
  })
})

describe('quién usa origenCanonico', () => {
  it('la server action del login no arma el origen a mano', () => {
    // Si vuelve el `${protocol}://${host}` crudo, el destino del OAuth vuelve a
    // depender de por dónde entró el usuario.
    const action = readFileSync('src/app/login/actions.ts', 'utf8')
    expect(action).toContain('origenCanonico')
    expect(action).not.toMatch(/\$\{protocol\}:\/\/\$\{host\}/)
  })
})
