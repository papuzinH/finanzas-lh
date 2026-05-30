# Movimientos y suscripciones en dólares — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cargar movimientos (`/movimientos`) y suscripciones (`/compromisos`) en USD, guardando monto en USD + equivalente ARS del momento, y revaluar los USD a cotización actual en todos los cálculos.

**Architecture:** La DB guarda el snapshot ARS + datos de origen (USD, par de cotización, rate). El store, en `fetchAllData`, reescribe `amount` en memoria para filas USD usando la cotización vigente → los ~30 getters siguen leyendo `amount` sin cambios. Las cotizaciones son las mismas que `/inversiones` (tabla `exchange_rates` + dólar blue en vivo).

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL), Zustand, React Hook Form + Zod, Vitest, TypeScript, Tailwind/Shadcn.

**Spec:** `docs/superpowers/specs/2026-05-30-movimientos-en-dolares-design.md`

---

## Estructura de archivos

- **Migración** `supabase/migrations/20260531_add_currency_to_transactions_recurring.sql` — columnas nuevas (crear).
- `src/types/database.ts` — tipos de `transactions` y `recurring_plans` (modificar).
- `src/lib/store/financeStore.ts` — helper `resolveRate`, recompute en `fetchAllData`, getter `getExchangeRate` (modificar).
- `src/lib/store/__tests__/resolveRate.test.ts` — test del helper (crear).
- `src/lib/schemas/transaction.ts` / `subscription.ts` — campos de moneda (modificar).
- `src/components/transactions/transaction-form-fields.tsx` — `CurrencyField` nuevo + `AmountField` con símbolo (modificar).
- `src/components/transactions/create-transaction-dialog.tsx` / `edit-transaction-dialog.tsx` — wiring (modificar).
- `src/components/subscriptions/create-subscription-dialog.tsx` / `edit-subscription-dialog.tsx` — wiring (modificar).
- `src/app/dashboard/transactions/actions.ts` / `subscriptions/actions.ts` — persistencia USD (modificar).
- `src/components/shared/transaction-item.tsx` — badge USD (modificar).
- `src/app/compromisos/compromisos-client.tsx` — badge USD en cards de suscripción (modificar).
- `src/app/movimientos/actions.ts` — `updateExchangeRates()` (crear).
- `src/app/movimientos/page.tsx` — botón "Actualizar cotización" (modificar).

**Convención de cotización:** `rate_pair` ∈ `{'USD_ARS_BLUE','USD_ARS_MEP','USD_ARS_CCL','USDT_ARS'}`. Default al cargar USD: `'USD_ARS_MEP'`.

---

## Task 1: Migración SQL

**Files:**
- Create: `supabase/migrations/20260531_add_currency_to_transactions_recurring.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- ============================================================
-- MIGRACION: Soporte de moneda (USD) en movimientos y suscripciones
-- Fecha: 2026-05-31
-- Descripcion: Permite cargar transactions y recurring_plans en USD,
--   guardando el monto original, el par de cotizacion y el rate del momento.
--   La columna amount conserva el equivalente ARS del momento de carga.
-- ============================================================

-- transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS original_currency TEXT NOT NULL DEFAULT 'ARS'
    CHECK (original_currency IN ('ARS', 'USD')),
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS rate_pair TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14, 4);

-- Backfill: filas existentes son ARS, original_amount = amount
UPDATE transactions
  SET original_amount = amount
  WHERE original_amount IS NULL;

-- recurring_plans (ya tiene columna currency)
ALTER TABLE recurring_plans
  ALTER COLUMN currency SET DEFAULT 'ARS';

ALTER TABLE recurring_plans
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS rate_pair TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14, 4);

UPDATE recurring_plans
  SET currency = 'ARS'
  WHERE currency IS NULL;

UPDATE recurring_plans
  SET original_amount = amount
  WHERE original_amount IS NULL;
```

- [ ] **Step 2: Aplicar la migración a DEV (Supabase de `.env.local`)**

Ejecutar el SQL contra el proyecto Supabase DEV (SQL Editor de Supabase o MCP `apply_migration`).
Expected: ejecución sin errores; las columnas existen.

Verificar (SQL Editor):
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'transactions'
  AND column_name IN ('original_currency','original_amount','rate_pair','exchange_rate');
```
Expected: 4 filas.

> **PROD:** según CLAUDE.md, aplicar esta misma migración a PROD **antes** del merge a `master`. No hacer el merge sin eso.

- [ ] **Step 3: Commit**

```bash
rtk git add supabase/migrations/20260531_add_currency_to_transactions_recurring.sql
rtk git commit -m "feat(db): columnas de moneda USD en transactions y recurring_plans"
```

---

## Task 2: Tipos de base de datos

**Files:**
- Modify: `src/types/database.ts` (bloques `transactions` ~229-260 y `recurring_plans` ~171-205)

- [ ] **Step 1: Agregar campos a `transactions` (Row, Insert y Update)**

En el bloque `transactions`, agregar a `Row` (después de `payment_method_id: number | null`):
```ts
          original_currency: string
          original_amount: number | null
          rate_pair: string | null
          exchange_rate: number | null
```
A `Insert` (campos opcionales):
```ts
          original_currency?: string
          original_amount?: number | null
          rate_pair?: string | null
          exchange_rate?: number | null
```
A `Update` (campos opcionales): mismas 4 líneas con `?:` que en `Insert`.

- [ ] **Step 2: Agregar campos a `recurring_plans` (Row, Insert y Update)**

A `Row` (después de `payment_method_id: number | null`):
```ts
          original_amount: number | null
          rate_pair: string | null
          exchange_rate: number | null
