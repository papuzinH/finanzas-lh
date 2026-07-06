# Categorías con tipo (Ingreso / Gasto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un campo `type: 'income' | 'expense'` a `categories` y usarlo para separar categorías de ingreso y gasto en toda la app (selectores de movimientos, página de categorías, presupuestos e IA).

**Architecture:** Migración SQL con backfill automático por historial de transacciones + siembra de categorías de ingreso por defecto. El resto es filtrado: cada punto que hoy muestra `categories` sin distinción pasa a filtrar por `type` antes de renderizar o de pasarle la lista a un getter del store.

**Tech Stack:** Next.js App Router, Supabase (Postgres), Zustand, Zod, react-hook-form, Vitest.

## Global Constraints

- Tokens semánticos de UI siempre (`bg-surface`, `text-muted`, etc.) — nunca hex ni clases Tailwind de color crudas.
- Bordes siempre `border-[1.5px] border-border`.
- Toda lógica de negocio (filtros, sumas) vive en el store (`financeStore.ts`), no en componentes.
- `category_id` en `transactions`/`installment_plans`/`recurring_plans` sigue siendo `string | null` — no cambia.
- Migraciones SQL: aplicar primero en Supabase DEV, verificar con `npm run dev`, y aplicar en PROD **antes** de mergear a `master` (regla del proyecto, skill `migrar-schema`).
- `npm test` tiene fallas preexistentes ajenas en `dates.test.ts` y en 4 archivos de `src/lib/ai/__tests__/` (scripts con mini test-runner casero, Vitest los reporta como "No test suite found") — no forman parte de este trabajo, no deben empeorar ni intentar arreglarse acá.

---

### Task 1: Migración SQL + tipos + schema Zod

**Files:**
- Create: `supabase/migrations/20260706_add_type_to_categories.sql`
- Modify: `src/types/database.ts:12-48` (bloque `categories`)
- Modify: `src/lib/schemas/category.ts`

**Interfaces:**
- Produces: `Category.type: 'income' | 'expense'` (usado por todas las tareas siguientes), `categorySchema` con campo `type: z.enum(['income', 'expense'])`.

- [ ] **Step 1: Escribir la migración SQL**

Crear `supabase/migrations/20260706_add_type_to_categories.sql`:

```sql
-- ============================================================
-- MIGRACION: Tipo de categoria (ingreso / gasto)
-- Fecha: 2026-07-06
-- Descripcion: Agrega categories.type ('income' | 'expense') para separar
-- categorias de ingreso y gasto. Backfillea las categorias existentes por
-- su historial de transacciones (mayoria income -> income, si no, expense)
-- y siembra 2 categorias de ingreso por defecto para usuarios que queden
-- sin ninguna, para que el selector de "Ingreso" nunca este vacio.
-- ============================================================

-- 1. Columna nullable
ALTER TABLE categories ADD COLUMN IF NOT EXISTS type TEXT;

-- 2. Backfill por historial de transacciones
UPDATE categories c SET type = sub.inferred_type
FROM (
  SELECT
    category_id,
    CASE WHEN SUM(CASE WHEN type = 'income' THEN 1 ELSE 0 END)
            > SUM(CASE WHEN type = 'expense' THEN 1 ELSE 0 END)
         THEN 'income' ELSE 'expense' END AS inferred_type
  FROM transactions
  WHERE category_id IS NOT NULL
  GROUP BY category_id
) sub
WHERE c.id = sub.category_id;

UPDATE categories SET type = 'expense' WHERE type IS NULL;

-- 3. Sembrar 2 categorías de ingreso por defecto para usuarios sin ninguna
INSERT INTO categories (user_id, name, emoji, description, is_system, type)
SELECT u.id, v.name, v.emoji, v.description, false, 'income'
FROM users u
CROSS JOIN (VALUES
  ('Sueldo', '💰', 'Sueldo, honorarios, pagos fijos de trabajo en relación de dependencia o autónomo.'),
  ('Freelance / Otros ingresos', '📈', 'Trabajos independientes, ventas, regalos en dinero y cualquier otro ingreso no fijo.')
) AS v(name, emoji, description)
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.type = 'income'
);

-- 4. Constraint final
ALTER TABLE categories ALTER COLUMN type SET NOT NULL;
ALTER TABLE categories ADD CONSTRAINT categories_type_check CHECK (type IN ('income', 'expense'));
```

- [ ] **Step 2: Aplicar la migración en Supabase DEV**

Abrir el SQL Editor del proyecto Supabase DEV (el que apunta `.env.local`) y ejecutar el contenido del archivo de arriba. Verificar en el dashboard:
- La tabla `categories` tiene la columna `type` (`text`, `not null`).
- No hay filas con `type` nulo: `SELECT count(*) FROM categories WHERE type IS NULL;` → debe devolver `0`.
- Cada usuario tiene al menos una categoría `income`: `SELECT user_id FROM categories WHERE type='income' GROUP BY user_id;` incluye a todos los `user_id` de `SELECT DISTINCT user_id FROM categories;`.

- [ ] **Step 3: Actualizar `src/types/database.ts`**

Reemplazar el bloque `categories` (líneas 12-48):

```ts
      categories: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          emoji: string | null
          is_system: boolean | null
          type: 'income' | 'expense'
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          emoji?: string | null
          is_system?: boolean | null
          type: 'income' | 'expense'
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          emoji?: string | null
          is_system?: boolean | null
          type?: 'income' | 'expense'
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
```

- [ ] **Step 4: Actualizar `src/lib/schemas/category.ts`**

Reemplazar el archivo completo:

```ts
import { z } from 'zod'

export const categorySchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(50, 'El nombre es muy largo'),
  emoji: z.string().min(1, 'El emoji es obligatorio'),
  description: z.string().max(300, 'La descripción es muy larga').optional(),
  type: z.enum(['income', 'expense']),
})

export type CategoryFormValues = z.infer<typeof categorySchema>
```

- [ ] **Step 5: Verificar que el proyecto compila**

Run: `npm run build`
Expected: falla en los componentes que todavía no proveen `type` al crear/editar una categoría (`create-category-dialog.tsx`, `category-card-actions.tsx`). Esto es esperado — se corrige en las Tasks 3 y 4. Confirmar que el único error nuevo es "Property 'type' is missing" en esos dos archivos.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260706_add_type_to_categories.sql src/types/database.ts src/lib/schemas/category.ts
git commit -m "feat(categorias): agregar columna type (income/expense) con backfill"
```

---

### Task 2: Store — `getFrequentCategories`, `getExpensesByCategory`, `getCategoryBreakdown` con filtro de tipo

**Files:**
- Modify: `src/lib/store/financeStore.ts:238` (interfaz `getExpensesByCategory`)
- Modify: `src/lib/store/financeStore.ts:264-271` (interfaz `getCategoryBreakdown`)
- Modify: `src/lib/store/financeStore.ts:451` (interfaz `getFrequentCategories`)
- Modify: `src/lib/store/financeStore.ts:1533-1553` (implementación `getExpensesByCategory`)
- Modify: `src/lib/store/financeStore.ts:1759-1770` (implementación `getCategoryBreakdown`)
- Modify: `src/lib/store/financeStore.ts:2673-2698` (implementación `getFrequentCategories`)
- Test: `src/lib/store/__tests__/category-type-getters.test.ts` (nuevo)

**Interfaces:**
- Produces: `getExpensesByCategory(scope, type?: 'income' | 'expense' = 'expense')`, `getCategoryBreakdown(scope, type?: 'income' | 'expense' = 'expense')`, `getFrequentCategories(n?: number, type?: 'income' | 'expense')`. Todas las tasks de UI (3 a 8) consumen estas firmas.

**Nota importante:** `isExpenseInCurrentMonthScope` (línea 488) hace `if (t.type !== 'expense') return false` — está codeada solo para gastos (maneja ciclos de tarjeta de cuotas). Para `type === 'income'` en scope `current_month` **no** se puede reusar esa función; hay que usar el mismo criterio que ya usa `getMonthlyIncome()` (línea ~1796-1806): `isSameMonth(parseLocalDate(t.date), now)`.

- [ ] **Step 1: Escribir los tests (deben fallar)**

Crear `src/lib/store/__tests__/category-type-getters.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { format } from 'date-fns';
import { useFinanceStore } from '@/lib/store/financeStore';

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

