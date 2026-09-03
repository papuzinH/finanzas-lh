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
  /**
   * true cuando se pidio atrasar una cuota intermedia y el movimiento se amplio a
   * TODO el plan. Quien muestre el dialogo tiene que decirlo antes de confirmar: el
   * usuario toco una fila y se van a mover varias, en varios resumenes.
   */
  ampliadoATodoElPlan?: boolean
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
    // Atrasar una cuota sola es imposible por definicion: en un plan normal cada
    // cuota tiene a su predecesora en el resumen de al lado. Pero lo que el usuario
    // quiere es que el plan caiga un resumen antes, y eso SI se puede -- arrastrando
    // desde la primera. Se entiende la intencion en vez de negarla por un tecnicismo
    // del modelo: rechazar lo dejaba con un mensaje y sin camino.
    const cicloPrimera = ciclos.find((c) => c.id === delPlan[0].cycle_id)
    const destinoPrimera = cicloPrimera ? vecino(ciclos, cicloPrimera, 'anterior') : undefined
    if (!destinoPrimera) {
      // Aca si no hay salida: la cuota 1 ya vive en el resumen mas viejo de la tarjeta.
      return rechazo('Este plan ya arranca en el resumen más viejo de la tarjeta: no hay ninguno antes.')
    }
    return {
      reasignaciones: reasignacionesDesde(delPlan, destinoPrimera, ciclos),
      esperadas: delPlan.length,
      ampliadoATodoElPlan: true,
    }
  }

  return { reasignaciones: reasignacionesDesde(aMover, destino, ciclos), esperadas: aMover.length }
}

/**
 * Cada cuota de `cuotas` al resumen N-esimo desde `destino`, en orden -- el mismo
 * invariante que usa el alta: la cuota k va al k-esimo resumen.
 *
 * Corta cuando se agotan los resumenes materializados. La action detecta que el plan
 * quedo mas corto que `esperadas`, los crea, vuelve a pedir el plan una sola vez, y si
 * sigue incompleto no aplica NADA: un plan movido a medias deja dos cuotas en el mismo
 * resumen.
 */
function reasignacionesDesde(
  cuotas: Transaction[],
  destino: CreditCardCycle,
  ciclos: CreditCardCycle[],
): Reasignacion[] {
  const out: Reasignacion[] = []
  for (const [k, cuota] of cuotas.entries()) {
    const ciclo = cicloNEsimo(ciclos, destino, k)
    if (!ciclo) break
    out.push({ transactionId: cuota.id, cycleId: ciclo.id, date: ciclo.due_date })
  }
  return out
}
