# Disponible Real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el número central del dashboard ("Saldo del mes") por un "Disponible Real" = patrimonio líquido acumulado neto de gastos fijos y tarjeta pendientes del ciclo, con un "Fondo de Ojo" del consumo del próximo mes.

**Architecture:** Toda la lógica de cálculo vive en getters puros de `financeStore.ts` (regla del proyecto). Tres getters nuevos (`getPendingFixedExpenses`, `getRealAvailableBalance`, `getNextMonthCardExposure`) + un insight nuevo en `getInsights`. La UI reusa la hero card existente (`balance-card.tsx`) reconvirtiéndola, agrega una card nueva para el Fondo de Ojo, y suma una advertencia en el diálogo de pago de tarjeta.

**Tech Stack:** Next.js App Router, Zustand (`financeStore`), TypeScript, Vitest (`npm test`), Framer Motion, Tailwind con tokens semánticos del proyecto.

## Global Constraints

- Lógica de negocio (sumas/cálculos) SOLO en el store, nunca en componentes.
- Client Components nunca hacen fetch directo: solo `useFinanceStore`.
- Fechas: SIEMPRE `parseLocalDate()` de `lib/utils/dates.ts` (evita bugs UTC). Nunca `new Date(string)`.
- Tokens semánticos SIEMPRE: `bg-hero`, `text-cream`, `bg-surface`, `text-text`, `text-muted`, `text-good`, `text-bad`, `text-warn`, `border-border`. Prohibido `emerald-*`, `rose-*`, `indigo-*`, `slate-*`, hex crudos.
- Bordes: `border-[1.5px] border-border`. Nunca `border` solo.
- Números financieros: `font-poster tnum`. Montos con `formatCurrency` de `@/lib/utils`.
- Tests con Vitest: `npm test` (o `npx vitest run <archivo>`). Patrón existente en `src/lib/store/__tests__/analysis-getters.test.ts` (helper `seed`, `beforeEach` que resetea, `vi.useFakeTimers` para fechas).
- TypeScript estricto: nunca `any`. Tipos de `@/types/database`.
- Commits frecuentes, uno por tarea.

---

## Contexto de datos (leer antes de empezar)

**Shape de `ProcessedTransaction`** (campos usados aquí): `id: number`, `type: 'income' | 'expense'`, `amount: number` (gastos vienen negativos, usar `Math.abs`), `date: string`, `periodDate: string` (fecha visual con ciclo de tarjeta ya aplicado), `payment_method_id: number | null`, `installment_plan_id: number | null`, `recurring_plan_id: number | null`.

**Shape de `RecurringPlan`**: `id: number`, `amount: number`, `is_active: boolean`, `payment_method_id: number | null`.

**`PaymentMethod`**: `id: number`, `name: string`, `type: 'credit' | 'debit' | 'cash'`, `default_closing_day: number | null`, `default_payment_day: number | null`.

**`CreditCardCycleSummary`** (ya exportado desde `financeStore.ts`): `{ methodId: number; name: string; total: number; totalARS: number; totalUSD: number; nextPaymentDate: Date; isPending: boolean; isPaidManually: boolean }`.

**Getters existentes a reutilizar:**
- `getPendingCreditCardByCard(): CreditCardCycleSummary[]` — línea ~1373. Filtrar `.filter(c => c.isPending)` para el bucket de tarjeta pendiente.
- `getPaymentMethodStatus(methodId)` — retorna `{ ..., nextClosingDate?: Date, nextPaymentDate?: Date }`. Se usa para saber si el ciclo cerró (advertencia pre-cierre).
- `isExpenseInCurrentMonthScope(t, methods, now)` — helper de módulo (línea ~429), determina si un gasto pertenece al mes actual según ciclo de tarjeta.

**Patrón de "mensualidad pendiente" existente** (en `getMonthlyBalance`, líneas ~1497-1510): una mensualidad activa está "pendiente" si NO existe transacción del mes actual con `recurring_plan_id === plan.id`.

