"use client"

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createClient } from '@/utils/supabase/client'

/**
 * Store del tour post-registro multi-ruta.
 *
 * NOTA: La parte de chat conversacional del onboarding fue removida en favor
 * del flujo manual con slides (ver src/app/onboarding/onboarding-flow.tsx).
 * Este store solo conserva la lógica del tour interactivo que se ejecuta
 * después del registro inicial.
 */

/**
 * Rutas en orden de secuencia del tour.
 *
 * ⚠️ Ninguna ruta puede repetirse: cada entrada de acá se camina entera, así que
 * una repetida vuelve a mostrar sus pasos. `'/'` figuraba también al final —la
 * intención era devolver al usuario al inicio— y el efecto era un tour de 10
 * pasos que repetía los dos primeros y anunciaba «10 de 8». Volver al inicio es
 * un destino al cerrar (`RUTA_AL_CERRAR`), no una etapa con pasos.
 *
 * El tipo no protege de esto: `TourRoute` es la unión de valores, así que el
 * `Record` de abajo pide una clave por ruta distinta y no tiene cómo notar que
 * el array trae una repetida. Lo cubre `onboarding-tour-recorrido.test.ts`.
 */
export const TOUR_ROUTE_ORDER = [
  '/',
  '/movimientos',
  '/compromisos',
  '/objetivos',
  '/ajustes',
] as const

export type TourRoute = (typeof TOUR_ROUTE_ORDER)[number]

/** Pasos del tour por ruta */
export const TOUR_STEPS_BY_ROUTE: Record<TourRoute, { target: string; text: string; position: 'top' | 'bottom' }[]> = {
  '/': [
    { target: 'balance-card', text: 'Acá ves tu balance general. Basicamente, cuanta plata tenes disponible', position: 'bottom' },
    { target: 'add-transaction-button', text: 'Podes empezar registrando tu primer gasto tocando el botón "+".', position: 'top' },
  ],
  '/movimientos': [
    { target: 'month-selector', text: 'Navegá entre meses para ver registros pasados o proyecciones futuras.', position: 'bottom' },
    { target: 'search-input', text: 'Buscá gastos específicos o filtrá por tarjeta y categoría rápidamente.', position: 'bottom' },
  ],
  '/compromisos': [
    { target: 'compromisos-tabs', text: 'Registra tus cuotas de tarjeta y Mensualidades fijas por separado para controlar qué pagás cada mes.', position: 'bottom' },
  ],
  '/objetivos': [
    { target: 'tabs-list', text: 'Establece tus metas de ahorro y presupuestos mensuales por categoría.', position: 'bottom' },
  ],
  '/ajustes': [
    { target: 'section-medios', text: 'Recordá que podes editar tus medios de pago y categorías para que Chanchito sea preciso.', position: 'bottom' },
    {target: 'fab', text: 'Podes hacer todas estas acciones y consultar tu estado financiero pidiendole directamente a Chanchito.', position: 'top' },
  ]
}

/**
 * Adónde va el usuario cuando el tour termina: al inicio, que es donde arrancó
 * y donde va a usar la app.
 */
export const RUTA_AL_CERRAR = '/' as const

/**
 * Total de pasos globales del tour.
 *
 * Se suma sobre `TOUR_ROUTE_ORDER` —lo que el tour efectivamente camina— y no
 * sobre las claves de `TOUR_STEPS_BY_ROUTE`. Esa era la raíz del «10 de 8»: el
 * recorrido iteraba el array (6 etapas) y el total contaba las claves del
 * objeto (5), así que las dos cuentas medían cosas distintas.
 */
export const TOUR_TOTAL_STEPS = TOUR_ROUTE_ORDER.reduce(
  (total, ruta) => total + TOUR_STEPS_BY_ROUTE[ruta].length,
  0
)

/**
 * Número de paso global (1-indexed) para el «X de N» del tooltip.
 *
 * Vive acá y no en el componente porque es la tercera cuenta sobre las mismas
 * dos fuentes, y es la que el usuario ve: cuando divergió, en pantalla decía
 * «10 de 8». Suma sobre `TOUR_ROUTE_ORDER`, igual que `TOUR_TOTAL_STEPS`, así
 * que las dos no pueden volver a medir cosas distintas.
 */
export function getGlobalStepNumber(routeIndex: number, stepInRoute: number): number {
  let total = 0
  for (let i = 0; i < routeIndex; i++) {
    total += TOUR_STEPS_BY_ROUTE[TOUR_ROUTE_ORDER[i]].length
  }
  return total + stepInRoute + 1
}

interface OnboardingState {
  // Tour post-registro (multi-ruta)
  tourCompleted: boolean
  tourSkipped: boolean
  tourRouteIndex: number
  tourStepInRoute: number

  /** Avanza un paso. Devuelve la nueva ruta si debe navegar, o null si se queda. */
  advanceTour: () => TourRoute | null
  skipTour: () => void
  completeTour: () => void
  /** Sincroniza tourCompleted desde/hacia Supabase */
  syncTourFromSupabase: (userId: string) => Promise<void>
  /** Llamar al arribar a una ruta para sincronizar el índice */
  setTourRoute: (pathname: string) => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      tourCompleted: false,
      tourSkipped: false,
      tourRouteIndex: 0,
      tourStepInRoute: 0,

      advanceTour: () => {
        const { tourRouteIndex, tourStepInRoute } = get()
        const currentRoute = TOUR_ROUTE_ORDER[tourRouteIndex]
        const stepsForRoute = TOUR_STEPS_BY_ROUTE[currentRoute]

        if (tourStepInRoute < stepsForRoute.length - 1) {
          set({ tourStepInRoute: tourStepInRoute + 1 })
          return null
        }

        if (tourRouteIndex < TOUR_ROUTE_ORDER.length - 1) {
          const nextIdx = tourRouteIndex + 1
          set({ tourRouteIndex: nextIdx, tourStepInRoute: 0 })
          return TOUR_ROUTE_ORDER[nextIdx]
        }

        // Último paso: se cierra el tour y se vuelve al inicio.
        get().completeTour()
        return RUTA_AL_CERRAR
      },

      skipTour: () => {
        set({ tourSkipped: true, tourRouteIndex: 0, tourStepInRoute: 0 })
        const supabase = createClient()
        supabase.auth.getUser().then(({ data }) => {
          if (data.user) {
            supabase.from('users').update({ tour_completed: true }).eq('id', data.user.id).then(() => {})
          }
        })
      },

      completeTour: () => {
        set({ tourCompleted: true, tourRouteIndex: 0, tourStepInRoute: 0 })
        const supabase = createClient()
        supabase.auth.getUser().then(({ data }) => {
          if (data.user) {
            supabase.from('users').update({ tour_completed: true }).eq('id', data.user.id).then(() => {})
          }
        })
      },


      syncTourFromSupabase: async (userId: string) => {
        const supabase = createClient()
        const { data } = await supabase
          .from('users')
          .select('tour_completed')
          .eq('id', userId)
          .single()
        if (data?.tour_completed) {
          set({ tourCompleted: true })
        }
      },

      setTourRoute: (pathname: string) => {
        const idx = TOUR_ROUTE_ORDER.indexOf(pathname as TourRoute)
        if (idx !== -1) {
          set({ tourRouteIndex: idx, tourStepInRoute: 0 })
        }
      },
    }),
    {
      name: 'chanchito-tour',
      partialize: (state) => ({
        tourCompleted: state.tourCompleted,
        tourSkipped: state.tourSkipped,
        tourRouteIndex: state.tourRouteIndex,
        tourStepInRoute: state.tourStepInRoute,
      }),
    }
  )
)
