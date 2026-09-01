# Ciclos de tarjeta — Plan 1: el motor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el resumen de tarjeta exista como entidad en la base y que la pertenencia de cada movimiento a su resumen esté escrita (`transactions.cycle_id`) en vez de derivarse de la aritmética de meses sobre `t.date`.

**Architecture:** Tabla `credit_card_cycles` (una fila por resumen) más `transactions.cycle_id` y `transactions.purchase_date`. Un módulo puro nuevo, `lib/finance/cycles.ts`, genera ciclos desde los defaults de la tarjeta y responde a qué ciclo pertenece una compra; `balances.ts` y `prepare.ts` dejan de contar meses y leen la FK. `default_closing_day` / `default_payment_day` sobreviven **como generador**, no como verdad. **La UI no cambia en este plan**: al terminar, la app muestra exactamente los mismos números, calculados sobre un modelo que ya puede representar ciclos desparejos.

**Tech Stack:** Next.js App Router · Supabase (PostgreSQL + RLS) · Zustand · TypeScript · Vitest · date-fns

**Spec:** `docs/superpowers/specs/2026-09-01-ciclos-tarjeta-design.md`

**Plan hermano:** la UI (declarar el ciclo, detalle agrupado por resumen, mover una compra al resumen vecino, E15) va en un **Plan 2**, que se escribe cuando este esté mergeado — mismo corte que usó el disponible anclado (Plan 1 motor / Plan 2 UI, 2026-08-20/21). Este plan produce software funcionando y verificable por sí solo.

## Global Constraints

- **El invariante central:** declarar un cierre nuevo NO reasigna ninguna transacción ya asignada. Sólo actualiza fechas de ciclos futuros con `source = 'generated'`. Una transacción cambia de resumen únicamente por acción explícita del usuario. Fijado en **E13**.
- **La regla del borde:** una compra hecha el día del cierre entra en el ciclo que cierra (el ciclo corre hasta las 23:59 de esa fecha). Fijado en **E16**.
- **Toda la lógica financiera vive en `lib/finance/`** como funciones puras, consumidas por el store (cliente) **y** por las tools del chat (servidor). Nada de cálculo en componentes ni en la capa de tools.
- **Los fixtures de ciclos van desparejos por defecto** (cierres 23-jul / 20-ago / 24-sep, vencimientos 3-ago / 1-sep / 5-oct). Fixturear ciclos mensuales perfectos es cómo se escondieron los dos últimos bugs grandes del repo (E8 con `totalARS === total`, el histórico con `periodDate === date`).
- **Las fechas se comparan como strings `yyyy-MM-dd`**, no como `Date`. El orden lexicográfico coincide con el cronológico y no depende de la TZ del runtime (Vercel corre en UTC, la máquina de desarrollo no). Es la lección de `rangoDelMes`.
- **`amount` se guarda siempre positivo**: el signo lo lleva `type`.
- **Nunca `any`.** Los clientes de Supabase van tipados con `<Database>`; si el tipo no cierra, se corrige `types/database.ts` contra la base, no se castea.
- **Migraciones**: `supabase migration new` → `db push --linked` (DEV) → `migration list --linked`. Producción es un paso explícito con `--db-url`, y va **antes del merge a `produccion`**, no antes del merge a `master`.
- **Verificación de cada task**: `npm test && npm run lint && npx tsc --noEmit`. El lint está en **0 errores** desde el 2026-08-29: un error nuevo es una regresión, no un baseline.
- **Alcance excluido de este plan** (del spec): recargos de compras en dólares, `declared_total` / conciliación contra el total del resumen, alta de cuotas en curso, importar el PDF del resumen.

## Estructura de archivos

**Se crean:**
- `supabase/migrations/<ts>_credit_card_cycles.sql` — tabla, columnas, RLS, índices
- `supabase/migrations/<ts>_backfill_credit_card_cycles.sql` — datos: 67 ciclos, `cycle_id`, `purchase_date`, realineado de `t.date` con guard
- `src/lib/finance/cycles.ts` — puro: generar ciclos, ubicar una compra, ciclo vigente / anterior
- `src/lib/finance/__tests__/cycles.test.ts`
- `src/lib/ciclos/asegurar.ts` — server-only: get-or-create de ciclos contra Supabase (patrón de `lib/categorias/descarte.ts`)
- `src/lib/ciclos/__tests__/asegurar.test.ts`
- `scripts/verificar-migracion-ciclos.mjs` — las dos fotos `(tarjeta, mes, suma)` y su diff

**Se modifican:**
- `src/types/database.ts` — tabla `credit_card_cycles` + las dos columnas nuevas de `transactions`, con `Relationships`
- `src/lib/finance/balances.ts` — pertenencia por `cycle_id`; ciclo vencido por `closing_date`
- `src/lib/finance/prepare.ts` — `periodDate` sale del cierre del ciclo; se borra la heurística del `+2`
- `src/lib/finance/types.ts` — `CreditCardCycleSummary` gana `cycleId`
- `src/lib/store/financeStore.ts` — query, estado y getters
- `src/lib/ai/tools/dataLoader.ts` — la misma query del lado del chat
- `src/lib/ai/tools/readTools.ts` — pasa los ciclos a las funciones puras
- `src/app/dashboard/transactions/actions.ts` — `cycle_id` + `purchase_date` en el alta
- `src/app/dashboard/installments/actions.ts` — la cuota N va al N-ésimo ciclo
- `src/app/compromisos/actions.ts` — `payCreditCardCycle` marca el ciclo; las mensualidades automáticas resuelven ciclo
- `src/lib/finance/recurring.ts` — `expectedChargeDate` deriva del ciclo
- `src/lib/ai/handlers.ts` — se retira el re-fechado de cuotas de `handleCardConfig`
- `src/lib/finance/__tests__/escenarios-disponible.test.ts` — E13, E14, E16, E17

**Sin tocar en este plan:** ningún componente de `src/components/`, con **una excepción declarada**: la Task 10 cambia la firma de `payCreditCardCycle` / `undoCreditCardPayment` y actualiza a sus dos llamadores (`credit-card-cycle-card.tsx`, `register-card-payment-dialog.tsx`). Es propagación de firma, no diseño. Cualquier otra necesidad de tocar UI significa que la task está mal cortada.

---

### Task 1: Schema — la tabla `credit_card_cycles` y las dos columnas de `transactions`

**Files:**
- Create: `supabase/migrations/<timestamp>_credit_card_cycles.sql`
- Modify: `src/types/database.ts`
- Test: la verificación va contra la base (no hay test unitario de DDL); `npx tsc --noEmit` cubre los tipos.

**Interfaces:**
- Consumes: nada
- Produces: `Database['public']['Tables']['credit_card_cycles']['Row']` con
  `{ id: string; user_id: string; payment_method_id: string; closing_date: string; due_date: string; source: 'generated' | 'declared'; created_at: string }`,
  más `transactions.cycle_id: string | null` y `transactions.purchase_date: string | null`.

**Contexto verificado contra producción (2026-09-01), no asumido:**
`transactions.user_id`, `payment_methods.user_id`, `installment_plans.user_id` y `users.id` son **todos `uuid`**. La migración `20260323000000_enable_rls_core_tables.sql` los llama "grupo B / INTEGER" y ese comentario es histórico: `get_current_user_int_id()` hoy declara `RETURNS uuid` y su cuerpo es `SELECT auth.uid()`. La política nueva usa `auth.uid()` directo — mismo valor, sin depender de un helper cuyo nombre miente.

- [ ] **Step 1: Crear el archivo de migración**

```bash
set -a; . ./.env.local; set +a
supabase migration new credit_card_cycles
```

- [ ] **Step 2: Escribir el SQL**

```sql
-- El resumen de tarjeta como entidad.
--
-- Por que: el cierre no es un dia fijo del mes. Verificado contra dos resumenes
-- reales de Galicia (1-sep-2026): la Visa cerro 23-jul, 20-ago y 24-sep --los tres
-- jueves-- contra un "dia 20" configurado. La app acertaba un ciclo de cada tres.
--
-- La pertenencia de una compra a su resumen pasa a estar ESCRITA (transactions.cycle_id)
-- en vez de derivarse de sameMonthYear(t.date, vencimiento). Ese es el invariante que
-- hace posible todo lo demas: declarar un cierre nuevo no mueve ninguna transaccion,
-- asi que el usuario puede corregir las fechas sin que se le re-fechen las cuotas.
--
-- default_closing_day / default_payment_day SOBREVIVEN como generador de los ciclos
-- futuros, no como verdad de los ya materializados.
--
-- Spec: docs/superpowers/specs/2026-09-01-ciclos-tarjeta-design.md

create table if not exists public.credit_card_cycles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id) on delete cascade,
  closing_date      date not null,
  due_date          date not null,
  -- 'generated' = la app lo estimo desde los defaults de la tarjeta.
  -- 'declared'  = el usuario lo leyo del resumen. Una regeneracion NUNCA pisa un declarado.
  source            text not null default 'generated' check (source in ('generated', 'declared')),
  created_at        timestamptz not null default now(),
  constraint credit_card_cycles_due_after_closing check (due_date >= closing_date),
  unique (payment_method_id, closing_date)
);

comment on table public.credit_card_cycles is
  'Un resumen de tarjeta. La pertenencia de una transaccion sale de transactions.cycle_id, no de la aritmetica de meses.';

create index if not exists credit_card_cycles_method_closing_idx
  on public.credit_card_cycles (payment_method_id, closing_date);

alter table public.credit_card_cycles enable row level security;

-- Mismo alcance que transactions_owner / payment_methods_owner: el dueno y nadie mas.
-- Se usa auth.uid() directo y no get_current_user_int_id(): esa funcion declara
-- RETURNS uuid y su cuerpo es "SELECT auth.uid()" -- el nombre quedo del modelo viejo.
create policy credit_card_cycles_owner on public.credit_card_cycles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.transactions
  add column if not exists cycle_id uuid references public.credit_card_cycles(id) on delete set null,
  -- Cuando se compro. Hoy en credito `date` es el VENCIMIENTO calculado y la fecha de
  -- compra no se guarda en ningun lado: al investigar el caso que origino el spec no
  -- hubo con que determinarla (created_at mide cuando se anoto, y se carga en tandas).
  add column if not exists purchase_date date;

comment on column public.transactions.cycle_id is
  'A que resumen pertenece. En un pago de tarjeta (card_payment_for) es el resumen que salda.';
comment on column public.transactions.purchase_date is
  'Fecha real de la compra. NULL = no se conoce (movimientos anteriores a esta columna).';

create index if not exists transactions_cycle_idx on public.transactions (cycle_id);
```

> **`on delete set null` y no `cascade`** en `transactions.cycle_id`: borrar un ciclo nunca puede borrar movimientos del usuario. Sin ciclo, la transacción cae al mismo branch que una tarjeta sin configurar.

- [ ] **Step 3: Aplicar en DEV y verificar el registro**

```bash
supabase db push --linked
supabase migration list --linked
```
Expected: la versión nueva aparece con Local y Remote coincidiendo.

- [ ] **Step 4: Verificar contra la base que la tabla existe y la policy aísla**

```bash
supabase db push --linked --dry-run
```
Expected: "Remote database is up to date" (no queda nada pendiente).

Y en el SQL editor de DEV: `select count(*) from public.credit_card_cycles;` → 0 filas **sin error**, y `select policyname, qual from pg_policies where tablename = 'credit_card_cycles';` → una fila, `credit_card_cycles_owner`, con `user_id = auth.uid()`.

- [ ] **Step 5: Agregar la tabla a `src/types/database.ts`**

Se edita **a mano**, como el resto del archivo: si se regenera desde el MCP se pierden las uniones literales de dominio (`'income' | 'expense'`, `'credit' | 'debit' | 'cash'`). En `Tables`, en orden alfabético:

```ts
      credit_card_cycles: {
        Row: {
          closing_date: string
          created_at: string
          due_date: string
          id: string
          payment_method_id: string
          source: 'generated' | 'declared'
          user_id: string
        }
        Insert: {
          closing_date: string
          created_at?: string
          due_date: string
          id?: string
          payment_method_id: string
          source?: 'generated' | 'declared'
          user_id: string
        }
        Update: {
          closing_date?: string
          created_at?: string
          due_date?: string
          id?: string
          payment_method_id?: string
          source?: 'generated' | 'declared'
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'credit_card_cycles_payment_method_id_fkey'
            columns: ['payment_method_id']
            isOneToOne: false
            referencedRelation: 'payment_methods'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'credit_card_cycles_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
```

