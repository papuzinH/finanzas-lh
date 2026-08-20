// Los 7 perfiles del spec 2026-08-20-disponible-real-anclado-design.md.
// Datos ficticios y en pesos: el repo es publico y las reservas en moneda
// extranjera estan fuera del alcance de este diseno.
//
// Van contra la funcion pura y no contra el store porque varios escenarios
// necesitan un resumen de tarjeta pendiente, y sembrar un ciclo de credito
// completo via setState obliga a fabricar transacciones, dias de cierre y
// fechas de vencimiento: ruido que tapa lo que el escenario prueba.
// La integracion store<->funcion se cubre en el ultimo describe.
import { describe, it, expect } from 'vitest';
import { computeAvailableToSpend, type AvailableInputs } from '../pocket';
import type { PaymentMethod, RecurringPlan, InternalTransfer } from '@/types/database';
import type { ProcessedTransaction, CreditCardCycleSummary } from '../types';

const NOW = new Date(2026, 7, 20);   // 20-ago-2026
const ANCHOR = '2026-08-01';

const acct = (over: Partial<PaymentMethod>): PaymentMethod => ({
  id: 'poc', user_id: 'u1', name: 'Billetera', type: 'debit',
  default_closing_day: null, default_payment_day: null, created_at: '2026-01-01',
  is_personal: false, is_default: true,
  bucket: 'pocket', initial_balance: 0, initial_balance_at: ANCHOR,
  ...over,
} as PaymentMethod);

const fixed = (over: Partial<RecurringPlan>): RecurringPlan => ({
  id: 'f1', user_id: 'u1', description: 'Fijo', amount: 10000, is_active: true,
  payment_method_id: 'poc', category_id: 'c1', currency: 'ARS',
  original_amount: null, created_at: '2026-01-01',
  ...over,
} as RecurringPlan);

const summary = (over: Partial<CreditCardCycleSummary>): CreditCardCycleSummary => ({
  methodId: 'cred', name: 'Tarjeta', total: 0, totalARS: 0, totalUSD: 0,
  nextPaymentDate: new Date(2026, 8, 1), isCycleClosed: true, isPending: true, isPaidManually: false,
  ...over,
});

const run = (over: Partial<AvailableInputs>) => computeAvailableToSpend({
  paymentMethods: [], transactions: [], transfers: [],
  recurringPlans: [], pendingCards: [], rhythm: 'monthly', now: NOW,
  ...over,
});

describe('E1 — sueldo mensual, todo por billetera', () => {
  it('descuenta los fijos del periodo; la tarjeta del mes proximo queda afuera del disponible', () => {
    const r = run({
      paymentMethods: [acct({ initial_balance: 150000 }), acct({ id: 'cred', type: 'credit', is_default: false })],
      recurringPlans: [fixed({ description: 'Alquiler', amount: 80000 })],
      pendingCards: [summary({ totalARS: 200000, total: 200000, nextPaymentDate: new Date(2026, 8, 10) })],
    });
    expect(r.pocketTotal).toBe(150000);
    expect(r.committed).toBe(80000);
    expect(r.available).toBe(70000);
    expect(r.committedNextPeriod).toBe(200000);
  });
});

describe('E2 — mitad en efectivo', () => {
  it('el efectivo es un medio del bolsillo como cualquier otro', () => {
    const r = run({
      paymentMethods: [
        acct({ id: 'bill', initial_balance: 50000 }),
        acct({ id: 'efe', name: 'Efectivo', type: 'cash', initial_balance: 30000, is_default: false }),
      ],
      recurringPlans: [fixed({ description: 'Servicios', amount: 20000, payment_method_id: 'bill' })],
    });
    expect(r.pocketTotal).toBe(80000);
    expect(r.available).toBe(60000);
  });
});

describe('E3 — freelancer que cobra irregular', () => {
  it('sin proximo cobro que asumir, descuenta TODO lo comprometido', () => {
    const r = run({
      paymentMethods: [
        acct({ initial_balance: 100000 }),
        acct({ id: 'res', name: 'Mis dolares', bucket: 'reserve', initial_balance: 500000, is_default: false }),
        acct({ id: 'cred', type: 'credit', is_default: false }),
      ],
      recurringPlans: [fixed({ description: 'Servicios', amount: 40000 })],
      pendingCards: [summary({ totalARS: 150000, total: 150000, nextPaymentDate: new Date(2026, 8, 10) })],
      rhythm: 'irregular',
    });
    expect(r.reserveTotal).toBe(500000);
    expect(r.committed).toBe(190000);
    expect(r.available).toBe(-90000);
    expect(r.committedNextPeriod).toBe(0);
  });
});

