# Mensualidades de crédito automáticas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una mensualidad facturada en tarjeta de crédito nazca sola como transacción fechada al vencimiento del resumen, en vez de pedirle al usuario que la marque como pagada todos los meses.

**Architecture:** Una columna nueva (`recurring_plans.billing_day`) da el dato que falta: qué día del mes factura el plan. Con eso, funciones puras en `src/lib/finance/recurring.ts` calculan en qué resumen cae cada mes de consumo (reusando `calculateCreditPaymentDate`, la misma función de cuotas y compras) y qué meses faltan postear. Una server action idempotente crea las filas faltantes, disparada una vez por carga desde `fetchAllData()`. La UI de Compromisos separa las automáticas de las manuales.

**Tech Stack:** Next.js App Router · Supabase (PostgreSQL, CLI linkeado) · Zustand · TypeScript · Vitest · date-fns · Zod + React Hook Form

**Spec:** `docs/superpowers/specs/2026-08-21-mensualidades-credito-automaticas-design.md`

## Global Constraints

- **Verificación del repo**: `npm test` (baseline en `master`: **441 tests / 38 archivos, todos verdes**), `npx tsc --noEmit` (0 errores), `npm run lint` **sin empeorar el baseline** de `master` (24 errors / 11 warnings preexistentes). No arreglar los preexistentes en este plan.
- **NO hay base DEV**: `.env.local` apunta a producción. Toda migración se aplica sobre datos reales. Antes de cualquier `UPDATE`, correr el `SELECT` equivalente y confirmar el conteo de filas.
- **Migraciones**: flujo obligatorio del CLAUDE.md — `set -a; . ./.env.local; set +a`, `supabase migration new`, `supabase db push --linked`, `supabase migration list --linked` (Local = Remote). Timestamp de 14 dígitos.
- **Toda consulta a tablas de datos de usuario va filtrada por `user_id`**, incluso las de diagnóstico: la base es multi-tenant (8 usuarios).
- **Lógica financiera en `src/lib/finance/`** (funciones puras), nunca en componentes ni en el cuerpo de los getters del store.
- **`amount` se guarda SIEMPRE positivo**: el signo lo lleva `type`. Los fixtures de test siguen esa convención — inventar montos con signo es lo que hizo pasar los tests de `computeAccountBalance` mientras el código estaba mal.
- **Fechas**: siempre `parseLocalDate()` / `dateToLocalString()` de `src/lib/utils/dates.ts`.
- **Tokens semánticos** en UI (`text-muted`, `bg-surface`, `border-border`…), nunca hex ni colores Tailwind crudos. Bordes `border-[1.5px]`. Números financieros con `tnum`.

---

### Task 1: Schema y datos históricos

Agrega la columna que falta y re-fecha las mensualidades de crédito viejas a su vencimiento real. Va primero porque todo lo demás depende del campo.

**Files:**
- Create: `supabase/migrations/<timestamp>_add_billing_day_to_recurring_plans.sql`
- Modify: `src/types/database.ts` (regenerado, no editado a mano)

**Interfaces:**
- Consumes: nada.
- Produces: `recurring_plans.billing_day: number | null` disponible en `RecurringPlan`.

- [ ] **Step 1: Fotografiar el estado previo**

Correr en el SQL Editor de Supabase (o vía MCP) y **guardar el resultado en el mensaje del commit**:

```sql
select to_char(t.date,'YYYY-MM') as mes, count(*) as tx
from public.transactions t
join public.payment_methods pm on pm.id = t.payment_method_id
where t.recurring_plan_id is not null and pm.type = 'credit'
group by 1 order by 1;
```

Esperado hoy: 10 filas en cada uno de 2026-04, 2026-05 y 2026-06 (30 en total), y nada en julio ni agosto.

- [ ] **Step 2: Crear la migración**

```bash
set -a; . ./.env.local; set +a
supabase migration new add_billing_day_to_recurring_plans
```

- [ ] **Step 3: Escribir el SQL**

```sql
-- 1) El dato que faltaba: qué día del mes factura el plan.
--    Nullable a propósito: se lee como `billing_day ?? 1`, así que los planes
--    existentes siguen funcionando sin backfill.
alter table public.recurring_plans
  add column if not exists billing_day integer;

alter table public.recurring_plans
  add constraint recurring_plans_billing_day_range
  check (billing_day is null or (billing_day between 1 and 31));

comment on column public.recurring_plans.billing_day is
  'Día del mes en que el plan se factura (1-31). Se lee como billing_day ?? 1. En crédito define en qué resumen cae; en débito alimenta el "vence el X".';

-- 2) One-shot: las mensualidades de crédito ya registradas están fechadas al
--    día 01 del mes de CONSUMO, no al vencimiento del resumen. Se las re-fecha
--    con la misma regla que usan cuotas y compras (calculateCreditPaymentDate):
--    si el día de cobro es posterior al cierre, el consumo se va al resumen
--    siguiente; y si el vencimiento es anterior al cierre, cae un mes después.
--    Sólo toca filas anteriores al mes en curso y con día 01 (las que generó el
--    backfill viejo). Es idempotente por construcción: corre una única vez,
--    registrada en schema_migrations.
with objetivo as (
  select t.id,
         t.date as consumo,
         pm.default_closing_day as cierre,
         pm.default_payment_day as vence
  from public.transactions t
  join public.payment_methods pm on pm.id = t.payment_method_id
  where t.recurring_plan_id is not null
    and pm.type = 'credit'
    and pm.default_closing_day is not null
    and pm.default_payment_day is not null
    and extract(day from t.date) = 1
    and t.date < date_trunc('month', current_date)
)
update public.transactions t
set date = (
      date_trunc('month', o.consumo)
      + (case when extract(day from o.consumo) > o.cierre then interval '1 month' else interval '0 month' end)
      + (case when o.vence < o.cierre then interval '1 month' else interval '0 month' end)
      + ((o.vence - 1) * interval '1 day')
    )::date
from objetivo o
where t.id = o.id;
```