Y en `transactions`, sumar `cycle_id: string | null` y `purchase_date: string | null` a `Row` (opcionales en `Insert` y `Update`), más esta entrada en `Relationships`:

```ts
          {
            foreignKeyName: 'transactions_cycle_id_fkey'
            columns: ['cycle_id']
            isOneToOne: false
            referencedRelation: 'credit_card_cycles'
            referencedColumns: ['id']
          },
```

- [ ] **Step 6: Verificar que TypeScript compila**

Run: `npx tsc --noEmit`
Expected: 0 errores. Las columnas nuevas son opcionales en `Insert`, así que ningún insert existente se rompe.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations src/types/database.ts
git commit -m "feat(ciclos): el resumen de tarjeta como tabla, y la fecha de compra"
```

---

### Task 2: `lib/finance/cycles.ts` — las funciones puras

**Files:**
- Create: `src/lib/finance/cycles.ts`
- Test: `src/lib/finance/__tests__/cycles.test.ts`

**Interfaces:**
- Consumes: el tipo `credit_card_cycles` de la Task 1
- Produces:
  - `type CreditCardCycle = Database['public']['Tables']['credit_card_cycles']['Row']`
  - `type CicloNuevo = Omit<CreditCardCycle, 'id' | 'created_at'>`
  - `ciclosDeMetodo(methodId: string, ciclos: CreditCardCycle[]): CreditCardCycle[]`
  - `generarCiclos(method: PaymentMethod, desde: Date, hasta: Date, existentes: CreditCardCycle[]): CicloNuevo[]`
  - `cicloDeCompra(purchaseDate: string, ciclos: CreditCardCycle[]): CreditCardCycle | undefined`
  - `cicloVigente(ciclos: CreditCardCycle[], now: Date): CreditCardCycle | undefined`
  - `cicloAnterior(ciclos: CreditCardCycle[], ciclo: CreditCardCycle): CreditCardCycle | undefined`
  - `cicloNEsimo(ciclos: CreditCardCycle[], desde: CreditCardCycle, n: number): CreditCardCycle | undefined`

> **Convención de todas estas funciones**: `ciclos` llega **ya filtrado por tarjeta y ordenado** (con `ciclosDeMetodo`), salvo en `generarCiclos`, que filtra sola. Mezclar tarjetas en el array de entrada es un bug del llamador, no un caso a contemplar.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/lib/finance/__tests__/cycles.test.ts
import { describe, it, expect } from 'vitest'
import {
  ciclosDeMetodo, generarCiclos, cicloDeCompra, cicloVigente, cicloAnterior, cicloNEsimo,
  type CreditCardCycle,
} from '../cycles'
import type { PaymentMethod } from '@/types/database'

// Los ciclos REALES de la Visa Galicia del resumen del 1-sep-2026. Van desparejos
// a proposito: los tres cierres son los tres jueves, y el dia calendario se corre
// hasta 4 dias. Un fixture mensual perfecto es como se escondieron los dos ultimos
// bugs grandes del repo (E8 con totalARS === total, el historico con periodDate === date).
const ciclo = (over: Partial<CreditCardCycle>): CreditCardCycle => ({
  id: 'c1', user_id: 'u1', payment_method_id: 'visa',
  closing_date: '2026-07-23', due_date: '2026-08-03',
  source: 'generated', created_at: '2026-01-01T00:00:00Z',
  ...over,
})

const JULIO = ciclo({ id: 'jul', closing_date: '2026-07-23', due_date: '2026-08-03' })
const AGOSTO = ciclo({ id: 'ago', closing_date: '2026-08-20', due_date: '2026-09-01' })
const SEPTIEMBRE = ciclo({ id: 'sep', closing_date: '2026-09-24', due_date: '2026-10-05' })
const TRES = [JULIO, AGOSTO, SEPTIEMBRE]

const visa = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: 'visa', user_id: 'u1', name: 'Visa', type: 'credit',
  default_closing_day: 20, default_payment_day: 1, created_at: '2026-01-01',
  is_personal: false, is_default: false, bucket: 'pocket',
  initial_balance: 0, initial_balance_at: null,
  ...over,
} as PaymentMethod)

describe('cicloDeCompra', () => {
  it('ubica la compra en el primer ciclo que cierra despues de ella', () => {
    expect(cicloDeCompra('2026-08-05', TRES)?.id).toBe('ago')
  })

  it('la compra del DIA del cierre entra en el ciclo que cierra (E16)', () => {
    // El ciclo corre hasta las 23:59 de la fecha de cierre. Es la regla del banco,
    // y coincide con lo que ya hacia calculateCreditPaymentDate (diaCompra > closingDay).
    expect(cicloDeCompra('2026-08-20', TRES)?.id).toBe('ago')
  })

  it('el dia siguiente al cierre ya es del ciclo que viene', () => {
    expect(cicloDeCompra('2026-08-21', TRES)?.id).toBe('sep')
  })

  it('sin ciclo que la contenga devuelve undefined, no inventa uno', () => {
    expect(cicloDeCompra('2026-11-01', TRES)).toBeUndefined()
  })
})

describe('cicloVigente', () => {
  it('el dia EXACTO del vencimiento el resumen sigue vigente: todavia lo debes', () => {
    expect(cicloVigente(TRES, new Date(2026, 8, 1))?.id).toBe('ago')
  })

  it('al dia siguiente del vencimiento avanza al proximo', () => {
    expect(cicloVigente(TRES, new Date(2026, 8, 2))?.id).toBe('sep')
  })

  it('sin ciclos futuros devuelve undefined', () => {
    expect(cicloVigente(TRES, new Date(2026, 11, 1))).toBeUndefined()
  })
})

describe('cicloAnterior', () => {
  it('devuelve el ciclo previo por fecha de cierre', () => {
    expect(cicloAnterior(TRES, SEPTIEMBRE)?.id).toBe('ago')
  })

  it('el primero no tiene anterior', () => {
    expect(cicloAnterior(TRES, JULIO)).toBeUndefined()
  })
})

describe('cicloNEsimo', () => {
  it('la cuota N cuenta RESUMENES, no meses (E14)', () => {
    // Vencimientos 3-ago, 1-sep y 5-oct: sumar meses a la primera daria 3-oct,
    // que no es ninguna fecha real de esta tarjeta.
    expect(cicloNEsimo(TRES, JULIO, 0)?.id).toBe('jul')
    expect(cicloNEsimo(TRES, JULIO, 2)?.due_date).toBe('2026-10-05')
  })

  it('sin suficientes ciclos materializados devuelve undefined', () => {
    expect(cicloNEsimo(TRES, JULIO, 5)).toBeUndefined()
  })
})

describe('generarCiclos', () => {
  it('pare un ciclo por mes desde los defaults de la tarjeta', () => {
    const nuevos = generarCiclos(visa(), new Date(2026, 6, 1), new Date(2026, 8, 1), [])
    expect(nuevos).toHaveLength(3)
    expect(nuevos[0]).toMatchObject({ closing_date: '2026-07-20', due_date: '2026-08-01', source: 'generated' })
  })

  it('cierra y vence en el MISMO mes cuando el vencimiento es posterior al cierre', () => {
    const m = visa({ default_closing_day: 10, default_payment_day: 25 })
    const nuevos = generarCiclos(m, new Date(2026, 6, 1), new Date(2026, 6, 1), [])
    expect(nuevos[0]).toMatchObject({ closing_date: '2026-07-10', due_date: '2026-07-25' })
  })

  it('NO genera un ciclo para un mes que ya tiene uno: un declarado nunca se pisa', () => {
    // El invariante central visto desde la generacion. El declarado de agosto cierra
    // el 27 y el default diria 20: aun asi no se agrega otro, porque la clave es el
    // MES del cierre y no la fecha exacta.
    const declarado = ciclo({ id: 'ago', closing_date: '2026-08-27', due_date: '2026-09-04', source: 'declared' })
    const nuevos = generarCiclos(visa(), new Date(2026, 7, 1), new Date(2026, 8, 1), [declarado])
    expect(nuevos).toHaveLength(1)
    expect(nuevos[0].closing_date).toBe('2026-09-20')
  })

  it('clampea al ultimo dia del mes cuando el dia configurado no existe', () => {
    const m = visa({ default_closing_day: 31, default_payment_day: 15 })
    const nuevos = generarCiclos(m, new Date(2026, 1, 1), new Date(2026, 1, 1), [])
    expect(nuevos[0].closing_date).toBe('2026-02-28')
  })

  it('genera hacia atras igual que hacia adelante', () => {
    const nuevos = generarCiclos(visa(), new Date(2025, 11, 1), new Date(2026, 0, 1), [])
    expect(nuevos.map((c) => c.closing_date)).toEqual(['2025-12-20', '2026-01-20'])
  })

  it('una tarjeta sin ciclo configurado no genera nada: no se le inventa uno', () => {
    const sinCiclo = visa({ default_closing_day: null })
    expect(generarCiclos(sinCiclo, new Date(2026, 6, 1), new Date(2026, 8, 1), [])).toEqual([])
    expect(generarCiclos(visa({ type: 'debit' }), new Date(2026, 6, 1), new Date(2026, 8, 1), [])).toEqual([])
  })
})

describe('ciclosDeMetodo', () => {
  it('filtra por tarjeta y ordena por cierre ascendente', () => {
    const otra = ciclo({ id: 'x', payment_method_id: 'master', closing_date: '2026-08-27' })
    const r = ciclosDeMetodo('visa', [SEPTIEMBRE, otra, JULIO, AGOSTO])
    expect(r.map((c) => c.id)).toEqual(['jul', 'ago', 'sep'])
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/lib/finance/__tests__/cycles.test.ts`
Expected: FAIL — `Failed to resolve import "../cycles"`.

- [ ] **Step 3: Escribir `src/lib/finance/cycles.ts`**

