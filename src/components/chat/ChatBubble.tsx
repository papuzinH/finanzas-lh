"use client"

import { ChatMessage, useChatStore } from '@/lib/store/chatStore'
import { motion } from 'framer-motion'
import { Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Chancho } from '@/components/brand/chancho'

interface ChatBubbleProps {
  message: ChatMessage
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user'
  const { sendMessage, setConfirmationHandled } = useChatStore()

  const containerVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount)
  }

  /** Convierte **texto** en <strong> y preserva saltos de línea */
  function formatMessage(text: string) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      }
      return part
    })
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn('flex gap-2', isUser && 'flex-row-reverse')}
    >
      {/* Avatar de Chanchito */}
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 bg-surface border-[1.5px] border-border rounded-full flex items-center justify-center">
          <Chancho slot="var(--surface)" className="w-4 text-text" />
        </div>
      )}

      {/* Contenedor del mensaje */}
      <div className="flex flex-col gap-2 flex-1">
        {/* Burbuja de texto o de voz */}
        {isUser && message.isVoice ? (
          <div className="bg-accent text-accent-ink border-[1.5px] border-accent-deep rounded-2xl rounded-br-md ml-auto max-w-[80%] px-4 py-2.5 flex flex-col gap-1 font-sans">
            <div className="flex items-center gap-2">
              <Mic className="w-3.5 h-3.5 flex-shrink-0 opacity-80" />
              <span className="text-xs opacity-80">Mensaje de voz</span>
            </div>
            <p className="text-sm break-words">{message.content}</p>
          </div>
        ) : (
          <div
            className={cn(
              'rounded-2xl px-3.5 py-2.5 max-w-[80%] break-words text-[13.5px] leading-snug font-sans whitespace-pre-line border-[1.5px]',
              isUser
                ? 'bg-accent text-accent-ink border-accent-deep rounded-br-md ml-auto'
                : 'bg-surface text-text border-border rounded-bl-md mr-auto'
            )}
          >
            {formatMessage(message.content)}
          </div>
        )}

        {/* Card de resultado de acción (solo para Chanchito) */}
        {!isUser && message.actionResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            className="border-[1.5px] border-border rounded-xl bg-surface p-3 mr-auto max-w-[80%]"
          >
            <div className="flex items-start gap-3">
              {message.actionResult.emoji && (
                <div className="text-xl flex-shrink-0 pt-0.5">
                  {message.actionResult.emoji}
                </div>
              )}
              <div className="flex-1 text-xs font-sans">
                {message.actionResult.description && (
                  <p className="text-text font-semibold mb-1">
                    {message.actionResult.description}
                  </p>
                )}
                {message.actionResult.amount && (
                  <p className="text-good font-sans font-semibold tnum">
                    {formatCurrency(message.actionResult.amount)}
                  </p>
                )}
                {message.actionResult.category && (
                  <p className="text-muted text-[10px] mt-1">
                    Categoría: {message.actionResult.category}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Botones de confirmación para mensajes de voz */}
        {!isUser && message.needsConfirmation && !message.confirmationHandled && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.15 }}
            className="flex items-center gap-2 mr-auto"
          >
            <p className="font-sans text-xs text-muted">¿Es correcto?</p>
            <button
              onClick={() => {
                setConfirmationHandled(message.id)
                sendMessage('confirmar')
              }}
              aria-label="Confirmar"
              className="font-sans text-xs bg-good/10 hover:bg-good/20 border-[1.5px] border-good/30 text-good rounded-lg px-4 py-2.5 min-h-[44px] transition-colors focus-visible:outline-none"
            >
              ✅ Sí
            </button>
            <button
              onClick={() => {
                setConfirmationHandled(message.id)
                sendMessage('cancelar')
              }}
              aria-label="Cancelar"
              className="font-sans text-xs bg-bad/10 hover:bg-bad/20 border-[1.5px] border-bad/30 text-bad rounded-lg px-4 py-2.5 min-h-[44px] transition-colors focus-visible:outline-none"
            >
              ❌ No
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
