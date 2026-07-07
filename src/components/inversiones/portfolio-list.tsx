'use client'

import { Fragment, useState } from 'react'
import { ChevronDown, ChevronUp, ArrowUpDown, Trash2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AssetTypeBadge, getAssetTypeLabel } from './asset-type-badge'
import { PriceSourceBadge } from './price-source-badge'
import { cn, formatRelativeTime, isStale } from '@/lib/utils'
import { ASSET_TYPES } from '@/lib/schemas/investment-asset'
import type { InvestmentTransaction } from '@/types/database'

type SortKey = 'value' | 'plPercent' | 'name'

interface AssetRow {
  id: string
  ticker: string
  name: string
  asset_type: string
  currency: string | null
  position: number
  ppc: number
  currentPrice: number
  currentValue: number
  investedValue: number
  unrealizedPL: number
  realizedPL: number
  totalPL: number
  plPercent: number
  lastUpdate: string | null
  source: string | null
  metadata: Record<string, unknown> | null
}

interface PortfolioListProps {
  assets: AssetRow[]
  transactions: InvestmentTransaction[]
  displayCurrency: string
  onDeleteAsset?: (assetId: string) => void
}

const fmtNumber = (n: number, maximumFractionDigits = 2) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits }).format(n)

const fmtCurrency = (n: number, currency = 'ARS') =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: ['ARS', 'USD'].includes(currency) ? currency : 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)

const fmtSignedCurrency = (n: number, currency = 'ARS') => {
  const sign = n > 0 ? '+' : ''
  return sign + fmtCurrency(n, currency)
}

const fmtSignedPercent = (n: number) => {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

const isFixedTermAsset = (assetType: string) =>
  assetType === 'plazo_fijo' || assetType === 'money_market'

const tnaLabel = (metadata: Record<string, unknown> | null): string => {
  if (!metadata) return '—'
  const tna = typeof metadata.tna === 'number' ? metadata.tna : null
  if (tna === null) return '—'
  return `TNA ${(tna * 100).toFixed(2)}%`
}

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  buy: 'Compra',
  sell: 'Venta',
  dividend: 'Dividendo',
  coupon: 'Cupón',
  interest: 'Interés',
}

const plColor = (n: number) =>
  n > 0 ? 'text-good' : n < 0 ? 'text-bad' : 'text-muted'