```ts
// src/lib/finance/cycles.ts
//
// El resumen de tarjeta como entidad. PURO: sin Zustand ni Supabase, como todo
// lo de lib/finance/ -- lo consumen el store (cliente) y las tools del chat (servidor).
//
// Las fechas se comparan como strings 'yyyy-MM-dd' y no como Date: el orden
// lexicografico coincide con el cronologico y no depende de la TZ del runtime
// (Vercel corre en UTC, la maquina de desarrollo no). Es la leccion de rangoDelMes.
//
// Spec: docs/superpowers/specs/2026-09-01-ciclos-tarjeta-design.md
import { addMonths, getDaysInMonth, setDate } from 'date-fns'
import { formatLocalDate } from '@/lib/utils/dates'
import type { Database, PaymentMethod } from '@/types/database'

export type CreditCardCycle = Database['public']['Tables']['credit_card_cycles']['Row']
export type CicloNuevo = Omit<CreditCardCycle, 'id' | 'created_at'>

/** Los ciclos de UNA tarjeta, ordenados por cierre ascendente. */
export function ciclosDeMetodo(methodId: string, ciclos: CreditCardCycle[]): CreditCardCycle[] {
  return ciclos
    .filter((c) => c.payment_method_id === methodId)
    .sort((a, b) => a.closing_date.localeCompare(b.closing_date))
}

/**
 * A que resumen pertenece una compra: el primero que cierra en su fecha o despues.
 *
 * El `>=` es la regla del borde: una compra hecha EL DIA del cierre entra en el
 * ciclo que cierra, porque el ciclo corre hasta las 23:59 de esa fecha. Es la regla
 * del banco, confirmada por el usuario, y es la que ya tenia calculateCreditPaymentDate
 * (saltaba de ciclo con `diaCompra > closingDay`, que con 27 > 27 da false).
 *
 * Devuelve undefined si ningun ciclo materializado la contiene: quien llame decide
 * si generar mas (asegurarCiclos) o dejar la transaccion sin ciclo. Nunca inventa uno.
 */
export function cicloDeCompra(purchaseDate: string, ciclos: CreditCardCycle[]): CreditCardCycle | undefined {
  return ciclos.filter((c) => c.closing_date >= purchaseDate)[0]
}

/**
 * El resumen vigente: el de menor vencimiento que todavia no paso.
 *
 * El dia EXACTO del vencimiento sigue siendo el vigente -- ese dia todavia hay que
 * pagarlo. Mismo criterio que tenia getCreditCycleDates, que esta funcion reemplaza.
 */
export function cicloVigente(ciclos: CreditCardCycle[], now: Date): CreditCardCycle | undefined {
  const hoy = formatLocalDate(now)
  return [...ciclos].sort((a, b) => a.due_date.localeCompare(b.due_date)).find((c) => c.due_date >= hoy)
}

/** El resumen inmediatamente anterior a `ciclo` por fecha de cierre. */
export function cicloAnterior(ciclos: CreditCardCycle[], ciclo: CreditCardCycle): CreditCardCycle | undefined {
  const previos = ciclos.filter((c) => c.closing_date < ciclo.closing_date)
  return previos[previos.length - 1]
}

/**
 * El ciclo que esta `n` resumenes despues de `desde` (n = 0 es `desde`).
 *
 * Las cuotas cuentan RESUMENES, no meses: con vencimientos reales de 4-sep y 9-oct,
 * addMonths(primera, 1) daria 4-oct, que no es ninguna fecha de esa tarjeta.
 */
export function cicloNEsimo(
  ciclos: CreditCardCycle[],
  desde: CreditCardCycle,
  n: number,
): CreditCardCycle | undefined {
  const i = ciclos.findIndex((c) => c.id === desde.id)
  if (i < 0) return undefined
  return ciclos[i + n]
}

/**
 * Pare los ciclos que faltan entre `desde` y `hasta` (ambos inclusive, por mes)
 * a partir de los defaults de la tarjeta.
 *
 * `default_closing_day` / `default_payment_day` sobreviven como GENERADOR, no como
 * verdad: paren el proximo ciclo cuando no hay dato mejor. Un mes que ya tiene ciclo
 * no se toca, sea 'generated' o 'declared' -- de ahi sale el invariante de que
 * regenerar nunca pisa lo que el usuario leyo del resumen.
 *
 * Limitacion asumida: UN ciclo por mes calendario. Los emisores relevados (Macro,
 * Ciudad, Galicia, Naranja X, Uala) cierran una vez por mes por tarjeta; el "cada
 * jueves" de Macro es un cierre por cartera, no cuatro para la misma tarjeta.
 */
export function generarCiclos(
  method: PaymentMethod,
  desde: Date,
  hasta: Date,
  existentes: CreditCardCycle[],
): CicloNuevo[] {
  const closingDay = method.default_closing_day
  const paymentDay = method.default_payment_day
  if (method.type !== 'credit' || !closingDay || !paymentDay) return []

  const mesesOcupados = new Set(
    ciclosDeMetodo(method.id, existentes).map((c) => c.closing_date.slice(0, 7)),
  )

  const nuevos: CicloNuevo[] = []
  let cursor = new Date(desde.getFullYear(), desde.getMonth(), 1)
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), 1)

  while (cursor <= fin) {
    const mes = formatLocalDate(cursor).slice(0, 7)
    if (!mesesOcupados.has(mes)) {
      const cierre = setDate(cursor, Math.min(closingDay, getDaysInMonth(cursor)))
      // paymentDay > closingDay: vence en el mismo mes del cierre (cierra 10, vence 25).
      // paymentDay <= closingDay: vence el mes siguiente (cierra 20, vence 1).
      const mesDelPago = paymentDay > closingDay ? cursor : addMonths(cursor, 1)
      const vencimiento = setDate(mesDelPago, Math.min(paymentDay, getDaysInMonth(mesDelPago)))
      nuevos.push({
        user_id: method.user_id,
        payment_method_id: method.id,
        closing_date: formatLocalDate(cierre),
        due_date: formatLocalDate(vencimiento),
        source: 'generated',
      })
    }
    cursor = addMonths(cursor, 1)
  }
  return nuevos
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/lib/finance/__tests__/cycles.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Verificar que el guard del borde puede fallar**

Cambiar temporalmente el `>=` de `cicloDeCompra` por `>` y correr de nuevo: el test "la compra del DIA del cierre" tiene que dar **rojo**. Revertir. Un test de borde que no se probó al revés no prueba nada — es la lección del 1-sep, cuando una regex con dos bytes de backspace invisibles daba rojo sobre un componente que estaba bien.

- [ ] **Step 6: Verificar el gate completo**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: toda la suite en verde, 0 errores de lint, 0 de tipos.

- [ ] **Step 7: Commit**

```bash
git add src/lib/finance/cycles.ts src/lib/finance/__tests__/cycles.test.ts
git commit -m "feat(ciclos): generar, ubicar y recorrer resumenes, como funciones puras"
```

---

### Task 3: La pertenencia al ciclo sale de `cycle_id`, no de la aritmética de meses

**Files:**
- Modify: `src/lib/finance/balances.ts:36-160` (`computePaymentMethodStatus`), `:161-172` (`hasCardPaymentInCycle`)
- Modify: `src/lib/finance/types.ts` (`CreditCardCycleSummary` gana `cycleId`)
- Modify: `src/lib/finance/__tests__/balances.test.ts` (los llamadores existentes pasan `cycles`)
- Test: `src/lib/finance/__tests__/escenarios-disponible.test.ts` (E13, E16)

**Interfaces:**
- Consumes: `ciclosDeMetodo`, `cicloVigente`, `CreditCardCycle` (Task 2)
- Produces:
  - `computePaymentMethodStatus(method, transactions, recurringPlans, now, cycles, cicloObjetivo?): PaymentMethodStatus` — **el 5º parámetro es requerido**
  - `hasCardPaymentInCycle(transactions, method, ciclo: CreditCardCycle): boolean` — cambia el 3er parámetro: recibe el ciclo, no una fecha
  - `CreditCardCycleSummary` suma `cycleId: string`

> **Por qué `cycles` es requerido y no tiene default `[]`**: con default, un llamador que se olvide de pasarlo hace que una tarjeta configurada caiga silenciosamente al branch de "saldo histórico" y muestre un número completamente distinto. Un parámetro requerido convierte ese olvido en un error de compilación. Los cuatro llamadores (`readTools.ts:133`, `financeStore.ts:958`, y los dos internos de `balances.ts`) se actualizan en esta misma task.

> **Tarjetas sin ciclo**: si `cicloVigente` devuelve `undefined` (tarjeta sin `default_closing_day`/`default_payment_day`, o sin ciclos materializados), se cae al branch de saldo histórico que ya existe — exactamente como hoy con `getCreditCycleDates`. Hay 2 tarjetas así en producción y **no se les inventa un ciclo**.

- [ ] **Step 1: Escribir E13 y E16 en `escenarios-disponible.test.ts`**

```ts
// Al final del archivo, después de E12.
import { computePaymentMethodStatus } from '../balances';
import type { CreditCardCycle } from '../cycles';

describe('E13 — declarar un cierre nuevo NO mueve ninguna transaccion de resumen', () => {
  // El invariante central del spec. Es la razon por la que la pertenencia se
  // persiste en vez de derivarse: si se derivara, tocar el cierre le re-fecharia
  // al usuario las 47 cuotas futuras todos los meses --que es exactamente lo que
  // hoy lo frena de corregir el dato-- y con la FK escrita no se mueve nada.
  const visa = (over: Partial<PaymentMethod> = {}): PaymentMethod => acct({
    id: 'visa', name: 'Visa', type: 'credit', is_default: false,
    default_closing_day: 20, default_payment_day: 1, initial_balance_at: null,
    ...over,
  });

  const cicloAgosto: CreditCardCycle = {
    id: 'ago', user_id: 'u1', payment_method_id: 'visa',
    closing_date: '2026-08-20', due_date: '2026-09-01',
    source: 'generated', created_at: '2026-01-01T00:00:00Z',
  };

  const compra = {
    id: 't1', user_id: 'u1', type: 'expense', amount: 50000,
    date: '2026-09-01', periodDate: '2026-08-20', realPaymentDate: '2026-09-01',
    payment_method_id: 'visa', cycle_id: 'ago', purchase_date: '2026-08-05',
    original_currency: 'ARS', original_amount: 50000,
  } as unknown as ProcessedTransaction;

  it('el total del resumen no cambia cuando el ciclo se re-declara con otras fechas', () => {
    const antes = computePaymentMethodStatus(visa(), [compra], [], NOW, [cicloAgosto], cicloAgosto);

    // El usuario lee el resumen y declara las fechas reales: cerro el 27 y vence el 4.
    const declarado: CreditCardCycle = {
      ...cicloAgosto, closing_date: '2026-08-27', due_date: '2026-09-04', source: 'declared',
    };
    // Y de paso cambia los defaults de la tarjeta, como hace todos los meses.
    const despues = computePaymentMethodStatus(
      visa({ default_closing_day: 27, default_payment_day: 4 }), [compra], [], NOW, [declarado], declarado,
    );

    expect(despues.projectedTotal).toBe(antes.projectedTotal);
    expect(despues.projectedTotal).toBe(-50000);
    // Lo unico que se movio son las fechas MOSTRADAS del resumen.
    expect(despues.nextPaymentDate).toEqual(new Date(2026, 8, 4));
  });

  it('una transaccion de OTRO ciclo no entra, aunque su t.date caiga en el mismo mes', () => {
    // Este es el caso que el modelo viejo no podia representar: dos resumenes
    // que vencen en el mismo mes calendario. sameMonthYear(t.date, vencimiento)
    // los mezclaba; cycle_id los separa.
    const cicloJulio: CreditCardCycle = {
      ...cicloAgosto, id: 'jul', closing_date: '2026-07-23', due_date: '2026-09-30',
    };
    const otra = { ...compra, id: 't2', cycle_id: 'jul', amount: 99999 } as ProcessedTransaction;

    const r = computePaymentMethodStatus(
      visa(), [compra, otra], [], NOW, [cicloJulio, cicloAgosto], cicloAgosto,
    );
    expect(r.projectedTotal).toBe(-50000);
  });
});

