// Modelo de bolsillo: saldo por cuenta anclado a un valor declarado.
// Puro: sin Zustand ni Supabase.
// Spec: docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md
import { endOfMonth, endOfWeek } from 'date-fns';
import type { PaymentMethod, InternalTransfer, RecurringPlan } from '@/types/database';
import type { ProcessedTransaction, CreditCardCycleSummary } from './types';
import { parseLocalDate } from '@/lib/utils/dates';
import { computePendingFixedExpenses } from './pending';

export type IncomeRhythm = 'monthly' | 'biweekly' | 'weekly' | 'irregular';

/**
 * Saldo de una cuenta.
 *
 * Sin `initial_balance_at` suma todo el historial, que es el comportamiento previo
 * al modelo de bolsillo. Con ancla, parte de `initial_balance` y solo computa lo que
 * pasó desde esa fecha inclusive: lo anterior ya está representado dentro del ancla.
 */
export function computeAccountBalance(
  method: PaymentMethod,
  transactions: ProcessedTransaction[],
  transfers: InternalTransfer[],
): number {
  const anchor = method.initial_balance_at ? parseLocalDate(method.initial_balance_at) : null;
  const base = anchor ? Number(method.initial_balance) : 0;

  const afterAnchor = (dateStr: string | null | undefined) => {
    if (!anchor) return true;
    if (!dateStr) return false;
    return parseLocalDate(dateStr) >= anchor;
  };

  // `amount` ya viene con signo (los gastos son negativos), por eso se suma directo.
  const movements = transactions
    .filter((t) => t.payment_method_id === method.id)
    .filter((t) => afterAnchor(t.periodDate || t.date))
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const transfersDelta = transfers.reduce((acc, tr) => {
    if (!afterAnchor(tr.real_transfer_date)) return acc;
    const amount = Math.abs(Number(tr.amount));
    if (tr.from_payment_method_id === method.id) return acc - amount;
    if (tr.to_payment_method_id === method.id) return acc + amount;
    return acc;
  }, 0);

  return base + movements + transfersDelta;
}

export interface CommitmentBreakdown {
  /** Lo que vence dentro del período actual y sale del bolsillo. */
  total: number;
  items: Array<{ id: string; name: string; amount: number; kind: 'card' | 'fixed' }>;
  /** Lo que vence después del período: no baja el disponible de hoy, pero el usuario tiene que verlo. */
  nextPeriod: number;
}

/**
 * Fin del período de cobro. `null` = sin límite: cuando el ingreso es irregular
 * no hay próximo cobro que asumir, así que se descuenta todo lo comprometido.
 *
 * No se modela la fecha exacta de cobro a propósito: los usuarios cobran el 1°, los
 * últimos días hábiles o el último martes, y algunos normalizan la fecha al cargar.
 * Lo que el cálculo necesita saber no es qué día cobran, sino si hay otro cobro antes
 * de que venza el compromiso.
 */
export function getPeriodEnd(rhythm: IncomeRhythm, now: Date): Date | null {
  if (rhythm === 'irregular') return null;
  if (rhythm === 'weekly') return endOfWeek(now, { weekStartsOn: 1 });
  if (rhythm === 'biweekly') {
    return now.getDate() <= 15
      ? new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59, 999)
      : endOfMonth(now);
  }
  return endOfMonth(now);
}

export function computeCommitments(
  recurringPlans: RecurringPlan[],
  pendingCards: CreditCardCycleSummary[],
  paymentMethods: PaymentMethod[],
  transactions: ProcessedTransaction[],
  rhythm: IncomeRhythm,
  now: Date = new Date(),
): CommitmentBreakdown {
  const periodEnd = getPeriodEnd(rhythm, now);
  const withinPeriod = (d: Date) => periodEnd === null || d <= periodEnd;

  const items: CommitmentBreakdown['items'] = [];
  let nextPeriod = 0;

  // Fijos: solo los que salen del bolsillo. Un fijo de crédito ya está facturado
  // dentro del resumen de su tarjeta; descontarlo aparte lo contaría dos veces.
  const creditMethodIds = new Set(
    paymentMethods.filter((m) => m.type === 'credit').map((m) => m.id),
  );
  const pendingFixed = computePendingFixedExpenses(recurringPlans, transactions, now);
  for (const item of pendingFixed.items) {
    const plan = recurringPlans.find((p) => p.id === item.id);
    if (plan?.payment_method_id && creditMethodIds.has(plan.payment_method_id)) continue;
    items.push({ ...item, kind: 'fixed' });
  }

  // Tarjetas: se descuentan si vencen dentro del período; si no, quedan para el próximo.
  for (const card of pendingCards) {
    if (!card.isPending) continue;
    if (withinPeriod(card.nextPaymentDate)) {
      items.push({ id: card.methodId, name: card.name, amount: card.totalARS, kind: 'card' });
    } else {
      nextPeriod += card.totalARS;
    }
  }

  return { total: items.reduce((acc, i) => acc + i.amount, 0), items, nextPeriod };
}
