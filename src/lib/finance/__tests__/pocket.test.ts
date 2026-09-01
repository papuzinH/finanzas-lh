import { describe, it, expect } from 'vitest';
import { computeAccountBalance, getPeriodEnd, computeCommitments, computeAvailableToSpend, anchorValueForDeclaredBalance } from '../pocket';
import type { PaymentMethod, InternalTransfer, RecurringPlan } from '@/types/database';
import type { ProcessedTransaction, CreditCardCycleSummary } from '../types';

const method = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: 'm1', user_id: 'u1', name: 'Billetera', type: 'debit',
  default_closing_day: null, default_payment_day: null, created_at: '2026-01-01',
  is_personal: false, is_default: true,
  bucket: 'pocket', initial_balance: 0, initial_balance_at: null,
  ...over,
} as PaymentMethod);

const tx = (over: Partial<ProcessedTransaction>): ProcessedTransaction => ({
  id: 't1', user_id: 'u1', type: 'expense', amount: -1000, date: '2026-08-10',
  periodDate: '2026-08-10', realPaymentDate: '2026-08-10',
  payment_method_id: 'm1', category_id: 'c1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  is_balance_adjustment: false,
  ...over,
} as ProcessedTransaction);

describe('computeAccountBalance', () => {
  it('sin ancla suma todo el historial del medio', () => {
    const r = computeAccountBalance(method(), [
      tx({ id: 'a', type: 'income', amount: 50000 }),
      tx({ id: 'b', type: 'expense', amount: -20000 }),
    ], []);
    expect(r).toBe(30000);
  });

  it('con ancla parte del saldo inicial e ignora lo anterior a la fecha', () => {
    const m = method({ initial_balance: 100000, initial_balance_at: '2026-08-01' });
    const r = computeAccountBalance(m, [
      tx({ id: 'viejo', type: 'expense', amount: -999999, date: '2026-07-15', periodDate: '2026-07-15' }),
      tx({ id: 'nuevo', type: 'expense', amount: -30000, date: '2026-08-10', periodDate: '2026-08-10' }),
    ], []);
    expect(r).toBe(70000);
  });

  it('incluye el movimiento del mismo dia del ancla', () => {
    const m = method({ initial_balance: 100000, initial_balance_at: '2026-08-01' });
    const r = computeAccountBalance(m, [
      tx({ id: 'mismo', type: 'expense', amount: -10000, date: '2026-08-01', periodDate: '2026-08-01' }),
    ], []);
    expect(r).toBe(90000);
  });

  it('resta transferencias salientes y suma entrantes', () => {
    const transfers = [
      { id: 'tr1', amount: 20000, from_payment_method_id: 'm1', to_payment_method_id: 'm2', real_transfer_date: '2026-08-05' },
      { id: 'tr2', amount: 5000, from_payment_method_id: 'm2', to_payment_method_id: 'm1', real_transfer_date: '2026-08-06' },
    ] as InternalTransfer[];
    const r = computeAccountBalance(method({ initial_balance: 100000, initial_balance_at: '2026-08-01' }), [], transfers);
    expect(r).toBe(85000);
  });

  it('las transferencias sin origen ni destino (previas a la migracion) no afectan a ningun medio', () => {
    const transfers = [
      { id: 'viejo', amount: 50000, from_payment_method_id: null, to_payment_method_id: null, real_transfer_date: '2026-08-05' },
    ] as InternalTransfer[];
    const r = computeAccountBalance(method({ initial_balance: 100000, initial_balance_at: '2026-08-01' }), [], transfers);
    expect(r).toBe(100000);
  });

  it('ignora transacciones de otro medio', () => {
    const r = computeAccountBalance(method(), [
      tx({ id: 'otro', type: 'expense', amount: -70000, payment_method_id: 'm9' }),
    ], []);
    expect(r).toBe(0);
  });

  const NOW_T1 = new Date(2026, 7, 20); // 20-ago-2026

  it('resta un gasto guardado con monto POSITIVO: el signo lo lleva `type`, no el monto', () => {
    // Convencion real de la base (verificada 2026-08-20): 794 gastos, 0 con monto negativo.
    const r = computeAccountBalance(method(), [
      tx({ id: 'a', type: 'income', amount: 50000, date: '2026-08-10', periodDate: '2026-08-10' }),
      tx({ id: 'b', type: 'expense', amount: 20000, date: '2026-08-10', periodDate: '2026-08-10' }),
    ], [], NOW_T1);
    expect(r).toBe(30000);
  });

  it('ignora los movimientos futuros: una cuota que vence en 2027 todavia no salio de la cuenta', () => {
    const m = method({ initial_balance: 100000, initial_balance_at: '2026-08-01' });
    const r = computeAccountBalance(m, [
      tx({ id: 'hoy', type: 'expense', amount: 10000, date: '2026-08-20', periodDate: '2026-08-20' }),
      tx({ id: 'futura', type: 'expense', amount: 999999, date: '2027-02-01', periodDate: '2027-02-01' }),
    ], [], NOW_T1);
    expect(r).toBe(90000);
  });

  it('ignora las transferencias con fecha futura', () => {
    const transfers = [
      { id: 'tr1', amount: 20000, from_payment_method_id: 'm1', to_payment_method_id: 'm2', real_transfer_date: '2026-08-05' },
      { id: 'tr2', amount: 777777, from_payment_method_id: 'm1', to_payment_method_id: 'm2', real_transfer_date: '2026-12-01' },
    ] as InternalTransfer[];
    const r = computeAccountBalance(
      method({ initial_balance: 100000, initial_balance_at: '2026-08-01' }),
      [], transfers, NOW_T1,
    );
    expect(r).toBe(80000);
  });

  it('el movimiento de HOY si cuenta (el techo es hoy inclusive)', () => {
    const m = method({ initial_balance: 100000, initial_balance_at: '2026-08-01' });
    const r = computeAccountBalance(m, [
      tx({ id: 'hoy', type: 'expense', amount: 5000, date: '2026-08-20', periodDate: '2026-08-20' }),
    ], [], NOW_T1);
    expect(r).toBe(95000);
  });
});

