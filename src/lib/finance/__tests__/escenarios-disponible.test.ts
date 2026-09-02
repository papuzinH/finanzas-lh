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
import { computePendingCreditCards, computePaymentMethodStatus } from '../balances';
import { cicloDeCompra, cicloNEsimo } from '../cycles';
import type { PaymentMethod, RecurringPlan, InternalTransfer } from '@/types/database';
import type { ProcessedTransaction, CreditCardCycleSummary } from '../types';
import type { CreditCardCycle } from '../cycles';

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
  cycleId: 'c1', methodId: 'cred', name: 'Tarjeta', total: 0, totalARS: 0, totalUSD: 0,
  nextPaymentDate: new Date(2026, 8, 1), isCycleClosed: true, isPending: true, isPaidManually: false, isOverdue: false,
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

describe('E8 — pagar la tarjeta no mueve el disponible', () => {
  it('el pago baja el saldo del medio financiador y saca la tarjeta de los compromisos: neto cero', () => {
    const cuentas = [
      acct({ initial_balance: 300000 }),
      acct({ id: 'cred', name: 'Tarjeta', type: 'credit', is_default: false }),
    ];
    const resumen = summary({ totalARS: 100000, total: 100000, nextPaymentDate: new Date(2026, 7, 28) });

    const antes = run({ paymentMethods: cuentas, pendingCards: [resumen] });

    // Pagar = una transaccion real en el medio financiador + la tarjeta deja de estar pendiente.
    const pago = {
      id: 'pago', user_id: 'u1', type: 'expense', amount: 100000,
      date: '2026-08-20', periodDate: '2026-08-20', realPaymentDate: '2026-08-20',
      payment_method_id: 'poc', category_id: 'c1', card_payment_for: 'cred',
      installment_plan_id: null, recurring_plan_id: null, is_balance_adjustment: false,
    } as ProcessedTransaction;
    const despues = run({
      paymentMethods: cuentas,
      transactions: [pago],
      pendingCards: [{ ...resumen, isPending: false }],
    });

    expect(antes.available).toBe(200000);
    expect(despues.available).toBe(200000);
    expect(despues.pocketTotal).toBe(200000);
    expect(despues.committed).toBe(0);
  });
});

