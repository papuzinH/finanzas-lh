"use client"

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const FRASES = [
  'Pensando… 🐷',
  'Revisando tus cuentas…',
  'Haciendo números…',
  'Consultando tus movimientos…',
  'Ya casi…',
]

export function TypingIndicator() {
  const [phraseIndex, setPhraseIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % FRASES.length)
    }, 2500)

    return () => clearInterval(interval)
  }, [])

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
      <div className="flex-shrink-0 w-7 h-7 bg-surface border-[1.5px] border-border rounded-full flex items-center justify-center text-sm">
        🐷
      </div>

      {/* Burbuja con frase y puntos */}
      <div className="bg-surface text-muted border-[1.5px] border-border rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5 items-end font-sans">
        <span>{FRASES[phraseIndex]}</span>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            custom={i}
            variants={dotVariants}
            initial="hidden"
            animate="visible"
            className="w-2 h-2 bg-muted rounded-full flex-shrink-0"
          />
        ))}
      </div>
    </div>
  )
}
