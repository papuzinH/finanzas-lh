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
  /**
   * Cuantas filas TIENE que reasignar este movimiento para estar completo: 1 para una
   * compra suelta, o la cuota tocada mas todas las posteriores del mismo plan.
   *
   * Existe para que haya UNA sola definicion de "que filas se mueven". La action tenia
   * la suya (`txs.filter(x => x.date >= t.date).length`), que coincidia con esta solo
   * mientras las `date` del plan fueran unicas -- y el camino 'anterior' de esta misma
   * feature las volvia no-unicas: mover una cuota al resumen anterior la dejaba encima
   * de su predecesora, las dos con el `due_date` de ese ciclo. Desde ahi las dos cuentas
   * divergian y la action o abortaba con un mensaje falso, o arrastraba una cuota que el
   * usuario nunca toco (fix wave final, C1).
   */
  esperadas: number
  motivoDeRechazo?: string
}

const rechazo = (motivo: string): PlanDeMovimiento => ({
  reasignaciones: [],
  esperadas: 0,
  motivoDeRechazo: motivo,
})

const vecino = (ciclos: CreditCardCycle[], ciclo: CreditCardCycle, d: DireccionDeMovimiento) =>
  d === 'anterior' ? cicloAnterior(ciclos, ciclo) : cicloSiguiente(ciclos, ciclo)

/**
 * "Notebook (3/6)" -> 3. `undefined` si la descripcion no termina en "(n/m)" -- el usuario
 * pudo haberla editado desde /movimientos. Mismo regex que usa la UI en
 * `filas-del-resumen.tsx`. Se usa SOLO como desempate y para nombrar la cuota que choca,
 * nunca como orden principal: el orden lo da `date`.
 */
function nroDeCuota(t: Transaction): number | undefined {
  const m = t.description?.match(/\((\d+)\/(\d+)\)$/)
  return m ? parseInt(m[1], 10) : undefined
}

export function planDeMovimiento(
  transaccion: Transaction,
  todas: Transaction[],
  ciclos: CreditCardCycle[],
  direccion: DireccionDeMovimiento,
): PlanDeMovimiento {
  const actual = ciclos.find((c) => c.id === transaccion.cycle_id)
  if (!actual) return rechazo('Este movimiento no está imputado a ningún resumen.')

  const destino = vecino(ciclos, actual, direccion)
  if (!destino) {
    return rechazo(
      direccion === 'anterior' ? 'No hay un resumen anterior a este.' : 'No hay un resumen siguiente a este.',
    )
  }

  // Compra suelta: se mueve sola.
  if (!transaccion.installment_plan_id) {
    return {
      reasignaciones: [{ transactionId: transaccion.id, cycleId: destino.id, date: destino.due_date }],
      esperadas: 1,
    }
  }

  // Cuota: corre el plan DESDE ella hacia adelante. Las anteriores no se tocan --
  // sus resumenes ya cerraron y probablemente ya se pagaron.
  //
  // El orden lo da `date`, no el "(3/6)" de la descripcion, que es texto. El numero de
  // cuota entra SOLO como desempate: sin el, dos cuotas con la misma `date` quedaban en
  // el orden en que Postgres devolvio las filas (la query de la action no tiene ORDER BY),
  // y "desde donde corre el plan" pasaba a depender del heap -- mover una cuota podia
  // arrastrar la ANTERIOR, en un resumen ya cerrado y pagado. `created_at` no sirve de
  // desempate: las cuotas de un plan se insertan en un solo INSERT y comparten `now()`.
  const delPlan = todas
    .filter((t) => t.installment_plan_id === transaccion.installment_plan_id)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (nroDeCuota(a) ?? 0) - (nroDeCuota(b) ?? 0) ||
        // Ultimo desempate, arbitrario pero TOTAL: con las dos descripciones editadas
        // nroDeCuota da undefined en ambas, la resta da 0, y Array.sort estable devuelve
        // el orden de la query -- que no tiene ORDER BY. Sin esto, el mismo plan de
        // cuotas produce dos resultados distintos segun como Postgres devuelva las filas.
        a.id.localeCompare(b.id),
    )

  const desde = delPlan.findIndex((t) => t.id === transaccion.id)
  if (desde === -1) return rechazo('No encontré este movimiento entre las cuotas del plan.')

  const aMover = delPlan.slice(desde)

  // Dos cuotas del mismo plan en un mismo resumen es un estado que en el papel del banco
  // no existe -- y este camino era la unica forma de producirlo: mover una cuota al
  // resumen anterior la dejaba encima de su predecesora. Se corta en origen. No cierra
  // ningun caso legitimo: si el plan entero quedo corrido, se mueve desde la cuota mas
  // vieja equivocada y esa arrastra el resto.
  const chocada = delPlan.slice(0, desde).find((t) => t.cycle_id === destino.id)
  if (chocada) {
    const nro = nroDeCuota(chocada) ?? delPlan.indexOf(chocada) + 1
    const primera = nroDeCuota(delPlan[0]) ?? 1
    // El mensaje tiene que decir QUE HACER. En un plan normal cada cuota tiene a su
    // predecesora en el resumen de al lado, asi que atrasar UNA es imposible por
    // definicion: lo unico que se puede atrasar es el plan entero, y eso se hace
    // desde su cuota mas vieja. "Movela desde ella" no alcanzaba -- se leia como
    // "mové la cuota 2", sin decir adonde ni por que.
    return rechazo(
      `Ahí ya está la cuota ${nro}. Para atrasar todo el plan, movelo desde la cuota ${primera}: las demás se corren con ella.`,
    )
  }

  const reasignaciones: Reasignacion[] = []
  for (const [k, cuota] of aMover.entries()) {
    // La cuota k-esima despues de la tocada va al k-esimo resumen despues del destino.
    const ciclo = cicloNEsimo(ciclos, destino, k)
    if (!ciclo) break // se agotaron los resumenes materializados; la action los crea y reintenta
    reasignaciones.push({ transactionId: cuota.id, cycleId: ciclo.id, date: ciclo.due_date })
  }

  return { reasignaciones, esperadas: aMover.length }
}
