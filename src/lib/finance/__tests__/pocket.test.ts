import { describe, it, expect } from 'vitest';
import { computeAccountBalance, getPeriodEnd, computeCommitments } from '../pocket';
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
    methodId: 'cred', name: 'Tarjeta', total: 100000, totalARS: 100000, totalUSD: 0,
    nextPaymentDate: new Date(2026, 8, 1), isCycleClosed: true, isPending: true, isPaidManually: false,
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
});
