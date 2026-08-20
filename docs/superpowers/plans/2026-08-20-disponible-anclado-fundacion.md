# Disponible anclado — Fundación · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el motor del disponible anclado —saldo por cuenta, bolsillo vs reserva, compromisos por ritmo de cobro— con los 7 escenarios del spec como tests, sin cambiar todavía lo que el usuario ve.

**Architecture:** Funciones puras nuevas en `src/lib/finance/pocket.ts`, siguiendo la regla del repo de que toda lógica financiera vive ahí y el store es un wrapper fino. El schema gana columnas aditivas con defaults que preservan el comportamiento actual, así que la app sigue funcionando igual hasta que el Plan 2 exponga lo nuevo en pantalla.

**Tech Stack:** TypeScript, Zustand, Supabase (PostgreSQL), Vitest, date-fns.

**Spec:** `docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md`

## Global Constraints

- Prohibido tocar `computeGlobalBalance` y `getRealAvailableBalance`: siguen sirviendo a la UI actual hasta el Plan 2. Lo nuevo convive, no reemplaza.
- Toda lógica financiera va en `src/lib/finance/`. El store solo envuelve. Nada de cálculo en componentes.
- Tipos de `src/types/database.ts`. Nunca `any`.
- **No existe base DEV**: la migración se aplica a producción. Solo columnas aditivas con default; ningún `DROP`, ningún cambio de tipo.
- Flujo de migración obligatorio (CLAUDE.md): `set -a; . ./.env.local; set +a` → `supabase migration new` → escribir SQL → `supabase db push --linked` → `supabase migration list --linked` (Local y Remote deben coincidir).
- Baseline por task: `npm run lint` = 24 errores / 11 warnings exactos · `npx tsc --noEmit` limpio · `npx vitest run` verde (389 + los nuevos) · `npm run build` OK.
- Los montos en tests son ficticios. No usar datos reales del autor: el repo es público.

---

## Task 1: Migración de schema + tipos

**Files:**
- Create: `supabase/migrations/<timestamp>_add_pocket_model.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: los campos `payment_methods.bucket`, `payment_methods.initial_balance`, `payment_methods.initial_balance_at`, `internal_transfers.from_payment_method_id`, `internal_transfers.to_payment_method_id`, `transactions.is_balance_adjustment`, `users.income_rhythm`. Todas las tasks siguientes los consumen.

- [ ] **Step 1: Crear la rama**

```bash
git checkout master && git pull --ff-only && git checkout -b feat/disponible-anclado
```

- [ ] **Step 2: Crear el archivo de migración**

```bash
set -a; . ./.env.local; set +a
supabase migration new add_pocket_model
```

- [ ] **Step 3: Escribir el SQL**

```sql
-- Modelo de bolsillo: ancla el disponible a saldos declarados y separa
-- la plata de gastar de la que el usuario decidio no gastar.
-- Todo aditivo: los defaults preservan el comportamiento actual.

ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'pocket'
    CHECK (bucket IN ('pocket', 'reserve')),
  ADD COLUMN IF NOT EXISTS initial_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_balance_at date;

COMMENT ON COLUMN payment_methods.bucket IS
  'pocket = cuenta de la que se gasta y cuenta para el disponible; reserve = ahorro/inversion, no cuenta. Ortogonal a type.';
COMMENT ON COLUMN payment_methods.initial_balance_at IS
  'NULL = sin anclar: el saldo se suma desde el primer movimiento (comportamiento historico). Con fecha, solo se computan los movimientos posteriores.';

ALTER TABLE internal_transfers
  ADD COLUMN IF NOT EXISTS from_payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_payment_method_id   uuid REFERENCES payment_methods(id) ON DELETE SET NULL;

COMMENT ON COLUMN internal_transfers.from_payment_method_id IS
  'NULL en filas previas a esta migracion: se interpretan como salida del bolsillo hacia un ahorro sin destino identificado.';

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_balance_adjustment boolean NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS income_rhythm text NOT NULL DEFAULT 'monthly'
    CHECK (income_rhythm IN ('monthly', 'biweekly', 'weekly', 'irregular'));
```

- [ ] **Step 4: Aplicar y verificar el registro**

```bash
supabase db push --linked
supabase migration list --linked
```
Expected: la versión nueva aparece con Local = Remote.

- [ ] **Step 5: Verificar contra la base**

```bash
supabase db push --linked --dry-run
```
Expected: "Remote database is up to date". Si el CLI da `403`, el PAT es de la cuenta equivocada; si da `PgClient: Failed to connect`, el password está mal (ver CLAUDE.md, son dos errores distintos).

- [ ] **Step 6: Actualizar los tipos**

En `src/types/database.ts`, agregar a las interfaces existentes:

```ts
// PaymentMethod
  bucket: 'pocket' | 'reserve';
  initial_balance: number;
  initial_balance_at: string | null;