- [ ] **Step 4: Verificar el efecto ANTES de aplicar**

Correr el `SELECT` equivalente (mismo `with objetivo`, pero `select count(*)` en vez del `update`). Debe dar **30**. Si da otro número, parar y revisar: el criterio está tocando filas que no corresponden.

- [ ] **Step 5: Aplicar y verificar contra la base**

```bash
supabase db push --linked
supabase migration list --linked   # Local y Remote deben coincidir
```

Después, confirmar el resultado:

```sql
select to_char(date,'YYYY-MM-DD') as fecha, count(*)
from public.transactions t
join public.payment_methods pm on pm.id = t.payment_method_id
where t.recurring_plan_id is not null and pm.type='credit'
group by 1 order by 1;
```

Esperado: las de la tarjeta que cierra 20 / vence 1 quedan al día 01 del mes **siguiente** al consumo; la que cierra 27 / vence 4, al día 04 del mes siguiente. Ninguna fila perdida: el total sigue siendo 30.

- [ ] **Step 6: Regenerar los types**

```bash
npx supabase gen types typescript --linked > src/types/database.ts
```

Verificar que `billing_day` aparece en `recurring_plans` (Row, Insert y Update) y que **no** se perdieron los alias del final del archivo (`export type RecurringPlan = Tables<'recurring_plans'>` y compañía). Si el generador los borró, reponerlos.

- [ ] **Step 7: Verificar que el repo sigue compilando**

```bash
npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations src/types/database.ts
git commit -m "feat(mensualidades): billing_day en recurring_plans + re-fechado del historico de credito"
```

---

### Task 2: El motor — funciones puras

Toda la lógica de "qué se factura cuándo y en qué resumen cae". TDD estricto: los 12 escenarios del spec.

**Files:**
- Create: `src/lib/finance/recurring.ts`
- Test: `src/lib/finance/__tests__/recurring.test.ts`

**Interfaces:**
- Consumes: `calculateCreditPaymentDate(purchaseDateStr, closingDay, paymentDay)` y `parseLocalDate(str)` de `src/lib/utils/dates.ts`; tipos `RecurringPlan`, `PaymentMethod`, `Transaction` de `@/types/database`.
- Produces:
  - `isAutomaticPlan(plan: RecurringPlan, method: PaymentMethod | undefined): boolean`
  - `expectedChargeDate(plan: RecurringPlan, method: PaymentMethod, month: string): string` — `month` en formato `'yyyy-MM'`, devuelve `'yyyy-MM-dd'`
  - `computeMissingAutomaticCharges(plans, methods, transactions, floorMonth, now?): MissingCharge[]`
  - `type MissingCharge = { planId: string; month: string; date: string }`

- [ ] **Step 1: Escribir el test de `isAutomaticPlan` y `expectedChargeDate`**

