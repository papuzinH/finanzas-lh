// Modelo de bolsillo: saldo por cuenta anclado a un valor declarado.
// Puro: sin Zustand ni Supabase.
// Spec: docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md
import { endOfMonth, endOfWeek, startOfDay } from 'date-fns';
import type { PaymentMethod, InternalTransfer, RecurringPlan } from '@/types/database';
import type { ProcessedTransaction, CreditCardCycleSummary } from './types';
import { parseLocalDate } from '@/lib/utils/dates';
import { computePendingFixedExpenses } from './pending';

export type IncomeRhythm = 'monthly' | 'biweekly' | 'weekly' | 'irregular';

/**
 * Saldo de una cuenta, al día de `now`.
 *
 * Ventana de cómputo: **desde el ancla (inclusive) hasta hoy (inclusive)**.
 * - Antes del ancla: no se cuenta, ya está representado dentro de `initial_balance`.
 * - Sin `initial_balance_at` no hay piso: suma todo el historial hasta hoy, que es el
 *   comportamiento previo al modelo de bolsillo (cuenta "sin anclar").
 * - Después de hoy: no se cuenta. Una cuota que vence en febrero todavía no salió de
 *   la cuenta; restarla haría que el saldo de hoy mienta hacia abajo.
 *
 * El signo lo lleva `type`, NUNCA el monto: `amount` se guarda siempre positivo
 * (verificado contra la base el 2026-08-20: 794 gastos, 0 con monto negativo).
 *
 * Se usa `t.date` (la fecha real del movimiento) y no `periodDate` (la fecha visual del
 * ciclo de tarjeta): el saldo de una cuenta se mueve cuando la plata se mueve. Para los
 * medios no-crédito —los únicos que tienen saldo— ambas coinciden.
 */
export function computeAccountBalance(
  method: PaymentMethod,
  transactions: ProcessedTransaction[],
  transfers: InternalTransfer[],
  now: Date = new Date(),
): number {
  const anchor = method.initial_balance_at ? startOfDay(parseLocalDate(method.initial_balance_at)) : null;
  const base = anchor ? Number(method.initial_balance) : 0;
  const today = startOfDay(now);

  const inWindow = (dateStr: string | null | undefined) => {
    if (!dateStr) return false;
    const d = startOfDay(parseLocalDate(dateStr));
    if (d > today) return false;
    return anchor ? d >= anchor : true;
  };

  const movements = transactions
    .filter((t) => t.payment_method_id === method.id)
    .filter((t) => inWindow(t.date))
    .reduce((acc, t) => {
      const amount = Math.abs(Number(t.amount));
      return t.type === 'income' ? acc + amount : acc - amount;
    }, 0);

  const transfersDelta = transfers.reduce((acc, tr) => {
    if (!inWindow(tr.real_transfer_date)) return acc;
    const amount = Math.abs(Number(tr.amount));
    if (tr.from_payment_method_id === method.id) return acc - amount;
    if (tr.to_payment_method_id === method.id) return acc + amount;
    return acc;
  }, 0);

  return base + movements + transfersDelta;
}

/**
 * Traduce "el saldo que tengo AHORA" al valor que hay que guardar en `initial_balance`.
 *
 * `computeAccountBalance` cuenta los movimientos del día del ancla, así que guardar el
 * saldo declarado tal cual restaría dos veces lo que el usuario ya registró hoy: una
 * dentro del saldo que leyó del banco, otra por la transacción. El ancla que se guarda
 * es entonces el saldo **al comienzo** del día.
 *
 * Invariante: `computeAccountBalance` sobre el medio anclado con este valor devuelve
 * exactamente `declaredBalance`.
 */
export function anchorValueForDeclaredBalance(
  declaredBalance: number,
  method: PaymentMethod,
  transactions: ProcessedTransaction[],
  transfers: InternalTransfer[],
  anchorDate: string,
  now: Date = new Date(),
): number {
  const movimientosDesdeElAncla = computeAccountBalance(
    { ...method, initial_balance: 0, initial_balance_at: anchorDate },
    transactions,
    transfers,
    now,
  );
  return declaredBalance - movimientosDesdeElAncla;
}

