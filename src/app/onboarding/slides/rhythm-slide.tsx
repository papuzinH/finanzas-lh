'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Loader2, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { RhythmPicker } from '@/components/pocket/rhythm-picker'
import { saveIncomeRhythm, saveIncomePeriodPreference } from '@/app/bolsillo/actions'
import type { IncomeRhythm } from '@/lib/finance/pocket'

interface RhythmSlideProps {
  onComplete: (rhythm: IncomeRhythm | null) => void
}

export function RhythmSlide({ onComplete }: RhythmSlideProps) {
  const [rhythm, setRhythm] = useState<IncomeRhythm>('monthly')
  const [cuentaAlSiguiente, setCuentaAlSiguiente] = useState<boolean | null>(null)
  const [isPending, setIsPending] = useState(false)

  const handleSave = async () => {
    setIsPending(true)
    try {
      const res = await saveIncomeRhythm(rhythm)
      if (res.error) {
        toast.error(res.error)
        return
      }
      if (rhythm === 'monthly' && cuentaAlSiguiente !== null) {
        await saveIncomePeriodPreference(cuentaAlSiguiente)
      }
      onComplete(rhythm)
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
        <CalendarClock className="mx-auto mb-3 h-11 w-11 text-accent-deep" aria-hidden />
        <h2 className="font-display text-2xl text-text">¿Cada cuánto entra plata?</h2>
        <p className="font-sans text-sm text-muted">
          No hace falta la fecha exacta. Con el ritmo alcanza para saber qué te toca pagar
          antes del próximo cobro.
        </p>
      </div>

      <RhythmPicker value={rhythm} onChange={setRhythm} />

      {rhythm === 'monthly' && (
        <div className="space-y-2">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
            Cobros de fin de mes
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="A que mes cuenta un cobro de fin de mes">
            <Chip active={cuentaAlSiguiente === false} onClick={() => setCuentaAlSiguiente(false)}>
              Al mes en que cobro
            </Chip>
            <Chip active={cuentaAlSiguiente === true} onClick={() => setCuentaAlSiguiente(true)}>
              Al mes que arranca
            </Chip>
          </div>
          <p className="font-sans text-xs text-muted">
            Si cobrás los últimos días del mes, esto decide qué opción viene marcada cuando cargás
            el sueldo. Siempre podés cambiarla en cada cobro.
          </p>
        </div>
      )}

      <Button
        type="button"
        size="lg"
        onClick={handleSave}
        disabled={isPending}
        className="w-full bg-accent hover:bg-accent-deep text-accent-ink h-12 text-base font-medium"
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

      <Button
        type="button"
        variant="ghost"
        onClick={() => onComplete(null)}
        disabled={isPending}
        className="w-full min-h-11 text-muted hover:text-text hover:bg-surface-2/50"
      >
        Ahora no, lo configuro después
      </Button>
    </motion.div>
  )
}
