'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowRight, Loader2, Plus, X, CreditCard, Wallet, Banknote,
  AlertCircle, Check, Info, Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { saveOnboardingPaymentMethods } from '../actions'

type PaymentType = 'credit' | 'debit' | 'cash'

type PaymentMethod = {
  name: string
  type: PaymentType
  closingDay: number | null
  paymentDay: number | null
}

const TYPE_META: Record<PaymentType, { label: string; icon: typeof CreditCard; bg: string; ring: string; iconColor: string }> = {
  credit: { label: 'Crédito', icon: CreditCard, bg: 'bg-accent/10', ring: 'ring-accent/30', iconColor: 'text-accent-deep' },
  debit:  { label: 'Débito / Billetera', icon: Wallet, bg: 'bg-accent/10', ring: 'ring-accent/30', iconColor: 'text-accent-deep' },
  cash:   { label: 'Efectivo', icon: Banknote, bg: 'bg-good/10', ring: 'ring-good/30', iconColor: 'text-good' },
}

interface PaymentMethodsSlideProps {
  onComplete: (count: number) => void
}

export function PaymentMethodsSlide({ onComplete }: PaymentMethodsSlideProps) {
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [defaultName, setDefaultName] = useState<string | null>(null)
  const [openAddType, setOpenAddType] = useState<PaymentType | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [isPending, setIsPending] = useState(false)

  const incompleteCreditCount = methods.filter(
    (m) => m.type === 'credit' && (m.closingDay === null || m.paymentDay === null)
  ).length

  const addMethod = (m: PaymentMethod) => {
    setMethods((prev) => {
      const next = [...prev, m]
      // si es el primero, marcarlo como default
      if (prev.length === 0) setDefaultName(m.name)
      return next
    })
  }

  const updateMethod = (idx: number, patch: Partial<PaymentMethod>) => {
    setMethods((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)))
  }

  const removeMethod = (idx: number) => {
    setMethods((prev) => {
      const removed = prev[idx]
      const next = prev.filter((_, i) => i !== idx)
      // Si borraste el default, reasignar al primero que quede
      if (removed && removed.name === defaultName) {
        setDefaultName(next[0]?.name ?? null)
      }
      return next
    })
  }

  const handleFinish = async () => {
    if (methods.length === 0) {
      toast.error('Agregá al menos un medio de pago')
      return
    }

    setIsPending(true)
    try {
      const res = await saveOnboardingPaymentMethods(
        methods.map((m) => ({
          name: m.name,
          type: m.type,
          default_closing_day: m.closingDay,
          default_payment_day: m.paymentDay,
        })),
        defaultName
      )
      if (res.error) {
        toast.error(res.error)
        return
      }
      onComplete(methods.length)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      <div className="text-center space-y-2">
        <div className="text-5xl mb-3">💳</div>
        <h2 className="text-2xl font-bold text-text">¿Con qué pagás?</h2>
        <p className="text-sm text-muted">
          Tocá un tipo para agregar un medio de pago
        </p>
      </div>

      {/* 3 botones grandes para tipo */}
      <div className="grid grid-cols-3 gap-2">
        {(['cash', 'debit', 'credit'] as PaymentType[]).map((type) => {
          const meta = TYPE_META[type]
          const Icon = meta.icon
          return (
            <button
              key={type}
              type="button"
              onClick={() => setOpenAddType(type)}
              disabled={isPending}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-2/40 px-3 py-4 transition-all hover:border-border hover:bg-surface-2',
                meta.bg
              )}
            >
              <Icon className={cn('h-6 w-6', meta.iconColor)} />
              <span className="text-xs font-medium text-text text-center leading-tight">
                {meta.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Lista de medios agregados */}
      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        <AnimatePresence>
          {methods.map((m, idx) => {
            const meta = TYPE_META[m.type]
            const Icon = meta.icon
            const isDefault = m.name === defaultName
            const isIncomplete = m.type === 'credit' && (m.closingDay === null || m.paymentDay === null)

            return (
              <motion.div
                key={`${m.name}-${idx}`}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3 transition-colors',
                  isDefault ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface-2/30'
                )}
              >
                <div className={cn('rounded-lg p-2', meta.bg)}>
                  <Icon className={cn('h-4 w-4', meta.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text truncate">{m.name}</span>
                    {isDefault && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-deep bg-accent/10 px-1.5 py-0.5 rounded">
                        Principal
                      </span>
                    )}
                  </div>
                  {m.type === 'credit' && (
                    <p className={cn('text-xs', isIncomplete ? 'text-warn' : 'text-muted')}>
                      {isIncomplete
                        ? '⚠ Falta cierre y vencimiento'
                        : `Cierra ${m.closingDay} · Vence ${m.paymentDay}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!isDefault && (
                    <button
                      type="button"
                      onClick={() => setDefaultName(m.name)}
                      className="text-[10px] text-muted hover:text-accent-deep px-2 py-1 rounded hover:bg-surface-2/50 transition-colors"
                      title="Marcar como principal"
                    >
                      Hacer principal
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingIdx(idx)}
                    className="p-1.5 rounded hover:bg-surface-2 text-muted hover:text-text transition-colors"
                    aria-label={`Editar ${m.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeMethod(idx)}
                    className="p-1.5 rounded hover:bg-bad/10 text-muted hover:text-bad transition-colors"
                    aria-label={`Eliminar ${m.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {methods.length === 0 && (
          <div className="text-center py-6 text-sm text-muted">
            Todavía no agregaste medios de pago
          </div>
        )}
      </div>

      {/* Banner de tarjetas incompletas */}
      {incompleteCreditCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/5 p-3 text-xs">
          <Info className="h-4 w-4 text-warn shrink-0 mt-0.5" />
          <div className="text-warn">
            Tenés {incompleteCreditCount} {incompleteCreditCount === 1 ? 'tarjeta' : 'tarjetas'} sin fechas.
            Te las vamos a recordar después en el dashboard así podés cargarlas cuando quieras.
          </div>
        </div>
      )}

      {/* Continuar */}
      <Button
        type="button"
        size="lg"
        onClick={handleFinish}
        disabled={isPending || methods.length === 0}
        className="w-full bg-accent hover:bg-accent-deep text-accent-ink h-12 text-base font-medium shadow-offset"
      >
        {isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            Finalizar setup
            <ArrowRight className="ml-2 h-5 w-5" />
          </>
        )}
      </Button>

      {/* Modal: agregar medio */}
      <Dialog open={openAddType !== null} onOpenChange={(o) => !o && setOpenAddType(null)}>
        <DialogContent className="sm:max-w-md bg-surface-2 border-border">
          <DialogHeader>
            <DialogTitle className="text-text">
              Nuevo medio de pago
            </DialogTitle>
          </DialogHeader>
          {openAddType && (
            <PaymentMethodForm
              type={openAddType}
              onSave={(m) => {
                addMethod(m)
                setOpenAddType(null)
              }}
              onCancel={() => setOpenAddType(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: editar */}
      <Dialog open={editingIdx !== null} onOpenChange={(o) => !o && setEditingIdx(null)}>
        <DialogContent className="sm:max-w-md bg-surface-2 border-border">
          <DialogHeader>
            <DialogTitle className="text-text">Editar medio de pago</DialogTitle>
          </DialogHeader>
          {editingIdx !== null && methods[editingIdx] && (
            <PaymentMethodForm
              type={methods[editingIdx].type}
              initial={methods[editingIdx]}
              onSave={(patch) => {
                updateMethod(editingIdx, patch)
                setEditingIdx(null)
              }}
              onCancel={() => setEditingIdx(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

// =============================================================================
// Form único para credit / debit / cash
// =============================================================================

function PaymentMethodForm({
  type,
  initial,
  onSave,
  onCancel,
}: {
  type: PaymentType
  initial?: PaymentMethod
  onSave: (m: PaymentMethod) => void
  onCancel: () => void
}) {
  const isCredit = type === 'credit'
  const meta = TYPE_META[type]

  // Defaults sugeridos por tipo
  const defaultName = initial?.name ?? (type === 'cash' ? 'Efectivo' : type === 'debit' ? 'Mercado Pago' : '')

  const [name, setName] = useState(defaultName)
  const [closingDay, setClosingDay] = useState<string>(
    initial?.closingDay !== undefined && initial?.closingDay !== null ? String(initial.closingDay) : ''
  )
  const [paymentDay, setPaymentDay] = useState<string>(
    initial?.paymentDay !== undefined && initial?.paymentDay !== null ? String(initial.paymentDay) : ''
  )
  const [showDateHelp, setShowDateHelp] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Necesitás un nombre')
      return
    }

    let cd: number | null = null
    let pd: number | null = null
    if (isCredit) {
      const cdNum = closingDay ? Number(closingDay) : null
      const pdNum = paymentDay ? Number(paymentDay) : null

      if (cdNum !== null && (isNaN(cdNum) || cdNum < 1 || cdNum > 31)) {
        toast.error('El día de cierre debe ser entre 1 y 31')
        return
      }
      if (pdNum !== null && (isNaN(pdNum) || pdNum < 1 || pdNum > 31)) {
        toast.error('El día de vencimiento debe ser entre 1 y 31')
        return
      }
      if (cdNum !== null && pdNum !== null && cdNum === pdNum) {
        toast.error('El día de cierre y vencimiento deben ser distintos')
        return
      }
      cd = cdNum
      pd = pdNum
    }

    onSave({
      name: trimmedName,
      type,
      closingDay: cd,
      paymentDay: pd,
    })
  }

  const incomplete = isCredit && (!closingDay || !paymentDay)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header con icon de tipo */}
      <div className={cn('flex items-center gap-3 rounded-lg p-3', meta.bg)}>
        <meta.icon className={cn('h-5 w-5', meta.iconColor)} />
        <span className="text-sm font-medium text-text">{meta.label}</span>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text">Nombre</label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            type === 'credit' ? 'Ej: Visa Galicia' :
            type === 'debit'  ? 'Ej: Mercado Pago' :
                                'Ej: Efectivo'
          }
          maxLength={50}
          autoFocus
          className="bg-surface border-border text-text"
        />
      </div>

      {isCredit && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text">Día de cierre</label>
              <Input
                type="number"
                min={1}
                max={31}
                value={closingDay}
                onChange={(e) => setClosingDay(e.target.value)}
                placeholder="24"
                className="bg-surface border-border text-text"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text">Día de vencimiento</label>
              <Input
                type="number"
                min={1}
                max={31}
                value={paymentDay}
                onChange={(e) => setPaymentDay(e.target.value)}
                placeholder="6"
                className="bg-surface border-border text-text"
              />
            </div>
          </div>

          {/* Persuasión: por qué importan las fechas */}
          <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-accent-deep shrink-0 mt-0.5" />
              <p className="text-xs text-accent-deep leading-relaxed">
                <span className="font-semibold">¿Por qué importan estas fechas?</span> Con ellas Chanchito
                calcula automáticamente cuándo te vence cada gasto y cuotas, te avisa antes
                de cada vencimiento y agrupa correctamente los consumos por mes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDateHelp((v) => !v)}
              className="text-xs text-accent-deep hover:text-accent underline-offset-2 hover:underline ml-6"
            >
              {showDateHelp ? 'Ocultar ayuda' : '¿Cómo encuentro estas fechas?'}
            </button>
            <AnimatePresence>
              {showDateHelp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <ul className="text-xs text-text space-y-1 pl-6 list-disc">
                    <li>Mirá el último resumen de tu tarjeta (físico o en home banking).</li>
                    <li><span className="font-medium">Cierre:</span> el día hasta donde cuentan los consumos del mes.</li>
                    <li><span className="font-medium">Vencimiento:</span> el día límite para pagar el resumen.</li>
                    <li>Si dudás, también lo encontrás en la app de tu banco.</li>
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {incomplete && (
            <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/5 p-2.5">
              <AlertCircle className="h-3.5 w-3.5 text-warn shrink-0 mt-0.5" />
              <p className="text-xs text-warn">
                Podés guardarla sin fechas y completarlas después.
                Te las vamos a recordar en el dashboard.
              </p>
            </div>
          )}
        </>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="text-muted hover:text-text">
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={!name.trim()}
          className="bg-accent hover:bg-accent-deep text-accent-ink"
        >
          <Plus className="h-4 w-4 mr-1" />
          {initial ? 'Guardar' : 'Agregar'}
        </Button>
      </div>
    </form>
  )
}
