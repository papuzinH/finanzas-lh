"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, CreditCard } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn, formatCurrency } from "@/lib/utils"
import { useFinanceStore } from "@/lib/store/financeStore"
import { InfoHint } from "@/components/ui/info-hint"
import { periodLabel, nextPeriodLabel } from "@/lib/utils/pocket-copy"

// Frena la propagación del click/teclado para que tocar un botón de info
// no colapse la hero card (que es clickeable para expandir/contraer).
function HintStop({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </span>
  )
}

// Count-up animado con requestAnimationFrame
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0)
  const frameRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const prevTargetRef = useRef<number>(0)

  useEffect(() => {
    const from = prevTargetRef.current
    prevTargetRef.current = target

    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    startRef.current = null

    const animate = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(from + (target - from) * eased)
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      }
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [target, duration])

  return value
}

export function BalanceCard() {
  const [expanded, setExpanded] = useState(false)
  const getAvailableToSpend = useFinanceStore((s) => s.getAvailableToSpend)
  const incomeRhythm = useFinanceStore((s) => s.incomeRhythm)
  const {
    available,
    pocketTotal,
    reserveTotal,
    committed,
    committedNextPeriod,
    commitmentItems,
    accounts,
  } = getAvailableToSpend()

  const animatedBalance = useCountUp(available)
  const isNegative = available < 0
  const pocketAccounts = accounts.filter((a) => a.bucket === 'pocket')
  const sinAnclar = pocketAccounts.some((a) => !a.anchored)
  const proximo = nextPeriodLabel(incomeRhythm)

  // Sin decimales y con Math.abs: correcto para filas donde el signo se renderiza
  // aparte a partir del valor real (hero, "Tu plata libre") o donde el monto es
  // siempre >= 0 por construcción (comprometido, cuotas). Para filas que pueden ser
  // negativas sin signo manual correcto (saldo por cuenta, pocketTotal, reserveTotal)
  // se usa el `formatCurrency` compartido de `@/lib/utils`, que conserva el signo.
  const formatAbs = (amount: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount))

  return (
    <div>
      <motion.div
        className="rounded-2xl border-[1.5px] border-border bg-surface text-text shadow-card overflow-hidden cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
        whileTap={{ scale: 0.99 }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Ver desglose de tu plata disponible"
      >
        <div className="p-5 lg:p-6">
          <div className="flex items-center gap-1.5 mb-1">
            <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-accent-deep">
              Tu plata libre para hoy
            </p>
            <HintStop>
              <InfoHint label="Qué es tu plata libre para hoy" className="text-faint hover:text-text">
                Lo que hay hoy en tus cuentas de gastar, menos lo que ya tiene dueño {periodLabel(incomeRhythm)}
                {' '}(mensualidades sin pagar y resúmenes de tarjeta que vencen antes de tu próximo cobro).
                Lo que guardaste en reservas no cuenta: decidiste no gastarlo.
              </InfoHint>
            </HintStop>
            <motion.div
              className="ml-auto"
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4 text-faint" aria-hidden="true" />
            </motion.div>
          </div>

          <div className="flex items-baseline gap-2 mt-1 overflow-hidden">
            <span className="font-display tnum text-[44px] lg:text-[46px] leading-[var(--leading-display)] text-text [text-shadow:var(--shadow-bandera)] min-w-0 truncate pr-1.5 pb-1">
              {isNegative ? "-" : ""}
              {formatAbs(animatedBalance)}
            </span>
          </div>

          {committedNextPeriod > 0 && proximo && (
            <p className="font-sans text-[12px] text-muted mt-1">
              <span className="font-display tnum">-{formatAbs(committedNextPeriod)}</span>
              {' '}{proximo}, todavía sin descontar
            </p>
          )}

          {sinAnclar && (
            <p className="font-sans text-[11px] text-warn mt-2">
              Alguna de tus cuentas no tiene saldo declarado: esa parte del número se sigue
              calculando sumando desde el primer movimiento. Cargá el saldo que falte en
              Ajustes → Medios de pago.
            </p>
          )}
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="border-t border-border px-5 py-4 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                      En tus cuentas
                      <HintStop>
                        <InfoHint label="Qué hay en tus cuentas" className="text-faint hover:text-text">
                          La suma de lo que declaraste en cada cuenta de gastar, más los movimientos
                          que registraste desde entonces. Las compras con tarjeta todavía no la
                          tocaron: por eso el resumen se descuenta aparte.
                        </InfoHint>
                      </HintStop>
                    </span>
                    <span className="font-display tnum text-[13px] text-good">
                      {formatCurrency(pocketTotal)}
                    </span>
                  </div>
                  <ul className="pl-[18px] space-y-1">
                    {pocketAccounts.map((a) => (
                      <li key={a.methodId} className="flex justify-between items-baseline gap-2">
                        <span className="min-w-0 truncate text-[11px] text-faint">
                          {a.name}{a.anchored ? '' : ' · sin saldo declarado'}
                        </span>
                        <span className="shrink-0 font-display tnum text-[11px] text-muted">
                          {formatCurrency(a.balance)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {committed > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] text-muted flex items-center gap-1.5">
                        <CreditCard className="h-3 w-3" />
                        Comprometido {periodLabel(incomeRhythm)}
                        <HintStop>
                          <InfoHint label="Qué es lo comprometido" className="text-faint hover:text-text">
                            Plata que está en la cuenta pero ya tiene dueño: mensualidades sin pagar
                            y resúmenes de tarjeta que vencen antes de tu próximo cobro. Al pagarlos,
                            este número no cambia: ya estaban apartados.
                          </InfoHint>
                        </HintStop>
                      </span>
                      <span className="font-display tnum text-[13px] text-bad">
                        -{formatAbs(committed)}
                      </span>
                    </div>
                    <ul className="pl-[18px] space-y-1">
                      {commitmentItems.map((item) => (
                        <li key={`${item.kind}-${item.id}`} className="flex justify-between items-baseline gap-2">
                          <span className="min-w-0 truncate text-[11px] text-faint">
                            {item.name}
                            {item.dueDate && ` · ${item.isCycleClosed ? 'cerrado' : 'en curso'} · vence ${format(item.dueDate, "d MMM", { locale: es })}`}
                          </span>
                          <span className="shrink-0 font-display tnum text-[11px] text-muted">
                            -{formatAbs(item.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-2 border-t border-border space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-muted">Tu plata libre</span>
                    <span className={cn("font-display tnum text-[15px]", isNegative ? "text-bad" : "text-good")}>
                      {isNegative ? "-" : "+"}{formatAbs(available)}
                    </span>
                  </div>

                  {/* !== 0, no > 0: una reserva puede quedar negativa por drift sin
                      reconciliar, y hay que seguir mostrándola (con signo, no ocultarla). */}
                  {reserveTotal !== 0 && (
                    <div className="flex justify-between items-center">
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                        Guardado en reservas
                        <HintStop>
                          <InfoHint label="Qué son las reservas" className="text-faint hover:text-text">
                            Lo que decidiste no gastar: ahorro, dólares, plazo fijo, broker. No entra
                            en tu plata libre, así la app no te invita a romper tu propio ahorro.
                          </InfoHint>
                        </HintStop>
                      </span>
                      <span className="font-display tnum text-[13px] text-text">
                        {formatCurrency(reserveTotal)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
