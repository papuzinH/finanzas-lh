// src/lib/finance/prepare.ts
import { format, getDate, subMonths } from 'date-fns';
import { parseLocalDate } from '@/lib/utils/dates';
import type { Transaction, PaymentMethod, RecurringPlan, ExchangeRate } from '@/types/database';
import type { ProcessedTransaction, DolarBlue } from './types';

/**
 * Resuelve la cotización ARS de un par dado.
 * Prioridad: rate del par en exchange_rates → dólar blue (venta) → fallback (snapshot) → 1.
 */
export function resolveRate(
  pair: string | null,
  exchangeRates: ExchangeRate[],
  dolarBlue: DolarBlue | null,
  fallback?: number | null,
): number {
  if (pair) {
    const r = exchangeRates.find((e) => e.pair === pair);
    if (r && r.rate > 0) return r.rate;
  }
  if (dolarBlue?.venta && dolarBlue.venta > 0) return dolarBlue.venta;
  if (fallback && fallback > 0) return fallback;
  return 1;
}

/**
 * Convierte filas crudas de `transactions` en ProcessedTransaction:
 * calcula periodDate (mes visual según ciclo de crédito) y normaliza amount a ARS.
 * Misma lógica que usaba fetchAllData — extraída para que el servidor la comparta.
 */
export function prepareTransactions(
  raw: Transaction[],
  methods: PaymentMethod[],
  exchangeRates: ExchangeRate[],
  dolarBlue: DolarBlue | null,
): ProcessedTransaction[] {
  return raw.map((t) => {
    const method = methods.find((m) => m.id === t.payment_method_id);
    let periodDate = t.date; // Default: Misma fecha

    if (method && method.type === 'credit') {
      const localTDate = parseLocalDate(t.date);
      const dayOfMonth = getDate(localTDate);

      // t.date = fecha de pago calculada al crear la transacción.
      // Si paymentDay < closingDay: el pago vence el mes SIGUIENTE al cierre,
      // por lo que el período visual corresponde al mes anterior al pago.
      // Si paymentDay >= closingDay: el pago vence el mismo mes del cierre,
      // el período visual ES el mes del pago (sin ajuste).
      if (
        method.default_payment_day &&
        method.default_closing_day &&
        method.default_payment_day < method.default_closing_day &&
        dayOfMonth <= method.default_payment_day + 2
      ) {
        periodDate = format(subMonths(localTDate, 1), 'yyyy-MM-dd');
      }
    }

    const amountArs =
      t.original_currency === 'USD' && t.original_amount != null
        ? t.original_amount * resolveRate(t.rate_pair, exchangeRates, dolarBlue, t.exchange_rate)
        : t.amount;

    return {
      ...t,
      amount: amountArs,
      periodDate, // Usar esta para filtros de mes
      realPaymentDate: t.date, // Usar esta para mostrar "Vence el..."
    };
  });
}

export function prepareRecurringPlans(
  raw: RecurringPlan[],
  exchangeRates: ExchangeRate[],
  dolarBlue: DolarBlue | null,
): RecurringPlan[] {
  return raw.map((plan) => {
    if (plan.currency === 'USD' && plan.original_amount != null) {
      const rate = resolveRate(plan.rate_pair, exchangeRates, dolarBlue, plan.exchange_rate);
      return { ...plan, amount: plan.original_amount * rate };
    }
    return plan;
  });
}