---

## Task 1: Getter `getPendingFixedExpenses`

Aísla el patrón de "mensualidad activa sin transacción este mes" en un getter reutilizable.

**Files:**
- Modify: `src/lib/store/financeStore.ts` (agregar a la interface `FinanceState` y a la implementación)
- Test: `src/lib/store/__tests__/disponible-real.test.ts` (Create)

**Interfaces:**
- Produces: `getPendingFixedExpenses(): { total: number; items: Array<{ id: number; name: string; amount: number }> }`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/store/__tests__/disponible-real.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
        { id: 1, name: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null },
        { id: 2, name: 'Internet', amount: 20000, is_active: true, payment_method_id: null },
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
        { id: 1, name: 'Alquiler', amount: 100000, is_active: true, payment_method_id: null },
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
        { id: 1, name: 'Viejo', amount: 5000, is_active: false, payment_method_id: null },
      ],
    });
    expect(useFinanceStore.getState().getPendingFixedExpenses().total).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `npx vitest run src/lib/store/__tests__/disponible-real.test.ts -t getPendingFixedExpenses`
Expected: FAIL — `getPendingFixedExpenses is not a function`.

- [ ] **Step 3: Agregar la firma a la interface `FinanceState`**

En `src/lib/store/financeStore.ts`, dentro de la interface `FinanceState` (cerca de los otros getters, ej. después de `getMonthlyBalance`), agregar:

```ts
  getPendingFixedExpenses: () => {
    total: number;
    items: Array<{ id: number; name: string; amount: number }>;
  };
```

- [ ] **Step 4: Implementar el getter**

En el objeto del store (junto a los otros getters, ej. después de la implementación de `getMonthlyBalance`), agregar:

```ts
  getPendingFixedExpenses: () => {
    const { recurringPlans, transactions } = get();
    const now = new Date();
    const currentMonth = format(now, 'yyyy-MM');

    const items = recurringPlans
      .filter((p) => p.is_active)
      .filter((plan) => {
        const hasTransactionThisMonth = transactions.some(
          (t) =>
            t.recurring_plan_id === plan.id &&
            (t.periodDate || t.date)?.slice(0, 7) === currentMonth,
        );
        return !hasTransactionThisMonth;
      })
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        amount: Math.abs(Number(plan.amount)),
      }));

    const total = items.reduce((acc, i) => acc + i.amount, 0);
    return { total, items };
  },
```

- [ ] **Step 5: Correr el test para ver que pasa**

Run: `npx vitest run src/lib/store/__tests__/disponible-real.test.ts -t getPendingFixedExpenses`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/disponible-real.test.ts
git commit -m "feat(store): getPendingFixedExpenses aisla mensualidades pendientes del mes"
```

---

## Task 2: Getter `getRealAvailableBalance`

Núcleo de la feature: saldo bruto histórico neto de lo ya comprometido, menos gastos fijos y tarjeta pendientes.

**Files:**
- Modify: `src/lib/store/financeStore.ts`
- Test: `src/lib/store/__tests__/disponible-real.test.ts` (agregar describe)

**Interfaces:**
- Consumes: `getPendingFixedExpenses()` (Task 1), `getPendingCreditCardByCard()` (existente).
- Produces:
```ts
getRealAvailableBalance(): {
  saldoBruto: number;
  pendingFixedExpenses: number;
  pendingFixedItems: Array<{ id: number; name: string; amount: number }>;
  pendingCardTotal: number;
  pendingCardItems: CreditCardCycleSummary[];
  disponibleReal: number;
}
```

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `src/lib/store/__tests__/disponible-real.test.ts`:

```ts
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
        { id: 9, name: 'Alquiler', amount: 50000, is_active: true, payment_method_id: 1 },
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
      recurringPlans: [{ id: 9, name: 'Alquiler', amount: 50000, is_active: true, payment_method_id: 1 }],
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
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `npx vitest run src/lib/store/__tests__/disponible-real.test.ts -t getRealAvailableBalance`
Expected: FAIL — `getRealAvailableBalance is not a function`.