const now = new Date();
const d = (day: number) => format(new Date(now.getFullYear(), now.getMonth(), day), 'yyyy-MM-dd');

describe('getFrequentCategories con filtro de tipo', () => {
  it('solo cuenta y devuelve categorías del tipo pedido', () => {
    seed({
      categories: [
        { id: 'c1', name: 'Comida', emoji: '🍔', type: 'expense' },
        { id: 'c2', name: 'Sueldo', emoji: '💰', type: 'income' },
        { id: 'c3', name: 'Freelance', emoji: '📈', type: 'income' },
      ],
      transactions: [
        { id: 1, type: 'expense', amount: -100, date: d(1), category_id: 'c1', installment_plan_id: null, payment_method_id: null },
        { id: 2, type: 'income', amount: 500, date: d(2), category_id: 'c2', installment_plan_id: null, payment_method_id: null },
        { id: 3, type: 'income', amount: 300, date: d(3), category_id: 'c2', installment_plan_id: null, payment_method_id: null },
      ],
    });

    const result = useFinanceStore.getState().getFrequentCategories(4, 'income');

    expect(result.every((c) => c.type === 'income')).toBe(true);
    expect(result.find((c) => c.id === 'c2')).toBeTruthy();
    expect(result.find((c) => c.id === 'c1')).toBeUndefined();
  });

  it('sin type pedido, mantiene el comportamiento previo (todas las categorías)', () => {
    seed({
      categories: [
        { id: 'c1', name: 'Comida', emoji: '🍔', type: 'expense' },
        { id: 'c2', name: 'Sueldo', emoji: '💰', type: 'income' },
      ],
      transactions: [
        { id: 1, type: 'expense', amount: -100, date: d(1), category_id: 'c1', installment_plan_id: null, payment_method_id: null },
      ],
    });

    const result = useFinanceStore.getState().getFrequentCategories(2);

    expect(result).toHaveLength(2);
  });
});

describe('getExpensesByCategory con parámetro type', () => {
  it('type="income" solo suma transacciones de ingreso, por categoría', () => {
    seed({
      categories: [
        { id: 'c1', name: 'Comida', emoji: '🍔', type: 'expense' },
        { id: 'c2', name: 'Sueldo', emoji: '💰', type: 'income' },
      ],
      transactions: [
        { id: 1, type: 'expense', amount: -100, date: d(1), category_id: 'c1', installment_plan_id: null, payment_method_id: null },
        { id: 2, type: 'income', amount: 500, date: d(2), category_id: 'c2', installment_plan_id: null, payment_method_id: null },
      ],
    });

    const result = useFinanceStore.getState().getExpensesByCategory('global', 'income');

    expect(result).toEqual({ Sueldo: 500 });
  });

  it('scope "current_month" con type="income" usa el mes calendario (no ciclo de tarjeta)', () => {
    seed({
      categories: [{ id: 'c2', name: 'Sueldo', emoji: '💰', type: 'income' }],
      transactions: [
        { id: 1, type: 'income', amount: 500, date: d(5), category_id: 'c2', installment_plan_id: null, payment_method_id: null },
      ],
    });

    const result = useFinanceStore.getState().getExpensesByCategory('current_month', 'income');

    expect(result).toEqual({ Sueldo: 500 });
  });

  it('sin type, el default sigue siendo "expense" (comportamiento previo)', () => {
    seed({
      categories: [{ id: 'c1', name: 'Comida', emoji: '🍔', type: 'expense' }],
      transactions: [
        { id: 1, type: 'expense', amount: -100, date: d(1), category_id: 'c1', installment_plan_id: null, payment_method_id: null },
        { id: 2, type: 'income', amount: 500, date: d(2), category_id: 'c1', installment_plan_id: null, payment_method_id: null },
      ],
    });

    const result = useFinanceStore.getState().getExpensesByCategory('global');

    expect(result).toEqual({ Comida: 100 });
  });
});

describe('getCategoryBreakdown con parámetro type', () => {
  it('reenvía el type a getExpensesByCategory', () => {
    seed({
      categories: [{ id: 'c2', name: 'Sueldo', emoji: '💰', type: 'income' }],
      transactions: [
        { id: 1, type: 'income', amount: 500, date: d(2), category_id: 'c2', installment_plan_id: null, payment_method_id: null },
      ],
    });

    const result = useFinanceStore.getState().getCategoryBreakdown('global', 'income');

    expect(result.total).toBe(500);
    expect(result.items).toEqual([{ name: 'Sueldo', value: 500, percentage: 100 }]);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/lib/store/__tests__/category-type-getters.test.ts`
Expected: FAIL — `getFrequentCategories`/`getExpensesByCategory`/`getCategoryBreakdown` no aceptan un segundo argumento `type` (los resultados no filtran por tipo).

- [ ] **Step 3: Actualizar las 3 firmas en la interfaz del store**

En `src/lib/store/financeStore.ts:238`, reemplazar:

```ts
  getExpensesByCategory: (scope: 'global' | 'current_month') => Record<string, number>;
```

por:

```ts
  getExpensesByCategory: (scope: 'global' | 'current_month', type?: 'income' | 'expense') => Record<string, number>;
```

En `src/lib/store/financeStore.ts:264-271`, reemplazar:

```ts
  getCategoryBreakdown: (scope: 'global' | 'current_month') => {
    total: number;
    items: Array<{
      name: string;
      value: number;
      percentage: number;
    }>;
  };
```

por:

```ts
  getCategoryBreakdown: (scope: 'global' | 'current_month', type?: 'income' | 'expense') => {
    total: number;
    items: Array<{
      name: string;
      value: number;
      percentage: number;
    }>;
  };
```

En `src/lib/store/financeStore.ts:451`, reemplazar:

```ts
  getFrequentCategories: (n?: number) => Category[];
```

por:

```ts
  getFrequentCategories: (n?: number, type?: 'income' | 'expense') => Category[];
```

- [ ] **Step 4: Implementar `getExpensesByCategory` con el parámetro `type`**

En `src/lib/store/financeStore.ts:1533-1553`, reemplazar:

```ts
  getExpensesByCategory: (scope) => {
    const { transactions, paymentMethods, categories } = get();
    const now = new Date();

    return transactions
      .filter((t) => {
        if (t.type !== 'expense' || t.card_payment_for) return false;

        if (scope === 'current_month') {
            return isExpenseInCurrentMonthScope(t, paymentMethods, now);
        }

        return true; // Global includes all history
      })
      .reduce((acc, t) => {
        const categoryObj = categories.find(c => c.id === t.category_id);
        const cat = categoryObj ? categoryObj.name : 'Otros';
        acc[cat] = (acc[cat] || 0) + Math.abs(Number(t.amount));
        return acc;
      }, {} as Record<string, number>);
  },
```

por:

```ts
  getExpensesByCategory: (scope, type = 'expense') => {
    const { transactions, paymentMethods, categories } = get();
    const now = new Date();

    return transactions
      .filter((t) => {
        if (t.type !== type || t.card_payment_for) return false;

        if (scope === 'current_month') {
          // isExpenseInCurrentMonthScope solo entiende gastos (ciclos de
          // tarjeta de cuotas); para ingresos se usa el mismo criterio de
          // mes calendario que getMonthlyIncome().
          return type === 'expense'
            ? isExpenseInCurrentMonthScope(t, paymentMethods, now)
            : isSameMonth(parseLocalDate(t.date), now);
        }

        return true; // Global includes all history
      })
      .reduce((acc, t) => {
        const categoryObj = categories.find(c => c.id === t.category_id);
        const cat = categoryObj ? categoryObj.name : 'Otros';
        acc[cat] = (acc[cat] || 0) + Math.abs(Number(t.amount));
        return acc;
      }, {} as Record<string, number>);
  },
```

- [ ] **Step 5: Implementar `getCategoryBreakdown` con el parámetro `type`**

En `src/lib/store/financeStore.ts:1759-1770`, reemplazar:

```ts
  getCategoryBreakdown: (scope) => {
    const expenses = get().getExpensesByCategory(scope);
    const total = Object.values(expenses).reduce((acc, val) => acc + val, 0);

    const items = Object.entries(expenses).map(([name, value]) => ({
      name,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0
    })).sort((a, b) => b.value - a.value);

    return { total, items };
  },
```

por:

```ts
  getCategoryBreakdown: (scope, type = 'expense') => {
    const expenses = get().getExpensesByCategory(scope, type);
    const total = Object.values(expenses).reduce((acc, val) => acc + val, 0);

    const items = Object.entries(expenses).map(([name, value]) => ({
      name,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0
    })).sort((a, b) => b.value - a.value);

    return { total, items };
  },
```

- [ ] **Step 6: Implementar `getFrequentCategories` con el parámetro `type`**

En `src/lib/store/financeStore.ts:2673-2698`, reemplazar:

```ts
  getFrequentCategories: (n = 4) => {
    const { transactions, categories } = get();

    const countMap: Record<string, number> = {};
    for (const t of transactions) {
      if (!t.category_id) continue;
      countMap[t.category_id] = (countMap[t.category_id] ?? 0) + 1;
    }

    const sorted = Object.entries(countMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id]) => categories.find((c) => c.id === id))
      .filter((c): c is Category => c != null);

    // Fallback for new users with no transaction history
    if (sorted.length < n) {
      const usedIds = new Set(sorted.map((c) => c.id));
      for (const c of categories) {
        if (sorted.length >= n) break;
        if (!usedIds.has(c.id)) sorted.push(c);
      }
    }

    return sorted;
  },
```

por:

```ts
  getFrequentCategories: (n = 4, type) => {
    const { transactions, categories } = get();
    const pool = type ? categories.filter((c) => c.type === type) : categories;
    const poolIds = new Set(pool.map((c) => c.id));

    const countMap: Record<string, number> = {};
    for (const t of transactions) {
      if (!t.category_id || !poolIds.has(t.category_id)) continue;
      countMap[t.category_id] = (countMap[t.category_id] ?? 0) + 1;
    }

    const sorted = Object.entries(countMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id]) => pool.find((c) => c.id === id))
      .filter((c): c is Category => c != null);

    // Fallback for new users with no transaction history
    if (sorted.length < n) {
      const usedIds = new Set(sorted.map((c) => c.id));
      for (const c of pool) {
        if (sorted.length >= n) break;
        if (!usedIds.has(c.id)) sorted.push(c);
      }
    }

    return sorted;
  },
