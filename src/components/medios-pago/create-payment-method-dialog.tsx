'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createPaymentMethod } from '@/app/medios-pago/actions'
import { createPaymentMethodSchema, type CreatePaymentMethodSchema } from '@/lib/schemas/payment-method'
import { useFinanceStore } from '@/lib/store/financeStore'
import { useRouter } from 'next/navigation'

const PAYMENT_TYPES = [
  { value: 'credit', label: 'Tarjeta de Crédito' },
  { value: 'debit', label: 'Tarjeta de Débito' },
  { value: 'cash', label: 'Efectivo' },
]

export function CreatePaymentMethodDialog() {
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const { fetchAllData } = useFinanceStore()
  const router = useRouter()

  const form = useForm<CreatePaymentMethodSchema>({
    resolver: zodResolver(createPaymentMethodSchema),
    defaultValues: {
      name: '',
      type: 'credit',
      default_closing_day: null,
      default_payment_day: null,
      is_personal: false,
    },
  })

  async function onSubmit(data: CreatePaymentMethodSchema) {
    setIsPending(true)
    try {
      const result = await createPaymentMethod(data)

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Medio de pago creado')
        setOpen(false)
        form.reset()
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
        <Button size="icon" className="h-9 w-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface-overlay border-slate-800 text-slate-50">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Nuevo Medio de Pago
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Agrega una tarjeta, cuenta o billetera para organizar tus finanzas.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form id="payment-method-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="overflow-y-auto flex-1 px-6 space-y-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Nombre</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Visa BBVA, Mercado Pago..."
                      className="bg-surface-raised border-slate-800 focus:border-indigo-500/50"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Tipo</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="bg-surface-raised border-slate-800">
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-surface-overlay border-slate-800">
                      {PAYMENT_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value} className="focus:bg-slate-800">
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch('type') === 'credit' && (
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="default_closing_day"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Día de cierre</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max="31"
                          placeholder="Ej: 15"
                          className="bg-surface-raised border-slate-800 focus:border-indigo-500/50"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => {
                            const value = e.target.value ? Number(e.target.value) : null
                            field.onChange(value)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="default_payment_day"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Día de vencimiento</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max="31"
                          placeholder="Ej: 5"
                          className="bg-surface-raised border-slate-800 focus:border-indigo-500/50"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => {
                            const value = e.target.value ? Number(e.target.value) : null
                            field.onChange(value)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {form.watch('type') === 'credit' && (
              <div className="rounded-lg bg-surface-raised/50 px-3 py-2 border border-slate-800">
                <FormDescription className="text-[11px] text-slate-400">
                  Día de cierre: cuando tu tarjeta cierra el período (ej: 24).
                  Día de vencimiento: cuando debés pagar (ej: 6 del mes siguiente).
                </FormDescription>
              </div>
            )}

            <FormField
              control={form.control}
              name="is_personal"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-slate-800 bg-surface-raised/50 px-4 py-3">
                  <div>
                    <FormLabel className="text-slate-300">Es personal / informal</FormLabel>
                    <FormDescription className="text-[11px] text-slate-500 mt-0.5">
                      Prestamos o deudas entre personas
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            </div>
          </form>
        </Form>

        <div className="px-4 sm:px-6 py-4 border-t border-slate-800 flex-shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            className="w-full sm:w-auto h-11 sm:h-9 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="payment-method-form"
            disabled={isPending}
            className="w-full sm:w-auto h-11 sm:h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
