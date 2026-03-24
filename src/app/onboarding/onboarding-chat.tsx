'use client'

import { useEffect, useRef, useState } from 'react'
import { useOnboardingStore, type OnboardingMessage } from '@/lib/store/onboardingStore'
import { motion } from 'framer-motion'
import { Send, Mic } from 'lucide-react'
import { toast } from 'sonner'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { cn } from '@/lib/utils'

interface OnboardingChatProps {
  onComplete: () => void
}

export function OnboardingChat({ onComplete }: OnboardingChatProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollEndRef = useRef<HTMLDivElement>(null)
  const hasGreeted = useRef(false)

  const {
    messages,
    isLoading,
    isComplete,
    sendMessage,
    addMessage,
    setListening,
  } = useOnboardingStore()

  const {
    isListening,
    isSupported,
    transcript,
    finalTranscript,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    lang: 'es-AR',
    continuous: false,
    onError: (error) => {
      toast.error('Error de micrófono', { description: error, duration: 3000 })
    },
  })

  // Auto-greet on mount
  useEffect(() => {
    if (!hasGreeted.current && messages.length === 0) {
      hasGreeted.current = true
      addMessage({
        role: 'chanchito',
        content: '¡Hola! 🐷 Soy Chanchito, tu asistente financiero.\n\n¿Cómo querés que te llame?',
      })
    }
  }, [addMessage, messages.length])

  // Auto-scroll
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Sync listening state
  useEffect(() => {
    setListening(isListening)
  }, [isListening, setListening])

  // Auto-fill input on speech end
  useEffect(() => {
    if (finalTranscript && !isListening) {
      // Use a microtask to avoid calling setState synchronously within effect
      queueMicrotask(() => {
        setInput(finalTranscript)
        resetTranscript()
      })
    }
  }, [finalTranscript, isListening, resetTranscript])

  // Trigger onComplete when onboarding finishes
  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(onComplete, 1500)
      return () => clearTimeout(timer)
    }
  }, [isComplete, onComplete])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    await sendMessage(input.trim())
    setInput('')
    resetTranscript()
    inputRef.current?.focus()
  }

  const handleMicClick = () => {
    if (!isSupported) {
      toast.error('No soportado', {
        description: 'Tu navegador no soporta reconocimiento de voz',
        duration: 3000,
      })
      return
    }
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-surface-raised/50 backdrop-blur-sm overflow-hidden"
      style={{ height: 'min(480px, 60vh)' }}
    >
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {isLoading && <TypingDots />}

        <div ref={scrollEndRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-800 p-3 bg-surface/80 flex gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading || isComplete}
          placeholder={
            isComplete
              ? '¡Onboarding completo!'
              : isListening
                ? transcript || 'Escuchando...'
                : 'Escribí tu respuesta...'
          }
          className={cn(
            'flex-1 bg-surface-raised border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100',
            'placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500',
            'disabled:opacity-50 transition-colors',
            isListening && transcript && 'text-slate-300 italic'
          )}
        />

        {input.trim() ? (
          <button
            type="submit"
            disabled={isLoading || isComplete}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg w-10 h-10 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isLoading || isComplete}
            className={cn(
              'rounded-lg w-10 h-10 flex items-center justify-center transition-colors disabled:opacity-50',
              isListening
                ? 'bg-red-500 hover:bg-red-400 text-white animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            )}
          >
            <Mic className="w-4 h-4" />
          </button>
        )}
      </form>
    </div>
  )
}

// --- Sub-components ---

function ChatBubble({ message }: { message: OnboardingMessage }) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn('flex gap-2', isUser && 'flex-row-reverse')}
    >
      {!isUser && (
        <div className="shrink-0 w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center text-sm">
          🐷
        </div>
      )}
      <div
        className={cn(
          'rounded-2xl px-4 py-2.5 max-w-[85%] wrap-break-word text-sm whitespace-pre-line',
          isUser
            ? 'bg-indigo-600 text-white rounded-br-sm ml-auto'
            : 'bg-slate-800 text-slate-100 rounded-bl-sm mr-auto'
        )}
      >
        {formatBold(message.content)}
      </div>
    </motion.div>
  )
}

/** Convert **bold** markers to <strong> tags */
function formatBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function TypingDots() {
  return (
    <div className="flex gap-2">
      <div className="shrink-0 w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center text-sm">
        🐷
      </div>
      <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 bg-slate-500 rounded-full"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  )
}