```

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `npx vitest run src/lib/store/__tests__/category-type-getters.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/store/financeStore.ts src/lib/store/__tests__/category-type-getters.test.ts
git commit -m "feat(store): getExpensesByCategory/getCategoryBreakdown/getFrequentCategories aceptan type"
```

---

### Task 3: Crear categoría — toggle de tipo

**Files:**
- Modify: `src/components/categories/create-category-dialog.tsx`

**Interfaces:**
- Consumes: `categorySchema`/`CategoryFormValues` (Task 1, con `type` requerido), `createCategory` (`src/app/dashboard/categories/actions.ts`, sin cambios — ya hace spread de `validated.data`).

- [ ] **Step 1: Agregar `cn` a los imports**

En `src/components/categories/create-category-dialog.tsx`, después de la línea `import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';`, agregar:

```tsx
import { cn } from '@/lib/utils'
```

- [ ] **Step 2: Agregar `type` a los `defaultValues` del form**

Reemplazar:

```tsx
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      emoji: '💰',
      description: '',
    },
  })
```

por:

```tsx
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      emoji: '💰',
      description: '',
      type: 'expense',
    },
  })
```

- [ ] **Step 3: Agregar el toggle de tipo antes del bloque Emoji + Name**

Ubicar el bloque:

```tsx
            <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

              {/* ── Emoji + Name ── */}
              <div className="flex items-start gap-3">
```

Reemplazarlo por:

```tsx
            <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

              {/* ── Type Toggle ── */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
                      Tipo
                    </span>
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
                      {(['expense', 'income'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => field.onChange(t)}
                          className={cn(
                            'min-h-11 rounded-lg py-3 text-sm font-semibold transition-all',
                            'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
                            field.value === t
                              ? 'bg-accent text-accent-ink'
                              : 'text-muted hover:text-text'
                          )}
                        >
                          {t === 'expense' ? 'Gasto' : 'Ingreso'}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Emoji + Name ── */}
              <div className="flex items-start gap-3">
```

- [ ] **Step 4: Verificar manualmente**

Run: `npm run dev`
Ir a `/ajustes/categorias`, abrir "Crear categoría". Verificar que aparece el toggle Gasto/Ingreso arriba del nombre, que por defecto está en "Gasto", y que se puede crear una categoría de tipo "Ingreso" (queda guardada con `type: 'income'` — verificar en la tabla `categories` de Supabase DEV).

- [ ] **Step 5: Commit**

```bash
git add src/components/categories/create-category-dialog.tsx
git commit -m "feat(categorias): toggle de tipo al crear una categoría"
```

---

### Task 4: Editar categoría — toggle bloqueado si tiene dependencias + reasignación filtrada por tipo

**Files:**
- Modify: `src/components/categories/category-card-actions.tsx`

**Interfaces:**
- Consumes: `getCategoryDependencies(id)` (`src/app/categorias/actions.ts`, sin cambios, ya existe) → `{ transactions, installmentPlans, recurringPlans, total }`.

- [ ] **Step 1: Agregar `cn` a los imports**

Después de `import type { Category } from '@/types/database'`, agregar:

```tsx
import { cn } from '@/lib/utils'
```

- [ ] **Step 2: Agregar estado para las dependencias y cargarlo al abrir "Editar"**

Reemplazar:

```tsx
  // ── Edit state ──────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)

  const editForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category.name,
      emoji: category.emoji ?? '💰',
      description: category.description ?? '',
    },
  })

  const watchedEditName = editForm.watch('name')

  useEffect(() => {
    if (editOpen) {
      editForm.reset({
        name: category.name,
        emoji: category.emoji ?? '💰',
        description: category.description ?? '',
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, category])
```

por:

```tsx
  // ── Edit state ──────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)
  const [depsTotal, setDepsTotal] = useState<number | null>(null)

  const editForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category.name,
      emoji: category.emoji ?? '💰',
      description: category.description ?? '',
      type: category.type,
    },
  })

  const watchedEditName = editForm.watch('name')

  useEffect(() => {
    if (editOpen) {
      editForm.reset({
        name: category.name,
        emoji: category.emoji ?? '💰',
        description: category.description ?? '',
        type: category.type,
      })
      setDepsTotal(null)
      getCategoryDependencies(category.id).then((deps) => setDepsTotal(deps.total))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, category])
```

- [ ] **Step 3: Filtrar `otherCategories` (reasignación al borrar) por el mismo tipo**

Reemplazar:

```tsx
  const otherCategories = allCategories.filter((c) => c.id !== category.id)
```

