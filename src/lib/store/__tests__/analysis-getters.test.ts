import { describe, it, expect, beforeEach, vi } from 'vitest';
import { format, subMonths } from 'date-fns';
import { useFinanceStore, parseInflation } from '@/lib/store/financeStore';

// Helper: setear estado crudo del store en cada test
function seed(partial: Record<string, unknown>) {
  useFinanceStore.setState(partial as never);
}

beforeEach(() => {
  useFinanceStore.setState({
    transactions: [], installmentPlans: [], paymentMethods: [], recurringPlans: [],
    categories: [], exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS',
    inflationSeries: [], creditCardCycles: [],
  } as never);
});

describe('displayCurrency slice', () => {
  it('default es ARS y toDisplay devuelve el mismo monto', () => {
    const s = useFinanceStore.getState();
    expect(s.displayCurrency).toBe('ARS');
    expect(s.toDisplay(1000)).toBe(1000);
  });

  it('setDisplayCurrency cambia el estado', () => {
    useFinanceStore.getState().setDisplayCurrency('USD');
    expect(useFinanceStore.getState().displayCurrency).toBe('USD');
  });

  it('getUsdRate usa MEP si existe, sino blue, sino 1', () => {
    seed({ dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' } });
    expect(useFinanceStore.getState().getUsdRate()).toBe(1000);
    seed({ exchangeRates: [{ pair: 'USD_ARS_MEP', rate: 1200 }] });
    expect(useFinanceStore.getState().getUsdRate()).toBe(1200);
  });

  it('toDisplay convierte a USD cuando displayCurrency=USD', () => {
    seed({ dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' }, displayCurrency: 'USD' });
    expect(useFinanceStore.getState().toDisplay(100000)).toBe(100);
  });
});

describe('parseInflation', () => {
  it('mapea fecha->yyyy-MM y valor->rate', () => {
    const out = parseInflation([
      { fecha: '2026-05-31', valor: 5.2 },
      { fecha: '2026-06-30', valor: 4.8 },
    ]);
    expect(out).toEqual([
      { month: '2026-05', rate: 5.2 },
      { month: '2026-06', rate: 4.8 },
    ]);
  });

  it('getInflationSeries devuelve lo seteado en estado', () => {
    seed({ inflationSeries: [{ month: '2026-06', rate: 4.8 }] });
    expect(useFinanceStore.getState().getInflationSeries()).toEqual([{ month: '2026-06', rate: 4.8 }]);
  });
});

describe('getMonthlySpendingPace', () => {
  it('acumula gasto por día y proyecta a fin de mes', () => {
    // Mock current date to July 2, 2026 to allow testing day 2
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 2)); // July 2, 2026

    try {
      const now = new Date();
      const y = now.getFullYear(); const m = now.getMonth();
      const d = (day: number) => format(new Date(y, m, day), 'yyyy-MM-dd');
      seed({
        transactions: [
          { id: '1', type: 'expense', amount: -1000, date: d(2), periodDate: d(2), realPaymentDate: d(2), payment_method_id: null, installment_plan_id: null },
          { id: '2', type: 'expense', amount: -500, date: d(2), periodDate: d(2), realPaymentDate: d(2), payment_method_id: null, installment_plan_id: null },
          { id: '3', type: 'income', amount: 50000, date: d(1), periodDate: d(1), realPaymentDate: d(1), payment_method_id: null, installment_plan_id: null },
        ],
        paymentMethods: [],
      });
      const res = useFinanceStore.getState().getMonthlySpendingPace();
      expect(res.income).toBe(50000);
      // gasto acumulado al día 2 = 1500
      const day2 = res.points.find((p) => p.day === 2);
      expect(day2?.cumulative).toBe(1500);
      expect(res.projectedTotal).toBeGreaterThanOrEqual(1500);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getCategoryFrequencyRanking', () => {
  it('cuenta movimientos, suma total y promedio por categoria (no montos absolutos, income excluido)', () => {
    const now = new Date();
    const d = (day: number) => format(new Date(now.getFullYear(), now.getMonth(), day), 'yyyy-MM-dd');
    seed({
      categories: [{ id: '10', name: 'Comida', emoji: '🍔' }],
      transactions: [
        { id: '1', type: 'expense', amount: -100, date: d(3), periodDate: d(3), category_id: '10', installment_plan_id: null, realPaymentDate: d(3), payment_method_id: null },
        { id: '2', type: 'expense', amount: -200, date: d(5), periodDate: d(5), category_id: '10', installment_plan_id: null, realPaymentDate: d(5), payment_method_id: null },
        { id: '3', type: 'income', amount: 999, date: d(5), periodDate: d(5), category_id: '10', realPaymentDate: d(5), payment_method_id: null },
      ],
    });
    const res = useFinanceStore.getState().getCategoryFrequencyRanking('current_month');
    const comida = res.find((r) => r.category === 'Comida');
    // 2 gastos este mes (income excluido)
    expect(comida?.count).toBe(2);
    expect(comida?.total).toBe(300);
    expect(comida?.avg).toBe(150);
    expect(comida?.emoji).toBe('🍔');
  });
});

describe('getMonthlyTrend', () => {
  it('suma los planes recurrentes activos como gasto fijo aunque no tengan transaccion cargada ese mes', () => {
    const now = new Date();
    const d = format(now, 'yyyy-MM-dd');
    seed({
      recurringPlans: [
        {
          id: '1', user_id: '1', description: 'Alquiler', amount: 300, currency: 'ARS',
          frequency: 'monthly', is_active: true, category_id: null,
          created_at: format(subMonths(now, 3), 'yyyy-MM-dd'),
          payment_method_id: null, original_amount: null, rate_pair: null, exchange_rate: null,
        },
      ],
      transactions: [
        { id: '1', type: 'income', amount: 1000, date: d },
        { id: '2', type: 'expense', amount: -200, date: d, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getMonthlyTrend(1);
    expect(res[0].recurring).toBe(300);
    expect(res[0].expenses).toBe(500); // 200 variable + 300 fijo proyectado
    expect(res[0].net).toBe(500); // 1000 - 500
  });

  it('no duplica el gasto fijo si ya existe una transaccion vinculada al plan ese mes', () => {
    const now = new Date();
    const d = format(now, 'yyyy-MM-dd');
    seed({
      recurringPlans: [
        {
          id: '1', user_id: '1', description: 'Alquiler', amount: 300, currency: 'ARS',
          frequency: 'monthly', is_active: true, category_id: null,
          created_at: format(subMonths(now, 3), 'yyyy-MM-dd'),
          payment_method_id: null, original_amount: null, rate_pair: null, exchange_rate: null,
        },
      ],
      transactions: [
        { id: '1', type: 'income', amount: 1000, date: d },
        { id: '2', type: 'expense', amount: -300, date: d, installment_plan_id: null, recurring_plan_id: '1' },
      ],
    });
    const res = useFinanceStore.getState().getMonthlyTrend(1);
    expect(res[0].recurring).toBe(300);
    expect(res[0].expenses).toBe(300);
  });

  it('no proyecta un plan recurrente en meses anteriores a su creacion', () => {
    const now = new Date();
    seed({
      recurringPlans: [
        {
          id: '1', user_id: '1', description: 'Plan nuevo', amount: 300, currency: 'ARS',
          frequency: 'monthly', is_active: true, category_id: null,
          created_at: format(now, 'yyyy-MM-dd'),
          payment_method_id: null, original_amount: null, rate_pair: null, exchange_rate: null,
        },
      ],
      transactions: [],
    });
    const res = useFinanceStore.getState().getMonthlyTrend(3);
    expect(res[0].recurring).toBe(0); // 2 meses atras, antes de que el plan existiera
    expect(res[2].recurring).toBe(300); // mes actual, el plan ya existe
  });

  it('no suma planes recurrentes inactivos', () => {
    const now = new Date();
    seed({
      recurringPlans: [
        {
          id: '1', user_id: '1', description: 'Cancelado', amount: 300, currency: 'ARS',
          frequency: 'monthly', is_active: false, category_id: null,
          created_at: format(subMonths(now, 3), 'yyyy-MM-dd'),
          payment_method_id: null, original_amount: null, rate_pair: null, exchange_rate: null,
        },
      ],
      transactions: [],
    });
    const res = useFinanceStore.getState().getMonthlyTrend(1);
    expect(res[0].recurring).toBe(0);
  });
});

describe('getSavingsRateSeries', () => {
  it('calcula tasa de ahorro por mes desde getMonthlyTrend', () => {
    seed({
      transactions: [
        { id: '1', type: 'income', amount: 1000, date: format(new Date(), 'yyyy-MM-dd') },
        { id: '2', type: 'expense', amount: -600, date: format(new Date(), 'yyyy-MM-dd'), installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getSavingsRateSeries(1);
    expect(res[0].rate).toBeCloseTo(40, 1); // (1000-600)/1000
  });

  it('asigna tone="good" cuando la tasa es >= 15', () => {
    seed({
      transactions: [
        { id: '1', type: 'income', amount: 1000, date: format(new Date(), 'yyyy-MM-dd') },
        { id: '2', type: 'expense', amount: -800, date: format(new Date(), 'yyyy-MM-dd'), installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    // rate = (1000-800)/1000*100 = 20
    expect(useFinanceStore.getState().getSavingsRateSeries(1)[0].tone).toBe('good');
  });

  it('asigna tone="warn" cuando la tasa está entre 0 y 15, y tone="bad" cuando es negativa', () => {
    seed({
      transactions: [
        { id: '1', type: 'income', amount: 1000, date: format(new Date(), 'yyyy-MM-dd') },
        { id: '2', type: 'expense', amount: -950, date: format(new Date(), 'yyyy-MM-dd'), installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    // rate = 5 -> warn
    expect(useFinanceStore.getState().getSavingsRateSeries(1)[0].tone).toBe('warn');

    seed({
      transactions: [
        { id: '1', type: 'income', amount: 1000, date: format(new Date(), 'yyyy-MM-dd') },
        { id: '2', type: 'expense', amount: -1200, date: format(new Date(), 'yyyy-MM-dd'), installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    // rate = -20 -> bad
    expect(useFinanceStore.getState().getSavingsRateSeries(1)[0].tone).toBe('bad');
  });
});

describe('getRealAdjustedTrend', () => {
  it('available=false sin datos de inflacion', () => {
    seed({ inflationSeries: [] });
    expect(useFinanceStore.getState().getRealAdjustedTrend(3).available).toBe(false);
  });

  it('deflacta gastos usando IPC acumulado a hoy', () => {
    const thisMonth = format(new Date(), 'yyyy-MM');
    seed({
      inflationSeries: [{ month: thisMonth, rate: 0 }],
      transactions: [{ id: '1', type: 'expense', amount: -1000, date: format(new Date(), 'yyyy-MM-dd'), installment_plan_id: null, recurring_plan_id: null }],
    });
    const res = useFinanceStore.getState().getRealAdjustedTrend(1);
    expect(res.available).toBe(true);
    // mes actual sin inflación posterior => real == nominal
    expect(res.rows[0].realExpenses).toBeCloseTo(res.rows[0].nominalExpenses, 0);
  });

  it('deflacta múltiples meses componiendo solo la inflación posterior al mes', () => {
    const now = new Date();
    const curMonth = format(now, 'yyyy-MM');
    const prevMonth = format(subMonths(now, 1), 'yyyy-MM');
    const dPrev = format(subMonths(now, 1), 'yyyy-MM-dd');
    seed({
      inflationSeries: [
        { month: prevMonth, rate: 5 },   // debe IGNORARSE para el factor del mes previo
        { month: curMonth, rate: 10 },   // única inflación posterior al mes previo
      ],
      transactions: [
        { id: '1', type: 'expense', amount: -1000, date: dPrev, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getRealAdjustedTrend(2);
    expect(res.available).toBe(true);
    const prevRow = res.rows[0];
    // gasto del mes previo deflactado a hoy: 1000 * (1 + 10/100) = 1100 (NO 1000*1.10*1.05)
    expect(prevRow.realExpenses).toBeCloseTo(prevRow.nominalExpenses * 1.1, 2);
    expect(prevRow.realExpenses).toBeCloseTo(1100, 0);
  });
});

describe('getInstallmentsRealCost', () => {
  it('suma cuotas futuras y las valúa en USD', () => {
    const future = format(subMonths(new Date(), -2), 'yyyy-MM-dd'); // 2 meses adelante
    seed({
      dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' },
      transactions: [
        { id: '1', type: 'expense', amount: -50000, date: future, installment_plan_id: '7', periodDate: future, realPaymentDate: future, payment_method_id: null },
      ],
    });
    const res = useFinanceStore.getState().getInstallmentsRealCost();
    expect(res.hasData).toBe(true);
    expect(res.remainingARS).toBe(50000);
    expect(res.remainingUSD).toBe(50);
  });

  it('hasData=false sin cuotas futuras', () => {
    seed({ transactions: [] });
    expect(useFinanceStore.getState().getInstallmentsRealCost().hasData).toBe(false);
  });
});

describe('getCurrencyExposure', () => {
  it('separa gasto ARS vs dolarizado del mes', () => {
    const d = format(new Date(), 'yyyy-MM-dd');
    seed({
      dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' },
      transactions: [
        { id: '1', type: 'expense', amount: -80000, date: d, periodDate: d, realPaymentDate: d, original_currency: 'ARS', payment_method_id: null, installment_plan_id: null },
        { id: '2', type: 'expense', amount: -20000, date: d, periodDate: d, realPaymentDate: d, original_currency: 'USD', original_amount: 20, payment_method_id: null, installment_plan_id: null },
      ],
      paymentMethods: [],
    });
    const res = useFinanceStore.getState().getCurrencyExposure();
    expect(res.totalARS).toBe(100000);
    expect(res.arsShare).toBeCloseTo(80, 1);
    expect(res.usdShare).toBeCloseTo(20, 1);
    expect(res.usdAmountOriginal).toBe(20);
  });
});

describe('pago de tarjeta (card_payment_for)', () => {
  const MP_ID = '20'; // Mercado Pago (débito, medio financiador)
  const CARD_ID = '10'; // tarjeta de crédito (cierra 20, vence 5 → vto 2026-08-05)

  // Ciclo vigente (now=2026-07-15, cierre 20, vence 5): cierra 2026-07-20, vence 2026-08-05.
  const CYCLE_ID = 'visa-ago';

  function base(extra: Record<string, unknown>[] = []) {
    seed({
      paymentMethods: [
        { id: MP_ID, type: 'debit', name: 'Mercado Pago', is_personal: false },
        { id: CARD_ID, type: 'credit', default_closing_day: 20, default_payment_day: 5, name: 'Visa', is_personal: false },
      ],
      recurringPlans: [],
      creditCardCycles: [
        { id: CYCLE_ID, user_id: 'u1', payment_method_id: CARD_ID, closing_date: '2026-07-20', due_date: '2026-08-05', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
      ],
      transactions: [
        // ingreso en Mercado Pago
        { id: '1', type: 'income', amount: 100000, date: '2026-07-01', periodDate: '2026-07-01', realPaymentDate: '2026-07-01', payment_method_id: MP_ID, installment_plan_id: null, recurring_plan_id: null, card_payment_for: null, original_currency: 'ARS' },
        // compra con la tarjeta (vence 2026-08-05)
        { id: '2', type: 'expense', amount: -50000, date: '2026-08-05', periodDate: '2026-07-05', realPaymentDate: '2026-08-05', payment_method_id: CARD_ID, installment_plan_id: null, recurring_plan_id: null, card_payment_for: null, original_currency: 'ARS', cycle_id: CYCLE_ID },
        ...extra,
      ],
    });
  }

  it('el pago baja el saldo del medio financiador pero es neutro para el Disponible global', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
    try {
      // Sin pago registrado
      base();
      const st = useFinanceStore.getState();
      expect(st.getGlobalBalance()).toBe(50000); // 100000 ingreso − 50000 compra
      expect(st.getPaymentMethodStatus(MP_ID).projectedTotal).toBe(100000); // MP sin salidas

      // Con el pago de la tarjeta desde MP (expense marcado card_payment_for)
      base([
        { id: '3', type: 'expense', amount: -50000, date: '2026-08-05', periodDate: '2026-08-05', realPaymentDate: '2026-08-05', payment_method_id: MP_ID, installment_plan_id: null, recurring_plan_id: null, card_payment_for: CARD_ID, original_currency: 'ARS', cycle_id: CYCLE_ID },
      ]);
      const st2 = useFinanceStore.getState();
      expect(st2.getGlobalBalance()).toBe(50000); // NEUTRO: el pago no cambia el Disponible
      expect(st2.getPaymentMethodStatus(MP_ID).projectedTotal).toBe(50000); // MP baja por el pago
    } finally {
      vi.useRealTimers();
    }
  });

  it('la tarjeta queda marcada como pagada por el ciclo del vencimiento', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
    try {
      base();
      expect(useFinanceStore.getState().isCreditCardCyclePaid(CARD_ID)).toBe(false);
      base([
        { id: '3', type: 'expense', amount: -50000, date: '2026-08-05', periodDate: '2026-08-05', realPaymentDate: '2026-08-05', payment_method_id: MP_ID, installment_plan_id: null, recurring_plan_id: null, card_payment_for: CARD_ID, original_currency: 'ARS', cycle_id: CYCLE_ID },
      ]);
      const st = useFinanceStore.getState();
      expect(st.isCreditCardCyclePaid(CARD_ID)).toBe(true);
      const summary = st.getPendingCreditCardByCard().find((c) => c.methodId === CARD_ID);
      expect(summary?.isPending).toBe(false);
      expect(summary?.isPaidManually).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getPaymentMethodStatus (tarjeta de crédito)', () => {
  const CARD_ID = '10';

  // now = 2026-07-15. Ciclo vigente: cierra 20, vence 5 → cierra 2026-07-20, vence
  // 2026-08-05. La pertenencia es por cycle_id, no por t.date: el id '4' lleva un
  // cycle_id de otro ciclo (el que vence 5-sep) aunque su t.date esté ya calculado.
  const CYCLE_ID = 'visa-ago';
  const OTHER_CYCLE_ID = 'visa-sep';

  function seedCard() {
    seed({
      paymentMethods: [
        { id: CARD_ID, type: 'credit', default_closing_day: 20, default_payment_day: 5, name: 'Visa', is_personal: false },
      ],
      recurringPlans: [
        { id: '100', payment_method_id: CARD_ID, is_active: true, amount: 3200, currency: 'ARS', description: 'Spotify' },
        { id: '200', payment_method_id: CARD_ID, is_active: true, amount: 5900, currency: 'ARS', description: 'Netflix' },
      ],
      creditCardCycles: [
        { id: CYCLE_ID, user_id: 'u1', payment_method_id: CARD_ID, closing_date: '2026-07-20', due_date: '2026-08-05', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
        { id: OTHER_CYCLE_ID, user_id: 'u1', payment_method_id: CARD_ID, closing_date: '2026-08-20', due_date: '2026-09-05', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
      ],
      transactions: [
        // compra NORMAL (1 cuota) que vence el 5-ago → debe contar
        { id: '1', type: 'expense', amount: -42000, date: '2026-08-05', periodDate: '2026-07-05', realPaymentDate: '2026-08-05', payment_method_id: CARD_ID, installment_plan_id: null, recurring_plan_id: null, original_currency: 'ARS', cycle_id: CYCLE_ID },
        // mensualidad Spotify YA posteada este ciclo (no debe contarse doble)
        { id: '2', type: 'expense', amount: -3200, date: '2026-08-05', periodDate: '2026-07-05', realPaymentDate: '2026-08-05', payment_method_id: CARD_ID, installment_plan_id: null, recurring_plan_id: '100', original_currency: 'ARS', cycle_id: CYCLE_ID },
        // reintegro que vence en el mismo ciclo
        { id: '3', type: 'income', amount: 2000, date: '2026-08-05', periodDate: '2026-07-05', realPaymentDate: '2026-08-05', payment_method_id: CARD_ID, installment_plan_id: null, recurring_plan_id: null, original_currency: 'ARS', cycle_id: CYCLE_ID },
        // compra de OTRO ciclo (vence 5-sep) → NO debe contar
        { id: '4', type: 'expense', amount: -99999, date: '2026-09-05', periodDate: '2026-08-05', realPaymentDate: '2026-09-05', payment_method_id: CARD_ID, installment_plan_id: null, recurring_plan_id: null, original_currency: 'ARS', cycle_id: OTHER_CYCLE_ID },
      ],
    });
  }

  it('"a pagar" = compras normales + mensualidad posteada + mensualidad pendiente − reintegro (sin doble conteo, sin otros ciclos)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
    try {
      seedCard();
      const s = useFinanceStore.getState().getPaymentMethodStatus(CARD_ID);
      // 42000 (compra normal) + 3200 (Spotify posteada, 1 sola vez) + 5900 (Netflix pendiente) − 2000 (reintegro)
      // La compra de $99999 (otro vencimiento) NO entra.
      expect(-s.projectedTotal).toBe(49100);
      expect(s.arsExpenses).toBe(51100); // 42000 + 3200 + 5900
      expect(s.usdExpenses).toBe(0);
      expect(s.fixedCosts).toBe(9100); // ambas mensualidades activas
    } finally {
      vi.useRealTimers();
    }
  });

  it('una compra normal (sin installment_plan_id) que vence en el ciclo SÍ se cuenta', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
    try {
      seed({
        paymentMethods: [
          { id: CARD_ID, type: 'credit', default_closing_day: 20, default_payment_day: 5, name: 'Visa', is_personal: false },
        ],
        recurringPlans: [],
        creditCardCycles: [
          { id: CYCLE_ID, user_id: 'u1', payment_method_id: CARD_ID, closing_date: '2026-07-20', due_date: '2026-08-05', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
        ],
        transactions: [
          { id: '1', type: 'expense', amount: -30000, date: '2026-08-05', periodDate: '2026-07-05', realPaymentDate: '2026-08-05', payment_method_id: CARD_ID, installment_plan_id: null, recurring_plan_id: null, original_currency: 'ARS', cycle_id: CYCLE_ID },
        ],
      });
      const s = useFinanceStore.getState().getPaymentMethodStatus(CARD_ID);
      expect(-s.projectedTotal).toBe(30000);
      expect(s.arsExpenses).toBe(30000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('el total cuadra con la suma de los movimientos del ciclo + mensualidad pendiente', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
    try {
      seedCard();
      const st = useFinanceStore.getState();
      const movs = st.getPaymentMethodTransactionsForCurrentMonth(CARD_ID);
      // posteados en el ciclo: compra (1), Spotify (2), reintegro (3). El id 4 es otro ciclo.
      expect(movs.map((m) => m.id).sort()).toEqual(['1', '2', '3']);
      const postedExpenses = movs
        .filter((m) => m.type === 'expense')
        .reduce((a, m) => a + Math.abs(Number(m.amount)), 0);
      const income = movs
        .filter((m) => m.type === 'income')
        .reduce((a, m) => a + Number(m.amount), 0);
      const pendingSub = 5900; // Netflix no posteada
      expect(postedExpenses - income + pendingSub).toBe(
        -st.getPaymentMethodStatus(CARD_ID).projectedTotal
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
