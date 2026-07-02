# Card Frecuencia por categoría → Ranking de frecuencia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el heatmap de frecuencia (inaccesible e ilegible) por un ranking horizontal de categorías por nº de movimientos, con toggle Mes/Histórico y modal de detalle.

**Architecture:** Un nuevo getter en el store (`getCategoryFrequencyRanking`) concentra la lógica (conteo, suma, promedio) con el mismo filtro de scope que `getExpensesByCategory`. Un componente nuevo (`CategoryFrequencyRanking`) renderiza una lista semántica de botones accesibles. `tab-categorias.tsx` orquesta el estado (scope + selección) y el modal de detalle. Se elimina el heatmap y el getter viejo.

**Tech Stack:** Next.js App Router · Zustand · TypeScript · Tailwind (tokens semánticos del proyecto).

## Global Constraints

- **Sin tests configurados:** el ciclo de verificación de cada tarea es `npm run lint` + `npm run build` + verificación visual. No hay test runner.
- **Client Components nunca hacen fetch:** solo `useFinanceStore`. Toda lógica de negocio va en el store, no en el componente.
- **Tokens semánticos SIEMPRE:** nunca hex ni colores Tailwind crudos. Usar `bg-accent`, `bg-surface-2`, `text-text`, `text-muted`, `text-faint`, `border-border`.
- **Bordes:** `border-[1.5px] border-border`.
- **Tipografía:** `font-sans` (DM Sans) para UI de texto; `tnum` en TODOS los números financieros/conteos. Ningún tamaño por debajo de `text-xs`.
- **Touch targets ≥44px.** Mobile-first (canvas base 392px).
- **TypeScript:** nunca `any`. Imports absolutos `@/...`.
- **Commits frecuentes**, uno por tarea. Cerrar mensajes de commit con:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Getter `getCategoryFrequencyRanking` en el store

**Files:**
- Modify: `src/lib/store/financeStore.ts` (interfaz ~línea 376-379; implementación ~línea 2226-2254)

**Interfaces:**
- Consumes: `isExpenseInCurrentMonthScope(t, paymentMethods, now)` (helper existente), `transactions`, `categories`, `paymentMethods` del estado.
- Produces:
  ```ts
  getCategoryFrequencyRanking: (scope: 'global' | 'current_month') => Array<{
    category: string;
    emoji: string;
    count: number;
    total: number;
    avg: number;
  }>;
  ```

- [ ] **Step 1: Reemplazar la firma en la interfaz**

En `src/lib/store/financeStore.ts`, buscar el bloque de tipo de `getCategoryFrequency` (aprox. líneas 376-379):

```ts
  getCategoryFrequency: (months?: number) => {
    months: string[];
    rows: Array<{ category: string; emoji: string; counts: number[]; max: number }>;
  };
```

Reemplazarlo por:

```ts
  getCategoryFrequencyRanking: (scope: 'global' | 'current_month') => Array<{
    category: string;
    emoji: string;
    count: number;
    total: number;
    avg: number;
  }>;
```

- [ ] **Step 2: Reemplazar la implementación**

Buscar la implementación de `getCategoryFrequency` (aprox. líneas 2226-2254):

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

Reemplazarla por:

```ts
  getCategoryFrequencyRanking: (scope) => {
    const { transactions, categories, paymentMethods } = get();
    const now = new Date();

    const acc = new Map<string, { count: number; total: number; emoji: string }>();
    transactions
      .filter((t) => {
        if (t.type !== 'expense') return false;
        if (scope === 'current_month') {
          return isExpenseInCurrentMonthScope(t, paymentMethods, now);
        }
        return true;
      })
      .forEach((t) => {
        const cat = categories.find((c) => c.id === t.category_id);
        const name = cat?.name ?? 'Otros';
        const entry = acc.get(name) ?? { count: 0, total: 0, emoji: cat?.emoji ?? '' };
        entry.count += 1;
        entry.total += Math.abs(Number(t.amount));
        acc.set(name, entry);
      });

    return Array.from(acc.entries())
      .map(([category, { count, total, emoji }]) => ({
        category,
        emoji,
        count,
        total,
        avg: count > 0 ? total / count : 0,
      }))
      .sort((a, b) => b.count - a.count);
  },
```

- [ ] **Step 3: Verificar que no queden referencias al getter viejo**