- [ ] **Step 3: Agregar la firma a la interface `FinanceState`**

```ts
  getRealAvailableBalance: () => {
    saldoBruto: number;
    pendingFixedExpenses: number;
    pendingFixedItems: Array<{ id: number; name: string; amount: number }>;
    pendingCardTotal: number;
    pendingCardItems: CreditCardCycleSummary[];
    disponibleReal: number;
  };
```

- [ ] **Step 4: Implementar el getter**

Agregar al objeto del store:

```ts
  getRealAvailableBalance: () => {
    const {
      transactions,
      paymentMethods,
      internalTransfers,
      getPendingCreditCardByCard,
      getPendingFixedExpenses,
    } = get();
    const now = new Date();

    // Tarjetas cuyo ciclo actual sigue pendiente de pago.
    const pendingCardItems = getPendingCreditCardByCard().filter((c) => c.isPending);
    const pendingCardIds = new Set(pendingCardItems.map((c) => c.methodId));
    const pendingCardTotal = pendingCardItems.reduce((acc, c) => acc + c.total, 0);

    // Una transacción pertenece al ciclo pendiente de su tarjeta cuando el método
    // está pendiente Y el gasto cae en el scope del mes actual (ciclo de tarjeta).
    const isInPendingCardCycle = (t: (typeof transactions)[number]) =>
      pendingCardIds.has(t.payment_method_id ?? -1) &&
      isExpenseInCurrentMonthScope(t, paymentMethods, now);

    const totalIncome = transactions
      .filter((t) => t.type === 'income')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const variableExpenses = transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          !t.installment_plan_id &&
          !t.recurring_plan_id &&
          !isInPendingCardCycle(t),
      )
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    const installments = transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          !!t.installment_plan_id &&
          !isInPendingCardCycle(t),
      )
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    const paidFixed = transactions
      .filter((t) => t.type === 'expense' && !!t.recurring_plan_id && !isInPendingCardCycle(t))
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    const transferredToSavings = internalTransfers.reduce(
      (acc, transfer) => acc + Math.abs(Number(transfer.amount)),
      0,
    );

    const saldoBruto =
      totalIncome - variableExpenses - installments - paidFixed - transferredToSavings;

    const { total: pendingFixedExpenses, items: pendingFixedItems } = getPendingFixedExpenses();

    const disponibleReal = saldoBruto - pendingFixedExpenses - pendingCardTotal;

    return {
      saldoBruto,
      pendingFixedExpenses,
      pendingFixedItems,
      pendingCardTotal,
      pendingCardItems,
      disponibleReal,
    };
  },
```

- [ ] **Step 5: Correr el test para ver que pasa**

Run: `npx vitest run src/lib/store/__tests__/disponible-real.test.ts -t getRealAvailableBalance`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/disponible-real.test.ts
git commit -m "feat(store): getRealAvailableBalance calcula disponible real neto de compromisos"
```

---

## Task 3: Getter `getNextMonthCardExposure` (Fondo de Ojo)

Consumo de tarjeta que impacta meses futuros: compras del próximo ciclo + cuotas futuras.

**Files:**
- Modify: `src/lib/store/financeStore.ts`
- Test: `src/lib/store/__tests__/disponible-real.test.ts` (agregar describe)

**Interfaces:**
- Produces: `getNextMonthCardExposure(): { nextCyclePurchases: number; futureInstallments: number; total: number }`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final del archivo de test:

```ts
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
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `npx vitest run src/lib/store/__tests__/disponible-real.test.ts -t getNextMonthCardExposure`
Expected: FAIL — `getNextMonthCardExposure is not a function`.

- [ ] **Step 3: Agregar la firma a la interface `FinanceState`**

