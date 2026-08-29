/**
 * Un solo hostname para la app.
 *
 * `www.michanchito.net` y el apex estaban los dos publicados en Vercel y www
 * NO redirigía: servía la app igual que el apex. Eso rompía el login con
 * Google de una forma que se autocuraba, y por eso vivió sin diagnóstico.
 *
 * La cadena: `signInWithGoogle` arma el `redirectTo` del OAuth con el header
 * `host` de la request (`app/login/actions.ts`), así que quien entraba por www
 * le pedía a Supabase volver a `https://www.michanchito.net/auth/callback`.
 * Ese destino no está en la allow-list de Supabase —que tiene el apex y
 * localhost—, y ante un `redirect_to` no permitido Supabase no falla: **cae al
 * `site_url`**, o sea al apex. El usuario aterrizaba en `/` sin sesión y el
 * middleware lo mandaba al login. Como ese mismo rebote lo dejaba parado en el
 * apex, el intento siguiente sí funcionaba: el síntoma era «tengo que loguearme
 * dos o tres veces», nunca «el login está roto».
 *
 * El segundo síntoma tenía la misma raíz: cruzar de www al apex a mitad del
 * flujo deja atrás la cookie del `code_verifier` de PKCE, que se guarda en el
 * host donde se hizo clic. Supabase devolvía entonces
 * `400: invalid request: both auth code and code verifier should be non-empty`.
 *
 * Por eso el arreglo no está en el código de auth: **está acá**. Mientras haya
 * dos hostnames sirviendo la app, cualquier defensa aguas abajo tapa un síntoma
 * y deja el otro. Si algún día se publica otro dominio, su regla va acá.
 *
 * Verificado en los logs de producción del 2026-08-29 (`edge_logs`): los
 * `authorize` de 13:55:50 y 14:18:20 llevaban `redirect_to` en www y fallaron;
 * el de 14:18:34 lo llevaba en el apex y entró.
 */
import type { NextConfig } from 'next'

type Redirects = Awaited<ReturnType<NonNullable<NextConfig['redirects']>>>

/**
 * El hostname bueno. No es una preferencia estética: es el que Supabase tiene
 * como `site_url` y en la allow-list de redirects de Auth. Cambiarlo acá sin
 * cambiarlo allá vuelve a romper el login.
 */
export const HOST_CANONICO = 'michanchito.net'

/** El alias que hay que sacar del medio. */
export const HOST_WWW = `www.${HOST_CANONICO}`

/**
 * Redirect 308 de www al apex, conservando ruta y query.
 *
 * Conservar la ruta es lo que salva el caso que motivó todo esto: si esto
 * mandara todo a la raíz, un `/auth/callback?code=…` que llegue por www
 * perdería el código y el login seguiría roto, sólo que de otra manera.
 */
export function construirRedirectsCanonicos(): Redirects {
  return [
    {
      source: '/:path*',
      has: [{ type: 'host', value: HOST_WWW }],
      destination: `https://${HOST_CANONICO}/:path*`,
      permanent: true,
    },
  ]
}
