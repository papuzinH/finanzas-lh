"use client"

import { motion } from 'framer-motion'

export function TypingIndicator() {
  const dotVariants = {
    hidden: { opacity: 0.4, y: 0 },
    visible: (i: number) => ({
      opacity: 1,
      y: -8,
      transition: {
        duration: 0.6,
        repeat: Infinity,
        delay: i * 0.2,
      },
    }),
  }

  return (
    <div className="flex gap-2 items-end">
      {/* Avatar */}
      <div className="flex-shrink-0 w-7 h-7 bg-zinc-700 rounded-full flex items-center justify-center text-sm">
        🐷
      </div>

      {/* Burbuja con puntos */}
      <div className="bg-zinc-800 text-slate-100 rounded-2xl rounded-bl-sm px-4 py-2.5 flex gap-1.5 items-end">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            custom={i}
            variants={dotVariants}
            initial="hidden"
            animate="visible"
            className="w-2 h-2 bg-slate-400 rounded-full"
          />
        ))}
      </div>
    </div>
  )
}
