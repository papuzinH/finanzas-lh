'use client'

import { useState } from 'react'
import {
  TrendingUp,
  Globe,
  Landmark,
  BarChart3,
  PiggyBank,
  Bitcoin,
  ChevronDown,
  Check,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ASSET_TYPES } from '@/lib/schemas/investment-asset'
import { getAssetTypeLabel } from './asset-type-badge'

type AssetType = (typeof ASSET_TYPES)[number]

interface QuickType {
  value: AssetType
  label: string
  description: string
  icon: typeof TrendingUp
}

const QUICK_TYPES: QuickType[] = [
  { value: 'stock', label: 'Acción AR', description: 'Acciones del Merval', icon: TrendingUp },
  { value: 'cedear', label: 'CEDEAR', description: 'Acciones extranjeras en pesos', icon: Globe },
  { value: 'bond', label: 'Bono / ON', description: 'Renta fija argentina', icon: Landmark },
  { value: 'etf', label: 'ETF / Acción intl', description: 'Tenencia directa en USD', icon: BarChart3 },
  { value: 'plazo_fijo', label: 'Plazo Fijo', description: 'Tasa fija ARS', icon: PiggyBank },
  { value: 'crypto', label: 'Crypto', description: 'BTC, ETH, etc.', icon: Bitcoin },
]

const QUICK_VALUES = new Set(QUICK_TYPES.map((q) => q.value))

const MORE_TYPES: AssetType[] = [
  'on',
  'bopreal',
  'lecap',
  'boncap',
  'money_market',
  'stablecoin',
  'fci',
]

interface AssetTypePickerProps {
  value: AssetType | undefined
  onChange: (v: AssetType) => void
}

export function AssetTypePicker({ value, onChange }: AssetTypePickerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)

  const isInMore = value !== undefined && !QUICK_VALUES.has(value)

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {QUICK_TYPES.map((qt) => {
          const Icon = qt.icon
          const active = value === qt.value
          return (
            <button
              key={qt.value}
              type="button"
              onClick={() => onChange(qt.value)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-xl border-[1.5px] px-3 py-3 text-left transition-all touch-manipulation',
                active
                  ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
                  : 'border-border bg-surface-2 hover:border-accent/50 hover:bg-surface'
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={cn('h-3.5 w-3.5', active ? 'text-accent' : 'text-muted')} />
                <span className={cn('text-xs font-semibold', active ? 'text-text' : 'text-text')}>
                  {qt.label}
                </span>
              </div>
              <span className="text-[10px] text-muted leading-tight">{qt.description}</span>
            </button>
          )
        })}
      </div>

      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center justify-between gap-2 w-full rounded-lg border-[1.5px] px-3 py-2 text-xs font-medium transition-colors',
              isInMore
                ? 'border-accent bg-accent/10 text-text'
                : 'border-border bg-surface-2 text-muted hover:text-text hover:border-accent/50'
            )}
          >
            <span>
              {isInMore ? getAssetTypeLabel(value!) : 'Más tipos…'}
            </span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 bg-surface border-[1.5px] border-border p-2">
          <ul className="space-y-0.5">
            {MORE_TYPES.map((t) => {
              const active = value === t
              return (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(t)
                      setPopoverOpen(false)
                    }}
                    className={cn(
                      'flex items-center justify-between w-full rounded-md px-2.5 py-2 text-xs transition-colors',
                      active
                        ? 'bg-accent/10 text-text font-semibold'
                        : 'text-text hover:bg-surface-2'
                    )}
                  >
                    <span>{getAssetTypeLabel(t)}</span>
                    {active && <Check className="h-3.5 w-3.5 text-accent" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}
