'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import { NameSlide } from './slides/name-slide'
import { CategoriesSlide } from './slides/categories-slide'
import { PaymentMethodsSlide } from './slides/payment-methods-slide'
import { completeOnboarding } from './actions'

type Slide = 'welcome' | 'features' | 'name' | 'categories' | 'payment' | 'complete'

const FEATURES = [
  {
    icon: Mic,
    title: 'Voz o texto',
    description: 'Registra gastos hablando o escribiendo naturalmente',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
  {
    icon: BarChart3,
    title: 'Dashboards',
    description: 'Visualiza tus finanzas con graficos inteligentes',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: CreditCard,
    title: 'Ciclos de tarjeta',
    description: 'Cierres y vencimientos calculados automaticamente',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
  },
  {
    icon: TrendingUp,
    title: 'Inversiones',
    description: 'Segui tu portafolio con precios en tiempo real',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
]

const SETUP_SLIDES: Slide[] = ['name', 'categories', 'payment']

export function OnboardingFlow() {
  const [slide, setSlide] = useState<Slide>('welcome')
  const [userName, setUserName] = useState<string | null>(null)
  const [categoriesCount, setCategoriesCount] = useState(0)
  const [paymentMethodsCount, setPaymentMethodsCount] = useState(0)
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
                className="text-7xl"
              >
                🐷
              </motion.div>
              <div className="space-y-3">
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Bienvenido a Chanchito
                </h1>
                <p className="text-slate-400 text-lg">
                  Tu asistente financiero que entiende lo que le decis
                </p>
              </div>
              <Button
                size="lg"
                className="bg-indigo-600 hover:bg-indigo-500 text-white h-12 px-8 text-base font-medium shadow-lg shadow-indigo-600/25"
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
                <h2 className="text-2xl font-bold text-white">Que podes hacer?</h2>
                <p className="text-slate-400">Todo lo que necesitas para tus finanzas</p>
              </div>
              <div className="grid gap-3">
                {FEATURES.map((feat, i) => (
                  <motion.div
                    key={feat.title}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <Card className="border-slate-800 bg-surface-raised/50">
                      <CardContent className="flex items-center gap-4 p-4">
                        <div className={cn('rounded-xl p-2.5', feat.bg)}>
                          <feat.icon className={cn('h-5 w-5', feat.color)} />
                        </div>
                        <div>
                          <p className="font-medium text-slate-100">{feat.title}</p>
                          <p className="text-sm text-slate-400">{feat.description}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
              <Button
                size="lg"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white h-12 text-base font-medium shadow-lg shadow-indigo-600/25"
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
                        ? 'w-6 bg-indigo-500'
                        : i < stepIndex
                          ? 'w-2 bg-indigo-500/50'
                          : 'w-2 bg-slate-700'
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
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                </div>
              </motion.div>
              <div className="space-y-3">
                <h2 className="text-2xl font-bold text-white">
                  Listo{userName ? `, ${userName}` : ''}!
                </h2>
                <p className="text-slate-400">Tu cuenta esta configurada</p>
              </div>

              <div className="grid gap-3 text-left">
                {userName && (
                  <SummaryItem emoji="👤" label="Nombre" value={userName} />
                )}
                <SummaryItem
                  emoji="📂"
                  label="Categorias"
                  value={`${categoriesCount} configuradas`}
                />
                <SummaryItem
                  emoji="💳"
                  label="Medios de pago"
                  value={`${paymentMethodsCount} configurados`}
                />
              </div>

              <Button
                size="lg"
                disabled={finishing}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white h-12 text-base font-medium shadow-lg shadow-indigo-600/25"
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

function SummaryItem({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <Card className="border-slate-800 bg-surface-raised/50">
      <CardContent className="flex items-center gap-3 p-3">
        <span className="text-xl">{emoji}</span>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-sm font-medium text-slate-200">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