Crear `src/lib/finance/__tests__/recurring.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PaymentMethod, RecurringPlan, Transaction } from '@/types/database'
import {
  computeMissingAutomaticCharges,
  expectedChargeDate,
  isAutomaticPlan,
} from '../recurring'

/** Tarjeta que cierra el 20 y vence el 1 del mes siguiente. */
const visa = {
  id: 'card-visa',
  name: 'Visa',
  type: 'credit',
  default_closing_day: 20,
  default_payment_day: 1,
  bucket: 'pocket',
  initial_balance: 0,
  initial_balance_at: null,
  is_personal: false,
  is_default: false,
  user_id: 'u1',
  created_at: '2025-12-01T00:00:00Z',
} as unknown as PaymentMethod

/** Tarjeta que cierra el 27 y vence el 4. */
const master = { ...visa, id: 'card-master', name: 'Master', default_closing_day: 27, default_payment_day: 4 } as PaymentMethod

/** Cuenta a la vista: nunca se automatiza. */
const debito = { ...visa, id: 'acc-debito', name: 'Cuenta', type: 'debit', default_closing_day: null, default_payment_day: null } as PaymentMethod

function plan(over: Partial<RecurringPlan> = {}): RecurringPlan {
  return {
    id: 'plan-1',
    user_id: 'u1',
    description: 'Servicio',
    // amount SIEMPRE positivo: el signo lo lleva `type` en la transacción.
    amount: 10000,
    category_id: 'cat-1',
    payment_method_id: visa.id,
    currency: 'ARS',
    frequency: 'monthly',
    is_active: true,
    created_at: '2026-01-10T00:00:00Z',
    original_amount: null,
    rate_pair: null,
    exchange_rate: null,
    billing_day: null,
    ...over,
  } as RecurringPlan
}

describe('isAutomaticPlan', () => {
  it('automatiza un plan mensual en una tarjeta con ciclo cargado', () => {
    expect(isAutomaticPlan(plan(), visa)).toBe(true)
  })

  it('A5: no automatiza si la tarjeta no tiene el ciclo cargado', () => {
    const sinCiclo = { ...visa, default_closing_day: null } as PaymentMethod
    expect(isAutomaticPlan(plan(), sinCiclo)).toBe(false)
  })

  it('A6: no automatiza un plan anual', () => {
    expect(isAutomaticPlan(plan({ frequency: 'yearly' }), visa)).toBe(false)
  })

  it('A7: no automatiza un plan de débito', () => {
    expect(isAutomaticPlan(plan({ payment_method_id: debito.id }), debito)).toBe(false)
  })

  it('no automatiza si el plan no tiene medio de pago', () => {
    expect(isAutomaticPlan(plan({ payment_method_id: null }), undefined)).toBe(false)
  })

  it('trata frequency null como mensual (el default del producto)', () => {
    expect(isAutomaticPlan(plan({ frequency: null }), visa)).toBe(true)
  })
})

describe('expectedChargeDate', () => {
  it('A1: cobro el día 1, cierre 20 → vence el 1 del mes siguiente', () => {
    expect(expectedChargeDate(plan({ billing_day: 1 }), visa, '2026-08')).toBe('2026-09-01')
  })

  it('A2: cobro el día 25 (después del cierre) → se va un resumen más', () => {
    expect(expectedChargeDate(plan({ billing_day: 25 }), visa, '2026-08')).toBe('2026-10-01')
  })

  it('A3: la otra tarjeta usa su propio ciclo (cierra 27, vence 4)', () => {
    expect(expectedChargeDate(plan({ billing_day: 1 }), master, '2026-08')).toBe('2026-09-04')
  })

  it('A4: billing_day 31 en febrero clampea al último día del mes', () => {
    // 28 de febrero es posterior al cierre (20) → resumen de abril.
    expect(expectedChargeDate(plan({ billing_day: 31 }), visa, '2026-02')).toBe('2026-04-01')
  })

  it('billing_day nulo se lee como día 1', () => {
    expect(expectedChargeDate(plan({ billing_day: null }), visa, '2026-08')).toBe('2026-09-01')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/recurring.test.ts`
Expected: FAIL — no existe `../recurring`.

- [ ] **Step 3: Implementar `isAutomaticPlan` y `expectedChargeDate`**

Crear `src/lib/finance/recurring.ts`:

```ts
import { addMonths, format, getDaysInMonth, startOfDay } from 'date-fns'
import type { PaymentMethod, RecurringPlan, Transaction } from '@/types/database'
import { calculateCreditPaymentDate, parseLocalDate } from '@/lib/utils/dates'

/** Un mes de consumo que todavía no tiene su transacción. */
export type MissingCharge = { planId: string; month: string; date: string }

/**
 * Un plan se postea solo si las tres cosas son ciertas: va en tarjeta de
 * crédito, esa tarjeta tiene el ciclo cargado (sin cierre/vencimiento no hay
 * fecha que calcular) y es mensual (un plan anual daría doce cobros donde hay
 * uno). Si no, sigue con el toggle manual: el mecanismo no inventa fechas que
 * no puede derivar.
 */
export function isAutomaticPlan(plan: RecurringPlan, method: PaymentMethod | undefined): boolean {
  if (!method || method.type !== 'credit') return false
  if (method.default_closing_day == null || method.default_payment_day == null) return false
  return (plan.frequency ?? 'monthly') === 'monthly'
}

/** Día de cobro del plan en ese mes, clampeado al último día que el mes tiene. */
function chargeDayOf(plan: RecurringPlan, month: string): number {
  const firstOfMonth = parseLocalDate(`${month}-01`)
  return Math.min(plan.billing_day ?? 1, getDaysInMonth(firstOfMonth))
}

/**
 * Fecha de la transacción para el consumo de `month` ('yyyy-MM'): el día de
 * cobro pasado por la MISMA función que usan cuotas y compras variables, así
 * que la mensualidad cae en el resumen que le corresponde.
 */
export function expectedChargeDate(plan: RecurringPlan, method: PaymentMethod, month: string): string {
  const day = String(chargeDayOf(plan, month)).padStart(2, '0')
  return calculateCreditPaymentDate(
    `${month}-${day}`,
    method.default_closing_day as number,
    method.default_payment_day as number,
  )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/finance/__tests__/recurring.test.ts`
