"use client"

import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/lib/store/chatStore'
import { Send, Mic } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'

export function ChatInput() {
  const [input, setInput] = useState('')
  const { sendMessage, isLoading, setListening } = useChatStore()
  const inputRef = useRef<HTMLInputElement>(null)

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
      toast.error('Error de micrófono', {
        description: error,
        duration: 3000,
      })
    },
  })

  // Sincronizar estado de escucha con el store global
  useEffect(() => {
    setListening(isListening)
  }, [isListening, setListening])

  // Cuando se obtiene un resultado final, enviar directamente como mensaje de voz
  useEffect(() => {
    if (finalTranscript && !isListening) {
      sendMessage(finalTranscript.trim(), { isVoice: true })
      resetTranscript()
    }
  }, [finalTranscript, isListening, sendMessage, resetTranscript])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    await sendMessage(input.trim())
    setInput('')
    resetTranscript()
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
    <form
      onSubmit={handleSubmit}
      className="border-t-[1.5px] border-border px-3 py-3 pb-5 bg-bg-2 flex items-center gap-2"
    >
      {isListening ? (
        <div className="flex-1 bg-surface border-[1.5px] border-bad/40 rounded-full px-4 py-2.5 text-sm flex items-center gap-2">
          <span className="flex gap-0.5 items-end h-4">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="w-0.5 bg-bad rounded-full animate-pulse"
                style={{
                  height: `${[60, 100, 80, 50][i]}%`,
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </span>
          <span className="font-sans text-bad text-xs">
            {transcript || 'Escuchando...'}
          </span>
        </div>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          placeholder="Escribí o mandá un audio…"
          className="flex-1 bg-surface border-[1.5px] border-border rounded-full px-4 py-2.5 text-[13px] font-sans text-text placeholder:text-faint focus:outline-none focus:border-accent-deep disabled:opacity-50 transition-colors"
        />
      )}

      {input.trim() ? (
        <motion.button
          type="submit"
          disabled={isLoading}
          aria-label="Enviar mensaje"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex-shrink-0 bg-accent text-accent-ink border-[1.5px] border-accent-deep rounded-full p-2.5 min-h-[44px] min-w-[44px] disabled:opacity-50 shadow-offset active:translate-y-[2px] transition-transform focus-visible:outline-none"
        >
          <Send className="w-5 h-5" />
        </motion.button>
      ) : (
        <motion.button
          type="button"
          onClick={handleMicClick}
          aria-label={isListening ? 'Detener grabación' : 'Iniciar grabación de voz'}
          aria-pressed={isListening}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`flex-shrink-0 rounded-full p-2.5 min-h-[44px] min-w-[44px] border-[1.5px] transition-colors focus-visible:outline-none ${
            isListening
              ? 'bg-bad/10 border-bad/40 text-bad animate-pulse'
              : 'bg-surface border-border text-text'
          }`}
        >
          <Mic className="w-5 h-5" />
        </motion.button>
      )}
    </form>
  )
}
