# "Lo que se viene" (próximos vencimientos de tarjeta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconvertir la card del home "Consumo tarjeta próximo mes" (total abstracto) en "Lo que se viene", una agenda concreta de próximos vencimientos de tarjeta con fecha y monto por tarjeta, alimentada por un getter cycle-based.

**Architecture:** Toda la lógica vive en un getter nuevo del store `getUpcomingCardDueDates()` (reemplaza a `getNextMonthCardExposure()`), que por cada tarjeta de crédito con ciclo calcula el **próximo** resumen (+1 ciclo sobre el vigente que cubre el hero) reutilizando el helper existente `getCreditCycleDates` y la regla de pertenencia por `t.date`. Un componente cliente nuevo `UpcomingCardDueDatesCard` renderiza filas tappeables (navegan a la Billetera). La card sigue siendo puramente informativa: no altera ningún cálculo de Disponible Real.

**Tech Stack:** Next.js App Router (Client Component), Zustand (`useFinanceStore`), TypeScript, date-fns, Vitest.

## Global Constraints

- **Tokens semánticos siempre** — nunca hex ni colores Tailwind crudos (`emerald-*`, `slate-*`, etc.). Layout: `bg-surface`, `bg-bg-2`, `text-text`, `text-muted`, `text-faint`, `border-border`.
- **Bordes:** `border-[1.5px] border-border` (nunca `border` a secas).
- **Tipografía:** montos con `font-poster tnum`; labels/descripciones con `font-sans`.
- **Moneda:** USD **no se convierte** a ARS; usar `formatUsd` para USD y `formatCurrency` para ARS (consistente con `getPaymentMethodStatus` / `PaymentMethodDetailModal`).
- **Client Components:** prohibido fetch directo; solo `useFinanceStore`. Prohibido `useEffect` para fetching.
- **Lógica de negocio en el store, NO en componentes.**
- **Fechas:** usar `parseLocalDate()` de `@/lib/utils/dates` (evita bug UTC). Nunca `new Date(string)`.
- **Tests:** en `src/**/__tests__/`, con `useFinanceStore.setState` para sembrar y `vi.useFakeTimers` + `vi.setSystemTime` para fijar `now`.
- **Invariante:** la card no debe modificar `getRealAvailableBalance`/`getGlobalBalance` ni ninguna analítica; es de solo lectura.
- **Imports absolutos:** `@/components/...`, `@/lib/...`.

---

### Task 1: Getter `getUpcomingCardDueDates` en el store (TDD)

Agrega el getter nuevo **sin** borrar el viejo todavía (para que el componente actual siga compilando). El borrado del viejo va en la Task 3.

**Files:**
- Modify: `src/lib/store/financeStore.ts` (interfaz `FinanceState` ~línea 259; implementación, insertar junto a `getNextMonthCardExposure` ~línea 1738)
- Test: `src/lib/store/__tests__/disponible-real.test.ts` (agregar `describe('getUpcomingCardDueDates')`)

**Interfaces:**
- Consumes: `getCreditCycleDates(method, now)` → `{ nextClosingDate: Date; nextPaymentDate: Date } | undefined` (helper de módulo, ya existe ~línea 539); `sameMonthYear(a, b)` (~línea 527); `parseLocalDate` (de `@/lib/utils/dates`); `addMonths` (ya importado de date-fns).
- Produces:
  ```ts
  getUpcomingCardDueDates: () => {
    items: Array<{ methodId: number; name: string; dueDate: Date; amountArs: number; amountUsd: number }>;
    totalArs: number;
    totalUsd: number;
  };
  ```

- [ ] **Step 1: Agregar `afterEach` al import de vitest en el test**

