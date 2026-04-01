import { cn } from '@/lib/utils'

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  stock:        { label: 'Acción',       className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  cedear:       { label: 'CEDEAR',       className: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  bond:         { label: 'Bono',         className: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
  on:           { label: 'ON',           className: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  bopreal:      { label: 'Bopreal',      className: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  lecap:        { label: 'Lecap',        className: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20' },
  boncap:       { label: 'Boncap',       className: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
  plazo_fijo:   { label: 'Plazo Fijo',   className: 'bg-green-500/15 text-green-400 border-green-500/20' },
  money_market: { label: 'Money Market', className: 'bg-teal-500/15 text-teal-400 border-teal-500/20' },
  crypto:       { label: 'Crypto',       className: 'bg-pink-500/15 text-pink-400 border-pink-500/20' },
  stablecoin:   { label: 'Stablecoin',   className: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
  fci:          { label: 'FCI',          className: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20' },
  etf:          { label: 'ETF',          className: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
}

interface AssetTypeBadgeProps {
  assetType: string
  className?: string
}

export function AssetTypeBadge({ assetType, className }: AssetTypeBadgeProps) {
  const config = TYPE_CONFIG[assetType] ?? { label: assetType, className: 'bg-slate-500/15 text-slate-400 border-slate-500/20' }
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border',
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