describe('E4 — ahorrista en dolares', () => {
  it('transferir al ahorro baja el bolsillo y no cuenta como gasto', () => {
    const r = run({
      paymentMethods: [
        acct({ initial_balance: 300000 }),
        acct({ id: 'res', name: 'Mis dolares', bucket: 'reserve', initial_balance: 0, is_default: false }),
      ],
      transfers: [{
        id: 'tr', amount: 200000,
        from_payment_method_id: 'poc', to_payment_method_id: 'res',
        real_transfer_date: '2026-08-05',
      } as InternalTransfer],
    });
    expect(r.pocketTotal).toBe(100000);
    expect(r.reserveTotal).toBe(200000);
    expect(r.available).toBe(100000);
  });
});

describe('E5 — gasto pagado desde una reserva', () => {
  it('no toca el disponible del bolsillo, pero baja la reserva', () => {
    const r = run({
      paymentMethods: [
        acct({ initial_balance: 100000 }),
        acct({ id: 'res', name: 'Broker', bucket: 'reserve', initial_balance: 500000, is_default: false }),
      ],
      transactions: [{
        id: 'g1', user_id: 'u1', type: 'expense', amount: -150000,
        date: '2026-08-10', periodDate: '2026-08-10', realPaymentDate: '2026-08-10',
        payment_method_id: 'res', category_id: 'c1',
        installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
        is_balance_adjustment: false,
      } as ProcessedTransaction],
    });
    expect(r.available).toBe(100000);
    expect(r.reserveTotal).toBe(350000);
  });
});

describe('E6 — mensualidad facturada en tarjeta', () => {
  it('no se descuenta aparte: ya viaja dentro del resumen de su tarjeta', () => {
    const r = run({
      paymentMethods: [
        acct({ initial_balance: 200000 }),
        acct({ id: 'cred', name: 'Tarjeta', type: 'credit', is_default: false }),
      ],
      recurringPlans: [fixed({ description: 'Netflix', amount: 20000, payment_method_id: 'cred' })],
      pendingCards: [summary({ totalARS: 100000, total: 100000, nextPaymentDate: new Date(2026, 7, 28) })],
    });
    expect(r.committed).toBe(100000);   // no 120000: el fijo ya esta dentro del resumen
    expect(r.available).toBe(100000);
  });
});

describe('E7 — conciliacion', () => {
  it('un ajuste corrige el saldo sin tocar los movimientos previos', () => {
    const r = run({
      paymentMethods: [acct({ initial_balance: 200000 })],
      transactions: [{
        id: 'aj', user_id: 'u1', type: 'expense', amount: -50000,
        date: '2026-08-19', periodDate: '2026-08-19', realPaymentDate: '2026-08-19',
        payment_method_id: 'poc', category_id: 'c1', is_balance_adjustment: true,
        installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
      } as ProcessedTransaction],
    });
    expect(r.pocketTotal).toBe(150000);
    expect(r.available).toBe(150000);
  });
});

describe('integracion: el store cablea bien la funcion pura', () => {
  it('getAvailableToSpend refleja los medios y el ritmo del estado', async () => {
    const { useFinanceStore } = await import('@/lib/store/financeStore');

    useFinanceStore.setState({
      transactions: [], installmentPlans: [], recurringPlans: [], categories: [],
      exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS', inflationSeries: [],
      internalTransfers: [],
      incomeRhythm: 'monthly',
      paymentMethods: [
        acct({ initial_balance: 120000 }),
        acct({ id: 'res', name: 'Ahorro', bucket: 'reserve', initial_balance: 900000, is_default: false }),
      ],
    } as never);

    // Usa la fecha real (el store no recibe `now`), pero sin compromisos sembrados
    // el periodo no afecta el resultado.
    const r = useFinanceStore.getState().getAvailableToSpend();
    expect(r.pocketTotal).toBe(120000);
    expect(r.reserveTotal).toBe(900000);
    expect(r.available).toBe(120000);
  });
});