```ts
  getNextMonthCardExposure: () => {
    nextCyclePurchases: number;
    futureInstallments: number;
    total: number;
  };
```

- [ ] **Step 4: Implementar el getter**

```ts
  getNextMonthCardExposure: () => {
    const { transactions, paymentMethods } = get();
    const now = new Date();
    const currentMonthKey = format(now, 'yyyy-MM');
    const nextMonthKey = format(new Date(now.getFullYear(), now.getMonth() + 1, 1), 'yyyy-MM');

    const creditIds = new Set(
      paymentMethods.filter((m) => m.type === 'credit').map((m) => m.id),
    );

    const monthKey = (t: (typeof transactions)[number]) =>
      format(parseLocalDate(t.periodDate || t.date), 'yyyy-MM');

    // Cuotas cuyo período visual cae en cualquier mes futuro (posterior al actual).
    const futureInstallments = transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          !!t.installment_plan_id &&
          monthKey(t) > currentMonthKey,
      )
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    // Compras de crédito (no cuota) que caen en el próximo ciclo (mes siguiente).
    const nextCyclePurchases = transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          !t.installment_plan_id &&
          !t.recurring_plan_id &&
          creditIds.has(t.payment_method_id ?? -1) &&
          monthKey(t) === nextMonthKey,
      )
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

    return {
      nextCyclePurchases,
      futureInstallments,
      total: nextCyclePurchases + futureInstallments,
    };
  },
```

Nota: `parseLocalDate` y `format` ya están importados en el archivo. Verificar que `parseLocalDate` esté en los imports de `@/lib/utils/dates` (ya se usa en el archivo).

- [ ] **Step 5: Correr el test para ver que pasa**