Run: `grep -rn "getCategoryFrequency" src/`
Expected: solo aparece `getCategoryFrequencyRanking`. La única coincidencia de `getCategoryFrequency` sin `Ranking` debería estar en `frequency-heatmap.tsx` (que se elimina en la Task 2). No debe aparecer en ningún otro lugar.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: sin errores nuevos en `financeStore.ts`. (El build completo se corre al final de la Task 3.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/financeStore.ts
git commit -m "feat(store): getCategoryFrequencyRanking reemplaza getCategoryFrequency

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Componente `CategoryFrequencyRanking`

**Files:**
- Create: `src/components/dashboard/analysis/charts/category-frequency-ranking.tsx`
- Delete: `src/components/dashboard/analysis/charts/frequency-heatmap.tsx`

**Interfaces:**
- Consumes: `getCategoryFrequencyRanking(scope)` (Task 1).
- Produces: componente `CategoryFrequencyRanking` con props `{ scope: 'global' | 'current_month'; onSelect: (category: string) => void }`.

- [ ] **Step 1: Crear el componente nuevo**

Crear `src/components/dashboard/analysis/charts/category-frequency-ranking.tsx`:

```tsx
'use client';

import { useFinanceStore } from '@/lib/store/financeStore';

interface CategoryFrequencyRankingProps {
  scope: 'global' | 'current_month';
  onSelect: (category: string) => void;
}

export function CategoryFrequencyRanking({ scope, onSelect }: CategoryFrequencyRankingProps) {
  const getCategoryFrequencyRanking = useFinanceStore((s) => s.getCategoryFrequencyRanking);
  const rows = getCategoryFrequencyRanking(scope).slice(0, 6);

  if (rows.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-xs text-muted italic">
        Sin datos de frecuencia
      </div>
    );
  }

  const maxCount = Math.max(...rows.map((r) => r.count), 1);

  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li key={row.category}>
          <button
            type="button"
            onClick={() => onSelect(row.category)}
            aria-label={`${row.category}, ${row.count} movimientos, ver detalle`}
            className="w-full flex items-center gap-3 py-2 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <span className="w-[92px] shrink-0 text-xs text-text truncate">
              {row.emoji} {row.category}
            </span>
            <span className="flex-1 h-2.5 rounded-full bg-surface-2 overflow-hidden">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${(row.count / maxCount) * 100}%` }}
              />
            </span>
            <span className="w-9 shrink-0 text-right text-sm font-bold text-text tnum">
              {row.count}x
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Eliminar el heatmap viejo**

