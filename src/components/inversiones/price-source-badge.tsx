'use client'

const SOURCE_LABELS: Record<string, string> = {
  yahoo:      'Yahoo',
  yahoo_us:   'Yahoo US',
  iol:        'IOL',
  coingecko:  'CoinGecko',
}

interface PriceSourceBadgeProps {
  source: string | null
}

export function PriceSourceBadge({ source }: PriceSourceBadgeProps) {
  if (!source) return null
  const label = SOURCE_LABELS[source] ?? source
  return (
    <span className="text-[10px] font-medium text-muted" title={`Fuente: ${label}`}>
      {label}
    </span>
  )
}
