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
    inflationSeries: [], internalTransfers: [],
  } as never);
});

describe('getPendingFixedExpenses', () => {
  it('cuenta mensualidad activa sin transacción este mes como pendiente', () => {
    seed({
      recurringPlans: [
        { id: '1', description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null },
        { id: '2', description: 'Internet', amount: 20000, is_active: true, payment_method_id: null },
      ],
      transactions: [],
    });
    const res = useFinanceStore.getState().getPendingFixedExpenses();
    expect(res.total).toBe(120000);
    expect(res.items).toHaveLength(2);
    expect(res.items.find((i) => i.id === '1')?.name).toBe('Alquiler');
  });

  it('excluye mensualidad que ya tiene transacción vinculada este mes', () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    seed({
      recurringPlans: [
        { id: '1', description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null },
      ],
      transactions: [
        { id: '50', type: 'expense', amount: -100000, date: today, periodDate: today, recurring_plan_id: '1', installment_plan_id: null, payment_method_id: null },
      ],
    });
    const res = useFinanceStore.getState().getPendingFixedExpenses();
    expect(res.total).toBe(0);
    expect(res.items).toHaveLength(0);
  });

  it('ignora mensualidades inactivas', () => {
    seed({
      recurringPlans: [
        { id: '1', description: 'Viejo', amount: 5000, is_active: false, payment_method_id: null },
      ],
    });
    expect(useFinanceStore.getState().getPendingFixedExpenses().total).toBe(0);
  });
});

