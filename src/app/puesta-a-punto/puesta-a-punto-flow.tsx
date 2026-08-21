'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Chancho } from '@/components/brand/chancho'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { AccountAnchorFields } from '@/components/pocket/account-anchor-fields'
import { RhythmPicker } from '@/components/pocket/rhythm-picker'
import { FullPageLoader } from '@/components/shared/loader'
import { useFinanceStore } from '@/lib/store/financeStore'
import { anchorValueForDeclaredBalance } from '@/lib/finance/pocket'
import { dateToLocalString } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils'
import { periodLabel } from '@/lib/utils/pocket-copy'
import { saveAccountAnchors, saveIncomeRhythm, completePocketSetup } from '@/app/bolsillo/actions'
import { markRecurringPlanPaid } from '@/app/compromisos/actions'
import type { IncomeRhythm } from '@/lib/finance/pocket'
import type { ProcessedTransaction } from '@/lib/finance/types'
import type { PaymentMethod, InternalTransfer } from '@/types/database'

type Paso = 'intro' | 'cuentas' | 'compromisos' | 'ritmo' | 'cambio'

/** Acá, a diferencia del default de `AccountAnchorFields` (pensado para onboarding, donde
 *  la cuenta es nueva), dejar el campo vacío NO deja la cuenta sin anclar: ver `FilaCuenta`. */
const BALANCE_ZERO_HELP = 'Si lo dejás vacío, arrancamos esta cuenta en $0 desde hoy.'