por:

```tsx
  const otherCategories = allCategories.filter((c) => c.id !== category.id && c.type === category.type)
```

- [ ] **Step 4: Agregar el toggle de tipo al formulario de edición**

Ubicar, dentro del `<Dialog open={editOpen} ...>`, el bloque:

```tsx
              <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

                {/* ── Emoji + Name ── */}
                <div className="flex items-start gap-3">
```

Reemplazarlo por:

```tsx
              <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

                {/* ── Type Toggle ── */}
                <FormField
                  control={editForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
                        Tipo
                      </span>
                      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
                        {(['expense', 'income'] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            disabled={!!depsTotal}
                            onClick={() => field.onChange(t)}
                            className={cn(
                              'min-h-11 rounded-lg py-3 text-sm font-semibold transition-all',
                              'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
                              !!depsTotal && 'opacity-50 cursor-not-allowed',
                              field.value === t
                                ? 'bg-accent text-accent-ink'
                                : 'text-muted hover:text-text'
                            )}
                          >
                            {t === 'expense' ? 'Gasto' : 'Ingreso'}
                          </button>
                        ))}
                      </div>
                      {!!depsTotal && (
                        <p className="text-[11px] text-muted italic mt-1">
                          No se puede cambiar el tipo: esta categoría tiene {depsTotal} movimiento{depsTotal !== 1 ? 's' : ''} asociado{depsTotal !== 1 ? 's' : ''}.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* ── Emoji + Name ── */}
                <div className="flex items-start gap-3">
```

- [ ] **Step 5: Verificar manualmente**

Run: `npm run dev`
En `/ajustes/categorias`:
1. Editar una categoría **sin** movimientos asociados → el toggle debe estar habilitado y permitir cambiar el tipo.
2. Editar una categoría **con** movimientos asociados → el toggle debe verse deshabilitado (opacidad reducida) con el texto explicativo debajo.
3. Borrar una categoría con dependencias y elegir "Reasignar a otra categoría" → el selector solo debe listar categorías del mismo tipo que la borrada.

- [ ] **Step 6: Commit**

```bash
git add src/components/categories/category-card-actions.tsx
git commit -m "feat(categorias): bloquear cambio de tipo con dependencias y filtrar reasignacion por tipo"
```

---

### Task 5: Formularios de movimientos — filtrar categoría por el tipo elegido

**Files:**
- Modify: `src/components/transactions/transaction-form-fields.tsx:148-189` (`TypeToggle`)
- Modify: `src/components/transactions/create-transaction-dialog.tsx`
- Modify: `src/components/transactions/edit-transaction-dialog.tsx`

**Interfaces:**
- Consumes: `getFrequentCategories(n, type)` (Task 2), `categories: Category[]` con `type` (Task 1).
- Produces: `TypeToggle` gana un prop opcional `onTypeChange?: (type: 'expense' | 'income') => void`, invocado cuando el usuario clickea el toggle (no cuando `form.reset()` cambia el valor programáticamente).

**Nota de diseño:** para limpiar `category_id` al cambiar de tipo se necesita distinguir "el usuario tocó el toggle" de "el formulario se resetea al abrir el diálogo" (este último con `form.reset()`, que NO debe disparar la limpieza). Usar `form.watch('type')` + `useEffect` para detectarlo es propenso a una condición de carrera: cuando `form.reset()` corre dentro de un efecto, el efecto de "limpiar categoría" puede ejecutarse en el mismo commit leyendo un `watchedType` todavía desactualizado (closure del render anterior) y pisar el `category_id` recién seteado por el reset. Por eso la limpieza se dispara directamente desde el `onClick` del botón del toggle, no desde un efecto.

- [ ] **Step 1: `transaction-form-fields.tsx` — agregar `onTypeChange` a `TypeToggle`**

Reemplazar:

```tsx
interface TypeToggleProps<T extends FieldValues & BaseTransactionFields> {
  control: Control<T>;
}

export function TypeToggle<T extends FieldValues & BaseTransactionFields>({
  control,
}: TypeToggleProps<T>) {
  return (
    <FormField
      control={control}
      name={'type' as Path<T>}
      render={({ field }) => (
        <FormItem>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(['expense', 'income'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => field.onChange(type)}
                className={cn(
                  'min-h-11 rounded-lg py-3 text-sm font-semibold transition-all',
                  'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
                  field.value === type
                    ? 'bg-accent text-accent-ink'
                    : 'text-muted hover:text-text'
                )}
              >
                {type === 'expense' ? 'Gasto' : 'Ingreso'}
              </button>
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
```

por:

```tsx
interface TypeToggleProps<T extends FieldValues & BaseTransactionFields> {
  control: Control<T>;
  /** Se invoca solo cuando el usuario clickea el toggle (no cuando el valor cambia por form.reset()). */
  onTypeChange?: (type: 'expense' | 'income') => void;
}

export function TypeToggle<T extends FieldValues & BaseTransactionFields>({
  control,
  onTypeChange,
}: TypeToggleProps<T>) {
  return (
    <FormField
      control={control}
      name={'type' as Path<T>}
      render={({ field }) => (
        <FormItem>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(['expense', 'income'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  field.onChange(type);
                  onTypeChange?.(type);
                }}
                className={cn(
                  'min-h-11 rounded-lg py-3 text-sm font-semibold transition-all',
                  'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
                  field.value === type
                    ? 'bg-accent text-accent-ink'
                    : 'text-muted hover:text-text'
                )}
              >
                {type === 'expense' ? 'Gasto' : 'Ingreso'}
              </button>
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
```

- [ ] **Step 2: `create-transaction-dialog.tsx` — filtrar categorías por el tipo observado**

Reemplazar:

```tsx
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const { fetchAllData, categories, paymentMethods, getCategoryBudgetStatus, getFrequentCategories, getDefaultPaymentMethod, isInitialized } = useFinanceStore();

  const frequentCategories = getFrequentCategories(4);
  const defaultPmId = getDefaultPaymentMethod()?.id != null
    ? String(getDefaultPaymentMethod()!.id)
    : 'none';

  const form = useForm<CreateTransactionSchema>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      description: defaultValues?.description ?? '',
      amount: defaultValues?.amount ?? 0,
      date: todayString(),
      category_id: defaultValues?.category_id ?? '',
      type: defaultValues?.type ?? 'expense',
      payment_method_id: defaultPmId,
      currency: 'ARS',
      rate_pair: null,
      exchange_rate: null,
    },
  });

  const watchedAmount = form.watch('amount');
  const watchedDate = form.watch('date');
  const watchedCurrency = form.watch('currency');
  const watchedRatePair = form.watch('rate_pair');
  const getExchangeRate = useFinanceStore((s) => s.getExchangeRate);
```

por:

```tsx
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const { fetchAllData, categories, paymentMethods, getCategoryBudgetStatus, getFrequentCategories, getDefaultPaymentMethod, isInitialized } = useFinanceStore();

  const defaultPmId = getDefaultPaymentMethod()?.id != null
    ? String(getDefaultPaymentMethod()!.id)
    : 'none';

  const form = useForm<CreateTransactionSchema>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      description: defaultValues?.description ?? '',
      amount: defaultValues?.amount ?? 0,
      date: todayString(),
      category_id: defaultValues?.category_id ?? '',
      type: defaultValues?.type ?? 'expense',
      payment_method_id: defaultPmId,
      currency: 'ARS',
      rate_pair: null,
      exchange_rate: null,
    },
  });

  const watchedAmount = form.watch('amount');
  const watchedDate = form.watch('date');
  const watchedCurrency = form.watch('currency');
  const watchedRatePair = form.watch('rate_pair');
  const watchedType = form.watch('type');
  const getExchangeRate = useFinanceStore((s) => s.getExchangeRate);

  const categoriesForType = categories.filter((c) => c.type === watchedType);
  const frequentCategories = getFrequentCategories(4, watchedType);
```

