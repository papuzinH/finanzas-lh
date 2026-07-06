# Home: Presupuestos (gauge) y Metas (anillos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar `BudgetOverviewStrip` en el inicio por dos cards nuevas y gráficas — un gauge semicircular de presupuestos con proyección, y una fila de anillos de progreso para metas de ahorro (hoy solo en `/objetivos`) — con toda la lógica de agregación/normalización de moneda en el store.

**Architecture:** Dos getters nuevos en `financeStore.ts` (`getBudgetsOverview`, `getSavingsGoalsOverview`) hacen toda la normalización ARS/USD y devuelven agregados listos para pintar. Dos componentes cliente nuevos (`budget-gauge-card.tsx`, `savings-goals-rings-card.tsx`) consumen esos getters y dibujan SVG a mano (semicírculo / donuts), sin librerías de charts nuevas. `page.tsx` cablea ambos en el orden Presupuestos → Metas → Análisis. El componente y skeleton viejos se eliminan.

**Tech Stack:** Next.js App Router, Zustand (`useFinanceStore`), TypeScript, Tailwind (tokens semánticos), Vitest.

## Global Constraints

- Toda la lógica de negocio (agregación, normalización de moneda) va en `lib/store/financeStore.ts`, nunca en componentes.
- Normalización de moneda: `spent`/`projected` de presupuestos y `totalContributed` de metas **ya vienen en ARS cuando la transacción/aporte es real** (derivan de `getExpensesByCategory`, que trabaja siempre en ARS) — la conversión con dólar blue solo aplica a los **topes** (`budget.amount`) y a los **aportes de metas en USD** (`contribution.amount` cuando `goal.currency === 'USD'`), nunca a valores que ya derivan de `spent`/`projected`.
- Tokens semánticos siempre: `bg-surface`, `border-border`, `text-text/muted/faint`, `text-good/warn/bad`, `text-accent`. En SVG usar `var(--good|warn|bad|accent|surface-2)`. Prohibido `emerald-*`, `rose-*`, `indigo-*`, `violet-*`, `slate-*`.
- Bordes `border-[1.5px] border-border` (vía `<Card>`, ya lo aplica). Montos display `font-poster`; números financieros `tnum`.
- No arreglar la imprecisión preexistente de `getCategoryBudgetStatus`/`getBudgetProjection` con topes en USD (comparan un `spent` en ARS contra un `limit` sin convertir) — está señalada y es fuera de alcance; los tests nuevos documentan el efecto donde aplica.
- Tests con el patrón `useFinanceStore.setState(partial as never)` + `vi.useFakeTimers()`/`vi.setSystemTime()` (ver `src/lib/store/__tests__/disponible-real.test.ts` y `analysis-getters.test.ts`), no reimplementaciones puras (ese es el patrón viejo de `goalsGetters.test.ts`, no replicar).
- Sin librerías de gráficos nuevas — SVG propio, patrón ya usado en `savings-rate-bars.tsx` (`var(--good|warn|bad)` directo en `stroke`/`fill`).

---

### Task 1: Getter `getBudgetsOverview()` + tests

**Files:**
- Modify: `src/lib/store/financeStore.ts` (interfaz `FinanceState` ~línea 328-336, implementación ~línea 2172, ambas justo después de `getAllBudgetStatuses`)
- Test: `src/lib/store/__tests__/home-overview-getters.test.ts` (nuevo)

**Interfaces:**
- Consume: `get().categoryBudgets: CategoryBudget[]`, `get().dolarBlue: { venta: number } | null`, `get().getAllBudgetStatuses(): Array<{ budget: CategoryBudget; categoryName: string; categoryEmoji: string | null; spent: number; limit: number; percent: number; status: 'ok'|'warning'|'exceeded' }>`, `get().getBudgetProjection(budgetId: string): { spent: number; projected: number; limit: number; isOverBudget: boolean } | null`.
- Produce: `getBudgetsOverview(): { percent: number; projectedPercent: number; status: 'ok'|'warning'|'exceeded'; willExceed: boolean; exceededCount: number; warningCount: number; totalSpentARS: number; totalLimitARS: number } | null` — usado por `BudgetGaugeCard` (Task 3).

