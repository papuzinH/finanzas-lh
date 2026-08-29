/**
 * El recorrido del tour, paso por paso.
 *
 * El bug que cierra esto: el tour avanzaba hasta 10 pasos mostrando «10 de 8»,
 * y los dos últimos eran los dos primeros repetidos. `TOUR_ROUTE_ORDER` tenía
 * `'/'` dos veces (al principio y al final), y las dos cuentas del tour salían
 * de fuentes distintas: el recorrido iteraba el ARRAY (6 etapas, 10 pasos) y el
 * total sumaba las claves del OBJETO (5 claves, 8 pasos). El `Record<TourRoute>`
 * daba la sensación de que estaban sincronizados: `TourRoute` es la unión de
 * valores, así que TypeScript pide 5 claves y no tiene cómo ver que el array
 * tiene 6 entradas con una repetida.
 *
 * De yapa, el paso 8 ya decía «Terminar» —`isLastStep` compara contra el total—
 * y al tocarlo mandaba a dos pasos más.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}))

import {
  useOnboardingStore,
  TOUR_ROUTE_ORDER,
  TOUR_STEPS_BY_ROUTE,
  TOUR_TOTAL_STEPS,
  getGlobalStepNumber,
} from '../onboardingStore'

beforeEach(() => {
  useOnboardingStore.setState({
    tourCompleted: false,
    tourSkipped: false,
    tourRouteIndex: 0,
    tourStepInRoute: 0,
  })
})

describe('la definición del tour', () => {
  it('ninguna ruta se repite: una repetida vuelve a mostrar sus pasos', () => {
    expect(new Set(TOUR_ROUTE_ORDER).size).toBe(TOUR_ROUTE_ORDER.length)
  })

  it('el total sale del mismo lugar que el recorrido', () => {
    // La raíz del bug era que no. Sumar sobre el array —lo que el tour camina—
    // y no sobre las claves del objeto.
    const sumaDelRecorrido = TOUR_ROUTE_ORDER.reduce(
      (total, ruta) => total + TOUR_STEPS_BY_ROUTE[ruta].length,
      0
    )
    expect(TOUR_TOTAL_STEPS).toBe(sumaDelRecorrido)
  })

  it('son 8 pasos', () => {
    expect(TOUR_TOTAL_STEPS).toBe(8)
  })

  it('toda ruta del recorrido tiene al menos un paso', () => {
    for (const ruta of TOUR_ROUTE_ORDER) {
      expect(TOUR_STEPS_BY_ROUTE[ruta]?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('caminar el tour de punta a punta', () => {
  /** Avanza hasta que el tour se cierre, juntando lo que se ve en el camino. */
  function recorrer() {
    const vistos: string[] = []
    const navegaciones: (string | null)[] = []
    const { advanceTour } = useOnboardingStore.getState()

    for (let i = 0; i < 50; i++) {
      const { tourRouteIndex, tourStepInRoute, tourCompleted } = useOnboardingStore.getState()
      if (tourCompleted) break
      const ruta = TOUR_ROUTE_ORDER[tourRouteIndex]
      vistos.push(`${ruta}#${TOUR_STEPS_BY_ROUTE[ruta][tourStepInRoute].target}`)
      navegaciones.push(advanceTour())
    }
    return { vistos, navegaciones }
  }

  it('muestra exactamente 8 pasos y ninguno dos veces', () => {
    const { vistos } = recorrer()
    expect(vistos).toHaveLength(TOUR_TOTAL_STEPS)
    expect(new Set(vistos).size).toBe(vistos.length)
  })

  it('recorre las rutas en orden y arranca en el inicio', () => {
    const { vistos } = recorrer()
    expect(vistos[0]).toBe('/#balance-card')
    expect(vistos.at(-1)).toBe('/ajustes#fab')
  })

  it('al terminar el último paso devuelve al inicio y cierra el tour', () => {
    // El '/' final del array quería decir esto, pero como etapa con pasos
    // repetía los dos primeros. Ahora es un destino, no una etapa.
    const { navegaciones } = recorrer()
    expect(navegaciones.at(-1)).toBe('/')
    expect(useOnboardingStore.getState().tourCompleted).toBe(true)
  })

  it('el paso que dice «Terminar» es de verdad el último', () => {
    // Antes `isLastStep` daba true en el 8 y todavía quedaban dos pasos.
    const { vistos } = recorrer()
    expect(vistos.length).toBe(TOUR_TOTAL_STEPS)
  })
})

describe('el «X de N» que ve el usuario', () => {
  it('el primer paso es 1', () => {
    expect(getGlobalStepNumber(0, 0)).toBe(1)
  })

  it('el último paso del recorrido es exactamente el total', () => {
    // Este es el número que se rompió: en pantalla decía «10 de 8».
    const ultimaRuta = TOUR_ROUTE_ORDER.length - 1
    const ultimoPaso = TOUR_STEPS_BY_ROUTE[TOUR_ROUTE_ORDER[ultimaRuta]].length - 1
    expect(getGlobalStepNumber(ultimaRuta, ultimoPaso)).toBe(TOUR_TOTAL_STEPS)
  })

  it('numera 1..N sin saltos ni repeticiones a lo largo de todo el tour', () => {
    const numeros: number[] = []
    TOUR_ROUTE_ORDER.forEach((ruta, i) => {
      TOUR_STEPS_BY_ROUTE[ruta].forEach((_, j) => {
        numeros.push(getGlobalStepNumber(i, j))
      })
    })
    expect(numeros).toEqual(Array.from({ length: TOUR_TOTAL_STEPS }, (_, i) => i + 1))
  })

  it('ningún paso del recorrido se pasa del total', () => {
    // El síntoma exacto del bug: el contador seguía más allá del total anunciado.
    TOUR_ROUTE_ORDER.forEach((ruta, i) => {
      TOUR_STEPS_BY_ROUTE[ruta].forEach((_, j) => {
        expect(getGlobalStepNumber(i, j)).toBeLessThanOrEqual(TOUR_TOTAL_STEPS)
      })
    })
  })
})
