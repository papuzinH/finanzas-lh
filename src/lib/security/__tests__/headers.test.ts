/**
 * Auditoría 2026-08-26 (M3): la app salía sin ningún header de seguridad propio
 * — sólo el HSTS que pone Vercel. Sin `frame-ancestors` se puede embeber (clickjacking
 * sobre «Borrar la cuenta»); sin CSP, un XSS futuro se lleva la sesión, porque las
 * cookies de `@supabase/ssr` NO son httpOnly por diseño.
 *
 * Estos tests fijan lo que la app necesita de verdad para funcionar: el relevamiento
 * del 27-ago encontró dos fetch externos hechos desde el NAVEGADOR (`financeStore.ts`:
 * dólar blue y el IPC de argentinadatos) que el snippet original de la auditoría no
 * contemplaba y que un CSP en enforce habría roto en silencio.
 */
import { describe, it, expect } from 'vitest'
import { construirCSP, construirSecurityHeaders, ORIGENES_DE_DATOS } from '@/lib/security/headers'

const SUPABASE_DEV = 'https://hgxuxoqyrooaariimqmg.supabase.co'

/** Parsea la CSP a un mapa directiva → lista de fuentes. */
function directivas(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
      const [nombre, ...fuentes] = d.split(/\s+/)
      return [nombre, fuentes]
    }),
  )
}

describe('construirCSP', () => {
  it('deja llegar al Supabase que le pasen, por REST y por websocket', () => {
    const d = directivas(construirCSP(SUPABASE_DEV))
    expect(d['connect-src']).toContain(SUPABASE_DEV)
    expect(d['connect-src']).toContain('wss://hgxuxoqyrooaariimqmg.supabase.co')
  })

  it('toma el host de la env, no uno hardcodeado: en Preview apunta a DEV y en prod a producción', () => {
    const prod = 'https://mkkgdjxaotgimqwhyesx.supabase.co'
    expect(construirCSP(prod)).toContain(prod)
    expect(construirCSP(prod)).not.toContain('hgxuxoqyrooaariimqmg')
  })

  it('deja pasar los dos servicios que el store consulta DESDE EL NAVEGADOR', () => {
    // financeStore.ts:573 (dólar blue) y :591 (IPC). Sin esto, el CSP los corta.
    const d = directivas(construirCSP(SUPABASE_DEV))
    for (const origen of ORIGENES_DE_DATOS) expect(d['connect-src']).toContain(origen)
    expect(ORIGENES_DE_DATOS).toContain('https://dolarapi.com')
    expect(ORIGENES_DE_DATOS).toContain('https://api.argentinadatos.com')
  })

  it('prohíbe que la app se embeba en un iframe ajeno', () => {
    const d = directivas(construirCSP(SUPABASE_DEV))
    expect(d['frame-ancestors']).toEqual(["'none'"])
  })

  it('cierra las puertas que no se usan: objetos, base y destino de formularios', () => {
    const d = directivas(construirCSP(SUPABASE_DEV))
    expect(d['object-src']).toEqual(["'none'"])
    expect(d['base-uri']).toEqual(["'self'"])
    expect(d['form-action']).toContain("'self'")
  })

  it('el login con Google sobrevive: form-action cubre las TRES paradas del flujo', () => {
    // El botón es un <form> con Server Action (submit a 'self'), la action hace
    // redirect() a `<supabase>/auth/v1/authorize`, y recién eso manda a Google.
    // Los navegadores aplican form-action también a los redirects que siguen al
    // submit, así que sin Supabase en la lista el login muere — y es un flujo que
    // sólo existe en producción, porque DEV no tiene Google configurado.
    const d = directivas(construirCSP(SUPABASE_DEV))
    expect(d['form-action']).toContain("'self'")
    expect(d['form-action']).toContain(SUPABASE_DEV)
    expect(d['form-action']).toContain('https://accounts.google.com')
  })

  it('permite el avatar de Google y las imágenes inline, y nada más', () => {
    const d = directivas(construirCSP(SUPABASE_DEV))
    expect(d['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com']))
  })

  it('no deja abierto el default: todo lo no declarado cae en propio origen', () => {
    const d = directivas(construirCSP(SUPABASE_DEV))
    expect(d['default-src']).toEqual(["'self'"])
  })

  it('las fuentes salen del propio dominio (next/font las self-hostea en el build)', () => {
    const d = directivas(construirCSP(SUPABASE_DEV))
    expect(d['font-src']).toEqual(["'self'"])
    expect(construirCSP(SUPABASE_DEV)).not.toContain('fonts.googleapis.com')
  })

  it('sin la env no inventa un host: arma la CSP igual, sólo que sin Supabase', () => {
    const csp = construirCSP(undefined)
    expect(csp).toContain("default-src 'self'")
    expect(csp).not.toContain('undefined')
  })
})

describe('construirSecurityHeaders', () => {
  it('manda la CSP en modo enforce cuando se le pide', () => {
    const h = construirSecurityHeaders(SUPABASE_DEV, { reportOnly: false })
    expect(h.find((x) => x.key === 'Content-Security-Policy')).toBeDefined()
    expect(h.find((x) => x.key === 'Content-Security-Policy-Report-Only')).toBeUndefined()
  })

  it('y en report-only cuando se quiere mirar antes de cortar', () => {
    const h = construirSecurityHeaders(SUPABASE_DEV, { reportOnly: true })
    expect(h.find((x) => x.key === 'Content-Security-Policy-Report-Only')).toBeDefined()
    expect(h.find((x) => x.key === 'Content-Security-Policy')).toBeUndefined()
  })

  it('trae los cuatro headers que no son CSP', () => {
    const h = construirSecurityHeaders(SUPABASE_DEV, { reportOnly: false })
    const mapa = Object.fromEntries(h.map((x) => [x.key, x.value]))
    expect(mapa['X-Frame-Options']).toBe('DENY')
    expect(mapa['X-Content-Type-Options']).toBe('nosniff')
    expect(mapa['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(mapa['Permissions-Policy']).toContain('camera=()')
  })

  it('deja el micrófono habilitado para el propio origen: el chat dicta por voz', () => {
    const mapa = Object.fromEntries(construirSecurityHeaders(SUPABASE_DEV, { reportOnly: false }).map((x) => [x.key, x.value]))
    expect(mapa['Permissions-Policy']).toContain('microphone=(self)')
  })
})

describe("'unsafe-eval' sólo en desarrollo", () => {
  // React en modo desarrollo NECESITA eval() y sin él se degrada solo: la consola
  // avisa "React requires eval() in development mode" y el error overlay deja de
  // andar. En producción no hace falta y no se agrega — Zod ya cae a su camino
  // interpretado cuando no puede compilar (ver zod-sin-jit.test.ts).
  it('la CSP de producción NO lo lleva', () => {
    expect(construirCSP('https://x.supabase.co')).not.toContain('unsafe-eval');
  });

  it('la de desarrollo sí', () => {
    expect(construirCSP('https://x.supabase.co', { desarrollo: true })).toContain("'unsafe-eval'");
  });

  it('lo agrega en script-src y no en otra directiva', () => {
    const dev = construirCSP('https://x.supabase.co', { desarrollo: true });
    const scriptSrc = dev.split('; ').find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toContain("'unsafe-eval'");
    expect(dev.split('; ').filter((d) => d.includes('unsafe-eval'))).toHaveLength(1);
  });
});
