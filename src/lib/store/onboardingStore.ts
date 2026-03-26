"use client"

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createClient } from '@/utils/supabase/client'
import type {
  OnboardingStep,
  ProposedCategory,
  SavedPaymentMethod,
  OnboardingResponse,
} from '@/lib/ai/onboardingTypes'

export interface OnboardingMessage {
  id: string
  role: 'user' | 'chanchito'
  content: string
  timestamp: Date
}

/** Rutas en orden de secuencia del tour */
export const TOUR_ROUTE_ORDER = [
  '/',
  '/movimientos',
  '/compromisos',
  '/objetivos',
  '/ajustes',
  '/',
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
    { target: 'compromisos-tabs', text: 'Registra tus cuotas de tarjeta y suscripciones fijas por separado para controlar qué pagás cada mes.', position: 'bottom' },
  ],
  '/objetivos': [
    { target: 'tabs-list', text: 'Establece tus metas de ahorro y presupuestos mensuales por categoría.', position: 'bottom' },
  ],
  '/ajustes': [
    { target: 'section-medios', text: 'Recordá que podes editar tus medios de pago y categorías para que Chanchito sea preciso.', position: 'bottom' },
    {target: 'fab', text: 'Podes hacer todas estas acciones y consultar tu estado financiero pidiendole directamente a Chanchito.', position: 'top' },
  ]
}

/** Total de pasos globales del tour */
export const TOUR_TOTAL_STEPS = Object.values(TOUR_STEPS_BY_ROUTE).reduce((sum, steps) => sum + steps.length, 0)

interface OnboardingState {
  currentStep: OnboardingStep
  messages: OnboardingMessage[]
  isLoading: boolean
  isListening: boolean

  // Datos acumulados durante el onboarding
  userName: string | null
  proposedCategories: ProposedCategory[]
  savedPaymentMethods: SavedPaymentMethod[]
  pendingCreditCards: string[]
  isComplete: boolean

  // Tour post-registro (multi-ruta)
  tourCompleted: boolean
  tourSkipped: boolean
  tourRouteIndex: number
  tourStepInRoute: number

  // Actions
  addMessage: (msg: Omit<OnboardingMessage, 'id' | 'timestamp'>) => void
  setStep: (step: OnboardingStep) => void
  setLoading: (loading: boolean) => void
  setListening: (listening: boolean) => void
  sendMessage: (text: string) => Promise<void>
  reset: () => void

  // Tour actions
  /** Avanza un paso. Devuelve la nueva ruta si debe navegar, o null si se queda. */
  advanceTour: () => TourRoute | null
  skipTour: () => void
  completeTour: () => void
  resetTour: () => void
  /** Sincroniza tourCompleted desde/hacia Supabase */
  syncTourFromSupabase: (userId: number) => Promise<void>
  /** Llamar al arribar a una ruta para sincronizar el índice */
  setTourRoute: (pathname: string) => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      currentStep: 'name',
      messages: [],
      isLoading: false,
      isListening: false,
      userName: null,
      proposedCategories: [],
      savedPaymentMethods: [],
      pendingCreditCards: [],
      isComplete: false,

      // Tour initial state (multi-ruta)
      tourCompleted: false,
      tourSkipped: false,
      tourRouteIndex: 0,
      tourStepInRoute: 0,

      addMessage: (msg) => set(s => ({
        messages: [...s.messages, {
          ...msg,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        }]
      })),

      setStep: (step) => set({ currentStep: step }),
      setLoading: (loading) => set({ isLoading: loading }),
      setListening: (listening) => set({ isListening: listening }),

      // Tour actions
      advanceTour: () => {
        const { tourRouteIndex, tourStepInRoute } = get()
        const currentRoute = TOUR_ROUTE_ORDER[tourRouteIndex]
        const stepsForRoute = TOUR_STEPS_BY_ROUTE[currentRoute]

        // ¿Hay más pasos en la ruta actual?
        if (tourStepInRoute < stepsForRoute.length - 1) {
          set({ tourStepInRoute: tourStepInRoute + 1 })
          return null // se queda en la misma ruta
        }

        // ¿Hay más rutas?
        if (tourRouteIndex < TOUR_ROUTE_ORDER.length - 1) {
          const nextIdx = tourRouteIndex + 1
          set({ tourRouteIndex: nextIdx, tourStepInRoute: 0 })
          return TOUR_ROUTE_ORDER[nextIdx] // navegar a la siguiente ruta
        }

        // Tour terminado
        get().completeTour()
        return null
      },

