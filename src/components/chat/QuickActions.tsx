"use client"

import { useChatStore } from '@/lib/store/chatStore'
import { motion } from 'framer-motion'

const QUICK_ACTIONS = [
  { emoji: '💸', text: 'Registrar gasto', message: 'Quiero registrar un gasto' },
  { emoji: '💰', text: 'Registrar ingreso', message: 'Registrar un ingreso' },
  { emoji: '📊', text: '¿Cuánto gasté?', message: '¿Cuánto he gastado este mes?' },
  { emoji: '💳', text: 'Balance', message: '¿Cuál es mi balance?' },
]

export function QuickActions() {
  const { sendMessage } = useChatStore()

  const handleQuickAction = async (message: string) => {
    await sendMessage(message)
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.3 },
    },
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="pt-4 space-y-2"
    >
      <p className="font-sans text-xs text-muted font-semibold uppercase tracking-wider">
        Sugerencias
      </p>
      <div className="flex gap-2 overflow-x-auto no-sb pb-1">
        {QUICK_ACTIONS.map((action) => (
          <motion.button
            key={action.text}
            variants={itemVariants}
            onClick={() => handleQuickAction(action.message)}
            className="shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-[11.5px] font-bold bg-surface border-[1.5px] border-border text-text transition-colors active:opacity-70"
          >
            <span>{action.emoji}</span>
            <span>{action.text}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
