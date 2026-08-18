'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Hand, ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { saveOnboardingName } from '../actions'

interface NameSlideProps {
  initialName?: string
  onNext: (name: string | null) => void
}

/**
 * Slide 1: pedir el nombre del usuario.
 * Input simple + botón "Continuar". También se puede saltar.
 */
export function NameSlide({ initialName = '', onNext }: NameSlideProps) {
  const [name, setName] = useState(initialName)
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      handleSkip()
      return
    }

    setIsPending(true)
    try {
      const res = await saveOnboardingName(trimmed)
      if (res.error) {
        toast.error(res.error)
        return
      }
      onNext(trimmed)
    } finally {
      setIsPending(false)
    }
  }

  const handleSkip = () => {
    onNext(null)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <Hand className="mx-auto mb-4 h-11 w-11 text-accent-deep" aria-hidden />
        <h2 className="text-2xl font-bold text-text">¿Cómo te llamás?</h2>
        <p className="text-sm text-muted">Lo vamos a usar para saludarte y nada más</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          maxLength={50}
          autoFocus
          disabled={isPending}
          className="h-12 bg-surface-2 border-border text-base text-text placeholder:text-faint focus:border-accent"
        />

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            size="lg"
            disabled={isPending}
            className="w-full bg-accent hover:bg-accent-deep text-accent-ink h-12 text-base font-medium shadow-offset"
          >
            {isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Continuar
                <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleSkip}
            disabled={isPending}
            className="text-muted hover:text-text hover:bg-surface-2/50"
          >
            Saltar este paso
          </Button>
        </div>
      </form>
    </motion.div>
  )
}
