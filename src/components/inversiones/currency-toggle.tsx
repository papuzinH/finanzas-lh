'use client'

import { cn } from '@/lib/utils'

export type DisplayCurrency = 'ARS' | 'USD_MEP' | 'USD_CCL' | 'USDT'

const OPTIONS: { value: DisplayCurrency; label: string }[] = [
  { value: 'ARS', label: 'ARS' },
  { value: 'USD_MEP', label: 'MEP' },
  { value: 'USD_CCL', label: 'CCL' },
  { value: 'USDT', label: 'USDT' },
]

interface CurrencyToggleProps {
  value: DisplayCurrency
  onChange: (value: DisplayCurrency) => void
}

export function CurrencyToggle({ value, onChange }: CurrencyToggleProps) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-surface-2 border-[1.5px] border-border">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
            value === opt.value
              ? 'bg-accent text-accent-ink shadow-sm'
              : 'text-muted hover:text-text'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
