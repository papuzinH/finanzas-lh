# Card "Tasa de ahorro mensual" — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la card "Tasa de ahorro mensual" (tab "Tendencia" del `AnalysisSection`) de un gráfico de barras estático y mudo en una card interactiva con headline claro (%, $ neto, tag cualitativo por tono) y barras tocables que actualizan ese headline al mes seleccionado.

**Architecture:** El getter del store `getSavingsRateSeries` se extiende para devolver un `tone: 'good'|'warn'|'bad'` calculado por umbral junto a `rate`/`net` (cálculo de negocio en el store, regla del proyecto). `SavingsRateBars` deja de ser un chart puramente decorativo: recibe `selectedMonth`/`onSelectMonth` como props controladas y colorea/atenúa las barras según `tone` y selección. `TabTendencia` sube el estado `selectedMonth`, renderiza el headline (número + tag + mes + net) a partir de la entrada activa de la serie, y pasa las props al chart.

**Tech Stack:** Next.js App Router (client component), Zustand (`useFinanceStore`), Recharts (`BarChart`/`Bar`/`Cell`), Vitest (tests del store), Tailwind con tokens semánticos del proyecto.

## Global Constraints

- Client Components: `'use client'`, solo hooks/store — NUNCA fetch directo (CLAUDE.md).
- Toda lógica de negocio (sumas, cálculos, porcentajes, clasificación por umbral) va en el store, NO en componentes (CLAUDE.md).
- Tokens semánticos SIEMPRE: `text-good`/`text-warn`/`text-bad`, `bg-surface`, `border-border`. Prohibido `emerald-*`/`rose-*`/`slate-*`/etc (CLAUDE.md).
- Bordes siempre `border-[1.5px] border-border`, nunca `border` a secas (CLAUDE.md).
- Números financieros con clase `tnum`; montos/headline con `font-poster` (CLAUDE.md).
- Imports absolutos `@/...`; tipos de `types/database.ts` cuando aplique; nunca `any` (CLAUDE.md).
- Umbral de tono (spec, `docs/superpowers/specs/2026-07-02-tasa-ahorro-card-design.md`): `rate >= 15` → `good`; `0 <= rate < 15` → `warn`; `rate < 0` → `bad`.
- El proyecto SÍ tiene Vitest configurado para el store (`npm run test` → `vitest run`), aunque CLAUDE.md diga "sin tests configurados" (eso aplica a UI/e2e, no al store — confirmado en `package.json:10` y `src/lib/store/__tests__/analysis-getters.test.ts`). Los getters nuevos/modificados del store se testean con Vitest. Los componentes UI se verifican manualmente (no hay React Testing Library instalado).

---

### Task 1: Store — `getSavingsRateSeries` devuelve `tone`

**Files:**
- Modify: `src/lib/store/financeStore.ts:337-341` (firma del getter en la interfaz del store)
- Modify: `src/lib/store/financeStore.ts:2072-2078` (implementación)
- Test: `src/lib/store/__tests__/analysis-getters.test.ts` (extiende el `describe('getSavingsRateSeries', ...)` existente, línea 113)

**Interfaces:**
- Consumes: `get().getMonthlyTrend(months)` — ya existe, devuelve `Array<{ month: string; income: number; expenses: number; net: number; ... }>` (`financeStore.ts:2001`).
- Produces: `getSavingsRateSeries(months?: number) => Array<{ month: string; rate: number; net: number; tone: 'good' | 'warn' | 'bad' }>` — el campo `tone` es nuevo, `month`/`rate`/`net` mantienen su forma actual. Este es el tipo que consume el Task 2.

- [ ] **Step 1: Escribir el test que falla**

Agregar estos dos casos dentro del `describe('getSavingsRateSeries', ...)` existente en `src/lib/store/__tests__/analysis-getters.test.ts` (después del `it` que ya existe en la línea 114-123):

