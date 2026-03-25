'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Loader2, Plus, CheckCircle2, CreditCard, Wallet, Banknote } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { createPaymentMethod } from '@/app/medios-pago/actions'
import { createPaymentMethodSchema, type CreatePaymentMethodSchema } from '@/lib/schemas/payment-method'
import { useFinanceStore } from '@/lib/store/financeStore'
import { useRouter } from 'next/navigation'

const PAYMENT_TYPES = [
  { value: 'credit', label: 'Crédito', icon: CreditCard },
  { value: 'debit', label: 'Débito', icon: Wallet },
  { value: 'cash', label: 'Efectivo', icon: Banknote },
] as const

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
      <DialogContent
        showCloseButton
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-slate-800/50 text-slate-50"
      >
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="text-xl font-bold text-purple-300">
            Nuevo Medio de Pago
          </DialogTitle>
          <p className="text-sm text-slate-400 mt-1">
            Agrega una tarjeta, cuenta o billetera.
          </p>
        </DialogHeader>

        <Form {...form}>
          <form id="payment-method-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

            {/* ── Name ── */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                    Nombre
                  </span>
                  <FormControl>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                      <Input
                        placeholder="Ej: Visa BBVA, Mercado Pago..."
                        className="pl-10 bg-surface-raised border-0 rounded-xl min-h-11 text-slate-50 placeholder:text-slate-600 focus-visible:ring-2 focus-visible:ring-purple-500"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Type Toggle ── */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                    Tipo
                  </span>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-900/80 p-1">
                    {PAYMENT_TYPES.map((t) => {
                      const Icon = t.icon
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => field.onChange(t.value)}
                          className={cn(
                            'min-h-11 rounded-lg py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-1.5',
                            'focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none',
                            field.value === t.value
                              ? 'bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.3)]'
                              : 'text-slate-500 hover:text-slate-300'
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Credit card days ── */}
            {form.watch('type') === 'credit' && (
              <div className="space-y-3 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="default_closing_day"
                    render={({ field }) => (
                      <FormItem>
                        <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                          Día de cierre
                        </span>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            max="31"
                            placeholder="Ej: 15"
                            className="bg-surface-raised border-0 rounded-xl min-h-11 text-slate-50 placeholder:text-slate-600 focus-visible:ring-2 focus-visible:ring-purple-500"
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
                        <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                          Día de vencimiento
                        </span>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            max="31"
                            placeholder="Ej: 5"
                            className="bg-surface-raised border-0 rounded-xl min-h-11 text-slate-50 placeholder:text-slate-600 focus-visible:ring-2 focus-visible:ring-purple-500"
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
                <p className="text-[11px] text-slate-500 italic pl-1">
                  Cierre: cuando tu tarjeta cierra el período · Vencimiento: cuando debés pagar.
                </p>
              </div>
            )}

            {/* ── Is personal switch ── */}
            <FormField
              control={form.control}
              name="is_personal"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl bg-surface-raised px-4 py-3 min-h-[52px]">
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                      Personal / informal
                    </span>
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

        <div className="px-6 pb-6 pt-3 shrink-0">
          <Button
            type="submit"
            form="payment-method-form"
            disabled={isPending}
            className="w-full min-h-[52px] rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-base font-semibold shadow-[0_0_24px_rgba(168,85,247,0.25)] transition-all active:scale-[0.98]"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Creando...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                Crear Medio de Pago
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
