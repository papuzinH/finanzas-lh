import { describe, it, expect, beforeEach } from 'vitest';
import { format } from 'date-fns';
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
