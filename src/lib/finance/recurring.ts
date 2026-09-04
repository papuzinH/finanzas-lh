import { addMonths, format, getDaysInMonth, startOfDay } from 'date-fns'
import type { PaymentMethod, RecurringPlan, Transaction } from '@/types/database'
import { calculateCreditPaymentDate, parseLocalDate } from '@/lib/utils/dates'
import { cicloDeCompra, ciclosDeMetodo, type CreditCardCycle } from '@/lib/finance/cycles'

/** Un mes de consumo que todavía no tiene su transacción. */
export type MissingCharge = { planId: string; month: string; date: string; cycleId: string | null }

/**
 * Un plan se postea solo si las tres cosas son ciertas: va en tarjeta de
 * crédito, esa tarjeta tiene el ciclo cargado (sin cierre/vencimiento no hay
 * fecha que calcular) y es mensual (un plan anual daría doce cobros donde hay
 * uno). Si no, sigue con el toggle manual: el mecanismo no inventa fechas que
 * no puede derivar.
 */
export function isAutomaticPlan(plan: RecurringPlan, method: PaymentMethod | undefined): boolean {
  if (!method || method.type !== 'credit') return false
  if (method.default_closing_day == null || method.default_payment_day == null) return false
  return (plan.frequency ?? 'monthly') === 'monthly'
}

/** Día de cobro del plan en ese mes, clampeado al último día que el mes tiene. */
export function chargeDayOf(plan: RecurringPlan, month: string): number {
  const firstOfMonth = parseLocalDate(`${month}-01`)
  return Math.min(plan.billing_day ?? 1, getDaysInMonth(firstOfMonth))
}

/**
 * Fecha de la transacción para el consumo de `month` ('yyyy-MM'): el día de
 * cobro pasado por la MISMA función que usan cuotas y compras variables, así
 * que la mensualidad cae en el resumen que le corresponde.
 *
 * Se conserva para las tarjetas sin ciclo materializado y como FALLBACK de
 * `expectedChargeDatePorCiclo`: deriva la fecha de los defaults de la tarjeta
 * en vez de leerla de un resumen real.
 */
export function expectedChargeDate(
  plan: RecurringPlan,
  method: PaymentMethod,
  month: string,
): string {
  const day = String(chargeDayOf(plan, month)).padStart(2, '0')
  return calculateCreditPaymentDate(
    `${month}-${day}`,
    method.default_closing_day as number,
    method.default_payment_day as number,
  )
}

/**
 * En que resumen cae el consumo de `month` y con que fecha, segun los ciclos
 * materializados. Reemplaza a expectedChargeDate, que derivaba la fecha de los
 * defaults de la tarjeta con calculateCreditPaymentDate.
 *
 * Devuelve undefined si no hay ciclo que contenga ese dia de cobro: el llamador
 * genera los que falten (asegurarCiclos) antes de reintentar.
 */
export function expectedChargeDatePorCiclo(
  plan: RecurringPlan,
  month: string,
  ciclos: CreditCardCycle[],
): { cycleId: string; date: string } | undefined {
  const day = String(chargeDayOf(plan, month)).padStart(2, '0')
  const ciclo = cicloDeCompra(`${month}-${day}`, ciclos)
  return ciclo ? { cycleId: ciclo.id, date: ciclo.due_date } : undefined
}

/**
 * El texto "Visa - vence 2/10" de una mensualidad automatica.
 *
 * El resumen manda y los defaults son respaldo: mismo orden de precedencia que
 * computeMissingAutomaticCharges. Antes salia siempre de los defaults, asi que con un resumen
 * declarado la etiqueta y el movimiento posteado decian fechas distintas.
 */
export function etiquetaDeCobro(
  plan: RecurringPlan,
  method: PaymentMethod,
  month: string,
  ciclos: CreditCardCycle[],
): string {
  const porCiclo = expectedChargeDatePorCiclo(plan, month, ciclosDeMetodo(method.id, ciclos))
  const fecha = porCiclo?.date ?? expectedChargeDate(plan, method, month)
  const [, mes, dia] = fecha.split('-')
  return `${method.name} · vence ${Number(dia)}/${Number(mes)}`
}

