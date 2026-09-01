// src/lib/finance/balances.ts
import { isAfter, isBefore, isSameMonth, startOfDay, endOfMonth, subMonths } from 'date-fns'
import { parseLocalDate } from '@/lib/utils/dates'
import { getCreditCycleDates, isExpenseInCurrentMonthScope } from '@/lib/finance/creditCycle'
import { ciclosDeMetodo, cicloVigente, type CreditCardCycle } from '@/lib/finance/cycles'
import type { PaymentMethod, RecurringPlan, InternalTransfer } from '@/types/database'
import type { ProcessedTransaction, CreditCardCycleSummary } from './types'

export interface PaymentMethodStatus {
  currentConsumption: number
  fixedCosts: number
  projectedTotal: number
  nextClosingDate?: Date
  nextPaymentDate?: Date
  usdExpenses: number
  arsExpenses: number
}

/**
 * Retorna el estado de consumo de un método de pago.
 *
 * Para tarjetas de crédito:
 * - Calcula el período actual según closing_day/payment_day
 * - Agrupa ingresos, gastos y cuotas del ciclo
 * - Retorna currentConsumption = ingresos - gastos - cuotas - Mensualidades
 *
 * Para débito/efectivo:
 * - Usa mes calendario
 * - currentConsumption es el balance histórico hasta fin de mes
 *
 * Resultado:
 * - currentConsumption: Balance neto del período (consumo real - ingresos)
 * - fixedCosts: Mensualidades activas en este método
 * - projectedTotal: Mismo que currentConsumption (consistencia)
 * - nextClosingDate: Próxima fecha de cierre (solo crédito)
 * - nextPaymentDate: Próxima fecha de vencimiento (solo crédito)
 */
export function computePaymentMethodStatus(
  method: PaymentMethod | undefined,
  transactions: ProcessedTransaction[],
  recurringPlans: RecurringPlan[],
  now: Date,
  cycles: CreditCardCycle[],
  cicloObjetivo?: CreditCardCycle,
): PaymentMethodStatus {
  if (!method)
    return { currentConsumption: 0, fixedCosts: 0, projectedTotal: 0, usdExpenses: 0, arsExpenses: 0 }

  // El resumen sobre el que se calcula: el vigente, o el que pida el llamador
  // (computePendingCreditCards pasa el anterior para el caso vencido).
  const ciclos = ciclosDeMetodo(method.id, cycles)
  const ciclo = cicloObjetivo ?? cicloVigente(ciclos, now)
  const nextClosingDate = ciclo ? parseLocalDate(ciclo.closing_date) : undefined
  const nextPaymentDate = ciclo ? parseLocalDate(ciclo.due_date) : undefined

  // Mensualidades activas del medio (para el bloque "servicios adheridos").
  const fixedCosts = recurringPlans
    .filter((p) => p.payment_method_id === method.id && p.is_active)
    .reduce((acc, p) => acc + Number(p.amount), 0)

  // ===================================================================
  // CRÉDITO CON CICLO → "A pagar en el vencimiento"
  // = gastos que vencen en nextPaymentDate (cuotas + compras + mensualidades) − reintegros.
  // Regla ÚNICA de pertenencia al ciclo: t.cycle_id === ciclo.id. Antes era
  // sameMonthYear(t.date, nextPaymentDate) -- aritmética de mes que no podía
  // representar dos resúmenes vencidos en el mismo mes calendario y se movía
  // sola cada vez que el usuario corregía el día de vencimiento de la tarjeta.
  // ===================================================================
  if (ciclo && nextPaymentDate) {
    const recurringPlanIdsInCycle = new Set<string>()
    let expensesInCycleArs = 0 // total en ARS (USD convertido) → alimenta projectedTotal
    let usdExpenses = 0 // desglose: importe original USD
    let arsExpenses = 0 // desglose: importe ARS puro

    for (const t of transactions) {
      if (t.payment_method_id !== method.id || t.type !== 'expense') continue
      if (t.cycle_id !== ciclo.id) continue
      if (t.recurring_plan_id) recurringPlanIdsInCycle.add(t.recurring_plan_id)
      expensesInCycleArs += Math.abs(Number(t.amount))
      if (t.original_currency === 'USD' && t.original_amount) {
        usdExpenses += Math.abs(Number(t.original_amount))
      } else {
        arsExpenses += Math.abs(Number(t.amount))
      }
    }

    // Mensualidades adheridas al medio que todavía no tienen transacción en el ciclo.
    // (recomputedRecurring ya deja p.amount en ARS, incluso para planes en USD.)
    for (const p of recurringPlans) {
      if (p.payment_method_id !== method.id || !p.is_active) continue
      if (recurringPlanIdsInCycle.has(p.id)) continue
      expensesInCycleArs += Math.abs(Number(p.amount))
      if (p.currency === 'USD' && p.original_amount) {
        usdExpenses += Math.abs(Number(p.original_amount))
      } else {
        arsExpenses += Math.abs(Number(p.amount))
      }
    }

    // Reintegros/ingresos que vencen en el mismo ciclo.
    const refundsInCycle = transactions
      .filter(
        (t) =>
          t.payment_method_id === method.id &&
          t.type === 'income' &&
          t.cycle_id === ciclo.id,
      )
      .reduce((acc, t) => acc + Number(t.amount), 0)

    const amountToPay = expensesInCycleArs - refundsInCycle
    // Contrato existente: projectedTotal negativo = se debe dinero a la tarjeta.
    const netResult = -amountToPay

    return {
      currentConsumption: netResult,
      fixedCosts,
      projectedTotal: netResult,
      nextClosingDate,
      nextPaymentDate,
      usdExpenses,
      arsExpenses,
    }
  }

  // ===================================================================
  // DÉBITO / EFECTIVO (o crédito sin ciclo configurado) → "Saldo disponible"
  // = ingresos históricos − gastos históricos (cuotas hasta fin de mes).
  // No se restan mensualidades futuras: las ya debitadas ya están en los gastos.
  // ===================================================================
  const income = transactions
    .filter((t) => t.payment_method_id === method.id && t.type === 'income')
    .reduce((acc, t) => acc + Number(t.amount), 0)

  const expensesNonInstallment = transactions
    .filter(
      (t) =>
        t.payment_method_id === method.id &&
        t.type === 'expense' &&
        !t.installment_plan_id,
    )
    .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0)

  const installments = transactions
    .filter((t) => {
      if (t.payment_method_id !== method.id || t.type !== 'expense' || !t.installment_plan_id)
        return false
      return parseLocalDate(t.date) <= endOfMonth(now)
    })
    .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0)

  const netResult = income - expensesNonInstallment - installments

  return {
    currentConsumption: netResult,
    fixedCosts,
    projectedTotal: netResult,
    usdExpenses: 0,
    arsExpenses: 0,
  }
}

