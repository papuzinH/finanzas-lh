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
import type { PaymentMethod } from '@/types/database'

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

export function filasDeResumen(
  cycleId: string,
  transactions: ProcessedTransaction[],
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

  return { conFecha, sinFecha }
}