describe('getPeriodEnd', () => {
  const now = new Date(2026, 7, 20); // 20-ago-2026

  it('monthly termina el ultimo dia del mes', () => {
    expect(getPeriodEnd('monthly', now)?.getDate()).toBe(31);
    expect(getPeriodEnd('monthly', now)?.getMonth()).toBe(7);
  });

  it('biweekly: del 16 en adelante termina a fin de mes', () => {
    expect(getPeriodEnd('biweekly', now)?.getDate()).toBe(31);
  });

  it('biweekly: antes del 16 termina el 15', () => {
    expect(getPeriodEnd('biweekly', new Date(2026, 7, 3))?.getDate()).toBe(15);
  });

  it('irregular no tiene fin', () => {
    expect(getPeriodEnd('irregular', now)).toBeNull();
  });
});

describe('computeCommitments', () => {
  const debitMethod = method({ id: 'deb', type: 'debit' });
  const creditMethod = method({ id: 'cred', type: 'credit', bucket: 'pocket' });
  const methods = [debitMethod, creditMethod];
  const now = new Date(2026, 7, 20);

  const plan = (over: Partial<RecurringPlan>): RecurringPlan => ({
    id: 'p1', user_id: 'u1', description: 'Fijo', amount: 10000,
    is_active: true, payment_method_id: 'deb', category_id: 'c1',
    currency: 'ARS', original_amount: null, created_at: '2026-01-01',
    ...over,
  } as RecurringPlan);

  const card = (over: Partial<CreditCardCycleSummary>): CreditCardCycleSummary => ({
    cycleId: 'c1', methodId: 'cred', name: 'Tarjeta', total: 100000, totalARS: 100000, totalUSD: 0,
    nextPaymentDate: new Date(2026, 8, 1), isCycleClosed: true, isPending: true, isPaidManually: false, isOverdue: false,
    ...over,
  });

  it('descuenta un fijo de debito no pagado', () => {
    const r = computeCommitments([plan({ amount: 25000 })], [], methods, [], 'monthly', now);
    expect(r.total).toBe(25000);
  });

  it('NO descuenta un fijo de credito: ya viaja en el resumen', () => {
    const r = computeCommitments([plan({ amount: 25000, payment_method_id: 'cred' })], [], methods, [], 'monthly', now);
    expect(r.total).toBe(0);
  });

  it('descuenta la tarjeta que vence dentro del periodo', () => {
    const r = computeCommitments([], [card({ nextPaymentDate: new Date(2026, 7, 25) })], methods, [], 'monthly', now);
    expect(r.total).toBe(100000);
    expect(r.nextPeriod).toBe(0);
  });

  it('la tarjeta que vence despues del periodo va a nextPeriod, no al total', () => {
    const r = computeCommitments([], [card({ nextPaymentDate: new Date(2026, 8, 4) })], methods, [], 'monthly', now);
    expect(r.total).toBe(0);
    expect(r.nextPeriod).toBe(100000);
  });

  it('con ritmo irregular descuenta todo, sin importar el vencimiento', () => {
    const r = computeCommitments(
      [plan({ amount: 40000 })],
      [card({ nextPaymentDate: new Date(2026, 8, 4), totalARS: 150000, total: 150000 })],
      methods, [], 'irregular', now,
    );
    expect(r.total).toBe(190000);
    expect(r.nextPeriod).toBe(0);
  });

  it('ignora una tarjeta ya pagada', () => {
    const r = computeCommitments([], [card({ isPending: false, nextPaymentDate: new Date(2026, 7, 25) })], methods, [], 'monthly', now);
    expect(r.total).toBe(0);
  });

  it('el item de tarjeta lleva su vencimiento y si el ciclo esta cerrado', () => {
    const vence = new Date(2026, 7, 25);
    const r = computeCommitments([], [card({ nextPaymentDate: vence, isCycleClosed: true })], methods, [], 'monthly', now);
    const item = r.items.find((i) => i.kind === 'card');
    expect(item?.dueDate).toEqual(vence);
    expect(item?.isCycleClosed).toBe(true);
  });

  it('el item de un fijo no lleva vencimiento: el modelo no guarda esa fecha', () => {
    const r = computeCommitments([plan({ amount: 25000 })], [], methods, [], 'monthly', now);
    expect(r.items.find((i) => i.kind === 'fixed')?.dueDate).toBeUndefined();
  });
});

