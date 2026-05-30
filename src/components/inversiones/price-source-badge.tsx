'use client'

const SOURCE_LABELS: Record<string, { label: string; className: string }> = {
  yahoo: { label: 'Yahoo', className: 'text-blue-400' },
  yahoo_us: { label: 'Yahoo US', className: 'text-sky-400' },
  iol: { label: 'IOL', className: 'text-orange-400' },
  coingecko: { label: 'CoinGecko', className: 'text-yellow-400' },
}

interface PriceSourceBadgeProps {
  source: string | null
}

export function PriceSourceBadge({ source }: PriceSourceBadgeProps) {
  if (!source) return null
  const config = SOURCE_LABELS[source] ?? { label: source, className: 'text-slate-500' }
  return (
    <span className={`text-[9px] font-medium ${config.className}`} title={`Fuente: ${config.label}`}>
      {config.label}
    </span>
  )
}
