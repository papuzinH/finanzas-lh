'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { imputarCobros } from '@/app/bolsillo/actions'
import { mesesCandidatos, mesPorDefecto } from '@/lib/finance/imputacion-ingresos'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency } from '@/lib/utils'

/**
 * Repaso de los cobros de fin de mes que se cargaron antes de que existiera la
 * imputación. No hay backfill automático: mover plata en pantalla sin que la
 * persona lo pida contradice la regla central de esta feature.
 *
 * A diferencia de OverdueCardPaymentBanner, este NO explica una cifra retenida ni
 * bloquea nada -- corrige una lente de análisis. Por eso su salida es "Dejalos como
 * están", que ESCRIBE income_period con el mes de la propia fecha: una decisión
 * explícita queda persistida y el banner no vuelve, sin inventar un estado de
 * "descartado" que además no viajaría entre dispositivos (la lección del tour).
 */
export function CobrosSinImputarBanner() {
  // El store entero, no sus getters sueltos: son referencias estables y el
  // React Compiler congelaría el resultado (ver store-freshness.test.ts).
  const store = useFinanceStore()
  const cobros = store.getCobrosSinImputar()
  const [elegido, setElegido] = useState<Record<string, string>>({})
  const [isPending, setIsPending] = useState(false)

  if (cobros.length === 0) return null

  const guardar = async (dejarComoEstan: boolean) => {
    setIsPending(true)
    try {
      const items = cobros.map((t) => ({
        id: t.id,
        // "Dejalos como están" es, literalmente, no cambiar nada: el mes de la
        // propia fecha, sin importar la preferencia de imputación del usuario.
        income_period: dejarComoEstan
          ? mesesCandidatos(t.date)[0].valor
          : (elegido[t.id] ?? mesPorDefecto(t.date, store.incomeCountsNextMonth)),
      }))
      const res = await imputarCobros(items)
      if (res.error) {
        toast.error(res.error)
        return
      }
      await store.fetchAllData()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border-[1.5px] border-border bg-surface-2/40 p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-accent/15 p-2 shrink-0">
          <CalendarClock className="h-4 w-4 text-accent-deep" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="font-display text-base text-text">
            {cobros.length === 1 ? 'Tenés un cobro de fin de mes' : `Tenés ${cobros.length} cobros de fin de mes`}
          </p>
          <p className="font-sans text-xs text-muted">
            Cobraste sobre el final del mes: decinos para qué mes cuenta esa plata y las cifras
            del mes te van a cerrar.
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {cobros.map((t) => {
          const opciones = mesesCandidatos(t.date)
          // Preselección con el mismo criterio que el formulario de carga: la
          // preferencia declarada del usuario, no el primer candidato a secas.
          const actual = elegido[t.id] ?? mesPorDefecto(t.date, store.incomeCountsNextMonth)
          return (
            <li key={t.id} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-sans text-sm text-text truncate">{t.description}</span>
                <span className="font-display tnum text-sm text-good shrink-0">
                  {formatCurrency(Number(t.amount))}
                </span>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label={`Mes de ${t.description}`}>
                {opciones.map((o) => (
                  <Chip
                    key={o.valor}
                    active={actual === o.valor}
                    onClick={() => setElegido((prev) => ({ ...prev, [t.id]: o.valor }))}
                  >
                    {o.label}
                  </Chip>
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button variant="accent" onClick={() => guardar(false)} disabled={isPending} className="min-h-11">
          Listo
        </Button>
        <Button variant="ghost" onClick={() => guardar(true)} disabled={isPending} className="min-h-11">
          Dejalos como están
        </Button>
      </div>
    </motion.div>
  )
}