// InternalTransfer
  from_payment_method_id: string | null;
  to_payment_method_id: string | null;

// Transaction
  is_balance_adjustment: boolean;

// User
  income_rhythm: 'monthly' | 'biweekly' | 'weekly' | 'irregular';
```

- [ ] **Step 7: Verificar y commitear**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: tsc limpio, lint en baseline, 389 tests verdes.

```bash
git add supabase/migrations src/types/database.ts
git commit -m "feat(db): modelo de bolsillo — bucket, saldo anclado, transferencias con origen/destino"
```

---

## Task 2: `computeAccountBalance` (TDD)

**Files:**
- Create: `src/lib/finance/pocket.ts`
- Test: `src/lib/finance/__tests__/pocket.test.ts`

**Interfaces:**
- Consumes: `PaymentMethod`, `InternalTransfer` de `@/types/database`; `ProcessedTransaction` de `../types`.
- Produces: `computeAccountBalance(method: PaymentMethod, transactions: ProcessedTransaction[], transfers: InternalTransfer[]): number` — Tasks 4 y 5 la usan.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/finance/__tests__/pocket.test.ts
import { describe, it, expect } from 'vitest';
import { computeAccountBalance } from '../pocket';
import type { PaymentMethod, InternalTransfer } from '@/types/database';
import type { ProcessedTransaction } from '../types';

const method = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: 'm1', user_id: 'u1', name: 'Billetera', type: 'debit',
  default_closing_day: null, default_payment_day: null, created_at: '2026-01-01',
  is_personal: false, is_default: true,
  bucket: 'pocket', initial_balance: 0, initial_balance_at: null,
  ...over,
} as PaymentMethod);

const tx = (over: Partial<ProcessedTransaction>): ProcessedTransaction => ({
  id: 't1', user_id: 'u1', type: 'expense', amount: -1000, date: '2026-08-10',
  periodDate: '2026-08-10', realPaymentDate: '2026-08-10',
  payment_method_id: 'm1', category_id: 'c1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  is_balance_adjustment: false,
  ...over,
} as ProcessedTransaction);

describe('computeAccountBalance', () => {
  it('sin ancla suma todo el historial del medio', () => {
    const r = computeAccountBalance(method(), [
      tx({ id: 'a', type: 'income', amount: 50000 }),
      tx({ id: 'b', type: 'expense', amount: -20000 }),
    ], []);
    expect(r).toBe(30000);
  });

  it('con ancla parte del saldo inicial e ignora lo anterior a la fecha', () => {
    const m = method({ initial_balance: 100000, initial_balance_at: '2026-08-01' });
    const r = computeAccountBalance(m, [
      tx({ id: 'viejo', type: 'expense', amount: -999999, date: '2026-07-15', periodDate: '2026-07-15' }),
      tx({ id: 'nuevo', type: 'expense', amount: -30000, date: '2026-08-10', periodDate: '2026-08-10' }),
    ], []);
    expect(r).toBe(70000);
  });

  it('incluye el movimiento del mismo dia del ancla', () => {
    const m = method({ initial_balance: 100000, initial_balance_at: '2026-08-01' });
    const r = computeAccountBalance(m, [
      tx({ id: 'mismo', type: 'expense', amount: -10000, date: '2026-08-01', periodDate: '2026-08-01' }),
    ], []);
    expect(r).toBe(90000);
  });

  it('resta transferencias salientes y suma entrantes', () => {
    const transfers = [
      { id: 'tr1', amount: 20000, from_payment_method_id: 'm1', to_payment_method_id: 'm2', real_transfer_date: '2026-08-05' },
      { id: 'tr2', amount: 5000, from_payment_method_id: 'm2', to_payment_method_id: 'm1', real_transfer_date: '2026-08-06' },
    ] as InternalTransfer[];
    const r = computeAccountBalance(method({ initial_balance: 100000, initial_balance_at: '2026-08-01' }), [], transfers);
    expect(r).toBe(85000);
  });

  it('las transferencias sin origen ni destino (previas a la migracion) no afectan a ningun medio', () => {
    const transfers = [
      { id: 'viejo', amount: 50000, from_payment_method_id: null, to_payment_method_id: null, real_transfer_date: '2026-08-05' },
    ] as InternalTransfer[];
    const r = computeAccountBalance(method({ initial_balance: 100000, initial_balance_at: '2026-08-01' }), [], transfers);
    expect(r).toBe(100000);
  });

  it('ignora transacciones de otro medio', () => {
    const r = computeAccountBalance(method(), [
      tx({ id: 'otro', type: 'expense', amount: -70000, payment_method_id: 'm9' }),
    ], []);
    expect(r).toBe(0);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/pocket.test.ts`