describe('getRealAvailableBalance', () => {
  it('saldoBruto = ingresos - gastos variables - cuotas historicas - mensualidades pagadas - ahorro', () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    seed({
      paymentMethods: [{ id: '1', name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null }],
      transactions: [
        { id: '1', type: 'income', amount: 200000, date: today, periodDate: today, payment_method_id: '1', installment_plan_id: null, recurring_plan_id: null },
        { id: '2', type: 'expense', amount: -30000, date: today, periodDate: today, payment_method_id: '1', installment_plan_id: null, recurring_plan_id: null },
      ],
      internalTransfers: [{ id: '1', amount: 10000, period_date: today }],
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
      paymentMethods: [{ id: '1', name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null }],
      transactions: [
        { id: '1', type: 'income', amount: 200000, date: today, periodDate: today, payment_method_id: '1', installment_plan_id: null, recurring_plan_id: null },
      ],
      recurringPlans: [
        { id: '9', description: 'Alquiler', amount: 50000, is_active: true, payment_method_id: '1' },
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
      paymentMethods: [{ id: '1', name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null }],
      recurringPlans: [{ id: '9', description: 'Alquiler', amount: 50000, is_active: true, payment_method_id: '1' }],
    };
    // Antes de pagar
    seed({
      ...base,
      transactions: [
        { id: '1', type: 'income', amount: 200000, date: today, periodDate: today, payment_method_id: '1', installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const antes = useFinanceStore.getState().getRealAvailableBalance().disponibleReal;
    // Despues de pagar: aparece la transaccion vinculada a la mensualidad
    seed({
      ...base,
      transactions: [
        { id: '1', type: 'income', amount: 200000, date: today, periodDate: today, payment_method_id: '1', installment_plan_id: null, recurring_plan_id: null },
        { id: '2', type: 'expense', amount: -50000, date: today, periodDate: today, payment_method_id: '1', installment_plan_id: null, recurring_plan_id: '9' },
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
      paymentMethods: [{ id: '1', name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null }],
      recurringPlans: [
        { id: '9', description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: '1' },
      ],
      transactions: [
        { id: '1', type: 'income', amount: 1000000, date: today, periodDate: today, payment_method_id: '1', installment_plan_id: null, recurring_plan_id: null },
        // alquiler del mes pasado, YA PAGADO (transaccion vinculada al plan)
        { id: '2', type: 'expense', amount: -100000, date: lastMonth, periodDate: lastMonth, payment_method_id: '1', installment_plan_id: null, recurring_plan_id: '9' },
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
          { id: '1', name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null },
          { id: '2', name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 },
        ],
        transactions: [
          { id: '1', type: 'income', amount: 3000000, date: enCiclo, periodDate: enCiclo, payment_method_id: '1', installment_plan_id: null, recurring_plan_id: null },
          { id: '2', type: 'expense', amount: -120000, date: enCiclo, periodDate: enCiclo, payment_method_id: '2', installment_plan_id: null, recurring_plan_id: null },
          { id: '3', type: 'expense', amount: -80000, date: cuotaAgo, periodDate: cuotaAgo, payment_method_id: '2', installment_plan_id: '7', recurring_plan_id: null },
        ],
        installmentPlans: [{ id: '7', description: 'Notebook', total_amount: 240000, installments_count: 3 }],
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
        { id: '9', description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null, created_at: createdAt },
      ],
      transactions: [
        // primera transaccion REAL fija el piso del historial hace 2 meses
        { id: '1', type: 'income', amount: 500000, date: twoMonthsAgo, periodDate: twoMonthsAgo, payment_method_id: null, installment_plan_id: null, recurring_plan_id: null },
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
        { id: '9', description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null, created_at: createdAt },
      ],
      transactions: [
        // ...pero el historial real arranca hace 2 meses
        { id: '1', type: 'income', amount: 500000, date: twoMonthsAgo, periodDate: twoMonthsAgo, payment_method_id: null, installment_plan_id: null, recurring_plan_id: null },
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
        { id: '9', description: 'Netflix', amount: 100000, is_active: true, payment_method_id: null, created_at: createdAt },
      ],
      transactions: [
        // gasto/cuota ANTES del primer ingreso: NO debe fijar el piso
        { id: '1', type: 'expense', amount: -40000, date: fourMonthsAgo, periodDate: fourMonthsAgo, payment_method_id: null, installment_plan_id: '7', recurring_plan_id: null },
        // primer INGRESO real hace 2 meses -> este es el piso
        { id: '2', type: 'income', amount: 500000, date: twoMonthsAgo, periodDate: twoMonthsAgo, payment_method_id: null, installment_plan_id: null, recurring_plan_id: null },
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
        { id: '9', description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null, created_at: subMonths(now, 4).toISOString() },
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
        { id: '9', description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null, created_at: createdAt },
      ],
      transactions: [
        // piso del historial: income real el mes pasado
        { id: '1', type: 'income', amount: 500000, date: lastMonth, periodDate: lastMonth, payment_method_id: null, installment_plan_id: null, recurring_plan_id: null },
        { id: '2', type: 'expense', amount: -100000, date: lastMonth, periodDate: lastMonth, payment_method_id: null, installment_plan_id: null, recurring_plan_id: '9' },
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
        { id: '9', description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null, created_at: subMonths(now, 3).toISOString() },
      ],
      transactions: [
        // piso: primera transaccion real hace 1 mes
        { id: '1', type: 'income', amount: 500000, date: lastMonth, periodDate: lastMonth, payment_method_id: null, installment_plan_id: null, recurring_plan_id: null },
        // pago backfilleado ANTES del piso -> exceso a limpiar
        { id: '2', type: 'expense', amount: -100000, date: threeMonthsAgo, periodDate: threeMonthsAgo, payment_method_id: null, installment_plan_id: null, recurring_plan_id: '9' },
        // pago dentro del historial -> cubre su mes, no es exceso
        { id: '3', type: 'expense', amount: -100000, date: lastMonth, periodDate: lastMonth, payment_method_id: null, installment_plan_id: null, recurring_plan_id: '9' },
      ],
    });
    const res = useFinanceStore.getState().getRecurringBackfillPreview();
    expect(res.excessMonths).toBe(1);
    expect(res.excessAmount).toBe(100000);
    expect(res.missingMonths).toBe(0);
  });
});

describe('borde del vencimiento: el día del vencimiento sigue siendo el ciclo vigente', () => {
  afterEach(() => vi.useRealTimers());

  // Master: cierra día 2, vence día 13.
  // - consumo de junio -> vence 13 jul (t.date = fecha de vencimiento calculada), $50.000
  // - consumo de julio -> vence 13 ago, $30.000
  function seedMaster() {
    seed({
      paymentMethods: [{ id: '1', name: 'Master', type: 'credit', default_closing_day: 2, default_payment_day: 13 }],
      transactions: [
        { id: '1', type: 'expense', amount: -50000, date: '2026-07-13', periodDate: '2026-07-13', payment_method_id: '1', installment_plan_id: null, recurring_plan_id: null },
        { id: '2', type: 'expense', amount: -30000, date: '2026-08-13', periodDate: '2026-08-13', payment_method_id: '1', installment_plan_id: null, recurring_plan_id: null },
      ],
    });
  }

  function pendingAtDay(day: number) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, day, 10, 0, 0)); // 10hs para no depender del borde de medianoche
    seedMaster();
    const { pendingCardTotal, pendingCardItems } = useFinanceStore.getState().getRealAvailableBalance();
    return { pendingCardTotal, item: pendingCardItems[0] };
  }

  it('12 jul: resta el resumen que vence el 13 jul (consumo junio)', () => {
    const { pendingCardTotal, item } = pendingAtDay(12);
    expect(pendingCardTotal).toBe(50000);
    expect(item.nextPaymentDate.getMonth()).toBe(6); // julio
  });

  it('13 jul (día del vencimiento): SIGUE restando el resumen que vence hoy', () => {
    const { pendingCardTotal, item } = pendingAtDay(13);
    expect(pendingCardTotal).toBe(50000);
    expect(item.nextPaymentDate.getMonth()).toBe(6); // julio, no agosto
  });

  it('14 jul: recalcula al siguiente ciclo (consumo julio, vence 13 ago)', () => {
    const { pendingCardTotal, item } = pendingAtDay(14);
    expect(pendingCardTotal).toBe(30000);
    expect(item.nextPaymentDate.getMonth()).toBe(7); // agosto
  });
});

describe('isCycleClosed: distingue resumen cerrado vs ciclo en curso', () => {
  afterEach(() => vi.useRealTimers());

  it('marca cerrado el ciclo cuyo cierre ya pasó y en curso el que aún acumula', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 7, 10, 0, 0)); // 7 jul 2026
    seed({
      paymentMethods: [
        // Master cerró el 2 jul (vence 13 jul) -> cerrado
        { id: '1', name: 'Master', type: 'credit', default_closing_day: 2, default_payment_day: 13 },
        // Visa cierra el 23 jul (vence 3 ago) -> en curso
        { id: '2', name: 'Visa', type: 'credit', default_closing_day: 23, default_payment_day: 3 },
      ],
      transactions: [
        { id: '1', type: 'expense', amount: -50000, date: '2026-07-13', periodDate: '2026-07-13', payment_method_id: '1', installment_plan_id: null, recurring_plan_id: null },
        { id: '2', type: 'expense', amount: -90000, date: '2026-08-03', periodDate: '2026-08-03', payment_method_id: '2', installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const items = useFinanceStore.getState().getRealAvailableBalance().pendingCardItems;
    const master = items.find((i) => i.methodId === '1')!;
    const visa = items.find((i) => i.methodId === '2')!;
    expect(master.isCycleClosed).toBe(true);
    expect(visa.isCycleClosed).toBe(false);
  });
});