export interface CommitmentBreakdown {
  /** Lo que vence dentro del período actual y sale del bolsillo. */
  total: number;
  items: Array<{
    id: string;
    name: string;
    amount: number;
    kind: 'card' | 'fixed';
    /** Solo las tarjetas: el modelo no guarda fecha de vencimiento de las mensualidades. */
    dueDate?: Date;
    isCycleClosed?: boolean;
  }>;
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
  //
  // Va `total` y NO `totalARS`: `totalARS` son sólo los gastos cuya moneda ORIGINAL
  // es el peso, un campo pensado para el desglose visual de la tarjeta ("$X + u$s Y",
  // que no mezcla monedas a propósito). `total` es el resumen entero, con las compras
  // en dólares ya convertidas por `prepareTransactions` — que es lo que el banco te va
  // a cobrar, y lo que registra `payCreditCardCycle` al marcarla pagada.
  //
  // Usar el campo de presentación acá tenía dos efectos, los dos medidos contra
  // producción el 2026-09-01: el disponible quedaba inflado por el valor en pesos de
  // las compras en USD (Visa $63.496 + Mastercard $152.920 = $216.416 de más), y al
  // marcar la tarjeta pagada el disponible CAÍA por esa diferencia, rompiendo el
  // invariante de E8 — el pago bajaba el bolsillo por `total` y el compromiso sólo
  // liberaba `totalARS`. Ver E10 en escenarios-disponible.test.ts.
  for (const card of pendingCards) {
    if (!card.isPending) continue;
    if (withinPeriod(card.nextPaymentDate)) {
      items.push({
        id: card.methodId,
        name: card.name,
        amount: card.total,
        kind: 'card',
        dueDate: card.nextPaymentDate,
        isCycleClosed: card.isCycleClosed,
      });
    } else {
      nextPeriod += card.total;
    }
  }

  return { total: items.reduce((acc, i) => acc + i.amount, 0), items, nextPeriod };
}

export interface AccountBalance {
  methodId: string;
  name: string;
  bucket: 'pocket' | 'reserve';
  balance: number;
  /** false = sin saldo declarado: el saldo se suma desde el primer movimiento (el modelo viejo). */
  anchored: boolean;
}

export interface AvailableInputs {
  paymentMethods: PaymentMethod[];
  transactions: ProcessedTransaction[];
  transfers: InternalTransfer[];
  recurringPlans: RecurringPlan[];
  pendingCards: CreditCardCycleSummary[];
  rhythm: IncomeRhythm;
  now?: Date;
}

export interface AvailableToSpend {
  /** El número central: lo que se puede gastar hoy sin quedar en negativo. */
  available: number;
  pocketTotal: number;
  reserveTotal: number;
  committed: number;
  committedNextPeriod: number;
  commitmentItems: CommitmentBreakdown['items'];
  accounts: AccountBalance[];
}

export function computeAvailableToSpend(inputs: AvailableInputs): AvailableToSpend {
  const { paymentMethods, transactions, transfers, recurringPlans, pendingCards, rhythm } = inputs;
  const now = inputs.now ?? new Date();

  // Las tarjetas de crédito no tienen saldo propio: su deuda se deriva del ciclo.
  // Los compromisos personales ("le debo a Juan") tampoco son cuentas con plata.
  const accounts: AccountBalance[] = paymentMethods
    .filter((m) => m.type !== 'credit' && !m.is_personal)
    .map((m) => ({
      methodId: m.id,
      name: m.name,
      bucket: m.bucket,
      balance: computeAccountBalance(m, transactions, transfers, now),
      anchored: m.initial_balance_at !== null,
    }));

  const pocketTotal = accounts.filter((a) => a.bucket === 'pocket').reduce((acc, a) => acc + a.balance, 0);
  const reserveTotal = accounts.filter((a) => a.bucket === 'reserve').reduce((acc, a) => acc + a.balance, 0);

  const commitments = computeCommitments(recurringPlans, pendingCards, paymentMethods, transactions, rhythm, now);

  return {
    available: pocketTotal - commitments.total,
    pocketTotal,
    reserveTotal,
    committed: commitments.total,
    committedNextPeriod: commitments.nextPeriod,
    commitmentItems: commitments.items,
    accounts,
  };
}