describe('E9 — marcar una mensualidad como pagada no mueve el disponible', () => {
  it('la transaccion baja el saldo y el fijo deja de estar pendiente: neto cero', () => {
    const cuentas = [acct({ initial_balance: 300000 })];
    const plan = fixed({ id: 'alquiler', description: 'Alquiler', amount: 80000 });

    const antes = run({ paymentMethods: cuentas, recurringPlans: [plan] });

    const pago = {
      id: 'pago-fijo', user_id: 'u1', type: 'expense', amount: 80000,
      date: '2026-08-20', periodDate: '2026-08-20', realPaymentDate: '2026-08-20',
      payment_method_id: 'poc', category_id: 'c1', recurring_plan_id: 'alquiler',
      installment_plan_id: null, card_payment_for: null, is_balance_adjustment: false,
    } as ProcessedTransaction;
    const despues = run({ paymentMethods: cuentas, recurringPlans: [plan], transactions: [pago] });

    expect(antes.available).toBe(220000);
    expect(despues.available).toBe(220000);
    expect(despues.committed).toBe(0);
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

describe('E10 — tarjeta con compras en dolares', () => {
  // Caso real (Lauti, 2026-09-01): la Visa vencia ese dia con $260.582 en pesos
  // y otros $63.496 en compras en dolares. El disponible descontaba SOLO la
  // parte en pesos, asi que la plata libre estaba inflada por el valor de las
  // compras en USD; y al marcar la tarjeta pagada, el pago (que si registra el
  // total) hacia caer el disponible por esa diferencia. E8 no lo veia porque su
  // fixture pone totalARS === total, o sea una tarjeta sin una sola compra en USD.
  const conDolares = summary({
    totalARS: 100000,   // gastos cuya moneda original es el peso
    totalUSD: 100,      // u$s 100 del resumen...
    total: 150000,      // ...que valen $50.000: el resumen entero sale $150.000
    nextPaymentDate: new Date(2026, 7, 28),
  });

  it('descuenta el resumen COMPLETO, no solo la parte en pesos', () => {
    const r = run({
      paymentMethods: [acct({ initial_balance: 300000 }), acct({ id: 'cred', type: 'credit', is_default: false })],
      pendingCards: [conDolares],
    });

    expect(r.committed).toBe(150000);
    expect(r.available).toBe(150000);
  });

  it('pagarla no mueve el disponible (E8, ahora con dolares adentro)', () => {
    const cuentas = [acct({ initial_balance: 300000 }), acct({ id: 'cred', type: 'credit', is_default: false })];

    const antes = run({ paymentMethods: cuentas, pendingCards: [conDolares] });

    // El pago real que registra payCreditCardCycle: card.total, el resumen entero.
    const pago = {
      id: 'pago', user_id: 'u1', type: 'expense', amount: 150000,
      date: '2026-08-20', periodDate: '2026-08-20', realPaymentDate: '2026-08-20',
      payment_method_id: 'poc', category_id: 'c1', card_payment_for: 'cred',
      installment_plan_id: null, recurring_plan_id: null, is_balance_adjustment: false,
    } as ProcessedTransaction;
    const despues = run({
      paymentMethods: cuentas,
      transactions: [pago],
      pendingCards: [{ ...conDolares, isPending: false }],
    });

    expect(antes.available).toBe(150000);
    expect(despues.available).toBe(150000);
    expect(despues.pocketTotal).toBe(150000);
    expect(despues.committed).toBe(0);
  });
});

describe('E11 — qué pasa si NO se marca el pago de la tarjeta', () => {
  // Responde a "¿la funcionalidad de pagar tarjeta tiene sentido?" (2026-09-01).
  // La intuición es que no agrega nada, porque el resumen YA se descuenta del
  // disponible. Pero el ciclo avanza solo al día siguiente del vencimiento
  // (getCreditCycleDates) y el resumen viejo desaparece: si nadie registró la
  // salida de plata, el compromiso se libera y el bolsillo nunca baja.
  const HOY_VENCE = new Date(2026, 8, 1);      // 1-sep: la tarjeta vence hoy
  const YA_VENCIO = new Date(2026, 8, 2);      // 2-sep: el ciclo ya avanzó
  const RESUMEN = 324078;

  const cuenta = () => [
    acct({ initial_balance: 500000, initial_balance_at: '2026-08-21' }),
    acct({ id: 'cred', name: 'Visa', type: 'credit', is_default: false }),
  ];
  const visa = summary({
    methodId: 'cred', name: 'Visa', total: RESUMEN, totalARS: RESUMEN,
    nextPaymentDate: HOY_VENCE,
  });

  it('el día del vencimiento el resumen está descontado', () => {
    const r = computeAvailableToSpend({
      paymentMethods: cuenta(), transactions: [], transfers: [], recurringPlans: [],
      pendingCards: [visa], rhythm: 'monthly', now: HOY_VENCE,
    });
    expect(r.committed).toBe(RESUMEN);
    expect(r.available).toBe(500000 - RESUMEN);
  });

  it('sin marcarlo, al día siguiente el disponible SUBE por plata que ya no está', () => {
    // El ciclo avanzó: el resumen viejo ya no figura como pendiente y el nuevo
    // todavía no acumuló nada. Nadie registró que salieron $324.078 de la cuenta.
    const r = computeAvailableToSpend({
      paymentMethods: cuenta(), transactions: [], transfers: [], recurringPlans: [],
      pendingCards: [], rhythm: 'monthly', now: YA_VENCIO,
    });
    expect(r.committed).toBe(0);
    expect(r.pocketTotal).toBe(500000);   // el saldo nunca bajó
    expect(r.available).toBe(500000);     // +$324.078 de la nada
  });

  it('marcándolo, el disponible no se mueve: la plata sale de donde salió de verdad', () => {
    const pago = {
      id: 'pago', user_id: 'u1', type: 'expense', amount: RESUMEN,
      date: '2026-09-01', periodDate: '2026-09-01', realPaymentDate: '2026-09-01',
      payment_method_id: 'poc', category_id: 'c1', card_payment_for: 'cred',
      installment_plan_id: null, recurring_plan_id: null, is_balance_adjustment: false,
    } as ProcessedTransaction;
    const r = computeAvailableToSpend({
      paymentMethods: cuenta(), transactions: [pago], transfers: [], recurringPlans: [],
      pendingCards: [], rhythm: 'monthly', now: YA_VENCIO,
    });
    expect(r.pocketTotal).toBe(500000 - RESUMEN);
    expect(r.available).toBe(500000 - RESUMEN);
  });
});

describe('E12 — el resumen vencido sin pago sigue descontado', () => {
  // Cierre del agujero que mide E11: acá no se fabrica el resumen a mano, se pide
  // a computePendingCreditCards con los mismos datos que tendría la app, para que
  // el escenario pruebe la cadena entera (ciclo -> compromiso -> disponible) y no
  // sólo el ensamblador.
  const visa = {
    id: 'cred', user_id: 'u1', name: 'Visa', type: 'credit',
    default_closing_day: 19, default_payment_day: 1, created_at: '2026-01-01',
    is_personal: false, is_default: false, bucket: 'pocket',
    initial_balance: 0, initial_balance_at: null,
  } as PaymentMethod;

  // Ciclos DESPAREJOS (cierres 23-jul/20-ago, vencimientos 3-ago/1-sep — no un mes
  // exacto entre uno y otro) a propósito: fixturear ciclos parejos es cómo se
  // escondieron los últimos dos bugs grandes del repo (E8, el histórico), y es
  // justamente lo que le permitió a Finding 1 (revisión 2026-09-01) pasar
  // desapercibido en este mismo E12 durante la primera ronda. El ciclo vencido
  // (3-ago, impago) y el vigente visto desde HOY (cierra 20-ago, vence 1-sep) --
  // computePendingCreditCards necesita los dos para derivar cuál es "el anterior".
  const cycles: CreditCardCycle[] = [
    { id: 'jul', user_id: 'u1', payment_method_id: 'cred', closing_date: '2026-07-23', due_date: '2026-08-03', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
    { id: 'ago', user_id: 'u1', payment_method_id: 'cred', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
  ];

  const consumo = {
    id: 'compra', user_id: 'u1', type: 'expense', amount: 50000,
    date: '2026-08-03', periodDate: '2026-08-03', realPaymentDate: '2026-08-03',
    payment_method_id: 'cred', category_id: 'c1', card_payment_for: null,
    installment_plan_id: null, recurring_plan_id: null, is_balance_adjustment: false,
    cycle_id: 'jul',
  } as ProcessedTransaction;

  const HOY = new Date(2026, 7, 10);   // 10-ago: el vencimiento del 3-ago ya pasó
  const cuentas = [acct({ initial_balance: 300000, initial_balance_at: '2026-07-01' }), visa];

  const correr = (transactions: ProcessedTransaction[]) =>
    computeAvailableToSpend({
      paymentMethods: cuentas,
      transactions,
      transfers: [],
      recurringPlans: [],
      pendingCards: computePendingCreditCards(cuentas, transactions, [], cycles, HOY),
      rhythm: 'monthly',
      now: HOY,
    });

  it('sin pago registrado, el disponible NO sube: el resumen sigue pesando', () => {
    const r = correr([consumo]);
    expect(r.committed).toBe(50000);
    expect(r.available).toBe(250000);
  });

  it('con el pago registrado, el compromiso se libera y el saldo baja a la vez', () => {
    const pago = {
      id: 'pago', user_id: 'u1', type: 'expense', amount: 50000,
      date: '2026-08-03', periodDate: '2026-08-03', realPaymentDate: '2026-08-03',
      payment_method_id: 'poc', category_id: 'c1', card_payment_for: 'cred',
      installment_plan_id: null, recurring_plan_id: null, is_balance_adjustment: false,
      cycle_id: 'jul',
    } as ProcessedTransaction;

    const r = correr([consumo, pago]);
    expect(r.committed).toBe(0);
    expect(r.pocketTotal).toBe(250000);
    expect(r.available).toBe(250000);  // el mismo número que sin pagar: neto cero
  });
});

describe('E13 — declarar un cierre nuevo NO mueve ninguna transaccion de resumen', () => {
  // El invariante central del spec. Es la razon por la que la pertenencia se
  // persiste en vez de derivarse: si se derivara, tocar el cierre le re-fecharia
  // al usuario las 47 cuotas futuras todos los meses --que es exactamente lo que
  // hoy lo frena de corregir el dato-- y con la FK escrita no se mueve nada.
  const visa = (over: Partial<PaymentMethod> = {}): PaymentMethod => acct({
    id: 'visa', name: 'Visa', type: 'credit', is_default: false,
    default_closing_day: 20, default_payment_day: 1, initial_balance_at: null,
    ...over,
  });

  const cicloAgosto: CreditCardCycle = {
    id: 'ago', user_id: 'u1', payment_method_id: 'visa',
    closing_date: '2026-08-20', due_date: '2026-09-01',
    source: 'generated', created_at: '2026-01-01T00:00:00Z',
  };

  const compra = {
    id: 't1', user_id: 'u1', type: 'expense', amount: 50000,
    date: '2026-09-01', periodDate: '2026-08-20', realPaymentDate: '2026-09-01',
    payment_method_id: 'visa', cycle_id: 'ago', purchase_date: '2026-08-05',
    original_currency: 'ARS', original_amount: 50000,
  } as unknown as ProcessedTransaction;

  it('el total del resumen no cambia cuando el ciclo se re-declara con otras fechas', () => {
    const antes = computePaymentMethodStatus(visa(), [compra], [], NOW, [cicloAgosto], cicloAgosto);

    // El usuario lee el resumen y declara las fechas reales: cerro el 27 y vence el 4.
    const declarado: CreditCardCycle = {
      ...cicloAgosto, closing_date: '2026-08-27', due_date: '2026-09-04', source: 'declared',
    };
    // Y de paso cambia los defaults de la tarjeta, como hace todos los meses.
    const despues = computePaymentMethodStatus(
      visa({ default_closing_day: 27, default_payment_day: 4 }), [compra], [], NOW, [declarado], declarado,
    );

    expect(despues.projectedTotal).toBe(antes.projectedTotal);
    expect(despues.projectedTotal).toBe(-50000);
    // Lo unico que se movio son las fechas MOSTRADAS del resumen.
    expect(despues.nextPaymentDate).toEqual(new Date(2026, 8, 4));
  });

  it('una transaccion de OTRO ciclo no entra, aunque su t.date caiga en el mismo mes', () => {
    // Este es el caso que el modelo viejo no podia representar: dos resumenes
    // que vencen en el mismo mes calendario. sameMonthYear(t.date, vencimiento)
    // los mezclaba; cycle_id los separa.
    const cicloJulio: CreditCardCycle = {
      ...cicloAgosto, id: 'jul', closing_date: '2026-07-23', due_date: '2026-09-30',
    };
    const otra = { ...compra, id: 't2', cycle_id: 'jul', amount: 99999 } as ProcessedTransaction;

    const r = computePaymentMethodStatus(
      visa(), [compra, otra], [], NOW, [cicloJulio, cicloAgosto], cicloAgosto,
    );
    expect(r.projectedTotal).toBe(-50000);
  });
});

describe('E14 — la cuota N cae en el N-esimo resumen, no a N meses de la primera', () => {
  const ciclos: CreditCardCycle[] = [
    { id: 'c0', user_id: 'u1', payment_method_id: 'master', closing_date: '2026-07-30', due_date: '2026-08-07', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
    { id: 'c1', user_id: 'u1', payment_method_id: 'master', closing_date: '2026-08-27', due_date: '2026-09-04', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
    { id: 'c2', user_id: 'u1', payment_method_id: 'master', closing_date: '2026-10-01', due_date: '2026-10-09', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  ];

  it('las tres cuotas toman las fechas REALES de los tres resumenes', () => {
    // Fechas reales de la Mastercard Galicia (resumen del 1-sep-2026).
    // addMonths(7-ago, 1) daria 7-sep y addMonths(7-ago, 2) daria 7-oct:
    // ninguna de las dos es una fecha de vencimiento de esta tarjeta.
    const compra = cicloDeCompra('2026-07-15', ciclos);
    expect(compra?.id).toBe('c0');

    const fechas = [0, 1, 2].map((n) => cicloNEsimo(ciclos, compra!, n)?.due_date);
    expect(fechas).toEqual(['2026-08-07', '2026-09-04', '2026-10-09']);
  });

  it('si faltan resumenes materializados, la ultima cuota no se inventa una fecha', () => {
    const compra = cicloDeCompra('2026-07-15', ciclos);
    expect(cicloNEsimo(ciclos, compra!, 3)).toBeUndefined();
  });
});

describe('E16 — la compra del dia del cierre entra en el ciclo que cierra', () => {
  it('se resuelve en cicloDeCompra, y el resumen la cuenta', () => {
    // La regla del banco: el ciclo corre hasta las 23:59 de la fecha de cierre.
    // Cubierto tambien en cycles.test.ts; aca se verifica de punta a punta que
    // esa asignacion es la que termina sumando al total del resumen.
    const ciclos: CreditCardCycle[] = [
      { id: 'ago', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
      { id: 'sep', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-09-24', due_date: '2026-10-05', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
    ];
    const elDiaDelCierre = cicloDeCompra('2026-08-20', ciclos);
    expect(elDiaDelCierre?.id).toBe('ago');

    const tx = {
      id: 't1', user_id: 'u1', type: 'expense', amount: 12345,
      date: '2026-09-01', periodDate: '2026-08-20', realPaymentDate: '2026-09-01',
      payment_method_id: 'visa', cycle_id: elDiaDelCierre?.id, purchase_date: '2026-08-20',
      original_currency: 'ARS', original_amount: 12345,
    } as unknown as ProcessedTransaction;

    const visa = acct({ id: 'visa', name: 'Visa', type: 'credit', is_default: false, default_closing_day: 20, default_payment_day: 1, initial_balance_at: null });
    const r = computePaymentMethodStatus(visa, [tx], [], NOW, ciclos, ciclos[0]);
    expect(r.projectedTotal).toBe(-12345);
  });
});
