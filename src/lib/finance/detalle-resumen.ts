//
// El detalle de una tarjeta, resumen por resumen. PURO: sin Zustand ni Supabase.
//
// NO calcula totales. El total de un resumen sale de computePaymentMethodStatus
// con `cicloObjetivo` -- una segunda definicion de "cuanto debo" es exactamente lo
// que produjo el falso "bajaste" del 31-ago.
//
// Spec: docs/superpowers/specs/2026-09-02-detalle-por-resumen-design.md
import { formatLocalDate } from '@/lib/utils/dates'
import { ciclosDeMetodo, type CreditCardCycle } from './cycles'
import { hasCardPaymentInCycle } from './balances'
import type { ProcessedTransaction } from './types'
import type { PaymentMethod, RecurringPlan } from '@/types/database'

export type EstadoDeResumen = 'proyectado' | 'pendiente' | 'vencido' | 'pagado'

export type ResumenNavegable = {
  id: string
  closingDate: string
  dueDate: string
  source: 'generated' | 'declared'
  estado: EstadoDeResumen
}

export type FilasDeResumen = {
  /** Ordenadas ascendente por purchase_date: el orden en que el banco imprime el resumen. */
  conFecha: ProcessedTransaction[]
  /** Anteriores a que la app guardara la fecha de compra. No se pueden intercalar. */
  sinFecha: ProcessedTransaction[]
  /**
   * Mensualidades que el TOTAL del resumen ya cuenta y que todavia no tienen
   * transaccion propia en ese ciclo. No son movimientos: son lo que falta debitar.
   * Sin ellas la cabecera decia $16.000 y las filas sumaban $1.000.
   */
  porDebitar: RecurringPlan[]
}

/**
 * El estado se DERIVA; no hay columna. El orden de las guardas importa: un resumen
 * pagado no es "vencido" aunque su vencimiento haya pasado.
 */
function estadoDeResumen(
  ciclo: CreditCardCycle,
  method: PaymentMethod,
  transactions: ProcessedTransaction[],
  hoy: string,
): EstadoDeResumen {
  if (hasCardPaymentInCycle(transactions, method, ciclo)) return 'pagado'
  // El dia EXACTO del cierre el resumen ya quedo fijado (el ciclo corre hasta las
  // 23:59 de esa fecha, misma regla del borde que E16).
  if (ciclo.closing_date > hoy) return 'proyectado'
  // El dia EXACTO del vencimiento todavia lo debes: sigue pendiente.
  if (ciclo.due_date < hoy) return 'vencido'
  return 'pendiente'
}

export function listarResumenesDeTarjeta(
  method: PaymentMethod,
  ciclos: CreditCardCycle[],
  transactions: ProcessedTransaction[],
  now: Date,
): ResumenNavegable[] {
  const hoy = formatLocalDate(now)
  // ciclosDeMetodo ya filtra por tarjeta y ordena ascendente por closing_date.
  return ciclosDeMetodo(method.id, ciclos).map((c) => ({
    id: c.id,
    closingDate: c.closing_date,
    dueDate: c.due_date,
    source: c.source,
    estado: estadoDeResumen(c, method, transactions, hoy),
  }))
}

/**
 * Las mensualidades que `computePaymentMethodStatus` INYECTA en el total de un ciclo:
 * las activas del medio que no tienen transaccion propia en ese ciclo. La regla se
 * copia tal cual de balances.ts (el bloque "Mensualidades adheridas al medio que
 * todavia no tienen transaccion en el ciclo") -- si las dos se separan, la cabecera
 * y las filas vuelven a decir numeros distintos.
 *
 * El fix va de este lado, el del consumidor nuevo: computePaymentMethodStatus alimenta
 * el disponible del home y Compromisos para todos los usuarios, y tocarla moveria
 * numeros de gente real.
 */
export function mensualidadesPorDebitar(
  method: PaymentMethod,
  cycleId: string,
  transactions: ProcessedTransaction[],
  recurringPlans: RecurringPlan[],
): RecurringPlan[] {
  const conFilaEnElCiclo = new Set<string>()
  for (const t of transactions) {
    if (t.payment_method_id !== method.id || t.type !== 'expense') continue
    if (t.cycle_id !== cycleId) continue
    if (t.recurring_plan_id) conFilaEnElCiclo.add(t.recurring_plan_id)
  }
  return recurringPlans.filter(
    (p) => p.payment_method_id === method.id && p.is_active && !conFilaEnElCiclo.has(p.id),
  )
}

export function filasDeResumen(
  cycleId: string,
  transactions: ProcessedTransaction[],
  method: PaymentMethod,
  recurringPlans: RecurringPlan[],
): FilasDeResumen {
  // El pago del resumen sale del medio que lo financia: no es consumo de la tarjeta
  // y no va en la lista que se cotea contra el papel.
  const delCiclo = transactions.filter((t) => t.cycle_id === cycleId && !t.card_payment_for)

  const conFecha = delCiclo
    .filter((t) => Boolean(t.purchase_date))
    .sort((a, b) => {
      const porFecha = (a.purchase_date ?? '').localeCompare(b.purchase_date ?? '')
      return porFecha !== 0 ? porFecha : (a.created_at ?? '').localeCompare(b.created_at ?? '')
    })

  const sinFecha = delCiclo.filter((t) => !t.purchase_date)

  return {
    conFecha,
    sinFecha,
    porDebitar: mensualidadesPorDebitar(method, cycleId, transactions, recurringPlans),
  }
}
