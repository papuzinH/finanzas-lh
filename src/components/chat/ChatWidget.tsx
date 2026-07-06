"use client"

import { useEffect, useRef } from 'react'
import { useChatStore } from '@/lib/store/chatStore'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Sparkles, X } from 'lucide-react'
import { ChatBubble } from './ChatBubble'
import { TypingIndicator } from './TypingIndicator'
import { ChatInput } from './ChatInput'
import { QuickActions } from './QuickActions'

function WelcomeMessage() {
  return (
    <div className="text-center py-8 space-y-3">
      <div className="text-4xl">🐷</div>
      <h3 className="font-poster text-[18px] text-text">Hola, soy Chanchito</h3>
      <p className="font-sans text-sm text-muted max-w-[280px] mx-auto">
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
                   bg-accent text-accent-ink border-[1.5px] border-accent-deep
                   rounded-full w-14 h-14 flex items-center justify-center
                   shadow-fab active:translate-y-[2px] transition-transform
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
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
          <span className="absolute -top-1 -right-1 grid place-items-center w-5 h-5 rounded-full bg-bad text-cream-light border-[1.5px] border-accent">
            <Sparkles className="w-[11px] h-[11px]" />
          </span>
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
                       bg-bg border-[1.5px] border-border
                       md:shadow-float
                       flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-navy">
              <div className="flex items-center gap-3 px-4 pt-10 pb-3">
                <div className="grid place-items-center w-10 h-10 rounded-full bg-accent border-[1.5px] border-cream-light/30 text-lg flex-shrink-0">
                  🐷
                </div>
                <div className="flex-1 leading-tight">
                  <p className="font-poster text-[16px] text-cream-light">Chanchito IA</p>
                  <p className="font-sans text-[11px] text-celeste flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-good inline-block" />
                    en línea · Gemini
                  </p>
                </div>
                <button
                  onClick={toggleChat}
                  aria-label="Cerrar chat"
                  className="grid place-items-center w-9 h-9 min-h-[44px] min-w-[44px] rounded-full bg-cream-light/10 text-cream-light transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-light/40"
                >
                  <X className="w-[18px] h-[18px]" />
                </button>
              </div>

              {/* Listening Indicator */}
              {isListening && (
                <div className="flex items-center gap-1.5 px-4 py-2 bg-bad/10 border-t border-bad/20">
                  <div className="flex gap-0.5 items-center h-4">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="w-0.5 bg-bad rounded-full"
                        style={{
                          height: `${6 + Math.sin(i * 0.8) * 6}px`,
                          animation: `pulse 0.6s ease-in-out infinite`,
                          animationDelay: `${i * 0.12}s`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="font-sans text-xs text-bad font-medium">Escuchando...</span>
                </div>
              )}
            </div>

            {/* Messages Area */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4 bg-bg">
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
