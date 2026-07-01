# Dashboard de Análisis en la Home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar la sección "Análisis" de la home como un módulo con 3 tabs internos (Este mes / Tendencia / Categorías), toggle global ARS/USD y adaptaciones argentinas (lente USD, IPC, costo real de cuotas, exposición ARS/USD), moderno y con buenas animaciones.

**Architecture:** Toda la lógica de negocio vive en getters nuevos de `financeStore.ts` (regla del proyecto). Los componentes son client components que solo leen del store y renderizan. Charts con Recharts (ya instalado), heatmap en CSS, animaciones con Framer Motion (ya instalado). Un slice `displayCurrency` en el store controla el toggle ARS/USD.

**Tech Stack:** Next.js App Router, Zustand, Recharts, Framer Motion, TypeScript, Tailwind (tokens semánticos), vitest (env `node`).

## Global Constraints

- Tokens semánticos SIEMPRE: `bg-surface`, `bg-surface-2`, `border-border`, `text-text/muted/faint`, `text-good/bad/warn`, `bg-accent/text-accent-ink`. Prohibido `emerald-*`, `rose-*`, `indigo-*`, `slate-*`, hex hardcodeado para UI nueva.
- Bordes: `border-[1.5px] border-border`. Nunca `border` (1px).
- Tipografía: `font-poster` + `tnum` para montos; `font-sans` para labels.
- Mobile-first: canvas base 392px, `px-5`, touch targets ≥44px.
- Client Components NUNCA hacen fetch: solo `useFinanceStore`. Prohibido `useEffect` para fetching.
- Toda suma/cálculo/porcentaje va en el store, nunca en componentes.
- TypeScript: nada de `any`. Tipos desde `types/database.ts`. Imports absolutos `@/...`.
- Fechas: SIEMPRE `parseLocalDate()` de `@/lib/utils/dates`.
- Comandos de verificación: `npm test` (vitest), `npm run lint` (eslint), `npm run build` (webpack).
- Respetar `prefers-reduced-motion` en animaciones.

## File Structure

**Store (modificar):**
- `src/lib/store/financeStore.ts` — slice `displayCurrency`, fetch de IPC en `fetchAllData`, getters nuevos.

**Tests (crear):**
- `src/lib/store/__tests__/analysis-getters.test.ts` — tests de los getters puros nuevos.

**Componentes (crear):**
```
src/components/dashboard/analysis/
  analysis-section.tsx          # orquestador: TabsDS + toggle ARS/USD + stagger
  tab-este-mes.tsx
  tab-tendencia.tsx
  tab-categorias.tsx
  charts/
    spending-pace-chart.tsx     # LineChart + ReferenceLine
    category-treemap.tsx        # Recharts Treemap
    frequency-heatmap.tsx       # grilla CSS
    savings-rate-bars.tsx       # BarChart
  cards/
    installments-real-cost-card.tsx
    currency-exposure-card.tsx
```

**Componentes (modificar):**
- `src/components/dashboard/trend-chart.tsx` — leer `displayCurrency`.
- `src/app/page.tsx` — reemplazar la "SECCIÓN B: ANÁLISIS VISUAL" por `<AnalysisSection />`; quitar `CategoryBreakdownCard`, imports muertos y modales reemplazados.

**Componentes (eliminar):**
- `src/components/dashboard/expenses-chart.tsx` — huérfano, no importado, colores viejos.

---

## FASE 1 — Fundación en el store (TDD con vitest)

### Task 1: Slice `displayCurrency` + tasa USD

**Files:**
- Modify: `src/lib/store/financeStore.ts` (interface `FinanceState`, estado inicial, getters)
- Test: `src/lib/store/__tests__/analysis-getters.test.ts`

**Interfaces:**
- Produces:
  - Estado `displayCurrency: 'ARS' | 'USD'` (default `'ARS'`)
  - `setDisplayCurrency: (c: 'ARS' | 'USD') => void`
  - `getUsdRate: () => number` — ARS por 1 USD (MEP → blue → 1)
  - `toDisplay: (ars: number) => number` — convierte según `displayCurrency`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/store/__tests__/analysis-getters.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore } from '@/lib/store/financeStore';

// Helper: setear estado crudo del store en cada test
function seed(partial: Record<string, unknown>) {
  useFinanceStore.setState(partial as never);
}