Expected: PASS (los describes de `isAutomaticPlan` y `expectedChargeDate`).

- [ ] **Step 5: Escribir el test de `computeMissingAutomaticCharges`**

Agregar al mismo archivo de test:

```ts
function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${Math.random()}`,
    user_id: 'u1',
    description: 'Servicio',
    amount: 10000,
    date: '2026-09-01',
    type: 'expense',
    category_id: 'cat-1',
    payment_method_id: visa.id,
    recurring_plan_id: 'plan-1',
    installment_plan_id: null,
    created_at: '2026-09-01T00:00:00Z',
    original_amount: null,
    original_currency: 'ARS',
    rate_pair: null,
    exchange_rate: null,
    card_payment_for: null,
    is_balance_adjustment: false,
    ...over,
  } as unknown as Transaction
}

describe('computeMissingAutomaticCharges', () => {
  const methods = [visa, master, debito]
  const hoy = parseLocalDate('2026-08-21')

  it('genera los meses faltantes desde el piso hasta lo ya facturado', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-01-10T00:00:00Z' })],
      methods,
      [],
      '2026-06',
      hoy,
    )
    // Junio, julio y agosto: los tres ya se facturaron (el día 1 ya pasó).
    expect(faltantes.map((f) => f.month)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(faltantes.map((f) => f.date)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
  })

  it('A8: no genera el mes en curso si el día de cobro todavía no llegó', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 28, created_at: '2026-07-01T00:00:00Z' })],
      methods,
      [],
      '2026-07',
      hoy, // 21 de agosto: el cobro del 28 de agosto todavía no ocurrió
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-07'])
  })

  it('A9: el piso es la creación del plan cuando es posterior al primer ingreso', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-07-15T00:00:00Z' })],
      methods,
      [],
      '2026-04',
      hoy,
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-07', '2026-08'])
  })

  it('A10: el piso es el primer ingreso cuando el plan es anterior', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2025-12-01T00:00:00Z' })],
      methods,
      [],
      '2026-08',
      hoy,
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-08'])
  })

  it('A11: no duplica un mes que ya tiene su transacción', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-07-01T00:00:00Z' })],
      methods,
      [tx({ date: '2026-08-01' })], // consumo de julio, ya posteado
      '2026-07',
      hoy,
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-08'])
  })

  it('A12: una transacción con la fecha editada a mano igual cuenta como cubierta', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-07-01T00:00:00Z' })],
      methods,
      [tx({ date: '2026-08-14' })], // mismo mes de vencimiento, otro día
      '2026-07',
      hoy,
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-08'])
  })

  it('ignora los planes inactivos y los que no se automatizan', () => {
    const faltantes = computeMissingAutomaticCharges(
      [
        plan({ id: 'p-inactivo', is_active: false, created_at: '2026-07-01T00:00:00Z' }),
        plan({ id: 'p-debito', payment_method_id: debito.id, created_at: '2026-07-01T00:00:00Z' }),
        plan({ id: 'p-anual', frequency: 'yearly', created_at: '2026-07-01T00:00:00Z' }),
      ],
      methods,
      [],
      '2026-07',
      hoy,
    )
    expect(faltantes).toEqual([])
  })

  it('la cobertura se mira por plan, no globalmente', () => {
    const faltantes = computeMissingAutomaticCharges(
      [
        plan({ id: 'p-a', created_at: '2026-08-01T00:00:00Z' }),
        plan({ id: 'p-b', created_at: '2026-08-01T00:00:00Z' }),
      ],
      methods,
      [tx({ recurring_plan_id: 'p-a', date: '2026-09-01' })],
      '2026-08',
      hoy,
    )
    expect(faltantes.map((f) => f.planId)).toEqual(['p-b'])
  })
})
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/recurring.test.ts`
Expected: FAIL — `computeMissingAutomaticCharges is not a function`.

- [ ] **Step 7: Implementar `computeMissingAutomaticCharges`**

Agregar a `src/lib/finance/recurring.ts`:

```ts
/**
 * Qué meses de consumo le faltan a cada plan automático.
 *
 * Cobertura: un mes M está cubierto si el plan ya tiene una transacción en el
 * MISMO MES de `expectedChargeDate(M)`. Como cada mes de consumo cae en un
 * resumen distinto, el mes de consumo se reconstruye sin necesidad de guardarlo
 * en la transacción. La regla mira el mes y no la fecha exacta a propósito: si
 * el usuario editó la fecha a mano, la transacción sigue contando como
 * cobertura y no se duplica.
 *
 * @param floorMonth 'yyyy-MM' del primer ingreso del usuario. Backfillear
 *   gastos en meses sin ingresos registrados hunde el saldo sin contrapartida.
 */
