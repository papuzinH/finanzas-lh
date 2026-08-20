// Restaurado desde src/lib/store/__tests__/disponible-real.test.ts (borrado junto con
// getRealAvailableBalance en el retiro del modelo de flujo acumulado, commit 1337014).
// getRecurringBackfillPreview no se retiró: sigue vivo en el store y estos eran sus
// únicos tests. Recuperado con `git show 1337014:src/lib/store/__tests__/disponible-real.test.ts`.
import { describe, it, expect, beforeEach } from 'vitest';
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
