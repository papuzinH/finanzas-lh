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
 * Cobertura: CADA transacción del plan aporta LAS DOS claves, y un mes está
 * cubierto si coincide cualquiera de ellas (OR). Ninguna transacción se reparte
 * entre una clave y la otra — particionarlas (las que tienen `cycle_id` sólo
 * por resumen, las que no sólo por mes) fue exactamente el agujero del cargo
 * duplicado que este OR viene a tapar.
 *
 * 1. Por `cycle_id`: `transactions.cycle_id` es la única verdad de pertenencia
 *    a un resumen (ver CLAUDE.md), así que si la transacción ya tiene el MISMO
 *    `cycle_id` que predice `expectedChargeDatePorCiclo(M)`, está cubierta.
 * 2. Por MES del `date` de la transacción contra el mes de la fecha prevista.
 *    La regla mira el mes y no la fecha exacta a propósito: si el usuario editó
 *    la fecha a mano, la transacción sigue contando como cobertura.
 *
 * Las tres razones por las que hacen falta las dos claves, sobre todas las
 * transacciones (cada una es un cargo duplicado real que ya se vio o se trazó):
 *
 * - Sólo por mes se rompe con los resúmenes declarados: declarar un ciclo
 *   ACTUALIZA la fila existente (mismo id, nueva fecha) y la transacción ya
 *   posteada se queda con su `date` sin tocar (E13). Si esa fecha vieja cae en
 *   otro mes calendario que el vencimiento declarado, el mes deja de coincidir.
 *   Por `cycle_id` el resumen sigue siendo el mismo.
 * - Sólo por resumen se rompe con las transacciones sin `cycle_id`: las
 *   posteadas antes de que existieran los resúmenes y las de tarjetas sin ciclo
 *   materializado. Y los ciclos se materializan retroactivamente
 *   (`asegurarCiclos` cubre meses pasados), así que la predicción de HOY para
 *   ese mes trae un `cycleId` truthy aunque la transacción vieja no lo tenga:
 *   mirar sólo el bucket que indica `cycleId` la dejaba invisible (54 planes
 *   recurrentes en producción posteados así).
 * - Particionar se rompe cuando cambia la PREDICCIÓN, no la transacción:
 *   declarar el cierre real de un resumen (o `realinearFuturos` al cambiar los
 *   días de la tarjeta) puede mover el día de cobro a OTRO resumen que el que
 *   tiene la transacción ya posteada. Ahí su clave de resumen deja de matchear,
 *   y si además se le negara la clave de mes, el mes de consumo se vería
 *   descubierto y se postearía un segundo gasto real por el mismo mes.
 *
 * Límite conocido: si el resumen nuevo Y su mes de vencimiento difieren los dos
 * de los de la transacción ya posteada, ninguna de las dos claves matchea y el
 * cargo se duplica igual. Cerrarlo del todo pide guardar el mes de consumo en la
 * transacción; hoy se reconstruye, y por eso la cobertura es por aproximación.
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
  transactions: Pick<Transaction, 'recurring_plan_id' | 'date' | 'cycle_id'>[],
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
    // Sin filtrar: cada transaccion entra en LOS DOS sets (las que no tienen
    // resumen solo pueden entrar en el de meses). Particionarlas dejaba a una
    // fila con `cycle_id` aportando una sola clave -- ver el comentario de arriba.
    const cubiertosPorCiclo = new Set(
      transaccionesDelPlan.filter((t) => t.cycle_id).map((t) => t.cycle_id as string),
    )
    const cubiertosPorMes = new Set(
      transaccionesDelPlan.map((t) => String(t.date).slice(0, 7)),
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
      // OR, no either/or ni particion: el resumen que predice HOY puede no ser
      // el que la transaccion tiene guardado (declarar o realinear lo mueve), y
      // el mes de su `date` puede no ser el del vencimiento nuevo. Alcanza con
      // que coincida una de las dos claves — ver el comentario de la funcion.
      const yaEsta = (cycleId != null && cubiertosPorCiclo.has(cycleId)) || cubiertosPorMes.has(date.slice(0, 7))
      if (!yaEsta) {
        missing.push({ planId: plan.id, month: cursor, date, cycleId })
      }
      cursor = format(addMonths(parseLocalDate(`${cursor}-01`), 1), 'yyyy-MM')
    }
  }

  return missing
}
