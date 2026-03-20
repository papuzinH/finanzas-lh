"use client"

import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'chanchito'
  content: string
  timestamp: Date
  // Para mensajes de Chanchito que confirman una acción:
  actionResult?: {
    type: 'transaction' | 'installment' | 'subscription' | 'error'
    description?: string
    amount?: number
    category?: string
    emoji?: string
  }
}

interface ChatState {
  messages: ChatMessage[]
  isOpen: boolean
  isLoading: boolean // Gemini está procesando
  isListening: boolean // Web Speech API activo

  // Actions
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  setLoading: (loading: boolean) => void
  setListening: (listening: boolean) => void
  sendMessage: (text: string) => Promise<void>
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isOpen: false,
  isLoading: false,
  isListening: false,

  openChat: () => set({ isOpen: true }),
  closeChat: () => set({ isOpen: false }),
  toggleChat: () => set(s => ({ isOpen: !s.isOpen })),

  addMessage: (msg) => set(s => ({
    messages: [...s.messages, {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }]
  })),

  setLoading: (loading) => set({ isLoading: loading }),
  setListening: (listening) => set({ isListening: listening }),

  sendMessage: async (text: string) => {
    const { addMessage, setLoading, messages } = get()

    // Agregar mensaje del usuario
    addMessage({ role: 'user', content: text })
    setLoading(true)

    // Construir historial para contexto conversacional (últimos 10 mensajes previos)
    const history = messages
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })

      const data = await response.json()

      if (data.success) {
        addMessage({
          role: 'chanchito',
          content: data.message,
          actionResult: data.data ? {
            type: data.data.type || 'transaction',
            description: data.data.description,
            amount: data.data.amount,
            category: data.data.categoryName,
            emoji: data.data.emoji,
          } : undefined,
        })
      } else {
        addMessage({
          role: 'chanchito',
          content: data.message || data.error || 'Hmm, no entendí. ¿Podés reformularlo?',
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

  clearMessages: () => set({ messages: [] }),
}))
