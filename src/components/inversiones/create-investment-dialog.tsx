'use client'

import { useState, useTransition } from 'react'
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
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createInvestment } from '@/app/inversiones/actions'
import { useFinanceStore } from '@/lib/store/financeStore'
import { useRouter } from 'next/navigation'
import { detectCurrencyFromTicker } from '@/lib/utils'

const INVESTMENT_TYPES = [
  { value: 'stock', label: 'Accion' },
  { value: 'cedear', label: 'CEDEAR' },
  { value: 'bond', label: 'Bono' },
  { value: 'on', label: 'Obligacion Negociable' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'fci', label: 'FCI' },
]

export function CreateInvestmentDialog() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { fetchAllData } = useFinanceStore()
  const router = useRouter()

  const [ticker, setTicker] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('')
  const [quantity, setQuantity] = useState('')
  const [avgBuyPrice, setAvgBuyPrice] = useState('')
  const [currency, setCurrency] = useState('ARS')

  // Auto-detect currency from ticker suffix
  const handleTickerChange = (value: string) => {
    const upper = value.toUpperCase()
    setTicker(upper)
    const detected = detectCurrencyFromTicker(upper)
    if (detected) {
      setCurrency(detected)
    }
  }

  // Auto-set currency when type changes to crypto
  const handleTypeChange = (value: string) => {
    setType(value)
    if (value === 'crypto') {
      setCurrency('USD')
    }
  }

  const resetForm = () => {
    setTicker('')
    setName('')
    setType('')
    setQuantity('')
    setAvgBuyPrice('')
    setCurrency('ARS')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!ticker || !name || !type || !quantity) {
      toast.error('Completa los campos obligatorios')
      return
    }

    startTransition(async () => {
      const result = await createInvestment({
        ticker: ticker.toUpperCase(),
        name,
        type: type as 'stock' | 'cedear' | 'bond' | 'on' | 'crypto' | 'fci',
        quantity: Number(quantity),
        avg_buy_price: avgBuyPrice ? Number(avgBuyPrice) : undefined,
        currency,
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Inversion agregada')
        setOpen(false)
        resetForm()
        await fetchAllData()
        router.refresh()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
          <Plus className="w-4 h-4 mr-2" />
          Nueva Inversion
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-slate-950 border-slate-800 text-slate-50">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold bg-linear-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent">
              Agregar Inversion
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Registra un nuevo activo en tu portafolio.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 md:py-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-300">Ticker</Label>
                <Input
                  value={ticker}
                  onChange={e => handleTickerChange(e.target.value)}
                  placeholder="AL30D"
                  className="bg-slate-900 border-slate-800 focus:border-indigo-500/50 uppercase"
                  required
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-slate-300">Nombre</Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Grupo Financiero Galicia"
                  className="bg-slate-900 border-slate-800 focus:border-indigo-500/50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-300">Tipo</Label>
                <Select value={type} onValueChange={handleTypeChange}>
                  <SelectTrigger className="bg-slate-900 border-slate-800">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    {INVESTMENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value} className="focus:bg-slate-800">
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Moneda</Label>
                <Select value={currency} onValueChange={setCurrency}>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-300">Cantidad</Label>
                <Input
                  type="number"
                  step="any"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="100"
                  className="bg-slate-900 border-slate-800 focus:border-indigo-500/50"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Precio Promedio</Label>
                <Input
                  type="number"
                  step="any"
                  value={avgBuyPrice}
                  onChange={e => setAvgBuyPrice(e.target.value)}
                  placeholder="Opcional"
                  className="bg-slate-900 border-slate-800 focus:border-indigo-500/50"
                />
              </div>
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
              className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px]"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2"/>
                  Guardando...
                </>
              ) : (
                'Agregar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