Expected: FAIL — el módulo `../pocket` no existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/finance/pocket.ts
// Modelo de bolsillo: saldo por cuenta anclado a un valor declarado.
// Puro: sin Zustand ni Supabase. Ver el spec 2026-08-20-disponible-real-anclado-design.md
import type { PaymentMethod, InternalTransfer } from '@/types/database';
import type { ProcessedTransaction } from './types';
import { parseLocalDate } from '@/lib/utils/dates';

/**
 * Saldo de una cuenta.
 * Sin `initial_balance_at` suma todo el historial (comportamiento previo al modelo de bolsillo).
 * Con ancla, parte de `initial_balance` y solo computa lo que pasó desde esa fecha inclusive:
 * lo anterior ya está representado dentro del ancla.
 */
export function computeAccountBalance(
  method: PaymentMethod,
  transactions: ProcessedTransaction[],
  transfers: InternalTransfer[],
): number {
  const anchor = method.initial_balance_at ? parseLocalDate(method.initial_balance_at) : null;
  const base = anchor ? Number(method.initial_balance) : 0;

  const afterAnchor = (dateStr: string | null | undefined) => {
    if (!anchor) return true;
    if (!dateStr) return false;
    return parseLocalDate(dateStr) >= anchor;
  };

  const movements = transactions
    .filter((t) => t.payment_method_id === method.id)
    .filter((t) => afterAnchor(t.periodDate || t.date))
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const transfersDelta = transfers.reduce((acc, tr) => {
    if (!afterAnchor(tr.real_transfer_date)) return acc;
    const amount = Math.abs(Number(tr.amount));
    if (tr.from_payment_method_id === method.id) return acc - amount;
    if (tr.to_payment_method_id === method.id) return acc + amount;
    return acc;
  }, 0);

  return base + movements + transfersDelta;
}
```

Nota: `amount` ya viene con signo en `transactions` (los gastos son negativos), por eso se suma directo.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/finance/__tests__/pocket.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commitear**

```bash
git add src/lib/finance/pocket.ts src/lib/finance/__tests__/pocket.test.ts
git commit -m "feat(finance): saldo por cuenta anclado a un valor declarado"
```

---

## Task 3: Período y compromisos según ritmo (TDD)

**Files:**
- Modify: `src/lib/finance/pocket.ts`
- Modify: `src/lib/finance/__tests__/pocket.test.ts`

**Interfaces:**
- Consumes: `CreditCardCycleSummary` de `../types`; `RecurringPlan`, `PaymentMethod` de `@/types/database`.
- Produces:
  - `type IncomeRhythm = 'monthly' | 'biweekly' | 'weekly' | 'irregular'`
  - `getPeriodEnd(rhythm: IncomeRhythm, now: Date): Date | null` — `null` significa sin límite (irregular).
  - `computeCommitments(...): CommitmentBreakdown` — Task 4 la usa.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `src/lib/finance/__tests__/pocket.test.ts`:

```ts
import { getPeriodEnd, computeCommitments } from '../pocket';
import type { RecurringPlan } from '@/types/database';
import type { CreditCardCycleSummary } from '../types';

describe('getPeriodEnd', () => {
  const now = new Date(2026, 7, 20); // 20-ago-2026, jueves

  it('monthly termina el ultimo dia del mes', () => {
    expect(getPeriodEnd('monthly', now)?.getDate()).toBe(31);
    expect(getPeriodEnd('monthly', now)?.getMonth()).toBe(7);
  });

  it('biweekly: del 16 en adelante termina a fin de mes', () => {
    expect(getPeriodEnd('biweekly', now)?.getDate()).toBe(31);
  });

  it('biweekly: antes del 16 termina el 15', () => {
    expect(getPeriodEnd('biweekly', new Date(2026, 7, 3))?.getDate()).toBe(15);
  });

  it('irregular no tiene fin', () => {
    expect(getPeriodEnd('irregular', now)).toBeNull();
  });
});

