"use client"

import { useEffect, useRef } from 'react'
import { useChatStore } from '@/lib/store/chatStore'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X } from 'lucide-react'
import { ChatBubble } from './ChatBubble'
import { TypingIndicator } from './TypingIndicator'
import { ChatInput } from './ChatInput'
import { QuickActions } from './QuickActions'

function WelcomeMessage() {
  return (
    <div className="text-center py-8 space-y-3">
      <div className="text-4xl">🐷</div>
      <h3 className="text-lg font-semibold text-slate-100">Hola, soy Chanchito</h3>
      <p className="text-sm text-slate-400 max-w-[280px] mx-auto">
        Contame tus gastos e ingresos y yo los registro automáticamente.
      </p>
    </div>
  )
}

export function ChatWidget() {
  const { isOpen, toggleChat, messages, isLoading, isListening } = useChatStore()
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll al último mensaje (scroll interno, no de la página)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages, isLoading])

  return (
    <>
      {/* FAB Button */}
      <motion.button
        data-tour="fab"
        onClick={toggleChat}
        aria-label={isOpen ? "Cerrar chat" : "Abrir chat"}
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-50
                   bg-indigo-600 hover:bg-indigo-500 text-white
                   rounded-full w-14 h-14 flex items-center justify-center
                   shadow-lg shadow-indigo-600/25 transition-colors
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.05 }}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MessageCircle className="w-6 h-6" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Badge de notificación */}
        {!isOpen && messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
        )}
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed z-50
                       top-0 left-0 right-0 h-[100dvh] md:h-auto
                       md:inset-auto md:bottom-24 md:right-6 md:w-96 md:h-[600px] md:max-h-[80vh]
                       md:rounded-2xl
                       bg-zinc-950 md:border md:border-zinc-800
                       md:shadow-2xl
                       flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="border-b border-zinc-800 bg-zinc-950">
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 bg-indigo-600/20 rounded-full flex items-center justify-center text-lg">
                  🐷
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-100">Chanchito</h3>
                  <p className="text-xs text-slate-400">Tu asistente financiero</p>
                </div>
                <button
                  onClick={toggleChat}
                  aria-label="Cerrar chat"
                  className="md:hidden p-2 min-h-11 min-w-11 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Listening Indicator */}
              {isListening && (
                <div className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 border-t border-red-500/20">
                  <div className="flex gap-0.5 items-center h-4">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="w-0.5 bg-red-400 rounded-full"
                        style={{
                          height: `${6 + Math.sin(i * 0.8) * 6}px`,
                          animation: `pulse 0.6s ease-in-out infinite`,
                          animationDelay: `${i * 0.12}s`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-red-400 font-medium">Escuchando...</span>
                </div>
              )}
            </div>

            {/* Messages Area */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-col justify-end min-h-full space-y-4">
                {messages.length === 0 ? (
                  <>
                    <WelcomeMessage />
                    <QuickActions />
                  </>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <ChatBubble key={msg.id} message={msg} />
                    ))}
                    {isLoading && <TypingIndicator />}
                  </>
                )}
              </div>
            </div>

            {/* Input */}
            <ChatInput />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
