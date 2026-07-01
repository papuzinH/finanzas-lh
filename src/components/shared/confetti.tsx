'use client'

import { useCallback } from 'react'
import confetti from 'canvas-confetti'

// canvas-confetti no puede leer clases CSS → resolvemos los primitivos
// del design system en runtime para mantenerlo tokenizado.
const FALLBACK = ['#2E7D5B', '#5E98BC', '#E3A938']

function resolveColors(): string[] {
  if (typeof window === 'undefined') return FALLBACK
  const s = getComputedStyle(document.documentElement)
  const colors = ['--green-600', '--celeste-500', '--gold-500']
    .map((v) => s.getPropertyValue(v).trim())
    .filter(Boolean)
  return colors.length ? colors : FALLBACK
}

export function useConfetti() {
  const celebrate = useCallback((subtle = false) => {
    confetti({
      particleCount: subtle ? 50 : 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: resolveColors(),
    })
  }, [])

  return { celebrate }
}
