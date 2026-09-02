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
 * Cobertura: un mes M está cubierto si el plan ya tiene una transacción en el
 * MISMO MES de `expectedChargeDate(M)`. Como cada mes de consumo cae en un
 * resumen distinto, el mes de consumo se reconstruye sin necesidad de guardarlo
 * en la transacción. La regla mira el mes y no la fecha exacta a propósito: si
 * el usuario editó la fecha a mano, la transacción sigue contando como
 * cobertura y no se duplica.
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
  transactions: Pick<Transaction, 'recurring_plan_id' | 'date'>[],
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
    const coveredMonths = new Set(
      transactions
        .filter((t) => t.recurring_plan_id === plan.id)
        .map((t) => String(t.date).slice(0, 7)),
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
      if (!coveredMonths.has(date.slice(0, 7))) {
        missing.push({ planId: plan.id, month: cursor, date, cycleId })
      }
      cursor = format(addMonths(parseLocalDate(`${cursor}-01`), 1), 'yyyy-MM')
    }
  }

  return missing
}