```
A `Insert` y `Update` las mismas 3 líneas con `?:`.
(`currency` ya existe en los tres bloques.)

- [ ] **Step 3: Verificar tipos**

Run: `rtk tsc --noEmit`
Expected: sin errores nuevos relacionados con `transactions`/`recurring_plans`.

- [ ] **Step 4: Commit**

```bash
rtk git add src/types/database.ts
rtk git commit -m "feat(types): campos de moneda USD en transactions y recurring_plans"
```

---

## Task 3: Helper `resolveRate` con test

**Files:**
- Create: `src/lib/store/__tests__/resolveRate.test.ts`
- Modify: `src/lib/store/financeStore.ts` (módulo, antes de `create<FinanceState>`)

- [ ] **Step 1: Escribir el test (falla)**

Crear `src/lib/store/__tests__/resolveRate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveRate } from '../financeStore';

const rates = [
  { id: '1', pair: 'USD_ARS_MEP', rate: 1200, source: 'dolarapi', last_update: '' },
  { id: '2', pair: 'USD_ARS_CCL', rate: 1250, source: 'dolarapi', last_update: '' },
];
const blue = { compra: 1000, venta: 1100, fechaActualizacion: '' };

describe('resolveRate', () => {
  it('usa la cotización del par cuando existe', () => {
    expect(resolveRate('USD_ARS_MEP', rates as any, blue)).toBe(1200);
  });

  it('cae al dólar blue (venta) si el par no está', () => {
    expect(resolveRate('USDT_ARS', rates as any, blue)).toBe(1100);
  });

  it('usa el fallback (snapshot) si no hay par ni blue', () => {
    expect(resolveRate('USDT_ARS', [], null, 950)).toBe(950);
  });

  it('devuelve 1 si no hay nada', () => {
    expect(resolveRate(null, [], null)).toBe(1);
  });

  it('ignora rates <= 0', () => {
    const bad = [{ id: '1', pair: 'USD_ARS_MEP', rate: 0, source: '', last_update: '' }];
    expect(resolveRate('USD_ARS_MEP', bad as any, blue)).toBe(1100);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `rtk npm test -- resolveRate`
Expected: FAIL — `resolveRate` no exportado / no definido.

- [ ] **Step 3: Implementar `resolveRate`**

En `src/lib/store/financeStore.ts`, después del `interface DolarBlue { ... }` (línea ~49) y antes de `interface FinanceState`, agregar:
```ts
/**
 * Resuelve la cotización ARS de un par dado.
 * Prioridad: rate del par en exchange_rates → dólar blue (venta) → fallback (snapshot) → 1.
 */
export function resolveRate(
  pair: string | null,
  exchangeRates: ExchangeRate[],
  dolarBlue: DolarBlue | null,
  fallback?: number | null,
): number {
  if (pair) {
    const r = exchangeRates.find((e) => e.pair === pair);
    if (r && r.rate > 0) return r.rate;
  }
  if (dolarBlue?.venta && dolarBlue.venta > 0) return dolarBlue.venta;
  if (fallback && fallback > 0) return fallback;
  return 1;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `rtk npm test -- resolveRate`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/store/financeStore.ts src/lib/store/__tests__/resolveRate.test.ts
rtk git commit -m "feat(store): helper resolveRate con tests"
```

---

## Task 4: Recompute en `fetchAllData` + getter `getExchangeRate`

**Files:**
- Modify: `src/lib/store/financeStore.ts` (interfaz `FinanceState`, `fetchAllData` ~530-582, e implementación del getter)

- [ ] **Step 1: Declarar `getExchangeRate` en la interfaz `FinanceState`**

Después de `getGlobalBalance: () => number;` (línea ~156) agregar:
```ts
  getExchangeRate: (pair: string) => number;
```

- [ ] **Step 2: Recalcular `amount` en memoria para filas USD en `fetchAllData`**

En `fetchAllData`, dentro del `.map` que construye `processedTransactions` (línea ~530), reemplazar el `return { ...t, periodDate, realPaymentDate: t.date };` final por una versión que revalúa USD:
```ts
        const amountArs =
          t.original_currency === 'USD' && t.original_amount != null
            ? t.original_amount * resolveRate(t.rate_pair, (exchangeRatesData as ExchangeRate[]) || [], dolarBlue, t.exchange_rate)
            : t.amount;

        return {
          ...t,
          amount: amountArs,
          periodDate, // Usar esta para filtros de mes
          realPaymentDate: t.date, // Usar esta para mostrar "Vence el..."
        };
```

- [ ] **Step 3: Recalcular `amount` de `recurring_plans` USD antes del `set`**

Justo antes del `set({ ... })` (línea ~561), agregar:
```ts
      const recomputedRecurring = ((recurring as RecurringPlan[]) || []).map((plan) => {
        if (plan.currency === 'USD' && plan.original_amount != null) {
          const rate = resolveRate(plan.rate_pair, (exchangeRatesData as ExchangeRate[]) || [], dolarBlue, plan.exchange_rate);
          return { ...plan, amount: plan.original_amount * rate };
        }
        return plan;
      });
```
Y en el objeto del `set`, cambiar:
```ts
        recurringPlans: (recurring as RecurringPlan[]) || [],
```
por:
```ts
        recurringPlans: recomputedRecurring,
```

- [ ] **Step 4: Implementar el getter `getExchangeRate`**

Junto a los demás getters (p. ej. después de `getGlobalBalance`), agregar:
```ts
  getExchangeRate: (pair: string) => {
    const { exchangeRates, dolarBlue } = get();
    return resolveRate(pair, exchangeRates, dolarBlue);
  },
```

- [ ] **Step 5: Verificar build y tests**

Run: `rtk tsc --noEmit && rtk npm test`
Expected: sin errores de tipos; tests verdes.

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/store/financeStore.ts
rtk git commit -m "feat(store): revaluar montos USD a cotizacion actual + getExchangeRate"
```

---

## Task 5: Schemas Zod (moneda)

**Files:**
- Modify: `src/lib/schemas/transaction.ts`
- Modify: `src/lib/schemas/subscription.ts`

- [ ] **Step 1: Extender `transaction.ts`**

Reemplazar el contenido por:
```ts
import { z } from 'zod';

const localDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha es requerida');

const currencyFields = {
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  rate_pair: z.string().nullable().optional(),
  exchange_rate: z.number().positive().nullable().optional(),
};

const requireUsdRate = (data: { currency: 'ARS' | 'USD'; rate_pair?: string | null; exchange_rate?: number | null }) =>
  data.currency !== 'USD' || (!!data.rate_pair && !!data.exchange_rate && data.exchange_rate > 0);

export const transactionSchema = z
  .object({
    description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
    amount: z.number().positive('El monto debe ser positivo'),
    date: localDateString,
    category_id: z.string().min(1, 'La categoría es requerida'),
    type: z.enum(['income', 'expense'], { message: 'El tipo es requerido' }),
    ...currencyFields,
  })
  .refine(requireUsdRate, { message: 'Falta la cotización del dólar', path: ['exchange_rate'] });

export type TransactionSchema = z.infer<typeof transactionSchema>;

export const createTransactionSchema = z
  .object({
    description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
    amount: z.number().positive('El monto debe ser positivo'),
    date: localDateString,
    category_id: z.string().min(1, 'La categoría es requerida'),
    type: z.enum(['income', 'expense'], { message: 'El tipo es requerido' }),
    payment_method_id: z.string().nullable().optional(),
    ...currencyFields,
  })
  .refine(requireUsdRate, { message: 'Falta la cotización del dólar', path: ['exchange_rate'] });

export type CreateTransactionSchema = z.infer<typeof createTransactionSchema>;
```

- [ ] **Step 2: Extender `subscription.ts`**

Reemplazar el contenido por:
```ts
import { z } from 'zod';

const currencyFields = {
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  rate_pair: z.string().nullable().optional(),
  exchange_rate: z.number().positive().nullable().optional(),
};

const requireUsdRate = (data: { currency: 'ARS' | 'USD'; rate_pair?: string | null; exchange_rate?: number | null }) =>
  data.currency !== 'USD' || (!!data.rate_pair && !!data.exchange_rate && data.exchange_rate > 0);

export const subscriptionSchema = z
  .object({
    description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
    amount: z.number().positive('El monto debe ser positivo'),
    is_active: z.boolean(),
    category_id: z.string(),
    payment_method_id: z.string().nullable().optional(),
    frequency: z.enum(['monthly', 'yearly']),
    debit_payment_day: z.number().min(1).max(28).optional(),
    ...currencyFields,
  })
  .refine(requireUsdRate, { message: 'Falta la cotización del dólar', path: ['exchange_rate'] });

export type SubscriptionSchema = z.infer<typeof subscriptionSchema>;

export const createSubscriptionSchema = z
  .object({
    description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
    amount: z.number().positive('El monto debe ser positivo'),
    category_id: z.string().min(1, 'La categoría es requerida'),
    payment_method_id: z.string().nullable().optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha es requerida'),
    frequency: z.enum(['monthly', 'yearly']),
    debit_payment_day: z.number().min(1).max(28).optional(),
    ...currencyFields,
  })
  .refine(requireUsdRate, { message: 'Falta la cotización del dólar', path: ['exchange_rate'] });

export type CreateSubscriptionSchema = z.infer<typeof createSubscriptionSchema>;
```

- [ ] **Step 3: Verificar tipos**

Run: `rtk tsc --noEmit`
Expected: sin errores nuevos (puede haber errores en dialogs por defaults faltantes; se arreglan en Tasks 6-7 y 9).

- [ ] **Step 4: Commit**

```bash
rtk git add src/lib/schemas/transaction.ts src/lib/schemas/subscription.ts
rtk git commit -m "feat(schemas): campos de moneda en transaction y subscription"
```

---

## Task 6: `CurrencyField` + `AmountField` con símbolo de moneda

**Files:**
- Modify: `src/components/transactions/transaction-form-fields.tsx`

- [ ] **Step 1: Importar el store y `formatCurrency` (si falta)**

Al tope del archivo, junto a los imports existentes, agregar:
```ts
import { useFinanceStore } from '@/lib/store/financeStore';
```
(`formatCurrency` y `cn` ya se importan de `@/lib/utils`.)

- [ ] **Step 2: Soportar símbolo de moneda en `AmountField`**

En `AmountFieldProps`, agregar prop opcional:
```ts
  currency?: 'ARS' | 'USD';
```
En la firma del componente, agregar `currency = 'ARS'` al destructuring de props.
Reemplazar el `<span>` del símbolo `$`:
```tsx
              <span className="text-3xl font-semibold text-slate-600">$</span>
```
por:
```tsx
              <span className="text-3xl font-semibold text-slate-600">
                {currency === 'USD' ? 'US$' : '$'}
              </span>
```

- [ ] **Step 3: Agregar el componente `CurrencyField`**

Al final del archivo (después de `PaymentMethodField`), agregar:
```tsx
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CurrencyField
   Toggle ARS/USD + selector de cotización + preview en vivo
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const RATE_OPTIONS: { pair: string; label: string }[] = [
  { pair: 'USD_ARS_BLUE', label: 'Blue' },
  { pair: 'USD_ARS_MEP', label: 'MEP' },
  { pair: 'USD_ARS_CCL', label: 'CCL' },
  { pair: 'USDT_ARS', label: 'USDT' },
];

export const DEFAULT_RATE_PAIR = 'USD_ARS_MEP';

interface CurrencyFieldProps<T extends FieldValues> {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  watchedCurrency: 'ARS' | 'USD';
  watchedRatePair?: string | null;
  watchedAmount: number;
}

export function CurrencyField<T extends FieldValues>({
  control,
  setValue,
  watchedCurrency,
  watchedRatePair,
  watchedAmount,
}: CurrencyFieldProps<T>) {
  const getExchangeRate = useFinanceStore((s) => s.getExchangeRate);
  const activePair = watchedRatePair || DEFAULT_RATE_PAIR;
  const rate = watchedCurrency === 'USD' ? getExchangeRate(activePair) : 0;
  const arsPreview = rate > 0 ? watchedAmount * rate : 0;
  const rateLabel = RATE_OPTIONS.find((o) => o.pair === activePair)?.label ?? 'MEP';

  return (
    <FormField
      control={control}
      name={'currency' as Path<T>}
      render={({ field }) => (
        <FormItem>
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            Moneda
          </span>
          {/* ARS / USD */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/80 p-1">
            {(['ARS', 'USD'] as const).map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => {
                  field.onChange(cur);
                  if (cur === 'USD' && !watchedRatePair) {
                    setValue('rate_pair' as Path<T>, DEFAULT_RATE_PAIR as T[Path<T>], { shouldValidate: true });
                  }
                }}
                className={cn(
                  'min-h-11 rounded-lg py-2.5 text-sm font-semibold transition-all',
                  'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none',
                  field.value === cur
                    ? 'bg-indigo-500 text-white shadow-[0_0_20px_rgba(129,140,248,0.3)]'
                    : 'text-slate-500 hover:text-slate-300'
                )}
              >
                {cur === 'ARS' ? '$ Pesos' : 'US$ Dólares'}
              </button>
            ))}
          </div>

          {/* Selector de cotización + preview, solo en USD */}
          {field.value === 'USD' && (
            <div className="mt-3 space-y-2 animate-in fade-in-0 slide-in-from-top-2 duration-200">
              <div className="flex gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-800">
                {RATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.pair}
                    type="button"
                    onClick={() => setValue('rate_pair' as Path<T>, opt.pair as T[Path<T>], { shouldValidate: true })}
                    className={cn(
                      'flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all',
                      activePair === opt.pair
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-center text-xs text-slate-400">
                {rate > 0
                  ? <>≈ {formatCurrency(arsPreview)} ARS · a {formatCurrency(rate)} {rateLabel}</>
                  : 'Cotización no disponible'}
              </p>
            </div>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
```

- [ ] **Step 4: Verificar tipos**

Run: `rtk tsc --noEmit`
Expected: sin errores nuevos en `transaction-form-fields.tsx`.

- [ ] **Step 5: Commit**

```bash
rtk git add src/components/transactions/transaction-form-fields.tsx
rtk git commit -m "feat(ui): CurrencyField y AmountField con simbolo de moneda"
```

---

## Task 7: Wiring de moneda en dialogs de movimiento

**Files:**
- Modify: `src/components/transactions/create-transaction-dialog.tsx`
- Modify: `src/components/transactions/edit-transaction-dialog.tsx`

- [ ] **Step 1: `create-transaction-dialog.tsx` — imports y defaults**

En el import de campos, agregar `CurrencyField` y `DEFAULT_RATE_PAIR`:
```ts
import {
  AmountField,
  TypeToggle,
  DescriptionField,
  CategoryPicker,
  DateField,
  PaymentMethodField,
  CurrencyField,
  DEFAULT_RATE_PAIR,
} from '@/components/transactions/transaction-form-fields';
```
En `useForm` `defaultValues` y en el `form.reset` del `useEffect`, agregar a ambos:
```ts
      currency: 'ARS',
      rate_pair: null,
      exchange_rate: null,
```

- [ ] **Step 2: `create-transaction-dialog.tsx` — watches y resolución de rate al enviar**

Después de `const watchedDate = form.watch('date');` agregar:
```ts
  const watchedCurrency = form.watch('currency');
  const watchedRatePair = form.watch('rate_pair');
  const getExchangeRate = useFinanceStore((s) => s.getExchangeRate);
```
(`useFinanceStore` ya está importado.)

En `onSubmit`, reemplazar la construcción de `formattedData` por:
```ts
      const isUsd = data.currency === 'USD';
      const ratePair = data.rate_pair || DEFAULT_RATE_PAIR;
      const formattedData = {
        ...data,
        payment_method_id: data.payment_method_id === 'none' ? null : data.payment_method_id,
        rate_pair: isUsd ? ratePair : null,
        exchange_rate: isUsd ? getExchangeRate(ratePair) : null,
      };
```

- [ ] **Step 3: `create-transaction-dialog.tsx` — render del campo**

Después de `<AmountField ... />` (antes de `<TypeToggle .../>`), insertar:
```tsx
              {/* ── Currency ── */}
              <CurrencyField
                control={form.control}
                setValue={form.setValue}
                watchedCurrency={watchedCurrency}
                watchedRatePair={watchedRatePair}
                watchedAmount={watchedAmount}
              />
```
Y pasar `currency` al `AmountField`:
```tsx
              <AmountField
                control={form.control}
                setValue={form.setValue}
                watchedAmount={watchedAmount}
                currency={watchedCurrency}
              />
```

- [ ] **Step 4: `edit-transaction-dialog.tsx` — soportar edición de moneda**

Extender `transaction` en `EditTransactionDialogProps`:
```ts
  transaction: {
    id: number;
    description: string;
    amount: number;
    date: string;
    category_id: string | null;
    type: 'expense' | 'income' | null;
    original_currency?: string | null;
    original_amount?: number | null;
    rate_pair?: string | null;
  };
```
Importar `CurrencyField`, `DEFAULT_RATE_PAIR` y `getExchangeRate` (agregar a destructuring de `useFinanceStore`):
```ts
import {
  AmountField,
  TypeToggle,
  DescriptionField,
  CategoryPicker,
  DateField,
  CurrencyField,
  DEFAULT_RATE_PAIR,
} from '@/components/transactions/transaction-form-fields';
```
```ts
  const { fetchAllData, categories, getFrequentCategories, getExchangeRate } = useFinanceStore();
```
En `defaultValues` y en el `form.reset`, mostrar el monto en su moneda original:
```ts
      amount: transaction.original_currency === 'USD' && transaction.original_amount != null
        ? Math.abs(transaction.original_amount)
        : Math.abs(transaction.amount),
      date: transaction.date,
      category_id: transaction.category_id || '',
      type: transaction.type || 'expense',
      currency: (transaction.original_currency === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
      rate_pair: transaction.rate_pair ?? null,
      exchange_rate: null,
```
Agregar watches después de `const watchedAmount = form.watch('amount');`:
```ts
  const watchedCurrency = form.watch('currency');
  const watchedRatePair = form.watch('rate_pair');
```
En `onSubmit`, reemplazar la llamada por una que resuelva el rate:
```ts
      const isUsd = data.currency === 'USD';
      const ratePair = data.rate_pair || DEFAULT_RATE_PAIR;
      const payload = {
        ...data,
        rate_pair: isUsd ? ratePair : null,
        exchange_rate: isUsd ? getExchangeRate(ratePair) : null,
      };
      const result = await updateTransaction(transaction.id.toString(), payload);
```
En el render, pasar `currency` al `AmountField` e insertar `CurrencyField` justo después:
```tsx
              <AmountField
                control={form.control}
                setValue={form.setValue}
                watchedAmount={watchedAmount}
                currency={watchedCurrency}
              />

              {/* ── Currency ── */}
              <CurrencyField
                control={form.control}
                setValue={form.setValue}
                watchedCurrency={watchedCurrency}
                watchedRatePair={watchedRatePair}
                watchedAmount={watchedAmount}
              />
```

- [ ] **Step 5: Verificar tipos**

Run: `rtk tsc --noEmit`
Expected: sin errores en los dos dialogs.

- [ ] **Step 6: Commit**

```bash
rtk git add src/components/transactions/create-transaction-dialog.tsx src/components/transactions/edit-transaction-dialog.tsx
rtk git commit -m "feat(ui): seleccion de moneda en dialogs de movimiento"
```

---

## Task 8: Persistencia USD en actions de transactions

**Files:**
- Modify: `src/app/dashboard/transactions/actions.ts`

- [ ] **Step 1: `createTransaction` — persistir campos de moneda**

Reemplazar el bloque de destructuring + insert (líneas ~31-60) por:
```ts
    const { description, amount, date, category_id, type, payment_method_id, currency, rate_pair, exchange_rate } = validatedFields.data;

    // Para gastos con tarjeta de crédito, calcular la fecha real de pago según el ciclo de la tarjeta.
    let storedDate = dateToLocalString(new Date(date));
    const resolvedMethodId = payment_method_id && payment_method_id !== 'none' ? payment_method_id : null;

    if (resolvedMethodId && type === 'expense') {
      const { data: method } = await supabase
        .from('payment_methods')
        .select('type, default_closing_day, default_payment_day')
        .eq('id', resolvedMethodId)
        .single();

      if (method?.type === 'credit' && method.default_closing_day && method.default_payment_day) {
        storedDate = calculateCreditPaymentDate(storedDate, method.default_closing_day, method.default_payment_day);
      }
    }

    const isUsd = currency === 'USD';
    const rate = isUsd ? Number(exchange_rate) : null;
    if (isUsd && (!rate || rate <= 0)) {
      return { error: 'Cotización del dólar inválida' };
    }
    // amount viene en la moneda elegida; persistimos el equivalente ARS del momento.
    const amountArs = isUsd ? amount * (rate as number) : amount;

    const { error } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        description,
        amount: amountArs,
        date: storedDate,
        category_id,
        type,
        payment_method_id: resolvedMethodId,
        original_currency: isUsd ? 'USD' : 'ARS',
        original_amount: amount,
        rate_pair: isUsd ? rate_pair : null,
        exchange_rate: rate,
      });
```

- [ ] **Step 2: `updateTransaction` — persistir campos de moneda**

Reemplazar el destructuring + update (líneas ~93-106) por:
```ts
    const { description, amount, date, category_id, type, currency, rate_pair, exchange_rate } = validatedFields.data;

    const isUsd = currency === 'USD';
    const rate = isUsd ? Number(exchange_rate) : null;
    if (isUsd && (!rate || rate <= 0)) {
      return { error: 'Cotización del dólar inválida' };
    }
    const amountArs = isUsd ? amount * (rate as number) : amount;

    const { error } = await supabase
      .from('transactions')
      .update({
        description,
        amount: amountArs,
        date: dateToLocalString(new Date(date)),
        category_id,
        type,
        original_currency: isUsd ? 'USD' : 'ARS',
        original_amount: amount,
        rate_pair: isUsd ? rate_pair : null,
        exchange_rate: rate,
      })
      .eq('id', id)
      .eq('user_id', user.id);
```

- [ ] **Step 3: Verificar tipos**

Run: `rtk tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
rtk git add src/app/dashboard/transactions/actions.ts
rtk git commit -m "feat(actions): guardar movimientos en USD con snapshot ARS"
```

---

## Task 9: Wiring + persistencia de moneda en suscripciones

**Files:**
- Modify: `src/components/subscriptions/create-subscription-dialog.tsx`
- Modify: `src/components/subscriptions/edit-subscription-dialog.tsx`
- Modify: `src/app/dashboard/subscriptions/actions.ts`

- [ ] **Step 1: `create-subscription-dialog.tsx` — wiring**

Importar `CurrencyField` y `DEFAULT_RATE_PAIR` en el import de campos. Agregar a `defaultValues` y a los dos `form.reset`:
```ts
      currency: 'ARS',
      rate_pair: null,
      exchange_rate: null,
```
Watches (después de `const watchedFrequency = form.watch('frequency');`):
```ts
  const watchedCurrency = form.watch('currency');
  const watchedRatePair = form.watch('rate_pair');
  const getExchangeRate = useFinanceStore((s) => s.getExchangeRate);
```
(`useFinanceStore` ya está importado.)
En `onSubmit`, ajustar `formattedData`:
```ts
      const isUsd = data.currency === 'USD';
      const ratePair = data.rate_pair || DEFAULT_RATE_PAIR;
      const formattedData = {
        ...data,
        payment_method_id: data.payment_method_id === 'none' ? null : data.payment_method_id,
        rate_pair: isUsd ? ratePair : null,
        exchange_rate: isUsd ? getExchangeRate(ratePair) : null,
      };
```
Render: pasar `currency={watchedCurrency}` al `AmountField` e insertar después:
```tsx
              <CurrencyField<CreateSubscriptionSchema>
                control={form.control}
                setValue={form.setValue}
                watchedCurrency={watchedCurrency}
                watchedRatePair={watchedRatePair}
                watchedAmount={watchedAmount}
              />
```

- [ ] **Step 2: `edit-subscription-dialog.tsx` — wiring**

Extender el prop `subscription` con:
```ts
    currency?: string | null;
    original_amount?: number | null;
    rate_pair?: string | null;
```
Importar `CurrencyField`, `DEFAULT_RATE_PAIR` y agregar `getExchangeRate` al destructuring del store.
En `defaultValues` y `form.reset`, mostrar monto en moneda original y setear moneda:
```ts
        amount: subscription.currency === 'USD' && subscription.original_amount != null
          ? subscription.original_amount
          : subscription.amount,
        ...
        currency: (subscription.currency === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
        rate_pair: subscription.rate_pair ?? null,
        exchange_rate: null,
```
Watches:
```ts
  const watchedCurrency = form.watch('currency');
  const watchedRatePair = form.watch('rate_pair');
```
En `onSubmit`, ajustar `formattedData`:
```ts
      const isUsd = data.currency === 'USD';
      const ratePair = data.rate_pair || DEFAULT_RATE_PAIR;
      const formattedData = {
        ...data,
        category_id: data.category_id || "",
        payment_method_id: data.payment_method_id === "none" ? null : data.payment_method_id,
        rate_pair: isUsd ? ratePair : null,
        exchange_rate: isUsd ? getExchangeRate(ratePair) : null,
      };
```
Render: `currency={watchedCurrency}` en `AmountField` + `CurrencyField<SubscriptionSchema>` después (mismas props que en Step 1, con tipo `SubscriptionSchema`).

- [ ] **Step 3: `subscriptions/actions.ts` — persistir moneda en `createSubscription`**

Reemplazar destructuring + insert (líneas ~30-41) por:
```ts
    const { description, amount, category_id, payment_method_id, currency, rate_pair, exchange_rate } = validatedFields.data;

    const isUsd = currency === 'USD';
    const rate = isUsd ? Number(exchange_rate) : null;
    if (isUsd && (!rate || rate <= 0)) {
      return { error: 'Cotización del dólar inválida' };
    }
    const amountArs = isUsd ? amount * (rate as number) : amount;

    const { error } = await supabase
      .from('recurring_plans')
      .insert({
        user_id: user.id,
        description,
        amount: amountArs,
        category_id,
        payment_method_id: payment_method_id && payment_method_id !== 'none' ? payment_method_id : null,
        is_active: true,
        currency: isUsd ? 'USD' : 'ARS',
        original_amount: amount,
        rate_pair: isUsd ? rate_pair : null,
        exchange_rate: rate,
      });
```

- [ ] **Step 4: `subscriptions/actions.ts` — persistir moneda en `updateSubscription`**

Reemplazar destructuring + update (líneas ~74-87) por:
```ts
    const { description, amount, is_active, category_id, payment_method_id, currency, rate_pair, exchange_rate } = validatedFields.data;

    const isUsd = currency === 'USD';
    const rate = isUsd ? Number(exchange_rate) : null;
    if (isUsd && (!rate || rate <= 0)) {
      return { error: 'Cotización del dólar inválida' };
    }
    const amountArs = isUsd ? amount * (rate as number) : amount;

    const { error } = await supabase
      .from('recurring_plans')
      .update({
        description,
        amount: amountArs,
        is_active,
        category_id,
        payment_method_id,
        currency: isUsd ? 'USD' : 'ARS',
        original_amount: amount,
        rate_pair: isUsd ? rate_pair : null,
        exchange_rate: rate,
      })
      .eq('id', id)
      .eq('user_id', user.id);
```

- [ ] **Step 5: Verificar tipos**

Run: `rtk tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
rtk git add src/components/subscriptions/create-subscription-dialog.tsx src/components/subscriptions/edit-subscription-dialog.tsx src/app/dashboard/subscriptions/actions.ts
rtk git commit -m "feat: suscripciones en USD con snapshot ARS"
```

---

## Task 10: Display de moneda en lista de movimientos

**Files:**
- Modify: `src/components/shared/transaction-item.tsx`

- [ ] **Step 1: Extender el tipo `transaction` del prop**

En `TransactionItemProps`, agregar al objeto `transaction`:
```ts
    original_currency?: string | null;
    original_amount?: number | null;
    rate_pair?: string | null;
```

- [ ] **Step 2: Calcular y mostrar el monto USD como dato principal**

Después de `const isIncome = transaction.type === 'income';` (línea ~91) agregar:
```ts
  const isUsd = transaction.original_currency === 'USD' && transaction.original_amount != null;
  const rateLabel = ({ USD_ARS_BLUE: 'Blue', USD_ARS_MEP: 'MEP', USD_ARS_CCL: 'CCL', USDT_ARS: 'USDT' } as Record<string, string>)[transaction.rate_pair ?? ''] ?? '';
```
Reemplazar el bloque del monto (líneas ~199-205) por:
```tsx
      <div className="flex flex-col items-end gap-0.5 pl-2 mr-2">
        <span className={cn(
          "font-bold text-sm font-mono tracking-tight whitespace-nowrap",
          isIncome ? "text-emerald-400" : "text-slate-200"
        )}>
          {isIncome ? '+' : ''} {isUsd
            ? `US$ ${Math.abs(transaction.original_amount as number).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : formatCurrency(Math.abs(transaction.amount))}
        </span>
        {isUsd && (
          <span className="text-[10px] text-slate-400 font-mono">
            ≈ {formatCurrency(Math.abs(transaction.amount))}{rateLabel ? ` · ${rateLabel}` : ''}
          </span>
        )}
```
(Cerrar el `<div>` y mantener el bloque de fecha existente debajo; el `{showDate && ...}` queda igual.)

- [ ] **Step 3: Verificar build**

Run: `rtk tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
rtk git add src/components/shared/transaction-item.tsx
rtk git commit -m "feat(ui): mostrar movimientos en USD con equivalente ARS"
```

---

## Task 11: Display de moneda en cards de suscripción

**Files:**
- Modify: `src/app/compromisos/compromisos-client.tsx`

- [ ] **Step 1: Mostrar USD en el monto de la suscripción**

El monto de la suscripción se renderiza en `src/app/compromisos/compromisos-client.tsx` líneas ~291-293, dentro del map de suscripciones (variable `plan`, de tipo `RecurringPlan`):
```tsx
            <p className="font-bold text-sm font-mono text-slate-200">
              {formatCurrency(plan.amount)}
            </p>
```
Reemplazarlo por:
```tsx
            <p className="font-bold text-sm font-mono text-slate-200">
              {plan.currency === 'USD' && plan.original_amount != null ? (
                <span className="flex flex-col items-end leading-tight">
                  <span>US$ {Number(plan.original_amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="text-[10px] text-slate-400 font-normal">≈ {formatCurrency(plan.amount)}</span>
                </span>
              ) : (
                formatCurrency(plan.amount)
              )}
            </p>
```
> Nota: este `plan` es la suscripción. El otro `plan` (cuotas, líneas ~119-122 y ~207) es de tipo `InstallmentPlan` y **no** se toca (cuotas fuera de alcance).

- [ ] **Step 2: Verificar build**

Run: `rtk tsc --noEmit`
Expected: sin errores. Si TS marca que `currency`/`original_amount` no existen en el tipo usado, confirmar que el map usa `RecurringPlan` (ya tipado en Task 2).

- [ ] **Step 3: Commit**

```bash
rtk git add src/app/compromisos/compromisos-client.tsx
rtk git commit -m "feat(ui): mostrar suscripciones en USD con equivalente ARS"
```

---

## Task 12: Server action `updateExchangeRates` + botón de refresco

**Files:**
- Create: `src/app/movimientos/actions.ts`
- Modify: `src/app/movimientos/page.tsx`

- [ ] **Step 1: Crear la action `updateExchangeRates`**

Crear `src/app/movimientos/actions.ts`:
```ts
'use server';

import { createClient } from '@/utils/supabase/server';
import { fetchAllRates } from '@/lib/investments/prices/exchange-rates';
import { revalidatePath } from 'next/cache';

type ActionResponse = {
  error?: string;
  success?: boolean;
  updated?: number;
};

/** Refresca exchange_rates (Blue/MEP/CCL/USDT) desde las fuentes de /inversiones. */
export async function updateExchangeRates(): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'No autorizado' };

    const rates = await fetchAllRates();
    const now = new Date().toISOString();

    const rateEntries = [
      rates.USD_ARS_BLUE && { pair: 'USD_ARS_BLUE', rate: rates.USD_ARS_BLUE.sell, source: 'dolarapi' },
      rates.USD_ARS_MEP && { pair: 'USD_ARS_MEP', rate: rates.USD_ARS_MEP.sell, source: 'dolarapi' },
      rates.USD_ARS_CCL && { pair: 'USD_ARS_CCL', rate: rates.USD_ARS_CCL.sell, source: 'dolarapi' },
      rates.USDT_ARS !== null && { pair: 'USDT_ARS', rate: rates.USDT_ARS, source: 'coingecko' },
    ].filter(Boolean) as { pair: string; rate: number; source: string }[];

    if (rateEntries.length === 0) {
      return { error: 'No se pudieron obtener cotizaciones' };
    }

    const { error } = await supabase
      .from('exchange_rates')
      .upsert(rateEntries.map((e) => ({ ...e, last_update: now })), { onConflict: 'pair' });

    if (error) {
      console.error('Error updating exchange rates:', error);
      return { error: 'Error al actualizar cotizaciones' };
    }

    revalidatePath('/movimientos');
    return { success: true, updated: rateEntries.length };
  } catch (error) {
    console.error('Unexpected error updating rates:', error);
    return { error: 'Ocurrió un error inesperado' };
  }
}
```

- [ ] **Step 2: Botón "Actualizar cotización" en `/movimientos`**

En `src/app/movimientos/page.tsx`:
- Agregar imports:
```ts
import { RefreshCw } from 'lucide-react';
import { updateExchangeRates } from '@/app/movimientos/actions';
import { toast } from 'sonner';
```
- Agregar estado dentro del componente (junto a los otros `useState`):
```ts
  const [isRefreshingRates, setIsRefreshingRates] = useState(false);
```
- Agregar handler:
```ts
  const handleRefreshRates = async () => {
    setIsRefreshingRates(true);
    try {
      const result = await updateExchangeRates();
      if (result.error) {
        toast.error(result.error);
      } else {
        await fetchAllData();
        toast.success('Cotización actualizada');
      }
    } finally {
      setIsRefreshingRates(false);
    }
  };
```
- Renderizar el botón cerca del balance / encabezado del mes (junto al `MonthSelector` o al header). Insertar:
```tsx
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRefreshRates}
          disabled={isRefreshingRates}
          className="text-slate-400 hover:text-slate-200 gap-1.5"
          aria-label="Actualizar cotización del dólar"
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshingRates && 'animate-spin')} />
          <span className="text-xs">Cotización</span>
        </Button>
```
(`Button` y `cn` ya están importados en la página.)

- [ ] **Step 3: Verificar build**

Run: `rtk tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
rtk git add src/app/movimientos/actions.ts src/app/movimientos/page.tsx
rtk git commit -m "feat: boton para refrescar cotizacion en movimientos"
```

---

## Task 13: Verificación final

**Files:** ninguno (verificación)

- [ ] **Step 1: Lint + build + tests**

Run: `rtk lint && rtk next build && rtk npm test`
Expected: lint sin errores nuevos, build OK, tests verdes.

- [ ] **Step 2: Verificación manual (DEV, `npm run dev`)**

Comprobar:
- Crear ingreso y egreso en USD (cotización MEP por defecto) → preview "≈ $X ARS · a $Y MEP"; tras guardar, la lista muestra "US$ N" con "≈ $X · MEP".
- El balance disponible y el desglose mensual/por categoría reflejan el equivalente ARS.
- Botón "Cotización": refresca y los montos en pesos de movimientos USD cambian si cambió el dólar.
- Crear suscripción en USD → card muestra "US$ N ≈ $X"; el burn rate (`/compromisos` y dashboard) la considera en ARS.
- Movimientos/suscripciones en ARS existentes: sin cambios visibles.
- Editar un movimiento USD: el form abre con el monto en USD y el par correcto; guardar recalcula el snapshot con la cotización actual.

- [ ] **Step 3: Recordatorio de schema a PROD**

Confirmar que la migración de Task 1 fue aplicada a PROD antes de mergear a `master` (CLAUDE.md / skill `migrar-schema`).

- [ ] **Step 4: Commit final (si hubo ajustes de verificación)**

```bash
rtk git add -A
rtk git commit -m "chore: ajustes de verificacion movimientos en USD"
```

---

## Notas de implementación

- **Por qué mutar `amount` en memoria:** los getters del store (`getGlobalBalance`, `getMonthlyBurnRate`, `getMonthlyBalance`, `getExpensesByCategory`, presupuestos, medios de pago, etc.) leen `t.amount`/`plan.amount`. Reescribir `amount` en `fetchAllData` los deja en cotización actual sin tocar su lógica. `update`/`delete` no persisten ese valor (usan datos del form).
- **Snapshot vs vivo:** la DB guarda `amount` = ARS del momento de carga; la memoria lo revalúa. El `exchange_rate` snapshot sólo se usa como último fallback en `resolveRate` y para auditoría.
- **Cotización en el submit:** se usa `getExchangeRate(pair)` del store (la que el usuario vio en el preview) para fijar `exchange_rate`. No se re-fetchea en el server.
- **Edición de USD:** al editar, `exchange_rate` se recalcula con la cotización vigente al guardar (no se preserva el rate viejo), lo cual es coherente con "revaluar a cotización actual".
```