describe('computeAvailableToSpend', () => {
  const now = new Date(2026, 7, 20);
  const pocket = method({ id: 'poc', name: 'Billetera', bucket: 'pocket', initial_balance: 150000, initial_balance_at: '2026-08-01' });
  const reserve = method({ id: 'res', name: 'Mis dolares', bucket: 'reserve', initial_balance: 500000, initial_balance_at: '2026-08-01' });

  it('suma solo los medios del bolsillo', () => {
    const r = computeAvailableToSpend({
      paymentMethods: [pocket, reserve], transactions: [], transfers: [],
      recurringPlans: [], pendingCards: [], rhythm: 'monthly', now,
    });
    expect(r.pocketTotal).toBe(150000);
    expect(r.available).toBe(150000);
  });

  it('expone las reservas aparte, sin sumarlas al disponible', () => {
    const r = computeAvailableToSpend({
      paymentMethods: [pocket, reserve], transactions: [], transfers: [],
      recurringPlans: [], pendingCards: [], rhythm: 'monthly', now,
    });
    expect(r.reserveTotal).toBe(500000);
    expect(r.accounts.find((a) => a.methodId === 'res')?.bucket).toBe('reserve');
  });

  it('las tarjetas de credito no suman saldo al bolsillo', () => {
    const credit = method({ id: 'cred', type: 'credit', bucket: 'pocket', initial_balance: 0, initial_balance_at: null });
    const r = computeAvailableToSpend({
      paymentMethods: [pocket, credit], transactions: [], transfers: [],
      recurringPlans: [], pendingCards: [], rhythm: 'monthly', now,
    });
    expect(r.pocketTotal).toBe(150000);
  });
});