/**
 * Qué meses de consumo le faltan a cada plan automático.
 *
 * Cobertura: DOS REGÍMENES, y cada transacción cae en uno solo según tenga o no
 * `purchase_date`. No se mezclan: la exactitud del primero se pierde entera si
 * las claves aproximadas del segundo siguen aplicando encima.
 *
 * ── 1. Con `purchase_date`: EXACTO, y excluyente ──
 *
 * `purchase_date` es el mes de consumo LITERAL. Lo escribe el propio sync
 * (`syncAutomaticRecurringCharges`, `${month}-${díaDeCobro}`), así que no hay
 * nada que reconstruir: el mes de consumo M está cubierto sii alguna fila del
 * plan tiene su `purchase_date` en M. Es la única clave que no se presta entre
 * meses, y por eso las filas que la tienen NO aportan las claves aproximadas de
 * abajo — sumarlas con OR devuelve el problema entero (ver la supresión).
 *
 * ── 2. Sin `purchase_date`: dos claves aproximadas, evaluadas con OR ──
 *
 * Son las filas que el marcado manual de pago crea (no la escribe) y las
 * anteriores al commit que la introdujo. Para ellas el mes de consumo se
 * reconstruye, y por eso hace falta mirar por dos lados:
 *
 * a. Por `cycle_id`: `transactions.cycle_id` es la única verdad de pertenencia a
 *    un resumen (ver CLAUDE.md), así que si la fila tiene el MISMO `cycle_id`
 *    que predice `expectedChargeDatePorCiclo(M)`, está cubierta. Hace falta
 *    porque declarar un ciclo ACTUALIZA la fila existente (mismo id, fecha
 *    nueva) y la transacción posteada se queda con su `date` sin tocar (E13):
 *    si esa fecha vieja cae en otro mes que el vencimiento declarado, el mes
 *    deja de coincidir y por `cycle_id` el resumen sigue siendo el mismo.
 * b. Por MES del `date` contra el mes de la fecha prevista. Hace falta porque
 *    los ciclos se materializan retroactivamente (`asegurarCiclos` cubre meses
 *    pasados): la predicción de HOY trae un `cycleId` truthy aunque la fila
 *    vieja tenga `cycle_id` nulo, y mirar sólo el bucket que indica `cycleId`
 *    la dejaba invisible (54 planes recurrentes en producción posteados así).
 *    Mira el mes y no la fecha exacta a propósito: una fecha editada a mano
 *    sigue contando como cobertura.
 *
 * ── Los dos errores que este reparto evita, los dos reales y los dos con
 * declarar un resumen como disparador ──
 *
 * - DUPLICAR: la mensualidad de septiembre se postea contra el resumen de
 *   octubre; el usuario declara el cierre real de septiembre y la predicción
 *   pasa a caer en el resumen de septiembre. La clave de resumen ya no matchea,
 *   y si el vencimiento declarado además cambia de mes, la de mes tampoco: se
 *   postea un segundo gasto real por el mismo mes de consumo. Por
 *   `purchase_date` el consumo sigue siendo de septiembre.
 * - SUPRIMIR: septiembre declarado vence el 2-oct y octubre vence el 28-oct —
 *   los dos vencimientos en el mismo mes calendario. El cargo de septiembre,
 *   fechado 2-oct, le PRESTA su clave de mes a octubre, y el cargo de octubre no
 *   se postea nunca: un gasto real que desaparece en silencio. Basta un día de
 *   cobro <= el día de cierre. Por `purchase_date` cada mes de consumo tiene su
 *   propia clave y ninguna se presta.
 *
 * Límite conocido, acotado a las filas SIN `purchase_date`: ahí la cobertura
 * sigue siendo por aproximación y los dos errores de arriba siguen siendo
 * posibles. Son filas que este sync no crea (las crea el marcado manual, que no
 * postea solo) o anteriores a que la columna existiera.
 *
 * @param floorMonth 'yyyy-MM' del primer ingreso del usuario. Backfillear
 *   gastos en meses sin ingresos registrados hunde el saldo sin contrapartida.
 * @param ciclos Ciclos materializados de TODAS las tarjetas (sin filtrar), ya
 *   asegurados por el llamador (asegurarCiclos). Se filtran por tarjeta acá
 *   adentro con `ciclosDeMetodo`. Sin ciclos para una tarjeta (o sin ciclo que
 *   contenga el día de cobro), cae a `expectedChargeDate` — el fallback.
 */
