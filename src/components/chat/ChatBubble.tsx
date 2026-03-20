"use client"

import { ChatMessage } from '@/lib/store/chatStore'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ChatBubbleProps {
  message: ChatMessage
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user'

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

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn('flex gap-2', isUser && 'flex-row-reverse')}
    >
      {/* Avatar de Chanchito */}
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 bg-zinc-700 rounded-full flex items-center justify-center text-sm">
          🐷
        </div>
      )}

      {/* Contenedor del mensaje */}
      <div className="flex flex-col gap-2 flex-1">
        {/* Burbuja de texto */}
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 max-w-xs break-words text-sm',
            isUser
              ? 'bg-indigo-600 text-white rounded-br-sm ml-auto'
              : 'bg-zinc-800 text-slate-100 rounded-bl-sm mr-auto'
          )}
        >
          {message.content}
        </div>

        {/* Card de resultado de acción (solo para Chanchito) */}
        {!isUser && message.actionResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            className="border border-emerald-500/30 rounded-xl bg-emerald-500/5 p-3 mr-auto max-w-xs"
          >
            <div className="flex items-start gap-3">
              {message.actionResult.emoji && (
                <div className="text-xl flex-shrink-0 pt-0.5">
                  {message.actionResult.emoji}
                </div>
              )}
              <div className="flex-1 text-xs">
                {message.actionResult.description && (
                  <p className="text-slate-200 font-medium mb-1">
                    {message.actionResult.description}
                  </p>
                )}
                {message.actionResult.amount && (
                  <p className="text-emerald-400 font-mono font-semibold">
                    {formatCurrency(message.actionResult.amount)}
                  </p>
                )}
                {message.actionResult.category && (
                  <p className="text-slate-400 text-[10px] mt-1">
                    Categoría: {message.actionResult.category}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