- [ ] **Step 1: Escribir el test (falla porque el getter no existe)**

Crear `src/lib/store/__tests__/home-overview-getters.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useFinanceStore } from '@/lib/store/financeStore';

function seed(partial: Record<string, unknown>) {
  useFinanceStore.setState(partial as never);
}

beforeEach(() => {
  useFinanceStore.setState({
    transactions: [], installmentPlans: [], paymentMethods: [], recurringPlans: [],
    categories: [], categoryBudgets: [], savingsGoals: [], savingsGoalContributions: [],
    exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS', inflationSeries: [],
    internalTransfers: [],
  } as never);
});

describe('getBudgetsOverview', () => {
  it('retorna null si no hay presupuestos activos', () => {
    seed({ categoryBudgets: [] });
    expect(useFinanceStore.getState().getBudgetsOverview()).toBeNull();
  });

  it('retorna null si los presupuestos existentes estan inactivos', () => {
    seed({
      categoryBudgets: [
        { id: 'b1', category_id: 'cat-1', amount: 100000, currency: 'ARS', is_active: false },
      ],
    });
    expect(useFinanceStore.getState().getBudgetsOverview()).toBeNull();
  });

  it('agrega presupuestos en ARS y proyecta segun ritmo diario', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 10)); // 10 jul 2026: dia 10 de 31

    try {
      seed({
        categories: [
          { id: 'cat-1', name: 'Comida', emoji: '🍔' },
          { id: 'cat-2', name: 'Transporte', emoji: '🚗' },
        ],
        categoryBudgets: [
          { id: 'b1', category_id: 'cat-1', amount: 100000, currency: 'ARS', is_active: true },
          { id: 'b2', category_id: 'cat-2', amount: 50000, currency: 'ARS', is_active: true },
        ],
        transactions: [
          { id: 1, type: 'expense', amount: -40000, date: '2026-07-10', periodDate: '2026-07-10', category_id: 'cat-1', payment_method_id: null, installment_plan_id: null },
          { id: 2, type: 'expense', amount: -20000, date: '2026-07-10', periodDate: '2026-07-10', category_id: 'cat-2', payment_method_id: null, installment_plan_id: null },
        ],
      });

      const res = useFinanceStore.getState().getBudgetsOverview();
      expect(res).not.toBeNull();
      expect(res!.totalSpentARS).toBe(60000);
      expect(res!.totalLimitARS).toBe(150000);
      expect(res!.percent).toBeCloseTo(40);
      // proyectado: (40000/10*31) + (20000/10*31) = 124000 + 62000 = 186000
      expect(res!.projectedPercent).toBeCloseTo(124);
      expect(res!.status).toBe('ok');
      expect(res!.willExceed).toBe(true);
      expect(res!.exceededCount).toBe(0);
      expect(res!.warningCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('normaliza presupuestos mixtos ARS/USD a ARS via dolar blue', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 15)); // 15 abr 2026: dia 15 de 30

    try {
      seed({
        dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' },
        categories: [
          { id: 'cat-1', name: 'Comida', emoji: '🍔' },
          { id: 'cat-2', name: 'Transporte', emoji: '🚗' },
        ],
        categoryBudgets: [
          { id: 'b1', category_id: 'cat-1', amount: 100, currency: 'USD', is_active: true },
          { id: 'b2', category_id: 'cat-2', amount: 50000, currency: 'ARS', is_active: true },
        ],
        transactions: [
          { id: 1, type: 'expense', amount: -60000, date: '2026-04-15', periodDate: '2026-04-15', category_id: 'cat-1', payment_method_id: null, installment_plan_id: null },
          { id: 2, type: 'expense', amount: -10000, date: '2026-04-15', periodDate: '2026-04-15', category_id: 'cat-2', payment_method_id: null, installment_plan_id: null },
        ],
      });

      const res = useFinanceStore.getState().getBudgetsOverview();
      expect(res).not.toBeNull();
      // limite: 100*1000 (USD->ARS) + 50000 (ARS) = 150000
      expect(res!.totalLimitARS).toBe(150000);
      expect(res!.totalSpentARS).toBe(70000);
      expect(res!.percent).toBeCloseTo(46.666, 2);
      // proyectado: (60000/15*30) + (10000/15*30) = 120000 + 20000 = 140000
      expect(res!.projectedPercent).toBeCloseTo(93.333, 2);
      expect(res!.willExceed).toBe(false);
      // Comida (USD) queda "exceeded" a nivel de card individual por la
      // imprecision preexistente de getCategoryBudgetStatus (60000 spent vs
      // limit=100 sin convertir): documentado como fuera de alcance en el spec.
      expect(res!.exceededCount).toBe(1);
      expect(res!.warningCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- home-overview-getters`
