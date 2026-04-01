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
    <div className="flex gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-800">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            value === opt.value
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
