'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, FolderOpen, type LucideIcon } from 'lucide-react'
import { Chancho } from '@/components/brand/chancho'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Mic,
  BarChart3,
  CreditCard,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Loader2,
  CalendarClock,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import { NameSlide } from './slides/name-slide'
import { CategoriesSlide } from './slides/categories-slide'
import { PaymentMethodsSlide } from './slides/payment-methods-slide'
import { RhythmSlide } from './slides/rhythm-slide'
import { rhythmLabel } from '@/lib/utils/pocket-copy'
import type { IncomeRhythm } from '@/lib/finance/pocket'
import { completeOnboarding } from './actions'

type Slide = 'welcome' | 'features' | 'name' | 'categories' | 'payment' | 'rhythm' | 'complete'

const FEATURES = [
  {
    icon: Mic,
    title: 'Voz o texto',
    description: 'Registra gastos hablando o escribiendo naturalmente',
    color: 'text-accent-deep',
    bg: 'bg-accent/10',
  },
  {
    icon: BarChart3,
    title: 'Dashboards',
    description: 'Visualiza tus finanzas con graficos inteligentes',
    color: 'text-good',
    bg: 'bg-good/10',
  },
  {
    icon: CreditCard,
    title: 'Ciclos de tarjeta',
    description: 'Cierres y vencimientos calculados automaticamente',
    color: 'text-accent-deep',
    bg: 'bg-accent/10',
  },
  {
    icon: TrendingUp,
    title: 'Inversiones',
    description: 'Segui tu portafolio con precios en tiempo real',
    color: 'text-warn',
    bg: 'bg-warn/10',
  },
]

const SETUP_SLIDES: Slide[] = ['name', 'categories', 'payment', 'rhythm']

export function OnboardingFlow() {
  const [slide, setSlide] = useState<Slide>('welcome')
  const [userName, setUserName] = useState<string | null>(null)
  const [categoriesCount, setCategoriesCount] = useState(0)
  const [paymentMethodsCount, setPaymentMethodsCount] = useState(0)
  const [rhythm, setRhythm] = useState<IncomeRhythm | null>(null)
  const [finishing, setFinishing] = useState(false)
  const router = useRouter()

  const handleFinish = async () => {
    setFinishing(true)
    try {
      const res = await completeOnboarding()
      if (res.error) {
        toast.error(res.error)
        return
      }
      router.push('/')
      router.refresh()
    } finally {
      setFinishing(false)
    }
  }

  const stepIndex = SETUP_SLIDES.indexOf(slide as Slide)
  const isInSetup = stepIndex !== -1

  return (
    <div className="w-full max-w-lg mx-auto">
      <AnimatePresence mode="wait">
        {slide === 'welcome' && (
          <SlideWrapper key="welcome">
            <div className="text-center space-y-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.2 }}
                className="mx-auto w-24"
              >
                <Chancho className="w-full text-text" title="Chanchito" />
              </motion.div>
              <div className="space-y-3">
                <h1 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
                  Bienvenido a Chanchito
                </h1>
                <p className="text-muted text-lg">
                  Tu asistente financiero que entiende lo que le decis
                </p>
              </div>
              <Button
                size="lg"
                className="bg-accent hover:bg-accent-deep text-accent-ink h-12 px-8 text-base font-medium"
                onClick={() => setSlide('features')}
              >
                Empezar
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </SlideWrapper>
        )}

        {slide === 'features' && (
          <SlideWrapper key="features">
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-text">Que podes hacer?</h2>
                <p className="text-muted">Todo lo que necesitas para tus finanzas</p>
              </div>
              <div className="grid gap-3">
                {FEATURES.map((feat, i) => (
                  <motion.div
                    key={feat.title}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <Card className="border-border bg-surface-2/50">
                      <CardContent className="flex items-center gap-4 p-4">
                        <div className={cn('rounded-xl p-2.5', feat.bg)}>
                          <feat.icon className={cn('h-5 w-5', feat.color)} />
                        </div>
                        <div>
                          <p className="font-medium text-text">{feat.title}</p>
                          <p className="text-sm text-muted">{feat.description}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
              <Button
                size="lg"
                className="w-full bg-accent hover:bg-accent-deep text-accent-ink h-12 text-base font-medium"
                onClick={() => setSlide('name')}
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Configurar mi cuenta
              </Button>
            </div>
          </SlideWrapper>
        )}

        {isInSetup && (
          <SlideWrapper key={`setup-${slide}`}>
            <div className="space-y-5">
              <div className="flex items-center justify-center gap-1.5">
                {SETUP_SLIDES.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-2 rounded-full transition-all duration-300',
                      i === stepIndex
                        ? 'w-6 bg-accent'
                        : i < stepIndex
                          ? 'w-2 bg-accent/50'
                          : 'w-2 bg-surface-2'
                    )}
                  />
                ))}
              </div>

              {slide === 'name' && (
                <NameSlide
                  initialName={userName || ''}
                  onNext={(name) => {
                    setUserName(name)
                    setSlide('categories')
                  }}
                />
              )}

              {slide === 'categories' && (
                <CategoriesSlide
                  onNext={(count) => {
                    setCategoriesCount(count)
                    setSlide('payment')
                  }}
                />
              )}

              {slide === 'payment' && (
                <PaymentMethodsSlide
                  onComplete={(count) => {
                    setPaymentMethodsCount(count)
                    setSlide('rhythm')
                  }}
                />
              )}

              {slide === 'rhythm' && (
                <RhythmSlide
                  onComplete={(r) => {
                    setRhythm(r)
                    setSlide('complete')
                  }}
                />
              )}
            </div>
          </SlideWrapper>
        )}

        {slide === 'complete' && (
          <SlideWrapper key="complete">
            <div className="text-center space-y-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.2 }}
              >
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-good/10 ring-1 ring-good/20">
                  <CheckCircle2 className="h-10 w-10 text-good" />
                </div>
              </motion.div>
              <div className="space-y-3">
                <h2 className="text-2xl font-bold text-text">
                  Listo{userName ? `, ${userName}` : ''}!
                </h2>
                <p className="text-muted">Tu cuenta esta configurada</p>
              </div>

              <div className="grid gap-3 text-left">
                {userName && (
                  <SummaryItem Icon={User} label="Nombre" value={userName} />
                )}
                <SummaryItem
                  Icon={FolderOpen}
                  label="Categorias"
                  value={`${categoriesCount} configuradas`}
                />
                <SummaryItem
                  Icon={CreditCard}
                  label="Medios de pago"
                  value={`${paymentMethodsCount} configurados`}
                />
                {rhythm && (
                  <SummaryItem Icon={CalendarClock} label="Cobrás" value={rhythmLabel(rhythm)} />
                )}
              </div>

              <Button
                size="lg"
                disabled={finishing}
                className="w-full bg-accent hover:bg-accent-deep text-accent-ink h-12 text-base font-medium"
                onClick={handleFinish}
              >
                {finishing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Ir al Dashboard
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </div>
          </SlideWrapper>
        )}
      </AnimatePresence>
    </div>
  )
}

function SlideWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  )
}

function SummaryItem({ Icon, label, value }: { Icon: LucideIcon; label: string; value: string }) {
  return (
    <Card className="border-border bg-surface-2/50">
      <CardContent className="flex items-center gap-3 p-3">
        <Icon className="h-5 w-5 shrink-0 text-accent-deep" aria-hidden />
        <div>
          <p className="text-xs text-muted">{label}</p>
          <p className="text-sm font-medium text-text">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
