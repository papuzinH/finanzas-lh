/**
 * `isSupported` era `useState(true)` que un efecto bajaba a `false` cuando el
 * navegador no tenía SpeechRecognition — el patrón que
 * `react-hooks/set-state-in-effect` marca. Es un dato del navegador, no estado
 * de React: se lee con `useSyncExternalStore`, que además le da a React un
 * snapshot de servidor explícito en vez de un valor que cambia después de
 * hidratar.
 *
 * La lectura queda como función pura para poder probarla sin navegador: la
 * suite corre en `environment: 'node'`, donde no hay `window`.
 */
import { describe, it, expect } from 'vitest'
import { haySoporteDeVoz } from '../useSpeechRecognition'

type VentanaParcial = Parameters<typeof haySoporteDeVoz>[0]

describe('haySoporteDeVoz', () => {
  it('es false sin window (SSR)', () => {
    expect(haySoporteDeVoz(undefined)).toBe(false)
  })

  it('es false en un navegador que no lo implementa', () => {
    expect(haySoporteDeVoz({} as VentanaParcial)).toBe(false)
  })

  it('es true con la API estándar', () => {
    expect(haySoporteDeVoz({ SpeechRecognition: function () {} } as unknown as VentanaParcial)).toBe(true)
  })

  it('es true con el prefijo de WebKit, que es lo que usa Safari', () => {
    expect(haySoporteDeVoz({ webkitSpeechRecognition: function () {} } as unknown as VentanaParcial)).toBe(true)
  })
})
