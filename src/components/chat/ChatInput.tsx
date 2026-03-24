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
      className="border-t border-zinc-800 p-4 bg-zinc-950 flex gap-2"
    >
      {isListening ? (
        <div className="flex-1 bg-zinc-900 border border-red-500/50 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
          <span className="flex gap-0.5 items-end h-4">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="w-0.5 bg-red-400 rounded-full animate-pulse"
                style={{
                  height: `${[60, 100, 80, 50][i]}%`,
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </span>
          <span className="text-red-400 text-xs">
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
          placeholder="Contale a Chanchito..."
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
        />
      )}

      {input.trim() ? (
        <motion.button
          type="submit"
          disabled={isLoading}
          aria-label="Enviar mensaje"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg p-2.5 min-h-[44px] min-w-[44px] disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
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
          className={`flex-shrink-0 rounded-lg p-2.5 min-h-[44px] min-w-[44px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
            isListening
              ? 'bg-red-500/20 border border-red-500/50 text-red-400 animate-pulse ring-1 ring-red-500/30'
              : 'bg-zinc-800 hover:bg-zinc-700 text-slate-400 hover:text-slate-300'
          }`}
        >
          <Mic className="w-5 h-5" />
        </motion.button>
      )}
    </form>
  )
}