export function computeMissingAutomaticCharges(
  plans: RecurringPlan[],
  methods: PaymentMethod[],
  transactions: Pick<Transaction, 'recurring_plan_id' | 'date'>[],
  floorMonth: string,
  now: Date = new Date(),
): MissingCharge[] {
  const methodsById = new Map(methods.map((m) => [m.id, m]))
  const today = startOfDay(now)
  const currentMonth = format(today, 'yyyy-MM')
  const missing: MissingCharge[] = []

  for (const plan of plans) {
    if (!plan.is_active) continue
    const method = plan.payment_method_id ? methodsById.get(plan.payment_method_id) : undefined
    if (!method || !isAutomaticPlan(plan, method)) continue

    const planMonth = String(plan.created_at).slice(0, 7)
    const coveredMonths = new Set(
      transactions
        .filter((t) => t.recurring_plan_id === plan.id)
        .map((t) => String(t.date).slice(0, 7)),
    )

    let cursor = planMonth > floorMonth ? planMonth : floorMonth
    while (cursor <= currentMonth) {
      const chargeDay = String(chargeDayOf(plan, cursor)).padStart(2, '0')
      // El cobro del mes en curso todavía puede no haber ocurrido: la app no
      // afirma un débito que la tarjeta no hizo.
      if (startOfDay(parseLocalDate(`${cursor}-${chargeDay}`)) > today) break

      const date = expectedChargeDate(plan, method, cursor)
      if (!coveredMonths.has(date.slice(0, 7))) {
        missing.push({ planId: plan.id, month: cursor, date })
      }
      cursor = format(addMonths(parseLocalDate(`${cursor}-01`), 1), 'yyyy-MM')
    }
  }

  return missing
}
```

- [ ] **Step 8: Correr el test completo y verificar que pasa**

Run: `npx vitest run src/lib/finance/__tests__/recurring.test.ts`
Expected: PASS, todos los casos.

- [ ] **Step 9: Correr la suite entera y tsc**

```bash
npm test
npx tsc --noEmit
```
Expected: todo verde, 0 errores de tipos.

- [ ] **Step 10: Commit**

```bash
git add src/lib/finance/recurring.ts src/lib/finance/__tests__/recurring.test.ts
git commit -m "feat(mensualidades): motor puro de cargos automaticos de credito"
```

---

### Task 3: La server action y su disparo

Crea las transacciones faltantes, una vez por carga de la app.

**Files:**
- Modify: `src/app/compromisos/actions.ts` (agregar al final, junto a `backfillRecurringPlansHistory`)
- Modify: `src/lib/store/financeStore.ts` (dentro de `fetchAllData`, después de resolver el usuario)

**Interfaces:**
- Consumes: `computeMissingAutomaticCharges` de `@/lib/finance/recurring`.
- Produces: `syncAutomaticRecurringCharges(): Promise<ActionResponse & { created?: number }>`

- [ ] **Step 1: Escribir la action**

Agregar al final de `src/app/compromisos/actions.ts`:

```ts
/**
 * Postea las mensualidades de crédito que la tarjeta ya facturó y todavía no
 * existen como transacción. Idempotente: se puede llamar en cada carga.
 *
 * La fila creada es idéntica a la de `markRecurringPlanPaid` — misma categoría,
 * mismo medio, mismos campos de moneda heredados del plan — salvo por la fecha,
 * que acá es el vencimiento del resumen en vez del día en que se apretó el botón.
 */
export async function syncAutomaticRecurringCharges(): Promise<ActionResponse & { created?: number }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'No autorizado' };
    }

    const [
      { data: plans, error: plansError },
      { data: methods, error: methodsError },
      { data: existingTxs, error: txError },
      { data: firstIncomeTx, error: incomeError },
    ] = await Promise.all([
      supabase.from('recurring_plans').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('payment_methods').select('*').eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('recurring_plan_id, date')
        .eq('user_id', user.id)
        .not('recurring_plan_id', 'is', null),
      supabase
        .from('transactions')
        .select('date')
        .eq('user_id', user.id)
        .eq('type', 'income')
        .order('date', { ascending: true })
        .limit(1),
    ]);
    if (plansError || methodsError || txError || incomeError) {
      return { error: 'No se pudo leer el estado de las mensualidades' };
    }

    // Sin ingresos registrados no hay piso: mismo criterio que el backfill.
    const floorMonth = firstIncomeTx?.[0]?.date
      ? String(firstIncomeTx[0].date).slice(0, 7)
      : dateToLocalString(new Date()).slice(0, 7);

    const missing = computeMissingAutomaticCharges(
      plans ?? [],
      methods ?? [],
      existingTxs ?? [],
      floorMonth,
    );
    if (missing.length === 0) {
      return { success: true, created: 0 };
    }

    const plansById = new Map((plans ?? []).map((p) => [p.id, p]));
    const rows = missing.map(({ planId, date }) => {
      const plan = plansById.get(planId)!;
      const isUsd = plan.currency === 'USD';
      return {
        user_id: user.id,
        description: plan.description,
        amount: Math.abs(Number(plan.amount)),
        date,
        type: 'expense' as const,
        category_id: plan.category_id,
        payment_method_id: plan.payment_method_id,
        recurring_plan_id: plan.id,
        original_currency: isUsd ? 'USD' : 'ARS',
        original_amount: isUsd ? plan.original_amount : Math.abs(Number(plan.amount)),
        rate_pair: isUsd ? plan.rate_pair : null,
        exchange_rate: isUsd ? plan.exchange_rate : null,
      };
    });

    const { error: insertError } = await supabase.from('transactions').insert(rows);
    if (insertError) {
      console.error('Error posteando mensualidades automáticas:', insertError);
      return { error: `No se pudieron postear las mensualidades: ${insertError.message}` };
    }

    revalidatePath('/compromisos');
    revalidatePath('/');
    return { success: true, created: rows.length };
  } catch (e) {
    console.error('Error inesperado en syncAutomaticRecurringCharges:', e);
    return { error: 'Ocurrió un error inesperado' };
  }
}
```

Agregar el import arriba del archivo:

```ts
import { computeMissingAutomaticCharges } from '@/lib/finance/recurring';
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores. Si `plan.billing_day` no existe en el tipo, es que la Task 1 no regeneró `src/types/database.ts` — volver ahí.