Expected: FAIL — `getBudgetsOverview is not a function`.

- [ ] **Step 3: Agregar el tipo a la interfaz `FinanceState`**

En `src/lib/store/financeStore.ts`, justo después del cierre de `getAllBudgetStatuses` (línea 336, `}>;`):

```ts
  getBudgetsOverview: () => {
    percent: number;
    projectedPercent: number;
    status: 'ok' | 'warning' | 'exceeded';
    willExceed: boolean;
    exceededCount: number;
    warningCount: number;
    totalSpentARS: number;
    totalLimitARS: number;
  } | null;
```

- [ ] **Step 4: Implementar el getter**

En `src/lib/store/financeStore.ts`, justo después del cierre de la implementación de `getAllBudgetStatuses` (después de la línea `.sort((a, b) => b.percent - a.percent);\n  },`):

```ts
  /**
   * Agregado de presupuestos activos para el gauge del inicio. `spent`/`projected`
   * de cada presupuesto ya vienen en ARS (derivan de `getExpensesByCategory`, que
   * trabaja siempre en ARS); solo `limit` está en la moneda propia del presupuesto
   * y necesita conversión vía dólar blue.
   *
   * `exceededCount`/`warningCount` reusan el `status` por presupuesto de
   * `getAllBudgetStatuses()` (puede ser impreciso para presupuestos en USD, ver
   * nota en `getCategoryBudgetStatus`; fuera de alcance arreglarlo acá).
   */
  getBudgetsOverview: () => {
    const { categoryBudgets, dolarBlue, getAllBudgetStatuses, getBudgetProjection } = get();
    if (!categoryBudgets.some((b) => b.is_active)) return null;

    const blue = dolarBlue?.venta && dolarBlue.venta > 0 ? dolarBlue.venta : null;
    const statuses = getAllBudgetStatuses();

    let totalSpentARS = 0;
    let totalLimitARS = 0;
    let projectedTotalARS = 0;

    for (const s of statuses) {
      totalSpentARS += s.spent;
      totalLimitARS += s.budget.currency === 'USD' && blue ? s.limit * blue : s.limit;
      const projection = getBudgetProjection(s.budget.id);
      projectedTotalARS += projection?.projected ?? s.spent;
    }

    const percent = totalLimitARS > 0 ? (totalSpentARS / totalLimitARS) * 100 : 0;
    const projectedPercent = totalLimitARS > 0 ? (projectedTotalARS / totalLimitARS) * 100 : 0;

    const status: 'ok' | 'warning' | 'exceeded' =
      percent >= 100 ? 'exceeded' : percent >= 75 ? 'warning' : 'ok';

    return {
      percent,
      projectedPercent,
      status,
      willExceed: projectedPercent > 100,
      exceededCount: statuses.filter((s) => s.status === 'exceeded').length,
      warningCount: statuses.filter((s) => s.status === 'warning').length,
      totalSpentARS,
      totalLimitARS,
    };
  },
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npm test -- home-overview-getters`
Expected: PASS (los 4 tests de `getBudgetsOverview`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/home-overview-getters.test.ts
git commit -m "feat(store): agregar getBudgetsOverview con normalizacion ARS/USD"
```

---

### Task 2: Getter `getSavingsGoalsOverview()` + tests

**Files:**
- Modify: `src/lib/store/financeStore.ts` (interfaz ~línea 316, implementación ~línea 2128, ambas justo después de `getSavingsGoalProgress`)
- Test: `src/lib/store/__tests__/home-overview-getters.test.ts` (agregar al mismo archivo del Task 1)

**Interfaces:**
- Consume: `get().savingsGoals: SavingsGoal[]`, `get().dolarBlue`, `get().getSavingsGoalProgress(goalId): { goal: SavingsGoal; totalContributed: number; percent: number; daysLeft: number | null; status: 'active'|'completed'; ... } | null`.
- Produce: `getSavingsGoalsOverview(): { goals: Array<{ id: string; name: string; percent: number; currency: 'ARS'|'USD'; status: 'active'|'completed' }>; totalSavedARS: number; activeCount: number }` — usado por `SavingsGoalsRingsCard` (Task 4). **`goals` NO viene recortado a 4** — el recorte a 4 para la fila de anillos es responsabilidad del componente (overflow), y `activeCount = goals.length` cuenta todas las metas activas.

- [ ] **Step 1: Escribir el test (falla porque el getter no existe)**

Agregar al final de `src/lib/store/__tests__/home-overview-getters.test.ts`:

```ts
describe('getSavingsGoalsOverview', () => {
  it('retorna activeCount 0 y totalSavedARS 0 sin metas activas', () => {
    seed({ savingsGoals: [], savingsGoalContributions: [] });
    const res = useFinanceStore.getState().getSavingsGoalsOverview();
    expect(res.activeCount).toBe(0);
    expect(res.goals).toEqual([]);
    expect(res.totalSavedARS).toBe(0);
  });

  it('ignora metas inactivas', () => {
    seed({
      savingsGoals: [
        { id: 'g1', name: 'Vieja', type: 'one_time', target_amount: 1000, currency: 'ARS', target_date: null, is_active: false },
      ],
      savingsGoalContributions: [],
    });
    expect(useFinanceStore.getState().getSavingsGoalsOverview().activeCount).toBe(0);
  });

  it('calcula percent y totalSavedARS con metas solo en ARS', () => {
    seed({
      savingsGoals: [
        { id: 'g1', name: 'Vacaciones', type: 'one_time', target_amount: 100000, currency: 'ARS', target_date: null, is_active: true },
      ],
      savingsGoalContributions: [
        { id: 'c1', goal_id: 'g1', amount: 30000, currency: 'ARS', date: '2026-01-10' },
      ],
    });
    const res = useFinanceStore.getState().getSavingsGoalsOverview();
    expect(res.activeCount).toBe(1);
    expect(res.goals[0]).toMatchObject({ id: 'g1', name: 'Vacaciones', percent: 30, currency: 'ARS', status: 'active' });
    expect(res.totalSavedARS).toBe(30000);
  });

  it('convierte a ARS los aportes de metas en USD para el total', () => {
    seed({
      dolarBlue: { compra: 900, venta: 1000, fechaActualizacion: '' },
      savingsGoals: [
        { id: 'g1', name: 'Auto', type: 'one_time', target_amount: 100000, currency: 'ARS', target_date: null, is_active: true },
        { id: 'g2', name: 'Viaje USA', type: 'one_time', target_amount: 500, currency: 'USD', target_date: null, is_active: true },
      ],
      savingsGoalContributions: [
        { id: 'c1', goal_id: 'g1', amount: 30000, currency: 'ARS', date: '2026-01-10' },
        { id: 'c2', goal_id: 'g2', amount: 200, currency: 'USD', date: '2026-01-10' },
      ],
    });
    const res = useFinanceStore.getState().getSavingsGoalsOverview();
    // 30000 (ARS) + 200*1000 (USD->ARS) = 230000
    expect(res.totalSavedARS).toBe(230000);
    const usdGoal = res.goals.find((g) => g.id === 'g2');
    expect(usdGoal).toMatchObject({ percent: 40, currency: 'USD', status: 'active' });
  });

  it('prioriza metas con fecha por daysLeft asc y despues por percent desc', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 1)); // 1 abr 2026

    try {
      seed({
        savingsGoals: [
          { id: 'x', name: 'Lejana', type: 'one_time', target_amount: 10000, currency: 'ARS', target_date: '2026-05-01', is_active: true }, // daysLeft 30
          { id: 'y', name: 'Cercana', type: 'one_time', target_amount: 10000, currency: 'ARS', target_date: '2026-04-06', is_active: true }, // daysLeft 5
          { id: 'z', name: 'Mensual alta', type: 'monthly', target_amount: 10000, currency: 'ARS', target_date: null, is_active: true }, // percent 80
          { id: 'w', name: 'Mensual baja', type: 'monthly', target_amount: 10000, currency: 'ARS', target_date: null, is_active: true }, // percent 50
        ],
        savingsGoalContributions: [
          { id: 'c-z', goal_id: 'z', amount: 8000, currency: 'ARS', date: '2026-04-01' },
          { id: 'c-w', goal_id: 'w', amount: 5000, currency: 'ARS', date: '2026-04-01' },
        ],
      });

      const res = useFinanceStore.getState().getSavingsGoalsOverview();
      expect(res.goals.map((g) => g.id)).toEqual(['y', 'x', 'z', 'w']);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- home-overview-getters`
Expected: FAIL — `getSavingsGoalsOverview is not a function`.

- [ ] **Step 3: Agregar el tipo a la interfaz `FinanceState`**

Justo después del cierre de `getSavingsGoalProgress` (línea 316, `} | null;`):

```ts
  getSavingsGoalsOverview: () => {
    goals: Array<{
      id: string;
      name: string;
      percent: number;
      currency: 'ARS' | 'USD';
      status: 'active' | 'completed';
    }>;
    totalSavedARS: number;
    activeCount: number;
  };
```

- [ ] **Step 4: Implementar el getter**

Justo después del cierre de la implementación de `getSavingsGoalProgress` (después de `return { goal, totalContributed, ... };\n  },`):

```ts
  /**
   * Agregado de metas de ahorro activas para la card de anillos del inicio.
   *
   * Orden de prioridad: las metas con fecha límite (`daysLeft` no nulo) van
   * primero, ordenadas por `daysLeft` ascendente (las que vencen antes,
   * primero); las metas sin fecha (mensuales) van después, ordenadas por
   * `percent` descendente (las más avanzadas primero).
   *
   * `totalSavedARS` suma TODAS las metas activas (no solo las priorizadas para
   * mostrar), convirtiendo los aportes de metas en USD a ARS vía dólar blue.
   */
  getSavingsGoalsOverview: () => {
    const { savingsGoals, dolarBlue, getSavingsGoalProgress } = get();
    const blue = dolarBlue?.venta && dolarBlue.venta > 0 ? dolarBlue.venta : null;

    const withProgress = savingsGoals
      .filter((g) => g.is_active)
      .map((g) => getSavingsGoalProgress(g.id))
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const sorted = [...withProgress].sort((a, b) => {
      if (a.daysLeft !== null && b.daysLeft !== null) return a.daysLeft - b.daysLeft;
      if (a.daysLeft !== null) return -1;
      if (b.daysLeft !== null) return 1;
      return b.percent - a.percent;
    });

    const goals = sorted.map((p) => ({
      id: p.goal.id,
      name: p.goal.name,
      percent: p.percent,
      currency: p.goal.currency,
      status: p.status,
    }));

    const totalSavedARS = withProgress.reduce((sum, p) => {
      const contributed = p.totalContributed;
      return sum + (p.goal.currency === 'USD' && blue ? contributed * blue : contributed);
    }, 0);

    return { goals, totalSavedARS, activeCount: goals.length };
  },
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npm test -- home-overview-getters`
Expected: PASS (los 9 tests del archivo).

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/home-overview-getters.test.ts
git commit -m "feat(store): agregar getSavingsGoalsOverview con prioridad y total en ARS"
```

---

### Task 3: Componente `BudgetGaugeCard`

**Files:**
- Create: `src/components/dashboard/budget-gauge-card.tsx`

**Interfaces:**
- Consume: `useFinanceStore((s) => s.getBudgetsOverview)` (Task 1), `useFinanceStore((s) => s.getAllBudgetStatuses)` (ya existe), `Card` de `@/components/ui/card`, `ProgressBar` de `@/components/ui/progress-bar`, `InfoHint` de `@/components/ui/info-hint`.
- Produce: `export function BudgetGaugeCard()` — usado en `page.tsx` (Task 5).

- [ ] **Step 1: Crear el componente**

```tsx
'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { InfoHint } from '@/components/ui/info-hint';

type Tone = 'good' | 'warn' | 'bad';

const ARC_STROKE: Record<Tone, string> = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
};

const TEXT_TONE: Record<Tone, string> = {
  good: 'text-good',
  warn: 'text-warn',
  bad: 'text-bad',
};

const PILL_TONE: Record<Tone, string> = {
  good: 'bg-good/10 text-good',
  warn: 'bg-warn/10 text-warn',
  bad: 'bg-bad/10 text-bad',
};

const GAUGE_WIDTH = 220;
const GAUGE_HEIGHT = 128;
const RADIUS = 94;
const CENTER_X = GAUGE_WIDTH / 2;
const CENTER_Y = 116;
const STROKE_WIDTH = 16;
const ARC_LENGTH = Math.PI * RADIUS;
const ARC_PATH = `M ${CENTER_X - RADIUS} ${CENTER_Y} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTER_X + RADIUS} ${CENTER_Y}`;

function pointOnArc(fraction: number) {
  const angle = Math.PI * (1 - fraction);
  return {
    x: CENTER_X + RADIUS * Math.cos(angle),
    y: CENTER_Y - RADIUS * Math.sin(angle),
  };
}

export function BudgetGaugeCard() {
  const getBudgetsOverview = useFinanceStore((s) => s.getBudgetsOverview);
  const getAllBudgetStatuses = useFinanceStore((s) => s.getAllBudgetStatuses);

  const overview = getBudgetsOverview();
  if (!overview) return null;

  const { percent, projectedPercent, status, willExceed } = overview;
  const tone: Tone = status === 'exceeded' ? 'bad' : status === 'warning' ? 'warn' : 'good';
  const valueFraction = Math.min(percent, 100) / 100;
  const projectionPoint = pointOnArc(Math.min(projectedPercent, 100) / 100);

  const pillTone: Tone = willExceed ? 'bad' : projectedPercent >= 90 ? 'warn' : 'good';
  const roundedProjected = Math.round(projectedPercent);
  const pillText = willExceed
    ? `Proyectás terminar en ${roundedProjected}% · te pasás`
    : pillTone === 'warn'
      ? `Proyectás terminar en ${roundedProjected}% · vas ajustado`
      : `Proyectás terminar en ${roundedProjected}% · te alcanza`;

  const topBudgets = getAllBudgetStatuses().slice(0, 2);

  return (
    <Card className="p-4 space-y-3">
      <div className="relative mx-auto" style={{ width: GAUGE_WIDTH, height: GAUGE_HEIGHT }}>
        <svg width={GAUGE_WIDTH} height={GAUGE_HEIGHT} viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`}>
          <path d={ARC_PATH} fill="none" stroke="var(--surface-2)" strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
          <path
            d={ARC_PATH}
            fill="none"
            stroke={ARC_STROKE[tone]}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={ARC_LENGTH * (1 - valueFraction)}
          />
          <circle
            cx={projectionPoint.x}
            cy={projectionPoint.y}
            r={7}
            fill={willExceed ? 'var(--bad)' : 'var(--good)'}
            stroke="white"
            strokeWidth={2}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
          <span className="font-poster tnum text-text text-[32px] leading-none">{Math.round(percent)}%</span>
          <span className="text-[11px] text-muted mt-0.5">usado del mes</span>
        </div>
      </div>

      <div className="flex justify-center">
        <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${PILL_TONE[pillTone]}`}>
          {pillText}
        </span>
      </div>

      {topBudgets.length > 0 && (
        <div className="space-y-2">
          {topBudgets.map((b) => {
            const rowTone: Tone = b.status === 'exceeded' ? 'bad' : b.status === 'warning' ? 'warn' : 'good';
            return (
              <div key={b.budget.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text flex items-center gap-1 truncate">
                    {b.categoryEmoji && <span>{b.categoryEmoji}</span>}
                    <span className="truncate">{b.categoryName}</span>
                  </span>
                  <span className={`tnum shrink-0 ml-2 ${TEXT_TONE[rowTone]}`}>
                    {Math.round(Math.min(b.percent, 100))}%
                  </span>
                </div>
                <ProgressBar value={Math.min(b.percent, 100)} tone={rowTone} height={7} />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <InfoHint label="Cómo se calcula la proyección">
          Proyectamos tu gasto de fin de mes según el ritmo diario de tus presupuestos activos
          y lo comparamos contra el tope total. El punto sobre el arco marca dónde vas a terminar.
        </InfoHint>
        <span>¿Cómo se calcula la proyección?</span>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `budget-gauge-card.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/budget-gauge-card.tsx
