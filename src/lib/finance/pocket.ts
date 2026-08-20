// Modelo de bolsillo: saldo por cuenta anclado a un valor declarado.
// Puro: sin Zustand ni Supabase.
// Spec: docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md
import type { PaymentMethod, InternalTransfer } from '@/types/database';
import type { ProcessedTransaction } from './types';
import { parseLocalDate } from '@/lib/utils/dates';

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