export function computeMissingAutomaticCharges(
  plans: RecurringPlan[],
  methods: PaymentMethod[],
  transactions: Pick<Transaction, 'recurring_plan_id' | 'date' | 'cycle_id' | 'purchase_date'>[],
  floorMonth: string,
  now: Date = new Date(),
  ciclos: CreditCardCycle[] = [],
): MissingCharge[] {
  const methodsById = new Map(methods.map((m) => [m.id, m]))
  const today = startOfDay(now)
  const currentMonth = format(today, 'yyyy-MM')
  const missing: MissingCharge[] = []

  for (const plan of plans) {
    if (!plan.is_active) continue
    const method = plan.payment_method_id ? methodsById.get(plan.payment_method_id) : undefined
    if (!method || !isAutomaticPlan(plan, method)) continue

    const ciclosDelMetodo = ciclosDeMetodo(method.id, ciclos)
    const planMonth = String(plan.created_at).slice(0, 7)
    const transaccionesDelPlan = transactions.filter((t) => t.recurring_plan_id === plan.id)
    // Reparto por regimen, no por clave: una fila con fecha de compra aporta SOLO
    // su mes de consumo exacto, y ninguna de las dos claves aproximadas.
    const conFechaDeCompra = transaccionesDelPlan.filter((t) => t.purchase_date)
    const sinFechaDeCompra = transaccionesDelPlan.filter((t) => !t.purchase_date)
    const cubiertosPorMesDeCompra = new Set(
      conFechaDeCompra.map((t) => String(t.purchase_date).slice(0, 7)),
    )
    // Las aproximadas, solo sobre las filas sin fecha de compra. Entre esas dos SI
    // va un OR: una misma fila aporta las dos (si tiene resumen) porque para ellas
    // el mes de consumo se reconstruye y ninguna de las dos claves alcanza sola.
    const cubiertosPorCiclo = new Set(
      sinFechaDeCompra.filter((t) => t.cycle_id).map((t) => t.cycle_id as string),
    )
    const cubiertosPorMes = new Set(
      sinFechaDeCompra.map((t) => String(t.date).slice(0, 7)),
    )

    let cursor = planMonth > floorMonth ? planMonth : floorMonth
    while (cursor <= currentMonth) {
      const chargeDay = String(chargeDayOf(plan, cursor)).padStart(2, '0')
      // El cobro del mes en curso todavía puede no haber ocurrido: la app no
      // afirma un débito que la tarjeta no hizo.
      if (startOfDay(parseLocalDate(`${cursor}-${chargeDay}`)) > today) break

      const porCiclo = expectedChargeDatePorCiclo(plan, cursor, ciclosDelMetodo)
      const date = porCiclo?.date ?? expectedChargeDate(plan, method, cursor)
      const cycleId = porCiclo?.cycleId ?? null
      // La clave exacta se mira contra el CURSOR (el mes de consumo), no contra
      // la fecha prevista: es el unico dato que no depende de a que resumen cae
      // hoy el cobro, que es justo lo que declarar un resumen mueve. Las dos
      // aproximadas van con OR entre si, y solo pueden matchear filas que no
      // tienen fecha de compra — ver el comentario de la funcion.
      const yaEsta =
        cubiertosPorMesDeCompra.has(cursor) ||
        (cycleId != null && cubiertosPorCiclo.has(cycleId)) ||
        cubiertosPorMes.has(date.slice(0, 7))
      if (!yaEsta) {
        missing.push({ planId: plan.id, month: cursor, date, cycleId })
      }
      cursor = format(addMonths(parseLocalDate(`${cursor}-01`), 1), 'yyyy-MM')
    }
  }

  return missing
}

/**
 * Si el formulario de mensualidades tiene que pedir el día de cobro.
 *
 * En CRÉDITO no: la plata sale cuando se paga el resumen, así que "¿qué día te
 * lo cobran?" se lee como una pregunta sobre el pago y no lo es. Internamente el
 * día servía para elegir a qué resumen imputar el cargo, pero nadie lo cargó
 * nunca --las 20 mensualidades de crédito de producción lo tienen en NULL-- y
 * `chargeDayOf` ya cae al día 1, así que ocultarlo no cambia ningún número.
 *
 * En efectivo tampoco: no hay cuenta ni ciclo del que salga la plata.
 */
export function pideDiaDeCobro(method: PaymentMethod | undefined): boolean {
  if (!method) return false
  return method.type !== 'credit' && method.type !== 'cash'
}
