'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Loader2, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RhythmPicker } from '@/components/pocket/rhythm-picker'
import { saveIncomeRhythm } from '@/app/bolsillo/actions'
import type { IncomeRhythm } from '@/lib/finance/pocket'

interface RhythmSlideProps {
  onComplete: (rhythm: IncomeRhythm | null) => void
}

export function RhythmSlide({ onComplete }: RhythmSlideProps) {
  const [rhythm, setRhythm] = useState<IncomeRhythm>('monthly')
  const [isPending, setIsPending] = useState(false)

  const handleSave = async () => {
    setIsPending(true)
    try {
      const res = await saveIncomeRhythm(rhythm)
      if (res.error) {
        toast.error(res.error)
        return
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
        className="w-full text-muted hover:text-text hover:bg-surface-2/50"
      >
        Ahora no, lo configuro después
      </Button>
    </motion.div>
  )
}