Run: `git rm src/components/dashboard/analysis/charts/frequency-heatmap.tsx`
Expected: el archivo se marca para borrado. (La referencia en `tab-categorias.tsx` se corrige en la Task 3.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: puede fallar SOLO por el import roto de `FrequencyHeatmap` en `tab-categorias.tsx` (se resuelve en Task 3). El archivo nuevo no debe tener errores propios. Si aparece cualquier otro error en `category-frequency-ranking.tsx`, corregirlo antes de continuar.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analysis/charts/category-frequency-ranking.tsx
git rm src/components/dashboard/analysis/charts/frequency-heatmap.tsx
git commit -m "feat(analysis): CategoryFrequencyRanking reemplaza FrequencyHeatmap

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Integrar en `tab-categorias.tsx` (toggle + modal)

**Files:**
- Modify: `src/components/dashboard/analysis/tab-categorias.tsx`

**Interfaces:**
- Consumes: `CategoryFrequencyRanking` (Task 2), `getCategoryFrequencyRanking(scope)` (Task 1), `Modal`, `formatCurrency`, `toDisplay`.
- Produces: card de Frecuencia con toggle Mes/Histórico propio y modal de detalle de frecuencia.

- [ ] **Step 1: Reemplazar imports y estado**

En `src/components/dashboard/analysis/tab-categorias.tsx`:

Cambiar el import del heatmap:

```tsx
import { FrequencyHeatmap } from './charts/frequency-heatmap';
```

por:

```tsx
import { CategoryFrequencyRanking } from './charts/category-frequency-ranking';
```

Debajo de la línea `const [scope, setScope] = useState<'current_month' | 'global'>('current_month');`, agregar el estado de la card de frecuencia:

```tsx
  const [freqScope, setFreqScope] = useState<'current_month' | 'global'>('current_month');
  const [selectedFreq, setSelectedFreq] = useState<string | null>(null);
```

Obtener el getter junto a la desestructuración existente del store. Reemplazar:

```tsx
  const { getCategoryBreakdown, toDisplay } = useFinanceStore();
```

por:

```tsx
  const { getCategoryBreakdown, getCategoryFrequencyRanking, toDisplay } = useFinanceStore();
```

Después de la línea `const item = selected ? breakdown.items.find((i) => i.name === selected) : null;`, agregar:

```tsx
  const freqRanking = getCategoryFrequencyRanking(freqScope);
  const freqItem = selectedFreq ? freqRanking.find((r) => r.category === selectedFreq) : null;
```

- [ ] **Step 2: Reemplazar el header y el cuerpo de la card de Frecuencia**

Buscar el bloque de la card de Frecuencia (aprox. líneas 42-50):

```tsx
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <h3 className="text-sm font-bold text-text mb-3 flex items-center gap-1.5">
          Frecuencia por categoría
          <InfoHint label="Qué muestra">
            Cuántas veces gastaste en cada categoría en el período. Más intenso = más movimientos.
          </InfoHint>
        </h3>
        <FrequencyHeatmap />
      </div>
```

Reemplazarlo por (header con toggle idéntico al de la card Distribución + ranking):

```tsx
      <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-text flex items-center gap-1.5">
            Frecuencia por categoría
            <InfoHint label="Qué muestra">
              En qué categorías gastás más seguido. Cuenta la cantidad de movimientos, no el monto.
              Tocá una categoría para ver el detalle.
            </InfoHint>
          </h3>
          <button
            onClick={() => setFreqScope(freqScope === 'current_month' ? 'global' : 'current_month')}
            aria-label="Cambiar entre mes actual e histórico"
            className="shrink-0 rounded-full border-[1.5px] border-border bg-surface-2 px-3 py-2 text-[11px] font-bold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <span className={freqScope === 'current_month' ? 'text-accent' : 'text-muted'}>Mes</span>
            <span className="text-faint mx-1">·</span>
            <span className={freqScope === 'global' ? 'text-accent' : 'text-muted'}>Histórico</span>
          </button>
        </div>
        <CategoryFrequencyRanking key={freqScope} scope={freqScope} onSelect={setSelectedFreq} />
      </div>
```

- [ ] **Step 3: Agregar el modal de detalle de frecuencia**

Buscar el `<Modal>` existente (el del treemap, aprox. líneas 53-61) y, justo después de su cierre `</Modal>`, agregar un segundo modal:

```tsx
      <Modal isOpen={!!freqItem} onClose={() => setSelectedFreq(null)} title={selectedFreq ? `${freqItem?.emoji ?? ''} ${selectedFreq}`.trim() : ''}>
        {freqItem && (
          <div className="text-center py-4">
            <p className="text-xs text-muted uppercase tracking-wider mb-1">
              {freqScope === 'global' ? 'Frecuencia histórica' : 'Frecuencia del mes'}
            </p>
            <p className="font-poster tnum text-3xl text-text">{freqItem.count}x</p>
            <p className="text-sm text-muted mt-2">movimientos</p>
            <div className="mt-4 flex justify-center gap-6 text-left">
              <div>
                <p className="text-[11px] text-muted uppercase tracking-wider">Total</p>
                <p className="font-sans tnum text-base font-bold text-text">{formatCurrency(toDisplay(freqItem.total))}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted uppercase tracking-wider">Promedio</p>
                <p className="font-sans tnum text-base font-bold text-text">{formatCurrency(toDisplay(freqItem.avg))}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
```

- [ ] **Step 4: Lint + build**

Run: `npm run lint`
Expected: sin errores.

Run: `npm run build`
Expected: build exitoso, sin referencias rotas a `FrequencyHeatmap` ni `getCategoryFrequency`.

- [ ] **Step 5: Verificación visual en browser**

Run: `npm run dev` y abrir el dashboard → tab "Categorías".
Verificar:
- La card "Frecuencia por categoría" muestra un ranking de barras horizontales con `{count}x` legible.
- El toggle Mes/Histórico cambia el ranking.
- Tocar una fila abre el modal con count, total y promedio.
- Con teclado: Tab llega a cada fila, Enter/Space abre el modal.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/analysis/tab-categorias.tsx
git commit -m "feat(analysis): toggle Mes/Historico y modal de detalle en card Frecuencia

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Getter `getCategoryFrequencyRanking` con scope → Task 1. ✓
- Componente ranking accesible (lista, botones, aria-label, focus-visible, tnum, ≥44px) → Task 2. ✓
- Modal de detalle (count, total, avg, label scope) → Task 3 Step 3. ✓
- Toggle Mes/Histórico → Task 3 Step 2. ✓
- Eliminar heatmap + getter viejo → Task 2 Step 2, Task 1 Step 2. ✓
- Criterios de aceptación (lint/build pasan, archivos viejos no existen) → Task 3 Step 4. ✓

**Placeholder scan:** sin TBD/TODO; todo el código está completo.

**Type consistency:** `getCategoryFrequencyRanking(scope)` devuelve `{ category, emoji, count, total, avg }` en Task 1, consumido con esos mismos nombres en Task 2 (`row.category/emoji/count`) y Task 3 (`freqItem.count/total/avg`). Coherente. `freqRanking` se calcula en Task 3 Step 1 y se usa en el mismo step para `freqItem`.
