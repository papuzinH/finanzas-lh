import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { format, subMonths } from 'date-fns';
import { useFinanceStore } from '@/lib/store/financeStore';

function seed(partial: Record<string, unknown>) {
  useFinanceStore.setState(partial as never);
}

beforeEach(() => {
  useFinanceStore.setState({
    transactions: [], installmentPlans: [], paymentMethods: [], recurringPlans: [],
    categories: [], exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS',
    inflationSeries: [], internalTransfers: [], paidCycles: {},
  } as never);
});

describe('getPendingFixedExpenses', () => {
  it('cuenta mensualidad activa sin transacción este mes como pendiente', () => {
    seed({
      recurringPlans: [
        { id: 1, description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null },
        { id: 2, description: 'Internet', amount: 20000, is_active: true, payment_method_id: null },
      ],
      transactions: [],
    });
    const res = useFinanceStore.getState().getPendingFixedExpenses();
    expect(res.total).toBe(120000);
    expect(res.items).toHaveLength(2);
    expect(res.items.find((i) => i.id === 1)?.name).toBe('Alquiler');
  });

  it('excluye mensualidad que ya tiene transacción vinculada este mes', () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    seed({
      recurringPlans: [
        { id: 1, description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null },
      ],
      transactions: [
        { id: 50, type: 'expense', amount: -100000, date: today, periodDate: today, recurring_plan_id: 1, installment_plan_id: null, payment_method_id: null },
      ],
    });
    const res = useFinanceStore.getState().getPendingFixedExpenses();
    expect(res.total).toBe(0);
    expect(res.items).toHaveLength(0);
  });

  it('ignora mensualidades inactivas', () => {
    seed({
      recurringPlans: [
        { id: 1, description: 'Viejo', amount: 5000, is_active: false, payment_method_id: null },
      ],
    });
    expect(useFinanceStore.getState().getPendingFixedExpenses().total).toBe(0);
  });
});

