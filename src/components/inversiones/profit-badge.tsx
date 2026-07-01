import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProfitBadgeProps {
  percent: number
  amount?: number
  currency?: string
  showAmount?: boolean
  className?: string
}

const fmtPercent = (n: number) =>
  `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

const fmtAmount = (n: number, currency = 'ARS') =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(n))

export function ProfitBadge({ percent, amount, currency, showAmount = false, className }: ProfitBadgeProps) {
  const isPositive = percent > 0
  const isZero = percent === 0

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium',
        isZero
          ? 'bg-surface-2 text-muted'
          : isPositive
            ? 'bg-good/10 text-good'
            : 'bg-bad/10 text-bad',
        className
      )}
    >
      {isZero ? (
        <Minus className="h-3 w-3" />
      ) : isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {showAmount && amount !== undefined
        ? `${fmtAmount(amount, currency)} (${fmtPercent(percent)})`
        : fmtPercent(percent)}
    </span>
  )
}
