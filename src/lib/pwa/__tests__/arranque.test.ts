/**
 * De dónde arranca la app instalada.
 *
 * El bug que cierra esto: con la PWA instalada y sin sesión, abrirla mostraba
 * la landing —con su CTA «usar en el navegador»— a alguien que ya la tenía
 * puesta. El server no puede detectar la app instalada, así que ella se
 * anuncia con `?modo=app` en su `start_url`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { esArranqueDeAppInstalada, START_URL_APP, VALOR_APP_INSTALADA } from '../arranque'
import manifest from '@/app/manifest'

describe('esArranqueDeAppInstalada', () => {
  it('reconoce la raíz abierta desde la app instalada', () => {
    expect(esArranqueDeAppInstalada('/', VALOR_APP_INSTALADA)).toBe(true)
  })

  it('la raíz sin el parámetro es una visita normal', () => {
    expect(esArranqueDeAppInstalada('/', null)).toBe(false)
  })

  it('un valor cualquiera no alcanza', () => {
    expect(esArranqueDeAppInstalada('/', 'cualquiera')).toBe(false)
    expect(esArranqueDeAppInstalada('/', '')).toBe(false)
  })

  it('fuera de la raíz el parámetro no significa nada', () => {
    // Sólo `/` sirve la landing, así que es la única ruta donde el dato cambia
    // algo. En el resto, el gate de sesión de siempre.
    expect(esArranqueDeAppInstalada('/movimientos', VALOR_APP_INSTALADA)).toBe(false)
    expect(esArranqueDeAppInstalada('/login', VALOR_APP_INSTALADA)).toBe(false)
  })
})

describe('el manifest de la PWA', () => {
  it('arranca anunciándose, con el mismo contrato que lee el middleware', () => {
    expect(manifest().start_url).toBe(START_URL_APP)
    expect(START_URL_APP).toBe('/?modo=app')
  })

  it('declara `id` propio, para que mover el start_url no cree otra app', () => {
    // Sin `id`, la identidad de una PWA instalada ES su `start_url`: cambiarlo
    // deja huérfana la instalación existente y duplica la próxima. Clavarlo en
    // '/' (el valor que el start_url tuvo siempre) lo deja moverse sin costo.
    expect(manifest().id).toBe('/')
  })
})

describe('quién consume la decisión', () => {
  const middleware = readFileSync('src/utils/supabase/middleware.ts', 'utf8')

  it('el middleware decide, no la página', () => {
    // No es un detalle de gusto: `src/app/loading.tsx` hace que la respuesta de
    // `/` ya esté streameando cuando corre el Server Component, así que un
    // `redirect()` ahí se degrada a un salto de cliente (200 + NEXT_REDIRECT en
    // el payload RSC, con flash de loading). Sólo el middleware llega a tiempo
    // de emitir un 307 real. Verificado contra el build, no deducido.
    expect(middleware).toContain('esArranqueDeAppInstalada')
    // La página no importa `redirect`: si alguien lo vuelve a intentar desde
    // ahí, el 307 se pierde en silencio y nadie se entera hasta abrir la app.
    expect(readFileSync('src/app/page.tsx', 'utf8')).not.toContain("from 'next/navigation'")
  })

  it('el login no hereda el parámetro de arranque', () => {
    // Si `?modo=app` viajara al login quedaría dando vueltas por la sesión sin
    // significar nada, y encima haría de la URL del login dos URLs distintas.
    expect(middleware).toContain('searchParams.delete(PARAM_ARRANQUE)')
  })
})