- [ ] **Step 3: Disparar la sync desde el store**

En `src/lib/store/financeStore.ts`, agregar el import y un flag a nivel de módulo (fuera del `create`):

```ts
import { syncAutomaticRecurringCharges } from '@/app/compromisos/actions';

/**
 * Las mensualidades automáticas se sincronizan UNA VEZ por carga de la app, no
 * en cada `fetchAllData`: el chat refetchea después de cada escritura y no
 * corresponde pagar un round-trip por mensaje.
 */
let automaticChargesSynced = false;
```

Dentro de `fetchAllData`, inmediatamente después del `if (!authUser) { ... return; }` y **antes** del `Promise.all` que trae los datos:

```ts
      if (!automaticChargesSynced) {
        automaticChargesSynced = true;
        try {
          await syncAutomaticRecurringCharges();
        } catch (e) {
          // Que no rompa la carga: si falla, la app se abre igual y se
          // reintenta en la próxima sesión.
          console.error('No se pudieron sincronizar las mensualidades automáticas:', e);
        }
      }
```

- [ ] **Step 4: Verificar tipos y suite**

```bash
npx tsc --noEmit
npm test
```
Expected: 0 errores, suite verde.

- [ ] **Step 5: Verificar en la app (con datos reales)**

```bash
npm run dev
```

Abrir la app logueado y confirmar en la base:

```sql
select to_char(date,'YYYY-MM-DD') as fecha, count(*)
from public.transactions t join public.payment_methods pm on pm.id = t.payment_method_id
where t.user_id = '<tu user_id>' and t.recurring_plan_id is not null and pm.type='credit'
  and t.date >= '2026-07-01'
group by 1 order by 1;
```

Esperado: aparecen las mensualidades de julio y agosto fechadas al vencimiento de su tarjeta. **Recargar la app una segunda vez y volver a correr la consulta: los conteos NO deben cambiar** (idempotencia).

- [ ] **Step 6: Commit**

```bash
git add src/app/compromisos/actions.ts src/lib/store/financeStore.ts
git commit -m "feat(mensualidades): sync de cargos automaticos al abrir la app"
```

---

### Task 4: Persistir el día de cobro en el formulario

El stepper "Día de pago" **ya existe** en `PaymentMethodField`, pero hoy sólo aparece para medios de débito y su valor se descarta al guardar: la action no lo lee y la columna no existía. Esta task lo conecta, lo muestra también para crédito, y lo saca de los formularios donde nunca sirvió (transacciones y cuotas, que lo renderizan por el valor default de la prop).

**Files:**
- Modify: `src/lib/schemas/subscription.ts:18` y `:31` (`debit_payment_day` → `billing_day`)
- Modify: `src/components/transactions/transaction-form-fields.tsx:580-782` (`PaymentMethodField`)
- Modify: `src/components/subscriptions/create-subscription-dialog.tsx:56,65,180`
- Modify: `src/components/subscriptions/edit-subscription-dialog.tsx:42,71,79,96,196`
- Modify: `src/app/dashboard/subscriptions/actions.ts` (`createSubscription`, `updateSubscription`)

**Interfaces:**
- Consumes: `recurring_plans.billing_day` (Task 1).
- Produces: `billing_day` viaja del form a la base en crear y editar mensualidad.

- [ ] **Step 1: Renombrar el campo en los schemas Zod**

En `src/lib/schemas/subscription.ts`, en **ambos** schemas, reemplazar:

```ts
  debit_payment_day: z.number().min(1).max(28).optional(),
```

por:

```ts
  // Día del mes en que se factura. En crédito define en qué resumen cae; en
  // débito alimenta el "vence el X". Hasta 31: el motor clampea al último día
  // que el mes tenga.
  billing_day: z.number().min(1).max(31).optional(),
```

- [ ] **Step 2: Adaptar `PaymentMethodField`**

En `src/components/transactions/transaction-form-fields.tsx`:

1. En `PaymentMethodFieldProps`, reemplazar `debitFieldName?: string` y `watchedDebitDay?: number` por:

