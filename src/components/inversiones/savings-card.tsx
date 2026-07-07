'use client'

import { useState } from 'react'
import { PiggyBank, Plus, Trash2, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { createSaving, deleteSaving } from '@/app/inversiones/actions'
import { useFinanceStore } from '@/lib/store/financeStore'
import type { Saving } from '@/types/database'
import type { DisplayCurrency } from './currency-toggle'

interface SavingsCardProps {
  displayCurrency?: DisplayCurrency
}

const fmtMoney = (amount: number, currency: 'ARS' | 'USD' = 'ARS') =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)

const getRateFor = (
  exchangeRates: { pair: string; rate: number }[],
  pair: string,
  fallback: number,
): number => {
  const r = exchangeRates.find((e) => e.pair === pair)
  return r && r.rate > 0 ? r.rate : fallback
}

export function SavingsCard({ displayCurrency = 'ARS' }: SavingsCardProps) {
  const { savings, dolarBlue, exchangeRates, fetchAllData } = useFinanceStore()
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('USD')
  const [deleteTarget, setDeleteTarget] = useState<Saving | null>(null)

  const totalARS = savings
    .filter(s => s.currency === 'ARS')
    .reduce((acc, s) => acc + Number(s.amount), 0)

  const totalUSD = savings
    .filter(s => s.currency === 'USD')
    .reduce((acc, s) => acc + Number(s.amount), 0)

  const blueFallback = dolarBlue?.venta && dolarBlue.venta > 0 ? dolarBlue.venta : 1
  const mepRate = getRateFor(exchangeRates, 'USD_ARS_MEP', blueFallback)
  const cclRate = getRateFor(exchangeRates, 'USD_ARS_CCL', blueFallback)
  const usdtRate = getRateFor(exchangeRates, 'USDT_ARS', blueFallback)

  const totalInARS = totalARS + totalUSD * mepRate

  let totalInDisplay = totalInARS
  let displayLabel: 'ARS' | 'USD' = 'ARS'
  if (displayCurrency === 'USD_MEP') {
    totalInDisplay = totalInARS / mepRate
    displayLabel = 'USD'
  } else if (displayCurrency === 'USD_CCL') {
    totalInDisplay = totalInARS / cclRate
    displayLabel = 'USD'
  } else if (displayCurrency === 'USDT') {
    totalInDisplay = totalInARS / usdtRate
    displayLabel = 'USD'
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      toast.error('Ingresa un monto valido')
      return
    }

    setIsPending(true)
    try {
      const result = await createSaving({ amount: numAmount, currency })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Se sumaron ${fmtMoney(numAmount, currency)} a tu ahorro`)
        setAmount('')
        setOpen(false)
        await fetchAllData()
      }
    } finally {
      setIsPending(false)
    }
  }

  const handleDelete = async (saving: Saving) => {
    setIsPending(true)
    try {
      const result = await deleteSaving(saving.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Registro eliminado')
        await fetchAllData()
      }
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="rounded-xl border-[1.5px] border-border bg-surface p-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-3 opacity-5">
        <PiggyBank className="w-12 h-12 text-text" />
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
            Ahorros (sin invertir)
          </p>
          <p className="text-lg md:text-xl font-poster tnum text-text">
            {fmtMoney(totalInDisplay, displayLabel)}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-muted">
            {totalARS > 0 && <span className="tnum">{fmtMoney(totalARS, 'ARS')} ARS</span>}
            {totalUSD > 0 && <span className="tnum">{fmtMoney(totalUSD, 'USD')} USD</span>}
            {dolarBlue && (
              <span className="text-warn/80 tnum">
                Blue: ${dolarBlue.venta.toLocaleString('es-AR')}
              </span>
            )}
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="accent" className="text-xs shrink-0">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Sumar
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[400px] bg-surface border-[1.5px] border-border text-text">
            <form onSubmit={handleAdd}>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-text">
                  Sumar a tus ahorros
                </DialogTitle>
                <DialogDescription className="text-muted">
                  Registrá dólares o pesos sueltos (no invertidos) que querés trackear.
                </DialogDescription>
              </DialogHeader>
              <div className="py-6 space-y-4">
                <div>
                  <Label className="text-muted mb-2 block">Monto</Label>
                  <Input
                    type="number"
                    step="any"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="100"
                    className="bg-surface-2 border-border text-lg tnum"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <Label className="text-muted mb-2 block">Moneda</Label>
                  <Select value={currency} onValueChange={v => setCurrency(v as 'ARS' | 'USD')}>
                    <SelectTrigger className="bg-surface-2 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface border-border">
                      <SelectItem value="USD" className="focus:bg-surface-2">USD</SelectItem>
                      <SelectItem value="ARS" className="focus:bg-surface-2">ARS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="accent"
                  disabled={isPending}
                >
                  {isPending ? 'Guardando...' : 'Sumar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {savings.length > 0 && (
        <div className="mt-3 max-h-32 overflow-y-auto space-y-1 pr-1">
          {savings.map(s => (
            <div
              key={s.id}
              className="flex items-center justify-between text-xs bg-surface-2 rounded-md px-2.5 py-1.5 group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <DollarSign className="w-3 h-3 text-muted shrink-0" />
                <span className="text-text tnum shrink-0">
                  {fmtMoney(Number(s.amount), s.currency as 'ARS' | 'USD')}
                </span>
                <span className="text-muted text-[10px] truncate">
                  {new Date(s.date).toLocaleDateString('es-AR')}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={isPending}
                aria-label={`Eliminar ahorro de ${fmtMoney(Number(s.amount), s.currency as 'ARS' | 'USD')}`}
                onClick={() => setDeleteTarget(s)}
                className="min-h-11 min-w-11 shrink-0 p-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 text-bad hover:text-bad hover:bg-bad/10 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="bg-surface border-border text-text">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este ahorro?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted">
              {deleteTarget && (
                <>
                  Se quitará el registro de{' '}
                  <span className="font-bold text-text">
                    {fmtMoney(Number(deleteTarget.amount), deleteTarget.currency as 'ARS' | 'USD')}
                  </span>
                  . Esta acción no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-transparent text-text hover:bg-surface-2 hover:text-text">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget)
                setDeleteTarget(null)
              }}
              className="bg-bad hover:bg-[color:var(--btn-destructive-border)] text-accent-ink"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
