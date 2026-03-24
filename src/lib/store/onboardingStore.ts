"use client"

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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

  // Tour post-registro
  tourCompleted: boolean
  tourSkipped: boolean
  tourStep: number

  // Actions
  addMessage: (msg: Omit<OnboardingMessage, 'id' | 'timestamp'>) => void
  setStep: (step: OnboardingStep) => void
  setLoading: (loading: boolean) => void
  setListening: (listening: boolean) => void
  sendMessage: (text: string) => Promise<void>
  reset: () => void

  // Tour actions
  nextTourStep: () => void
  skipTour: () => void
  completeTour: () => void
  resetTour: () => void
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

      // Tour initial state
      tourCompleted: false,
      tourSkipped: false,
      tourStep: 0,

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
      nextTourStep: () => {
        const { tourStep } = get()
        if (tourStep >= 3) {
          set({ tourCompleted: true, tourStep: 0 })
        } else {
          set({ tourStep: tourStep + 1 })
        }
      },
      skipTour: () => set({ tourSkipped: true, tourStep: 0 }),
      completeTour: () => set({ tourCompleted: true, tourStep: 0 }),
      resetTour: () => set({ tourCompleted: false, tourSkipped: false, tourStep: 0 }),

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
      }),
    }
  )
)
