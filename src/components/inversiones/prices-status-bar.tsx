'use client'

import { Clock, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn, formatRelativeTime, isStale } from '@/lib/utils'

/** Etiquetas legibles de las pairs de `failedRates`. */
const RATE_LABELS: Record<string, string> = {
  USD_ARS_BLUE: 'blue',
  USD_ARS_MEP: 'MEP',
  USD_ARS_CCL: 'CCL',
  USDT_ARS: 'USDT',
}

interface PricesStatusBarProps {
  lastUpdate: string | null
  isRefreshing: boolean
  lastResult: {
    updated: number
    failed: string[]
    /** Cotizaciones que no se pudieron actualizar (pairs de `exchange_rates`). */
    failedRates: string[]
    timestamp: string
  } | null
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
  const failedRates = lastResult?.failedRates ?? []

  // Pasadas 24 h los precios dejan de ser confiables y el estado tiene que
  // notarse: antes "hace 3 días" se veía idéntico a "hace 2 minutos".
  const stale = isStale(lastUpdate)
  const needsAttention = !lastUpdate || stale

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border-[1.5px] border-border bg-surface px-3 py-2">
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs min-w-0',
          needsAttention ? 'text-warn font-medium' : 'text-muted',
        )}
      >
        {needsAttention ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Clock className="h-3.5 w-3.5 shrink-0 text-faint" />
        )}
        <span className="truncate">
          {!lastUpdate
            ? 'Sin precios cargados'
            : stale
              ? `Precios de ${formatRelativeTime(lastUpdate)}`
              : `Actualizado ${formatRelativeTime(lastUpdate)}`}
        </span>
      </div>

      {lastResult && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {lastResult.updated > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-good/10 px-2 py-0.5 text-[10px] font-medium text-good">
              <CheckCircle2 className="h-3 w-3" />
              {lastResult.updated} OK
            </span>
          )}
          {hasFailed && (
            <button
              onClick={onOpenFailed}
              className="inline-flex items-center gap-1 rounded-md bg-warn/10 px-2.5 min-h-11 text-[11px] font-medium text-warn hover:bg-warn/20 transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {lastResult.failed.length} {lastResult.failed.length === 1 ? 'falló' : 'fallaron'} · Ver
            </button>
          )}
          {failedRates.length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-warn/10 px-2 py-0.5 text-[10px] font-medium text-warn"
              title="No se pudieron actualizar estas cotizaciones; se sigue usando el último valor guardado."
            >
              <AlertTriangle className="h-3 w-3" />
              sin {failedRates.map((p) => RATE_LABELS[p] ?? p).join(', ')}
            </span>
          )}
        </div>
      )}

      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        aria-label="Actualizar precios de los activos"
        className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-surface-2 border-[1.5px] border-border px-3 min-h-11 text-xs font-medium text-muted hover:text-text transition-all disabled:opacity-50 cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
        {isRefreshing ? 'Actualizando…' : 'Actualizar'}
      </button>
    </div>
  )
}
