'use client'

const SOURCE_LABELS: Record<string, { label: string; className: string }> = {
  yahoo:      { label: 'Yahoo',     className: 'text-accent' },
  yahoo_us:   { label: 'Yahoo US',  className: 'text-accent' },
  iol:        { label: 'IOL',       className: 'text-warn' },
  coingecko:  { label: 'CoinGecko', className: 'text-good' },
}

interface PriceSourceBadgeProps {
  source: string | null
}

export function PriceSourceBadge({ source }: PriceSourceBadgeProps) {
  if (!source) return null
  const config = SOURCE_LABELS[source] ?? { label: source, className: 'text-muted' }
  return (
    <span className={`text-[9px] font-medium ${config.className}`} title={`Fuente: ${config.label}`}>
      {config.label}
    </span>
  )
}
