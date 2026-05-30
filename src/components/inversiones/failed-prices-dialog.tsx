'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AssetTypeBadge } from './asset-type-badge'
import { useFinanceStore } from '@/lib/store/financeStore'

interface FailedAssetInfo {
  ticker: string
  name: string
  asset_type: string
  currency: string | null
  data_source_url?: string | null
}

interface FailedPricesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  failedTickers: string[]
  assets: FailedAssetInfo[]
  onRetried?: (result: { updated: number; failed: string[] }) => void
}

export function FailedPricesDialog({
  open,
  onOpenChange,
  failedTickers,
  assets,
  onRetried,
}: FailedPricesDialogProps) {
  const [isRetrying, setIsRetrying] = useState(false)
  const { fetchAllData } = useFinanceStore()

  const failedAssets = failedTickers
    .map((ticker) => assets.find((a) => a.ticker === ticker))
    .filter((a): a is FailedAssetInfo => Boolean(a))

  const handleRetryAll = async () => {
    setIsRetrying(true)
    try {
      const res = await fetch('/api/investments/update-prices', { method: 'POST' })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
        return
      }
      const stillFailed: string[] = json.failed ?? []
      const updated: number = json.updated ?? 0
      onRetried?.({ updated, failed: stillFailed })
      await fetchAllData()
      if (stillFailed.length === 0) {
        toast.success('Todos los precios se actualizaron')
        onOpenChange(false)
      } else {
        toast.warning(`${updated} OK · ${stillFailed.length} siguen fallando`)
      }
    } catch {
      toast.error('Error al reintentar')
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-slate-800 text-slate-200 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Activos sin precio actualizable
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Posibles causas: ticker mal escrito, mercado cerrado, o la fuente está caída.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto -mx-2 px-2">
          {failedAssets.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">Sin activos para mostrar.</p>
          ) : (
            <ul className="space-y-2">
              {failedAssets.map((asset) => {
                const isCrypto = asset.asset_type === 'crypto' || asset.asset_type === 'stablecoin'
                const isIolType = ['bond', 'on', 'bopreal', 'lecap', 'boncap', 'fci'].includes(
                  asset.asset_type,
                )
                return (
                  <li
                    key={asset.ticker}
                    className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-slate-100 text-sm">{asset.ticker}</span>
                      <AssetTypeBadge assetType={asset.asset_type} />
                      {asset.currency && (
                        <span className="text-[10px] text-slate-500">{asset.currency}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">{asset.name}</p>
                    {isCrypto ? (
                      <p className="text-[10px] text-amber-500/70 mt-1">
                        Para criptos menos comunes, usá el coin ID exacto de CoinGecko
                        (ej. <span className="font-mono">bitcoin</span>,{' '}
                        <span className="font-mono">solana</span>) en vez del ticker.
                      </p>
                    ) : isIolType ? (
                      asset.data_source_url ? (
                        <p className="text-[10px] text-slate-600 mt-1 truncate font-mono">
                          Fuente: {asset.data_source_url}
                        </p>
                      ) : (
                        <p className="text-[10px] text-amber-500/70 mt-1">
                          Sin URL fuente configurada. Podés pegar el link de IOL del activo.
                        </p>
                      )
                    ) : (
                      <p className="text-[10px] text-slate-600 mt-1">
                        Verificá que el ticker esté bien escrito.
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cerrar
          </Button>
          <Button
            onClick={handleRetryAll}
            disabled={isRetrying || failedAssets.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isRetrying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Reintentando…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reintentar todos
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