/** Estado editable por cuenta. `balance: ''` = salteada: a diferencia de Ajustes o el
 *  onboarding, acá la cuenta YA tiene historial, así que dejarla sin anclar volvería a
 *  sumar todo desde el primer movimiento (el modelo viejo que esta puesta a punto viene
 *  a reemplazar). Por eso un campo vacío ancla en $0 desde hoy, no queda "sin anclar". */
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
  // Qué mensualidades marcó el usuario como "ya la pagué este mes". Todas arrancan sin
  // marcar: nunca las pre-tildamos, tiene que afirmarlo.
  const [pagados, setPagados] = useState<Record<string, boolean>>({})
  const [guardando, setGuardando] = useState(false)
  // El número viejo se congela ANTES de anclar: después de guardar ya no se puede recuperar.
  const [numeroViejo, setNumeroViejo] = useState<number | null>(null)
  // Lock de "ya capturé": NO puede depender de filas.length (una cuenta list vacía nunca
  // lo pone en > 0, así que el efecto se repetiría en cada fetchAllData() posterior,
  // incluido el de guardarRitmo() DESPUÉS de guardar las anclas).
  const capturado = useRef(false)

  useEffect(() => {
    if (!isInitialized) fetchAllData()
  }, [isInitialized, fetchAllData])

  const cuentas = useMemo(
    () => paymentMethods.filter((m) => m.type !== 'credit' && !m.is_personal),
    [paymentMethods],
  )

  useEffect(() => {
    if (!isInitialized || capturado.current) return
    capturado.current = true
    setFilas(cuentas.map((m) => ({ id: m.id, name: m.name, bucket: m.bucket, balance: '' })))
    setNumeroViejo(getGlobalBalance())
  }, [isInitialized, cuentas, getGlobalBalance])

  if (isLoading && !isInitialized) return <FullPageLoader text="Cargando tus cuentas..." />

  // Exactamente los fijos que el disponible está por descontar (ya excluye los facturados
  // a tarjeta, que viajan dentro del resumen y no se ofrecen acá para no contarlos dos veces
  // en el otro sentido). Independiente de si ya ancló las cuentas o eligió el ritmo: ninguno
  // de los dos afecta qué mensualidades están pendientes.
  const compromisosPendientes = getAvailableToSpend().commitmentItems.filter((i) => i.kind === 'fixed')

  const setFila = (id: string, patch: Partial<FilaCuenta>) =>
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  /**
   * Arma el payload de `saveAccountAnchors` a partir de lo que el usuario declaró en
   * `filas`. Recibe transacciones/transferencias/medios y `hoy` como parámetro (no los
   * toma del cierre) a propósito: `continuarCompromisos` necesita pasarle una copia recién
   * refetcheada, que ya incluya los pagos que se acaban de marcar, para que
   * `anchorValueForDeclaredBalance` los vea y no los reste dos veces (ver ese handler).
   * `hoy` viaja como parámetro para que sea EXACTAMENTE el mismo string que se le pasa a
   * `markRecurringPlanPaid`: calcularlo de nuevo acá (otro `new Date()`) reabriría la
   * ventana de desfase que ese pasaje de `hoy` está resolviendo.
   */
  const construirAnchors = (
    txs: ProcessedTransaction[],
    transfers: InternalTransfer[],
    methods: PaymentMethod[],
    hoy: string,
  ) => {
    return filas.flatMap((f) => {
      const method = methods.find((m) => m.id === f.id)
      if (!method) return []
      const declarado = f.balance.trim() === '' ? null : Number(f.balance)
      return [{
        payment_method_id: f.id,
        bucket: f.bucket,
        // Vacío = declaró $0, no "sin anclar": esta cuenta ya tiene historial, y dejarla
        // sin anclar volvería a sumar todo desde el primer movimiento (ver `FilaCuenta`).
        initial_balance:
          declarado === null
            ? 0
            : anchorValueForDeclaredBalance(declarado, method, txs, transfers, hoy),
        initial_balance_at: hoy,
      }]
    })
  }

  const guardarCuentas = async () => {
    setGuardando(true)
    try {
      // Si no hay nada para marcar como pagado, se ancla ya mismo: no hace falta esperar
      // a nada más. Si lo hay, el ancla se guarda recién en `continuarCompromisos` (ver
      // el comentario de esa función) — este paso solo decide a cuál ir.
      if (compromisosPendientes.length === 0) {
        const hoy = dateToLocalString(new Date())
        const anchors = construirAnchors(transactions, internalTransfers, paymentMethods, hoy)
        const res = await saveAccountAnchors(anchors)
        if (res.error) {
          toast.error(res.error)
          return
        }
      }
      setPaso(compromisosPendientes.length > 0 ? 'compromisos' : 'ritmo')
    } finally {
      setGuardando(false)
    }
  }

  const continuarCompromisos = async () => {
    setGuardando(true)
    try {
      // Un solo "hoy", calculado en el timezone del cliente (Argentina), para todo este
      // paso: se lo pasamos explícito a `markRecurringPlanPaid` para que la transacción
      // quede fechada igual que el ancla. Si cada uno calculara su propio `new Date()`,
      // el servidor (Vercel, sin TZ seteada → UTC) podría fechar la transacción "mañana"
      // mientras el cliente ancla "hoy" — la ventana es angosta (~21:00 a 00:00 ART) pero
      // real, y anchorValueForDeclaredBalance trataría esa transacción como un movimiento
      // futuro: no la restaría del ancla, y al día siguiente sí la restaría del saldo,
      // resucitando el mismo agujero que este paso vino a cerrar.
      const hoy = dateToLocalString(new Date())
      const idsMarcados = compromisosPendientes.filter((item) => pagados[item.id]).map((item) => item.id)
      for (const planId of idsMarcados) {
        const res = await markRecurringPlanPaid(planId, hoy)
        if (res.error) {
          toast.error(res.error)
          return
        }
      }

      // El ancla se guarda ACÁ, no en `guardarCuentas`, cuando hay compromisos para marcar.
      // Si ancláramos antes de esto, `anchorValueForDeclaredBalance` no vería las
      // transacciones que se acaban de crear (fechadas `hoy`, el mismo día del ancla) y
      // las restaría dos veces: una ya implícita en el saldo declarado, otra por la
      // transacción. Por eso, si se marcó algo, hay que refrescar el store ANTES de armar
      // el ancla — `useFinanceStore.getState()` en vez del cierre, que quedó desactualizado
      // apenas se disparó el fetch.
      let txs = transactions
      let transfers = internalTransfers
      let methods = paymentMethods
      if (idsMarcados.length > 0) {
        await fetchAllData()
        // `fetchAllData` nunca rechaza: si falla adentro, cachea el error en el store y
        // deja `transactions` SIN TOCAR (el catch de `fetchAllData` no las pisa). Sin este
        // chequeo, seguiríamos con la copia vieja (sin los pagos recién marcados),
        // `anchorValueForDeclaredBalance` no los vería, y el ancla se guardaría sin
        // descontarlos — el mismo agujero, pero silencioso: los pagos ya están en la base,
        // fechados hoy, adentro de la ventana del ancla.
        const fresh = useFinanceStore.getState()
        if (fresh.error) {
          toast.error('Marcamos los pagos pero no pudimos actualizar tus datos. Probá de nuevo.')
          return
        }
        txs = fresh.transactions
        transfers = fresh.internalTransfers
        methods = fresh.paymentMethods
      }
      const anchors = construirAnchors(txs, transfers, methods, hoy)
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
                        balanceCaption={BALANCE_ZERO_HELP}
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

        {paso === 'compromisos' && (
          <Wrapper key="compromisos">
            <div className="space-y-5">
              <div className="space-y-2">
                <h2 className="font-display text-2xl text-text">¿Ya pagaste alguna de estas?</h2>
                <p className="font-sans text-sm text-muted">
                  El saldo que declaraste recién ya viene neto si pagaste alguna de estas
                  mensualidades este mes. Marcá las que ya salieron de tu cuenta para que
                  Chanchito no te las reste de nuevo.
                </p>
              </div>

              <div className="space-y-2.5 max-h-[46vh] overflow-y-auto pr-1">
                {compromisosPendientes.map((item) => (
                  <label
                    key={item.id}
                    htmlFor={`pagado-${item.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border-[1.5px] border-border bg-surface px-4 py-2.5 min-h-11 cursor-pointer"
                  >
                    <span className="min-w-0">
                      <span className="block font-sans text-sm text-text truncate">{item.name}</span>
                      <span className="block font-display tnum text-xs text-muted">
                        {formatCurrency(item.amount)}
                      </span>
                    </span>
                    <Switch
                      id={`pagado-${item.id}`}
                      checked={!!pagados[item.id]}
                      onCheckedChange={(v) => setPagados((prev) => ({ ...prev, [item.id]: v }))}
                    />
                  </label>
                ))}
              </div>

              <Button variant="accent" size="lg" className="w-full h-12" onClick={continuarCompromisos} disabled={guardando}>
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
