'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AssetTypeBadge, getAssetTypeLabel } from './asset-type-badge'
import { ProfitBadge } from './profit-badge'
import { cn } from '@/lib/utils'
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
  plPercent: number
  profitAmount: number
  profitPercent: number
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

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  buy: 'Compra',
  sell: 'Venta',
  dividend: 'Dividendo',
  coupon: 'Cupón',
  interest: 'Interés',
}

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
              {k === 'value' ? 'Valor' : k === 'plPercent' ? 'Ganancia' : 'Nombre'}
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
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-slate-500">
                      {fmtNumber(asset.position, 4)} u · PPC {fmtNumber(asset.ppc, 2)}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-slate-100">{fmtCurrency(asset.currentValue, currencyLabel)}</p>
                  <ProfitBadge percent={asset.plPercent} className="mt-1" />
                  {isExpanded
                    ? <ChevronUp className="h-3.5 w-3.5 text-slate-500 mx-auto mt-1" />
                    : <ChevronDown className="h-3.5 w-3.5 text-slate-500 mx-auto mt-1" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 border-t border-slate-800/60 pt-2">
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
                  {onDeleteAsset && (
                    <button
                      onClick={() => onDeleteAsset(asset.id)}
                      className="mt-3 text-[10px] text-rose-500/70 hover:text-rose-400 transition-colors"
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
              <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400">
                <button onClick={() => toggleSort('name')} className="flex items-center gap-1 ml-auto">
                  Posición <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400">PPC</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400">Precio</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">
                <button onClick={() => toggleSort('value')} className="flex items-center gap-1 ml-auto">
                  Valor <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">
                <button onClick={() => toggleSort('plPercent')} className="flex items-center gap-1 ml-auto">
                  Ganancia <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((asset) => {
              const isExpanded = expandedId === asset.id
              const assetTxs = transactions.filter((t) => t.asset_id === asset.id)
              return (
                <>
                  <tr
                    key={asset.id}
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
                      {fmtNumber(asset.position, 4)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-400 font-mono text-xs">
                      {fmtNumber(asset.ppc, 2)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-400 font-mono text-xs">
                      {fmtNumber(asset.currentPrice, 2)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-100 font-mono text-xs">
                      {fmtCurrency(asset.currentValue, currencyLabel)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ProfitBadge percent={asset.plPercent} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${asset.id}-expand`} className="bg-slate-900/40">
                      <td colSpan={6} className="px-6 py-3">
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
                        {onDeleteAsset && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onDeleteAsset(asset.id) }}
                            className="mt-3 text-[10px] text-rose-500/70 hover:text-rose-400 transition-colors"
                          >
                            Dar de baja activo
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
