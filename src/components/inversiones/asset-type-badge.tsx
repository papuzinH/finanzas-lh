import { cn } from '@/lib/utils'

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  stock:        { label: 'Acción',       className: 'bg-good/10 text-good border-good/20' },
  cedear:       { label: 'CEDEAR',       className: 'bg-accent/10 text-accent-deep border-accent/20' },
  bond:         { label: 'Bono',         className: 'bg-warn/10 text-warn border-warn/20' },
  on:           { label: 'ON',           className: 'bg-warn/10 text-warn border-warn/20' },
  bopreal:      { label: 'Bopreal',      className: 'bg-warn/10 text-warn border-warn/20' },
  lecap:        { label: 'Lecap',        className: 'bg-warn/10 text-warn border-warn/20' },
  boncap:       { label: 'Boncap',       className: 'bg-warn/10 text-warn border-warn/20' },
  plazo_fijo:   { label: 'Plazo Fijo',   className: 'bg-good/10 text-good border-good/20' },
  money_market: { label: 'Money Market', className: 'bg-good/10 text-good border-good/20' },
  crypto:       { label: 'Crypto',       className: 'bg-bad/10 text-bad border-bad/20' },
  stablecoin:   { label: 'Stablecoin',   className: 'bg-accent/10 text-accent-deep border-accent/20' },
  fci:          { label: 'FCI',          className: 'bg-accent/10 text-accent-deep border-accent/20' },
  etf:          { label: 'ETF',          className: 'bg-accent/10 text-accent-deep border-accent/20' },
}

interface AssetTypeBadgeProps {
  assetType: string
  className?: string
}

export function AssetTypeBadge({ assetType, className }: AssetTypeBadgeProps) {
  const config = TYPE_CONFIG[assetType] ?? { label: assetType, className: 'bg-surface-2 text-muted border-border' }
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border-[1.5px]',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}

export function getAssetTypeLabel(assetType: string): string {
  return TYPE_CONFIG[assetType]?.label ?? assetType
}
