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

describe('getMonthlySpendingPace — la proyección', () => {
  /**
   * Lo que se compró en un mes anterior se apoya en el día 1, y proyectar sobre eso
   * dispara el número: `spentSoFar / todayDay * daysInMonth` con todo el peso en el
   * día 1 y `todayDay` chico infla por el mes entero. No es teórico -- TODAS las
   * cuotas de un plan comparten la `purchase_date` de la compra original
   * (installments/actions.ts), así que un resumen lleno de cuotas viejas cae entero
   * ahí. Medido en producción: un usuario con 19 de 19 filas compradas antes de
   * septiembre proyectaría más de $2.000.000 el día 4.
   *
   * Lo heredado es un monto FIJO: se suma, no se extrapola. Sólo se proyecta el
   * ritmo de lo que se gastó dentro del mes.
   */
  it('no extrapola lo que ya venía comprado de meses anteriores', () => {
    seed({
      paymentMethods: [VISA],
      transactions: [
        {
          id: 'cuota-vieja', type: 'expense', amount: 100000,
          purchase_date: '2026-07-15', periodDate: '2026-09-20',
          date: '2026-10-01', realPaymentDate: '2026-10-01',
          payment_method_id: 'visa', installment_plan_id: 'plan-1', cycle_id: 'c1',
        },
        {
          id: 'gasto-real', type: 'expense', amount: 3000,
          purchase_date: '2026-09-03', periodDate: '2026-09-20',
          date: '2026-10-01', realPaymentDate: '2026-10-01',
          payment_method_id: 'visa', installment_plan_id: null, cycle_id: 'c1',
        },
      ],
    })

    const res = useFinanceStore.getState().getMonthlySpendingPace()

    // El acumulado SÍ muestra la plata entera: son $103.000 comprometidos.
    expect(res.points.find((p) => p.day === 4)?.cumulative).toBe(103000)
    // Pero el ritmo del mes son $3.000 en 4 días, no $103.000 en 4 días:
    // 100000 + (3000 / 4) * 30 = 122500, no 103000 / 4 * 30 = 772500.
    expect(res.projectedTotal).toBe(122500)
  })

  /**
   * Una mensualidad o una cuota de ESTE mes ya está completa: Netflix no se cobra
   * de nuevo el día 15. No tienen ritmo, así que se suman enteras en vez de
   * extrapolarse -- incluidas las que caen en días del mes que todavía no llegaron,
   * porque van a ocurrir igual.
   *
   * Medido con los datos de Lauti el 2026-09-04: de $975.473 acumulados al día 4,
   * $853.848 (87%) eran mensualidades. Multiplicar eso por 30/4 daba $7,3M contra
   * $252.260 de gasto variable en todo el mes.
   */
  it('suma los fijos del mes enteros y extrapola solo lo variable', () => {
    seed({
      paymentMethods: [],
      transactions: [
        // Mensualidad ya cobrada este mes.
        {
          id: 'netflix', type: 'expense', amount: 20000, recurring_plan_id: 'r1',
          purchase_date: null, periodDate: '2026-09-02', date: '2026-09-02',
          realPaymentDate: '2026-09-02', payment_method_id: null,
          installment_plan_id: null, cycle_id: null,
        },
        // Mensualidad de este mes que cae DESPUÉS de hoy: va a ocurrir igual.
        {
          id: 'alquiler', type: 'expense', amount: 300000, recurring_plan_id: 'r2',
          purchase_date: null, periodDate: '2026-09-10', date: '2026-09-10',
          realPaymentDate: '2026-09-10', payment_method_id: null,
          installment_plan_id: null, cycle_id: null,
        },
        // Cuota de este mes.
        {
          id: 'cuota', type: 'expense', amount: 5000, installment_plan_id: 'p1',
          purchase_date: '2026-09-01', periodDate: '2026-09-01', date: '2026-09-01',
          realPaymentDate: '2026-09-01', payment_method_id: null,
          recurring_plan_id: null, cycle_id: null,
        },
        // Gasto variable: $4.000 en 4 días es lo único con ritmo.
        {
          id: 'super', type: 'expense', amount: 4000,
          purchase_date: null, periodDate: '2026-09-03', date: '2026-09-03',
          realPaymentDate: '2026-09-03', payment_method_id: null,
          installment_plan_id: null, recurring_plan_id: null, cycle_id: null,
        },
      ],
    })

    const res = useFinanceStore.getState().getMonthlySpendingPace()

    // 20000 + 300000 + 5000 fijos, + (4000 / 4) * 30 = 30000 de ritmo.
    expect(res.projectedTotal).toBe(355000)
    // La línea NO cambia: sigue mostrando lo que ya pasó (sin el alquiler del 10).
    expect(res.points.find((p) => p.day === 4)?.cumulative).toBe(29000)
  })

  it('proyecta normal cuando todo el gasto es del mes', () => {
    seed({
      paymentMethods: [],
      transactions: [
        {
          id: '1', type: 'expense', amount: 4000,
          purchase_date: null, periodDate: '2026-09-02',
          date: '2026-09-02', realPaymentDate: '2026-09-02',
          payment_method_id: null, installment_plan_id: null, cycle_id: null,
        },
      ],
    })

    const res = useFinanceStore.getState().getMonthlySpendingPace()

    // 4000 en 4 días → 1000/día → 30000 en el mes.
    expect(res.projectedTotal).toBe(30000)
  })
})

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
