'use client'

import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

export type DisplayCurrency = 'ARS' | 'USD_MEP' | 'USD_CCL' | 'USDT'

const OPTIONS: { value: DisplayCurrency; label: string; aria: string }[] = [
  { value: 'ARS', label: 'ARS', aria: 'Ver montos en pesos argentinos' },
  { value: 'USD_MEP', label: 'MEP', aria: 'Ver montos en dólar MEP' },
  { value: 'USD_CCL', label: 'CCL', aria: 'Ver montos en dólar CCL (contado con liquidación)' },
  { value: 'USDT', label: 'USDT', aria: 'Ver montos en dólar cripto USDT' },
]

interface CurrencyToggleProps {
  value: DisplayCurrency
  onChange: (value: DisplayCurrency) => void
}

export function CurrencyToggle({ value, onChange }: CurrencyToggleProps) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])

  const move = (i: number) => {
    const next = (i + OPTIONS.length) % OPTIONS.length
    btnRefs.current[next]?.focus()
    onChange(OPTIONS[next].value)
  }

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        move(i + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        move(i - 1)
        break
      case 'Home':
        e.preventDefault()
        move(0)
        break
      case 'End':
        e.preventDefault()
        move(OPTIONS.length - 1)
        break
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Moneda de visualización"
      className="flex gap-1 p-1 rounded-xl bg-surface-2 border-[1.5px] border-border"
    >
      {OPTIONS.map((opt, i) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            ref={(el) => {
              btnRefs.current[i] = el
            }}
            role="radio"
            aria-checked={selected}
            aria-label={opt.aria}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex-1 min-h-11 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer touch-manipulation',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2',
              selected
                ? 'bg-accent text-accent-ink shadow-sm'
                : 'text-muted hover:text-text'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