git commit -m "feat(dashboard): agregar BudgetGaugeCard con gauge SVG y proyeccion"
```

---

### Task 4: Componente `SavingsGoalsRingsCard`

**Files:**
- Create: `src/components/dashboard/savings-goals-rings-card.tsx`

**Interfaces:**
- Consume: `useFinanceStore((s) => s.getSavingsGoalsOverview)` (Task 2), `Card`, `formatCurrency` de `@/lib/utils`.
- Produce: `export function SavingsGoalsRingsCard()` — usado en `page.tsx` (Task 5).

- [ ] **Step 1: Crear el componente**

```tsx
'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';

const RING_SIZE = 80;
const STROKE_WIDTH = 8;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function SavingsGoalsRingsCard() {
  const getSavingsGoalsOverview = useFinanceStore((s) => s.getSavingsGoalsOverview);
  const overview = getSavingsGoalsOverview();

  if (overview.activeCount === 0) return null;

  const shownGoals = overview.goals.slice(0, 4);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap justify-around gap-3">
        {shownGoals.map((g) => {
          const ringColor = g.status === 'completed' ? 'var(--good)' : 'var(--accent)';
          const dash = (CIRCUMFERENCE * Math.min(g.percent, 100)) / 100;

          return (
            <div key={g.id} className="flex flex-col items-center w-[76px]">
              <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
                <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
                  <circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke="var(--surface-2)"
                    strokeWidth={STROKE_WIDTH}
                  />
                  <circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth={STROKE_WIDTH}
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
                    transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="tnum text-text text-[15px] font-bold">{Math.round(g.percent)}%</span>
                </div>
              </div>
              <span className="text-[11px] font-bold text-text truncate max-w-full mt-1">{g.name}</span>
              {g.currency === 'USD' && (
                <span className="text-[9px] bg-surface-2 text-muted px-1.5 py-0.5 rounded-full mt-0.5">USD</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-3 flex items-center justify-between">
        <span className="text-[11px] text-muted">Total ahorrado</span>
        <span className="font-poster tnum text-text text-[15px]">{formatCurrency(overview.totalSavedARS)}</span>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `savings-goals-rings-card.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/savings-goals-rings-card.tsx
git commit -m "feat(dashboard): agregar SavingsGoalsRingsCard con anillos de progreso"
```

---

### Task 5: Wiring en `src/app/page.tsx`

**Files:**
- Modify: `src/app/page.tsx:26` (import), `src/app/page.tsx:201-203` (bloque de Presupuestos)

**Interfaces:**
- Consume: `BudgetGaugeCard` (Task 3), `SavingsGoalsRingsCard` (Task 4), `SectionTitle` (ya existe).

- [ ] **Step 1: Reemplazar el import**

En `src/app/page.tsx:26`, cambiar:

```tsx
import { BudgetOverviewStrip } from '@/components/goals/budget-overview-strip';
```

por:

```tsx
import { BudgetGaugeCard } from '@/components/dashboard/budget-gauge-card';
import { SavingsGoalsRingsCard } from '@/components/dashboard/savings-goals-rings-card';
```

- [ ] **Step 2: Reemplazar el bloque de Presupuestos y agregar Metas**

En `src/app/page.tsx:201-203`, cambiar:

```tsx
        {/* PRESUPUESTOS DEL MES */}
        <SectionTitle action="Gestionar" href="/objetivos">Presupuestos</SectionTitle>
        <BudgetOverviewStrip />
```

por:

```tsx
        {/* PRESUPUESTOS DEL MES */}
        <SectionTitle action="Gestionar" href="/objetivos?tab=presupuestos">Presupuestos</SectionTitle>
        <BudgetGaugeCard />

        {/* METAS DE AHORRO */}
        <SectionTitle action="Ver todas" href="/objetivos?tab=metas">Metas de ahorro</SectionTitle>
        <SavingsGoalsRingsCard />
```

- [ ] **Step 3: Verificar que no queden referencias rotas**

Run: `npx tsc --noEmit`
Expected: sin errores en `page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): cablear BudgetGaugeCard y SavingsGoalsRingsCard en el inicio"
```

---

### Task 6: Limpieza — borrar `BudgetOverviewStrip` y skeleton huérfano

**Files:**
- Delete: `src/components/goals/budget-overview-strip.tsx`
- Modify: `src/components/ui/skeletons.tsx` (quitar `BudgetStripSkeleton`, líneas 85-105, y su uso en `DashboardSkeleton`, líneas 183-184)

**Interfaces:** Ninguna (solo remoción).

- [ ] **Step 1: Verificar que no hay más referencias antes de borrar**

Run: `grep -rn "BudgetOverviewStrip" src`
Expected: 0 resultados (ya reemplazado en Task 5).

- [ ] **Step 2: Borrar el componente viejo**

```bash
git rm src/components/goals/budget-overview-strip.tsx
```

- [ ] **Step 3: Quitar `BudgetStripSkeleton` de `skeletons.tsx`**

En `src/components/ui/skeletons.tsx`, quitar la función completa (líneas 85-105):

```tsx
function BudgetStripSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

Y su uso dentro de `DashboardSkeleton` (líneas 183-184):

```tsx
        {/* SECCION B: Budget Strip */}
        <BudgetStripSkeleton />

```

(dejar directamente la sección de Charts a continuación, sin placeholder de reemplazo — es opcional según el spec y agregar dos skeletons de forma/tamaño distinto para gauge/anillos sería sobre-ingeniería para un simple loading state).

- [ ] **Step 4: Verificar build y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/goals/budget-overview-strip.tsx src/components/ui/skeletons.tsx
git commit -m "chore(dashboard): eliminar BudgetOverviewStrip y su skeleton huerfano"
```

---

### Task 7: Verificación final (Definition of Done)

**Files:** Ninguno nuevo — solo comandos de verificación.

- [ ] **Step 1: Suite completa de tests**

Run: `npm test`
Expected: todos los tests en verde (excepto las fallas preexistentes ya documentadas de `dates.test.ts`, ajenas a este cambio).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: sin errores ni warnings nuevos.

- [ ] **Step 3: Build de producción**

Run: `npm run build`
Expected: build exitoso, sin errores de tipos.

- [ ] **Step 4: Verificar cero referencias a lo viejo**

Run: `grep -rn "BudgetOverviewStrip\|budget-overview-strip" src`
Expected: 0 resultados.

- [ ] **Step 5: Validación visual a 392px**

Levantar `npm run dev` y revisar `/` en viewport 392px: gauge y anillos legibles, sin overflow horizontal, cards se ocultan si no hay presupuestos/metas activas. (Verificación manual — no hay herramienta de browser automation disponible en esta sesión; documentar cualquier ajuste de layout necesario tras la revisión manual.)