      skipTour: () => {
        set({ tourSkipped: true, tourRouteIndex: 0, tourStepInRoute: 0 })
        // Sync a Supabase: marcar como completado para no molestar
        const supabase = createClient()
        supabase.auth.getUser().then(({ data }) => {
          if (data.user) {
            supabase.from('users').update({ tour_completed: true }).eq('auth_user_id', data.user.id).then(() => {})
          }
        })
      },

      completeTour: () => {
        set({ tourCompleted: true, tourRouteIndex: 0, tourStepInRoute: 0 })
        const supabase = createClient()
        supabase.auth.getUser().then(({ data }) => {
          if (data.user) {
            supabase.from('users').update({ tour_completed: true }).eq('auth_user_id', data.user.id).then(() => {})
          }
        })
      },

      resetTour: () => {
        set({ tourCompleted: false, tourSkipped: false, tourRouteIndex: 0, tourStepInRoute: 0 })
        const supabase = createClient()
        supabase.auth.getUser().then(({ data }) => {
          if (data.user) {
            supabase.from('users').update({ tour_completed: false }).eq('auth_user_id', data.user.id).then(() => {})
          }
        })
      },

      syncTourFromSupabase: async (userId: number) => {
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

      sendMessage: async (text: string) => {
        const { addMessage, setLoading, currentStep, proposedCategories, savedPaymentMethods, messages, pendingCreditCards } = get()

        addMessage({ role: 'user', content: text })
        setLoading(true)

        const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))

        try {
          const response = await fetch('/api/chat/onboarding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: text,
              step: currentStep,
              context: {
                proposedCategories,
                savedPaymentMethods,
                history,
                pendingCreditCards,
              },
            }),
          })

          const data: OnboardingResponse = await response.json()

          if (data.success) {
            addMessage({ role: 'chanchito', content: data.message })

            const updates: Partial<OnboardingState> = {}

            if (data.data?.categories) {
              updates.proposedCategories = data.data.categories
            }

            if (data.data?.paymentMethod) {
              const existing = get().savedPaymentMethods
              const existingIdx = existing.findIndex(m => m.id === data.data!.paymentMethod!.id)
              if (existingIdx >= 0) {
                const updated = [...existing]
                updated[existingIdx] = data.data.paymentMethod
                updates.savedPaymentMethods = updated
              } else {
                updates.savedPaymentMethods = [...existing, data.data.paymentMethod]
              }
            }

            if (data.data?.allPaymentMethods) {
              updates.savedPaymentMethods = data.data.allPaymentMethods
            }

            if (data.data?.pendingCreditCards) {
              updates.pendingCreditCards = data.data.pendingCreditCards
            }

            if (data.data?.onboardingComplete) {
              updates.isComplete = true
            }

            if (data.nextStep) {
              updates.currentStep = data.nextStep
            }

            if (currentStep === 'name' && data.success && data.nextStep === 'categories') {
              const nameMatch = data.message.match(/¡Un gusto, (.+?)!/)
              if (nameMatch) {
                updates.userName = nameMatch[1]
              }
            }

            set(updates as Partial<OnboardingState>)
          } else {
            addMessage({
              role: 'chanchito',
              content: data.message || 'Hmm, no entendí. ¿Podés reformularlo?',
            })
          }
        } catch {
          addMessage({
            role: 'chanchito',
            content: 'Ups, hubo un error de conexión. Intentá de nuevo.',
          })
        } finally {
          setLoading(false)
        }
      },

      reset: () => set({
        currentStep: 'name',
        messages: [],
        isLoading: false,
        isListening: false,
        userName: null,
        proposedCategories: [],
        savedPaymentMethods: [],
        pendingCreditCards: [],
        isComplete: false,
      }),
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
