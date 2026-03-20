"use client"

import { create } from 'zustand'
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
  isComplete: boolean

  // Actions
  addMessage: (msg: Omit<OnboardingMessage, 'id' | 'timestamp'>) => void
  setStep: (step: OnboardingStep) => void
  setLoading: (loading: boolean) => void
  setListening: (listening: boolean) => void
  sendMessage: (text: string) => Promise<void>
  reset: () => void
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  currentStep: 'name',
  messages: [],
  isLoading: false,
  isListening: false,
  userName: null,
  proposedCategories: [],
  savedPaymentMethods: [],
  isComplete: false,

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

  sendMessage: async (text: string) => {
    const { addMessage, setLoading, currentStep, proposedCategories, savedPaymentMethods } = get()

    addMessage({ role: 'user', content: text })
    setLoading(true)

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
          },
        }),
      })

      const data: OnboardingResponse = await response.json()

      if (data.success) {
        addMessage({ role: 'chanchito', content: data.message })

        // Update accumulated state based on response data
        const updates: Partial<OnboardingState> = {}

        if (data.data?.categories) {
          updates.proposedCategories = data.data.categories
        }

        if (data.data?.paymentMethod) {
          updates.savedPaymentMethods = [...get().savedPaymentMethods, data.data.paymentMethod]
        }

        if (data.data?.allPaymentMethods) {
          updates.savedPaymentMethods = data.data.allPaymentMethods
        }

        if (data.data?.onboardingComplete) {
          updates.isComplete = true
        }

        // Advance to next step if indicated
        if (data.nextStep) {
          updates.currentStep = data.nextStep
        }

        // Extract name from the name step
        if (currentStep === 'name' && data.success && data.nextStep === 'categories') {
          // Name was saved successfully — we can extract it from the message
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
    isComplete: false,
  }),
}))
