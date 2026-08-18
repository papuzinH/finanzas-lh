"use client"

import { useChatStore } from '@/lib/store/chatStore'
import { motion } from 'framer-motion'
import { TrendingDown, TrendingUp, PieChart, Wallet } from 'lucide-react'

/**
 * Sin emoji: el sistema los reserva para las categorías que carga el usuario,
 * no para la UI de marca. Los íconos van en Lucide, y el color sigue el código
 * semántico del producto — rojo es gasto, verde es ingreso.
 */
const QUICK_ACTIONS = [
  { Icon: TrendingDown, tone: 'text-bad', text: 'Registrar gasto', message: 'Quiero registrar un gasto' },
  { Icon: TrendingUp, tone: 'text-good', text: 'Registrar ingreso', message: 'Registrar un ingreso' },
  { Icon: PieChart, tone: 'text-accent-deep', text: '¿Cuánto gasté?', message: '¿Cuánto he gastado este mes?' },
  { Icon: Wallet, tone: 'text-accent-deep', text: 'Balance', message: '¿Cuál es mi balance?' },
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
        {QUICK_ACTIONS.map(({ Icon, tone, text, message }) => (
          <motion.button
            key={text}
            variants={itemVariants}
            onClick={() => handleQuickAction(message)}
            className="shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-[11.5px] font-bold bg-surface border-[1.5px] border-border text-text transition-colors active:opacity-70"
          >
            <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden />
            <span>{text}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
