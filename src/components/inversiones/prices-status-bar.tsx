'use client'

import { Clock, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'

interface PricesStatusBarProps {
  lastUpdate: string | null
  isRefreshing: boolean
  lastResult: { updated: number; failed: string[]; timestamp: string } | null
  onRefresh: () => void
  onOpenFailed: () => void
}

export function PricesStatusBar({
  lastUpdate,
  isRefreshing,
  lastResult,
  onRefresh,
  onOpenFailed,
}: PricesStatusBarProps) {
  const hasFailed = (lastResult?.failed.length ?? 0) > 0

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 min-w-0">
        <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span className="truncate">
          {lastUpdate ? `Actualizado ${formatRelativeTime(lastUpdate)}` : 'Sin precios cargados'}
        </span>
      </div>

      {lastResult && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {lastResult.updated > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              {lastResult.updated} OK
            </span>
          )}
          {hasFailed && (
            <button
              onClick={onOpenFailed}
              className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              <AlertTriangle className="h-3 w-3" />
              {lastResult.failed.length} {lastResult.failed.length === 1 ? 'falló' : 'fallaron'} · Ver
            </button>
          )}
        </div>
      )}

      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 transition-all disabled:opacity-50"
      >
        <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
        {isRefreshing ? 'Actualizando…' : 'Actualizar'}
      </button>
    </div>
  )
}