/**
 * true si existe un pago (card_payment_for) imputado a ESTE resumen.
 *
 * Antes se buscaba por mes del vencimiento, y de ahi salia toda una clase de bug
 * de bordes de mes --el parche de rangoDelMes del 1-sep-2026-- porque una fecha
 * del dia 1 leida como Date cae en el mes anterior en zona negativa. Con el ciclo
 * como entidad la pregunta es directa: el pago apunta a este resumen o no.
 */
export function hasCardPaymentInCycle(
  transactions: ProcessedTransaction[],
  method: PaymentMethod,
  ciclo: CreditCardCycle,
): boolean {
  return transactions.some((t) => t.card_payment_for === method.id && t.cycle_id === ciclo.id)
}

/**
 * Hasta dónde se puede mirar hacia atrás sin contar dos veces: la fecha del
 * último saldo declarado entre las cuentas del bolsillo.
 *
 * Un resumen que venció ANTES de esa fecha ya está reflejado en el saldo que el
 * usuario declaró (si lo pagó, la plata ya no estaba cuando lo declaró), así que
 * retenerlo como compromiso lo restaría dos veces. Ese es exactamente el agujero
 * de -$850.613 del 2026-08-21: el ancla absorbe lo ya pagado y el compromiso lo
 * volvía a restar. Sin ninguna cuenta anclada no hay piso seguro y no se retiene
 * nada, porque el modelo viejo suma desde el primer movimiento y no distingue.
 */
function pisoDeVencidos(paymentMethods: PaymentMethod[]): Date | null {
  const anclas = paymentMethods
    .filter((m) => m.type !== 'credit' && !m.is_personal && m.initial_balance_at)
    .map((m) => startOfDay(parseLocalDate(m.initial_balance_at as string)))
  if (anclas.length === 0) return null
  return anclas.reduce((max, d) => (d > max ? d : max))
}