```ts
  billingFieldName?: string;
  watchedBillingDay?: number;
  /** Muestra el selector de día de cobro. Sólo los formularios que persisten
   *  `billing_day` (mensualidades) deben encenderlo: en los demás el valor se
   *  descarta al guardar. */
  showBillingDay?: boolean;
```

2. En la firma de la función, reemplazar los defaults por:

```ts
  billingFieldName = 'billing_day',
  watchedBillingDay,
  showBillingDay = false,
```

3. Cambiar la condición del bloque del stepper (hoy `selectedMethod?.type === 'debit' && setValue`) por:

```tsx
          {showBillingDay && selectedMethod && selectedMethod.type !== 'cash' && setValue && (
```

4. Cambiar el título del bloque:

```tsx
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted mb-3 block">
                ¿Qué día te lo cobran?
              </span>
```

5. Reemplazar en los tres lugares del stepper `watchedDebitDay` por `watchedBillingDay`, `debitFieldName` por `billingFieldName`, y el tope `28` por `31` (tanto en el `disabled` como en el `Math.min`).

- [ ] **Step 3: Actualizar los dos diálogos de mensualidad**

En `create-subscription-dialog.tsx` y `edit-subscription-dialog.tsx`, reemplazar cada `debit_payment_day` por `billing_day`, `watchedDebitDay` por `watchedBillingDay`, y en el JSX del `PaymentMethodField`:

```tsx
                billingFieldName="billing_day"
                watchedBillingDay={watchedBillingDay}
                showBillingDay
```

En `edit-subscription-dialog.tsx` el tipo local de la prop `subscription` (línea ~42) pasa a `billing_day?: number | null;`, y los dos `form.reset` a `billing_day: subscription.billing_day || undefined`.

- [ ] **Step 4: Persistir en las actions**

En `src/app/dashboard/subscriptions/actions.ts`:

- En `createSubscription`, agregar `billing_day` al destructuring de `validatedFields.data` y al objeto del `insert`:

```ts
        billing_day: billing_day ?? null,
```

- En `updateSubscription` (línea 85), agregar `billing_day` al destructuring:

```ts
    const { description, amount, is_active, category_id, payment_method_id, currency, rate_pair, exchange_rate, billing_day } = validatedFields.data;
```

y al objeto del `.update({ … })` (línea 96), junto a `payment_method_id`:

```ts
        billing_day: billing_day ?? null,
```

- [ ] **Step 5: Verificar que ningún otro formulario quedó roto**

```bash
grep -rn "debit_payment_day\|debitFieldName\|watchedDebitDay" src/
```
Expected: **cero resultados**. Después:

```bash
npx tsc --noEmit
npm run lint
```
Expected: 0 errores de tipos; lint sin superar el baseline (24 errors / 11 warnings).

- [ ] **Step 6: Verificar en la app**

Crear una mensualidad de prueba en una tarjeta de crédito con día de cobro 15, confirmar en la base que `billing_day = 15`, y **borrarla** (junto con cualquier transacción que la sync le haya generado). Editar después una mensualidad real, setearle su día de cobro y confirmar que persiste.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schemas/subscription.ts src/components/transactions/transaction-form-fields.tsx src/components/subscriptions src/app/dashboard/subscriptions/actions.ts
git commit -m "feat(mensualidades): el dia de cobro se guarda y aplica tambien a credito"
```

---

### Task 5: Compromisos separa lo automático de lo manual

**Files:**
- Modify: `src/app/compromisos/compromisos-client.tsx` (`SubscriptionCard` ~línea 240-290 y el panel de mensualidades ~línea 516-562)

**Interfaces:**
- Consumes: `isAutomaticPlan`, `expectedChargeDate` de `@/lib/finance/recurring`; `paymentMethods` del store.
- Produces: nada que otra task consuma.

- [ ] **Step 1: Chip informativo en la card automática**

En `SubscriptionCard`, obtener el medio del plan desde el store y calcular si es automática. Reemplazar el `<button>` del toggle por un render condicional: cuando el plan es automático, un chip **no accionable**; si no, el toggle de siempre.

```tsx
  const paymentMethods = useFinanceStore((s) => s.paymentMethods);
  const method = paymentMethods.find((m) => m.id === plan.payment_method_id);
  const isAutomatic = isAutomaticPlan(plan, method);
  const chargeLabel = (() => {
    if (!isAutomatic || !method) return null;
    const [y, m, d] = expectedChargeDate(plan, method, dateToLocalString(new Date()).slice(0, 7)).split('-');
    return `${method.name} · vence ${Number(d)}/${Number(m)}`;
  })();
```

Y en el JSX, en lugar del `{plan.is_active && (<button …>)}`:

```tsx
            {plan.is_active && (
              isAutomatic ? (
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] leading-none text-muted">
                  {chargeLabel}
                </span>
              ) : (
                <button /* …el botón actual, sin cambios… */ />
              )
            )}