- [ ] **Step 3: `create-transaction-dialog.tsx` — usar `onTypeChange` y `categoriesForType` en el JSX**

Reemplazar:

```tsx
              {/* ── Type Toggle ── */}
              <TypeToggle control={form.control} />

              {/* ── Description ── */}
              <DescriptionField control={form.control} />

              {/* ── Categories ── */}
              <CategoryPicker
                control={form.control}
                categories={categories}
                frequentCategories={frequentCategories}
              />
```

por:

```tsx
              {/* ── Type Toggle ── */}
              <TypeToggle
                control={form.control}
                onTypeChange={() => form.setValue('category_id', '')}
              />

              {/* ── Description ── */}
              <DescriptionField control={form.control} />

              {/* ── Categories ── */}
              <CategoryPicker
                control={form.control}
                categories={categoriesForType}
                frequentCategories={frequentCategories}
              />
```

- [ ] **Step 4: `edit-transaction-dialog.tsx` — filtrar categorías por el tipo observado**

Reemplazar:

```tsx
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const { fetchAllData, categories, paymentMethods, getFrequentCategories, getExchangeRate } = useFinanceStore();

  const frequentCategories = getFrequentCategories(4);

  const initialPaymentMethodId =
    transaction.payment_method_id != null ? String(transaction.payment_method_id) : 'none';

  const form = useForm<TransactionSchema>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      description: transaction.description,
      amount: transaction.original_currency === 'USD' && transaction.original_amount != null
        ? Math.abs(transaction.original_amount)
        : Math.abs(transaction.amount),
      date: transaction.date,
      category_id: transaction.category_id || '',
      type: transaction.type || 'expense',
      payment_method_id: initialPaymentMethodId,
      currency: (transaction.original_currency === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
      rate_pair: transaction.rate_pair ?? null,
      exchange_rate: null,
    },
  });

  const watchedAmount = form.watch('amount');
  const watchedCurrency = form.watch('currency');
  const watchedRatePair = form.watch('rate_pair');
  const watchedDate = form.watch('date');
```

por:

```tsx
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const { fetchAllData, categories, paymentMethods, getFrequentCategories, getExchangeRate } = useFinanceStore();

  const initialPaymentMethodId =
    transaction.payment_method_id != null ? String(transaction.payment_method_id) : 'none';

  const form = useForm<TransactionSchema>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      description: transaction.description,
      amount: transaction.original_currency === 'USD' && transaction.original_amount != null
        ? Math.abs(transaction.original_amount)
        : Math.abs(transaction.amount),
      date: transaction.date,
      category_id: transaction.category_id || '',
      type: transaction.type || 'expense',
      payment_method_id: initialPaymentMethodId,
      currency: (transaction.original_currency === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
      rate_pair: transaction.rate_pair ?? null,
      exchange_rate: null,
    },
  });

  const watchedAmount = form.watch('amount');
  const watchedCurrency = form.watch('currency');
  const watchedRatePair = form.watch('rate_pair');
  const watchedDate = form.watch('date');
  const watchedType = form.watch('type');

  const categoriesForType = categories.filter((c) => c.type === watchedType);
  const frequentCategories = getFrequentCategories(4, watchedType);
```

- [ ] **Step 5: `edit-transaction-dialog.tsx` — usar `onTypeChange` y `categoriesForType` en el JSX**

Reemplazar:

```tsx
              {/* ── Type Toggle ── */}
              <TypeToggle control={form.control} />

              {/* ── Description ── */}
              <DescriptionField control={form.control} />

              {/* ── Categories ── */}
              <CategoryPicker
                control={form.control}
                categories={categories}
                frequentCategories={frequentCategories}
              />
```

por:

```tsx
              {/* ── Type Toggle ── */}
              <TypeToggle
                control={form.control}
                onTypeChange={() => form.setValue('category_id', '')}
              />

              {/* ── Description ── */}
              <DescriptionField control={form.control} />

              {/* ── Categories ── */}
              <CategoryPicker
                control={form.control}
                categories={categoriesForType}
                frequentCategories={frequentCategories}
              />
```

- [ ] **Step 6: Verificar manualmente**

Run: `npm run dev`
En `/movimientos`, abrir "Nuevo Movimiento": alternar Gasto/Ingreso clickeando el toggle y confirmar que el selector de categoría (frecuentes + grilla completa) solo muestra categorías del tipo activo, y que si ya habías elegido una categoría y clickeás el otro tipo, la selección se limpia. Editar un movimiento existente y confirmar que **abrir** el diálogo (sin tocar el toggle) conserva la categoría original intacta — solo se limpia si el usuario clickea el toggle.

- [ ] **Step 7: Commit**

```bash
git add src/components/transactions/transaction-form-fields.tsx src/components/transactions/create-transaction-dialog.tsx src/components/transactions/edit-transaction-dialog.tsx
git commit -m "feat(movimientos): filtrar selector de categoria por el tipo elegido"
```

---

### Task 6: Cuotas y mensualidades — categoría siempre de tipo gasto

**Files:**
- Modify: `src/components/installments/create-plan-dialog.tsx`
- Modify: `src/components/installments/edit-plan-dialog.tsx`
- Modify: `src/components/subscriptions/create-subscription-dialog.tsx`
- Modify: `src/components/subscriptions/edit-subscription-dialog.tsx`

**Interfaces:**
- Consumes: `getFrequentCategories(n, 'expense')` (Task 2).

- [ ] **Step 1: `create-plan-dialog.tsx`**

Reemplazar:

```tsx
  const frequentCategories = getFrequentCategories(4);
```

por:

```tsx
  const frequentCategories = getFrequentCategories(4, 'expense');
```

Reemplazar:

```tsx
              {/* ── Categories ── */}
              <CategoryPicker
                control={form.control}
                categories={categories}
                frequentCategories={frequentCategories}
              />
```

por:

```tsx
              {/* ── Categories ── */}
              <CategoryPicker
                control={form.control}
                categories={categories.filter((c) => c.type === 'expense')}
                frequentCategories={frequentCategories}
              />
```

- [ ] **Step 2: `edit-plan-dialog.tsx`**

Reemplazar:

```tsx
  const frequentCategories = getFrequentCategories(4);
```

por:

```tsx
  const frequentCategories = getFrequentCategories(4, 'expense');
```

Reemplazar:

```tsx
              {/* ── Categories ── */}
              <CategoryPicker
                control={form.control}
                categories={categories}
                frequentCategories={frequentCategories}
              />
```

por:

```tsx
              {/* ── Categories ── */}
              <CategoryPicker
                control={form.control}
                categories={categories.filter((c) => c.type === 'expense')}
                frequentCategories={frequentCategories}
              />
```

- [ ] **Step 3: `create-subscription-dialog.tsx`**

Reemplazar:

```tsx
  const frequentCategories = getFrequentCategories(4);
```

por:

```tsx
  const frequentCategories = getFrequentCategories(4, 'expense');
```

Reemplazar:

```tsx
              {/* ── Category ── */}
              <CategoryPicker<CreateSubscriptionSchema>
                control={form.control}
                categories={categories}
                frequentCategories={frequentCategories}
              />
```

por:

```tsx
              {/* ── Category ── */}
              <CategoryPicker<CreateSubscriptionSchema>
                control={form.control}
                categories={categories.filter((c) => c.type === 'expense')}
                frequentCategories={frequentCategories}
              />
```

- [ ] **Step 4: `edit-subscription-dialog.tsx`**

Reemplazar:

```tsx
  const frequentCategories = getFrequentCategories(4);
```

por:

```tsx
  const frequentCategories = getFrequentCategories(4, 'expense');
```

