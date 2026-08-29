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

/**
 * Los orígenes desde los que el login puede pedir su callback.
 *
 * Es un espejo de la allow-list de redirects de Supabase Auth
 * (`uri_allow_list`), que hoy tiene el apex y `localhost:3000`. Esa es la
 * verdad: si el destino no está ahí, Supabase lo descarta y manda al
 * `site_url`. Mantener las dos listas iguales es la condición para que el
 * login funcione; si acá se agrega un origen, se agrega también allá.
 */
export const ORIGENES_DE_LOGIN = [
  `https://${HOST_CANONICO}`,
  'http://localhost:3000',
] as const

/**
 * De qué origen se fía el login para armar el destino del OAuth.
 *
 * La server action lo derivaba del header `host` de la request, o sea de por
 * dónde entró el usuario. Eso es lo que rompía el login desde www, y volvería a
 * romperlo con cualquier alias nuevo que apunte al proyecto. Acá el host de la
 * request se usa **sólo si es uno de los orígenes que Supabase ya acepta**; si
 * no, se cae al de producción.
 *
 * El fallback no es un parche silencioso: un preview de Vercel tiene host
 * dinámico, nunca estuvo en la allow-list y además apunta a DEV, donde Google
 * ni siquiera está configurado — el login por preview no funciona por otros
 * motivos y esto no lo cambia.
 *
 * @param host el header `host` de la request (puede traer puerto)
 * @param protocolo el `x-forwarded-proto`, que un proxy puede mandar como
 *   lista ("https,https"): se toma el primer valor, porque concatenarlo crudo
 *   arma un origen inválido que Supabase rechaza sin explicar nada.
 */
export function origenCanonico(host: string | null, protocolo: string | null): string {
  const esquema = (protocolo ?? 'https').split(',')[0].trim()
  const candidato = `${esquema}://${host ?? ''}`
  const permitido = (ORIGENES_DE_LOGIN as readonly string[]).includes(candidato)
  return permitido ? candidato : `https://${HOST_CANONICO}`
}
