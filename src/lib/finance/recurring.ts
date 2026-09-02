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
 * Qué meses de consumo le faltan a cada plan automático.
 *
 * Cobertura: dos claves, evaluadas con OR (nunca either/or por si el `cycleId`
 * de la predicción salió truthy).
 *
 * 1. Por `cycle_id`: `transactions.cycle_id` es la única verdad de pertenencia
 *    a un resumen (ver CLAUDE.md), así que si la transacción ya tiene el MISMO
 *    `cycle_id` que predice `expectedChargeDatePorCiclo(M)`, está cubierta.
 *    Mirar el mes de `date` en vez del `cycle_id` se rompe con resúmenes
 *    declarados: declarar un ciclo ACTUALIZA la fila existente (mismo id,
 *    nueva fecha), y una transacción ya posteada contra la estimación vieja se
 *    queda con su `date` sin tocar (E13) — si esa fecha vieja cae en otro mes
 *    calendario que el vencimiento declarado, el mes deja de coincidir y la
 *    mensualidad se postea de nuevo. Por `cycle_id` el resumen sigue siendo
 *    el mismo.
 * 2. Por MES, para las transacciones sin `cycle_id`: las posteadas antes de
 *    que existieran los resúmenes y las de tarjetas sin ciclo materializado.
 *    Se compara el mes de `date` contra el mes de la fecha prevista, igual que
 *    antes de esta función distinguir por `cycle_id` — la regla mira el mes y
 *    no la fecha exacta a propósito: si el usuario editó la fecha a mano, la
 *    transacción sigue contando como cobertura y no se duplica.
 *
 * El OR importa: los ciclos de una tarjeta se materializan retroactivamente
 * (`asegurarCiclos` cubre meses pasados), así que una transacción vieja SIN
 * `cycle_id` puede convivir con un ciclo YA materializado para ese mismo mes —
 * la predicción de HOY para ese mes trae un `cycleId` truthy aunque la
 * transacción posteada en su momento no lo tenga. Si la cobertura sólo mirara
 * `cubiertosPorCiclo` cuando `cycleId` es truthy, esa transacción vieja
 * quedaría invisible y se duplicaría — exactamente el caso que este cambio
 * tiene que evitar (54 planes recurrentes en producción posteados así).
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
    const cubiertosPorCiclo = new Set(
      transaccionesDelPlan.filter((t) => t.cycle_id).map((t) => t.cycle_id as string),
    )
    const cubiertosPorMes = new Set(
      transaccionesDelPlan.filter((t) => !t.cycle_id).map((t) => String(t.date).slice(0, 7)),
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
      // OR, no either/or: un ciclo puede materializarse DESPUES de que la
      // mensualidad ya se posteo sin cycle_id (el caso de produccion — ver el
      // comentario de la función). Ahí `cycleId` sale truthy (el ciclo ya
      // existe) pero la transacción vieja sigue con `cycle_id` nulo, así que
      // sólo aparece en `cubiertosPorMes`. Mirar nada más el bucket que indica
      // `cycleId` la hubiera dejado afuera y duplicado el cargo.
      const yaEsta = (cycleId != null && cubiertosPorCiclo.has(cycleId)) || cubiertosPorMes.has(date.slice(0, 7))
      if (!yaEsta) {
        missing.push({ planId: plan.id, month: cursor, date, cycleId })
      }
      cursor = format(addMonths(parseLocalDate(`${cursor}-01`), 1), 'yyyy-MM')
    }
  }

  return missing
}