```ts
  it('asigna tone="good" cuando la tasa es >= 15', () => {
    seed({
      transactions: [
        { id: 1, type: 'income', amount: 1000, date: format(new Date(), 'yyyy-MM-dd') },
        { id: 2, type: 'expense', amount: -800, date: format(new Date(), 'yyyy-MM-dd'), installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    // rate = (1000-800)/1000*100 = 20
    expect(useFinanceStore.getState().getSavingsRateSeries(1)[0].tone).toBe('good');
  });

  it('asigna tone="warn" cuando la tasa está entre 0 y 15, y tone="bad" cuando es negativa', () => {
    seed({
      transactions: [
        { id: 1, type: 'income', amount: 1000, date: format(new Date(), 'yyyy-MM-dd') },
        { id: 2, type: 'expense', amount: -950, date: format(new Date(), 'yyyy-MM-dd'), installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    // rate = 5 -> warn
    expect(useFinanceStore.getState().getSavingsRateSeries(1)[0].tone).toBe('warn');

    seed({
      transactions: [
        { id: 1, type: 'income', amount: 1000, date: format(new Date(), 'yyyy-MM-dd') },
        { id: 2, type: 'expense', amount: -1200, date: format(new Date(), 'yyyy-MM-dd'), installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    // rate = -20 -> bad
    expect(useFinanceStore.getState().getSavingsRateSeries(1)[0].tone).toBe('bad');
  });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/store/__tests__/analysis-getters.test.ts -t getSavingsRateSeries`
Expected: FAIL — `tone` es `undefined`, `expect(undefined).toBe('good')` no matchea.

- [ ] **Step 3: Implementar el cambio en el store**

En `src/lib/store/financeStore.ts`, actualizar la firma de la interfaz (línea 337-341):

```ts
  getSavingsRateSeries: (months?: number) => Array<{
    month: string;
    rate: number;
    net: number;
    tone: 'good' | 'warn' | 'bad';
  }>;
```

Y la implementación (línea 2072-2078):

```ts
  getSavingsRateSeries: (months = 6) => {
    return get().getMonthlyTrend(months).map((row) => {
      const rate = row.income > 0 ? (row.net / row.income) * 100 : 0;
      const tone: 'good' | 'warn' | 'bad' = rate >= 15 ? 'good' : rate >= 0 ? 'warn' : 'bad';
      return { month: row.month, net: row.net, rate, tone };
    });
  },
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/store/__tests__/analysis-getters.test.ts`
Expected: PASS — todos los tests del archivo (incluyendo el pre-existente `getSavingsRateSeries` de la línea 114) pasan en verde.

- [ ] **Step 5: Correr la suite completa del store para evitar regresiones**

Run: `npm run test`
Expected: PASS — ningún test roto por el nuevo campo `tone` (nadie más destructura ese objeto por posición).

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/analysis-getters.test.ts
git commit -m "feat(store): getSavingsRateSeries clasifica tone good/warn/bad por umbral"
```

---

### Task 2: UI — barras interactivas + headline en `TabTendencia`

**Files:**
- Modify: `src/components/dashboard/analysis/charts/savings-rate-bars.tsx`
- Modify: `src/components/dashboard/analysis/tab-tendencia.tsx`

**Interfaces:**
- Consumes: `getSavingsRateSeries(months?) => Array<{ month: string; rate: number; net: number; tone: 'good'|'warn'|'bad' }>` (Task 1).
- Produces: `SavingsRateBars({ selectedMonth: string | null; onSelectMonth: (month: string) => void })` — componente controlado, sin estado propio de selección. No hay más consumidores de `SavingsRateBars` en el repo (único uso: `tab-tendencia.tsx`), así que este cambio de firma de props no rompe nada más.

Esta tarea toca los dos archivos juntos porque cambiar la firma de props de `SavingsRateBars` sin actualizar `TabTendencia` en el mismo paso deja el build roto (props requeridas faltantes) — no tiene sentido dividirla en dos tareas separadas.

- [ ] **Step 1: Reescribir `SavingsRateBars` como componente controlado**

Reemplazar el contenido completo de `src/components/dashboard/analysis/charts/savings-rate-bars.tsx`:

```tsx
'use client';

import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from 'recharts';
import { useFinanceStore } from '@/lib/store/financeStore';

const TONE_COLOR: Record<'good' | 'warn' | 'bad', string> = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
};

