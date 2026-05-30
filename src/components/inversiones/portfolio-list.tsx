'use client'

import { Fragment, useState } from 'react'
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  n > 0 ? 'text-emerald-400' : n < 0 ? 'text-rose-400' : 'text-slate-400'

export function PortfolioList({ assets, transactions, displayCurrency, onDeleteAsset }: PortfolioListProps) {
  const [filterType, setFilterType] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortAsc, setSortAsc] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
          <SelectTrigger className="w-44 bg-slate-900/60 border-slate-800 text-slate-300 text-xs h-8">
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent className="bg-surface-overlay border-slate-800">
            <SelectItem value="all" className="focus:bg-slate-800 text-xs">Todos los tipos</SelectItem>
            {ASSET_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="focus:bg-slate-800 text-xs">
                {getAssetTypeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          {(['value', 'plPercent', 'name'] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => toggleSort(k)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all',
                sortKey === k
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-500 hover:text-slate-300 border border-slate-800'
              )}
            >
              {k === 'value' ? 'Valor' : k === 'plPercent' ? 'Variación' : 'Nombre'}
              <ArrowUpDown className="h-2.5 w-2.5" />
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center text-sm text-slate-500">
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
            <div key={asset.id} className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : asset.id)}
                className="w-full p-3 text-left flex items-start justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-100 text-sm">{asset.ticker}</span>
                    <AssetTypeBadge assetType={asset.asset_type} />
                  </div>
                  <p className="text-xs text-slate-400 truncate">{asset.name}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-500">
                      {fixedTerm
                        ? `Monto ${fmtCurrency(asset.position, currencyLabel)}`
                        : `${fmtNumber(asset.position, 4)} u`}
                    </span>
                    {!fixedTerm && (
                      <>
                        <span className="text-[10px] text-slate-600">·</span>
                        <span className="text-[10px] text-slate-500">
                          {formatRelativeTime(asset.lastUpdate)}
                        </span>
                        <PriceSourceBadge source={asset.source} />
                      </>
                    )}
                    {fixedTerm && (
                      <>
                        <span className="text-[10px] text-slate-600">·</span>
                        <span className="text-[10px] text-indigo-300">{tnaLabel(asset.metadata)}</span>
                      </>
                    )}
                    {stale && (
                      <span className="text-[9px] font-medium text-rose-400 uppercase tracking-wide">
                        Desactualizado
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-slate-100 font-mono">
                    {fmtCurrency(asset.currentValue, currencyLabel)}
                  </p>
                  <p className={cn('text-xs font-mono', plColor(asset.unrealizedPL))}>
                    {fmtSignedCurrency(asset.unrealizedPL, currencyLabel)}
                  </p>
                  <p className={cn('text-[11px] font-semibold', plColor(asset.plPercent))}>
                    {fmtSignedPercent(asset.plPercent)}
                  </p>
                  {isExpanded
                    ? <ChevronUp className="h-3.5 w-3.5 text-slate-500 mx-auto mt-1" />
                    : <ChevronDown className="h-3.5 w-3.5 text-slate-500 mx-auto mt-1" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 border-t border-slate-800/60 pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <p className="text-slate-500 uppercase">PPC</p>
                      <p className="text-slate-200 font-mono">{fmtNumber(asset.ppc, 2)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 uppercase">V. Inicial</p>
                      <p className="text-slate-200 font-mono">{fmtCurrency(asset.investedValue, currencyLabel)}</p>
                    </div>
                    {asset.realizedPL !== 0 && (
                      <div>
                        <p className="text-slate-500 uppercase">Realizado</p>
                        <p className={cn('font-mono', plColor(asset.realizedPL))}>
                          {fmtSignedCurrency(asset.realizedPL, currencyLabel)}
                        </p>
                      </div>
                    )}
                    {asset.realizedPL !== 0 && (
                      <div>
                        <p className="text-slate-500 uppercase">Total P/L</p>
                        <p className={cn('font-mono', plColor(asset.totalPL))}>
                          {fmtSignedCurrency(asset.totalPL, currencyLabel)}
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] uppercase text-slate-500 font-medium mb-2">Transacciones</p>
                    {assetTxs.length === 0 ? (
                      <p className="text-xs text-slate-600">Sin transacciones registradas</p>
                    ) : (
                      <div className="space-y-1.5">
                        {assetTxs.map((tx) => (
                          <div key={tx.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                'px-1.5 py-0.5 rounded text-[10px] font-medium',
                                tx.type === 'buy' ? 'bg-emerald-500/15 text-emerald-400' :
                                tx.type === 'sell' ? 'bg-rose-500/15 text-rose-400' :
                                'bg-indigo-500/15 text-indigo-400'
                              )}>
                                {TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
                              </span>
                              <span className="text-slate-500">{tx.date}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-300">{fmtNumber(tx.quantity, 4)} u</span>
                              <span className="text-slate-500 ml-2">@ {fmtNumber(tx.price_per_unit, 2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {onDeleteAsset && (
                    <button
                      onClick={() => onDeleteAsset(asset.id)}
                      className="text-[10px] text-rose-500/70 hover:text-rose-400 transition-colors"
                    >
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
      <div className="hidden md:block rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400">Activo</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400">Nominales</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400">V. Inicial</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400">Precio</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">
                <button onClick={() => toggleSort('value')} className="flex items-center gap-1 ml-auto">
                  V. Actual <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400">Rendimiento</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">
                <button onClick={() => toggleSort('plPercent')} className="flex items-center gap-1 ml-auto">
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
                    className="border-b border-slate-800/60 hover:bg-slate-800/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-100">{asset.ticker}</span>
                        <AssetTypeBadge assetType={asset.asset_type} />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{asset.name}</p>
                    </td>
                    <td className="px-3 py-3 text-right text-slate-300 font-mono text-xs">
                      {fixedTerm
                        ? fmtCurrency(asset.position, currencyLabel)
                        : fmtNumber(asset.position, 4)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-300 font-mono text-xs">
                      {fmtCurrency(asset.investedValue, currencyLabel)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {fixedTerm ? (
                        <span className="text-[11px] text-indigo-300 font-medium">
                          {tnaLabel(asset.metadata)}
                        </span>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-slate-400 font-mono text-xs">
                            {fmtNumber(asset.currentPrice, 2)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <PriceSourceBadge source={asset.source} />
                            <span className="text-[9px] text-slate-600">
                              {formatRelativeTime(asset.lastUpdate)}
                            </span>
                          </div>
                          {stale && (
                            <span className="text-[9px] font-medium text-rose-400 uppercase tracking-wide">
                              Desactualizado
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-100 font-mono text-xs">
                      {fmtCurrency(asset.currentValue, currencyLabel)}
                    </td>
                    <td className={cn('px-3 py-3 text-right font-mono text-xs', plColor(asset.unrealizedPL))}>
                      {fmtSignedCurrency(asset.unrealizedPL, currencyLabel)}
                    </td>
                    <td className={cn('px-4 py-3 text-right font-mono text-xs font-semibold', plColor(asset.plPercent))}>
                      {fmtSignedPercent(asset.plPercent)}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-slate-900/40">
                      <td colSpan={7} className="px-6 py-3 space-y-3">
                        <div className="grid grid-cols-4 gap-3 text-[11px]">
                          <div>
                            <p className="text-slate-500 uppercase text-[10px]">PPC</p>
                            <p className="text-slate-200 font-mono">{fmtNumber(asset.ppc, 2)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 uppercase text-[10px]">V. Inicial</p>
                            <p className="text-slate-200 font-mono">{fmtCurrency(asset.investedValue, currencyLabel)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 uppercase text-[10px]">Realizado</p>
                            <p className={cn('font-mono', plColor(asset.realizedPL))}>
                              {fmtSignedCurrency(asset.realizedPL, currencyLabel)}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 uppercase text-[10px]">Total P/L</p>
                            <p className={cn('font-mono', plColor(asset.totalPL))}>
                              {fmtSignedCurrency(asset.totalPL, currencyLabel)}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-slate-500 font-medium mb-2">Transacciones</p>
                          {assetTxs.length === 0 ? (
                            <p className="text-xs text-slate-600">Sin transacciones registradas</p>
                          ) : (
                            <div className="space-y-1.5">
                              {assetTxs.map((tx) => (
                                <div key={tx.id} className="flex items-center gap-4 text-xs">
                                  <span className={cn(
                                    'px-1.5 py-0.5 rounded text-[10px] font-medium w-16 text-center',
                                    tx.type === 'buy' ? 'bg-emerald-500/15 text-emerald-400' :
                                    tx.type === 'sell' ? 'bg-rose-500/15 text-rose-400' :
                                    'bg-indigo-500/15 text-indigo-400'
                                  )}>
                                    {TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
                                  </span>
                                  <span className="text-slate-500 w-24">{tx.date}</span>
                                  <span className="text-slate-300">{fmtNumber(tx.quantity, 4)} u</span>
                                  <span className="text-slate-500">@ {fmtNumber(tx.price_per_unit, 2)}</span>
                                  {tx.fees > 0 && <span className="text-slate-600">comisión: {fmtNumber(tx.fees, 2)}</span>}
                                  {tx.notes && <span className="text-slate-600 italic truncate max-w-xs">{tx.notes}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {onDeleteAsset && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onDeleteAsset(asset.id) }}
                            className="text-[10px] text-rose-500/70 hover:text-rose-400 transition-colors"
                          >
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
    </div>
  )
}