Reemplazar:

```tsx
              {/* ── Category ── */}
              <CategoryPicker<SubscriptionSchema>
                control={form.control}
                categories={categories}
                frequentCategories={frequentCategories}
              />
```

por:

```tsx
              {/* ── Category ── */}
              <CategoryPicker<SubscriptionSchema>
                control={form.control}
                categories={categories.filter((c) => c.type === 'expense')}
                frequentCategories={frequentCategories}
              />
```

- [ ] **Step 5: Verificar manualmente**

Run: `npm run dev`
En `/compromisos`, crear/editar un plan de cuotas y una mensualidad: confirmar que el selector de categoría solo muestra categorías de tipo "Gasto" (ninguna de ingreso aparece).

- [ ] **Step 6: Commit**

```bash
git add src/components/installments/create-plan-dialog.tsx src/components/installments/edit-plan-dialog.tsx src/components/subscriptions/create-subscription-dialog.tsx src/components/subscriptions/edit-subscription-dialog.tsx
git commit -m "feat(cuotas-mensualidades): selector de categoria restringido a gasto"
```

---

### Task 7: Página `/categorias` — tabs Gastos / Ingresos

**Files:**
- Modify: `src/app/categorias/_components/categories-with-stats.tsx`

**Interfaces:**
- Consumes: `getCategoryBreakdown(scope, type)` (Task 2), `TabsDS` (`@/components/ui/tabs-ds`, sin cambios).

- [ ] **Step 1: Reescribir el componente completo**

Reemplazar el archivo completo `src/app/categorias/_components/categories-with-stats.tsx` por:

```tsx
'use client'

import { useState } from 'react'
import { useFinanceStore } from '@/lib/store/financeStore'
import { CategoryCardActions } from '@/components/categories/category-card-actions'
import { formatCurrency } from '@/lib/utils'
import { Tag, TrendingDown, TrendingUp, Calendar, History } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { TabsDS } from '@/components/ui/tabs-ds'
import type { Category } from '@/types/database'
import { CreateCategoryDialog } from '@/components/categories/create-category-dialog'

interface Props {
  categories: Category[]
}

const TAB_LABELS: Record<'expense' | 'income', {
  emptyTitle: string
  emptyDescription: string
  monthLabel: string
  topLabel: string
}> = {
  expense: {
    emptyTitle: 'Organizá tus gastos por categoría',
    emptyDescription: 'Creá categorías con emojis y descripción para que la IA clasifique tus movimientos automáticamente.',
    monthLabel: 'Gastos este mes',
    topLabel: 'Mayor gasto del mes',
  },
  income: {
    emptyTitle: 'Organizá tus ingresos por categoría',
    emptyDescription: 'Creá categorías de ingreso para que la IA clasifique tus cobros automáticamente.',
    monthLabel: 'Ingresos este mes',
    topLabel: 'Mayor ingreso del mes',
  },
}

export function CategoriesWithStats({ categories }: Props) {
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense')
  const getCategoryBreakdown = useFinanceStore((s) => s.getCategoryBreakdown)

  const monthly = getCategoryBreakdown('current_month', activeTab)
  const global = getCategoryBreakdown('global', activeTab)
  const topMonthly = monthly.items[0] ?? null
  const visibleCategories = categories.filter((c) => c.type === activeTab)
  const labels = TAB_LABELS[activeTab]

  return (
    <>
      {/* ── Tabs ── */}
      <div className="mb-6">
        <TabsDS
          tabs={[
            { id: 'expense', label: 'Gastos' },
            { id: 'income', label: 'Ingresos' },
          ]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as 'expense' | 'income')}
          ariaLabel="Tipo de categoría"
        />
      </div>

      {/* ── Summary header ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Card className="bg-surface-2/40 border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-deep">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted">{labels.monthLabel}</p>
              <p className="text-base font-semibold text-text truncate">
                {formatCurrency(monthly.total)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface-2/40 border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-deep">
              {activeTab === 'expense' ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted">{labels.topLabel}</p>
              {topMonthly ? (
                <p className="text-base font-semibold text-text truncate">
                  {topMonthly.name}{' '}
                  <span className="text-sm font-normal text-muted">
                    ({topMonthly.percentage.toFixed(0)}%)
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted">Sin datos</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface-2/40 border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-good/10 text-good">
              <History className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted">Total histórico</p>
              <p className="text-base font-semibold text-text truncate">
                {formatCurrency(global.total)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Category grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {visibleCategories.map((cat) => {
          const monthlySpent = monthly.items.find((i) => i.name === cat.name)
          const globalSpent = global.items.find((i) => i.name === cat.name)

          return (
            <div
              key={cat.id}
              className="group relative flex flex-col justify-between rounded-xl border border-border bg-surface-2/40 p-4 transition-all hover:bg-surface-2 hover:border-border"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-lg group-hover:text-text transition-colors select-none">
                  {cat.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-sm text-text group-hover:text-text transition-colors truncate">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-muted line-clamp-2 mt-1">
                    {cat.description || 'Sin descripción'}
                  </p>
                </div>
                <CategoryCardActions category={cat} allCategories={categories} />
              </div>

              {/* ── Spending row ── */}
              {(monthlySpent || globalSpent) && (
                <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2 text-xs">
                  {monthlySpent ? (
                    <span className="text-accent-deep font-medium">
                      {formatCurrency(monthlySpent.value)}{' '}
                      <span className="text-muted font-normal">este mes</span>
                    </span>
                  ) : (
                    <span className="text-muted">Sin movimientos este mes</span>
                  )}
                  {globalSpent && (
                    <span className="text-muted truncate">
                      {formatCurrency(globalSpent.value)} total
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {visibleCategories.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-border bg-surface-2/20 text-center">
            <Tag className="h-16 w-16 text-faint mb-4" />
            <h3 className="text-lg font-semibold text-text mb-2">{labels.emptyTitle}</h3>
            <p className="text-sm text-muted max-w-xs mb-6">
              {labels.emptyDescription}
            </p>
            <CreateCategoryDialog />
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verificar manualmente**

Run: `npm run dev`
En `/ajustes/categorias`: confirmar que aparecen los tabs "Gastos"/"Ingresos", que cada uno lista solo sus categorías, que las stats (mes/histórico) cambian según el tab, y que el estado vacío (si no hay categorías de ese tipo) muestra el texto correcto.

- [ ] **Step 3: Commit**

```bash
git add src/app/categorias/_components/categories-with-stats.tsx
git commit -m "feat(categorias): tabs Gastos/Ingresos en /ajustes/categorias"
```

---

### Task 8: Presupuestos — solo categorías de gasto

**Files:**
- Modify: `src/app/objetivos/objetivos-client.tsx:213-217`

**Interfaces:**
- Consumes: `categories: Category[]` con `type` (Task 1).

- [ ] **Step 1: Filtrar las categorías antes de pasarlas al diálogo**

Reemplazar:

```tsx
      <CreateBudgetDialog
        categories={categories}
        open={isCreateBudgetOpen}
        onOpenChange={setIsCreateBudgetOpen}
      />
```

por:

```tsx
      <CreateBudgetDialog
        categories={categories.filter((c) => c.type === 'expense')}
        open={isCreateBudgetOpen}
        onOpenChange={setIsCreateBudgetOpen}
      />
