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
import { Switch } from '@/components/ui/switch'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createPaymentMethod } from '@/app/medios-pago/actions'
import { useFinanceStore } from '@/lib/store/financeStore'
import { useRouter } from 'next/navigation'

const PAYMENT_TYPES = [
  { value: 'credit', label: 'Tarjeta de Crédito' },
  { value: 'debit', label: 'Tarjeta de Débito' },
  { value: 'cash', label: 'Efectivo' },
]

export function CreatePaymentMethodDialog() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { fetchAllData } = useFinanceStore()
  const router = useRouter()

  const [name, setName] = useState('')
  const [type, setType] = useState<string>('')
  const [closingDay, setClosingDay] = useState('')
  const [paymentDay, setPaymentDay] = useState('')
  const [isPersonal, setIsPersonal] = useState(false)

  const resetForm = () => {
    setName('')
    setType('')
    setClosingDay('')
    setPaymentDay('')
    setIsPersonal(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name || !type) {
      toast.error('Completa los campos obligatorios')
      return
    }

    startTransition(async () => {
      const result = await createPaymentMethod({
        name,
        type: type as 'credit' | 'debit' | 'cash',
        default_closing_day: closingDay ? Number(closingDay) : null,
        default_payment_day: paymentDay ? Number(paymentDay) : null,
        is_personal: isPersonal,
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Medio de pago creado')
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
          Nuevo Medio
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-slate-950 border-slate-800 text-slate-50">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Nuevo Medio de Pago
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Agrega una tarjeta, cuenta o billetera para organizar tus finanzas.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-6">
            <div className="space-y-2">
              <Label className="text-slate-300">Nombre</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej: Visa BBVA, Mercado Pago..."
                className="bg-slate-900 border-slate-800 focus:border-indigo-500/50"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="bg-slate-900 border-slate-800">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  {PAYMENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value} className="focus:bg-slate-800">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {type === 'credit' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-slate-300">Día de cierre</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={closingDay}
                    onChange={e => setClosingDay(e.target.value)}
                    placeholder="Ej: 15"
                    className="bg-slate-900 border-slate-800 focus:border-indigo-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Día de vencimiento</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={paymentDay}
                    onChange={e => setPaymentDay(e.target.value)}
                    placeholder="Ej: 5"
                    className="bg-slate-900 border-slate-800 focus:border-indigo-500/50"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div>
                <Label className="text-slate-300">Es personal / informal</Label>
                <p className="text-[11px] text-slate-500 mt-0.5">Prestamos o deudas entre personas</p>
              </div>
              <Switch checked={isPersonal} onCheckedChange={setIsPersonal} />
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
                'Crear'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