/**
 * Arma el resumen de UN ciclo, el que corresponda a `referencia`.
 *
 * `referencia` es la fecha desde la que se mira: con `now` sale el ciclo vigente,
 * y con el vencimiento anterior sale ese ciclo. Reusar la misma función para los
 * dos casos es lo que evita una segunda definición de "qué le debo a la tarjeta":
 * la regla de pertenencia al ciclo vive sólo en computePaymentMethodStatus.
 */
function resumenDelCiclo(
  method: PaymentMethod,
  transactions: ProcessedTransaction[],
  recurringPlans: RecurringPlan[],
  referencia: Date,
  now: Date,
  isOverdue: boolean,
  cycles: CreditCardCycle[],
): CreditCardCycleSummary | null {
  // El ciclo sobre el que se arma este resumen: el vigente visto desde `referencia`.
  // Se deriva acá (en vez de recibirlo ya resuelto) para no duplicar la regla de
  // "qué ciclo corresponde a esta fecha" en cada llamador.
  const ciclo = cicloVigente(ciclosDeMetodo(method.id, cycles), referencia)
  const status = computePaymentMethodStatus(method, transactions, recurringPlans, referencia, cycles, ciclo)
  const { projectedTotal, nextPaymentDate, nextClosingDate, usdExpenses, arsExpenses } = status

  // projectedTotal = income - expenses (negative when user owes money to the card)
  if (!ciclo || !nextPaymentDate || projectedTotal >= 0) return null

  // Ciclo cerrado = el cierre ya pasó (o es hoy): el resumen está fijado y a pagar.
  // Ciclo en curso = todavía acumula consumo. Diferencia por qué una tarjeta muestra
  // consumo de un período anterior (cerrado) y otra el del período vigente (en curso).
  const isCycleClosed = nextClosingDate
    ? !isBefore(startOfDay(now), startOfDay(nextClosingDate))
    : false

  // El estado "pagada" se deriva de la existencia de una transacción de pago
  // (card_payment_for) imputada a este resumen (t.cycle_id === ciclo.id).
  const isPaidManually = hasCardPaymentInCycle(transactions, method, ciclo)
  if (isOverdue && isPaidManually) return null

  // Pendiente mientras no se pagó y el vencimiento no pasó. Comparación por
  // día (no por timestamp) para que el día EXACTO del vencimiento siga contando
  // como pendiente, coherente con getCreditCycleDates. Un resumen vencido e impago
  // sigue pendiente por definición: es justo lo que todavía debés.
  const isPending = isOverdue
    ? true
    : !isPaidManually && !isAfter(startOfDay(now), startOfDay(nextPaymentDate))

  return {
    methodId: method.id,
    name: method.name,
    total: Math.abs(projectedTotal),
    totalARS: arsExpenses,
    totalUSD: usdExpenses,
    nextPaymentDate,
    isCycleClosed,
    isPending,
    isPaidManually,
    isOverdue,
  }
}

/**
 * Resumen de ciclo pendiente por cada tarjeta de crédito: el vigente y, si quedó
 * impago, el que ya venció.
 *
 * Lo segundo existe porque `getCreditCycleDates` avanza al siguiente resumen al día
 * siguiente del vencimiento: el viejo desaparecía, el compromiso se liberaba solo y
 * la plata nunca salía de ninguna cuenta, así que el disponible subía por el monto
 * del resumen todos los meses y en silencio (E11 en escenarios-disponible.test.ts).
 * Retenerlo hasta que haya un pago registrado es la lectura conservadora: si el
 * usuario lo pagó y lo marca, el compromiso se libera y el saldo baja a la vez.
 *
 * Sólo se mira UN ciclo hacia atrás. Con dos meses seguidos sin marcar, el más viejo
 * se pierde: alcanza para que el número deje de inflarse mes a mes, y el aviso ya
 * venía apareciendo desde el primero.
 */
