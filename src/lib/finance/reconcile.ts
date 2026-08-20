// Conciliación: cuándo preguntarle al usuario si le falta anotar algo, y qué puede
// haber pasado cuando el saldo declarado no coincide con el calculado.
// Puro: sin Zustand ni Supabase.
// Spec: docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md
import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type { ProcessedTransaction } from './types';
import type { InternalTransfer } from '@/types/database';

/** Por debajo de un peso la diferencia es redondeo, no un movimiento sin anotar. */
const EPSILON = 1;

/**
 * Días desde la última vez que el usuario REGISTRÓ algo: una transacción o una
 * transferencia interna (ej. "Lo mandé a una reserva" en la conciliación).
 *
 * Se mide con `created_at` (cuándo lo cargó) y no con `date`/`real_transfer_date`
 * (cuándo pasó): un gasto del mes pasado anotado hoy es actividad de hoy, y una cuota
 * con fecha futura no es actividad de nadie. `null` = todavía no registró nada.
 *
 * Sin esto, resolver un drift con "Lo mandé a una reserva" (que solo escribe en
 * `internal_transfers`, no en `transactions`) no silenciaba el recordatorio: el
 * usuario acababa de conciliar y la app le seguía preguntando si le faltaba anotar algo.
 */
export function daysSinceLastRegistration(
  transactions: ProcessedTransaction[],
  now: Date,
  transfers: Pick<InternalTransfer, 'created_at'>[] = [],
): number | null {
  let ultimo: number | null = null;
  const considerar = (createdAt: string | null | undefined) => {
    if (!createdAt) return;
    const ts = new Date(createdAt).getTime();
    if (Number.isNaN(ts)) return;
    if (ultimo === null || ts > ultimo) ultimo = ts;
  };
  for (const t of transactions) considerar(t.created_at);
  for (const tr of transfers) considerar(tr.created_at);
  if (ultimo === null) return null;
  return Math.max(0, differenceInCalendarDays(startOfDay(now), startOfDay(new Date(ultimo))));
}

export type ReconcileOption = 'transfer' | 'expense' | 'income' | 'adjustment';

/**
 * Qué pudo haber pasado, según hacia dónde no cierra.
 * `difference` = saldo declarado − saldo calculado.
 * - Negativa: la app cree que tenés más de lo que tenés → salió plata sin anotar.
 * - Positiva: entró plata sin anotar. "Mandarlo al ahorro" no aplica: nada salió.
 */
export function reconcileOptionsFor(difference: number): ReconcileOption[] {
  if (Math.abs(difference) < EPSILON) return [];
  return difference < 0 ? ['transfer', 'expense', 'adjustment'] : ['income', 'adjustment'];
}

export function reconcileHeadline(difference: number): string {
  if (Math.abs(difference) < EPSILON) return 'El saldo coincide';
  return difference < 0 ? 'Te falta anotar una salida' : 'Te falta anotar una entrada';
}