describe('anchorValueForDeclaredBalance', () => {
  const NOW_T3 = new Date(2026, 7, 20); // 20-ago-2026
  const HOY = '2026-08-20';

  it('sin movimientos del dia, el ancla ES el saldo declarado', () => {
    const r = anchorValueForDeclaredBalance(10600, method({ id: 'm1' }), [], [], HOY, NOW_T3);
    expect(r).toBe(10600);
  });

  it('INVARIANTE: anclar con lo declarado deja el saldo calculado exactamente en lo declarado', () => {
    const base = method({ id: 'm1' });
    const txs = [
      tx({ id: 'hoy', type: 'expense', amount: 5000, date: HOY, periodDate: HOY }),
      tx({ id: 'ayer', type: 'expense', amount: 7000, date: '2026-08-19', periodDate: '2026-08-19' }),
    ];
    const value = anchorValueForDeclaredBalance(10600, base, txs, [], HOY, NOW_T3);
    const anclado = { ...base, initial_balance: value, initial_balance_at: HOY };
    expect(computeAccountBalance(anclado, txs, [], NOW_T3)).toBe(10600);
  });

  it('un movimiento registrado DESPUES del ancla, el mismo dia, si mueve el saldo', () => {
    const base = method({ id: 'm1' });
    const previos = [tx({ id: 'hoy', type: 'expense', amount: 5000, date: HOY, periodDate: HOY })];
    const value = anchorValueForDeclaredBalance(10600, base, previos, [], HOY, NOW_T3);
    const anclado = { ...base, initial_balance: value, initial_balance_at: HOY };
    const nuevo = tx({ id: 'nuevo', type: 'expense', amount: 1000, date: HOY, periodDate: HOY });
    expect(computeAccountBalance(anclado, [...previos, nuevo], [], NOW_T3)).toBe(9600);
  });

  it('descuenta tambien las transferencias del dia del ancla', () => {
    const base = method({ id: 'm1' });
    const transfers = [
      { id: 'tr', amount: 3000, from_payment_method_id: 'm1', to_payment_method_id: 'm2', real_transfer_date: HOY },
    ] as InternalTransfer[];
    const value = anchorValueForDeclaredBalance(10600, base, [], transfers, HOY, NOW_T3);
    expect(value).toBe(13600);
    const anclado = { ...base, initial_balance: value, initial_balance_at: HOY };
    expect(computeAccountBalance(anclado, [], transfers, NOW_T3)).toBe(10600);
  });

  it('ignora los movimientos de OTRO medio', () => {
    const r = anchorValueForDeclaredBalance(
      10600, method({ id: 'm1' }),
      [tx({ id: 'otro', type: 'expense', amount: 99999, payment_method_id: 'm9', date: HOY, periodDate: HOY })],
      [], HOY, NOW_T3,
    );
    expect(r).toBe(10600);
  });
});

describe('computeAvailableToSpend · anclaje', () => {
  const now = new Date(2026, 7, 20);

  it('cada cuenta dice si esta anclada o no', () => {
    const anclada = method({ id: 'a', initial_balance: 1000, initial_balance_at: '2026-08-01' });
    const suelta = method({ id: 'b', initial_balance: 0, initial_balance_at: null });
    const r = computeAvailableToSpend({
      paymentMethods: [anclada, suelta], transactions: [], transfers: [],
      recurringPlans: [], pendingCards: [], rhythm: 'monthly', now,
    });
    expect(r.accounts.find((a) => a.methodId === 'a')?.anchored).toBe(true);
    expect(r.accounts.find((a) => a.methodId === 'b')?.anchored).toBe(false);
  });

  it('un compromiso personal no es una cuenta con plata: queda afuera del bolsillo', () => {
    // "Le debo a Juan" es un medio is_personal. Sumarlo al bolsillo diria que tenes
    // plata que no tenes (o que te falta plata que no te falta).
    const cuenta = method({ id: 'a', initial_balance: 100000, initial_balance_at: '2026-08-01' });
    const juan = method({ id: 'juan', name: 'Le debo a Juan', is_personal: true });
    const r = computeAvailableToSpend({
      paymentMethods: [cuenta, juan],
      transactions: [tx({ id: 'g', type: 'expense', amount: 30000, payment_method_id: 'juan', date: '2026-08-10', periodDate: '2026-08-10' })],
      transfers: [], recurringPlans: [], pendingCards: [], rhythm: 'monthly', now,
    });
    expect(r.accounts.map((a) => a.methodId)).toEqual(['a']);
    expect(r.pocketTotal).toBe(100000);
  });
});