Run: `npx vitest run src/lib/store/__tests__/disponible-real.test.ts -t getNextMonthCardExposure`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/disponible-real.test.ts
git commit -m "feat(store): getNextMonthCardExposure calcula fondo de ojo del proximo mes"
```

---

## Task 4: Insight de vencimiento automático de tarjeta

Avisar en el `InsightsCarousel` cuando una tarjeta venció sin marca manual (se asume pagada).

**Files:**
- Modify: `src/lib/store/financeStore.ts` (dentro de `getInsights`, línea ~2362)
- Test: `src/lib/store/__tests__/disponible-real.test.ts` (agregar describe)

**Interfaces:**
- Consumes: `getPendingCreditCardByCard()` (existente), `paidCycles` (estado existente).
- Produces: un elemento más en el array que retorna `getInsights()`: `{ type: 'info', message: string, icon: 'CreditCard' }`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al inicio del archivo de test el import de `subMonths` junto a `format` (`import { format, subMonths } from 'date-fns';`) y agregar al final del archivo:

```ts
describe('getInsights - vencimiento automatico de tarjeta', () => {
  it('avisa cuando una tarjeta vencio sin marca manual', () => {
    vi.useFakeTimers();
    // hoy = 10 de este mes; tarjeta cierra 20, vence 5 -> el vencimiento del ciclo
    // anterior (dia 5 de este mes) ya paso, y no hay marca en paidCycles.
    vi.setSystemTime(new Date(2026, 6, 10)); // 10 jul 2026
    try {
      const enCiclo = format(new Date(2026, 5, 15), 'yyyy-MM-dd'); // 15 jun (gasto del ciclo que vence 5 jul)
      seed({
        paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
        transactions: [
          { id: 1, type: 'expense', amount: -40000, date: enCiclo, periodDate: format(new Date(2026, 6, 5), 'yyyy-MM-dd'), payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
        ],
        paidCycles: {},
      });
      const insights = useFinanceStore.getState().getInsights();
      const auto = insights.find((i) => i.message.includes('asumimos pagada automáticamente'));
      expect(auto).toBeDefined();
      expect(auto?.type).toBe('info');
    } finally {
      vi.useRealTimers();
    }
  });
});
```

Nota: si `getPendingCreditCardByCard` en este escenario no marca la tarjeta como vencida (por depender de `projectedTotal < 0`), ajustar el seed para que el gasto genere consumo negativo del ciclo (ya lo hace: gasto de -40000 sin ingresos). El test valida el mensaje del insight, no la mecánica interna.

- [ ] **Step 2: Correr el test para ver que falla**

Run: `npx vitest run src/lib/store/__tests__/disponible-real.test.ts -t "vencimiento automatico"`
Expected: FAIL — no existe el insight con ese mensaje.

- [ ] **Step 3: Implementar el insight**

En `getInsights()` (después del bloque `// 5. Tarjetas que necesitan actualización de fechas`, antes de `return insights;`), agregar:

```ts
    // 6. Tarjetas vencidas sin marca manual: se asumieron pagadas automáticamente
    const autoPaidCards = getPendingCreditCardByCard().filter(
      (card) => !card.isPaidManually && now >= card.nextPaymentDate,
    );
    for (const card of autoPaidCards) {
      const fecha = format(card.nextPaymentDate, "d 'de' MMM", { locale: es });
      insights.push({
        type: 'info',
        message: `${card.name} venció el ${fecha} — la asumimos pagada automáticamente`,
        icon: 'CreditCard',
      });
    }
```

Verificar que `getPendingCreditCardByCard` esté desestructurado del `get()` al inicio de `getInsights` (agregarlo si falta). `format`, `es` y `now` ya están disponibles en el scope de `getInsights`.

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `npx vitest run src/lib/store/__tests__/disponible-real.test.ts -t "vencimiento automatico"`
Expected: PASS.

- [ ] **Step 5: Correr toda la suite del store para no romper nada**

Run: `npm test`
Expected: PASS (incluyendo `analysis-getters.test.ts` y `disponible-real.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/disponible-real.test.ts
git commit -m "feat(store): insight de tarjeta vencida asumida pagada automaticamente"
```

---

## Task 5: Advertencia pre-cierre en el diálogo de pago de tarjeta

Cuando el usuario marca una tarjeta como pagada antes de que cierre el resumen, avisar dentro del `AlertDialog`.

**Files:**
- Modify: `src/components/compromisos/credit-card-cycle-card.tsx`

**Interfaces:**
- Consumes: `getPaymentMethodStatus(methodId)` del store (retorna `nextClosingDate?: Date`).

- [ ] **Step 1: Traer `getPaymentMethodStatus` y calcular si el resumen no cerró**

En `credit-card-cycle-card.tsx`, dentro de `CreditCardCycleChip`, junto al `useFinanceStore` existente (línea ~29), agregar el getter y el cálculo:

```tsx
  const { markCreditCardCyclePaid, unmarkCreditCardCyclePaid, getPaymentMethodStatus } = useFinanceStore();
  const status = getPaymentMethodStatus(card.methodId);
  const cycleNotClosedYet =
    status.nextClosingDate !== undefined && new Date() < status.nextClosingDate;
  const closingDateLabel = status.nextClosingDate
    ? format(status.nextClosingDate, "d 'de' MMM", { locale: es })
    : '';
```

(`format` y `es` ya están importados en el archivo.)

- [ ] **Step 2: Mostrar la advertencia en el diálogo de "¿Ya pagaste?"**

En el segundo diálogo (el de marcar pagada), justo después del `</AlertDialogDescription>` de cierre (línea ~119) y antes de `</AlertDialogHeader>`, agregar el bloque condicional:

```tsx
            {cycleNotClosedYet && (
              <p className="mt-2 text-[12px] text-warn flex items-start gap-1.5">
                <span aria-hidden="true">⚠️</span>
                <span>
                  El resumen todavía no cerró (cierra el {closingDateLabel}). Compras nuevas hasta
                  esa fecha se restarán de tu Disponible Real al instante.
                </span>
              </p>
            )}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npm run lint`
Expected: sin errores nuevos en `credit-card-cycle-card.tsx`.

- [ ] **Step 4: Verificación manual**

Run: `npm run dev` → ir a Compromisos → abrir el diálogo "¿Ya pagaste?" de una tarjeta cuyo cierre es futuro.
Expected: aparece la línea de advertencia amarilla. Para una tarjeta ya cerrada (post-cierre, pre-vencimiento), NO aparece.

- [ ] **Step 5: Commit**

```bash
git add src/components/compromisos/credit-card-cycle-card.tsx
git commit -m "feat(compromisos): advertencia al pagar tarjeta antes del cierre del resumen"
```

---

## Task 6: Reconvertir `balance-card.tsx` a Disponible Real (Nivel 1 + 2)

La hero card pasa a mostrar el Disponible Real y su desglose, leyendo del store directamente.

**Files:**
- Modify: `src/components/dashboard/balance-card.tsx`
- Modify: `src/app/page.tsx` (líneas ~135-141: la card ya no necesita props de balance mensual)

**Interfaces:**
- Consumes: `getRealAvailableBalance()` (Task 2).

- [ ] **Step 1: Reemplazar la fuente de datos de la card**

En `balance-card.tsx`, reemplazar el bloque de props/derivaciones. La card ya no recibe props de montos; lee del store. Cambiar la firma y los cálculos:

```tsx
export function BalanceCard() {
  const [expanded, setExpanded] = useState(false)
  const getRealAvailableBalance = useFinanceStore((s) => s.getRealAvailableBalance)
  const {
    saldoBruto,
    pendingFixedExpenses,
    pendingFixedItems,
    pendingCardTotal,
    pendingCardItems,
    disponibleReal,
  } = getRealAvailableBalance()

  const animatedBalance = useCountUp(disponibleReal)
  const isNegative = disponibleReal < 0

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount))
```

Eliminar: `BalanceCardProps`, y todo lo derivado del balance mensual (`monthlyIncome`, `monthlyExpenses`, `installments`, `burnRate`, `savingsTransfers`, `totalMonthlySpend`, `monthBalance`, `balanceAfterCards`, `spendPercent`, `comparison`, `getMonthlyComparison`, `getPendingCreditCardByCard`, `pendingCards` locales, la barra de progreso y el badge de tendencia). El `useCountUp` se conserva tal cual.

- [ ] **Step 2: Actualizar el header visible (label + número)**

Reemplazar el label `"Saldo del mes"` por `"Tu plata libre para hoy"` y el número principal por `disponibleReal`:

```tsx
                <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-celeste">
                  Tu plata libre para hoy
                </p>
```

```tsx
              <div className="flex items-baseline gap-2 mt-1 overflow-hidden">
                <span className="font-poster tnum text-[38px] leading-[0.95] text-cream-light min-w-0 truncate">
                  {isNegative ? "-" : ""}
                  {formatCurrency(animatedBalance)}
                </span>
              </div>
```

Eliminar del header las dos sub-tarjetas Ingresos/Gastos, el badge de tendencia, la barra de progreso y su leyenda `% del ingreso gastado` (ya no aplican al concepto de Disponible Real).

- [ ] **Step 3: Reescribir el desglose expandible (Nivel 2)**

Reemplazar el contenido del `AnimatePresence` expandible por el desglose de la fórmula:

```tsx
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="border-t border-cream-light/15 px-5 py-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[13px] text-cream-light/80">Cuenta total</span>
                  <span className="font-poster tnum text-[13px] text-good">
                    +{formatCurrency(saldoBruto)}
                  </span>
                </div>

                {pendingFixedExpenses > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] text-cream-light/80">Gastos fijos por pagar</span>
                      <span className="font-poster tnum text-[13px] text-warn">
                        -{formatCurrency(pendingFixedExpenses)}
                      </span>
                    </div>
                    {pendingFixedItems.map((item) => (
                      <div key={item.id} className="flex justify-between items-center pl-3">
                        <span className="text-[11px] text-celeste/70">{item.name}</span>
                        <span className="font-poster tnum text-[11px] text-celeste/70">
                          -{formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {pendingCardTotal > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] text-cream-light/80">Tarjeta de este mes</span>
                      <span className="font-poster tnum text-[13px] text-bad">
                        -{formatCurrency(pendingCardTotal)}
                      </span>
                    </div>
                    {pendingCardItems.map((card) => (
                      <div key={card.methodId} className="flex justify-between items-center pl-3">
                        <span className="text-[11px] text-celeste/70">{card.name}</span>
                        <span className="font-poster tnum text-[11px] text-celeste/70">
                          -{formatCurrency(card.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-cream-light/15">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-cream-light/70">Disponible Real</span>
                    <span className={cn("font-poster tnum text-[15px]", isNegative ? "text-bad" : "text-good")}>
                      {isNegative ? "-" : "+"}{formatCurrency(disponibleReal)}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
```

Limpiar imports que dejen de usarse (`ArrowUpRight`, `ArrowDownRight`, `TrendingUp`, `TrendingDown`, `Minus`, `Check`, `Clock`, `CreditCard`, `format`, `es` si ya no se usan). Conservar `ChevronDown`, `motion`, `AnimatePresence`, `cn`, `useFinanceStore`, y los hooks de count-up.

- [ ] **Step 4: Actualizar el uso en `page.tsx`**

En `src/app/page.tsx` (~línea 135), reemplazar el bloque con props por la card sin props:

```tsx
          <div data-tour="balance-card" className="col-span-2 lg:col-span-4">
            <BalanceCard />
          </div>
```

Si `liquidBreakdown` queda sin usar tras este cambio, verificar el resto de `page.tsx` — probablemente siga usándose en otras métricas; NO eliminarlo si otras partes lo consumen.

- [ ] **Step 5: Verificar lint y tipos**

Run: `npm run lint`
Expected: sin errores. Si hay "unused import/var", limpiarlos.

- [ ] **Step 6: Verificación manual**

Run: `npm run dev` → home.
Expected: la hero card muestra "Tu plata libre para hoy" con el Disponible Real. Al tocarla, se expande y muestra `Cuenta total / Gastos fijos por pagar / Tarjeta de este mes / = Disponible Real`. El count-up anima.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/balance-card.tsx src/app/page.tsx
git commit -m "feat(dashboard): hero card muestra Disponible Real con desglose (Nivel 1 y 2)"
```

---

## Task 7: Card "Fondo de Ojo" — Consumo próximo mes (Nivel 3)

Card nueva y separada debajo de la hero card en el home.

**Files:**
- Create: `src/components/dashboard/next-month-card-exposure-card.tsx`
- Modify: `src/app/page.tsx` (insertar la card después de la hero card)

**Interfaces:**
- Consumes: `getNextMonthCardExposure()` (Task 3).

- [ ] **Step 1: Crear el componente**

Crear `src/components/dashboard/next-month-card-exposure-card.tsx`:

```tsx
'use client';

import { CalendarClock } from 'lucide-react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function NextMonthCardExposureCard() {
  const getNextMonthCardExposure = useFinanceStore((s) => s.getNextMonthCardExposure);
  const { nextCyclePurchases, futureInstallments, total } = getNextMonthCardExposure();

  if (total <= 0) return null;

  return (
    <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text inline-flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4 text-muted" />
          Consumo tarjeta próximo mes
        </h3>
      </div>

      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted">Ya comprometido</span>
        <span className="font-poster tnum text-2xl text-text">{formatCurrency(total)}</span>
      </div>

      <div className="mt-3 space-y-1.5">
        {nextCyclePurchases > 0 && (
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted">Compras del próximo cierre</span>
            <span className="font-poster tnum text-[13px] text-text/70">{formatCurrency(nextCyclePurchases)}</span>
          </div>
        )}
        {futureInstallments > 0 && (
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted">Cuotas futuras</span>
            <span className="font-poster tnum text-[13px] text-text/70">{formatCurrency(futureInstallments)}</span>
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] text-faint">
        No toca tu plata de hoy. Prepara el terreno para el mes que viene.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Insertar la card en el home**

En `src/app/page.tsx`, importar el componente junto a los otros imports de dashboard:

```tsx
import { NextMonthCardExposureCard } from '@/components/dashboard/next-month-card-exposure-card';
```

Insertar la card justo después del `<div>` de la hero card (después del cierre del `data-tour="balance-card"`, ~línea 142), dentro del grid:

```tsx
          <div className="col-span-2 lg:col-span-4">
            <NextMonthCardExposureCard />
          </div>
```

- [ ] **Step 3: Verificar lint**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 4: Verificación manual**

Run: `npm run dev` → home.
Expected: si hay cuotas futuras o compras de crédito del próximo ciclo, aparece la card "Consumo tarjeta próximo mes" con el total y su desglose. Si no hay nada futuro, la card no se renderiza (retorna null).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/next-month-card-exposure-card.tsx src/app/page.tsx
git commit -m "feat(dashboard): card Fondo de Ojo con consumo de tarjeta del proximo mes (Nivel 3)"
```

---

## Task 8: Verificación integral y build

**Files:** ninguno (validación).

- [ ] **Step 1: Suite completa de tests**

Run: `npm test`
Expected: todo PASS.

- [ ] **Step 2: Lint del proyecto**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Build de producción**

Run: `npm run build`
Expected: build exitoso, sin errores de tipos.

- [ ] **Step 4: Verificación manual de la invariante clave**

Run: `npm run dev`. En el navegador:
1. Anotar el valor de "Disponible Real" en la home.
2. Ir a Compromisos, marcar una tarjeta pendiente como "pagada".
3. Volver a la home: el Disponible Real debe ser **idéntico** (el monto de la tarjeta desaparece del bucket pendiente pero baja saldoBruto en la misma cantidad).
4. Deshacer el pago: el número vuelve a ser el mismo.

Expected: el número central no cambia al pagar/deshacer. El desglose sí (la tarjeta entra/sale del bucket "Tarjeta de este mes").

- [ ] **Step 5: Commit final si hubo ajustes**

```bash
git add -A
git commit -m "chore(disponible-real): verificacion integral y ajustes finales"
```

---

## Self-Review (completado por el autor del plan)

**Spec coverage:**
- `getRealAvailableBalance` (Nivel 1+2) → Task 2 ✅
- `getPendingFixedExpenses` → Task 1 ✅
- `getNextMonthCardExposure` (Nivel 3) → Task 3 ✅
- Insight vencimiento automático → Task 4 ✅
- Advertencia pre-cierre → Task 5 ✅
- Reemplazo `balance-card.tsx` (Nivel 1+2 UI) → Task 6 ✅
- Card Fondo de Ojo (Nivel 3 UI) → Task 7 ✅
- Invariante "pagar no mueve el número" → test en Task 2 + verificación manual Task 8 ✅

**Type consistency:** `getRealAvailableBalance` retorna las mismas keys (`saldoBruto`, `pendingFixedExpenses`, `pendingFixedItems`, `pendingCardTotal`, `pendingCardItems`, `disponibleReal`) que consume Task 6. `getPendingFixedExpenses` retorna `{ total, items }` consumido por Task 2. `getNextMonthCardExposure` retorna `{ nextCyclePurchases, futureInstallments, total }` consumido por Task 7. `CreditCardCycleSummary` reusado tal cual.

**Edge cases documentados en el spec** (mensualidad pagada con tarjeta pendiente; marca de pago pre-cierre) quedan como limitaciones conocidas + advertencia UX, no bloquean.
