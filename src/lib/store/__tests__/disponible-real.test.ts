import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    seed({
      recurringPlans: [
        { id: 9, description: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null, created_at: createdAt },
      ],
      transactions: [],
    });
    const res = useFinanceStore.getState().getRecurringBackfillPreview();
    // mes de creacion + mes pasado = 2 meses faltantes (el actual no cuenta)
    expect(res.missingMonths).toBe(2);
    expect(res.totalAmount).toBe(200000);
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
        { id: 1, type: 'expense', amount: -100000, date: lastMonth, periodDate: lastMonth, payment_method_id: null, installment_plan_id: null, recurring_plan_id: 9 },
      ],
    });
    const res = useFinanceStore.getState().getRecurringBackfillPreview();
    expect(res.missingMonths).toBe(0);
    expect(res.totalAmount).toBe(0);
  });
});

describe('getNextMonthCardExposure', () => {
  it('suma cuotas con periodDate en meses futuros', () => {
    const now = new Date();
    const nextMonth = format(new Date(now.getFullYear(), now.getMonth() + 1, 10), 'yyyy-MM-dd');
    const thisMonth = format(new Date(now.getFullYear(), now.getMonth(), 10), 'yyyy-MM-dd');
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      transactions: [
        { id: 1, type: 'expense', amount: -8000, date: nextMonth, periodDate: nextMonth, payment_method_id: 1, installment_plan_id: 3, recurring_plan_id: null },
        { id: 2, type: 'expense', amount: -8000, date: thisMonth, periodDate: thisMonth, payment_method_id: 1, installment_plan_id: 3, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getNextMonthCardExposure();
    // solo la cuota del mes que viene cuenta como futura
    expect(res.futureInstallments).toBe(8000);
  });

  it('suma compras de credito (no cuota) con periodDate en el proximo mes', () => {
    const now = new Date();
    const nextMonth = format(new Date(now.getFullYear(), now.getMonth() + 1, 10), 'yyyy-MM-dd');
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      transactions: [
        { id: 1, type: 'expense', amount: -15000, date: nextMonth, periodDate: nextMonth, payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getNextMonthCardExposure();
    expect(res.nextCyclePurchases).toBe(15000);
    expect(res.total).toBe(15000);
  });

  it('ignora gastos de debito/efectivo y del mes actual', () => {
    const now = new Date();
    const thisMonth = format(new Date(now.getFullYear(), now.getMonth(), 10), 'yyyy-MM-dd');
    const nextMonth = format(new Date(now.getFullYear(), now.getMonth() + 1, 10), 'yyyy-MM-dd');
    seed({
      paymentMethods: [
        { id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 },
        { id: 2, name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null },
      ],
      transactions: [
        { id: 1, type: 'expense', amount: -5000, date: thisMonth, periodDate: thisMonth, payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
        { id: 2, type: 'expense', amount: -9999, date: nextMonth, periodDate: nextMonth, payment_method_id: 2, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getNextMonthCardExposure();
    expect(res.total).toBe(0);
  });
});
