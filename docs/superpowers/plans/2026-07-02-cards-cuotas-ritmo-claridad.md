# Claridad cards Cuotas y Ritmo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las cards "Costo real de tus cuotas" y "Ritmo de gasto" comuniquen su beneficio de un vistazo, sin frase-disclaimer, vía título + jerarquía + micro-labels.

**Architecture:** Dos componentes cliente del dashboard de análisis. El título de cada card pasa a ser el beneficio/pregunta; se eliminan los `<p>` explicativos; en Ritmo el veredicto se jerarquiza (chip) y se agrega micro-leyenda de líneas. Sin cambios en el store ni en la lógica de negocio.

**Tech Stack:** Next.js App Router, React (client components), Zustand (`useFinanceStore`), Tailwind con tokens semánticos, lucide-react, recharts.

## Global Constraints

- Tokens semánticos SIEMPRE; nunca hex ni colores Tailwind crudos. Colores de líneas del chart vía `var(--text)`, `var(--warn)`, `var(--bad)`.
- Bordes `border-[1.5px]`. Números financieros con `tnum`. Montos display con `font-poster`.
- `'use client'` se mantiene en ambos componentes.
- Client components NUNCA hacen fetch: solo `useFinanceStore`. No agregar getters nuevos.
- Íconos: lucide-react importados específicos.
- Sin tests configurados en el proyecto → verificación por `npm run lint`, `npm run build` y chequeo visual.
- No tocar la lógica `ok` (comparación en ARS crudo) ni los getters `getMonthlySpendingPace` / `getInstallmentsRealCost`.

---

### Task 1: Card Cuotas — título-beneficio + filas labeladas, sin frase

**Files:**
- Modify: `src/components/dashboard/analysis/cards/installments-real-cost-card.tsx` (reemplazo completo del JSX de retorno)

**Interfaces:**
- Consumes: `getInstallmentsRealCost()` → `{ remainingARS: number, remainingUSD: number, hasData: boolean }` (sin cambios).
- Produces: nada que otra task consuma.

- [ ] **Step 1: Reemplazar el componente**

Contenido completo del archivo:

```tsx
'use client';

import { TrendingDown } from 'lucide-react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function InstallmentsRealCostCard() {
  const getInstallmentsRealCost = useFinanceStore((s) => s.getInstallmentsRealCost);
  const { remainingARS, remainingUSD, hasData } = getInstallmentsRealCost();

  if (!hasData) return null;

  return (
    <div className="rounded-2xl bg-surface border-[1.5px] border-warn/40 p-4">
      <h3 className="text-sm font-bold text-text mb-3 flex items-center justify-between">
        La inflación licúa tus cuotas
        <span className="text-[9px] text-warn font-bold bg-warn/10 px-1.5 py-0.5 rounded">🇦🇷 AR</span>
      </h3>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted">Debés</span>
        <span className="font-poster tnum text-xl text-text">{formatCurrency(remainingARS)}</span>
      </div>
      <div className="flex items-baseline justify-between mt-1">
        <span className="text-[11px] text-muted">Hoy valen</span>
        <span className="font-poster tnum text-sm text-good inline-flex items-center gap-1">
          USD {Math.round(remainingUSD)}
          <TrendingDown className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
}
```

Cambios respecto al original: título `Costo real de tus cuotas` → `La inflación licúa tus cuotas`; se elimina el `<p>` de inflación; el número queda en dos filas labeladas (`Debés` / `Hoy valen`) con `↓` (`TrendingDown`) en tono `good`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: sin errores nuevos en `installments-real-cost-card.tsx`.

- [ ] **Step 3: Chequeo visual**

Run: `npm run dev` y abrir el dashboard (tab "Este mes") con una cuenta que tenga cuotas futuras.
Expected: título nuevo, dos filas `Debés` / `Hoy valen USD X ↓`, sin párrafo de inflación.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analysis/cards/installments-real-cost-card.tsx
git commit -m "feat(analysis): card cuotas comunica beneficio via titulo, sin disclaimer"
```

---

### Task 2: Card Ritmo — título-pregunta, veredicto chip y micro-leyenda

**Files:**
- Modify: `src/components/dashboard/analysis/tab-este-mes.tsx` (reemplazo completo)

**Interfaces:**
- Consumes: `getMonthlySpendingPace()` → `{ points: Array<{day,cumulative}>, projectedTotal: number, income: number, todayDay: number, daysInMonth: number }`; `toDisplay(ars: number) => number`. Ambos ya existen.
- Produces: nada que otra task consuma.

- [ ] **Step 1: Reemplazar el componente**

Contenido completo del archivo:

```tsx
'use client';

