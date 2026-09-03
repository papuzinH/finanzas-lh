//
// Mover una compra al resumen vecino. PURO: sin Zustand ni Supabase.
//
// Decide QUE transacciones se mueven y adonde. No escribe nada: la action
// (app/ajustes/medios/actions.ts) aplica las reasignaciones.
//
// Spec: docs/superpowers/specs/2026-09-02-mover-al-resumen-vecino-design.md
import { cicloAnterior, cicloSiguiente, cicloNEsimo, type CreditCardCycle } from './cycles'
import type { Transaction } from '@/types/database'

export type DireccionDeMovimiento = 'anterior' | 'siguiente'

/** Lo unico que una reasignacion puede cambiar. `purchase_date` no esta, y es a proposito. */
export type Reasignacion = {
  transactionId: string
  cycleId: string
  date: string
}

export type PlanDeMovimiento = {
  reasignaciones: Reasignacion[]
  motivoDeRechazo?: string
}

const vecino = (ciclos: CreditCardCycle[], ciclo: CreditCardCycle, d: DireccionDeMovimiento) =>
  d === 'anterior' ? cicloAnterior(ciclos, ciclo) : cicloSiguiente(ciclos, ciclo)

export function planDeMovimiento(
  transaccion: Transaction,
  todas: Transaction[],
  ciclos: CreditCardCycle[],
  direccion: DireccionDeMovimiento,
): PlanDeMovimiento {
  const actual = ciclos.find((c) => c.id === transaccion.cycle_id)
  if (!actual) {
    return { reasignaciones: [], motivoDeRechazo: 'Este movimiento no está imputado a ningún resumen.' }
  }

  const destino = vecino(ciclos, actual, direccion)
  if (!destino) {
    return {
      reasignaciones: [],
      motivoDeRechazo:
        direccion === 'anterior'
          ? 'No hay un resumen anterior a este.'
          : 'No hay un resumen siguiente a este.',
    }
  }

  // Compra suelta: se mueve sola.
  if (!transaccion.installment_plan_id) {
    return { reasignaciones: [{ transactionId: transaccion.id, cycleId: destino.id, date: destino.due_date }] }
  }

  // Cuota: corre el plan DESDE ella hacia adelante. Las anteriores no se tocan --
  // sus resumenes ya cerraron y probablemente ya se pagaron.
  // El orden lo da `date`, no el "(3/6)" de la descripcion, que es texto.
  const delPlan = todas
    .filter((t) => t.installment_plan_id === transaccion.installment_plan_id)
    .sort((a, b) => a.date.localeCompare(b.date))

  const desde = delPlan.findIndex((t) => t.id === transaccion.id)
  const aMover = delPlan.slice(desde)

  const reasignaciones: Reasignacion[] = []
  for (const [k, cuota] of aMover.entries()) {
    // La cuota k-esima despues de la tocada va al k-esimo resumen despues del destino.
    const ciclo = cicloNEsimo(ciclos, destino, k)
    if (!ciclo) break // se agotaron los resumenes materializados; la action los crea y reintenta
    reasignaciones.push({ transactionId: cuota.id, cycleId: ciclo.id, date: ciclo.due_date })
  }

  return { reasignaciones }
}