describe('getRealAvailableBalance', () => {
  it('saldoBruto = ingresos - gastos variables - cuotas historicas - mensualidades pagadas - ahorro', () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    seed({
      paymentMethods: [{ id: 1, name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null }],
      transactions: [
        { id: 1, type: 'income', amount: 200000, date: today, periodDate: today, payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
        { id: 2, type: 'expense', amount: -30000, date: today, periodDate: today, payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
      internalTransfers: [{ id: 1, amount: 10000, period_date: today }],
      recurringPlans: [],
    });
    const res = useFinanceStore.getState().getRealAvailableBalance();
    // 200000 - 30000 - 0 - 0 - 10000 = 160000
    expect(res.saldoBruto).toBe(160000);
    expect(res.pendingCardTotal).toBe(0);
    expect(res.pendingFixedExpenses).toBe(0);
    expect(res.disponibleReal).toBe(160000);
  });

  it('resta gastos fijos pendientes y NO cuenta su transaccion en saldoBruto', () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    seed({
      paymentMethods: [{ id: 1, name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null }],
      transactions: [
        { id: 1, type: 'income', amount: 200000, date: today, periodDate: today, payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
      recurringPlans: [
        { id: 9, description: 'Alquiler', amount: 50000, is_active: true, payment_method_id: 1 },
      ],
    });
    const res = useFinanceStore.getState().getRealAvailableBalance();
    // saldoBruto = 200000 (mensualidad NO pagada => sin transaccion => no resta en bruto)
    expect(res.saldoBruto).toBe(200000);
    expect(res.pendingFixedExpenses).toBe(50000);
    // disponibleReal = 200000 - 50000 - 0 = 150000
    expect(res.disponibleReal).toBe(150000);
  });

  it('INVARIANTE: pagar la mensualidad no cambia disponibleReal', () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const base = {
      paymentMethods: [{ id: 1, name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null }],
      recurringPlans: [{ id: 9, description: 'Alquiler', amount: 50000, is_active: true, payment_method_id: 1 }],
    };
    // Antes de pagar
    seed({
      ...base,
      transactions: [
        { id: 1, type: 'income', amount: 200000, date: today, periodDate: today, payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const antes = useFinanceStore.getState().getRealAvailableBalance().disponibleReal;
    // Despues de pagar: aparece la transaccion vinculada a la mensualidad
    seed({
      ...base,
      transactions: [
        { id: 1, type: 'income', amount: 200000, date: today, periodDate: today, payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
        { id: 2, type: 'expense', amount: -50000, date: today, periodDate: today, payment_method_id: 1, installment_plan_id: null, recurring_plan_id: 9 },
      ],
    });
    const despues = useFinanceStore.getState().getRealAvailableBalance().disponibleReal;
    expect(despues).toBe(antes); // 150000 en ambos
  });

  it('REGRESION: mensualidades pagadas en meses ANTERIORES restan del saldo', () => {
    // Bug reportado: los pagos de gastos fijos de meses pasados nunca se
    // restaban (getGlobalBalance solo restaba el burn rate del mes corriente),
    // inflando el saldo ~1 burn rate por cada mes de uso.
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    const lastMonth = format(subMonths(now, 1), 'yyyy-MM-dd');
    seed({
      paymentMethods: [{ id: 1, name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null }],
      recurringPlans: [
        { id: 9, description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: 1 },
      ],
      transactions: [
        { id: 1, type: 'income', amount: 1000000, date: today, periodDate: today, payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
        // alquiler del mes pasado, YA PAGADO (transaccion vinculada al plan)
        { id: 2, type: 'expense', amount: -100000, date: lastMonth, periodDate: lastMonth, payment_method_id: 1, installment_plan_id: null, recurring_plan_id: 9 },
      ],
    });
    const res = useFinanceStore.getState().getRealAvailableBalance();
    // 1.000.000 - 100.000 (alquiler pagado mes pasado) - 100.000 (pendiente este mes) = 800.000
    expect(res.disponibleReal).toBe(800000);
    expect(res.pendingFixedExpenses).toBe(100000);
  });

  it('REGRESION: disponibleReal SIEMPRE == getGlobalBalance (tarjeta credito + cuotas)', () => {
    // Antes del fix, saldoBruto se reimplementaba con una ventana de ciclo
    // distinta a la de pendingCardTotal -> las cuotas de tarjeta se sacaban del
    // bruto pero no se restaban en el bucket -> el numero se inflaba. Este test
    // fija que el total quede anclado a getGlobalBalance en un escenario con
    // tarjeta de credito y cuotas (donde antes se filtraba la plata).
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 3)); // 3 jul: fecha donde las dos ventanas de ciclo divergen
    try {
      const enCiclo = format(new Date(2026, 6, 1), 'yyyy-MM-dd');
      const cuotaAgo = format(new Date(2026, 7, 5), 'yyyy-MM-dd'); // cuota fechada en agosto
      seed({
        paymentMethods: [
          { id: 1, name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null },
          { id: 2, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 },
        ],
        transactions: [
          { id: 1, type: 'income', amount: 3000000, date: enCiclo, periodDate: enCiclo, payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
          { id: 2, type: 'expense', amount: -120000, date: enCiclo, periodDate: enCiclo, payment_method_id: 2, installment_plan_id: null, recurring_plan_id: null },
          { id: 3, type: 'expense', amount: -80000, date: cuotaAgo, periodDate: cuotaAgo, payment_method_id: 2, installment_plan_id: 7, recurring_plan_id: null },
        ],
        installmentPlans: [{ id: 7, description: 'Notebook', total_amount: 240000, installments_count: 3 }],
      });
      const state = useFinanceStore.getState();
      const res = state.getRealAvailableBalance();
      expect(res.disponibleReal).toBe(state.getGlobalBalance());
      // el desglose SIEMPRE cuadra con el total
      expect(res.saldoBruto - res.pendingFixedExpenses - res.pendingCardTotal).toBe(res.disponibleReal);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getRecurringBackfillPreview', () => {
  it('cuenta meses pasados sin transaccion desde la creacion del plan', () => {
    const now = new Date();
    const createdAt = subMonths(now, 2).toISOString(); // plan creado hace 2 meses
    const twoMonthsAgo = format(subMonths(now, 2), 'yyyy-MM-dd');
    seed({
      recurringPlans: [
        { id: 9, description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null, created_at: createdAt },
      ],
      transactions: [
        // primera transaccion REAL fija el piso del historial hace 2 meses
        { id: 1, type: 'income', amount: 500000, date: twoMonthsAgo, periodDate: twoMonthsAgo, payment_method_id: null, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getRecurringBackfillPreview();
    // mes de creacion + mes pasado = 2 meses faltantes (el actual no cuenta)
    expect(res.missingMonths).toBe(2);
    expect(res.totalAmount).toBe(200000);
    expect(res.excessMonths).toBe(0);
  });

  it('no backfillea meses anteriores a la primera transaccion real (piso del historial)', () => {
    const now = new Date();
    const createdAt = subMonths(now, 6).toISOString(); // plan creado hace 6 meses...
    const twoMonthsAgo = format(subMonths(now, 2), 'yyyy-MM-dd');
    seed({
      recurringPlans: [
        { id: 9, description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null, created_at: createdAt },
      ],
      transactions: [
        // ...pero el historial real arranca hace 2 meses
        { id: 1, type: 'income', amount: 500000, date: twoMonthsAgo, periodDate: twoMonthsAgo, payment_method_id: null, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getRecurringBackfillPreview();
    // solo los 2 meses dentro del historial, NO los 6 desde created_at
    expect(res.missingMonths).toBe(2);
    expect(res.totalAmount).toBe(200000);
  });

  it('el piso es el primer INGRESO, no una cuota/gasto anterior sin ingreso detras', () => {
    // Bug reportado: el piso usaba la primera transaccion de CUALQUIER tipo.
    // Si el usuario tenia una cuota (gasto) meses antes de su primer ingreso,
    // el backfill materializaba mensualidades en meses sin ingreso -> hundia el saldo.
    const now = new Date();
    const createdAt = subMonths(now, 5).toISOString(); // plan creado hace 5 meses
    const fourMonthsAgo = format(subMonths(now, 4), 'yyyy-MM-dd'); // cuota vieja, sin ingreso
    const twoMonthsAgo = format(subMonths(now, 2), 'yyyy-MM-dd'); // primer INGRESO real
    seed({
      recurringPlans: [
        { id: 9, description: 'Netflix', amount: 100000, is_active: true, payment_method_id: null, created_at: createdAt },
      ],
      transactions: [
        // gasto/cuota ANTES del primer ingreso: NO debe fijar el piso
        { id: 1, type: 'expense', amount: -40000, date: fourMonthsAgo, periodDate: fourMonthsAgo, payment_method_id: null, installment_plan_id: 7, recurring_plan_id: null },
        // primer INGRESO real hace 2 meses -> este es el piso
        { id: 2, type: 'income', amount: 500000, date: twoMonthsAgo, periodDate: twoMonthsAgo, payment_method_id: null, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getRecurringBackfillPreview();
    // piso = mes del primer ingreso: solo hace 2 meses + mes pasado = 2 meses
    // (con el bug contaba desde hace 4 meses = 4 meses / 400000)
    expect(res.missingMonths).toBe(2);
    expect(res.totalAmount).toBe(200000);
  });

  it('sin transacciones reales no hay nada que backfillear', () => {
    const now = new Date();
    seed({
      recurringPlans: [
        { id: 9, description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null, created_at: subMonths(now, 4).toISOString() },
      ],
      transactions: [],
    });
    const res = useFinanceStore.getState().getRecurringBackfillPreview();
    expect(res.missingMonths).toBe(0);
    expect(res.excessMonths).toBe(0);
  });

  it('no cuenta meses ya cubiertos por una transaccion vinculada', () => {
    const now = new Date();
    const createdAt = subMonths(now, 1).toISOString();
    const lastMonth = format(subMonths(now, 1), 'yyyy-MM-dd');
    seed({
      recurringPlans: [
        { id: 9, description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null, created_at: createdAt },
      ],
      transactions: [
        // piso del historial: income real el mes pasado
        { id: 1, type: 'income', amount: 500000, date: lastMonth, periodDate: lastMonth, payment_method_id: null, installment_plan_id: null, recurring_plan_id: null },
        { id: 2, type: 'expense', amount: -100000, date: lastMonth, periodDate: lastMonth, payment_method_id: null, installment_plan_id: null, recurring_plan_id: 9 },
      ],
    });
    const res = useFinanceStore.getState().getRecurringBackfillPreview();
    expect(res.missingMonths).toBe(0);
    expect(res.totalAmount).toBe(0);
    expect(res.excessMonths).toBe(0);
  });

  it('detecta como exceso los pagos generados antes del historial real', () => {
    const now = new Date();
    const lastMonth = format(subMonths(now, 1), 'yyyy-MM-dd');
    const threeMonthsAgo = format(subMonths(now, 3), 'yyyy-MM-dd');
    seed({
      recurringPlans: [
        { id: 9, description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null, created_at: subMonths(now, 3).toISOString() },
      ],
      transactions: [
        // piso: primera transaccion real hace 1 mes
        { id: 1, type: 'income', amount: 500000, date: lastMonth, periodDate: lastMonth, payment_method_id: null, installment_plan_id: null, recurring_plan_id: null },
        // pago backfilleado ANTES del piso -> exceso a limpiar
        { id: 2, type: 'expense', amount: -100000, date: threeMonthsAgo, periodDate: threeMonthsAgo, payment_method_id: null, installment_plan_id: null, recurring_plan_id: 9 },
        // pago dentro del historial -> cubre su mes, no es exceso
        { id: 3, type: 'expense', amount: -100000, date: lastMonth, periodDate: lastMonth, payment_method_id: null, installment_plan_id: null, recurring_plan_id: 9 },
      ],
    });
    const res = useFinanceStore.getState().getRecurringBackfillPreview();
    expect(res.excessMonths).toBe(1);
    expect(res.excessAmount).toBe(100000);
    expect(res.missingMonths).toBe(0);
  });
});

describe('getNextMonthCardExposure', () => {
  it('suma TODOS los gastos de credito del mes que viene (cuotas + compras)', () => {
    const now = new Date();
    const nextMonth = format(new Date(now.getFullYear(), now.getMonth() + 1, 10), 'yyyy-MM-dd');
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      transactions: [
        { id: 1, type: 'expense', amount: -8000, date: nextMonth, periodDate: nextMonth, payment_method_id: 1, installment_plan_id: 3, recurring_plan_id: null },
        { id: 2, type: 'expense', amount: -15000, date: nextMonth, periodDate: nextMonth, payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getNextMonthCardExposure();
    expect(res.futureInstallments).toBe(8000);
    expect(res.nextCyclePurchases).toBe(15000);
    expect(res.total).toBe(23000);
  });

  it('NO cuenta cuotas de meses mas lejanos que el proximo (solo el mes que viene)', () => {
    const now = new Date();
    const nextMonth = format(new Date(now.getFullYear(), now.getMonth() + 1, 10), 'yyyy-MM-dd');
    const inTwoMonths = format(new Date(now.getFullYear(), now.getMonth() + 2, 10), 'yyyy-MM-dd');
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      transactions: [
        { id: 1, type: 'expense', amount: -8000, date: nextMonth, periodDate: nextMonth, payment_method_id: 1, installment_plan_id: 3, recurring_plan_id: null },
        { id: 2, type: 'expense', amount: -8000, date: inTwoMonths, periodDate: inTwoMonths, payment_method_id: 1, installment_plan_id: 3, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getNextMonthCardExposure();
    // solo la cuota del mes que viene; la de dentro de 2 meses no
    expect(res.total).toBe(8000);
  });

  it('valida por medio de pago credito: ignora cuotas/compras de debito o efectivo', () => {
    const now = new Date();
    const nextMonth = format(new Date(now.getFullYear(), now.getMonth() + 1, 10), 'yyyy-MM-dd');
    seed({
      paymentMethods: [
        { id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 },
        { id: 2, name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null },
      ],
      transactions: [
        // cuota pagada en efectivo -> NO cuenta
        { id: 1, type: 'expense', amount: -7000, date: nextMonth, periodDate: nextMonth, payment_method_id: 2, installment_plan_id: 3, recurring_plan_id: null },
        // compra en efectivo -> NO cuenta
        { id: 2, type: 'expense', amount: -9999, date: nextMonth, periodDate: nextMonth, payment_method_id: 2, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getNextMonthCardExposure();
    expect(res.total).toBe(0);
  });

  it('ignora gastos del mes actual', () => {
    const now = new Date();
    const thisMonth = format(new Date(now.getFullYear(), now.getMonth(), 10), 'yyyy-MM-dd');
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      transactions: [
        { id: 1, type: 'expense', amount: -5000, date: thisMonth, periodDate: thisMonth, payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getNextMonthCardExposure();
    expect(res.total).toBe(0);
  });
});

describe('getUpcomingCardDueDates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 3)); // 3 jul 2026: Visa (cierra 20 / vence 5) => ciclo vigente vence 5 jul, próximo vence 5 ago
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lista el próximo resumen por tarjeta con fecha de vencimiento y monto', () => {
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      transactions: [
        { id: 1, type: 'expense', amount: -8000, date: '2026-08-05', periodDate: '2026-08-05', payment_method_id: 1, installment_plan_id: 3, recurring_plan_id: null },
        { id: 2, type: 'expense', amount: -15000, date: '2026-08-05', periodDate: '2026-08-05', payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getUpcomingCardDueDates();
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Visa');
    expect(res.items[0].amountArs).toBe(23000);
    expect(res.items[0].amountUsd).toBe(0);
    expect(res.items[0].dueDate.getMonth()).toBe(7); // agosto
    expect(res.items[0].dueDate.getFullYear()).toBe(2026);
    expect(res.totalArs).toBe(23000);
  });

  it('excluye el ciclo vigente: no duplica el hero', () => {
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      transactions: [
        // vence 5 jul => ciclo vigente (lo cuenta el hero), NO esta card
        { id: 1, type: 'expense', amount: -10000, date: '2026-07-05', periodDate: '2026-07-05', payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getUpcomingCardDueDates();
    expect(res.items).toHaveLength(0);
    expect(res.totalArs).toBe(0);
  });

  it('desglosa ARS y USD sin convertir', () => {
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      transactions: [
        { id: 1, type: 'expense', amount: -60000, original_currency: 'USD', original_amount: 50, date: '2026-08-05', periodDate: '2026-08-05', payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
        { id: 2, type: 'expense', amount: -20000, date: '2026-08-05', periodDate: '2026-08-05', payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getUpcomingCardDueDates();
    expect(res.items[0].amountUsd).toBe(50);
    expect(res.items[0].amountArs).toBe(20000);
    expect(res.totalUsd).toBe(50);
    expect(res.totalArs).toBe(20000);
  });

  it('ignora medios que no son crédito con ciclo', () => {
    seed({
      paymentMethods: [{ id: 2, name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null }],
      transactions: [
        { id: 1, type: 'expense', amount: -9999, date: '2026-08-05', periodDate: '2026-08-05', payment_method_id: 2, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getUpcomingCardDueDates();
    expect(res.items).toHaveLength(0);
  });

  it('suma mensualidades adheridas al medio para el próximo resumen', () => {
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      recurringPlans: [
        { id: 9, description: 'Netflix', amount: 6500, is_active: true, payment_method_id: 1 },
      ],
      transactions: [],
    });
    const res = useFinanceStore.getState().getUpcomingCardDueDates();
    expect(res.items).toHaveLength(1);
    expect(res.items[0].amountArs).toBe(6500);
  });

  it('sin consumo futuro cargado no genera items', () => {
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      transactions: [
        { id: 1, type: 'expense', amount: -5000, date: '2026-07-05', periodDate: '2026-07-05', payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getUpcomingCardDueDates();
    expect(res.items).toHaveLength(0);
    expect(res.totalArs).toBe(0);
    expect(res.totalUsd).toBe(0);
  });
});