export function PortfolioList({ assets, transactions, displayCurrency, onDeleteAsset }: PortfolioListProps) {
  const [filterType, setFilterType] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortAsc, setSortAsc] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; ticker: string } | null>(null)

  const filtered = assets.filter((a) => filterType === 'all' || a.asset_type === filterType)

  const sorted = [...filtered].sort((a, b) => {
    let diff = 0
    if (sortKey === 'value') diff = a.currentValue - b.currentValue
    else if (sortKey === 'plPercent') diff = a.plPercent - b.plPercent
    else diff = a.name.localeCompare(b.name)
    return sortAsc ? diff : -diff
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  const currencyLabel = ['ARS'].includes(displayCurrency) ? 'ARS' : 'USD'

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger
            aria-label="Filtrar por tipo de activo"
            className="w-44 bg-surface-2 border-[1.5px] border-border text-text text-xs h-11"
          >
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent className="bg-surface border-border">
            <SelectItem value="all" className="focus:bg-surface-2 text-xs">Todos los tipos</SelectItem>
            {ASSET_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="focus:bg-surface-2 text-xs">
                {getAssetTypeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-wrap gap-1">
          {(['value', 'plPercent', 'name'] as SortKey[]).map((k) => {
            const activeSort = sortKey === k
            const label = k === 'value' ? 'Valor' : k === 'plPercent' ? 'Variación' : 'Nombre'
            return (
              <button
                key={k}
                onClick={() => toggleSort(k)}
                aria-pressed={activeSort}
                aria-label={`Ordenar por ${label}${activeSort ? (sortAsc ? ', ascendente' : ', descendente') : ''}`}
                className={cn(
                  'flex items-center gap-1 min-h-11 px-3 rounded-md text-xs font-medium transition-colors border-[1.5px] cursor-pointer touch-manipulation',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                  activeSort
                    ? 'bg-accent/15 text-accent-deep border-accent/30'
                    : 'text-muted border-border hover:text-text'
                )}
              >
                {label}
                {activeSort
                  ? sortAsc
                    ? <ChevronUp className="h-3 w-3" />
                    : <ChevronDown className="h-3 w-3" />
                  : <ArrowUpDown className="h-3 w-3 opacity-60" />}
              </button>
            )
          })}
        </div>
      </div>

      {sorted.length === 0 && (
        <div className="rounded-xl border-[1.5px] border-dashed border-border py-12 text-center text-sm text-muted">
          Sin activos para mostrar
        </div>
      )}

      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {sorted.map((asset) => {
          const isExpanded = expandedId === asset.id
          const assetTxs = transactions.filter((t) => t.asset_id === asset.id)
          const fixedTerm = isFixedTermAsset(asset.asset_type)
          const stale = !fixedTerm && isStale(asset.lastUpdate)
          return (
            <div key={asset.id} className="rounded-xl border-[1.5px] border-border bg-surface overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : asset.id)}
                className="w-full p-3 text-left flex items-start justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-text text-sm">{asset.ticker}</span>
                    <AssetTypeBadge assetType={asset.asset_type} />
                  </div>
                  <p className="text-xs text-muted truncate">{asset.name}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-muted tnum">
                      {fixedTerm
                        ? `Monto ${fmtCurrency(asset.position, currencyLabel)}`
                        : `${fmtNumber(asset.position, 4)} u`}
                    </span>
                    {!fixedTerm && (
                      <>
                        <span className="text-[10px] text-faint">·</span>
                        <span className="text-[10px] text-muted">
                          {formatRelativeTime(asset.lastUpdate)}
                        </span>
                        <PriceSourceBadge source={asset.source} />
                      </>
                    )}
                    {fixedTerm && (
                      <>
                        <span className="text-[10px] text-faint">·</span>
                        <span className="text-[10px] text-accent font-medium">{tnaLabel(asset.metadata)}</span>
                      </>
                    )}
                    {stale && (
                      <span className="text-[9px] font-medium text-bad uppercase tracking-wide">
                        Desactualizado
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-text tnum">
                    {fmtCurrency(asset.currentValue, currencyLabel)}
                  </p>
                  <p className={cn('text-xs tnum', plColor(asset.unrealizedPL))}>
                    {fmtSignedCurrency(asset.unrealizedPL, currencyLabel)}
                  </p>
                  <p className={cn('text-[11px] font-semibold tnum', plColor(asset.plPercent))}>
                    {fmtSignedPercent(asset.plPercent)}
                  </p>
                  {isExpanded
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted mx-auto mt-1" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted mx-auto mt-1" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 border-t border-border pt-3 space-y-3 bg-surface-2">
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="min-w-0">
                      <p className="text-muted uppercase font-bold">PPC</p>
                      <p className="text-text tnum break-words">{fmtNumber(asset.ppc, 2)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted uppercase font-bold">V. Inicial</p>
                      <p className="text-text tnum break-words">{fmtCurrency(asset.investedValue, currencyLabel)}</p>
                    </div>
                    {asset.realizedPL !== 0 && (
                      <div className="min-w-0">
                        <p className="text-muted uppercase font-bold">Realizado</p>
                        <p className={cn('tnum break-words', plColor(asset.realizedPL))}>
                          {fmtSignedCurrency(asset.realizedPL, currencyLabel)}
                        </p>
                      </div>
                    )}
                    {asset.realizedPL !== 0 && (
                      <div className="min-w-0">
                        <p className="text-muted uppercase font-bold">Total P/L</p>
                        <p className={cn('tnum break-words', plColor(asset.totalPL))}>
                          {fmtSignedCurrency(asset.totalPL, currencyLabel)}
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] uppercase text-muted font-bold mb-2">Transacciones</p>
                    {assetTxs.length === 0 ? (
                      <p className="text-xs text-faint">Sin transacciones registradas</p>
                    ) : (
                      <div className="space-y-1.5">
                        {assetTxs.map((tx) => (
                          <div key={tx.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                'px-1.5 py-0.5 rounded text-[10px] font-medium',
                                tx.type === 'buy' ? 'bg-good/10 text-good' :
                                tx.type === 'sell' ? 'bg-bad/10 text-bad' :
                                'bg-accent/10 text-accent-deep'
                              )}>
                                {TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
                              </span>
                              <span className="text-muted">{tx.date}</span>
                            </div>
                            <div className="text-right tnum">
                              <span className="text-text">{fmtNumber(tx.quantity, 4)} u</span>
                              <span className="text-muted ml-2">@ {fmtNumber(tx.price_per_unit, 2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {onDeleteAsset && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ id: asset.id, ticker: asset.ticker })}
                      className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg border-[1.5px] border-bad/30 text-bad text-xs font-medium hover:bg-bad/10 transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Dar de baja activo
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Desktop: tabla */}
      <div className="hidden md:block rounded-xl border-[1.5px] border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="text-left px-4 py-2.5 text-xs font-bold text-muted">Activo</th>
              <th className="text-right px-3 py-2.5 text-xs font-bold text-muted">Nominales</th>
              <th className="text-right px-3 py-2.5 text-xs font-bold text-muted">V. Inicial</th>
              <th className="text-right px-3 py-2.5 text-xs font-bold text-muted">Precio</th>
              <th className="text-right px-4 py-2.5 text-xs font-bold text-muted">
                <button onClick={() => toggleSort('value')} className="flex items-center gap-1 ml-auto hover:text-text transition-colors">
                  V. Actual <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="text-right px-3 py-2.5 text-xs font-bold text-muted">Rendimiento</th>
              <th className="text-right px-4 py-2.5 text-xs font-bold text-muted">
                <button onClick={() => toggleSort('plPercent')} className="flex items-center gap-1 ml-auto hover:text-text transition-colors">
                  Variación (%) <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((asset) => {
              const isExpanded = expandedId === asset.id
              const assetTxs = transactions.filter((t) => t.asset_id === asset.id)
              const fixedTerm = isFixedTermAsset(asset.asset_type)
              const stale = !fixedTerm && isStale(asset.lastUpdate)
              return (
                <Fragment key={asset.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : asset.id)}
                    className="border-b border-border hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text">{asset.ticker}</span>
                        <AssetTypeBadge assetType={asset.asset_type} />
                      </div>
                      <p className="text-xs text-muted mt-0.5">{asset.name}</p>
                    </td>
                    <td className="px-3 py-3 text-right text-text tnum text-xs">
                      {fixedTerm
                        ? fmtCurrency(asset.position, currencyLabel)
                        : fmtNumber(asset.position, 4)}
                    </td>
                    <td className="px-3 py-3 text-right text-text tnum text-xs">
                      {fmtCurrency(asset.investedValue, currencyLabel)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {fixedTerm ? (
                        <span className="text-[11px] text-accent font-medium">
                          {tnaLabel(asset.metadata)}
                        </span>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-muted tnum text-xs">
                            {fmtNumber(asset.currentPrice, 2)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <PriceSourceBadge source={asset.source} />
                            <span className="text-[9px] text-faint">
                              {formatRelativeTime(asset.lastUpdate)}
                            </span>
                          </div>
                          {stale && (
                            <span className="text-[9px] font-medium text-bad uppercase tracking-wide">
                              Desactualizado
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-text tnum text-xs">
                      {fmtCurrency(asset.currentValue, currencyLabel)}
                    </td>
                    <td className={cn('px-3 py-3 text-right tnum text-xs', plColor(asset.unrealizedPL))}>
                      {fmtSignedCurrency(asset.unrealizedPL, currencyLabel)}
                    </td>
                    <td className={cn('px-4 py-3 text-right tnum text-xs font-semibold', plColor(asset.plPercent))}>
                      {fmtSignedPercent(asset.plPercent)}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-surface-2">
                      <td colSpan={7} className="px-6 py-3 space-y-3">
                        <div className="grid grid-cols-4 gap-3 text-[11px]">
                          <div>
                            <p className="text-muted uppercase text-[10px] font-bold">PPC</p>
                            <p className="text-text tnum">{fmtNumber(asset.ppc, 2)}</p>
                          </div>
                          <div>
                            <p className="text-muted uppercase text-[10px] font-bold">V. Inicial</p>
                            <p className="text-text tnum">{fmtCurrency(asset.investedValue, currencyLabel)}</p>
                          </div>
                          <div>
                            <p className="text-muted uppercase text-[10px] font-bold">Realizado</p>
                            <p className={cn('tnum', plColor(asset.realizedPL))}>
                              {fmtSignedCurrency(asset.realizedPL, currencyLabel)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted uppercase text-[10px] font-bold">Total P/L</p>
                            <p className={cn('tnum', plColor(asset.totalPL))}>
                              {fmtSignedCurrency(asset.totalPL, currencyLabel)}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-muted font-bold mb-2">Transacciones</p>
                          {assetTxs.length === 0 ? (
                            <p className="text-xs text-faint">Sin transacciones registradas</p>
                          ) : (
                            <div className="space-y-1.5">
                              {assetTxs.map((tx) => (
                                <div key={tx.id} className="flex items-center gap-4 text-xs">
                                  <span className={cn(
                                    'px-1.5 py-0.5 rounded text-[10px] font-medium w-16 text-center',
                                    tx.type === 'buy' ? 'bg-good/10 text-good' :
                                    tx.type === 'sell' ? 'bg-bad/10 text-bad' :
                                    'bg-accent/10 text-accent-deep'
                                  )}>
                                    {TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
                                  </span>
                                  <span className="text-muted w-24">{tx.date}</span>
                                  <span className="text-text tnum">{fmtNumber(tx.quantity, 4)} u</span>
                                  <span className="text-muted tnum">@ {fmtNumber(tx.price_per_unit, 2)}</span>
                                  {tx.fees > 0 && <span className="text-faint tnum">comisión: {fmtNumber(tx.fees, 2)}</span>}
                                  {tx.notes && <span className="text-faint italic truncate max-w-xs">{tx.notes}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {onDeleteAsset && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: asset.id, ticker: asset.ticker }) }}
                            className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg border-[1.5px] border-bad/30 text-bad text-xs font-medium hover:bg-bad/10 transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Dar de baja activo
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="bg-surface border-border text-text">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Dar de baja {deleteTarget?.ticker}?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted">
              La posición dejará de aparecer en tu portfolio. El historial de transacciones se conserva y podés volver a cargarla más adelante.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-transparent text-text hover:bg-surface-2 hover:text-text">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) onDeleteAsset?.(deleteTarget.id)
                setDeleteTarget(null)
              }}
              className="bg-bad hover:bg-[color:var(--btn-destructive-border)] text-accent-ink"
            >
              Dar de baja
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
