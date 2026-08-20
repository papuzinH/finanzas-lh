'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Chancho } from '@/components/brand/chancho'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AccountAnchorFields } from '@/components/pocket/account-anchor-fields'
import { RhythmPicker } from '@/components/pocket/rhythm-picker'
import { FullPageLoader } from '@/components/shared/loader'
import { useFinanceStore } from '@/lib/store/financeStore'
import { anchorValueForDeclaredBalance } from '@/lib/finance/pocket'
import { dateToLocalString } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils'
import { periodLabel } from '@/lib/utils/pocket-copy'
import { saveAccountAnchors, saveIncomeRhythm, completePocketSetup } from '@/app/bolsillo/actions'
import type { IncomeRhythm } from '@/lib/finance/pocket'

type Paso = 'intro' | 'cuentas' | 'ritmo' | 'cambio'

/** Estado editable por cuenta. `balance: ''` = salteada, queda sin anclar. */
type FilaCuenta = { id: string; name: string; bucket: 'pocket' | 'reserve'; balance: string }

export function PuestaAPuntoFlow() {
  const router = useRouter()
  const {
    paymentMethods, transactions, internalTransfers,
    isInitialized, isLoading, fetchAllData,
    getGlobalBalance, getAvailableToSpend,
  } = useFinanceStore()

  const [paso, setPaso] = useState<Paso>('intro')
  const [filas, setFilas] = useState<FilaCuenta[]>([])
  const [rhythm, setRhythm] = useState<IncomeRhythm>('monthly')
  const [guardando, setGuardando] = useState(false)
  // El número viejo se congela ANTES de anclar: después de guardar ya no se puede recuperar.
  const [numeroViejo, setNumeroViejo] = useState<number | null>(null)

  useEffect(() => {
    if (!isInitialized) fetchAllData()
  }, [isInitialized, fetchAllData])

  const cuentas = useMemo(
    () => paymentMethods.filter((m) => m.type !== 'credit' && !m.is_personal),
    [paymentMethods],
  )

  useEffect(() => {
    if (!isInitialized || filas.length > 0) return
    setFilas(cuentas.map((m) => ({ id: m.id, name: m.name, bucket: m.bucket, balance: '' })))
    setNumeroViejo(getGlobalBalance())
  }, [isInitialized, cuentas, filas.length, getGlobalBalance])

  if (isLoading && !isInitialized) return <FullPageLoader text="Cargando tus cuentas..." />

  const setFila = (id: string, patch: Partial<FilaCuenta>) =>
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  const guardarCuentas = async () => {
    setGuardando(true)
    try {
      const hoy = dateToLocalString(new Date())
      const anchors = filas.flatMap((f) => {
        const method = paymentMethods.find((m) => m.id === f.id)
        if (!method) return []
        const declarado = f.balance.trim() === '' ? null : Number(f.balance)
        return [{
          payment_method_id: f.id,
          bucket: f.bucket,
          initial_balance:
            declarado === null
              ? 0
              : anchorValueForDeclaredBalance(declarado, method, transactions, internalTransfers, hoy),
          initial_balance_at: declarado === null ? null : hoy,
        }]
      })
      const res = await saveAccountAnchors(anchors)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setPaso('ritmo')
    } finally {
      setGuardando(false)
    }
  }

  const guardarRitmo = async () => {
    setGuardando(true)
    try {
      const res = await saveIncomeRhythm(rhythm)
      if (res.error) {
        toast.error(res.error)
        return
      }
      await fetchAllData()
      setPaso('cambio')
    } finally {
      setGuardando(false)
    }
  }

  const terminar = async () => {
    setGuardando(true)
    try {
      const res = await completePocketSetup()
      if (res.error) {
        toast.error(res.error)
        return
      }
      router.push('/')
      router.refresh()
    } finally {
      setGuardando(false)
    }
  }

  const saltear = async () => {
    setGuardando(true)
    try {
      await completePocketSetup()
      router.push('/')
      router.refresh()
    } finally {
      setGuardando(false)
    }
  }

  const nuevo = getAvailableToSpend()

  return (
    <div className="w-full max-w-lg mx-auto">
      <AnimatePresence mode="wait">
        {paso === 'intro' && (
          <Wrapper key="intro">
            <div className="text-center space-y-6">
              <Chancho className="mx-auto w-20 text-text" title="Chanchito" />
              <div className="space-y-3">
                <h1 className="font-display text-[26px] leading-[var(--leading-display)] text-text">
                  Cambiamos cómo se calcula tu plata
                </h1>
                <p className="font-sans text-sm text-muted">
                  Antes sumábamos todo lo que registraste desde el día uno. Si alguna vez te
                  olvidaste de anotar una salida, el número quedaba inflado para siempre.
                </p>
                <p className="font-sans text-sm text-muted">
                  Ahora arrancamos de lo que tenés hoy en cada cuenta. Son dos minutos y
                  el número vuelve a significar algo.
                </p>
              </div>
              <Button variant="accent" size="lg" className="w-full h-12" onClick={() => setPaso('cuentas')}>
                Dale, empecemos
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                onClick={saltear}
                disabled={guardando}
                className="w-full min-h-11 text-muted hover:text-text hover:bg-surface-2/50"
              >
                Ahora no
              </Button>
            </div>
          </Wrapper>
        )}

        {paso === 'cuentas' && (
          <Wrapper key="cuentas">
            <div className="space-y-5">
              <div className="space-y-2">
                <h2 className="font-display text-2xl text-text">¿Cuánto tenés en cada cuenta?</h2>
                <p className="font-sans text-sm text-muted">
                  Abrí la app del banco y copiá el saldo. La que no sepas, dejala vacía.
                </p>
              </div>

              <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
                {filas.map((f) => (
                  <Card key={f.id}>
                    <CardContent className="p-4 space-y-3">
                      <p className="font-sans font-bold text-text">{f.name}</p>
                      <AccountAnchorFields
                        bucket={f.bucket}
                        balance={f.balance}
                        onBucketChange={(b) => setFila(f.id, { bucket: b })}
                        onBalanceChange={(v) => setFila(f.id, { balance: v })}
                      />
                    </CardContent>
                  </Card>
                ))}
                {filas.length === 0 && (
                  <p className="font-sans text-sm text-muted italic">
                    No tenés cuentas de débito ni efectivo cargadas.
                  </p>
                )}
              </div>

              <Button variant="accent" size="lg" className="w-full h-12" onClick={guardarCuentas} disabled={guardando}>
                {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Seguir<ArrowRight className="ml-2 h-5 w-5" /></>}
              </Button>
            </div>
          </Wrapper>
        )}

        {paso === 'ritmo' && (
          <Wrapper key="ritmo">
            <div className="space-y-5">
              <div className="space-y-2">
                <h2 className="font-display text-2xl text-text">¿Cada cuánto entra plata?</h2>
                <p className="font-sans text-sm text-muted">
                  Define qué compromisos te descontamos hoy y cuáles quedan para el próximo cobro.
                </p>
              </div>
              <RhythmPicker value={rhythm} onChange={setRhythm} />
              <Button variant="accent" size="lg" className="w-full h-12" onClick={guardarRitmo} disabled={guardando}>
                {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Seguir<ArrowRight className="ml-2 h-5 w-5" /></>}
              </Button>
            </div>
          </Wrapper>
        )}

        {paso === 'cambio' && (
          <Wrapper key="cambio">
            <div className="space-y-5">
              <div className="space-y-2">
                <h2 className="font-display text-2xl text-text">Así queda tu número</h2>
                <p className="font-sans text-sm text-muted">
                  No perdiste plata: cambió lo que la app estaba midiendo.
                </p>
              </div>

              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="font-sans text-[13px] text-muted">Antes decía</span>
                    <span className="font-display tnum text-[15px] text-faint line-through">
                      {formatCurrency(numeroViejo ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="font-sans text-[13px] text-muted">En tus cuentas hoy</span>
                    <span className="font-display tnum text-[15px] text-text">
                      {formatCurrency(nuevo.pocketTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="font-sans text-[13px] text-muted">
                      Comprometido {periodLabel(rhythm)}
                    </span>
                    <span className="font-display tnum text-[15px] text-warn">
                      -{formatCurrency(nuevo.committed)}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-border flex justify-between items-baseline">
                    <span className="font-sans text-[13px] font-bold text-text">Tu plata libre</span>
                    <span className="font-display tnum text-[20px] text-text">
                      {formatCurrency(nuevo.available)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <p className="font-sans text-xs text-muted">
                Si el número te sorprende, revisá los saldos que cargaste desde Ajustes → Medios de pago.
                Cuando algo no cierre, Chanchito te va a preguntar si te falta anotar algo.
              </p>

              <Button variant="accent" size="lg" className="w-full h-12" onClick={terminar} disabled={guardando}>
                {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Listo, vamos<ArrowRight className="ml-2 h-5 w-5" /></>}
              </Button>
            </div>
          </Wrapper>
        )}
      </AnimatePresence>
    </div>
  )
}

function Wrapper({ children }: { children: React.ReactNode }) {
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