export function computePendingCreditCards(
  paymentMethods: PaymentMethod[],
  transactions: ProcessedTransaction[],
  recurringPlans: RecurringPlan[],
  now: Date,
  cycles: CreditCardCycle[],
): CreditCardCycleSummary[] {
  const creditCards = paymentMethods.filter((m) => m.type === 'credit')
  const piso = pisoDeVencidos(paymentMethods)

  return creditCards.reduce<CreditCardCycleSummary[]>((acc, method) => {
    const vigente = resumenDelCiclo(method, transactions, recurringPlans, now, now, false, cycles)
    if (vigente) acc.push(vigente)

    const cicloVigente = getCreditCycleDates(method, now)
    if (piso && cicloVigente) {
      const vencimientoAnterior = subMonths(cicloVigente.nextPaymentDate, 1)
      if (isAfter(startOfDay(vencimientoAnterior), piso)) {
        const vencido = resumenDelCiclo(method, transactions, recurringPlans, vencimientoAnterior, now, true, cycles)
        if (vencido) acc.push(vencido)
      }
    }
    return acc
  }, [])
}

/**
 * Balance global disponible ("Disponible Real").
 *
 * Balance = ingresos históricos
 *         - gastos variables históricos (sin cuotas, sin Mensualidades)
 *         - cuotas YA pagadas (fecha visual <= hoy)
 *         - cuotas que vencen este mes (según ciclo de tarjeta)
 *         - Mensualidades: pagos reales históricos + el compromiso del mes en curso
 *           que aún no registra pago (pendingFixedTotal)
 *         - ahorro transferido internamente
 *
 * Decisiones de diseño:
 * - Cuotas FUTURAS: NO se restan. Todavía no salieron de tu bolsillo.
 *   Solo impactan cuando llega su mes.
 * - Mensualidades: se restan UNA vez (mes actual) porque no generan
 *   transacciones reales. No se multiplican por meses pasados para
 *   evitar inventar datos históricos que no existen en la base.
 * - Pagos de tarjeta (card_payment_for): NO son consumo nuevo, las compras
 *   ya se restaron; el pago solo baja el saldo del medio financiador.
 */
export function computeGlobalBalance(
  transactions: ProcessedTransaction[],
  paymentMethods: PaymentMethod[],
  internalTransfers: InternalTransfer[],
  pendingFixedTotal: number,
  now: Date,
): number {
  const todayStart = startOfDay(now)

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + Number(t.amount), 0)

  // 1. Gastos variables históricos (sin cuotas ni Mensualidades recurrentes).
  //    Se excluyen los pagos de tarjeta (card_payment_for): no son consumo nuevo,
  //    las compras ya se restaron; el pago solo baja el saldo del medio financiador.
  const variableExpenses = transactions
    .filter((t) => t.type === 'expense' && !t.installment_plan_id && !t.recurring_plan_id && !t.card_payment_for)
    .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0)

  // 2. Cuotas pagadas + cuotas que vencen este mes.
  //    - Mes actual: respeta el ciclo de tarjeta (closing/payment day).
  //    - Pasadas: cualquier cuota cuya fecha visual ya pasó.
  //    - Futuras: NO se incluyen.
  const installmentsExpense = transactions
    .filter((t) => {
      if (t.type !== 'expense' || !t.installment_plan_id) return false

      // ¿Es cuota del mes actual según ciclo de tarjeta?
      if (isExpenseInCurrentMonthScope(t, paymentMethods, now)) return true

      // ¿O es cuota de un mes anterior (ya pasó)?
      const visualDateStr = t.periodDate || t.date
      const visualDate = parseLocalDate(visualDateStr)
      return visualDate < todayStart && !isSameMonth(visualDate, now)
    })
    .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0)

  // 3. Mensualidades: pagos reales históricos (transacciones vinculadas a un
  //    plan recurrente, de cualquier mes) + el compromiso del mes en curso que
  //    aún no registra pago. Los meses pasados restan lo realmente pagado; el
  //    mes actual resta el compromiso completo (pagado o pendiente), así
  //    marcar una mensualidad como pagada NO mueve el balance.
  const recurringPaid = transactions
    .filter((t) => t.type === 'expense' && !!t.recurring_plan_id)
    .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0)
  const recurringExpense = recurringPaid + pendingFixedTotal

  // 4. Ahorros transferidos (tabla separada): dejan de ser saldo gastable.
  const transferredToSavings = internalTransfers.reduce(
    (acc, transfer) => acc + Math.abs(Number(transfer.amount)),
    0,
  )

  return totalIncome - variableExpenses - installmentsExpense - recurringExpense - transferredToSavings
}