```

- [ ] **Step 2: Verificar manualmente**

Run: `npm run dev`
En `/objetivos`, tab "Presupuestos", abrir "Nuevo Presupuesto": confirmar que el selector de categoría solo ofrece categorías de gasto.

- [ ] **Step 3: Commit**

```bash
git add src/app/objetivos/objetivos-client.tsx
git commit -m "feat(presupuestos): restringir selector de categoria a tipo gasto"
```

---

### Task 9: IA — categorías separadas por bloque en el prompt

**Files:**
- Modify: `src/lib/ai/chatPrompt.ts`
- Modify: `src/app/api/chat/route.ts:121-124`
- Modify: `src/lib/ai/__tests__/chatPrompt.test.ts` (fixtures, ver nota)

**Interfaces:**
- Produces: `buildChatPrompt(categories: Category[], ...)` donde `Category` (de `chatPrompt.ts`) ahora requiere `type: 'income' | 'expense'`.

**Nota:** `chatPrompt.test.ts` es uno de los 4 archivos con el mini test-runner casero que Vitest reporta como "No test suite found" (falla preexistente, ajena a este trabajo — ver Global Constraints). Sus asserts nunca corren, pero el archivo sí se type-checkea en `npm run build`, así que sus fixtures `Category[]` deben seguir compilando con el campo `type` ahora obligatorio.

- [ ] **Step 1: Agregar `type` a la interfaz `Category` de `chatPrompt.ts`**

Reemplazar:

```ts
export interface Category {
  id: string
  name: string
  emoji: string | null
}
```

por:

```ts
export interface Category {
  id: string
  name: string
  emoji: string | null
  type: 'income' | 'expense'
}
```

- [ ] **Step 2: Separar `categoriesPrompt` en dos bloques por tipo**

Reemplazar:

```ts
export function buildChatPrompt(categories: Category[], conversationHistory?: ConversationMessage[], goalContext?: GoalContext, cardAlerts?: string[]): string {
  // Construir la lista de categorías en formato de referencia
  const categoriesPrompt = categories
    .map((cat) => `- ${cat.emoji || '📁'} ${cat.name}: para ${cat.name.toLowerCase()}`)
    .join('\n')
```

por:

```ts
export function buildChatPrompt(categories: Category[], conversationHistory?: ConversationMessage[], goalContext?: GoalContext, cardAlerts?: string[]): string {
  // Construir la lista de categorías en formato de referencia, separada por
  // tipo para que el modelo elija siempre dentro del bloque correcto.
  const formatCategoryList = (cats: Category[]) =>
    cats.map((cat) => `- ${cat.emoji || '📁'} ${cat.name}: para ${cat.name.toLowerCase()}`).join('\n')

  const expenseCategories = categories.filter((cat) => cat.type === 'expense')
  const incomeCategories = categories.filter((cat) => cat.type === 'income')

  const categoriesPrompt = `CATEGORÍAS DE GASTO:
${formatCategoryList(expenseCategories) || '(el usuario no tiene categorías de gasto)'}

CATEGORÍAS DE INGRESO:
${formatCategoryList(incomeCategories) || '(el usuario no tiene categorías de ingreso)'}`
```

- [ ] **Step 3: Actualizar la instrucción de selección de categoría**

Reemplazar:

```
IMPORTANTE: Cuando elijas una categoría, busca su nombre exacto en el "DICCIONARIO DE IDs" y extrae el UUID correspondiente para el campo "category_id".
```

por:

```
IMPORTANTE: Cuando elijas una categoría, elegí siempre una del bloque que corresponda al tipo del movimiento (gasto → bloque CATEGORÍAS DE GASTO, ingreso → bloque CATEGORÍAS DE INGRESO), buscá su nombre exacto en el "DICCIONARIO DE IDs" y extraé el UUID correspondiente para el campo "category_id".
```

- [ ] **Step 4: Eliminar la regla hardcodeada de la categoría "Ingresos"**

Reemplazar:

```
1. Si detectas palabras como "Cobré", "Sueldo", "Me transfirieron", "Ingreso", define "tipo": "income" y "categoria": "Ingresos".
```

por:

```
1. Si detectas palabras como "Cobré", "Sueldo", "Me transfirieron", "Ingreso", define "tipo": "income" y elegí la categoría más adecuada del bloque "CATEGORÍAS DE INGRESO" (nunca uses una del bloque de gasto).
```

- [ ] **Step 5: Actualizar el select de categorías en `api/chat/route.ts`**

Reemplazar:

```ts
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('id, name, emoji')
      .eq('user_id', user.id)
```

por:

```ts
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('id, name, emoji, type')
      .eq('user_id', user.id)
```

- [ ] **Step 6: Arreglar las fixtures de `chatPrompt.test.ts` para que compilen**

Ejecutar (agrega `type: 'expense'` a los 16 literales `{ id: ..., name: ..., emoji: ... }` del archivo):

```bash
sed -i -E "s/emoji: ('[^']*'|null) \},/emoji: \1, type: 'expense' \},/g" src/lib/ai/__tests__/chatPrompt.test.ts
```

- [ ] **Step 7: Verificar el reemplazo**

Run: `grep -c "type: 'expense'" src/lib/ai/__tests__/chatPrompt.test.ts`
Expected: `16`

- [ ] **Step 8: Verificar que el proyecto compila**

Run: `npx tsc --noEmit`
Expected: sin errores relacionados a `chatPrompt.ts` ni a su archivo de test.

- [ ] **Step 9: Verificar manualmente el prompt generado**

Este archivo no tiene cobertura de test real (ver nota arriba). Verificar a mano: en una sesión de `npm run dev`, mandarle al chatbot un ingreso (ej. "cobré 500000 de sueldo") y confirmar en los logs del servidor (o agregando un `console.log(systemPrompt)` temporal en `api/chat/route.ts`) que el prompt incluye las dos secciones "CATEGORÍAS DE GASTO" y "CATEGORÍAS DE INGRESO", y que la transacción se guarda con una categoría de tipo `income`. Sacar el `console.log` temporal antes de commitear.

- [ ] **Step 10: Commit**

```bash
git add src/lib/ai/chatPrompt.ts src/app/api/chat/route.ts src/lib/ai/__tests__/chatPrompt.test.ts
git commit -m "feat(ia): separar categorias de ingreso/gasto en bloques del prompt"
```

---

### Task 10: IA — validación defensiva de tipo al guardar una transacción

**Files:**
- Modify: `src/lib/ai/handlers.ts:206-260` (`handleTransaction`)

**Interfaces:**
- Consumes: `TransactionData` (`src/lib/ai/intentParser.ts:108-117`, sin cambios: `categoryId: string | null`, `type: 'expense' | 'income'`).

- [ ] **Step 1: Agregar el chequeo antes del insert**

Reemplazar:

```ts
async function handleTransaction(data: TransactionData, userId: number): Promise<ChatResponse> {
  try {
    const supabase = await createClient()

    // Resolver payment method completo (con ciclo de tarjeta si aplica).
    // Si el usuario no menciona medio, se usa su predeterminado (is_default).
    const paymentMethod = await resolvePaymentMethod(
      supabase,
      userId,
      data.paymentMethodName,
      !data.paymentMethodName
    )

    // Calcular fecha real de pago (aplica lógica de tarjeta de crédito si corresponde)
    const realPaymentDate = calculateRealPaymentDate(data.date, paymentMethod)

    // Insertar la transacción
    const { error } = await supabase.from('transactions').insert({
      user_id: userId,
      description: data.description,
      amount: data.amount,
      date: realPaymentDate,
      type: data.type,
      category_id: data.categoryId,
      payment_method_id: paymentMethod?.id || null,
    })
```

por:

```ts
async function handleTransaction(data: TransactionData, userId: number): Promise<ChatResponse> {
  try {
    const supabase = await createClient()

    // Resolver payment method completo (con ciclo de tarjeta si aplica).
    // Si el usuario no menciona medio, se usa su predeterminado (is_default).
    const paymentMethod = await resolvePaymentMethod(
      supabase,
      userId,
      data.paymentMethodName,
      !data.paymentMethodName
    )

    // Calcular fecha real de pago (aplica lógica de tarjeta de crédito si corresponde)
    const realPaymentDate = calculateRealPaymentDate(data.date, paymentMethod)

    // Validación defensiva: si el modelo eligió una categoría de un tipo
    // distinto al detectado (ej. categoría de gasto para un ingreso), se
    // descarta en vez de guardar una combinación inconsistente.
    let categoryId = data.categoryId
    if (categoryId) {
      const { data: categoryRow } = await supabase
        .from('categories')
        .select('type')
        .eq('id', categoryId)
        .single()
      if (categoryRow && categoryRow.type !== data.type) {
        categoryId = null
      }
    }

    // Insertar la transacción
    const { error } = await supabase.from('transactions').insert({
      user_id: userId,
      description: data.description,
      amount: data.amount,
      date: realPaymentDate,
      type: data.type,
      category_id: categoryId,
      payment_method_id: paymentMethod?.id || null,
    })
```

- [ ] **Step 2: Usar el `categoryId` validado en la alerta de presupuesto**

Reemplazar:

```ts
    const budgetAlert =
      data.type === 'expense'
        ? await checkBudgetAlert(supabase, userId, data.categoryId ?? null)
        : null
```

por:

```ts
    const budgetAlert =
      data.type === 'expense'
        ? await checkBudgetAlert(supabase, userId, categoryId ?? null)
        : null
```

- [ ] **Step 3: Verificar que el proyecto compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `handlers.ts`.

- [ ] **Step 4: Verificar manualmente**

No hay test automatizado para `handlers.ts` en el repo (es código de integración con Supabase, sin mocks establecidos — no se agrega infraestructura de testing nueva para esto). Verificar a mano con `npm run dev`: pedirle al chatbot un gasto forzando (para probar) una categoría que en la base es de tipo `income` — confirmar que la transacción se guarda con `category_id: null` en vez de la categoría inconsistente.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/handlers.ts
git commit -m "fix(ia): descartar category_id si su tipo no coincide con la transaccion"
```

---

### Task 11: Onboarding — categorías de gasto explícitas + siembra de ingreso por defecto

**Files:**
- Modify: `src/app/onboarding/actions.ts:56-100` (`saveOnboardingCategories`)

**Interfaces:**
- Consumes: `OnboardingCategoryInput` (sin cambios).

- [ ] **Step 1: Persistir `type: 'expense'` y sembrar las 2 categorías de ingreso por defecto**

Reemplazar:

```ts
// =============================================================================
// 2. GUARDAR CATEGORÍAS (batch)
// =============================================================================
// Inserta todas las categorías de una vez. Borra las custom previas del usuario
// para que el onboarding sea idempotente si se reinicia.
export async function saveOnboardingCategories(
  categories: OnboardingCategoryInput[]
): Promise<ActionResponse> {
  try {
    if (!Array.isArray(categories) || categories.length === 0) {
      return { error: 'Necesito al menos una categoría' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    // Limpiar categorías custom previas (idempotencia)
    await supabase
      .from('categories')
      .delete()
      .eq('user_id', user.id)
      .eq('is_system', false)

    const rows = categories.map((c) => ({
      user_id: user.id,
      name: c.name.trim(),
      emoji: c.emoji,
      description: (c.description || '').trim() || null,
      is_system: false,
    }))

    const { error } = await supabase.from('categories').insert(rows)
    if (error) {
      console.error('Error inserting onboarding categories:', error)
      return { error: 'No se pudieron guardar las categorías. Intentá de nuevo.' }
    }

    revalidatePath('/categorias')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in saveOnboardingCategories:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}
```

por:

```ts
// =============================================================================
// 2. GUARDAR CATEGORÍAS (batch)
// =============================================================================
// Inserta todas las categorías de una vez. Borra las custom previas del usuario
// para que el onboarding sea idempotente si se reinicia.
const DEFAULT_ONBOARDING_INCOME_CATEGORIES = [
  { name: 'Sueldo', emoji: '💰', description: 'Sueldo, honorarios, pagos fijos de trabajo en relación de dependencia o autónomo.' },
  { name: 'Freelance / Otros ingresos', emoji: '📈', description: 'Trabajos independientes, ventas, regalos en dinero y cualquier otro ingreso no fijo.' },
] as const

export async function saveOnboardingCategories(
  categories: OnboardingCategoryInput[]
): Promise<ActionResponse> {
  try {
    if (!Array.isArray(categories) || categories.length === 0) {
      return { error: 'Necesito al menos una categoría' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    // Limpiar categorías custom previas (idempotencia)
    await supabase
      .from('categories')
      .delete()
      .eq('user_id', user.id)
      .eq('is_system', false)

    const expenseRows = categories.map((c) => ({
      user_id: user.id,
      name: c.name.trim(),
      emoji: c.emoji,
      description: (c.description || '').trim() || null,
      is_system: false,
      type: 'expense' as const,
    }))

    // Las categorías del slide de onboarding son siempre de gasto; se suman
    // categorías de ingreso por defecto para que el selector de "Ingreso"
    // nunca quede vacío en el primer uso.
    const incomeRows = DEFAULT_ONBOARDING_INCOME_CATEGORIES.map((c) => ({
      user_id: user.id,
      name: c.name,
      emoji: c.emoji,
      description: c.description,
      is_system: false,
      type: 'income' as const,
    }))

    const { error } = await supabase.from('categories').insert([...expenseRows, ...incomeRows])
    if (error) {
      console.error('Error inserting onboarding categories:', error)
      return { error: 'No se pudieron guardar las categorías. Intentá de nuevo.' }
    }

    revalidatePath('/categorias')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in saveOnboardingCategories:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}
```

- [ ] **Step 2: Verificar manualmente**

Run: `npm run dev`
Crear un usuario nuevo y completar el onboarding hasta el slide de categorías. Al terminar, ir a `/ajustes/categorias`, tab "Ingresos": deben aparecer "💰 Sueldo" y "📈 Freelance / Otros ingresos" ya creadas.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/actions.ts
git commit -m "feat(onboarding): persistir type expense y sembrar categorias de ingreso por defecto"
```

---

### Task 12: Verificación final

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 2: Tests**

Run: `npm test`
Expected: mismos resultados que el baseline documentado en `CLAUDE.md` (fallas preexistentes en `dates.test.ts` y en los 4 archivos de `src/lib/ai/__tests__/` con el mini test-runner), más los 5 tests nuevos de `category-type-getters.test.ts` en verde. Ningún test que antes pasaba debe empezar a fallar.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 4: Checklist de humo manual**

Con `npm run dev` corriendo y la migración ya aplicada en Supabase DEV:
1. Crear una categoría de ingreso nueva desde `/ajustes/categorias` → aparece en el tab "Ingresos".
2. Cargar un movimiento de tipo "Ingreso" → el selector de categoría solo muestra categorías de ingreso.
3. Cargar un movimiento de tipo "Gasto" → el selector solo muestra categorías de gasto.
4. Crear una cuota y una mensualidad → el selector de categoría no muestra ninguna de ingreso.
5. `/objetivos` → "Nuevo Presupuesto" → el selector de categoría no muestra ninguna de ingreso.
6. Editar una categoría de ingreso sin movimientos → se puede cambiar a gasto. Editar una con movimientos → el toggle está bloqueado.
7. Chatbot: "cobré 500000 de sueldo" → se registra como ingreso con una categoría de tipo `income`.

- [ ] **Step 5: Aplicar la migración a PROD antes de mergear**

Siguiendo la regla del proyecto (`CLAUDE.md`, skill `migrar-schema`): ejecutar el mismo SQL de `supabase/migrations/20260706_add_type_to_categories.sql` en el SQL Editor de Supabase **PROD**, y verificar ahí también que no queden filas con `type` nulo y que cada usuario tenga al menos una categoría `income`, **antes** de mergear esta rama a `master`.
