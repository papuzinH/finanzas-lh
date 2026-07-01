'use client'

import { useState } from 'react'
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
  const [isPending, setIsPending] = useState(false)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!ticker || !name || !type || !quantity) {
      toast.error('Completa los campos obligatorios')
      return
    }

    setIsPending(true)
    try {
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
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="accent">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px] bg-surface border-border text-text">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-poster text-text text-[18px]">
              Agregar Inversión
            </DialogTitle>
            <DialogDescription className="text-muted">
              Registra un nuevo activo en tu portafolio.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 md:py-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-muted font-extrabold uppercase tracking-wider text-[10px]">Ticker</Label>
                <Input
                  value={ticker}
                  onChange={e => handleTickerChange(e.target.value)}
                  placeholder="AL30D"
                  className=" uppercase"
                  required
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-muted font-extrabold uppercase tracking-wider text-[10px]">Nombre</Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Grupo Financiero Galicia"
                  className=""
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-muted font-extrabold uppercase tracking-wider text-[10px]">Tipo</Label>
                <Select value={type} onValueChange={handleTypeChange}>
                  <SelectTrigger className="bg-surface-2 border-border">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent className="bg-surface border-border">
                    {INVESTMENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value} className="focus:bg-surface-2">
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted font-extrabold uppercase tracking-wider text-[10px]">Moneda</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="bg-surface-2 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface border-border">
                    <SelectItem value="ARS" className="focus:bg-surface-2">ARS</SelectItem>
                    <SelectItem value="USD" className="focus:bg-surface-2">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-muted font-extrabold uppercase tracking-wider text-[10px]">Cantidad</Label>
                <Input
                  type="number"
                  step="any"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="100"
                  className=""
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted font-extrabold uppercase tracking-wider text-[10px]">Precio Promedio</Label>
                <Input
                  type="number"
                  step="any"
                  value={avgBuyPrice}
                  onChange={e => setAvgBuyPrice(e.target.value)}
                  placeholder="Opcional"
                  className=""
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              onClick={() => setOpen(false)}
              variant="ghost" className="w-full sm:w-auto h-11 sm:h-9"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              variant="accent" className="w-full sm:w-auto h-11 sm:h-9"
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