export function SavingsRateBars({
  selectedMonth,
  onSelectMonth,
}: {
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
}) {
  const getSavingsRateSeries = useFinanceStore((s) => s.getSavingsRateSeries);
  const data = getSavingsRateSeries(6);
  const hasData = data.some((d) => d.net !== 0);
  const activeMonth = selectedMonth ?? data[data.length - 1]?.month ?? null;

  if (!hasData) {
    return <div className="h-[120px] flex items-center justify-center text-xs text-muted italic">Sin datos de ahorro</div>;
  }

  return (
    <div aria-label="Tasa de ahorro mensual, tocá una barra para ver el detalle de ese mes" className="h-[120px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="month" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Bar
            dataKey="rate"
            radius={[4, 4, 0, 0]}
            isAnimationActive
            animationDuration={700}
            className="cursor-pointer"
            onClick={(bar: { payload?: { month?: string } }) => {
              if (bar.payload?.month) onSelectMonth(bar.payload.month);
            }}
          >
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={TONE_COLOR[d.tone]}
                fillOpacity={d.month === activeMonth ? 1 : 0.45}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Actualizar `TabTendencia` con el headline y el estado levantado**

Reemplazar el contenido completo de `src/components/dashboard/analysis/tab-tendencia.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { TrendChart } from '@/components/dashboard/trend-chart';
import { SavingsRateBars } from './charts/savings-rate-bars';
import { useFinanceStore } from '@/lib/store/financeStore';
import { cn, formatCurrency } from '@/lib/utils';

const TONE_LABEL: Record<'good' | 'warn' | 'bad', string> = {
  good: 'Sólido',
  warn: 'Ajustado',
  bad: 'Números rojos',
};

const TONE_CLASS: Record<'good' | 'warn' | 'bad', string> = {
  good: 'text-good bg-good/10',
  warn: 'text-warn bg-warn/10',
  bad: 'text-bad bg-bad/10',
};

export function TabTendencia() {
  const getRealAdjustedTrend = useFinanceStore((s) => s.getRealAdjustedTrend);
  const getSavingsRateSeries = useFinanceStore((s) => s.getSavingsRateSeries);
  const real = getRealAdjustedTrend(6);
  const savingsSeries = getSavingsRateSeries(6);
  const hasSavingsData = savingsSeries.some((d) => d.net !== 0);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

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

  const activeEntry = selectedMonth
    ? savingsSeries.find((s) => s.month === selectedMonth) ?? savingsSeries[savingsSeries.length - 1]
    : savingsSeries[savingsSeries.length - 1];

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
        {hasSavingsData && activeEntry && (
          <>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-poster tnum text-3xl text-text">{Math.round(activeEntry.rate)}%</span>
              <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full', TONE_CLASS[activeEntry.tone])}>
                {TONE_LABEL[activeEntry.tone]}
              </span>
            </div>
            <p className="text-[11px] text-muted mb-3">
              {activeEntry.month} · <span className="tnum">{formatCurrency(activeEntry.net)}</span> netos
            </p>
          </>
        )}
        <SavingsRateBars selectedMonth={selectedMonth} onSelectMonth={setSelectedMonth} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: sin errores en `savings-rate-bars.tsx` ni `tab-tendencia.tsx` (exit code 0).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build exitoso (exit code 0), sin errores de TypeScript por la nueva firma de props.

- [ ] **Step 5: Verificación manual**

Con `npm run dev` corriendo, ir a la home → tab "Tendencia" del `AnalysisSection`:
- El headline muestra el % y tag del mes actual apenas se abre la tab (sin tocar nada).
- Tocar una barra de un mes anterior actualiza el número, el tag de color y el mes/monto de la línea secundaria.
- Con datos que den `rate >= 15`, el tag dice "Sólido" en verde; con `0-15%`, "Ajustado" en el tono warn; con negativo, "Números rojos" en el tono bad.
- Si no hay datos de ahorro en ningún mes, se sigue mostrando "Sin datos de ahorro" y no aparece el headline (sin cambios respecto al comportamiento previo).
- Probar en viewport mobile (392px): headline y tag no rompen el layout de la card.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/analysis/charts/savings-rate-bars.tsx src/components/dashboard/analysis/tab-tendencia.tsx
git commit -m "feat(analysis): headline interactivo en card de tasa de ahorro mensual"
```

---

## Self-Review

- **Cobertura del spec:** Headline (Task 2 Step 2) ✓, barras interactivas (Task 2 Step 1) ✓, bandas de 3 tonos (Task 1 + Cell coloring en Task 2 Step 1) ✓, extensión del getter (Task 1) ✓, estado vacío sin cambios (Task 2 Step 1 `hasData` + Step 2 `hasSavingsData`) ✓.
- **Placeholders:** ninguno — todos los steps tienen código completo y comandos exactos.
- **Consistencia de tipos:** `tone: 'good' | 'warn' | 'bad'` se define igual en Task 1 (store) y se consume igual en Task 2 (`TONE_COLOR`, `TONE_LABEL`, `TONE_CLASS`, todos `Record<'good'|'warn'|'bad', string>`). El campo `month` (string corto tipo "Jun", ya provisto por `getMonthlyTrend`) es la clave usada tanto para `selectedMonth` como para matchear `Cell`/headline — no se introduce un formato de fecha nuevo.
