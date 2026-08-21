// src/lib/finance/creditCycle.ts
import { addMonths, setDate, subMonths, isBefore, startOfDay } from 'date-fns';
import { parseLocalDate } from '@/lib/utils/dates';
import type { PaymentMethod } from '@/types/database';
import type { ProcessedTransaction } from './types';

/**
 * Determina si un gasto (transaction) pertenece al "mes actual" según su tipo y método de pago.
 *
 * Lógica:
 * 1. Si es cuota de plan (installment_plan_id) en tarjeta de crédito:
 *    -> Pertenece al mes si su fecha cae en el mes de VENCIMIENTO (payment_day)
 *       de la tarjeta. Se calcula según closing_day/payment_day.
 *
 * 2. Para todo lo demás:
 *    -> Mes calendario simple (basado en today's month)
 *
 * Ejemplo:
 * - Tarjeta cierra día 24, vence día 6
 * - Cuota registrada el 10 de marzo (durante el ciclo de cierre 24-23)
 * - Pertenece al mes de vencimiento = ABRIL (día 6)
 * - Si hoy es 19 de marzo, esta cuota SÍ se incluye en "mes actual" (si vence en abril)
 * - Si hoy es 19 de abril, esta cuota SÍ se incluye en "mes actual" (mes de vencimiento actual)
 *
 * @param t - Transaction a evaluar
 * @param methods - Array de PaymentMethod para lookup
 * @param now - Fecha de referencia (típicamente today)
 * @returns true si el gasto pertenece al mes actual según su contexto
 */
export function isExpenseInCurrentMonthScope(t: ProcessedTransaction, methods: PaymentMethod[], now: Date) {
  if (t.type !== 'expense') return false;
  // Los pagos de tarjeta no son consumo: no participan de las analíticas de gasto.
  if (t.card_payment_for) return false;
  // Un ajuste de saldo tampoco es consumo: corrige el saldo declarado, no compra nada.
  if (t.is_balance_adjustment) return false;

  // 1. Si es Cuota (Installment) -> Usar lógica de Ciclo de Tarjeta
  // t.date para cuotas siempre es la fecha de pago calculada
  if (t.installment_plan_id) {
    const method = methods.find((m) => m.id === t.payment_method_id);
    if (
      method &&
      method.type === 'credit' &&
      method.default_closing_day &&
      method.default_payment_day
    ) {
      const closingDay = method.default_closing_day;
      const paymentDay = method.default_payment_day;

      // Fecha de cierre de este mes
      const closingDateThisMonth = setDate(now, closingDay);

      // Fecha de pago correspondiente a ese cierre
      let paymentDateForThisCycle = setDate(closingDateThisMonth, paymentDay);
      if (paymentDay <= closingDay) {
        paymentDateForThisCycle = addMonths(paymentDateForThisCycle, 1);
      }

      const localTDate = parseLocalDate(t.date);
      return (
        localTDate.getMonth() === paymentDateForThisCycle.getMonth() &&
        localTDate.getFullYear() === paymentDateForThisCycle.getFullYear()
      );
    }
  }

  // 2. Para todo lo demás: usar periodDate (ya tiene la lógica de ciclo de tarjeta aplicada).
  // periodDate refleja el mes visual correcto tanto para gastos directos de crédito
  // (donde t.date = fecha de pago) como para débito/efectivo (donde t.date = fecha de compra).
  const localPeriodDate = parseLocalDate(t.periodDate);
  return (
    localPeriodDate.getMonth() === now.getMonth() &&
    localPeriodDate.getFullYear() === now.getFullYear()
  );
}

/** Mismo mes y año entre dos fechas. */
export function sameMonthYear(a: Date, b: Date) {
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

/**
 * Fechas de cierre y vencimiento del ciclo VIGENTE de una tarjeta de crédito.
 * El ciclo termina cuando se PAGA (no cuando cierra): mientras no llegue el vencimiento,
 * seguimos en ese ciclo. Devuelve undefined si el método no es crédito con ciclo configurado.
 *
 * Como `transactions.date` de crédito ya es la fecha de vencimiento calculada
 * (ver calculateCreditPaymentDate), un movimiento pertenece a este ciclo sii su
 * `t.date` cae en el mismo mes/año que `nextPaymentDate`.
 */
export function getCreditCycleDates(
  method: PaymentMethod,
  now: Date
): { nextClosingDate: Date; nextPaymentDate: Date } | undefined {
  if (
    method.type !== 'credit' ||
    !method.default_closing_day ||
    !method.default_payment_day
  ) {
    return undefined;
  }
  const closingDay = method.default_closing_day;
  const paymentDay = method.default_payment_day;

  // El ciclo avanza al siguiente resumen SOLO cuando el vencimiento ya pasó
  // (es estrictamente anterior a hoy). El día exacto del vencimiento sigue
  // siendo el ciclo vigente: ese día todavía tenés que pagar ese resumen.
  let nextPaymentDate = setDate(now, paymentDay);
  if (isBefore(startOfDay(nextPaymentDate), startOfDay(now))) {
    nextPaymentDate = addMonths(nextPaymentDate, 1);
  }

  // paymentDay > closingDay: cierran en el mismo mes (ej: cierra 10, vence 25).
  // paymentDay <= closingDay: el pago es el mes siguiente al cierre (ej: cierra 19, vence 1).
  const nextClosingDate =
    paymentDay > closingDay
      ? setDate(nextPaymentDate, closingDay)
      : setDate(subMonths(nextPaymentDate, 1), closingDay);

  return { nextClosingDate, nextPaymentDate };
}
