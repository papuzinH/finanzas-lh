// src/lib/finance/prepare.ts
import type { Transaction, PaymentMethod, RecurringPlan, ExchangeRate } from '@/types/database';
import type { ProcessedTransaction, DolarBlue } from './types';
import type { CreditCardCycle } from './cycles';

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
 *
 * `methods` queda sin uso dentro de la función tras retirar la heurística del `+2`:
 * no se saca de la firma acá (lo consumen 2 llamadores y sacarlo mezcla dos cambios
 * en el mismo diff) — se retira en el Plan 2, junto a la limpieza de getCreditCycleDates.
 */
export function prepareTransactions(
  raw: Transaction[],
  _methods: PaymentMethod[],
  exchangeRates: ExchangeRate[],
  dolarBlue: DolarBlue | null,
  cycles: CreditCardCycle[],
): ProcessedTransaction[] {
  const ciclosPorId = new Map(cycles.map((c) => [c.id, c]));

  return raw.map((t) => {
    // El mes visual de un consumo de credito es el mes de CIERRE de su resumen.
    // Antes se adivinaba mirando el dia del mes de t.date contra
    // `default_payment_day + 2` --un +2 sin justificacion escrita--, que ademas
    // fallaba en cuanto el vencimiento real se movia dentro del mes.
    // Sin ciclo (tarjeta sin configurar, o movimiento no-credito) queda t.date.
    const ciclo = t.cycle_id ? ciclosPorId.get(t.cycle_id) : undefined;
    // El ciclo manda para los consumos de credito. Para un ingreso no hay ciclo, y
    // ahi vale income_period: el mes al que el usuario dijo que cuenta ese cobro.
    // Sin declarar (NULL), el mes de la fecha, que es como funciono siempre.
    const periodDate = ciclo ? ciclo.closing_date : (t.income_period ?? t.date);

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