describe('computeCommitments', () => {
  const debitMethod = method({ id: 'deb', type: 'debit' });
  const creditMethod = method({ id: 'cred', type: 'credit', bucket: 'pocket' });
  const methods = [debitMethod, creditMethod];
  const now = new Date(2026, 7, 20);

  const plan = (over: Partial<RecurringPlan>): RecurringPlan => ({
    id: 'p1', user_id: 'u1', description: 'Fijo', amount: 10000,
    is_active: true, payment_method_id: 'deb', category_id: 'c1',
    currency: 'ARS', original_amount: null, created_at: '2026-01-01',
    ...over,
  } as RecurringPlan);

  const card = (over: Partial<CreditCardCycleSummary>): CreditCardCycleSummary => ({
    methodId: 'cred', name: 'Tarjeta', total: 100000, totalARS: 100000, totalUSD: 0,
    nextPaymentDate: new Date(2026, 8, 1), isCycleClosed: true, isPending: true, isPaidManually: false,
    ...over,
  });

  it('descuenta un fijo de debito no pagado', () => {
    const r = computeCommitments([plan({ amount: 25000 })], [], methods, [], 'monthly', now);
    expect(r.total).toBe(25000);
  });

  it('NO descuenta un fijo de credito: ya viaja en el resumen', () => {
    const r = computeCommitments([plan({ amount: 25000, payment_method_id: 'cred' })], [], methods, [], 'monthly', now);
    expect(r.total).toBe(0);
  });

  it('descuenta la tarjeta que vence dentro del periodo', () => {
    const r = computeCommitments([], [card({ nextPaymentDate: new Date(2026, 7, 25) })], methods, [], 'monthly', now);
    expect(r.total).toBe(100000);
    expect(r.nextPeriod).toBe(0);
  });

  it('la tarjeta que vence despues del periodo va a nextPeriod, no al total', () => {
    const r = computeCommitments([], [card({ nextPaymentDate: new Date(2026, 8, 4) })], methods, [], 'monthly', now);
    expect(r.total).toBe(0);
    expect(r.nextPeriod).toBe(100000);
  });

  it('con ritmo irregular descuenta todo, sin importar el vencimiento', () => {
    const r = computeCommitments(
      [plan({ amount: 40000 })],
      [card({ nextPaymentDate: new Date(2026, 8, 4), totalARS: 150000, total: 150000 })],
      methods, [], 'irregular', now,
    );
    expect(r.total).toBe(190000);
    expect(r.nextPeriod).toBe(0);
  });

  it('ignora una tarjeta ya pagada', () => {
    const r = computeCommitments([], [card({ isPending: false, nextPaymentDate: new Date(2026, 7, 25) })], methods, [], 'monthly', now);
    expect(r.total).toBe(0);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/pocket.test.ts`
Expected: FAIL — `getPeriodEnd` y `computeCommitments` no existen.

- [ ] **Step 3: Implementar**

Agregar a `src/lib/finance/pocket.ts`:

```ts
import { endOfMonth, endOfWeek } from 'date-fns';
import type { RecurringPlan } from '@/types/database';
import type { CreditCardCycleSummary } from './types';
import { computePendingFixedExpenses } from './pending';

export type IncomeRhythm = 'monthly' | 'biweekly' | 'weekly' | 'irregular';

export interface CommitmentBreakdown {
  /** Lo que vence dentro del período actual y sale del bolsillo. */
  total: number;
  items: Array<{ id: string; name: string; amount: number; kind: 'card' | 'fixed' }>;
  /** Lo que vence después del período: no baja el disponible de hoy, pero el usuario tiene que verlo. */
  nextPeriod: number;
}

/**
 * Fin del período de cobro. `null` = sin límite: cuando el ingreso es irregular
 * no hay próximo cobro que asumir, así que se descuenta todo lo comprometido.
 */
export function getPeriodEnd(rhythm: IncomeRhythm, now: Date): Date | null {
  if (rhythm === 'irregular') return null;
  if (rhythm === 'weekly') return endOfWeek(now, { weekStartsOn: 1 });
  if (rhythm === 'biweekly') {
    return now.getDate() <= 15
      ? new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59, 999)
      : endOfMonth(now);
  }
  return endOfMonth(now);
}

export function computeCommitments(
  recurringPlans: RecurringPlan[],
  pendingCards: CreditCardCycleSummary[],
  paymentMethods: PaymentMethod[],
  transactions: ProcessedTransaction[],
  rhythm: IncomeRhythm,
  now: Date = new Date(),
): CommitmentBreakdown {
  const periodEnd = getPeriodEnd(rhythm, now);
  const withinPeriod = (d: Date) => periodEnd === null || d <= periodEnd;

  const items: CommitmentBreakdown['items'] = [];
  let nextPeriod = 0;

  // Fijos: solo los que salen del bolsillo. Un fijo de crédito ya está
  // facturado dentro del resumen de su tarjeta; descontarlo aparte lo contaría dos veces.
  const creditMethodIds = new Set(
    paymentMethods.filter((m) => m.type === 'credit').map((m) => m.id),
  );
  const pendingFixed = computePendingFixedExpenses(recurringPlans, transactions, now);
  for (const item of pendingFixed.items) {
    const plan = recurringPlans.find((p) => p.id === item.id);
    if (plan?.payment_method_id && creditMethodIds.has(plan.payment_method_id)) continue;
    items.push({ ...item, kind: 'fixed' });
  }

  // Tarjetas: se descuentan si vencen dentro del período; si no, quedan para el próximo.
  for (const card of pendingCards) {
    if (!card.isPending) continue;
    if (withinPeriod(card.nextPaymentDate)) {
      items.push({ id: card.methodId, name: card.name, amount: card.totalARS, kind: 'card' });
    } else {
      nextPeriod += card.totalARS;
    }
  }

  return { total: items.reduce((acc, i) => acc + i.amount, 0), items, nextPeriod };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/finance/__tests__/pocket.test.ts`
Expected: PASS (16 tests: 6 de la Task 2 + 10 nuevos).

- [ ] **Step 5: Commitear**

```bash
git add src/lib/finance/pocket.ts src/lib/finance/__tests__/pocket.test.ts
git commit -m "feat(finance): compromisos por ritmo de cobro, sin doble contar fijos de credito"
```

---

## Task 4: `computeAvailableToSpend` (TDD)

**Files:**
- Modify: `src/lib/finance/pocket.ts`
- Modify: `src/lib/finance/__tests__/pocket.test.ts`

**Interfaces:**
- Consumes: `computeAccountBalance` (Task 2), `computeCommitments` (Task 3).
- Produces: `computeAvailableToSpend(inputs: AvailableInputs): AvailableToSpend` — Task 5 la envuelve en el store.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `src/lib/finance/__tests__/pocket.test.ts`:

```ts
import { computeAvailableToSpend } from '../pocket';

describe('computeAvailableToSpend', () => {
  const now = new Date(2026, 7, 20);
  const pocket = method({ id: 'poc', name: 'Billetera', bucket: 'pocket', initial_balance: 150000, initial_balance_at: '2026-08-01' });
  const reserve = method({ id: 'res', name: 'Mis dolares', bucket: 'reserve', initial_balance: 500000, initial_balance_at: '2026-08-01' });

  it('suma solo los medios del bolsillo', () => {
    const r = computeAvailableToSpend({
      paymentMethods: [pocket, reserve], transactions: [], transfers: [],
      recurringPlans: [], pendingCards: [], rhythm: 'monthly', now,
    });
    expect(r.pocketTotal).toBe(150000);
    expect(r.available).toBe(150000);
  });

  it('expone las reservas aparte, sin sumarlas al disponible', () => {
    const r = computeAvailableToSpend({
      paymentMethods: [pocket, reserve], transactions: [], transfers: [],
      recurringPlans: [], pendingCards: [], rhythm: 'monthly', now,
    });
    expect(r.reserveTotal).toBe(500000);
    expect(r.accounts.find((a) => a.methodId === 'res')?.bucket).toBe('reserve');
  });

  it('las tarjetas de credito no suman saldo al bolsillo', () => {
    const credit = method({ id: 'cred', type: 'credit', bucket: 'pocket', initial_balance: 0, initial_balance_at: null });
    const r = computeAvailableToSpend({
      paymentMethods: [pocket, credit], transactions: [], transfers: [],
      recurringPlans: [], pendingCards: [], rhythm: 'monthly', now,
    });
    expect(r.pocketTotal).toBe(150000);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/pocket.test.ts`
Expected: FAIL — `computeAvailableToSpend` no existe.

- [ ] **Step 3: Implementar**

Agregar a `src/lib/finance/pocket.ts`:

```ts
export interface AccountBalance {
  methodId: string;
  name: string;
  bucket: 'pocket' | 'reserve';
  balance: number;
}

export interface AvailableInputs {
  paymentMethods: PaymentMethod[];
  transactions: ProcessedTransaction[];
  transfers: InternalTransfer[];
  recurringPlans: RecurringPlan[];
  pendingCards: CreditCardCycleSummary[];
  rhythm: IncomeRhythm;
  now?: Date;
}

export interface AvailableToSpend {
  /** El número central: lo que se puede gastar hoy sin quedar en negativo. */
  available: number;
  pocketTotal: number;
  reserveTotal: number;
  committed: number;
  committedNextPeriod: number;
  commitmentItems: CommitmentBreakdown['items'];
  accounts: AccountBalance[];
}

export function computeAvailableToSpend(inputs: AvailableInputs): AvailableToSpend {
  const { paymentMethods, transactions, transfers, recurringPlans, pendingCards, rhythm } = inputs;
  const now = inputs.now ?? new Date();

  // Las tarjetas de crédito no tienen saldo propio: su deuda se deriva del ciclo.
  const accounts: AccountBalance[] = paymentMethods
    .filter((m) => m.type !== 'credit')
    .map((m) => ({
      methodId: m.id,
      name: m.name,
      bucket: m.bucket,
      balance: computeAccountBalance(m, transactions, transfers),
    }));

  const pocketTotal = accounts.filter((a) => a.bucket === 'pocket').reduce((acc, a) => acc + a.balance, 0);
  const reserveTotal = accounts.filter((a) => a.bucket === 'reserve').reduce((acc, a) => acc + a.balance, 0);

  const commitments = computeCommitments(recurringPlans, pendingCards, paymentMethods, transactions, rhythm, now);

  return {
    available: pocketTotal - commitments.total,
    pocketTotal,
    reserveTotal,
    committed: commitments.total,
    committedNextPeriod: commitments.nextPeriod,
    commitmentItems: commitments.items,
    accounts,
  };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/finance/__tests__/pocket.test.ts`
Expected: PASS (19 tests).

- [ ] **Step 5: Commitear**

```bash
git add src/lib/finance/pocket.ts src/lib/finance/__tests__/pocket.test.ts
git commit -m "feat(finance): disponible del bolsillo con reservas y compromisos separados"
```

---

## Task 5: Getter del store

**Files:**
- Modify: `src/lib/store/financeStore.ts`

**Interfaces:**
- Consumes: `computeAvailableToSpend` (Task 4), `getPendingCreditCardByCard()` (getter existente).
- Produces: `getAvailableToSpend(): AvailableToSpend` en el store — Task 6 y el Plan 2 lo consumen.

- [ ] **Step 1: Agregar la firma a la interfaz del store**

Junto a `getRealAvailableBalance` en la interfaz (cerca de la línea 189), agregar:

```ts
  getAvailableToSpend: () => AvailableToSpend;
```

Importar arriba:

```ts
import { computeAvailableToSpend, type AvailableToSpend, type IncomeRhythm } from '@/lib/finance/pocket';
```

- [ ] **Step 2: Implementar el getter**

Junto a la implementación de `getRealAvailableBalance` (cerca de la línea 1029):

```ts
  getAvailableToSpend: () => {
    const { transactions, paymentMethods, recurringPlans, internalTransfers, incomeRhythm } = get();
    const pendingCards = get().getPendingCreditCardByCard();
    return computeAvailableToSpend({
      paymentMethods,
      transactions,
      transfers: internalTransfers,
      recurringPlans,
      pendingCards,
      rhythm: incomeRhythm ?? 'monthly',
    });
  },
```

- [ ] **Step 3: Agregar `incomeRhythm` al estado**

En la interfaz del store, junto a los otros campos de datos:

```ts
  incomeRhythm: IncomeRhythm;
```

En el estado inicial: `incomeRhythm: 'monthly',`

`fetchAllData` ya trae la fila del usuario con `select('*')` (la query está en `financeStore.ts:482` y el resultado se desestructura como `userData` en la línea 442). En el `set({ ... })` de la línea ~599, donde ya se asigna `user: (userData as User) || null`, agregar al lado:

```ts
        incomeRhythm: (userData as User)?.income_rhythm ?? 'monthly',
```

No hace falta ninguna query nueva: la columna viaja en el `select('*')` existente.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: tsc limpio, lint en baseline exacto, todos los tests verdes.

- [ ] **Step 5: Commitear**

```bash
git add src/lib/store/financeStore.ts
git commit -m "feat(store): getAvailableToSpend como wrapper fino de lib/finance/pocket"
```

---

## Task 6: Los 7 escenarios del spec como tests

**Files:**
- Create: `src/lib/finance/__tests__/escenarios-disponible.test.ts`

**Interfaces:**
- Consumes: `computeAvailableToSpend` (Task 4) y `getAvailableToSpend()` (Task 5).

Estos son los tests de aceptación del modelo: cada uno es un perfil argentino distinto del spec. Si alguno falla, el modelo no sirve para ese usuario.

Van contra la **función pura**, no contra el store: varios escenarios necesitan un resumen de tarjeta pendiente, y sembrar un ciclo de crédito completo vía `useFinanceStore.setState` exige fabricar transacciones, días de cierre y fechas de vencimiento — ruido que oscurece lo que el escenario prueba. Inyectar `pendingCards` directamente hace el test legible y prueba exactamente la regla del spec. La integración store↔función se cubre con un test aparte al final.

**Simplificación deliberada:** todos los montos van en pesos, incluidas las reservas. Valuar reservas en moneda extranjera está fuera del alcance de este diseño (ver "Fuera de alcance" en el spec).

- [ ] **Step 1: Escribir los 7 escenarios**

```ts
// src/lib/finance/__tests__/escenarios-disponible.test.ts
// Los 7 perfiles del spec 2026-08-20-disponible-real-anclado-design.md.
// Datos ficticios y en pesos: el repo es publico y las reservas en moneda
// extranjera estan fuera del alcance de este diseno.
import { describe, it, expect } from 'vitest';
import { computeAvailableToSpend, type AvailableInputs } from '../pocket';
import type { PaymentMethod, RecurringPlan, InternalTransfer } from '@/types/database';
import type { ProcessedTransaction, CreditCardCycleSummary } from '../types';

const NOW = new Date(2026, 7, 20);   // 20-ago-2026
const ANCHOR = '2026-08-01';

const acct = (over: Partial<PaymentMethod>): PaymentMethod => ({
  id: 'poc', user_id: 'u1', name: 'Billetera', type: 'debit',
  default_closing_day: null, default_payment_day: null, created_at: '2026-01-01',
  is_personal: false, is_default: true,
  bucket: 'pocket', initial_balance: 0, initial_balance_at: ANCHOR,
  ...over,
} as PaymentMethod);

const fixed = (over: Partial<RecurringPlan>): RecurringPlan => ({
  id: 'f1', user_id: 'u1', description: 'Fijo', amount: 10000, is_active: true,
  payment_method_id: 'poc', category_id: 'c1', currency: 'ARS',
  original_amount: null, created_at: '2026-01-01',
  ...over,
} as RecurringPlan);

const summary = (over: Partial<CreditCardCycleSummary>): CreditCardCycleSummary => ({
  methodId: 'cred', name: 'Tarjeta', total: 0, totalARS: 0, totalUSD: 0,
  nextPaymentDate: new Date(2026, 8, 1), isCycleClosed: true, isPending: true, isPaidManually: false,
  ...over,
});

const run = (over: Partial<AvailableInputs>) => computeAvailableToSpend({
  paymentMethods: [], transactions: [], transfers: [],
  recurringPlans: [], pendingCards: [], rhythm: 'monthly', now: NOW,
  ...over,
});

describe('E1 — sueldo mensual, todo por billetera', () => {
  it('descuenta los fijos del periodo; la tarjeta del mes proximo queda afuera del disponible', () => {
    const r = run({
      paymentMethods: [acct({ initial_balance: 150000 }), acct({ id: 'cred', type: 'credit', is_default: false })],
      recurringPlans: [fixed({ description: 'Alquiler', amount: 80000 })],
      pendingCards: [summary({ totalARS: 200000, total: 200000, nextPaymentDate: new Date(2026, 8, 10) })],
    });
    expect(r.pocketTotal).toBe(150000);
    expect(r.committed).toBe(80000);
    expect(r.available).toBe(70000);
    expect(r.committedNextPeriod).toBe(200000);
  });
});

describe('E2 — mitad en efectivo', () => {
  it('el efectivo es un medio del bolsillo como cualquier otro', () => {
    const r = run({
      paymentMethods: [
        acct({ id: 'bill', initial_balance: 50000 }),
        acct({ id: 'efe', name: 'Efectivo', type: 'cash', initial_balance: 30000, is_default: false }),
      ],
      recurringPlans: [fixed({ description: 'Servicios', amount: 20000, payment_method_id: 'bill' })],
    });
    expect(r.pocketTotal).toBe(80000);
    expect(r.available).toBe(60000);
  });
});

describe('E3 — freelancer que cobra irregular', () => {
  it('sin proximo cobro que asumir, descuenta TODO lo comprometido', () => {
    const r = run({
      paymentMethods: [
        acct({ initial_balance: 100000 }),
        acct({ id: 'res', name: 'Mis dolares', bucket: 'reserve', initial_balance: 500000, is_default: false }),
        acct({ id: 'cred', type: 'credit', is_default: false }),
      ],
      recurringPlans: [fixed({ description: 'Servicios', amount: 40000 })],
      pendingCards: [summary({ totalARS: 150000, total: 150000, nextPaymentDate: new Date(2026, 8, 10) })],
      rhythm: 'irregular',
    });
    expect(r.reserveTotal).toBe(500000);
    expect(r.committed).toBe(190000);
    expect(r.available).toBe(-90000);
    expect(r.committedNextPeriod).toBe(0);
  });
});

describe('E4 — ahorrista en dolares', () => {
  it('transferir al ahorro baja el bolsillo y no cuenta como gasto', () => {
    const r = run({
      paymentMethods: [
        acct({ initial_balance: 300000 }),
        acct({ id: 'res', name: 'Mis dolares', bucket: 'reserve', initial_balance: 0, is_default: false }),
      ],
      transfers: [{
        id: 'tr', amount: 200000,
        from_payment_method_id: 'poc', to_payment_method_id: 'res',
        real_transfer_date: '2026-08-05',
      } as InternalTransfer],
    });
    expect(r.pocketTotal).toBe(100000);
    expect(r.reserveTotal).toBe(200000);
    expect(r.available).toBe(100000);
  });
});

describe('E5 — gasto pagado desde una reserva', () => {
  it('no toca el disponible del bolsillo, pero baja la reserva', () => {
    const r = run({
      paymentMethods: [
        acct({ initial_balance: 100000 }),
        acct({ id: 'res', name: 'Broker', bucket: 'reserve', initial_balance: 500000, is_default: false }),
      ],
      transactions: [{
        id: 'g1', user_id: 'u1', type: 'expense', amount: -150000,
        date: '2026-08-10', periodDate: '2026-08-10', realPaymentDate: '2026-08-10',
        payment_method_id: 'res', category_id: 'c1',
        installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
        is_balance_adjustment: false,
      } as ProcessedTransaction],
    });
    expect(r.available).toBe(100000);
    expect(r.reserveTotal).toBe(350000);
  });
});

describe('E6 — mensualidad facturada en tarjeta', () => {
  it('no se descuenta aparte: ya viaja dentro del resumen de su tarjeta', () => {
    const r = run({
      paymentMethods: [
        acct({ initial_balance: 200000 }),
        acct({ id: 'cred', name: 'Tarjeta', type: 'credit', is_default: false }),
      ],
      recurringPlans: [fixed({ description: 'Netflix', amount: 20000, payment_method_id: 'cred' })],
      pendingCards: [summary({ totalARS: 100000, total: 100000, nextPaymentDate: new Date(2026, 7, 28) })],
    });
    expect(r.committed).toBe(100000);   // no 120000: el fijo ya esta dentro del resumen
    expect(r.available).toBe(100000);
  });
});

describe('E7 — conciliacion', () => {
  it('un ajuste corrige el saldo sin tocar los movimientos previos', () => {
    const r = run({
      paymentMethods: [acct({ initial_balance: 200000 })],
      transactions: [{
        id: 'aj', user_id: 'u1', type: 'expense', amount: -50000,
        date: '2026-08-19', periodDate: '2026-08-19', realPaymentDate: '2026-08-19',
        payment_method_id: 'poc', category_id: 'c1', is_balance_adjustment: true,
        installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
      } as ProcessedTransaction],
    });
    expect(r.pocketTotal).toBe(150000);
    expect(r.available).toBe(150000);
  });
});
```

- [ ] **Step 2: Correr los escenarios**

Run: `npx vitest run src/lib/finance/__tests__/escenarios-disponible.test.ts`
Expected: PASS (7 tests). Si alguno falla, el modelo no cubre ese perfil: **no ajustar el test para que pase** — volver al cálculo y entender por qué.

- [ ] **Step 3: Escribir el test de integración store↔función**

Agregar al final del mismo archivo:

```ts
import { useFinanceStore } from '@/lib/store/financeStore';

describe('integracion: el store cablea bien la funcion pura', () => {
  it('getAvailableToSpend refleja los medios y el ritmo del estado', () => {
    useFinanceStore.setState({
      transactions: [], installmentPlans: [], recurringPlans: [], categories: [],
      exchangeRates: [], dolarBlue: null, displayCurrency: 'ARS', inflationSeries: [],
      internalTransfers: [],
      incomeRhythm: 'monthly',
      paymentMethods: [
        acct({ initial_balance: 120000 }),
        acct({ id: 'res', name: 'Ahorro', bucket: 'reserve', initial_balance: 900000, is_default: false }),
      ],
    } as never);

    const r = useFinanceStore.getState().getAvailableToSpend();
    expect(r.pocketTotal).toBe(120000);
    expect(r.reserveTotal).toBe(900000);
    expect(r.available).toBe(120000);
  });
});
```

Nota: este test usa la fecha real (`new Date()`), no `NOW`, porque el store no recibe `now`. Como no hay compromisos sembrados, el período no afecta el resultado.

- [ ] **Step 4: Verificación completa**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Expected: lint en baseline exacto (24 errores / 11 warnings), tsc limpio, todos los tests verdes (389 + 19 de `pocket.test.ts` + 8 de escenarios = 416), build OK.

- [ ] **Step 5: Commitear**

```bash
git add src/lib/finance/__tests__/escenarios-disponible.test.ts
git commit -m "test(finance): los 7 perfiles del spec como tests de aceptacion"
```

---

## Task 7: Cierre del slice

- [ ] **Step 1: Verificación final** — `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
- [ ] **Step 2:** Confirmar con Lauti que la UI actual sigue viéndose igual (el motor nuevo todavía no está conectado a ninguna pantalla): abrir Inicio, Movimientos y Compromisos.
- [ ] **Step 3:** Con OK: merge ff de `feat/disponible-anclado` a `master`, push, borrar rama, verificar deploy READY.
- [ ] **Step 4:** El Plan 2 (onboarding, conciliación, migración de usuarios y el número nuevo en pantalla) se escribe después de este merge.