describe('E16 — la compra del dia del cierre entra en el ciclo que cierra', () => {
  it('se resuelve en cicloDeCompra, y el resumen la cuenta', () => {
    // La regla del banco: el ciclo corre hasta las 23:59 de la fecha de cierre.
    // Cubierto tambien en cycles.test.ts; aca se verifica de punta a punta que
    // esa asignacion es la que termina sumando al total del resumen.
    const ciclos: CreditCardCycle[] = [
      { id: 'ago', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
      { id: 'sep', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-09-24', due_date: '2026-10-05', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
    ];
    const elDiaDelCierre = cicloDeCompra('2026-08-20', ciclos);
    expect(elDiaDelCierre?.id).toBe('ago');

    const tx = {
      id: 't1', user_id: 'u1', type: 'expense', amount: 12345,
      date: '2026-09-01', periodDate: '2026-08-20', realPaymentDate: '2026-09-01',
      payment_method_id: 'visa', cycle_id: elDiaDelCierre?.id, purchase_date: '2026-08-20',
      original_currency: 'ARS', original_amount: 12345,
    } as unknown as ProcessedTransaction;

    const visa = acct({ id: 'visa', name: 'Visa', type: 'credit', is_default: false, default_closing_day: 20, default_payment_day: 1, initial_balance_at: null });
    const r = computePaymentMethodStatus(visa, [tx], [], NOW, ciclos, ciclos[0]);
    expect(r.projectedTotal).toBe(-12345);
  });
});
```

Agregar al principio del archivo: `import { cicloDeCompra } from '../cycles';`

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run src/lib/finance/__tests__/escenarios-disponible.test.ts`
Expected: FAIL — `computePaymentMethodStatus` todavía toma 4 argumentos y no conoce `cycle_id`.

- [ ] **Step 3: Cambiar `computePaymentMethodStatus`**

En `src/lib/finance/balances.ts`, reemplazar el cálculo de fechas del ciclo y la regla de pertenencia:

```ts
import { ciclosDeMetodo, cicloVigente, type CreditCardCycle } from '@/lib/finance/cycles'

export function computePaymentMethodStatus(
  method: PaymentMethod | undefined,
  transactions: ProcessedTransaction[],
  recurringPlans: RecurringPlan[],
  now: Date,
  cycles: CreditCardCycle[],
  cicloObjetivo?: CreditCardCycle,
): PaymentMethodStatus {
  if (!method)
    return { currentConsumption: 0, fixedCosts: 0, projectedTotal: 0, usdExpenses: 0, arsExpenses: 0 }

  // El resumen sobre el que se calcula: el vigente, o el que pida el llamador
  // (computePendingCreditCards pasa el anterior para el caso vencido).
  const ciclos = ciclosDeMetodo(method.id, cycles)
  const ciclo = cicloObjetivo ?? cicloVigente(ciclos, now)
  const nextClosingDate = ciclo ? parseLocalDate(ciclo.closing_date) : undefined
  const nextPaymentDate = ciclo ? parseLocalDate(ciclo.due_date) : undefined

  // ... fixedCosts igual que antes ...

  if (ciclo && nextPaymentDate) {
    // ...
    for (const t of transactions) {
      if (t.payment_method_id !== method.id || t.type !== 'expense') continue
      // Regla UNICA de pertenencia: la FK. Antes era sameMonthYear(t.date, vencimiento),
      // que no podia representar dos resumenes en el mismo mes calendario y se movia
      // sola cada vez que el usuario corregia el dia de vencimiento de la tarjeta.
      if (t.cycle_id !== ciclo.id) continue
      // ... el resto del cuerpo del for queda igual ...
    }

    // ... el bloque de mensualidades adheridas queda igual ...

    const refundsInCycle = transactions
      .filter((t) => t.payment_method_id === method.id && t.type === 'income' && t.cycle_id === ciclo.id)
      .reduce((acc, t) => acc + Number(t.amount), 0)

    // ... el resto igual ...
  }

  // ... branch de debito/efectivo/credito-sin-ciclo, sin cambios ...
}
```

> La condición del branch de crédito pasa de `if (nextPaymentDate)` a `if (ciclo && nextPaymentDate)` para que TypeScript estreche `ciclo` a no-`undefined` dentro del bloque. `sameMonthYear` deja de usarse acá; si no queda ningún otro uso en el archivo, sacarla del import (el lint lo marca).

- [ ] **Step 4: Cambiar `hasCardPaymentInCycle` para que reciba el ciclo**

```ts
/**
 * true si existe un pago (card_payment_for) imputado a ESTE resumen.
 *
 * Antes se buscaba por mes del vencimiento, y de ahi salia toda una clase de bug
 * de bordes de mes --el parche de rangoDelMes del 1-sep-2026-- porque una fecha
 * del dia 1 leida como Date cae en el mes anterior en zona negativa. Con el ciclo
 * como entidad la pregunta es directa: el pago apunta a este resumen o no.
 */
export function hasCardPaymentInCycle(
  transactions: ProcessedTransaction[],
  method: PaymentMethod,
  ciclo: CreditCardCycle,
): boolean {
  return transactions.some((t) => t.card_payment_for === method.id && t.cycle_id === ciclo.id)
}
```

- [ ] **Step 5: Actualizar los llamadores**

- `src/lib/store/financeStore.ts:958` → `computePaymentMethodStatus(method, transactions, recurringPlans, new Date(), get().creditCardCycles)` (el campo del store llega en la Task 6; hasta entonces, `[]` con un `TODO` **no**: esta task se ordena después de la 6 si hace falta — ver "Orden de ejecución" al final del plan).
- `src/lib/ai/tools/readTools.ts:133` → agregar `data.creditCardCycles` como 5º argumento.
- `src/lib/finance/__tests__/balances.test.ts` → los 8 llamadores pasan un array de ciclos coherente con el fixture; las transacciones del fixture ganan `cycle_id`.

- [ ] **Step 6: Correr los tests**

Run: `npx vitest run src/lib/finance/`
Expected: PASS, incluidos E13 y E16.

- [ ] **Step 7: Commit**

```bash
git add src/lib/finance src/lib/store src/lib/ai
git commit -m "feat(ciclos): la pertenencia al resumen sale de la FK, no del mes de la fecha"
```

---

### Task 4: El resumen vencido se busca por ciclo anterior, no restando un mes

**Files:**
- Modify: `src/lib/finance/balances.ts:190-290` (`resumenDelCiclo`, `computePendingCreditCards`)
- Test: `src/lib/finance/__tests__/balances.test.ts` (bloque "resúmenes vencidos sin pago")

**Interfaces:**
- Consumes: `cicloAnterior`, `cicloVigente`, `ciclosDeMetodo` (Task 2); `computePaymentMethodStatus` con ciclos (Task 3)
- Produces: `computePendingCreditCards(paymentMethods, transactions, recurringPlans, cycles, now): CreditCardCycleSummary[]` — `cycles` es el 4º parámetro; cada summary trae `cycleId`

- [ ] **Step 1: Escribir el test que falla**

```ts
// En balances.test.ts, dentro del describe de resúmenes vencidos.
it('con ciclos desparejos, el vencido es el ciclo ANTERIOR, no "un mes antes"', () => {
  // Vencimientos reales: 3-ago y 1-sep. subMonths(1-sep) daria 1-ago, que no es
  // ninguna fecha de esta tarjeta: el resumen viejo se perdia y el compromiso se
  // liberaba solo (E11). Con la entidad, "el anterior" es una consulta, no una resta.
  const ciclos: CreditCardCycle[] = [
    { id: 'jul', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-07-23', due_date: '2026-08-03', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
    { id: 'ago', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
  ];
  const consumo = [
    tx({ id: 'a', cycle_id: 'jul', amount: 30000, date: '2026-08-03' }),
    tx({ id: 'b', cycle_id: 'ago', amount: 50000, date: '2026-09-01' }),
  ];
  // Hoy es 5-ago: el de julio ya vencio y sigue sin pago.
  const r = computePendingCreditCards([visa, bolsillo()], consumo, [], ciclos, new Date(2026, 7, 5));

  const vencido = r.find((c) => c.isOverdue);
  expect(vencido?.cycleId).toBe('jul');
  expect(vencido?.total).toBe(30000);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/balances.test.ts`
Expected: FAIL — `computePendingCreditCards` toma 4 argumentos con `now` en 4º lugar.

- [ ] **Step 3: Reescribir `resumenDelCiclo` y `computePendingCreditCards`**

```ts
function resumenDelCiclo(
  method: PaymentMethod,
  transactions: ProcessedTransaction[],
  recurringPlans: RecurringPlan[],
  cycles: CreditCardCycle[],
  ciclo: CreditCardCycle,
  now: Date,
  isOverdue: boolean,
): CreditCardCycleSummary | null {
  const status = computePaymentMethodStatus(method, transactions, recurringPlans, now, cycles, ciclo)
  const { projectedTotal, nextPaymentDate, nextClosingDate, usdExpenses, arsExpenses } = status
  if (!nextPaymentDate || projectedTotal >= 0) return null

  const isCycleClosed = nextClosingDate
    ? !isBefore(startOfDay(now), startOfDay(nextClosingDate))
    : false

  const isPaidManually = hasCardPaymentInCycle(transactions, method, ciclo)
  if (isOverdue && isPaidManually) return null

  const isPending = isOverdue
    ? true
    : !isPaidManually && !isAfter(startOfDay(now), startOfDay(nextPaymentDate))

  return {
    cycleId: ciclo.id,
    methodId: method.id,
    name: method.name,
    total: Math.abs(projectedTotal),
    totalARS: arsExpenses,
    totalUSD: usdExpenses,
    nextPaymentDate,
    isCycleClosed,
    isPending,
    isPaidManually,
    isOverdue,
  }
}

export function computePendingCreditCards(
  paymentMethods: PaymentMethod[],
  transactions: ProcessedTransaction[],
  recurringPlans: RecurringPlan[],
  cycles: CreditCardCycle[],
  now: Date,
): CreditCardCycleSummary[] {
  const creditCards = paymentMethods.filter((m) => m.type === 'credit')
  const piso = pisoDeVencidos(paymentMethods)

  return creditCards.reduce<CreditCardCycleSummary[]>((acc, method) => {
    const ciclos = ciclosDeMetodo(method.id, cycles)
    const vigente = cicloVigente(ciclos, now)
    if (!vigente) return acc

    const resumenVigente = resumenDelCiclo(method, transactions, recurringPlans, cycles, vigente, now, false)
    if (resumenVigente) acc.push(resumenVigente)

    // El resumen inmediatamente anterior, si quedo impago. Con ciclos desparejos
    // "el anterior" es una consulta a la tabla y no subMonths(vencimiento, 1), que
    // apuntaba a una fecha que la tarjeta no tiene.
    //
    // El PISO no cambia: solo se retiene lo que vencio DESPUES del ultimo saldo
    // declarado del bolsillo. Un resumen anterior al ancla ya esta adentro de ese
    // saldo y retenerlo lo restaria dos veces --el agujero de -$850.613 del 21-ago.
    const anterior = cicloAnterior(ciclos, vigente)
    if (piso && anterior && isAfter(startOfDay(parseLocalDate(anterior.due_date)), piso)) {
      const vencido = resumenDelCiclo(method, transactions, recurringPlans, cycles, anterior, now, true)
      if (vencido) acc.push(vencido)
    }
    return acc
  }, [])
}
```

> **Sigue siendo UN ciclo hacia atrás.** El spec anota que la entidad convierte eso de límite del modelo en decisión, pero cambiar cuántos se retienen mueve el disponible de usuarios reales y **no entra en este plan**: acá el día del deploy ningún número puede cambiar. Actualizar el comentario del CLAUDE.md que hoy lo llama "limitación" para que diga que ahora es una decisión.

- [ ] **Step 4: Actualizar `CreditCardCycleSummary` y los llamadores**

En `src/lib/finance/types.ts`, agregar a `CreditCardCycleSummary`:

```ts
  /** El resumen al que corresponde. Es lo que permite imputarle el pago sin pasar por el mes. */
  cycleId: string
```

Llamadores: `financeStore.ts:963`, `readTools.ts:76` y `:130`, y los fixtures `summary()` de `escenarios-disponible.test.ts:34` (agregar `cycleId: 'c1'`).

- [ ] **Step 5: Correr los tests**

Run: `npm test`
Expected: toda la suite en verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/finance src/lib/store src/lib/ai
git commit -m "feat(ciclos): el resumen vencido es el ciclo anterior, no un mes menos"
```

---

### Task 5: `periodDate` sale del cierre del ciclo y se borra la heurística del `+2`

**Files:**
- Modify: `src/lib/finance/prepare.ts:34-77` (`prepareTransactions`)
- Test: `src/lib/finance/__tests__/prepare.test.ts`

**Interfaces:**
- Consumes: `ciclosDeMetodo`, `CreditCardCycle` (Task 2)
- Produces: `prepareTransactions(raw, methods, exchangeRates, dolarBlue, cycles): ProcessedTransaction[]` — `cycles` es el 5º parámetro, requerido

**Qué se borra y por qué:** hoy `periodDate` se adivina mirando el día del mes de `t.date` (`dayOfMonth <= method.default_payment_day + 2`), con un `+2` que no tiene justificación escrita en ningún lado. Con el ciclo materializado el mes visual es el **mes del cierre**, que es un dato, no una inferencia.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/finance/__tests__/prepare.test.ts
it('periodDate sale del cierre del ciclo, no de adivinar por el dia del mes', () => {
  const visa = { id: 'visa', type: 'credit', default_closing_day: 20, default_payment_day: 1 } as PaymentMethod
  const ciclos: CreditCardCycle[] = [
    { id: 'ago', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
  ]
  const raw = [{ id: 't1', date: '2026-09-01', cycle_id: 'ago', payment_method_id: 'visa', amount: 1000, type: 'expense', original_currency: 'ARS' }] as unknown as Transaction[]

  const [t] = prepareTransactions(raw, [visa], [], null, ciclos)
  expect(t.periodDate).toBe('2026-08-20')
})

it('con ciclos desparejos NO usa la heuristica del dia del mes', () => {
  // Vencimiento 9-oct con cierre 1-oct: la heuristica vieja (dayOfMonth <= paymentDay + 2)
  // no habria retrocedido el mes, y el consumo de octubre se mostraba en octubre
  // cuando pertenece al resumen que cerro el 1. El ciclo lo dice sin adivinar.
  const master = { id: 'm', type: 'credit', default_closing_day: 27, default_payment_day: 4 } as PaymentMethod
  const ciclos: CreditCardCycle[] = [
    { id: 'oct', user_id: 'u1', payment_method_id: 'm', closing_date: '2026-10-01', due_date: '2026-10-09', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  ]
  const raw = [{ id: 't2', date: '2026-10-09', cycle_id: 'oct', payment_method_id: 'm', amount: 500, type: 'expense', original_currency: 'ARS' }] as unknown as Transaction[]

  const [t] = prepareTransactions(raw, [master], [], null, ciclos)
  expect(t.periodDate).toBe('2026-10-01')
})

it('sin ciclo asignado, periodDate cae a t.date sin inventar un corrimiento', () => {
  const visa = { id: 'visa', type: 'credit', default_closing_day: 20, default_payment_day: 1 } as PaymentMethod
  const raw = [{ id: 't3', date: '2026-09-01', cycle_id: null, payment_method_id: 'visa', amount: 1000, type: 'expense', original_currency: 'ARS' }] as unknown as Transaction[]

  const [t] = prepareTransactions(raw, [visa], [], null, [])
  expect(t.periodDate).toBe('2026-09-01')
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/prepare.test.ts`
Expected: FAIL — `prepareTransactions` toma 4 argumentos.

- [ ] **Step 3: Reescribir el cálculo de `periodDate`**

```ts
export function prepareTransactions(
  raw: Transaction[],
  methods: PaymentMethod[],
  exchangeRates: ExchangeRate[],
  dolarBlue: DolarBlue | null,
  cycles: CreditCardCycle[],
): ProcessedTransaction[] {
  const ciclosPorId = new Map(cycles.map((c) => [c.id, c]))

  return raw.map((t) => {
    // El mes visual de un consumo de credito es el mes de CIERRE de su resumen.
    // Antes se adivinaba mirando el dia del mes de t.date contra
    // `default_payment_day + 2` --un +2 sin justificacion escrita--, que ademas
    // fallaba en cuanto el vencimiento real se movia dentro del mes.
    // Sin ciclo (tarjeta sin configurar, o movimiento no-credito) queda t.date.
    const ciclo = t.cycle_id ? ciclosPorId.get(t.cycle_id) : undefined
    const periodDate = ciclo ? ciclo.closing_date : t.date

    const amountArs =
      t.original_currency === 'USD' && t.original_amount != null
        ? t.original_amount * resolveRate(t.rate_pair, exchangeRates, dolarBlue, t.exchange_rate)
        : t.amount

    return { ...t, amount: amountArs, periodDate, realPaymentDate: t.date }
  })
}
```

El parámetro `methods` queda sin uso dentro de la función: **no se borra de la firma** en esta task (lo consumen 2 llamadores y sacarlo mezcla dos cambios en el mismo diff). Se marca con un comentario y se retira en el Plan 2, junto a la limpieza de `getCreditCycleDates`. Si el lint marca el parámetro sin uso, prefijarlo con `_`.

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run src/lib/finance/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance
git commit -m "feat(ciclos): el mes visual sale del cierre del resumen, sin heuristica"
```

---

### Task 6: Los ciclos entran a la carga de datos — el store y el chat, los dos

**Files:**
- Modify: `src/lib/store/financeStore.ts` (interfaz del estado, `Promise.all` de `fetchAllData`, `set`, y los getters que ya cambiaron de firma)
- Modify: `src/lib/ai/tools/dataLoader.ts` (interfaz `FinanceData`, `Promise.all`, `assertNoQueryError`)
- Modify: `src/lib/ai/tools/readTools.ts:76,130,133`
- Test: `src/lib/ai/tools/__tests__/` (paridad; el test duro llega en la Task 11)

**Interfaces:**
- Consumes: `CreditCardCycle` (Task 2); las firmas nuevas de las Tasks 3, 4 y 5
- Produces: `useFinanceStore.getState().creditCardCycles: CreditCardCycle[]` y `FinanceData.creditCardCycles: CreditCardCycle[]`

> **Los dos o ninguno.** Si los ciclos llegan sólo a un lado, el chat y la pantalla calculan sobre modelos distintos y vuelven a poder decir números distintos — que es exactamente la clase de bug que `lib/finance/` existe para prevenir.

- [ ] **Step 1: Sumar la query al store**

En la interfaz del estado, junto a `internalTransfers`:

```ts
  creditCardCycles: CreditCardCycle[];
```

Con `creditCardCycles: []` en el estado inicial, y en el `Promise.all` de `fetchAllData` (después de `internal_transfers`):

```ts
        supabase
          .from('credit_card_cycles')
          .select('*')
          .eq('user_id', authUser.id)
          .order('closing_date', { ascending: true }),
```

Desestructurar `{ data: creditCardCyclesData, error: creditCardCyclesError }`, sumarlo al chequeo de errores que ya existe para las demás tablas, y agregarlo al `set(...)` final como `creditCardCycles: (creditCardCyclesData as CreditCardCycle[]) ?? []`.

- [ ] **Step 2: Pasar los ciclos al `prepareTransactions` del store**

`financeStore.ts:628` pasa a:

```ts
      const cycles = (creditCardCyclesData as CreditCardCycle[]) ?? [];
      const processedTransactions = prepareTransactions(rawTransactions, methods, (exchangeRatesData as ExchangeRate[]) || [], dolarBlue, cycles);
```

Y los getters: `getPaymentMethodStatus` (`:958`) y `getPendingCreditCards` (`:963`) pasan `get().creditCardCycles`. El de `:1131` (`getCreditCycleDates(method, now)?.nextPaymentDate`) pasa a `cicloVigente(ciclosDeMetodo(methodId, get().creditCardCycles), now)` y lee `due_date` con `parseLocalDate`.

- [ ] **Step 3: Sumar la misma query al `dataLoader` del chat**

```ts
    supabase.from('credit_card_cycles').select('*').eq('user_id', userId),
```
en el `Promise.all`, con su `assertNoQueryError(ccc, 'credit_card_cycles')`, el campo `creditCardCycles` en `FinanceData` y el 5º argumento de `prepareTransactions`.

> `credit_card_cycles.user_id` es UUID y `ctx.userId` también (verificado: `users.id` = UID de auth). Mismo criterio que `transactions`.

- [ ] **Step 4: Actualizar `readTools.ts`**

Las tres llamadas (`:76`, `:130`, `:133`) pasan `data.creditCardCycles` en la posición que corresponde a cada firma nueva.

- [ ] **Step 5: Verificar el gate completo**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: todo en verde. **Acá es donde aparecen los llamadores olvidados**: si alguno quedó sin pasar `cycles`, `tsc` lo marca (por eso el parámetro es requerido).

- [ ] **Step 6: Verificar en el navegador contra DEV que nada cambió**

```bash
npm run build && npx next start -p 3100
```
Con la sesión del demo (método de `scripts/capture-demo.mjs`): abrir Compromisos y Medios de pago. Como todavía **no hay ciclos en la base** (el backfill es la Task 10), las tarjetas tienen que caer al branch de saldo histórico sin romper ninguna pantalla. Anotar los totales que muestra: son la foto "antes" que la Task 10 tiene que reproducir.

- [ ] **Step 7: Commit**

```bash
git add src/lib/store src/lib/ai
git commit -m "feat(ciclos): los resumenes entran a la carga del store y del chat"
```

---

### Task 7: `asegurarCiclos` — la generación perezosa contra la base

**Files:**
- Create: `src/lib/ciclos/asegurar.ts`
- Test: `src/lib/ciclos/__tests__/asegurar.test.ts`

**Interfaces:**
- Consumes: `generarCiclos`, `ciclosDeMetodo`, `CreditCardCycle` (Task 2)
- Produces: `asegurarCiclos(supabase, method, desde, hasta): Promise<CreditCardCycle[]>` — devuelve **todos** los ciclos de esa tarjeta, ordenados por cierre, con los faltantes ya insertados

**Por qué existe este módulo y no vive en `lib/finance/`:** toca Supabase. Mismo patrón y misma ubicación conceptual que `lib/categorias/descarte.ts` (el get-or-create de "Sin categoría"): la decisión es pura y vive en `lib/finance/cycles.ts`, la escritura vive acá.

**Cuándo se llama:** al crear una transacción de crédito, un plan de cuotas o una mensualidad automática. No hay cron ni proceso por lote — mismo criterio que `syncAutomaticRecurringCharges`. **Genera también hacia atrás**: cargar una compra vieja tiene que poder materializar los ciclos previos.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/ciclos/__tests__/asegurar.test.ts
import { describe, it, expect, vi } from 'vitest'
import { asegurarCiclos } from '../asegurar'
import type { PaymentMethod } from '@/types/database'

const visa = {
  id: 'visa', user_id: 'u1', name: 'Visa', type: 'credit',
  default_closing_day: 20, default_payment_day: 1,
} as PaymentMethod

/** Doble minimo del cliente: registra lo insertado y devuelve lo que se le siembra. */
function fakeSupabase(existentes: unknown[]) {
  const insertados: unknown[] = []
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: existentes, error: null }) }) }),
      upsert: (rows: unknown[]) => {
        insertados.push(...rows)
        return { select: () => Promise.resolve({ data: rows, error: null }) }
      },
    }),
  }
  return { client, insertados }
}

describe('asegurarCiclos', () => {
  it('inserta solo los meses que faltan', async () => {
    const existente = {
      id: 'ago', user_id: 'u1', payment_method_id: 'visa',
      closing_date: '2026-08-20', due_date: '2026-09-01',
      source: 'declared', created_at: '2026-01-01T00:00:00Z',
    }
    const { client, insertados } = fakeSupabase([existente])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble de test
    const r = await asegurarCiclos(client as any, visa, new Date(2026, 7, 1), new Date(2026, 9, 1))

    expect(insertados).toHaveLength(2) // septiembre y octubre; agosto ya estaba
    expect(r.map((c) => c.closing_date)).toEqual(['2026-08-20', '2026-09-20', '2026-10-20'])
  })

  it('no escribe nada si no falta ninguno', async () => {
    const todos = [
      { id: 'ago', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
    ]
    const { client, insertados } = fakeSupabase(todos)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble de test
    await asegurarCiclos(client as any, visa, new Date(2026, 7, 1), new Date(2026, 7, 1))
    expect(insertados).toHaveLength(0)
  })

  it('una tarjeta sin ciclo configurado no genera nada', async () => {
    const { client, insertados } = fakeSupabase([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble de test
    const r = await asegurarCiclos(client as any, { ...visa, default_closing_day: null } as PaymentMethod, new Date(2026, 7, 1), new Date(2026, 9, 1))
    expect(insertados).toHaveLength(0)
    expect(r).toEqual([])
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/ciclos/`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Escribir `src/lib/ciclos/asegurar.ts`**

```ts
// src/lib/ciclos/asegurar.ts
//
// Get-or-create de los resumenes de una tarjeta. La DECISION de que ciclos hacen
// falta es pura y vive en lib/finance/cycles.ts; aca solo esta la escritura.
// Mismo reparto que lib/categorias/descarte.ts.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, PaymentMethod } from '@/types/database'
import { ciclosDeMetodo, generarCiclos, type CreditCardCycle } from '@/lib/finance/cycles'

/**
 * Devuelve todos los ciclos de `method`, materializando los que falten entre
 * `desde` y `hasta` (por mes, ambos inclusive).
 *
 * Generacion perezosa: se llama al cargar un movimiento, no por cron. Genera
 * tambien hacia atras, porque cargar una compra vieja en cuotas necesita los
 * resumenes de entonces.
 *
 * El upsert va con `ignoreDuplicates` sobre la unique (payment_method_id,
 * closing_date): dos requests del mismo usuario en paralelo --el chat y la
 * pantalla, por ejemplo-- pueden intentar generar el mismo mes.
 */
export async function asegurarCiclos(
  supabase: SupabaseClient<Database>,
  method: PaymentMethod,
  desde: Date,
  hasta: Date,
): Promise<CreditCardCycle[]> {
  const { data: existentes, error } = await supabase
    .from('credit_card_cycles')
    .select('*')
    .eq('payment_method_id', method.id)
    .order('closing_date', { ascending: true })

  if (error) throw new Error(`No pude leer los resumenes de la tarjeta: ${error.message}`)

  const actuales = (existentes ?? []) as CreditCardCycle[]
  const faltantes = generarCiclos(method, desde, hasta, actuales)
  if (faltantes.length === 0) return ciclosDeMetodo(method.id, actuales)

  const { data: creados, error: insertError } = await supabase
    .from('credit_card_cycles')
    .upsert(faltantes, { onConflict: 'payment_method_id,closing_date', ignoreDuplicates: true })
    .select('*')

  if (insertError) throw new Error(`No pude crear los resumenes de la tarjeta: ${insertError.message}`)

  return ciclosDeMetodo(method.id, [...actuales, ...((creados ?? []) as CreditCardCycle[])])
}
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run src/lib/ciclos/`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ciclos
git commit -m "feat(ciclos): generacion perezosa de resumenes contra la base"
```

---

### Task 8: El alta de una compra guarda su ciclo y su fecha de compra

**Files:**
- Modify: `src/app/dashboard/transactions/actions.ts:33-80` (`createTransaction`) y el bloque equivalente de `updateTransaction` (`:129-150`)
- Test: `src/app/dashboard/transactions/__tests__/` (crear el archivo si no existe)

**Interfaces:**
- Consumes: `asegurarCiclos` (Task 7), `cicloDeCompra` (Task 2)
- Produces: toda transacción de crédito nueva sale con `cycle_id` y `purchase_date` persistidos; `date` se deriva del `due_date` de ese ciclo

**El cambio conceptual:** hoy `date` se calcula con `calculateCreditPaymentDate(fecha, closingDay, paymentDay)` — aritmética sobre los defaults. Pasa a salir del ciclo: se ubica la compra (`cicloDeCompra`) y `date = ciclo.due_date`. `calculateCreditPaymentDate` **no se borra** todavía: sigue viva para las tarjetas sin ciclo y se retira en el Plan 2.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/app/dashboard/transactions/__tests__/alta-credito.test.ts
import { describe, it, expect } from 'vitest'
import { cicloDeCompra, type CreditCardCycle } from '@/lib/finance/cycles'

// El alta completa toca Supabase y auth; lo que se fija aca es la REGLA que la
// action aplica: la fecha guardada sale del vencimiento del ciclo de la compra,
// no de sumar meses a los defaults de la tarjeta.
describe('alta de una compra con tarjeta', () => {
  const ciclos: CreditCardCycle[] = [
    { id: 'ago', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
    { id: 'sep', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-09-24', due_date: '2026-10-05', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  ]

  it('una compra despues del cierre vence en el resumen siguiente, con la fecha REAL de ese resumen', () => {
    const ciclo = cicloDeCompra('2026-08-21', ciclos)
    expect(ciclo?.id).toBe('sep')
    expect(ciclo?.due_date).toBe('2026-10-05') // y no el "dia 1" que dicen los defaults
  })
})
```

- [ ] **Step 2: Correr y verificar que pasa por la razón correcta**

Run: `npx vitest run src/app/dashboard/transactions/`
Expected: PASS (usa sólo funciones puras ya implementadas). Este test documenta la regla; lo que la Task tiene que lograr es que la **action** la aplique — se verifica en el Step 5 contra DEV.

- [ ] **Step 3: Cambiar `createTransaction`**

```ts
import { asegurarCiclos } from '@/lib/ciclos/asegurar';
import { cicloDeCompra } from '@/lib/finance/cycles';

    let storedDate = dateToLocalString(new Date(date));
    const purchaseDate = storedDate; // la fecha que eligio el usuario ES la de compra
    let cycleId: string | null = null;
    const resolvedMethodId = payment_method_id && payment_method_id !== 'none' ? payment_method_id : null;

    if (resolvedMethodId) {
      const { data: method } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('id', resolvedMethodId)
        .eq('user_id', user.id)
        .single();

      if (!method) return { error: 'Medio de pago inválido' };

      if (type === 'expense' && method.type === 'credit' && method.default_closing_day && method.default_payment_day) {
        // Se materializan los resumenes alrededor de la compra: uno hacia atras
        // (una compra vieja puede caer en un ciclo que todavia no existe) y dos
        // hacia adelante (margen para que cicloDeCompra encuentre destino).
        const ciclos = await asegurarCiclos(
          supabase,
          method,
          subMonths(parseLocalDate(purchaseDate), 1),
          addMonths(parseLocalDate(purchaseDate), 2),
        );
        const ciclo = cicloDeCompra(purchaseDate, ciclos);
        if (ciclo) {
          cycleId = ciclo.id;
          storedDate = ciclo.due_date;
        } else {
          // No deberia pasar con el margen de arriba. Si pasa, la compra se guarda
          // igual con la fecha estimada y sin ciclo: perder el movimiento seria peor
          // que perder la imputacion, y sin cycle_id cae al branch de "sin ciclo".
          storedDate = calculateCreditPaymentDate(storedDate, method.default_closing_day, method.default_payment_day);
        }
      }
    }
```

Y en el `insert`, agregar `cycle_id: cycleId` y `purchase_date: type === 'expense' ? purchaseDate : null`.

- [ ] **Step 4: Hacer lo mismo en `updateTransaction`**

El bloque de `methodChanged` (`:134-150`) recalcula la fecha al cambiar de medio: pasa a re-resolver el ciclo con la misma lógica. **Si el medio no cambió, `cycle_id` no se toca** — eso es el invariante E13 aplicado a la edición: editar la descripción o el monto de una compra nunca la mueve de resumen.

- [ ] **Step 5: Verificar contra DEV, en el navegador**

```bash
npm run build && npx next start -p 3100
```
Con la sesión del demo: cargar un gasto con la tarjeta de crédito y confirmar en la base (`select date, purchase_date, cycle_id from transactions order by created_at desc limit 1`) que las tres columnas vienen pobladas y que `date` es exactamente el `due_date` del ciclo apuntado.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/transactions
git commit -m "feat(ciclos): la compra guarda su resumen y su fecha de compra"
```

---

### Task 9: La cuota N va al N-ésimo resumen (E14)

**Files:**
- Modify: `src/app/dashboard/installments/actions.ts:35-105` (`createInstallmentPlan`)
- Test: `src/lib/finance/__tests__/escenarios-disponible.test.ts` (E14)

**Interfaces:**
- Consumes: `asegurarCiclos` (Task 7), `cicloDeCompra`, `cicloNEsimo` (Task 2)
- Produces: cada cuota sale con `cycle_id` propio y `date = due_date` de su ciclo

**El defecto que arregla:** hoy la cuota N se fecha con `addMonths(primera, N)`. Con vencimientos reales de 4-sep y 9-oct, eso da 4-oct — una fecha que esa tarjeta no tiene.

- [ ] **Step 1: Escribir E14**

```ts
describe('E14 — la cuota N cae en el N-esimo resumen, no a N meses de la primera', () => {
  const ciclos: CreditCardCycle[] = [
    { id: 'c0', user_id: 'u1', payment_method_id: 'master', closing_date: '2026-07-30', due_date: '2026-08-07', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
    { id: 'c1', user_id: 'u1', payment_method_id: 'master', closing_date: '2026-08-27', due_date: '2026-09-04', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
    { id: 'c2', user_id: 'u1', payment_method_id: 'master', closing_date: '2026-10-01', due_date: '2026-10-09', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  ];

  it('las tres cuotas toman las fechas REALES de los tres resumenes', () => {
    // Fechas reales de la Mastercard Galicia (resumen del 1-sep-2026).
    // addMonths(7-ago, 1) daria 7-sep y addMonths(7-ago, 2) daria 7-oct:
    // ninguna de las dos es una fecha de vencimiento de esta tarjeta.
    const compra = cicloDeCompra('2026-07-15', ciclos);
    expect(compra?.id).toBe('c0');

    const fechas = [0, 1, 2].map((n) => cicloNEsimo(ciclos, compra!, n)?.due_date);
    expect(fechas).toEqual(['2026-08-07', '2026-09-04', '2026-10-09']);
  });

  it('si faltan resumenes materializados, la ultima cuota no se inventa una fecha', () => {
    const compra = cicloDeCompra('2026-07-15', ciclos);
    expect(cicloNEsimo(ciclos, compra!, 3)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr y verificar que pasa**

Run: `npx vitest run src/lib/finance/__tests__/escenarios-disponible.test.ts -t E14`
Expected: PASS — E14 fija la regla sobre las funciones puras. Lo que falta es que la action la use, y eso lo verifica el Step 5.

- [ ] **Step 3: Cambiar `createInstallmentPlan`**

Reemplazar el cálculo de `firstInstallmentDateStr` + el `Array.from` de las cuotas:

```ts
    let ciclosDelPlan: CreditCardCycle[] = [];
    let cicloInicial: CreditCardCycle | undefined;

    if (finalPaymentMethodId) {
      const { data: pm } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('id', finalPaymentMethodId)
        .eq('user_id', user.id)
        .single();

      if (!pm) return { error: 'Medio de pago inválido' };

      if (pm.type === 'credit' && pm.default_closing_day && pm.default_payment_day) {
        // Hasta el ultimo resumen que el plan necesita, mas uno de margen.
        ciclosDelPlan = await asegurarCiclos(
          supabase,
          pm,
          subMonths(parseLocalDate(purchaseDateStr), 1),
          addMonths(parseLocalDate(purchaseDateStr), installments_count + 1),
        );
        cicloInicial = cicloDeCompra(purchaseDateStr, ciclosDelPlan);
      }
    }

    // ... el insert del plan queda igual ...

    const installmentAmount = total_amount / installments_count;
    const transactions = Array.from({ length: installments_count }, (_, i) => {
      // La cuota i va al i-esimo RESUMEN. Antes se sumaban meses a la primera, que
      // con ciclos desparejos da fechas que la tarjeta no tiene (4-sep + 1 mes = 4-oct,
      // cuando el resumen siguiente vence el 9-oct).
      const ciclo = cicloInicial ? cicloNEsimo(ciclosDelPlan, cicloInicial, i) : undefined;
      return {
        user_id: user.id,
        description: `${description} (${i + 1}/${installments_count})`,
        amount: installmentAmount,
        date: ciclo ? ciclo.due_date : formatLocalDate(addMonths(parseLocalDate(fallbackFirstDate), i)),
        purchase_date: purchaseDateStr,
        cycle_id: ciclo?.id ?? null,
        type: 'expense' as const,
        category_id,
        installment_plan_id: plan.id,
        payment_method_id: finalPaymentMethodId,
      };
    });
```

donde `fallbackFirstDate` es el `firstInstallmentDateStr` que la función ya calculaba (débito/efectivo, o crédito sin ciclo): se conserva ese cálculo para esos casos.

- [ ] **Step 4: Correr la suite**

Run: `npm test && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 5: Verificar contra DEV, en el navegador**

Cargar un plan de 3 cuotas con una tarjeta que tenga ciclos **desparejos** en DEV (sembrarlos a mano con un `insert` en `credit_card_cycles` con las tres fechas de la Mastercard) y confirmar en la base que las tres cuotas quedaron con `date` = 2026-08-07, 2026-09-04 y 2026-10-09, cada una con su `cycle_id` distinto.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/installments src/lib/finance/__tests__
git commit -m "feat(ciclos): las cuotas cuentan resumenes, no meses"
```

---

### Task 10: El pago se imputa al resumen, y las mensualidades también

**Files:**
- Modify: `src/app/compromisos/actions.ts:149-234` (`payCreditCardCycle`), `:240-280` (`undoCreditCardPayment`), `:409-495` (`syncAutomaticRecurringCharges`)
- Modify: `src/lib/finance/recurring.ts:31-43` (`expectedChargeDate`)
- Test: `src/lib/finance/__tests__/recurring.test.ts`

**Interfaces:**
- Consumes: `asegurarCiclos` (Task 7), `cicloDeCompra`, `cicloVigente` (Task 2)
- Produces: `payCreditCardCycle` acepta `cycleId: string` y lo persiste en la transacción de pago; `expectedChargeDatePorCiclo(plan, month, ciclos)` reemplaza a `expectedChargeDate`

> **Esta task es la que hace visible el trabajo de la Task 3.** `hasCardPaymentInCycle` ya pregunta por `cycle_id`: hasta que el pago lo guarde, **ninguna tarjeta figura como pagada**. Las Tasks 3, 4 y 10 tienen que estar las tres antes de cualquier verificación de punta a punta.

- [ ] **Step 1: Escribir el test que falla**

```ts
// En src/lib/finance/__tests__/recurring.test.ts
it('la mensualidad cae en el resumen que le corresponde, con la fecha real del ciclo', () => {
  const ciclos: CreditCardCycle[] = [
    { id: 'ago', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
    { id: 'sep', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-09-24', due_date: '2026-10-05', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  ]
  // Netflix se cobra el 25: cae DESPUES del cierre del 20, o sea en el resumen siguiente.
  const plan = { id: 'p1', billing_day: 25, frequency: 'monthly' } as RecurringPlan
  const r = expectedChargeDatePorCiclo(plan, '2026-08', ciclos)
  expect(r).toEqual({ cycleId: 'sep', date: '2026-10-05' })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/recurring.test.ts`
Expected: FAIL — `expectedChargeDatePorCiclo` no existe.

- [ ] **Step 3: Agregar `expectedChargeDatePorCiclo` a `recurring.ts`**

```ts
/**
 * En que resumen cae el consumo de `month` y con que fecha, segun los ciclos
 * materializados. Reemplaza a expectedChargeDate, que derivaba la fecha de los
 * defaults de la tarjeta con calculateCreditPaymentDate.
 *
 * Devuelve undefined si no hay ciclo que contenga ese dia de cobro: el llamador
 * genera los que falten (asegurarCiclos) antes de reintentar.
 */
export function expectedChargeDatePorCiclo(
  plan: RecurringPlan,
  month: string,
  ciclos: CreditCardCycle[],
): { cycleId: string; date: string } | undefined {
  const day = String(chargeDayOf(plan, month)).padStart(2, '0')
  const ciclo = cicloDeCompra(`${month}-${day}`, ciclos)
  return ciclo ? { cycleId: ciclo.id, date: ciclo.due_date } : undefined
}
```

`expectedChargeDate` se conserva para las tarjetas sin ciclo materializado y como fallback; `computeMissingAutomaticCharges` gana un parámetro `ciclos` y usa la versión por ciclo cuando la hay. **La regla de cobertura no cambia**: un mes está cubierto si el plan ya tiene una transacción en el mismo mes de la fecha esperada.

- [ ] **Step 4: `payCreditCardCycle` recibe e imputa el ciclo**

```ts
export async function payCreditCardCycle(params: {
  cardMethodId: string;
  fundingMethodId: string;
  amountArs: number;
  date: string;
  cardName: string;
  cycleId: string;   // el resumen que este pago salda
}): Promise<ActionResponse> {
```

El guard anti-duplicado deja de mirar el rango del mes y pregunta por el ciclo:

```ts
    // Guard anti-duplicado: ya hay un pago imputado a ESTE resumen.
    // Antes se buscaba por rango de mes (rangoDelMes), que fue el parche del bug
    // de la Visa que vence el dia 1. Con el ciclo como entidad la pregunta no
    // depende de ninguna aritmetica de fechas.
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('card_payment_for', cardMethodId)
      .eq('cycle_id', cycleId)
      .limit(1);
    if (existing && existing.length > 0) return { success: true };
```

Y el `insert` suma `cycle_id: cycleId`. `undoCreditCardPayment` pasa a borrar por `cycle_id` en vez de por rango de mes (su firma cambia de `{ cardMethodId, year, month }` a `{ cardMethodId, cycleId }`).

> **Los llamadores de UI de estas dos actions se actualizan acá**, aunque el plan diga "sin UI": son cambios de firma, no de diseño. Son `credit-card-cycle-card.tsx` y `register-card-payment-dialog.tsx`, que ya reciben el summary y ahora leen su `cycleId`. El diálogo de registrar pago de **meses anteriores** necesita el ciclo correspondiente: si no lo tiene a mano, el botón queda deshabilitado con "sin resumen cargado para ese mes" — la funcionalidad completa (elegir resumen) es del Plan 2.

- [ ] **Step 5: `syncAutomaticRecurringCharges` asegura ciclos y persiste `cycle_id`**

Antes del cálculo de faltantes, para cada tarjeta con planes automáticos: `asegurarCiclos(supabase, method, primerMesDelPlan, hoy + 1 mes)`. Las filas insertadas suman `cycle_id` y `purchase_date` (el día de cobro del mes, que para una mensualidad **sí** se conoce).

- [ ] **Step 6: Correr la suite**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add src/app/compromisos src/lib/finance src/components/compromisos
git commit -m "feat(ciclos): el pago y las mensualidades se imputan al resumen"
```

---

### Task 11: Se retira el re-fechado de cuotas del chat

**Files:**
- Modify: `src/lib/ai/handlers.ts:441-500` (`handleCardConfig`), `:91-98` (`calculateRealPaymentDate`), y las tres altas (`handleTransaction`, `handleInstallment`, `handleSubscription`)
- Test: `src/lib/ai/__tests__/` (agregar al archivo de handlers existente)

**El hallazgo:** `handleCardConfig` hoy, al cambiar el cierre/vencimiento de una tarjeta desde el chat, **re-fecha todas las transacciones futuras**: recalcula cada cuota desde `purchase_date` del plan y mueve el día de las compras simples "dentro del mismo mes" (`handlers.ts:466-497`). Es exactamente lo que el spec descarta como "peor que el problema" — y el Status del proyecto afirmaba que no pasaba, porque no pasa por la UI de medios de pago, sólo por el chat. Con el modelo nuevo **viola el invariante central**.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('editar el ciclo de la tarjeta NO mueve ninguna transaccion (E13 desde el chat)', async () => {
  // handleCardConfig re-fechaba las cuotas futuras desde purchase_date. Con la
  // pertenencia persistida eso es justo lo que no puede pasar: al usuario le
  // moveria las 47 cuotas cada vez que copia el dia real del resumen.
  const updates: unknown[] = []
  const supabase = fakeSupabaseQueRegistra(updates)
  await handleCardConfig({ cardName: 'Visa', closingDay: 27, paymentDay: 4 }, supabase, 'u1')

  expect(updates.filter((u) => u.table === 'transactions')).toHaveLength(0)
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/ai/`
Expected: FAIL — hoy hay updates sobre `transactions`.

- [ ] **Step 3: Borrar el bloque de re-fechado**

Se elimina entero el `try` de "Actualizar transacciones futuras" (`handlers.ts:441-500`). El mensaje de éxito suma una línea que dice la verdad nueva:

```ts
    return {
      success: true,
      message: `✅ Tarjeta ${method.name} actualizada:\n- Cierre: día ${data.closingDay}\n- Vencimiento: día ${data.paymentDay}\n\nLos movimientos que ya cargaste no se movieron de resumen: esto cambia los resúmenes que se generen de acá en adelante.`,
    }
```

- [ ] **Step 4: Las tres altas del chat persisten ciclo y fecha de compra**

`handleTransaction`, `handleInstallment` y `handleSubscription` resuelven `cycle_id` y `purchase_date` con `asegurarCiclos` + `cicloDeCompra`, igual que las server actions de las Tasks 8 y 9. `calculateRealPaymentDate` (`:91`) pasa a derivar del ciclo, con `calculateCreditPaymentDate` como fallback para tarjetas sin ciclo.

> Si el chat y las actions divergieran acá, el chat volvería a poder cargar una compra en un resumen distinto al que le asignaría la pantalla — que es el tipo de divergencia que `lib/finance/` existe para prevenir. Las dos rutas llaman a las mismas dos funciones.

- [ ] **Step 5: Correr la suite y el gate**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai
git commit -m "fix(ciclos): editar la tarjeta desde el chat ya no re-fecha las cuotas"
```

---

### Task 12: La migración de datos, con la foto antes y después

**Files:**
- Create: `supabase/migrations/<timestamp>_backfill_credit_card_cycles.sql`
- Create: `scripts/verificar-migracion-ciclos.mjs`
- Test: la verificación es el script; no hay test unitario de un backfill

**Interfaces:**
- Consumes: la tabla de la Task 1
- Produces: 67 ciclos, `cycle_id` en los 430 movimientos de crédito, `purchase_date` en las 326 cuotas

**El invariante duro de esta task:** *el total a pagar de cada tarjeta, por mes, idéntico antes y después.* Cualquier diferencia distinta de cero aborta la migración. **El día del deploy no cambia ningún monto, ningún total ni ninguna pertenencia** — sólo se escribe explícitamente la agrupación que los datos ya tenían, y se unifican fechas mostradas dentro del mismo mes.

- [ ] **Step 1: Escribir el script de verificación (antes que la migración)**

`scripts/verificar-migracion-ciclos.mjs` — se corre **dos veces**, con `--foto antes` y `--foto despues`, y una tercera con `--diff`. Guarda las fotos en el scratchpad como JSON.

```js
// scripts/verificar-migracion-ciclos.mjs
//
// El invariante duro de la migracion de ciclos: el total a pagar de cada tarjeta,
// por mes, identico antes y despues. Cualquier diferencia aborta.
//
// Uso:
//   node scripts/verificar-migracion-ciclos.mjs --foto antes
//   (aplicar la migracion)
//   node scripts/verificar-migracion-ciclos.mjs --foto despues
//   node scripts/verificar-migracion-ciclos.mjs --diff
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, readFileSync } from 'node:fs'

// Mismo guard duro que seed-demo-user.mjs: el ref de produccion, prohibido por
// defecto. Correr esto contra prod exige --permitir-produccion explicito.
const REF_PRODUCCION = 'mkkgdjxaotgimqwhyesx'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (url.includes(REF_PRODUCCION) && !process.argv.includes('--permitir-produccion')) {
  console.error('ABORTADO: apunta a PRODUCCION. Agrega --permitir-produccion si es a proposito.')
  process.exit(1)
}

const db = createClient(url, key)

/** ANTES: el total por tarjeta y mes segun la regla VIEJA (mes de t.date). */
async function fotoAntes() {
  const { data: metodos } = await db.from('payment_methods').select('id, name').eq('type', 'credit')
  const ids = metodos.map((m) => m.id)
  const { data: txs } = await db
    .from('transactions').select('payment_method_id, date, amount, type')
    .in('payment_method_id', ids).eq('type', 'expense')
  const acc = {}
  for (const t of txs) {
    const k = `${t.payment_method_id}|${String(t.date).slice(0, 7)}`
    acc[k] = (acc[k] ?? 0) + Math.abs(Number(t.amount))
  }
  return acc
}

/** DESPUES: el mismo total, agrupado por el mes de vencimiento del ciclo apuntado. */
async function fotoDespues() {
  const { data: txs } = await db
    .from('transactions')
    .select('amount, type, payment_method_id, credit_card_cycles!inner(payment_method_id, due_date)')
    .eq('type', 'expense').not('cycle_id', 'is', null)
  const acc = {}
  for (const t of txs) {
    const c = t.credit_card_cycles
    const k = `${c.payment_method_id}|${String(c.due_date).slice(0, 7)}`
    acc[k] = (acc[k] ?? 0) + Math.abs(Number(t.amount))
  }
  return acc
}

const RUTA = (cual) => `${process.env.TEMP ?? '.'}/ciclos-foto-${cual}.json`

const modo = process.argv[2]
if (modo === '--foto') {
  const cual = process.argv[3]
  const foto = cual === 'antes' ? await fotoAntes() : await fotoDespues()
  writeFileSync(RUTA(cual), JSON.stringify(foto, null, 2))
  console.log(`Foto "${cual}": ${Object.keys(foto).length} pares (tarjeta, mes).`)
} else if (modo === '--diff') {
  const antes = JSON.parse(readFileSync(RUTA('antes'), 'utf8'))
  const despues = JSON.parse(readFileSync(RUTA('despues'), 'utf8'))
  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)])
  const difs = []
  for (const k of claves) {
    const a = antes[k] ?? 0, d = despues[k] ?? 0
    if (Math.abs(a - d) > 0.01) difs.push({ clave: k, antes: a, despues: d, delta: d - a })
  }
  if (difs.length) { console.error('DIFERENCIAS:', difs); process.exit(1) }
  console.log(`OK: ${claves.size} pares (tarjeta, mes) idénticos antes y después.`)
}
```

- [ ] **Step 2: Escribir la migración de datos**

```sql
-- Backfill de los ciclos de tarjeta.
--
-- No cambia ningun monto ni ninguna pertenencia: escribe EXPLICITAMENTE la
-- agrupacion que los datos ya tenian implicita en el mes de t.date, y unifica
-- las fechas mostradas dentro del mismo mes. Mismo criterio que el Plan 1 del
-- disponible anclado (2026-08-20).
--
-- El invariante lo verifica scripts/verificar-migracion-ciclos.mjs: el total a
-- pagar de cada tarjeta, por mes, identico antes y despues.
--
-- Spec: docs/superpowers/specs/2026-09-01-ciclos-tarjeta-design.md

-- 1. Ciclos retroactivos desde los defaults de cada tarjeta configurada.
--    Rango: sep-2025 (el movimiento de credito mas viejo) a ago-2027 (la ultima
--    cuota futura), con un mes de margen a cada lado.
--    El clamp `least(dia, ultimo dia del mes)` replica lo que hace generarCiclos.
with tarjetas as (
  select id, user_id, default_closing_day as cd, default_payment_day as pd
  from public.payment_methods
  where type = 'credit'
    and default_closing_day is not null
    and default_payment_day is not null
),
meses as (
  select generate_series(date '2025-08-01', date '2027-09-01', interval '1 month')::date as m
)
insert into public.credit_card_cycles (user_id, payment_method_id, closing_date, due_date, source)
select
  t.user_id,
  t.id,
  make_date(
    extract(year from x.m)::int, extract(month from x.m)::int,
    least(t.cd, extract(day from (x.m + interval '1 month - 1 day'))::int)
  ),
  make_date(
    extract(year from p.mp)::int, extract(month from p.mp)::int,
    least(t.pd, extract(day from (p.mp + interval '1 month - 1 day'))::int)
  ),
  'generated'
from tarjetas t
cross join meses x
cross join lateral (
  -- pd > cd: vence en el mismo mes del cierre. pd <= cd: el mes siguiente.
  select case when t.pd > t.cd then x.m else (x.m + interval '1 month')::date end as mp
) p
on conflict (payment_method_id, closing_date) do nothing;

-- 2. cycle_id de cada consumo: el ciclo cuyo VENCIMIENTO cae en el mes de su
--    t.date. Es exactamente la regla que hoy aplica computePaymentMethodStatus
--    (sameMonthYear(t.date, nextPaymentDate)), escrita como dato.
update public.transactions t
set cycle_id = c.id
from public.credit_card_cycles c
where t.payment_method_id = c.payment_method_id
  and t.cycle_id is null
  and date_trunc('month', c.due_date) = date_trunc('month', t.date);

-- 3. Los pagos de tarjeta se imputan al resumen que saldan. El join va por
--    card_payment_for y NO por payment_method_id: el pago sale del medio
--    financiador (Mercado Pago), no de la tarjeta.
update public.transactions t
set cycle_id = c.id
from public.credit_card_cycles c
where t.card_payment_for = c.payment_method_id
  and t.cycle_id is null
  and date_trunc('month', c.due_date) = date_trunc('month', t.date);

-- 4. purchase_date de las cuotas: installment_plans.purchase_date existe y es
--    NOT NULL desde siempre. Las demas quedan NULL a proposito -- created_at
--    mide cuando se ANOTO el movimiento, no cuando se compro, y el usuario
--    carga en tandas: rellenar con eso seria inventar el dato.
update public.transactions t
set purchase_date = ip.purchase_date
from public.installment_plans ip
where t.installment_plan_id = ip.id
  and t.purchase_date is null;

-- 5. Realineado de t.date al vencimiento de SU ciclo, con guard: solo si cae en
--    el mismo mes. Si cruzara de mes, la fila NO se toca -- esa es la diferencia
--    entre unificar como se muestra una fecha y mover plata de un resumen a otro.
--    Medido antes de escribir esta migracion: hoy 0 filas cruzarian.
update public.transactions t
set date = c.due_date
from public.credit_card_cycles c
where t.cycle_id = c.id
  and t.date <> c.due_date
  and date_trunc('month', t.date) = date_trunc('month', c.due_date);
```

- [ ] **Step 3: Tomar la foto "antes" contra DEV**

```bash
set -a; . ./.env.local; set +a
node scripts/verificar-migracion-ciclos.mjs --foto antes
```

- [ ] **Step 4: Aplicar en DEV y tomar la foto "después"**

```bash
supabase db push --linked
node scripts/verificar-migracion-ciclos.mjs --foto despues
node scripts/verificar-migracion-ciclos.mjs --diff
```
Expected: `OK: N pares (tarjeta, mes) idénticos antes y después.` Si imprime diferencias, **la migración no sale**: hay que entender cada una antes de seguir.

- [ ] **Step 5: Los tres controles restantes**

En el SQL editor de DEV:

```sql
-- (a) Cero huerfanas: ningun consumo de una tarjeta CON ciclo configurado quedo sin cycle_id.
select count(*) from public.transactions t
join public.payment_methods pm on pm.id = t.payment_method_id
where pm.type = 'credit' and pm.default_closing_day is not null
  and pm.default_payment_day is not null and t.cycle_id is null;
-- esperado: 0

-- (b) E17: ningun t.date cambio de mes.
select count(*) from public.transactions t
join public.credit_card_cycles c on c.id = t.cycle_id
where date_trunc('month', t.date) <> date_trunc('month', c.due_date);
-- esperado: 0

-- (c) Ciclos sin solapes ni huecos por tarjeta: un cierre por mes, sin faltantes.
select payment_method_id, count(*), count(distinct date_trunc('month', closing_date))
from public.credit_card_cycles group by 1
having count(*) <> count(distinct date_trunc('month', closing_date));
-- esperado: 0 filas
```

> **E17 vive acá y no en Vitest a propósito**: el realineado es SQL sobre datos reales, y un test unitario sobre fixtures no probaría nada de lo que importa. Queda declarado como control de migración, no como cobertura de test.

- [ ] **Step 6: Verificar en el navegador contra DEV que los números no se movieron**

Con la sesión del demo, comparar contra los totales anotados en la Task 6 Step 6: Compromisos (total por tarjeta), Medios de pago (detalle de cada tarjeta) e Inicio (el disponible). **Los tres tienen que dar exactamente lo mismo.**

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations scripts/verificar-migracion-ciclos.mjs
git commit -m "feat(ciclos): backfill de resumenes, con la foto antes y despues"
```

---

### Task 13: El chat y la pantalla no pueden decir números distintos

**Files:**
- Create: `src/lib/ai/tools/__tests__/ciclos-paridad.test.ts`
- Test: ese mismo archivo

**Interfaces:**
- Consumes: todo lo anterior
- Produces: nada nuevo — es la red que impide que el motor se bifurque

**Por qué con el reloj congelado:** el test de paridad del histórico (31-ago) pasaba por casualidad del calendario y se habría roto solo en octubre, dando falsa confianza sobre la propiedad que justifica toda la arquitectura. Acá el reloj se congela con `vi.setSystemTime`.

- [ ] **Step 1: Escribir el test**

```ts
// src/lib/ai/tools/__tests__/ciclos-paridad.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { computePendingCreditCards } from '@/lib/finance/balances'
import { prepareTransactions } from '@/lib/finance/prepare'
import type { CreditCardCycle } from '@/lib/finance/cycles'
import type { PaymentMethod, Transaction } from '@/types/database'

// Ciclos DESPAREJOS: los reales de la Visa Galicia (23-jul / 20-ago / 24-sep).
// Un fixture mensual perfecto no distinguiria el modelo nuevo del viejo, que es
// como se escondieron los dos ultimos bugs grandes del repo.
const CICLOS: CreditCardCycle[] = [
  { id: 'jul', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-07-23', due_date: '2026-08-03', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  { id: 'ago', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  { id: 'sep', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-09-24', due_date: '2026-10-05', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
]

const VISA = { id: 'visa', user_id: 'u1', name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 1, bucket: 'pocket', initial_balance: 0, initial_balance_at: '2026-07-01', is_personal: false, is_default: false, created_at: '2026-01-01' } as PaymentMethod
const BOLSILLO = { ...VISA, id: 'mp', name: 'Mercado Pago', type: 'debit', default_closing_day: null, default_payment_day: null, initial_balance: 100000, initial_balance_at: '2026-07-01' } as PaymentMethod

const RAW: Transaction[] = [
  { id: 't1', user_id: 'u1', type: 'expense', amount: 30000, date: '2026-09-01', cycle_id: 'ago', purchase_date: '2026-08-05', payment_method_id: 'visa', original_currency: 'ARS', original_amount: 30000 },
  { id: 't2', user_id: 'u1', type: 'expense', amount: 20000, date: '2026-10-05', cycle_id: 'sep', purchase_date: '2026-09-10', payment_method_id: 'visa', original_currency: 'ARS', original_amount: 20000 },
] as unknown as Transaction[]

describe('paridad chat / pantalla sobre ciclos', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Congelado A PROPOSITO: sin esto el test depende del calendario del dia en
    // que corre y puede pasar por casualidad, que es lo que le paso al test de
    // paridad del historico el 31-ago.
    vi.setSystemTime(new Date(2026, 7, 25)) // 25-ago-2026: el resumen de agosto ya cerro
  })
  afterEach(() => vi.useRealTimers())

  it('las dos rutas parten del MISMO pipeline y llegan al mismo resumen', () => {
    // El cliente (financeStore.fetchAllData) y el servidor (dataLoader) llaman a
    // prepareTransactions y a computePendingCreditCards con los mismos argumentos.
    // Si alguna de las dos rutas dejara de pasar los ciclos, este test se cae.
    const now = new Date()
    const preparadas = prepareTransactions(RAW, [VISA, BOLSILLO], [], null, CICLOS)
    const pendientes = computePendingCreditCards([VISA, BOLSILLO], preparadas, [], CICLOS, now)

    const vigente = pendientes.find((c) => !c.isOverdue)
    expect(vigente?.cycleId).toBe('ago')
    expect(vigente?.total).toBe(30000)
    expect(vigente?.isCycleClosed).toBe(true) // cerro el 20, hoy es 25
    // El consumo del resumen que todavia no cerro NO entra en el vigente.
    expect(vigente?.total).not.toBe(50000)
  })

  it('el mes visual sale del cierre y es el mismo dato para los dos', () => {
    const [t1, t2] = prepareTransactions(RAW, [VISA, BOLSILLO], [], null, CICLOS)
    expect(t1.periodDate).toBe('2026-08-20')
    expect(t2.periodDate).toBe('2026-09-24')
  })
})
```

- [ ] **Step 2: Correr**

Run: `npx vitest run src/lib/ai/tools/__tests__/ciclos-paridad.test.ts`
Expected: PASS.

- [ ] **Step 3: Verificar que el reloj congelado hace su trabajo**

Cambiar `setSystemTime` a `new Date(2026, 8, 15)` (15-sep) y correr: el resumen vigente tiene que pasar a `sep` y el test de `'ago'` dar **rojo**. Revertir. Un test con reloj congelado que pasa con cualquier fecha no está congelando nada.

- [ ] **Step 4: Gate completo**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: verde, con la suite pasando de 844 a ~880 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/tools/__tests__/ciclos-paridad.test.ts
git commit -m "test(ciclos): paridad chat/pantalla con el reloj congelado"
```

---

## Orden de ejecución y dependencias

Las tasks van en orden, con dos avisos:

1. **Las Tasks 3, 4, 6 y 10 son un bloque semántico.** Entre la 3 (la pertenencia pasa a leer `cycle_id`) y la 10 (el pago lo escribe), la app **no puede detectar ninguna tarjeta como pagada** — `hasCardPaymentInCycle` pregunta por un dato que todavía nadie guarda. Cada task compila y su suite pasa, pero **la verificación en el navegador recién tiene sentido después de la 12** (que es cuando los datos existen). No conviene abrir el navegador en el medio y concluir que algo se rompió.
2. **La Task 3 Step 5 depende del campo del store que crea la Task 6.** Si se ejecuta con subagentes, o se hacen las dos juntas, o la 3 deja el llamador del store con el array vacío y la 6 lo completa — pero entonces **la 3 no se puede dar por verificada sola**. Recomendado: 1 → 2 → 6 (sólo la query y el campo del estado) → 3 → 4 → 5 → 7 → 8 → 9 → 10 → 11 → 12 → 13.

## Riesgos anotados

- **`installments_count` grande + `asegurarCiclos`**: un plan de 60 cuotas materializa 62 ciclos de una. Es correcto y barato (una fila por mes), pero conviene mirarlo en la primera carga real.
- **Dos requests concurrentes generando el mismo mes**: cubierto por la unique `(payment_method_id, closing_date)` + `ignoreDuplicates`. Si aparece un error de conflicto igual, el bug está en el `onConflict`, no en la lógica.
- **El demo Emi no tiene ciclos desparejos**: el seeder genera tarjetas con cierre y vencimiento fijos. El gate visual con irregularidad real es del Plan 2 (extender `seed-escenarios-tarjeta.mjs` con la tarjeta de 23-jul / 20-ago / 24-sep). En este plan la verificación contra DEV se hace sembrando los ciclos a mano donde haga falta (Task 9 Step 5).
- **Dónde se prueba la migración antes de producción**: el spec pide restaurar en DEV el dump de producción del día (procedimiento en `infra/vps/README.md`) y correr la migración contra esa copia — DEV tiene los usuarios reales purgados y el demo no tiene compras en dólares ni cuotas viejas, así que correr ahí sólo prueba que el SQL no explota. Eso salda de paso el **restore test periódico** pendiente desde el 26-ago. ⚠️ En la cuenta B hay un proyecto llamado `LHSTUDIO` (inactivo) que **no es** el `LHStudio` de producción, que vive en la cuenta A.
- **Orden de salida**: schema y migración a producción **antes del merge a `produccion`**, no antes del merge a `master`.

## Lo que este plan NO hace

Queda todo para el **Plan 2 (UI)**, y ninguna de estas cosas es opcional para que la feature valga:

- Declarar el próximo ciclo (diálogo de pago, recordatorio en Compromisos el día del cierre, ficha de la tarjeta)
- El detalle de la tarjeta agrupado por resumen con navegación entre resúmenes
- Mover una compra al resumen vecino (y **E15**: mover una cuota corre el plan entero)
- El gate visual con ciclos irregulares (`seed-escenarios-tarjeta.mjs` + `verificar-escenarios-tarjeta.mjs`)
- Retirar `getCreditCycleDates`, `calculateCreditPaymentDate` y el parámetro `methods` de `prepareTransactions`, que en este plan quedan vivos como fallback
