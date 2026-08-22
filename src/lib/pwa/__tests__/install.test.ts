/**
 * Chanchito era instalable desde el primer día —manifest, service worker, íconos
 * maskable— pero nada en pantalla lo decía: en todo `src/` no había un solo
 * `beforeinstallprompt`. Instalarla dependía de que el usuario encontrara el
 * menú del navegador por su cuenta.
 *
 * La decisión de qué ofrecer no necesita navegador, así que vive acá: tres
 * señales (¿el navegador nos dio el prompt?, ¿es iOS?, ¿ya está instalada?) y
 * una respuesta. El hook y el componente son envoltorios finos sobre esto —
 * mismo patrón que los getters del store sobre `lib/finance/`.
 */
import { describe, it, expect } from 'vitest'
import { decidirVista, esIOS } from '../install'

describe('decidirVista', () => {
  it('sin prompt y fuera de iOS no ofrece nada: el navegador no sabe instalar', () => {
    expect(decidirVista({ tienePrompt: false, esIOS: false, yaInstalada: false })).toBe('oculto')
  })

  it('con el prompt capturado ofrece el botón', () => {
    expect(decidirVista({ tienePrompt: true, esIOS: false, yaInstalada: false })).toBe('boton')
  })

  it('en iOS ofrece las instrucciones, que es la única vía que Safari tiene', () => {
    expect(decidirVista({ tienePrompt: false, esIOS: true, yaInstalada: false })).toBe('ios')
  })

  it('ya instalada no ofrece nada, ni con el prompt en mano', () => {
    expect(decidirVista({ tienePrompt: true, esIOS: false, yaInstalada: true })).toBe('oculto')
  })

  it('ya instalada tampoco muestra las instrucciones de iOS', () => {
    expect(decidirVista({ tienePrompt: false, esIOS: true, yaInstalada: true })).toBe('oculto')
  })
})

/**
 * El iPad es el caso que se escapa: desde iPadOS 13 Safari manda un user agent
 * idéntico al de una Mac de escritorio, así que buscar "iPad" en el texto no lo
 * encuentra. Lo que lo delata es la pantalla táctil — una Mac reporta 0 puntos
 * de contacto. Sin esto, un iPad no vería nada y el agujero sería invisible.
 */
describe('esIOS', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  const IPAD_VIEJO = 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1'
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  it('reconoce un iPhone', () => {
    expect(esIOS({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true)
  })

  it('reconoce un iPad viejo, que todavía se nombra', () => {
    expect(esIOS({ userAgent: IPAD_VIEJO, maxTouchPoints: 5 })).toBe(true)
  })

  it('reconoce un iPad moderno, que se hace pasar por Mac pero es táctil', () => {
    expect(esIOS({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true)
  })

  it('no confunde una Mac de escritorio con un iPad: no tiene pantalla táctil', () => {
    expect(esIOS({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false)
  })

  it('Android no es iOS: ahí el botón nativo funciona', () => {
    expect(esIOS({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false)
  })

  it('una notebook con pantalla táctil en Windows tampoco es iOS', () => {
    expect(esIOS({ userAgent: WINDOWS, maxTouchPoints: 10 })).toBe(false)
  })
})
