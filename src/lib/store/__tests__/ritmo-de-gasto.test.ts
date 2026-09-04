import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useFinanceStore } from '@/lib/store/financeStore';

/**
 * El grafico "¿Llegas a fin de mes?" acumulaba el gasto por el dia de `periodDate`,
 * que en credito es el dia del CIERRE del resumen -- no el dia que gastaste.
 *
 * Consecuencias medidas contra produccion el 2026-09-04:
 *  - 67 de 68 movimientos de credito con cierre en septiembre ($1.029.504 de
 *    $1.038.551) eran INVISIBLES en el grafico, porque su dia de cierre todavia
 *    no habia llegado y el acumulado solo recorre hasta hoy.
 *  - 41 movimientos ocurridos en 17 dias distintos colapsaban en 4 dias de cierre.
 *  - 216 de 344 cuotas viven en ciclos cuyo cierre y vencimiento caen en meses
 *    distintos: pasaban el scope y se caian del segundo filtro, sin dejar rastro.
 *
 * Los fixtures de aca NUNCA emparejan `periodDate` con `date`: ese emparejamiento
 * es lo que dejaba ciego al test viejo (analysis-getters.test.ts:61).
 */

function seed(partial: Record<string, unknown>) {
  useFinanceStore.setState(partial as never);
}

const VISA = {
  id: 'visa',
  type: 'credit',
  default_closing_day: 20,
  default_payment_day: 1,
  name: 'Visa',
};

beforeEach(() => {
  useFinanceStore.setState({
    transactions: [], installmentPlans: [], paymentMethods: [], recurringPlans: [],
    categories: [], exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS',
    inflationSeries: [], creditCardCycles: [],
  } as never);
  vi.useFakeTimers();
  // 4 de septiembre de 2026: el resumen de la Visa todavia no cerro (cierra el 20).
  vi.setSystemTime(new Date(2026, 8, 4));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getMonthlySpendingPace — el dia del eje', () => {
  it('cuenta una compra de credito el dia que se compro, no el dia del cierre', () => {
    seed({
      paymentMethods: [VISA],
      transactions: [
        {
          id: '1',
          type: 'expense',
          amount: 100000,
          // Comprada el 2. Cae en el resumen que cierra el 20 y vence el 1 de octubre.
          purchase_date: '2026-09-02',
          periodDate: '2026-09-20',
          date: '2026-10-01',
          realPaymentDate: '2026-10-01',
          payment_method_id: 'visa',
          installment_plan_id: null,
          cycle_id: 'c1',
        },
      ],
    });

    const res = useFinanceStore.getState().getMonthlySpendingPace();

    const hoy = res.points.find((p) => p.day === 4);
    expect(hoy?.cumulative).toBe(100000);
  });

  it('no apila dos compras de dias distintos en el mismo dia del cierre', () => {
    seed({
      paymentMethods: [VISA],
      transactions: [
        {
          id: '1', type: 'expense', amount: 30000,
          purchase_date: '2026-09-01', periodDate: '2026-09-20',
          date: '2026-10-01', realPaymentDate: '2026-10-01',
          payment_method_id: 'visa', installment_plan_id: null, cycle_id: 'c1',
        },
        {
          id: '2', type: 'expense', amount: 70000,
          purchase_date: '2026-09-03', periodDate: '2026-09-20',
          date: '2026-10-01', realPaymentDate: '2026-10-01',
          payment_method_id: 'visa', installment_plan_id: null, cycle_id: 'c1',
        },
      ],
    });

    const res = useFinanceStore.getState().getMonthlySpendingPace();

    // El 1 ya suma 30k; el 3 acumula los dos.
    expect(res.points.find((p) => p.day === 1)?.cumulative).toBe(30000);
    expect(res.points.find((p) => p.day === 2)?.cumulative).toBe(30000);
    expect(res.points.find((p) => p.day === 3)?.cumulative).toBe(100000);
  });

  it('sin purchase_date cae al dia del cierre, sin perderse', () => {
    seed({
      paymentMethods: [VISA],
      transactions: [
        {
          id: '1', type: 'expense', amount: 50000,
          // Fila vieja: el backfill no pudo recuperar la fecha de compra.
          purchase_date: null, periodDate: '2026-09-20',
          date: '2026-10-01', realPaymentDate: '2026-10-01',
          payment_method_id: 'visa', installment_plan_id: null, cycle_id: 'c1',
        },
      ],
    });

    const res = useFinanceStore.getState().getMonthlySpendingPace();
    const total = res.points[res.points.length - 1].cumulative;

    // Todavia no llego el dia 20, asi que hoy no suma -- pero el gasto existe
    // y aparecera cuando el cierre llegue. Lo que no puede es desaparecer.
    expect(total).toBe(0);
    expect(res.projectedTotal).toBe(0);
  });
});

describe('getMonthlySpendingPace — pertenencia al mes', () => {
  it('no descarta un gasto del mes cuya fecha de compra es anterior al mes', () => {
    seed({
      paymentMethods: [VISA],
      transactions: [
        {
          id: '1', type: 'expense', amount: 80000,
          // Comprada el 28 de agosto, pero entro al resumen que cierra el 20 de
          // septiembre: pertenece a este mes aunque se haya comprado el anterior.
          purchase_date: '2026-08-28', periodDate: '2026-09-20',
          date: '2026-10-01', realPaymentDate: '2026-10-01',
          payment_method_id: 'visa', installment_plan_id: null, cycle_id: 'c1',
        },
      ],
    });

    const res = useFinanceStore.getState().getMonthlySpendingPace();

    // Arranca el mes ya gastada: se apoya en el dia 1, no se pierde.
    expect(res.points.find((p) => p.day === 1)?.cumulative).toBe(80000);
  });

  it('cuenta una cuota cuyo ciclo cerro el mes pasado y vence este mes', () => {
    seed({
      paymentMethods: [VISA],
      transactions: [
        {
          id: '1', type: 'expense', amount: 45000,
          // El scope de cuotas mira el VENCIMIENTO (t.date). El resumen real fue
          // declarado y cerro el 25 de agosto, asi que periodDate es de agosto:
          // el segundo filtro por periodDate la descartaba en silencio.
          purchase_date: '2026-08-15', periodDate: '2026-08-25',
          date: '2026-10-01', realPaymentDate: '2026-10-01',
          payment_method_id: 'visa', installment_plan_id: 'plan-1', cycle_id: 'c0',
        },
      ],
    });

    const res = useFinanceStore.getState().getMonthlySpendingPace();
    const total = res.points[res.points.length - 1].cumulative;

    expect(total).toBe(45000);
  });
});
