'use client'

import { useCallback } from 'react'
import confetti from 'canvas-confetti'

const COLORS = ['#10B981', '#6366F1', '#F59E0B']

export function useConfetti() {
  const celebrate = useCallback((subtle = false) => {
    confetti({
      particleCount: subtle ? 50 : 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: COLORS,
    })
  }, [])

  return { celebrate }
}
