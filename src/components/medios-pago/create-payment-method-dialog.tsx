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
import { Loader2, CheckCircle2, CreditCard, Wallet, Banknote } from 'lucide-react'
import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';
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
      is_default: false,
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
        <AnimatedPlusButton
          label="Crear método de pago"
          onClick={() => {}}
          ariaLabel="Nuevo método de pago"
        />
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:max-w-[500px] bg-surface border-border text-text"
      >
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="font-poster text-text text-[18px]">
            Nuevo Medio de Pago
          </DialogTitle>
          <p className="text-sm text-muted mt-1">
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
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
                    Nombre
                  </span>
                  <FormControl>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                      <Input
                        placeholder="Ej: Visa BBVA, Mercado Pago..."
                        className="pl-10 min-h-11"
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
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
                    Tipo
                  </span>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
                    {PAYMENT_TYPES.map((t) => {
                      const Icon = t.icon
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => field.onChange(t.value)}
                          className={cn(
                            'min-h-11 rounded-lg py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-1.5',
                            'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
                            field.value === t.value
                              ? 'bg-accent text-accent-ink'
                              : 'text-muted hover:text-text'
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
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
                          Día de cierre
                        </span>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            max="31"
                            placeholder="Ej: 15"
                            className="min-h-11"
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
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
                          Día de vencimiento
                        </span>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            max="31"
                            placeholder="Ej: 5"
                            className="min-h-11"
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
                <p className="text-[11px] text-muted italic pl-1">
                  Cierre: cuando tu tarjeta cierra el período · Vencimiento: cuando debés pagar.
                </p>
              </div>
            )}

            {/* ── Is personal switch ── */}
            <FormField
              control={form.control}
              name="is_personal"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl bg-surface-2 border-[1.5px] border-border px-4 py-3 min-h-[52px]">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
                      Personal / informal
                    </span>
                    <FormDescription className="text-[11px] text-muted mt-0.5">
                      Prestamos o deudas entre personas
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* ── Is default switch (solo para medios no personales) ── */}
            {!form.watch('is_personal') && (
              <FormField
                control={form.control}
                name="is_default"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-xl bg-surface-2 border-[1.5px] border-border px-4 py-3 min-h-[52px]">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
                        Predeterminado
                      </span>
                      <FormDescription className="text-[11px] text-muted mt-0.5">
                        Se usa cuando no aclarás el medio (chat y alta manual)
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            </div>
          </form>
        </Form>

        <div className="px-6 pb-6 pt-3 shrink-0">
          <Button
            type="submit"
            form="payment-method-form"
            disabled={isPending}
            variant="accent" size="lg" className="w-full"
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
