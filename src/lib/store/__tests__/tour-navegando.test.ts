/**
 * `isNavigating` era estado: `handleNext` lo ponía en `true` antes del
 * `router.push` y un `useEffect` lo bajaba a `false` al detectar que el
 * pathname ya coincidía con la ruta esperada — un `setState` sincrónico dentro
 * de un efecto (`react-hooks/set-state-in-effect`).
 *
 * Pero no era estado: `advanceTour()` mueve `tourRouteIndex` ANTES del push, así
 * que «estoy navegando» es exactamente «el pathname todavía no es el de la ruta
 * del paso actual». Derivarlo saca el estado, el efecto y el render de más.
 *
 * De paso arregla un borde que el estado no cubría: un usuario nuevo que se iba
 * del tour por la nav quedaba con `isNavigating === false` en una ruta que no
 * era la del paso, y el tour se dibujaba igual con los targets de la ruta
 * anterior — tooltip apuntando a un elemento que no existe.
 *
 * Sigue el precedente de `bc1cb75`: la lógica que los tests tienen que alcanzar
 * vive en el store, no en el componente.
 */
import { describe, it, expect } from 'vitest'
import { TOUR_ROUTE_ORDER, elTourEstaNavegando } from '../onboardingStore'

describe('elTourEstaNavegando', () => {
  it('es false cuando ya estamos en la ruta del paso actual', () => {
    expect(elTourEstaNavegando('/', 0)).toBe(false)
    expect(elTourEstaNavegando('/movimientos', 1)).toBe(false)
    expect(elTourEstaNavegando('/ajustes', TOUR_ROUTE_ORDER.length - 1)).toBe(false)
  })

  it('es true entre el advanceTour y el pathname nuevo', () => {
    // advanceTour() ya movió el índice a /movimientos, el router todavía no.
    expect(elTourEstaNavegando('/', 1)).toBe(true)
  })

  it('es true si el usuario se fue a una ruta que no es la del paso', () => {
    // El caso que el estado no cubría: acá el tour NO tiene que dibujarse,
    // porque sus targets son los de la ruta del paso, no los de esta.
    expect(elTourEstaNavegando('/inversiones', 0)).toBe(true)
  })

  it('es true con un índice fuera del recorrido, que no apunta a ninguna ruta', () => {
    expect(elTourEstaNavegando('/', 99)).toBe(true)
  })
})