En `src/lib/store/__tests__/disponible-real.test.ts`, línea 1:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
```

- [ ] **Step 2: Escribir el bloque de tests que falla**

Agregar al final de `src/lib/store/__tests__/disponible-real.test.ts`:

```ts
describe('getUpcomingCardDueDates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 3)); // 3 jul 2026: Visa (cierra 20 / vence 5) => ciclo vigente vence 5 jul, próximo vence 5 ago
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lista el próximo resumen por tarjeta con fecha de vencimiento y monto', () => {
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      transactions: [
        { id: 1, type: 'expense', amount: -8000, date: '2026-08-05', periodDate: '2026-08-05', payment_method_id: 1, installment_plan_id: 3, recurring_plan_id: null },
        { id: 2, type: 'expense', amount: -15000, date: '2026-08-05', periodDate: '2026-08-05', payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getUpcomingCardDueDates();
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Visa');
    expect(res.items[0].amountArs).toBe(23000);
    expect(res.items[0].amountUsd).toBe(0);
    expect(res.items[0].dueDate.getMonth()).toBe(7); // agosto
    expect(res.items[0].dueDate.getFullYear()).toBe(2026);
    expect(res.totalArs).toBe(23000);
  });

  it('excluye el ciclo vigente: no duplica el hero', () => {
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      transactions: [
        // vence 5 jul => ciclo vigente (lo cuenta el hero), NO esta card
        { id: 1, type: 'expense', amount: -10000, date: '2026-07-05', periodDate: '2026-07-05', payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getUpcomingCardDueDates();
    expect(res.items).toHaveLength(0);
    expect(res.totalArs).toBe(0);
  });

  it('desglosa ARS y USD sin convertir', () => {
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      transactions: [
        { id: 1, type: 'expense', amount: -60000, original_currency: 'USD', original_amount: 50, date: '2026-08-05', periodDate: '2026-08-05', payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
        { id: 2, type: 'expense', amount: -20000, date: '2026-08-05', periodDate: '2026-08-05', payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getUpcomingCardDueDates();
    expect(res.items[0].amountUsd).toBe(50);
    expect(res.items[0].amountArs).toBe(20000);
    expect(res.totalUsd).toBe(50);
    expect(res.totalArs).toBe(20000);
  });

  it('ignora medios que no son crédito con ciclo', () => {
    seed({
      paymentMethods: [{ id: 2, name: 'Efectivo', type: 'cash', default_closing_day: null, default_payment_day: null }],
      transactions: [
        { id: 1, type: 'expense', amount: -9999, date: '2026-08-05', periodDate: '2026-08-05', payment_method_id: 2, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getUpcomingCardDueDates();
    expect(res.items).toHaveLength(0);
  });

  it('suma mensualidades adheridas al medio para el próximo resumen', () => {
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      recurringPlans: [
        { id: 9, description: 'Netflix', amount: 6500, is_active: true, payment_method_id: 1 },
      ],
      transactions: [],
    });
    const res = useFinanceStore.getState().getUpcomingCardDueDates();
    expect(res.items).toHaveLength(1);
    expect(res.items[0].amountArs).toBe(6500);
  });

  it('sin consumo futuro cargado no genera items', () => {
    seed({
      paymentMethods: [{ id: 1, name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 5 }],
      transactions: [
        { id: 1, type: 'expense', amount: -5000, date: '2026-07-05', periodDate: '2026-07-05', payment_method_id: 1, installment_plan_id: null, recurring_plan_id: null },
      ],
    });
    const res = useFinanceStore.getState().getUpcomingCardDueDates();
    expect(res.items).toHaveLength(0);
    expect(res.totalArs).toBe(0);
    expect(res.totalUsd).toBe(0);
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/store/__tests__/disponible-real.test.ts -t getUpcomingCardDueDates`
Expected: FAIL — `getUpcomingCardDueDates is not a function`.

- [ ] **Step 4: Agregar la firma a la interfaz `FinanceState`**

En `src/lib/store/financeStore.ts`, inmediatamente después del bloque de `getNextMonthCardExposure` de la interfaz (termina en `};` ~línea 263), insertar:

```ts
  getUpcomingCardDueDates: () => {
    items: Array<{
      methodId: number;
      name: string;
      dueDate: Date;
      amountArs: number;
      amountUsd: number;
    }>;
    totalArs: number;
    totalUsd: number;
  };
```

- [ ] **Step 5: Implementar el getter**

En `src/lib/store/financeStore.ts`, inmediatamente después de la implementación de `getNextMonthCardExposure` (el `},` que cierra ~línea 1738), insertar:

```ts
  getUpcomingCardDueDates: () => {
    const { transactions, recurringPlans, paymentMethods } = get();
    const now = new Date();

    const items: Array<{
      methodId: number;
      name: string;
      dueDate: Date;
      amountArs: number;
      amountUsd: number;
    }> = [];

    for (const method of paymentMethods) {
      // Solo crédito con ciclo configurado.
      const current = getCreditCycleDates(method, now);
      if (!current) continue;

      // El resumen SIGUIENTE al ciclo vigente = +1 mes exacto sobre el vencimiento
      // actual. El ciclo vigente lo cubre el hero (pendingCardTotal); acá miramos
      // solo el que todavía no vence.
      const dueDate = addMonths(current.nextPaymentDate, 1);

      let amountArs = 0;
      let amountUsd = 0;
      const recurringInCycle = new Set<number>();

      for (const t of transactions) {
        if (t.payment_method_id !== method.id) continue;
        // Pertenencia al resumen: t.date (en crédito ya es el vencimiento calculado)
        // cae en el mismo mes/año que dueDate.
        if (!sameMonthYear(parseLocalDate(t.date), dueDate)) continue;

        if (t.type === 'expense') {
          if (t.recurring_plan_id) recurringInCycle.add(t.recurring_plan_id);
          if (t.original_currency === 'USD' && t.original_amount) {
            amountUsd += Math.abs(Number(t.original_amount));
          } else {
            amountArs += Math.abs(Number(t.amount));
          }
        } else if (t.type === 'income') {
          // Reintegros del mismo ciclo restan (se asumen ARS, igual que getPaymentMethodStatus).
          amountArs -= Number(t.amount);
        }
      }

      // Mensualidades adheridas al medio aún sin transacción en ese resumen: se sumarán.
      for (const p of recurringPlans) {
        if (p.payment_method_id !== method.id || !p.is_active) continue;
        if (recurringInCycle.has(p.id)) continue;
        if (p.currency === 'USD' && p.original_amount) {
          amountUsd += Math.abs(Number(p.original_amount));
        } else {
          amountArs += Math.abs(Number(p.amount));
        }
      }

      if (amountArs <= 0 && amountUsd <= 0) continue;

      items.push({
        methodId: method.id,
        name: method.name,
        dueDate,
        amountArs: Math.max(amountArs, 0),
        amountUsd,
      });
    }

    items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    return {
      items,
      totalArs: items.reduce((acc, it) => acc + it.amountArs, 0),
      totalUsd: items.reduce((acc, it) => acc + it.amountUsd, 0),
    };
  },
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/store/__tests__/disponible-real.test.ts -t getUpcomingCardDueDates`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/disponible-real.test.ts
git commit -m "feat(store): getUpcomingCardDueDates (próximos vencimientos de tarjeta, cycle-based)"
```

---

### Task 2: Componente `UpcomingCardDueDatesCard` + wiring en el home

Crea el componente nuevo, lo cablea en `page.tsx`, ajusta el skeleton y elimina el componente viejo. El getter viejo sigue existiendo (se borra en Task 3), así que nada más se rompe.

**Files:**
- Create: `src/components/dashboard/upcoming-card-due-dates-card.tsx`
- Delete: `src/components/dashboard/next-month-card-exposure-card.tsx`
- Modify: `src/app/page.tsx:22` (import) y `src/app/page.tsx:138` (uso)
- Modify: `src/components/ui/skeletons.tsx:71` (nombre función) y `:166` (uso)

**Interfaces:**
- Consumes: `getUpcomingCardDueDates()` (de Task 1); `formatCurrency`, `formatUsd`, `cn` (de `@/lib/utils`); `useRouter` (de `next/navigation`); `format` + `es` (date-fns); `InfoHint` (de `@/components/ui/info-hint`).
- Produces: `export function UpcomingCardDueDatesCard({ className }: { className?: string })`.

- [ ] **Step 1: Crear el componente**

Crear `src/components/dashboard/upcoming-card-due-dates-card.tsx`:

```tsx
'use client';

import { CalendarClock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { InfoHint } from '@/components/ui/info-hint';
import { useFinanceStore } from '@/lib/store/financeStore';
import { cn, formatCurrency, formatUsd } from '@/lib/utils';

export function UpcomingCardDueDatesCard({ className }: { className?: string }) {
  const router = useRouter();
  const getUpcomingCardDueDates = useFinanceStore((s) => s.getUpcomingCardDueDates);
  const { items, totalArs, totalUsd } = getUpcomingCardDueDates();

  if (items.length === 0) return null;

  const mixedCurrency = totalArs > 0 && totalUsd > 0;

  return (
    <div className={cn('rounded-2xl bg-surface border-[1.5px] border-border p-4', className)}>
      <div className="mb-3">
        <h3 className="text-sm font-bold text-text inline-flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4 text-muted" />
          Lo que se viene
          <InfoHint label="Qué es lo que se viene">
            El próximo resumen de cada tarjeta: el que todavía no vence. Te muestra cuándo lo vas
            a pagar y cuánto llevás cargado. No toca tu plata de hoy y sigue sumando a medida que
            uses la tarjeta.
          </InfoHint>
        </h3>
        <p className="text-[11px] text-muted mt-0.5">Próximos resúmenes de tarjeta</p>
      </div>

      <ul className="space-y-2.5">
        {items.map((it) => (
          <li key={it.methodId}>
            <button
              type="button"
              onClick={() => router.push('/ajustes/medios')}
              aria-label={`Ver detalle de ${it.name}`}
              className="w-full flex items-center justify-between gap-3 text-left rounded-xl -mx-1 px-1 py-1 hover:bg-bg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-text truncate">{it.name}</span>
                <span className="block text-[11px] text-muted">
                  Vence {format(it.dueDate, "d 'de' MMM", { locale: es })}
                </span>
              </span>
              <span className="font-poster tnum text-[15px] text-text shrink-0 text-right">
                {it.amountUsd > 0 && it.amountArs === 0
                  ? formatUsd(it.amountUsd)
                  : formatCurrency(it.amountArs)}
                {it.amountUsd > 0 && it.amountArs > 0 && (
                  <span className="block text-[11px] font-sans text-muted">{formatUsd(it.amountUsd)}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 pt-3 border-t border-border flex items-baseline justify-between">
        <span className="text-[11px] text-muted">Total</span>
        <span className="text-right">
          <span className="font-poster tnum text-2xl text-text">
            {!mixedCurrency && totalUsd > 0 ? formatUsd(totalUsd) : formatCurrency(totalArs)}
          </span>
          {mixedCurrency && (
            <span className="block font-poster tnum text-[13px] text-muted">+ {formatUsd(totalUsd)}</span>
          )}
        </span>
      </div>

      <p className="mt-3 text-[11px] text-faint">
        Sigue sumando a medida que uses la tarjeta.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Cablear en `page.tsx`**

En `src/app/page.tsx` línea 22, reemplazar el import:

```tsx
import { UpcomingCardDueDatesCard } from '@/components/dashboard/upcoming-card-due-dates-card';
```

En `src/app/page.tsx` línea 137-138, reemplazar el comentario + uso (mantiene el `className` del rail):

```tsx
        {/* Lo que se viene — rail (col 3). Hijo directo: si retorna null, la celda colapsa. */}
        <UpcomingCardDueDatesCard className="lg:col-start-3" />
```

- [ ] **Step 3: Renombrar el skeleton para consistencia**

En `src/components/ui/skeletons.tsx` línea 71, renombrar la función:

```tsx
function UpcomingCardDueDatesCardSkeleton() {
```

En `src/components/ui/skeletons.tsx` línea 166, actualizar el uso:

```tsx
              <UpcomingCardDueDatesCardSkeleton />
```

- [ ] **Step 4: Borrar el componente viejo**

```bash
git rm src/components/dashboard/next-month-card-exposure-card.tsx
```

- [ ] **Step 5: Lint + build (verificar que no quedan referencias colgadas)**

Run: `npm run lint`
Expected: sin errores nuevos.

Run: `npm run build`
Expected: build OK (no quedan imports a `NextMonthCardExposureCard`).

- [ ] **Step 6: Verificación visual manual**

Run: `npm run dev` y abrir el home.
Verificar:
- La card muestra el título "Lo que se viene" + subtítulo "Próximos resúmenes de tarjeta".
- Una fila por tarjeta con nombre + "Vence D de MMM" + monto; total al pie + "Sigue sumando…".
- Tocar una fila navega a `/ajustes/medios`.
- Si no hay consumo futuro cargado, la card no aparece (la celda del rail colapsa).

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/upcoming-card-due-dates-card.tsx src/app/page.tsx src/components/ui/skeletons.tsx
git commit -m "feat(home): card 'Lo que se viene' (agenda de próximos vencimientos de tarjeta)"
```

---

### Task 3: Eliminar el getter viejo `getNextMonthCardExposure` + docs

Ahora que nada lo referencia (componente ya migrado), se elimina el getter viejo, su firma, sus tests, y se actualiza `CLAUDE.md`.

**Files:**
- Modify: `src/lib/store/financeStore.ts` (borrar firma ~línea 259-263 e implementación ~línea 1703-1738)
- Modify: `src/lib/store/__tests__/disponible-real.test.ts` (borrar `describe('getNextMonthCardExposure')`, ~línea 277-341)
- Modify: `CLAUDE.md` (entrada del getter en la lista del store)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada nuevo (solo eliminación + docs).

- [ ] **Step 1: Borrar la firma de la interfaz**

En `src/lib/store/financeStore.ts`, eliminar el bloque de la interfaz `FinanceState`:

```ts
  getNextMonthCardExposure: () => {
    nextCyclePurchases: number;
    futureInstallments: number;
    total: number;
  };
```

- [ ] **Step 2: Borrar la implementación**

En `src/lib/store/financeStore.ts`, eliminar la implementación completa de `getNextMonthCardExposure: () => { ... },` (el bloque que empieza en `getNextMonthCardExposure: () => {` y termina en su `},`, justo antes de `getUpcomingCardDueDates`).

- [ ] **Step 3: Borrar los tests del getter viejo**

En `src/lib/store/__tests__/disponible-real.test.ts`, eliminar el bloque completo `describe('getNextMonthCardExposure', () => { ... });`.

- [ ] **Step 4: Correr la suite completa**

Run: `npx vitest run src/lib/store/__tests__/disponible-real.test.ts`
Expected: PASS, sin referencias a `getNextMonthCardExposure`.

- [ ] **Step 5: Build para confirmar que no hay referencias colgadas**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 6: Actualizar `CLAUDE.md`**

En `CLAUDE.md`, en la lista de getters del store, reemplazar la línea de `getNextMonthCardExposure()` por:

```markdown
- `getUpcomingCardDueDates()` – "Lo que se viene": por cada tarjeta de **crédito** con ciclo, el **próximo resumen** (el que aún no vence; +1 ciclo sobre el vigente, que cubre el hero). Devuelve `items:[{ methodId, name, dueDate, amountArs, amountUsd }]` ordenado por fecha + `totalArs`/`totalUsd`. Pertenencia por ciclo (misma regla que `getPaymentMethodStatus`); USD sin convertir. No toca el número central. La card (`UpcomingCardDueDatesCard`) es tappeable → navega a `/ajustes/medios`.
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/disponible-real.test.ts CLAUDE.md
git commit -m "refactor(store): eliminar getNextMonthCardExposure (reemplazado por getUpcomingCardDueDates)"
```

---

## Notas de implementación

- **Por qué `addMonths(current.nextPaymentDate, 1)` y no una segunda llamada a `getCreditCycleDates`:** los ciclos son mensuales, así que el próximo vencimiento es exactamente un mes después del vigente. Evita una segunda llamada y no requiere importar `addDays`. Ejemplo (Visa cierra 20 / vence 5, hoy 3 jul): ciclo vigente vence 5 jul → `dueDate` = 5 ago.
- **Tap MVP → `/ajustes/medios`:** abrir `PaymentMethodDetailModal` in-place requeriría ensamblar `status`+`history`+`subscriptions` (como hace `InstitutionalCard`) y ese modal muestra el ciclo **vigente**, no el próximo. Para el MVP el tap navega a la Billetera, donde vive el detalle de cada tarjeta. Deep-link que auto-abra el detalle de la tarjeta y muestre el desglose del próximo resumen queda como nice-to-have (fuera de alcance, ver spec §3).
- **Mensualidades adheridas:** se incluyen en el próximo resumen (mismo criterio que `getPaymentMethodStatus`), porque son cargos futuros conocidos. Una tarjeta con solo una mensualidad adherida (sin compras/cuotas cargadas) aparecerá con ese monto — comportamiento deseado para "lo que se viene".

## Self-Review

**Spec coverage:**
- Semántica cycle-based + complementaria al hero → Task 1 (getter) + nota `addMonths`. ✓
- Contenido UI (filas nombre/fecha/monto, total, copy, estado vacío `null`) → Task 2 componente. ✓
- Moneda ARS/USD sin convertir, totales separados si hay mezcla → Task 1 (desglose) + Task 2 (render `mixedCurrency`). ✓
- Interacción tappeable → Task 2 (`router.push('/ajustes/medios')`) + nota de alcance. ✓
- Título "Lo que se viene" / subtítulo → Task 2. ✓
- Store: reemplazo del getter → Task 1 (add) + Task 3 (remove). ✓
- Tests actualizados → Task 1 (nuevos) + Task 3 (borrado del viejo describe). ✓
- Docs `CLAUDE.md` → Task 3 Step 6. ✓
- Invariante Disponible Real intacto → getter de solo lectura, no toca `getRealAvailableBalance`. ✓

**Placeholder scan:** sin TBD/TODO; todo el código está completo. ✓

**Type consistency:** `getUpcomingCardDueDates` retorna `{ items: [{ methodId, name, dueDate, amountArs, amountUsd }], totalArs, totalUsd }` idéntico en interfaz (Task 1 Step 4), implementación (Step 5), tests (Step 2) y componente (Task 2 Step 1). ✓
