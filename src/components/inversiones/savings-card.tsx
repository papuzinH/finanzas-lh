'use client'

import { useState, useTransition } from 'react'
import { PiggyBank, Plus, Trash2, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { createSaving, deleteSaving } from '@/app/inversiones/actions'
import { useFinanceStore } from '@/lib/store/financeStore'
import { useRouter } from 'next/navigation'
import type { Saving } from '@/types/database'

const formatCurrency = (amount: number, currency: 'ARS' | 'USD' = 'ARS') => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function SavingsCard() {
  const { savings, dolarBlue, fetchAllData } = useFinanceStore()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS')

  const totalARS = savings
    .filter(s => s.currency === 'ARS')
    .reduce((acc, s) => acc + Number(s.amount), 0)

  const totalUSD = savings
    .filter(s => s.currency === 'USD')
    .reduce((acc, s) => acc + Number(s.amount), 0)

  const totalInARS = totalARS + (dolarBlue ? totalUSD * dolarBlue.venta : 0)

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      toast.error('Ingresa un monto valido')
      return
    }

    startTransition(async () => {
      const result = await createSaving({ amount: numAmount, currency })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Se sumaron ${formatCurrency(numAmount, currency)} a tu ahorro`)
        setAmount('')
        setCurrency('ARS')
        setOpen(false)
        await fetchAllData()
        router.refresh()
      }
    })
  }

  const handleDelete = (saving: Saving) => {
    startTransition(async () => {
      const result = await deleteSaving(saving.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Registro eliminado')
        await fetchAllData()
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 md:p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-3 opacity-10">
        <PiggyBank className="w-12 md:w-16 h-12 md:h-16 text-amber-500" />
      </div>

      <p className="text-[10px] md:text-xs font-medium text-amber-300 uppercase tracking-wider mb-1">Dinero Ahorrado</p>
      <p className="text-xl md:text-3xl font-bold text-white font-mono tracking-tight">
        {formatCurrency(totalInARS)}
      </p>

      {/* Breakdown */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-400">
        {totalARS > 0 && <span>{formatCurrency(totalARS)} ARS</span>}
        {totalUSD > 0 && <span>{formatCurrency(totalUSD, 'USD')} USD</span>}
        {dolarBlue && (
          <span className="text-amber-400/70">
            Blue: ${dolarBlue.venta.toLocaleString('es-AR')}
          </span>
        )}
      </div>

      {/* History */}
      {savings.length > 0 && (
        <div className="mt-4 max-h-32 overflow-y-auto space-y-1.5 pr-1">
          {savings.map(s => (
            <div key={s.id} className="flex items-center justify-between text-xs bg-slate-900/50 rounded-lg px-3 py-1.5 group">
              <div className="flex items-center gap-2">
                <DollarSign className="w-3 h-3 text-amber-500/50" />
                <span className="text-slate-300 font-mono">
                  {formatCurrency(Number(s.amount), s.currency)}
                </span>
                <span className="text-slate-600">
                  {new Date(s.date).toLocaleDateString('es-AR')}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => handleDelete(s)}
                className="h-5 w-5 p-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-opacity"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add Button */}
      <div className="flex items-center gap-2 mt-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-7 px-3"
            >
              <Plus className="w-3 h-3 mr-1" />
              Sumar ahorro
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[400px] bg-slate-950 border-slate-800 text-slate-50">
            <form onSubmit={handleAdd}>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-amber-300">
                  Sumar al ahorro
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  Ingresa el monto que quieres sumar a tu ahorro.
                </DialogDescription>
              </DialogHeader>
              <div className="py-6 space-y-4">
                <div>
                  <Label className="text-slate-300 mb-2 block">Monto</Label>
                  <Input
                    type="number"
                    step="any"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="10000"
                    className="bg-slate-900 border-slate-800 focus:border-amber-500/50 text-lg font-mono"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <Label className="text-slate-300 mb-2 block">Moneda</Label>
                  <Select value={currency} onValueChange={v => setCurrency(v as 'ARS' | 'USD')}>
                    <SelectTrigger className="bg-slate-900 border-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800">
                      <SelectItem value="ARS" className="focus:bg-slate-800">ARS</SelectItem>
                      <SelectItem value="USD" className="focus:bg-slate-800">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {isPending ? 'Guardando...' : 'Sumar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