import { Check, AlertTriangle } from 'lucide-react';
import { SpendingPaceChart } from './charts/spending-pace-chart';
import { InstallmentsRealCostCard } from './cards/installments-real-cost-card';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function TabEsteMes() {
  const { getMonthlySpendingPace, toDisplay } = useFinanceStore();
  const pace = getMonthlySpendingPace();
  // pace.projectedTotal e pace.income vienen en ARS: la comparación queda en ARS crudo
  // (convertir ambos lados no cambiaría el resultado, y convertir uno solo lo rompería).
  const ok = pace.income === 0 ? null : pace.projectedTotal <= pace.income;
  const hasData = pace.points.length > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:items-start">
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-2">¿Llegás a fin de mes?</h3>

        {hasData && (
          <div className="flex items-center gap-2 mb-2">
            {ok !== null && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  ok ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'
                }`}
              >
                {ok ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {ok ? 'Vas bien' : 'Te pasás'}
              </span>
            )}
            <span className="text-[11px] text-muted">
              Proyectás <b className="text-text tnum">{formatCurrency(toDisplay(pace.projectedTotal))}</b>
            </span>
          </div>
        )}

        <SpendingPaceChart />

        {hasData && (
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--text)' }} />
              Gasto
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--warn)' }} />
              Proyección
            </span>
            {pace.income > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--bad)' }} />
                Ingreso
              </span>
            )}
          </div>
        )}
      </div>
      <InstallmentsRealCostCard />
    </div>
  );
}
```

Cambios respecto al original: título `Ritmo de gasto` → `¿Llegás a fin de mes?`; el veredicto sube a un chip (`Vas bien` good / `Te pasás` bad) con `Proyectás $X` al lado; se elimina el `<p>` `A este ritmo terminás en ~X`; se agrega micro-leyenda (Gasto / Proyección / Ingreso) con dots que matchean los colores de las líneas del chart. La leyenda de Ingreso solo aparece si `pace.income > 0` (coincide con la `ReferenceLine` del chart).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: sin errores nuevos en `tab-este-mes.tsx`.

- [ ] **Step 3: Chequeo visual**

Run: `npm run dev`, dashboard tab "Este mes".
Expected: título nuevo; chip de veredicto arriba (verde `Vas bien` o rojo `Te pasás` según proyección vs ingreso); `Proyectás $X`; debajo del chart la fila de dots; los colores de los dots coinciden con las líneas. Probar toggle ARS/USD: el monto proyectado y el chart cambian de moneda juntos. Probar sin gastos del mes: se ve el empty state y NO aparecen chip ni leyenda.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analysis/tab-este-mes.tsx
git commit -m "feat(analysis): ritmo con titulo-pregunta, veredicto chip y leyenda de lineas"
```

---

### Task 3: Verificación final de build

**Files:**
- (ninguno — solo verificación)

- [ ] **Step 1: Build de producción**

Run: `npm run build`
Expected: build exitoso, sin errores de tipos ni de lint. Si falla, corregir en la task correspondiente antes de dar por cerrado.

---

## Self-Review

- **Spec coverage:**
  - Card cuotas título-beneficio + sacar frase → Task 1. ✓
  - Card ritmo título-pregunta + veredicto chip + micro-leyenda + sacar frase → Task 2. ✓
  - Tokens/estilo (chips good/bad, tnum, font-poster, border-[1.5px]) → Tasks 1 y 2. ✓
  - Fuera de alcance (sin getters nuevos, sin métrica de "cuánto se licuó") → respetado. ✓
- **Placeholder scan:** sin TBD/TODO; todo el código está completo en cada step. ✓
- **Type consistency:** `getInstallmentsRealCost` y `getMonthlySpendingPace` usados con las firmas reales del store; `ok` con la misma lógica del original; `formatCurrency`/`toDisplay` ya existían en el archivo original. ✓
