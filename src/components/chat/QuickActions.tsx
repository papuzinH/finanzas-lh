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
      className="flex flex-col gap-2 pt-4"
    >
      <p className="text-xs text-slate-400 px-4 uppercase tracking-wider">
        Sugerencias
      </p>
      <div className="flex flex-col gap-2 px-4">
        {QUICK_ACTIONS.map((action) => (
          <motion.button
            key={action.text}
            variants={itemVariants}
            onClick={() => handleQuickAction(action.message)}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700 transition-all"
          >
            <span className="text-lg flex-shrink-0">{action.emoji}</span>
            <span className="text-sm text-slate-300 group-hover:text-slate-100 transition-colors text-left">
              {action.text}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