beforeEach(() => {
  useFinanceStore.setState({
    transactions: [], installmentPlans: [], paymentMethods: [], recurringPlans: [],
    categories: [], exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS',
    inflationSeries: [],
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- analysis-getters`
Expected: FAIL (`displayCurrency`/`setDisplayCurrency`/`getUsdRate`/`toDisplay` no existen).

- [ ] **Step 3: Implementación mínima**

En la interface `FinanceState` (junto a otros getters, ~línea 108) agregar:

```ts
  // Análisis
  displayCurrency: 'ARS' | 'USD';
  setDisplayCurrency: (c: 'ARS' | 'USD') => void;
  getUsdRate: () => number;
  toDisplay: (ars: number) => number;
```

En el estado inicial (junto a `dolarBlue: null`, ~línea 434) agregar:

```ts
  displayCurrency: 'ARS',
  inflationSeries: [],
```

En el bloque de getters (después de `getExchangeRate`, ~línea 981) agregar:

```ts
  setDisplayCurrency: (c) => set({ displayCurrency: c }),

  getUsdRate: () => {
    const { exchangeRates, dolarBlue } = get();
    return resolveRate('USD_ARS_MEP', exchangeRates, dolarBlue);
  },

  toDisplay: (ars) => {
    const { displayCurrency, getUsdRate } = get();
    if (displayCurrency === 'USD') {
      const rate = getUsdRate();
      return rate > 0 ? ars / rate : ars;
    }
    return ars;
  },
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- analysis-getters`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/analysis-getters.test.ts
git commit -m "feat(store): slice displayCurrency + conversion ARS/USD"
```

---

### Task 2: Fetch de inflación (IPC) + `getInflationSeries`

**Files:**
- Modify: `src/lib/store/financeStore.ts`
- Test: `src/lib/store/__tests__/analysis-getters.test.ts`

**Interfaces:**
- Produces:
  - Estado `inflationSeries: Array<{ month: string; rate: number }>` (`month` = `'yyyy-MM'`, `rate` = % mensual)
  - `getInflationSeries: () => Array<{ month: string; rate: number }>`
  - Helper exportado `parseInflation(raw: Array<{ fecha: string; valor: number }>): Array<{ month: string; rate: number }>`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `analysis-getters.test.ts`:

```ts
import { parseInflation } from '@/lib/store/financeStore';

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
```

- [ ] **Step 2: Correr test → FAIL**

Run: `npm test -- analysis-getters`
Expected: FAIL (`parseInflation` / `getInflationSeries` no existen).

- [ ] **Step 3: Implementación**

Cerca de `resolveRate` (top del archivo, después de línea 68) exportar:

```ts
export function parseInflation(
  raw: Array<{ fecha: string; valor: number }>,
): Array<{ month: string; rate: number }> {
  return raw.map((r) => ({ month: r.fecha.slice(0, 7), rate: r.valor }));
}
```

En la interface agregar:

```ts
  inflationSeries: Array<{ month: string; rate: number }>;
  getInflationSeries: () => Array<{ month: string; rate: number }>;
```

En los getters agregar:

```ts
  getInflationSeries: () => get().inflationSeries,
```

En `fetchAllData`, replicando el patrón del fetch de dólar blue (~línea 557), agregar un fetch non-blocking ANTES del `set(...)` final:

```ts
      // Fetch inflación IPC (non-blocking, opcional)
      let inflationSeries: Array<{ month: string; rate: number }> = [];
      try {
        const ipcRes = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/inflacion', {
          signal: AbortSignal.timeout(5000),
        });
        if (ipcRes.ok) {
          const ipcData = (await ipcRes.json()) as Array<{ fecha: string; valor: number }>;
          inflationSeries = parseInflation(ipcData).slice(-24); // últimos 24 meses
        }
      } catch {
        // API de inflación es opcional, no rompe el fetch
      }
```

Y agregar `inflationSeries` al objeto del `set(...)` final de `fetchAllData` (junto a `dolarBlue,`).

- [ ] **Step 4: Correr test → PASS**

Run: `npm test -- analysis-getters`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/analysis-getters.test.ts
git commit -m "feat(store): fetch IPC non-blocking + getInflationSeries"
```

---

### Task 3: `getMonthlySpendingPace`

**Files:**
- Modify: `src/lib/store/financeStore.ts`
- Test: `src/lib/store/__tests__/analysis-getters.test.ts`

**Interfaces:**
- Consumes: `getMonthlyIncome` (existente), `toDisplay` (Task 1), `parseLocalDate`, `isExpenseInCurrentMonthScope` (helpers internos existentes).
- Produces:
  - `getMonthlySpendingPace: () => { points: Array<{ day: number; cumulative: number }>; projectedTotal: number; income: number; todayDay: number; daysInMonth: number }`
  - Montos ya convertidos según `displayCurrency`.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { format } from 'date-fns';

describe('getMonthlySpendingPace', () => {
  it('acumula gasto por día y proyecta a fin de mes', () => {
    const now = new Date();
    const y = now.getFullYear(); const m = now.getMonth();
    const d = (day: number) => format(new Date(y, m, day), 'yyyy-MM-dd');
    seed({
      transactions: [
        { id: 1, type: 'expense', amount: -1000, date: d(2), payment_method_id: null, installment_plan_id: null },
        { id: 2, type: 'expense', amount: -500, date: d(2), payment_method_id: null, installment_plan_id: null },
        { id: 3, type: 'income', amount: 50000, date: d(1), payment_method_id: null, installment_plan_id: null },
      ],
      paymentMethods: [],
    });
    const res = useFinanceStore.getState().getMonthlySpendingPace();
    expect(res.income).toBe(50000);
    // gasto acumulado al día 2 = 1500
    const day2 = res.points.find((p) => p.day === 2);
    expect(day2?.cumulative).toBe(1500);
    expect(res.projectedTotal).toBeGreaterThanOrEqual(1500);
  });
});
```

- [ ] **Step 2: Correr test → FAIL**

Run: `npm test -- analysis-getters`
Expected: FAIL (`getMonthlySpendingPace` no existe).

- [ ] **Step 3: Implementación**

Interface:

```ts
  getMonthlySpendingPace: () => {
    points: Array<{ day: number; cumulative: number }>;
    projectedTotal: number;
    income: number;
    todayDay: number;
    daysInMonth: number;
  };
```

Getter (después de `getMonthlyTrend`, ~línea 1948). Usa `endOfMonth` (ya importado) e `isSameMonth`:

```ts
  getMonthlySpendingPace: () => {
    const { transactions, paymentMethods, getMonthlyIncome, toDisplay } = get();
    const now = new Date();
    const daysInMonth = endOfMonth(now).getDate();
    const todayDay = now.getDate();

    // gasto por día del mes actual (scope de ciclo)
    const perDay = new Array(daysInMonth + 1).fill(0);
    transactions
      .filter((t) => t.type === 'expense' && isExpenseInCurrentMonthScope(t, paymentMethods, now))
      .forEach((t) => {
        const dt = parseLocalDate(t.periodDate || t.date);
        if (isSameMonth(dt, now)) perDay[dt.getDate()] += Math.abs(Number(t.amount));
      });

    const points: Array<{ day: number; cumulative: number }> = [];
    let acc = 0;
    for (let day = 1; day <= todayDay; day++) {
      acc += perDay[day];
      points.push({ day, cumulative: toDisplay(acc) });
    }

    const spentSoFar = acc;
    const projectedTotal = todayDay > 0 ? (spentSoFar / todayDay) * daysInMonth : 0;

    return {
      points,
      projectedTotal: toDisplay(projectedTotal),
      income: toDisplay(getMonthlyIncome()),
      todayDay,
      daysInMonth,
    };
  },
```

- [ ] **Step 4: Correr test → PASS**

Run: `npm test -- analysis-getters`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/analysis-getters.test.ts
git commit -m "feat(store): getMonthlySpendingPace (ritmo + proyeccion)"
```

---

### Task 4: `getCategoryFrequency`

**Files:**
- Modify: `src/lib/store/financeStore.ts`
- Test: `src/lib/store/__tests__/analysis-getters.test.ts`

**Interfaces:**
- Consumes: `parseLocalDate`, `subMonths`, `isSameMonth` (existentes), `categories`, `transactions`.
- Produces:
  - `getCategoryFrequency: (months?: number) => { months: string[]; rows: Array<{ category: string; emoji: string; counts: number[]; max: number }> }`
  - `counts[i]` = cantidad de transacciones de gasto de esa categoría en `months[i]`.

- [ ] **Step 1: Escribir el test que falla**

```ts
describe('getCategoryFrequency', () => {
  it('cuenta transacciones por categoria y mes (no montos)', () => {
    const now = new Date();
    const d = (day: number) => format(new Date(now.getFullYear(), now.getMonth(), day), 'yyyy-MM-dd');
    seed({
      categories: [{ id: 10, name: 'Comida', emoji: '🍔' }],
      transactions: [
        { id: 1, type: 'expense', amount: -100, date: d(3), category_id: 10, installment_plan_id: null },
        { id: 2, type: 'expense', amount: -200, date: d(5), category_id: 10, installment_plan_id: null },
        { id: 3, type: 'income', amount: 999, date: d(5), category_id: 10 },
      ],
    });
    const res = useFinanceStore.getState().getCategoryFrequency(3);
    expect(res.months).toHaveLength(3);
    const comida = res.rows.find((r) => r.category === 'Comida');
    // 2 gastos este mes (income excluido)
    expect(comida?.counts[2]).toBe(2);
    expect(comida?.emoji).toBe('🍔');
  });
});
```

- [ ] **Step 2: Correr test → FAIL**

Run: `npm test -- analysis-getters`
Expected: FAIL.

- [ ] **Step 3: Implementación**

Interface:

```ts
  getCategoryFrequency: (months?: number) => {
    months: string[];
    rows: Array<{ category: string; emoji: string; counts: number[]; max: number }>;
  };
```

Getter (después de `getCategoryComparison`, ~línea 1982). Modelado sobre `getCategoryComparison`:

```ts
  getCategoryFrequency: (months = 6) => {
    const { transactions, categories } = get();
    const now = new Date();
    const refs = Array.from({ length: months }, (_, i) => subMonths(now, months - 1 - i));
    const monthLabels = refs.map((r) => format(r, 'yyyy-MM'));

    const byCat = new Map<string, number[]>();
    transactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        const dt = parseLocalDate(t.periodDate || t.date);
        const idx = refs.findIndex((r) => isSameMonth(dt, r));
        if (idx === -1) return;
        const name = categories.find((c) => c.id === t.category_id)?.name ?? 'Otros';
        if (!byCat.has(name)) byCat.set(name, new Array(months).fill(0));
        byCat.get(name)![idx] += 1;
      });

    const rows = Array.from(byCat.entries())
      .map(([category, counts]) => ({
        category,
        emoji: categories.find((c) => c.name === category)?.emoji ?? '',
        counts,
        max: Math.max(...counts),
      }))
      .sort((a, b) => b.counts.reduce((x, y) => x + y, 0) - a.counts.reduce((x, y) => x + y, 0));

    return { months: monthLabels, rows };
  },
```

Nota: `format` de `date-fns` ya está importado en el store.

- [ ] **Step 4: Correr test → PASS**

Run: `npm test -- analysis-getters`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/analysis-getters.test.ts
git commit -m "feat(store): getCategoryFrequency (conteo historico por categoria)"
```

---

### Task 5: `getSavingsRateSeries`

**Files:**
- Modify: `src/lib/store/financeStore.ts`
- Test: `src/lib/store/__tests__/analysis-getters.test.ts`

**Interfaces:**
- Consumes: `getMonthlyTrend` (existente).
- Produces:
  - `getSavingsRateSeries: (months?: number) => Array<{ month: string; rate: number; net: number }>`
  - `rate` = `net/income*100` (0 si income es 0).

- [ ] **Step 1: Escribir el test que falla**

```ts
describe('getSavingsRateSeries', () => {
  it('calcula tasa de ahorro por mes desde getMonthlyTrend', () => {
    seed({
      transactions: [
        { id: 1, type: 'income', amount: 1000, date: format(new Date(), 'yyyy-MM-dd') },
        { id: 2, type: 'expense', amount: -600, date: format(new Date(), 'yyyy-MM-dd'), installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getSavingsRateSeries(1);
    expect(res[0].rate).toBeCloseTo(40, 1); // (1000-600)/1000
  });
});
```

- [ ] **Step 2: Correr test → FAIL**

Run: `npm test -- analysis-getters`
Expected: FAIL.

- [ ] **Step 3: Implementación**

Interface:

```ts
  getSavingsRateSeries: (months?: number) => Array<{ month: string; rate: number; net: number }>;
```

Getter (después de `getMonthlySpendingPace`):

```ts
  getSavingsRateSeries: (months = 6) => {
    return get().getMonthlyTrend(months).map((row) => ({
      month: row.month,
      net: row.net,
      rate: row.income > 0 ? (row.net / row.income) * 100 : 0,
    }));
  },
```

- [ ] **Step 4: Correr test → PASS**

Run: `npm test -- analysis-getters`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/analysis-getters.test.ts
git commit -m "feat(store): getSavingsRateSeries"
```

---

### Task 6: `getRealAdjustedTrend`

**Files:**
- Modify: `src/lib/store/financeStore.ts`
- Test: `src/lib/store/__tests__/analysis-getters.test.ts`

**Interfaces:**
- Consumes: `getMonthlyTrend`, `getInflationSeries`.
- Produces:
  - `getRealAdjustedTrend: (months?: number) => { available: boolean; rows: Array<{ month: string; nominalExpenses: number; realExpenses: number }> }`
  - `available=false` si no hay datos de IPC (degradación elegante).
  - `realExpenses` = gasto deflactado a pesos de hoy usando IPC acumulado.

- [ ] **Step 1: Escribir el test que falla**

```ts
describe('getRealAdjustedTrend', () => {
  it('available=false sin datos de inflacion', () => {
    seed({ inflationSeries: [] });
    expect(useFinanceStore.getState().getRealAdjustedTrend(3).available).toBe(false);
  });

  it('deflacta gastos usando IPC acumulado a hoy', () => {
    const thisMonth = format(new Date(), 'yyyy-MM');
    seed({
      inflationSeries: [{ month: thisMonth, rate: 0 }],
      transactions: [{ id: 1, type: 'expense', amount: -1000, date: format(new Date(), 'yyyy-MM-dd'), installment_plan_id: null, recurring_plan_id: null }],
    });
    const res = useFinanceStore.getState().getRealAdjustedTrend(1);
    expect(res.available).toBe(true);
    // mes actual sin inflación posterior => real == nominal
    expect(res.rows[0].realExpenses).toBeCloseTo(res.rows[0].nominalExpenses, 0);
  });
});
```

- [ ] **Step 2: Correr test → FAIL**

Run: `npm test -- analysis-getters`
Expected: FAIL.

- [ ] **Step 3: Implementación**

Interface:

```ts
  getRealAdjustedTrend: (months?: number) => {
    available: boolean;
    rows: Array<{ month: string; nominalExpenses: number; realExpenses: number }>;
  };
```

Getter:

```ts
  getRealAdjustedTrend: (months = 6) => {
    const { getMonthlyTrend, getInflationSeries } = get();
    const inflation = getInflationSeries();
    if (inflation.length === 0) return { available: false, rows: [] };

    const now = new Date();
    const trend = getMonthlyTrend(months);
    const inflByMonth = new Map(inflation.map((r) => [r.month, r.rate]));

    // factor de deflación: producto de (1 + ipc/100) desde el mes ref+1 hasta hoy
    const rows = trend.map((row, i) => {
      const ref = subMonths(now, months - 1 - i);
      let factor = 1;
      for (let k = 0; k < months - 1 - i; k++) {
        const fm = format(subMonths(now, k), 'yyyy-MM');
        const ipc = inflByMonth.get(fm) ?? 0;
        factor *= 1 + ipc / 100;
      }
      void ref;
      return {
        month: row.month,
        nominalExpenses: row.expenses,
        realExpenses: row.expenses * factor,
      };
    });

    return { available: true, rows };
  },
```

- [ ] **Step 4: Correr test → PASS**

Run: `npm test -- analysis-getters`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/analysis-getters.test.ts
git commit -m "feat(store): getRealAdjustedTrend (deflactado por IPC)"
```

---

### Task 7: `getInstallmentsRealCost`

**Files:**
- Modify: `src/lib/store/financeStore.ts`
- Test: `src/lib/store/__tests__/analysis-getters.test.ts`

**Interfaces:**
- Consumes: `transactions` (cuotas futuras), `getUsdRate`.
- Produces:
  - `getInstallmentsRealCost: () => { remainingARS: number; remainingUSD: number; hasData: boolean }`
  - `remainingARS` = suma de cuotas con fecha futura (aún no vencidas).
  - `remainingUSD` = `remainingARS / getUsdRate()`.

**Nota de verificación previa:** confirmar en `types/database.ts` que las transacciones de cuota tienen `date` (fecha de la cuota). Si se quisiera calcular licuación real desde la fecha de compra se necesita la fecha original del plan; para este getter alcanza con las cuotas futuras y el valor USD hoy (sin cambio de schema).

- [ ] **Step 1: Escribir el test que falla**

```ts
describe('getInstallmentsRealCost', () => {
  it('suma cuotas futuras y las valúa en USD', () => {
    const future = format(subMonths(new Date(), -2), 'yyyy-MM-dd'); // 2 meses adelante
    seed({
      dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' },
      transactions: [
        { id: 1, type: 'expense', amount: -50000, date: future, installment_plan_id: 7 },
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
```

Nota: `subMonths(date, -2)` avanza 2 meses (date-fns acepta negativos).

- [ ] **Step 2: Correr test → FAIL**

Run: `npm test -- analysis-getters`
Expected: FAIL.

- [ ] **Step 3: Implementación**

Interface:

```ts
  getInstallmentsRealCost: () => { remainingARS: number; remainingUSD: number; hasData: boolean };
```

Getter:

```ts
  getInstallmentsRealCost: () => {
    const { transactions, getUsdRate } = get();
    const now = new Date();
    const future = transactions.filter(
      (t) => t.installment_plan_id && parseLocalDate(t.date) > now,
    );
    const remainingARS = future.reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
    const rate = getUsdRate();
    return {
      remainingARS,
      remainingUSD: rate > 0 ? remainingARS / rate : 0,
      hasData: future.length > 0,
    };
  },
```

- [ ] **Step 4: Correr test → PASS**

Run: `npm test -- analysis-getters`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/analysis-getters.test.ts
git commit -m "feat(store): getInstallmentsRealCost (cuotas futuras en USD)"
```

---

### Task 8: `getCurrencyExposure`

**Files:**
- Modify: `src/lib/store/financeStore.ts`
- Test: `src/lib/store/__tests__/analysis-getters.test.ts`

**Interfaces:**
- Consumes: `transactions`, `paymentMethods`, `getUsdRate`, `isExpenseInCurrentMonthScope`.
- Produces:
  - `getCurrencyExposure: () => { arsShare: number; usdShare: number; arsAmount: number; usdAmountOriginal: number; totalARS: number }`
  - Gasto del mes actual separado por `original_currency` (`'USD'` vs resto). `arsShare + usdShare = 100`.

- [ ] **Step 1: Escribir el test que falla**

```ts
describe('getCurrencyExposure', () => {
  it('separa gasto ARS vs dolarizado del mes', () => {
    const d = format(new Date(), 'yyyy-MM-dd');
    seed({
      dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' },
      transactions: [
        { id: 1, type: 'expense', amount: -80000, date: d, original_currency: 'ARS', payment_method_id: null, installment_plan_id: null },
        { id: 2, type: 'expense', amount: -20000, date: d, original_currency: 'USD', original_amount: 20, payment_method_id: null, installment_plan_id: null },
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
```

- [ ] **Step 2: Correr test → FAIL**

Run: `npm test -- analysis-getters`
Expected: FAIL.

- [ ] **Step 3: Implementación**

Interface:

```ts
  getCurrencyExposure: () => {
    arsShare: number; usdShare: number;
    arsAmount: number; usdAmountOriginal: number; totalARS: number;
  };
```

Getter:

```ts
  getCurrencyExposure: () => {
    const { transactions, paymentMethods } = get();
    const now = new Date();
    let arsAmount = 0, usdAmountARS = 0, usdAmountOriginal = 0;

    transactions
      .filter((t) => t.type === 'expense' && isExpenseInCurrentMonthScope(t, paymentMethods, now))
      .forEach((t) => {
        const ars = Math.abs(Number(t.amount));
        if (t.original_currency === 'USD') {
          usdAmountARS += ars;
          usdAmountOriginal += Math.abs(Number(t.original_amount ?? 0));
        } else {
          arsAmount += ars;
        }
      });

    const totalARS = arsAmount + usdAmountARS;
    return {
      arsAmount,
      usdAmountOriginal,
      totalARS,
      arsShare: totalARS > 0 ? (arsAmount / totalARS) * 100 : 0,
      usdShare: totalARS > 0 ? (usdAmountARS / totalARS) * 100 : 0,
    };
  },
```

- [ ] **Step 4: Correr test → PASS**

Run: `npm test -- analysis-getters`
Expected: PASS. Confirmar además `npm run lint` limpio en el store.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/analysis-getters.test.ts
git commit -m "feat(store): getCurrencyExposure (ARS vs dolarizado)"
```

---

## FASE 2 — Componentes (verificación build/lint/manual)

Cada task de esta fase termina con `npm run lint` limpio y `npm run build` OK como verificación (no hay jsdom para render tests). El detalle visual se valida al final con `/run` en viewport 392px.

### Task 9: Charts base — `category-treemap` y `frequency-heatmap`

**Files:**
- Create: `src/components/dashboard/analysis/charts/category-treemap.tsx`
- Create: `src/components/dashboard/analysis/charts/frequency-heatmap.tsx`

**Interfaces:**
- Consumes: `getCategoryBreakdown`, `toDisplay`, `getCategoryFrequency` del store.
- Produces:
  - `<CategoryTreemap onSelect={(name: string) => void} />`
  - `<FrequencyHeatmap />`

- [ ] **Step 1: Crear `category-treemap.tsx`**

```tsx
'use client';

import { Treemap, ResponsiveContainer } from 'recharts';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCompact } from '@/lib/utils';

const COLORS = ['#2E7D5B', '#3B6EA5', '#C6893F', '#B5544E', '#6B5CA5', '#8A8272'];

interface TreemapNodeProps {
  x?: number; y?: number; width?: number; height?: number; index?: number;
  name?: string; value?: number;
}

function TreemapNode({ x = 0, y = 0, width = 0, height = 0, index = 0, name = '', value = 0 }: TreemapNodeProps) {
  const color = COLORS[index % COLORS.length];
  const show = width > 56 && height > 34;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={8} fill={color} stroke="var(--bg)" strokeWidth={2} />
      {show && (
        <>
          <text x={x + 8} y={y + 18} fill="#fff" fontSize={11} fontWeight={700}>{name}</text>
          <text x={x + 8} y={y + 34} fill="#fff" fontSize={12} fontWeight={800}>${formatCompact(value)}</text>
        </>
      )}
    </g>
  );
}

export function CategoryTreemap({ onSelect }: { onSelect?: (name: string) => void }) {
  const { getCategoryBreakdown, toDisplay } = useFinanceStore();
  const breakdown = getCategoryBreakdown('current_month');
  const data = breakdown.items.map((i) => ({ name: i.name, value: toDisplay(i.value) }));

  if (data.length === 0) {
    return <div className="h-[180px] flex items-center justify-center text-xs text-muted italic">Sin gastos este mes</div>;
  }

  return (
    <div role="img" aria-label="Distribución del gasto por categoría" className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="value"
          content={<TreemapNode />}
          isAnimationActive
          animationDuration={600}
          onClick={(node: { name?: string }) => node?.name && onSelect?.(node.name)}
        />
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Crear `frequency-heatmap.tsx`**

```tsx
'use client';

import { useFinanceStore } from '@/lib/store/financeStore';

const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function cellColor(count: number, max: number): string {
  if (count === 0 || max === 0) return 'var(--surface-2)';
  const t = count / max;
  if (t < 0.25) return 'rgba(46,125,91,0.20)';
  if (t < 0.5) return 'rgba(46,125,91,0.40)';
  if (t < 0.75) return 'rgba(46,125,91,0.65)';
  return 'rgba(46,125,91,0.95)';
}

export function FrequencyHeatmap() {
  const getCategoryFrequency = useFinanceStore((s) => s.getCategoryFrequency);
  const { months, rows } = getCategoryFrequency(6);
  const top = rows.slice(0, 6);

  if (top.length === 0) {
    return <div className="h-24 flex items-center justify-center text-xs text-muted italic">Sin datos de frecuencia</div>;
  }

  const labels = months.map((m) => MONTH_SHORT[parseInt(m.slice(5, 7), 10) - 1]);

  return (
    <div role="img" aria-label="Frecuencia de gasto por categoría e histórico mensual">
      <div className="space-y-1.5">
        {top.map((row) => (
          <div key={row.category} className="grid items-center gap-1.5" style={{ gridTemplateColumns: '70px repeat(6, 1fr)' }}>
            <span className="text-[10px] text-text truncate">{row.emoji} {row.category}</span>
            {row.counts.map((c, i) => (
              <div key={i} className="h-4 rounded grid place-items-center text-[8px] font-bold text-text"
                style={{ backgroundColor: cellColor(c, Math.max(...top.map((r) => r.max), 1)) }}
                title={`${row.category}: ${c} gastos`}>
                {c > 0 ? c : ''}
              </div>
            ))}
          </div>
        ))}
        <div className="grid gap-1.5 pt-1" style={{ gridTemplateColumns: '70px repeat(6, 1fr)' }}>
          <span />
          {labels.map((l, i) => <span key={i} className="text-[8px] text-muted text-center">{l}</span>)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar lint + build**

Run: `npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analysis/charts/category-treemap.tsx src/components/dashboard/analysis/charts/frequency-heatmap.tsx
git commit -m "feat(analysis): CategoryTreemap + FrequencyHeatmap"
```

---

### Task 10: Charts — `savings-rate-bars` y `spending-pace-chart`

**Files:**
- Create: `src/components/dashboard/analysis/charts/savings-rate-bars.tsx`
- Create: `src/components/dashboard/analysis/charts/spending-pace-chart.tsx`

**Interfaces:**
- Consumes: `getSavingsRateSeries`, `getMonthlySpendingPace`.
- Produces: `<SavingsRateBars />`, `<SpendingPaceChart />`.

- [ ] **Step 1: Crear `savings-rate-bars.tsx`**

```tsx
'use client';

import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from 'recharts';
import { useFinanceStore } from '@/lib/store/financeStore';

export function SavingsRateBars() {
  const getSavingsRateSeries = useFinanceStore((s) => s.getSavingsRateSeries);
  const data = getSavingsRateSeries(6);
  const hasData = data.some((d) => d.net !== 0);

  if (!hasData) {
    return <div className="h-[120px] flex items-center justify-center text-xs text-muted italic">Sin datos de ahorro</div>;
  }

  return (
    <div role="img" aria-label="Tasa de ahorro mensual" className="h-[120px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="month" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Bar dataKey="rate" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={700}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.rate >= 0 ? 'var(--good)' : 'var(--bad)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Crear `spending-pace-chart.tsx`**

```tsx
'use client';

import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer } from 'recharts';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCompact } from '@/lib/utils';

export function SpendingPaceChart() {
  const getMonthlySpendingPace = useFinanceStore((s) => s.getMonthlySpendingPace);
  const pace = getMonthlySpendingPace();

  if (pace.points.length === 0) {
    return <div className="h-[140px] flex items-center justify-center text-xs text-muted italic">Todavía no registraste gastos este mes</div>;
  }

  // Serie con proyección hasta fin de mes (línea punteada desde hoy)
  const lastCumulative = pace.points[pace.points.length - 1].cumulative;
  const projData = [
    ...pace.points.map((p) => ({ day: p.day, real: p.cumulative, proj: null as number | null })),
    { day: pace.daysInMonth, real: null as number | null, proj: pace.projectedTotal },
  ];
  projData[pace.points.length - 1].proj = lastCumulative;

  return (
    <div role="img" aria-label="Ritmo de gasto del mes con proyección" className="h-[140px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={projData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="day" type="number" domain={[1, pace.daysInMonth]}
            tick={{ fill: 'var(--muted)', fontSize: 9 }} axisLine={false} tickLine={false}
            ticks={[1, pace.todayDay, pace.daysInMonth]} />
          <YAxis tick={{ fill: 'var(--muted)', fontSize: 9 }} axisLine={false} tickLine={false} width={38}
            tickFormatter={(v: number) => `$${formatCompact(v)}`} />
          {pace.income > 0 && (
            <ReferenceLine y={pace.income} stroke="var(--bad)" strokeDasharray="3 3" strokeOpacity={0.6} />
          )}
          <Line type="monotone" dataKey="real" stroke="var(--text)" strokeWidth={2} dot={false} isAnimationActive animationDuration={900} connectNulls={false} />
          <Line type="monotone" dataKey="proj" stroke="var(--warn)" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Verificar lint + build**

Run: `npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analysis/charts/savings-rate-bars.tsx src/components/dashboard/analysis/charts/spending-pace-chart.tsx
git commit -m "feat(analysis): SavingsRateBars + SpendingPaceChart"
```

---

### Task 11: Cards AR — `installments-real-cost-card` y `currency-exposure-card`

**Files:**
- Create: `src/components/dashboard/analysis/cards/installments-real-cost-card.tsx`
- Create: `src/components/dashboard/analysis/cards/currency-exposure-card.tsx`

**Interfaces:**
- Consumes: `getInstallmentsRealCost`, `getCurrencyExposure`.
- Produces: `<InstallmentsRealCostCard />`, `<CurrencyExposureCard />`.

- [ ] **Step 1: Crear `installments-real-cost-card.tsx`**

```tsx
'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function InstallmentsRealCostCard() {
  const getInstallmentsRealCost = useFinanceStore((s) => s.getInstallmentsRealCost);
  const { remainingARS, remainingUSD, hasData } = getInstallmentsRealCost();

  if (!hasData) return null;

  return (
    <div className="rounded-2xl bg-surface border-[1.5px] border-warn/40 p-4">
      <h3 className="text-sm font-bold text-text mb-2 flex items-center justify-between">
        Costo real de tus cuotas
        <span className="text-[9px] text-warn font-bold bg-warn/10 px-1.5 py-0.5 rounded">🇦🇷 AR</span>
      </h3>
      <div className="flex items-baseline justify-between">
        <span className="font-poster tnum text-xl text-text">{formatCurrency(remainingARS)}</span>
        <span className="font-poster tnum text-sm text-good">USD {Math.round(remainingUSD)}</span>
      </div>
      <p className="text-[11px] text-muted mt-2 leading-relaxed">
        Te queda en cuotas · hoy valen <b className="text-good">USD {Math.round(remainingUSD)}</b>. La inflación licúa esta deuda mes a mes 👍
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Crear `currency-exposure-card.tsx`**

```tsx
'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function CurrencyExposureCard() {
  const getCurrencyExposure = useFinanceStore((s) => s.getCurrencyExposure);
  const { arsShare, usdShare, arsAmount, usdAmountOriginal, totalARS } = getCurrencyExposure();

  if (totalARS === 0) return null;

  return (
    <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
      <h3 className="text-sm font-bold text-text mb-3 flex items-center justify-between">
        Exposición de tu gasto
        <span className="text-[9px] text-muted font-bold bg-surface-2 px-1.5 py-0.5 rounded">🇦🇷 AR</span>
      </h3>
      <div className="flex h-7 rounded-lg overflow-hidden border-[1.5px] border-border">
        <div className="bg-hero text-cream text-[10px] font-bold grid place-items-center" style={{ width: `${arsShare}%` }}>
          {arsShare.toFixed(0)}%
        </div>
        <div className="bg-good text-cream text-[10px] font-bold grid place-items-center" style={{ width: `${usdShare}%` }}>
          {usdShare > 12 ? `${usdShare.toFixed(0)}%` : ''}
        </div>
      </div>
      <div className="flex justify-between mt-2 text-[10px]">
        <span className="text-text"><b>{formatCurrency(arsAmount)}</b> en pesos</span>
        <span className="text-good"><b>USD {Math.round(usdAmountOriginal)}</b> dolarizado</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar lint + build**

Run: `npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analysis/cards/
git commit -m "feat(analysis): tarjetas costo real de cuotas + exposicion ARS/USD"
```

---

### Task 12: Tab enhance — `trend-chart` sensible a `displayCurrency`

**Files:**
- Modify: `src/components/dashboard/trend-chart.tsx`

**Interfaces:**
- Consumes: `displayCurrency`, `toDisplay` del store.

- [ ] **Step 1: Modificar `trend-chart.tsx`**

Reemplazar el cuerpo del componente `TrendChart` para convertir los datos y mostrar la moneda activa. En `export function TrendChart(...)` cambiar:

```tsx
export function TrendChart({ onTap }: TrendChartProps) {
  const { getMonthlyTrend, toDisplay, displayCurrency } = useFinanceStore();
  const raw = getMonthlyTrend(6);
  const data = raw.map((p) => ({ ...p, income: toDisplay(p.income), expenses: toDisplay(p.expenses) }));
  const hasData = data.some((point) => point.income > 0 || point.expenses > 0);
```

(El resto del componente queda igual: usa `data`.) El `CustomTooltip` ya usa `formatCompact`, que sirve para ambas monedas. Agregar, dentro del `<figure>`, un badge de moneda opcional junto al chart:

```tsx
      {displayCurrency === 'USD' && (
        <span className="absolute top-1 right-1 text-[9px] font-bold text-good bg-good/10 px-1.5 py-0.5 rounded z-10">USD</span>
      )}
```

(Colocarlo dentro del `<div className="relative ...">` contenedor del chart.)

- [ ] **Step 2: Verificar lint + build**

Run: `npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/trend-chart.tsx
git commit -m "feat(analysis): TrendChart sensible a displayCurrency"
```

---

### Task 13: Componentes de tab — `tab-este-mes`, `tab-tendencia`, `tab-categorias`

**Files:**
- Create: `src/components/dashboard/analysis/tab-este-mes.tsx`
- Create: `src/components/dashboard/analysis/tab-tendencia.tsx`
- Create: `src/components/dashboard/analysis/tab-categorias.tsx`

**Interfaces:**
- Consumes: charts y cards de Tasks 9-12, `Modal` (`@/components/shared/modal`), getters del store.
- Produces: `<TabEsteMes />`, `<TabTendencia />`, `<TabCategorias />`.

- [ ] **Step 1: Crear `tab-este-mes.tsx`**

```tsx
'use client';

import { SpendingPaceChart } from './charts/spending-pace-chart';
import { InstallmentsRealCostCard } from './cards/installments-real-cost-card';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function TabEsteMes() {
  const getMonthlySpendingPace = useFinanceStore((s) => s.getMonthlySpendingPace);
  const pace = getMonthlySpendingPace();
  const ok = pace.income === 0 ? null : pace.projectedTotal <= pace.income;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-1">Ritmo de gasto</h3>
        <SpendingPaceChart />
        {pace.points.length > 0 && (
          <p className="text-[11px] text-warn font-semibold mt-2 bg-warn/10 rounded-lg px-3 py-1.5">
            A este ritmo terminás en ~{formatCurrency(pace.projectedTotal)}
            {ok !== null && (ok ? ' · vas OK ✓' : ' · ojo, te pasás del ingreso')}
          </p>
        )}
      </div>
      <InstallmentsRealCostCard />
    </div>
  );
}
```

- [ ] **Step 2: Crear `tab-tendencia.tsx`**

```tsx
'use client';

import { TrendChart } from '@/components/dashboard/trend-chart';
import { SavingsRateBars } from './charts/savings-rate-bars';
import { useFinanceStore } from '@/lib/store/financeStore';

export function TabTendencia() {
  const getRealAdjustedTrend = useFinanceStore((s) => s.getRealAdjustedTrend);
  const real = getRealAdjustedTrend(6);

  let realHint: string | null = null;
  if (real.available && real.rows.length >= 2) {
    const last = real.rows[real.rows.length - 1];
    const prev = real.rows[real.rows.length - 2];
    if (prev.realExpenses > 0) {
      const deltaReal = ((last.realExpenses - prev.realExpenses) / prev.realExpenses) * 100;
      realHint = deltaReal <= 0
        ? `En términos reales gastaste ${Math.abs(deltaReal).toFixed(0)}% menos que el mes pasado ✓`
        : `En términos reales gastaste ${deltaReal.toFixed(0)}% más que el mes pasado`;
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-3">Ingreso vs Gasto · 6 meses</h3>
        <TrendChart />
        {realHint && (
          <p className="text-[11px] text-text font-semibold mt-2 bg-accent/8 rounded-lg px-3 py-1.5">
            📊 {realHint}
          </p>
        )}
      </div>
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-2">Tasa de ahorro mensual</h3>
        <SavingsRateBars />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Crear `tab-categorias.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { CategoryTreemap } from './charts/category-treemap';
import { FrequencyHeatmap } from './charts/frequency-heatmap';
import { CurrencyExposureCard } from './cards/currency-exposure-card';
import { Modal } from '@/components/shared/modal';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function TabCategorias() {
  const { getCategoryBreakdown, toDisplay } = useFinanceStore();
  const [selected, setSelected] = useState<string | null>(null);
  const breakdown = getCategoryBreakdown('current_month');
  const item = selected ? breakdown.items.find((i) => i.name === selected) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-3">Distribución del gasto</h3>
        <CategoryTreemap onSelect={setSelected} />
      </div>
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-3">Frecuencia por categoría</h3>
        <FrequencyHeatmap />
      </div>
      <CurrencyExposureCard />

      <Modal isOpen={!!item} onClose={() => setSelected(null)} title={selected ?? ''}>
        {item && (
          <div className="text-center py-4">
            <p className="text-xs text-muted uppercase tracking-wider mb-1">Gasto del mes</p>
            <p className="font-poster tnum text-3xl text-text">{formatCurrency(toDisplay(item.value))}</p>
            <p className="text-sm text-muted mt-2">{item.percentage.toFixed(1)}% del total</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Verificar lint + build**

Run: `npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/analysis/tab-este-mes.tsx src/components/dashboard/analysis/tab-tendencia.tsx src/components/dashboard/analysis/tab-categorias.tsx
git commit -m "feat(analysis): componentes de tab (este mes / tendencia / categorias)"
```

---

### Task 14: Orquestador `analysis-section` (tabs + toggle ARS/USD + stagger)

**Files:**
- Create: `src/components/dashboard/analysis/analysis-section.tsx`

**Interfaces:**
- Consumes: `TabsDS` (`@/components/ui/tabs-ds`), `Chip` (`@/components/ui/chip`), `displayCurrency`/`setDisplayCurrency`, los tres tabs, `framer-motion`.
- Produces: `<AnalysisSection />`.

- [ ] **Step 1: Crear `analysis-section.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TabsDS } from '@/components/ui/tabs-ds';
import { useFinanceStore } from '@/lib/store/financeStore';
import { TabEsteMes } from './tab-este-mes';
import { TabTendencia } from './tab-tendencia';
import { TabCategorias } from './tab-categorias';

const TABS = [
  { id: 'mes', label: 'Este mes' },
  { id: 'tendencia', label: 'Tendencia' },
  { id: 'categorias', label: 'Categorías' },
];

export function AnalysisSection() {
  const [active, setActive] = useState('mes');
  const { displayCurrency, setDisplayCurrency } = useFinanceStore();

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <TabsDS tabs={TABS} active={active} onChange={setActive} />
        <button
          onClick={() => setDisplayCurrency(displayCurrency === 'ARS' ? 'USD' : 'ARS')}
          aria-label="Cambiar moneda de visualización"
          className="shrink-0 rounded-full border-[1.5px] border-border bg-surface-2 px-3 py-2 text-[11px] font-bold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <span className={displayCurrency === 'ARS' ? 'text-accent' : 'text-muted'}>ARS</span>
          <span className="text-faint mx-1">·</span>
          <span className={displayCurrency === 'USD' ? 'text-accent' : 'text-muted'}>USD</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
        >
          {active === 'mes' && <TabEsteMes />}
          {active === 'tendencia' && <TabTendencia />}
          {active === 'categorias' && <TabCategorias />}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
```

- [ ] **Step 2: Verificar lint + build**

Run: `npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analysis/analysis-section.tsx
git commit -m "feat(analysis): AnalysisSection (tabs + toggle ARS/USD + transiciones)"
```

---

## FASE 3 — Integración y limpieza

### Task 15: Integrar en la home y eliminar lo viejo

**Files:**
- Modify: `src/app/page.tsx`
- Delete: `src/components/dashboard/expenses-chart.tsx`

- [ ] **Step 1: Reemplazar la sección de análisis en `page.tsx`**

En `src/app/page.tsx`, reemplazar TODO el bloque desde el comentario `{/* Separador: Análisis */}` hasta el cierre de `{/* SECCIÓN B: ANÁLISIS VISUAL (Charts) */}` (el `<div className="grid ...">` que contiene `TrendChart`, los dos `CategoryBreakdownCard` y `CategoryComparison`, aprox. líneas 301-349) por:

```tsx
        {/* Separador: Análisis */}
        <div className="flex items-center gap-2 mt-6 mb-2">
          <h2 className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-muted whitespace-nowrap">Análisis</h2>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* SECCIÓN B: ANÁLISIS (tabs + toggle ARS/USD) */}
        <AnalysisSection />
```

- [ ] **Step 2: Limpiar imports y estado muertos en `page.tsx`**

- Agregar: `import { AnalysisSection } from '@/components/dashboard/analysis/analysis-section';`
- Quitar imports ya no usados: `TrendChart`, `CategoryComparison`, y el helper local `CategoryBreakdownCard` (borrar la función completa, ~líneas 35-108) y su constante `COLORS` si no se usa en otro lado del archivo.
- Quitar el estado y modales que dependían de esos bloques si quedaron sin uso: `isGlobalExpensesModalOpen`, `isMonthlyExpensesModalOpen`, `isTrendDetailOpen` y sus `<Modal>` correspondientes, además de las variables `globalChartData`, `currentMonthChartData`, `globalBreakdown`, `currentMonthBreakdown`, `trendData` si ya no se referencian. Verificar con lint (no-unused-vars) qué quedó huérfano y eliminarlo.

Nota: conservar los modales de Ingresos, Gastos variables, Cuotas y Fijos (siguen usados por `MetricRow`).

- [ ] **Step 3: Eliminar el componente huérfano**

```bash
git rm src/components/dashboard/expenses-chart.tsx
```

- [ ] **Step 4: Verificar todo**

Run: `npm test && npm run lint && npm run build`
Expected: tests PASS, lint sin errores, build OK.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): integrar AnalysisSection y remover graficos estaticos viejos"
```

---

### Task 16: Verificación manual mobile

**Files:** ninguno (verificación).

- [ ] **Step 1: Levantar la app**

Run: `npm run dev`

- [ ] **Step 2: Checklist manual (usar skill `/run` o DevTools en 392px)**

- [ ] Los 3 tabs cambian con transición suave (cross-fade).
- [ ] Toggle ARS/USD cambia montos en treemap, tendencia y proyección.
- [ ] Tab "Este mes": línea de ritmo + proyección punteada + hint de proyección.
- [ ] Tarjeta costo real de cuotas aparece solo si hay cuotas futuras.
- [ ] Tab "Tendencia": área + tasa de ahorro; hint "real (IPC)" aparece si hay datos de inflación, y NO rompe si la API falló.
- [ ] Tab "Categorías": treemap (tap abre modal de detalle), heatmap de frecuencia, exposición ARS/USD.
- [ ] Con datos vacíos: cada componente muestra su estado vacío sin romper.
- [ ] `prefers-reduced-motion` activo: sin animaciones bruscas.
- [ ] Sin colores prohibidos (`slate-*`, etc.), bordes `1.5px`, `pb-28` respetado.

- [ ] **Step 2: Cerrar**

Si todo OK, la feature está lista para PR desde la rama `feat/dashboard-analisis`.

---

## Self-Review (cobertura del spec)

- Estructura 3 tabs + toggle ARS/USD → Tasks 1, 14, 15 ✓
- Treemap distribución → Task 9 ✓
- Heatmap frecuencia histórica → Tasks 4, 9 ✓
- Exposición ARS/USD → Tasks 8, 11 ✓
- Línea ritmo + proyección → Tasks 3, 10 ✓
- Costo real de cuotas → Tasks 7, 11 ✓
- Área ingreso/gasto sensible a moneda → Task 12 ✓
- Tasa de ahorro → Tasks 5, 10 ✓
- Ajuste real por IPC (con degradación elegante) → Tasks 2, 6, 13 ✓
- Animaciones (stagger/cross-fade/count-up/draw) → Tasks 9-14 (Recharts anim + Framer Motion) ✓
- Eliminar `expenses-chart.tsx` → Task 15 ✓
- Recharts + Framer Motion + CSS, sin librerías nuevas → todo el plan ✓
- Estados vacíos / degradación → Tasks 6, 9-13, 16 ✓