```

Nota: `chargeLabel` usa el año en la desestructuración sólo para descartarlo; si el lint se queja por la variable sin usar, desestructurar como `const parts = …split('-')` y usar índices.

- [ ] **Step 2: Partir la lista en dos grupos**

En el panel de mensualidades, reemplazar el bloque "Activas" + `StaggeredList` único por dos secciones. Antes del `return`, calcular:

```tsx
  const automaticPlans = plansWithPayment.filter((p) =>
    isAutomaticPlan(p, paymentMethods.find((m) => m.id === p.payment_method_id)),
  );
  const manualPlans = plansWithPayment.filter((p) => !automaticPlans.includes(p));
  const automaticTotal = automaticPlans.reduce((acc, p) => acc + Math.abs(Number(p.amount)), 0);
  const manualTotal = manualPlans.reduce((acc, p) => acc + Math.abs(Number(p.amount)), 0);
```

Y renderizar cada grupo con el encabezado de sección que ya usa la pantalla (mismo `h2` con `font-display text-[18px]`), sólo si tiene ítems:

```tsx
                {automaticPlans.length > 0 && (
                  <>
                    <div className="flex items-baseline justify-between mt-1">
                      <h2 className="font-display text-text text-[18px]">Se debitan solas</h2>
                      <span className="text-[12.5px] font-bold text-muted tnum">{formatCurrency(automaticTotal)}</span>
                    </div>
                    <StaggeredList className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                      {automaticPlans.map((plan) => (
                        <StaggeredItem key={plan.id}>
                          <SubscriptionCard plan={plan} />
                        </StaggeredItem>
                      ))}
                    </StaggeredList>
                  </>
                )}
```

Repetir el bloque para `manualPlans` con el título **"Las pagás vos"** y `manualTotal`.

- [ ] **Step 3: "Por pagar" cuenta sólo lo manual**

El subtotal "Por pagar" de la card doble sale hoy de `pendingSubs.total`, que incluye las de crédito el día en que todavía no se posteó el cobro del mes. Acotarlo a los planes manuales:

```tsx
  const manualPendingTotal = pendingSubs.items
    .filter((item) => manualPlans.some((p) => p.id === item.id))
    .reduce((acc, item) => acc + item.amount, 0);
```

y usar `manualPendingTotal` en el JSX de esa card.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit
npm run lint
npm test
```
Expected: 0 errores de tipos, lint en baseline, suite verde.

- [ ] **Step 5: Verificar en pantalla**

`npm run dev` → `/compromisos` → tab Mensualidades, a 390px de ancho y en los dos temas (día y noche). Confirmar: dos grupos con sus subtotales, las automáticas sin toggle y con el chip de su tarjeta, las manuales con el toggle funcionando, y "Por pagar" contando sólo las manuales.

- [ ] **Step 6: Commit**

```bash
git add src/app/compromisos/compromisos-client.tsx
git commit -m "feat(compromisos): mensualidades separadas entre automaticas y manuales"
```

---

### Task 6: Documentación y cierre

**Files:**
- Modify: `docs/features/compromisos.md`
- Modify: `CLAUDE.md` (sección "Store" / "Medios de pago")

- [ ] **Step 1: Actualizar el doc de la feature**

En `docs/features/compromisos.md`: agregar `syncAutomaticRecurringCharges` a la tabla de archivos clave, un flujo nuevo ("Mensualidades automáticas de crédito") describiendo el mecanismo y el piso, y la invariante nueva en "Invariantes y gotchas":

> **Una mensualidad de crédito nunca está pendiente de acción.** Se postea sola, fechada al vencimiento del resumen, cuando su día de cobro ya pasó (`billing_day ?? 1`). Sólo aplica a planes mensuales sobre tarjetas con ciclo cargado; el resto sigue con el toggle manual. Borrar una transacción generada NO la elimina: vuelve en la próxima carga — para que un plan deje de postearse hay que desactivarlo.

- [ ] **Step 2: Actualizar el CLAUDE.md**

En la sección de mensualidades, dejar constancia de que `markRecurringPlanPaid` sigue siendo el camino manual y que las de crédito ya no pasan por ahí, más la existencia de `billing_day`.

- [ ] **Step 3: Verificación final completa**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```
Expected: suite verde, 0 errores de tipos, lint en baseline exacto, build de producción OK.

- [ ] **Step 4: Commit**

```bash
git add docs/features/compromisos.md CLAUDE.md
git commit -m "docs(mensualidades): flujo automatico de credito en la doc de la feature"
```

---

## Notas de ejecución

- **Orden obligatorio**: la Task 1 va primero y se aplica a producción antes que nada. El re-fechado histórico es seguro de aplicar con el código viejo desplegado: `prepareTransactions` deriva el `periodDate` desde la fecha de vencimiento, así que las lee igual (y de hecho las corrige — hoy el consumo de un mes se muestra en el anterior).
- **Gate visual antes del merge**: la Task 5 toca una pantalla que ya pasó por un gate de layout. Mirarla en día y noche a 390px antes de mergear.
- **Riesgo a vigilar**: la primera carga después de la Task 3 escribe en producción. Si algo sale mal, las filas creadas son identificables y borrables con
  `delete from public.transactions where user_id = '<id>' and recurring_plan_id is not null and date >= '2026-07-01';`
  (verificar con un `select` antes).
