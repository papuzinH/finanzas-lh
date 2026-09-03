# Ingresos a mes vencido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cobro pueda contar para un mes distinto al de su fecha, declarado por el usuario, para que quien cobra a fin de mes deje de ver «$0 ingresos este mes».

**Architecture:** Una columna `transactions.income_period` (el día 1 del mes al que cuenta el cobro) que `prepareTransactions` vuelca sobre `periodDate`, el campo que el resto de la app ya usa para preguntar «¿a qué mes visual pertenece esto?». Una preferencia por usuario pre-elige la opción del selector, pero nunca imputa sola. La decisión de cuándo preguntar vive en funciones puras de `lib/finance/` que consumen el form, el chat y el repaso.

**Tech Stack:** Next.js App Router · Supabase (PostgreSQL) · Zustand · TypeScript · Zod + React Hook Form · Vitest · date-fns

**Spec:** `docs/superpowers/specs/2026-09-03-ingresos-mes-vencido-design.md`

## Global Constraints

- **Fechas**: siempre `parseLocalDate()` de `lib/utils/dates.ts`. **Nunca** `new Date('yyyy-MM-dd')` ni `dateToLocalString(new Date(string))` — corre un día atrás en toda TZ negativa.
- **Store desde componentes**: `const store = useFinanceStore(); store.getX()`. Nunca desestructurar getters ni sacarlos con selector — el React Compiler los congela. Lo vigila `src/lib/store/__tests__/store-freshness.test.ts`.
- **Lógica financiera**: sólo en `lib/finance/` (funciones puras). Nunca duplicada en componentes, tools o handlers.
- **TypeScript**: nunca `any`. Nunca `as any` sobre una query de Supabase — los clientes van tipados con `<Database>`.
- **UI**: tokens semánticos (`text-muted`, `bg-surface`, `border-border`). Bordes `border-[1.5px]`. Touch targets ≥44px. Prohibido `emerald-*`, `slate-*`, etc.
- **Verificación por task**: `npm test && npm run lint && npx tsc --noEmit`. Lint baseline: **0 errores**, 9 warnings. Un error nuevo bloquea el commit.
- **Commits**: subject sin acentos (convención del repo). Cerrar con los trailers `Co-Authored-By:` y `Claude-Session:` de la sesión.
- **Migraciones**: `supabase migration new` → `db push --linked` (pega en DEV) → `supabase migration list --linked`. Producción es un paso explícito y posterior, con `--db-url`.

---

### Task 1: La columna y el tipo

**Files:**
- Create: `supabase/migrations/<timestamp>_income_period.sql`
- Modify: `src/types/database.ts` (bloque `transactions`: Row/Insert/Update; bloque `users`: Row/Insert/Update)

**Interfaces:**
- Consumes: nada.
- Produces: `transactions.income_period: string | null` y `users.income_counts_next_month: boolean | null` en los tipos generados. Todas las tasks siguientes dependen de estos dos campos.

⚠️ **No regenerar `types/database.ts` con el MCP.** Editar a mano: una regeneración pierde las uniones literales de dominio (`'income' | 'expense'`, `'credit' | 'debit' | 'cash'`) y los `Relationships`, que se reconstruyeron desde las FKs reales el 2026-08-29.

- [ ] **Step 1: Escribir la migración**

```bash
set -a; . ./.env.local; set +a
supabase migration new income_period
```

Contenido del archivo creado:

```sql
-- A que mes cuenta un cobro. NULL = contá por la fecha del movimiento
-- (el comportamiento historico). Guarda siempre el dia 1 del mes elegido.
--
-- El CHECK hace que "solo aplica a ingresos" sea una regla del schema y no una
-- convencion: un gasto con income_period es un error de la base, no un bug silencioso.
-- La imputacion de un gasto ya la resuelve cycle_id.
alter table public.transactions
  add column income_period date,
  add constraint income_period_solo_ingresos
    check (income_period is null or type = 'income');

comment on column public.transactions.income_period is
  'Dia 1 del mes al que cuenta este ingreso. NULL = usar date. Solo para type = income.';

-- La preferencia: pre-elige la opcion del selector, NUNCA imputa sola.
-- NULL = el usuario todavia no contesto.
alter table public.users
  add column income_counts_next_month boolean;

comment on column public.users.income_counts_next_month is
  'true = lo que cobra en los ultimos dias del mes cuenta al mes siguiente. NULL = sin declarar.';
```

- [ ] **Step 2: Aplicar a DEV y verificar que el CHECK muerde**

```bash
supabase db push --linked
supabase migration list --linked
```

Esperado: la versión nueva aparece con Local y Remote iguales.

Después, verificar el `CHECK` contra la base de DEV — la migración no tiene test unitario, así que **este es su test**:

```sql
-- Debe FALLAR con 23514 (check_violation):
insert into transactions (user_id, description, amount, date, category_id, type, income_period)
values ('<un user de DEV>', 'prueba check', 100, '2026-09-01', '<una categoria>', 'expense', '2026-09-01');
```

Esperado: `new row for relation "transactions" violates check constraint "income_period_solo_ingresos"`.

- [ ] **Step 3: Actualizar los tipos a mano**

En `src/types/database.ts`, bloque `transactions` — agregar en **Row**, **Insert** y **Update** (en Insert y Update con `?`), respetando el orden alfabético que ya tiene el archivo (va entre `id` e `installment_plan_id`):

```ts
          income_period: string | null
```

En el bloque `users`, agregar en Row, Insert y Update (con `?` en los dos últimos), junto a `income_rhythm`:

```ts
          income_counts_next_month: boolean | null
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations src/types/database.ts
git commit -m "feat(ingresos): columna income_period y la preferencia del usuario"
```

---

### Task 2: Cuándo preguntar (funciones puras)

**Files:**
- Create: `src/lib/finance/imputacion-ingresos.ts`
- Test: `src/lib/finance/__tests__/imputacion-ingresos.test.ts`

**Interfaces:**
- Consumes: `parseLocalDate` de `@/lib/utils/dates`.
- Produces:
  - `DIAS_DE_BORDE: 7`
  - `necesitaDeclararMes(fecha: string): boolean`
  - `mesesCandidatos(fecha: string): OpcionDeMes[]` — siempre 2 elementos: `[mes de la fecha, mes siguiente]`
  - `type OpcionDeMes = { valor: string; label: string }` — `valor` es `'yyyy-MM-dd'` con día 01; `label` es el nombre del mes capitalizado en español
  - `mesPorDefecto(fecha: string, prefiereMesSiguiente: boolean | null): string`

Las tres las consumen el form (Task 7), el chat (Task 8) y el repaso (Task 9).

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, it, expect } from 'vitest'
import { necesitaDeclararMes, mesesCandidatos, mesPorDefecto } from '../imputacion-ingresos'

describe('necesitaDeclararMes', () => {
  // La ventana sale de los datos de produccion (2026-09-03): los 8 cobros de fin de
  // mes reales caen entre el 25 y el 29, y el ingreso no ambiguo mas cercano por
  // debajo esta el dia 23. Siete dias los cubre sin tocar a los otros 25.
  it('toma los ultimos 7 dias de un mes de 31', () => {
    expect(necesitaDeclararMes('2026-08-25')).toBe(true)
    expect(necesitaDeclararMes('2026-08-31')).toBe(true)
    expect(necesitaDeclararMes('2026-08-24')).toBe(false)
  })

  it('se corre solo en un mes de 30', () => {
    expect(necesitaDeclararMes('2026-09-24')).toBe(true)
    expect(necesitaDeclararMes('2026-09-23')).toBe(false)
  })

  it('se corre solo en febrero, con y sin bisiesto', () => {
    expect(necesitaDeclararMes('2026-02-22')).toBe(true)
    expect(necesitaDeclararMes('2026-02-21')).toBe(false)
    expect(necesitaDeclararMes('2028-02-23')).toBe(true) // 2028 bisiesto: 29 dias
    expect(necesitaDeclararMes('2028-02-22')).toBe(false)
  })

  it('el dia 1 nunca es ambiguo', () => {
    expect(necesitaDeclararMes('2026-08-01')).toBe(false)
  })
})

describe('mesesCandidatos', () => {
  it('ofrece el mes de la fecha y el siguiente, con el nombre del mes', () => {
    expect(mesesCandidatos('2026-08-29')).toEqual([
      { valor: '2026-08-01', label: 'Agosto' },
      { valor: '2026-09-01', label: 'Septiembre' },
    ])
  })

  it('cruza el ano sin romperse', () => {
    expect(mesesCandidatos('2026-12-29')).toEqual([
      { valor: '2026-12-01', label: 'Diciembre' },
      { valor: '2027-01-01', label: 'Enero' },
    ])
  })
})

describe('mesPorDefecto', () => {
  it('sin preferencia declarada usa el mes de la fecha', () => {
    expect(mesPorDefecto('2026-08-29', null)).toBe('2026-08-01')
  })

  it('con la preferencia en false usa el mes de la fecha', () => {
    expect(mesPorDefecto('2026-08-29', false)).toBe('2026-08-01')
  })

  it('con la preferencia en true propone el mes siguiente', () => {
    expect(mesPorDefecto('2026-08-29', true)).toBe('2026-09-01')
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/lib/finance/__tests__/imputacion-ingresos.test.ts`
Expected: FAIL — «Failed to resolve import "../imputacion-ingresos"».

- [ ] **Step 3: Escribir la implementación mínima**

```ts
// src/lib/finance/imputacion-ingresos.ts
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseLocalDate } from '@/lib/utils/dates'

/**
 * A que mes cuenta un cobro.
 *
 * Quien cobra el 29 de agosto POR septiembre y quien cobra el 29 de agosto por
 * agosto trabajado anotan exactamente el mismo movimiento: la app no puede
 * distinguirlos sin preguntar. Por eso aca no hay ninguna regla que impute sola
 * -- solo se decide CUANDO la pregunta tiene sentido, y cual de las dos opciones
 * viene pre-elegida.
 */

/**
 * Ancho de la ventana ambigua, en dias, contados desde el final del mes.
 *
 * Medido contra produccion el 2026-09-03: de 33 ingresos, los 8 de fin de mes caen
 * entre el dia 25 y el 29, y el ingreso no ambiguo mas cercano por debajo esta el
 * dia 23 (no hay ninguno el 30 ni el 31). Siete dias cubren los 8 casos reales en
 * cualquier longitud de mes sin tocar a los otros 25.
 */
export const DIAS_DE_BORDE = 7

export type OpcionDeMes = { valor: string; label: string }

/** true si la fecha cae en los ultimos DIAS_DE_BORDE dias de su mes. */
export function necesitaDeclararMes(fecha: string): boolean {
  const d = parseLocalDate(fecha)
  return d.getDate() > endOfMonth(d).getDate() - DIAS_DE_BORDE
}

/** El mes de la fecha y el siguiente, en ese orden. Siempre dos. */
export function mesesCandidatos(fecha: string): OpcionDeMes[] {
  const primero = startOfMonth(parseLocalDate(fecha))
  return [primero, addMonths(primero, 1)].map((m) => {
    const nombre = format(m, 'LLLL', { locale: es })
    return {
      valor: format(m, 'yyyy-MM-dd'),
      label: nombre.charAt(0).toUpperCase() + nombre.slice(1),
    }
  })
}

/**
 * Que opcion viene marcada. La preferencia SOLO pre-elige: nada se imputa sin que
 * el usuario guarde el formulario con el selector a la vista.
 */
export function mesPorDefecto(fecha: string, prefiereMesSiguiente: boolean | null): string {
  const [esteMes, mesSiguiente] = mesesCandidatos(fecha)
  return prefiereMesSiguiente === true ? mesSiguiente.valor : esteMes.valor
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/lib/finance/__tests__/imputacion-ingresos.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Verificación completa y commit**

Run: `npm test && npm run lint && npx tsc --noEmit`

```bash
git add src/lib/finance/imputacion-ingresos.ts src/lib/finance/__tests__/imputacion-ingresos.test.ts
git commit -m "feat(ingresos): cuando preguntar a que mes cuenta un cobro"
```

---

### Task 3: `periodDate` respeta `income_period`

**Files:**
- Modify: `src/lib/finance/prepare.ts:50`
- Test: `src/lib/finance/__tests__/prepare.test.ts` — **ya existe**: agregar el `describe` nuevo y reusar los helpers que el archivo tenga, sin duplicarlos

**Interfaces:**
- Consumes: `transactions.income_period` (Task 1).
- Produces: `ProcessedTransaction.periodDate` pasa a valer `income_period` para los ingresos que lo tengan. **Todo el resto del plan depende de esto** — es la línea que hace barata la feature.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { prepareTransactions } from '../prepare'
import type { Transaction, PaymentMethod } from '@/types/database'

const ingreso = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', user_id: 'u1', description: 'Sueldo', amount: 1_850_000,
  date: '2026-08-29', category_id: 'c1', type: 'income',
  payment_method_id: null, cycle_id: null, purchase_date: null,
  income_period: null, installment_plan_id: null, recurring_plan_id: null,
  card_payment_for: null, is_balance_adjustment: false,
  original_amount: null, original_currency: 'ARS', rate_pair: null,
  exchange_rate: null, confirmation_status: 'confirmed', source: 'manual',
  created_at: '2026-08-29T12:00:00Z',
  ...over,
} as Transaction)

const sinMedios: PaymentMethod[] = []

describe('prepareTransactions e income_period', () => {
  it('sin income_period, el mes visual sigue siendo el de la fecha', () => {
    const [p] = prepareTransactions([ingreso()], sinMedios, [], null, [])
    expect(p.periodDate).toBe('2026-08-29')
  })

  it('con income_period, el cobro cuenta para ese mes', () => {
    const [p] = prepareTransactions(
      [ingreso({ income_period: '2026-09-01' })], sinMedios, [], null, [],
    )
    expect(p.periodDate).toBe('2026-09-01')
  })

  it('no toca realPaymentDate: la plata entro cuando entro', () => {
    const [p] = prepareTransactions(
      [ingreso({ income_period: '2026-09-01' })], sinMedios, [], null, [],
    )
    expect(p.realPaymentDate).toBe('2026-08-29')
  })

  it('el ciclo de tarjeta le gana a income_period', () => {
    // Un gasto de credito no puede tener income_period (lo prohibe el CHECK), pero
    // el orden de precedencia queda fijado igual: la imputacion de un consumo la
    // decide su resumen y nada mas.
    const ciclo = {
      id: 'cy1', user_id: 'u1', payment_method_id: 'visa',
      closing_date: '2026-08-20', due_date: '2026-09-01',
      source: 'generated' as const, created_at: '2026-01-01T00:00:00Z',
      reminder_dismissed_at: null,
    }
    const [p] = prepareTransactions(
      [ingreso({ type: 'expense', cycle_id: 'cy1', income_period: null })],
      sinMedios, [], null, [ciclo],
    )
    expect(p.periodDate).toBe('2026-08-20')
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npx vitest run src/lib/finance/__tests__/prepare.test.ts`
Expected: FAIL en «con income_period» — recibe `'2026-08-29'`, esperaba `'2026-09-01'`.

- [ ] **Step 3: Cambiar la línea**

En `src/lib/finance/prepare.ts`, reemplazar la línea 50:

```ts
    const periodDate = ciclo ? ciclo.closing_date : t.date;
```

por:

```ts
    // El ciclo manda para los consumos de credito. Para un ingreso no hay ciclo, y
    // ahi vale income_period: el mes al que el usuario dijo que cuenta ese cobro.
    // Sin declarar (NULL), el mes de la fecha, que es como funciono siempre.
    const periodDate = ciclo ? ciclo.closing_date : (t.income_period ?? t.date);
```

- [ ] **Step 4: Correr para verificar que pasa**

Run: `npx vitest run src/lib/finance/__tests__/prepare.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verificación completa y commit**

Run: `npm test && npm run lint && npx tsc --noEmit`

⚠️ Si algún test preexistente se pone en rojo acá, **no ajustarlo para que pase sin entender por qué**. Es la regla que salvó dos veces al Plan 2 de ciclos.

```bash
git add src/lib/finance/prepare.ts src/lib/finance/__tests__/prepare.test.ts
git commit -m "feat(ingresos): el mes visual de un cobro sale de income_period"
```

---

### Task 4: Los filtros que faltan, y los dos invariantes

**Files:**
- Modify: `src/lib/store/financeStore.ts:1193-1213` (`getMonthlyIncome`, `getMonthlyIncomeTransactions`)
- Modify: `src/lib/finance/analysis.ts:31-37` (rama de ingresos de `computeExpensesByCategory`)
- Test: `src/lib/store/__tests__/ingresos-imputados.test.ts` (crear)
- Test: `src/lib/finance/__tests__/escenarios-disponible.test.ts` (agregar un escenario)

**Interfaces:**
- Consumes: `periodDate` con `income_period` aplicado (Task 3).
- Produces: nada nuevo. Cierra la cascada — con esto quedan bien el gráfico «¿Llegás a fin de mes?», la tasa de ahorro, `getMonthlyExpensesBreakdown` y `getMonthlyLiquidityBreakdown`, sin tocarlos.

- [ ] **Step 1: Escribir el test del invariante del disponible**

En `src/lib/finance/__tests__/escenarios-disponible.test.ts`, agregar (seguir el estilo de los escenarios E8/E9 que ya están en el archivo):

```ts
describe('E19 — imputar un cobro a otro mes no mueve el disponible', () => {
  it('el disponible es identico con y sin income_period', () => {
    // La plata esta en la cuenta desde que entro. Imputar es una lente de analisis,
    // no un movimiento de plata: computeAvailableToSpend va por t.date a proposito
    // (ver el comentario de pocket.ts:25). Este test es lo que impide que alguien
    // "unifique" ese criterio con periodDate mas adelante y mueva el numero central
    // de la app sin darse cuenta.
    const cuentas = [acct({ initial_balance: 300000 })];

    // Cobro del 29 de agosto, con el reloj en septiembre: el caso del reporte.
    const cobro = {
      id: 'sueldo', user_id: 'u1', type: 'income', amount: 500000,
      date: '2026-08-29', periodDate: '2026-08-29', realPaymentDate: '2026-08-29',
      payment_method_id: 'poc', category_id: 'c1', card_payment_for: null,
      installment_plan_id: null, recurring_plan_id: null, is_balance_adjustment: false,
      income_period: null,
    } as ProcessedTransaction;

    const sinImputar = run({ paymentMethods: cuentas, transactions: [cobro] });

    // El MISMO cobro, ahora contando para septiembre. periodDate se mueve con
    // income_period (es lo que hace prepareTransactions en la Task 3); date no.
    const imputado = run({
      paymentMethods: cuentas,
      transactions: [{ ...cobro, income_period: '2026-09-01', periodDate: '2026-09-01' }],
    });

    expect(imputado.available).toBe(sinImputar.available);
    expect(imputado.pocketTotal).toBe(sinImputar.pocketTotal);
  });
});
```

⚠️ `acct` y `run` son los helpers que **ya existen** en ese archivo (los usan E8 y E9): no crear otros. Y notar que el fixture tiene `periodDate !== date` en el segundo caso a propósito — un fixture parejo (`periodDate === date` en todas las filas) es exactamente cómo se escondieron los dos últimos bugs grandes del repo.

- [ ] **Step 2: Escribir el test de la cifra y de la paridad chat/pantalla**

Crear `src/lib/store/__tests__/ingresos-imputados.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFinanceStore } from '@/lib/store/financeStore'

describe('getMonthlyIncome con cobros imputados', () => {
  beforeEach(() => {
    // Reloj congelado a proposito: el 2026-08-31 un test de paridad pasaba por
    // casualidad del calendario y se habria roto solo en octubre.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T12:00:00'))
  })
  afterEach(() => { vi.useRealTimers() })

  it('cuenta en septiembre un cobro del 29 de agosto imputado a septiembre', () => {
    useFinanceStore.setState({
      transactions: [
        {
          id: 't1', type: 'income', amount: 1_850_000, date: '2026-08-29',
          periodDate: '2026-09-01', realPaymentDate: '2026-08-29',
          income_period: '2026-09-01', is_balance_adjustment: false,
        },
      ] as never,
    })
    expect(useFinanceStore.getState().getMonthlyIncome()).toBe(1_850_000)
  })

  it('sin imputar, ese mismo cobro no cuenta para septiembre', () => {
    useFinanceStore.setState({
      transactions: [
        {
          id: 't1', type: 'income', amount: 1_850_000, date: '2026-08-29',
          periodDate: '2026-08-29', realPaymentDate: '2026-08-29',
          income_period: null, is_balance_adjustment: false,
        },
      ] as never,
    })
    expect(useFinanceStore.getState().getMonthlyIncome()).toBe(0)
  })

  it('getMonthlyIncomeTransactions devuelve las mismas filas que suma getMonthlyIncome', () => {
    useFinanceStore.setState({
      transactions: [
        { id: 't1', type: 'income', amount: 1_000, date: '2026-08-29',
          periodDate: '2026-09-01', income_period: '2026-09-01', is_balance_adjustment: false },
        { id: 't2', type: 'income', amount: 500, date: '2026-08-29',
          periodDate: '2026-08-29', income_period: null, is_balance_adjustment: false },
      ] as never,
    })
    const s = useFinanceStore.getState()
    const suma = s.getMonthlyIncomeTransactions().reduce((a, t) => a + Number(t.amount), 0)
    expect(suma).toBe(s.getMonthlyIncome())
    expect(s.getMonthlyIncome()).toBe(1_000)
  })
})
```

Y en `src/lib/ai/tools/__tests__/readTools.test.ts`, agregar a `describe('get_monthly_summary')` el test de paridad:

```ts
it('cuenta los ingresos con el mismo criterio que la pantalla', async () => {
  // La garantia estructural del repo: la pantalla y el chat no pueden decir
  // numeros distintos. Los dos leen periodDate.
  vi.setSystemTime(new Date('2026-09-03T12:00:00'))
  const r = await executeToolWith(readTools, 'get_monthly_summary', { mes: '2026-09' }, ctx)
  expect(r.ok).toBe(true)
  // El fixture de ctx debe incluir un ingreso con date 2026-08-29 e
  // income_period 2026-09-01: tiene que aparecer en el total de septiembre.
})
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `npx vitest run src/lib/store/__tests__/ingresos-imputados.test.ts src/lib/finance/__tests__/escenarios-disponible.test.ts`
Expected: FAIL en «cuenta en septiembre…» — devuelve 0.

- [ ] **Step 4: Cambiar los tres filtros**

En `src/lib/store/financeStore.ts`, en `getMonthlyIncome` y `getMonthlyIncomeTransactions`, reemplazar:

```ts
        const localTDate = parseLocalDate(t.date);
```

por:

```ts
        // periodDate, no date: para un cobro imputado a otro mes son distintos, y
        // el mes al que cuenta es el declarado. Es el mismo criterio que /movimientos
        // y que get_monthly_summary del chat.
        const localTDate = parseLocalDate(t.periodDate || t.date);
```

En `src/lib/finance/analysis.ts`, en la rama de ingresos de `computeExpensesByCategory`:

```ts
        return type === 'expense'
          ? isExpenseInCurrentMonthScope(t, paymentMethods, now)
          : isSameMonth(parseLocalDate(t.periodDate || t.date), now)
```

Y actualizar el comentario de arriba de la función, que hoy dice «para ingresos usa mes calendario simple (mismo criterio que `getMonthlyIncome()`)»:

```
 * - scope 'current_month': para gastos respeta el ciclo de tarjeta
 *   (isExpenseInCurrentMonthScope); para ingresos usa el mes de periodDate, que
 *   es el mes declarado por el usuario si imputo el cobro a otro mes, y el de la
 *   fecha si no (mismo criterio que getMonthlyIncome()).
```

- [ ] **Step 5: Correr todo y commitear**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: PASS. Prestar atención a que **no baje** el número de tests.

```bash
git add src/lib/store src/lib/finance src/lib/ai/tools/__tests__
git commit -m "feat(ingresos): la cifra del mes cuenta por el mes declarado"
```

---

### Task 5: La preferencia del usuario

**Files:**
- Modify: `src/app/bolsillo/actions.ts` (agregar `saveIncomePeriodPreference`)
- Modify: `src/lib/store/financeStore.ts` (campo `incomeCountsNextMonth` + carga en `fetchAllData`)
- Modify: `src/app/ajustes/page.tsx` (control junto al ritmo de cobro)
- Test: `src/app/bolsillo/__tests__/preferencia-ingresos.test.ts` (crear)

**Interfaces:**
- Consumes: `users.income_counts_next_month` (Task 1).
- Produces: `saveIncomePeriodPreference(valor: boolean): Promise<ActionResponse>` y `useFinanceStore().incomeCountsNextMonth: boolean | null`. Los consumen el onboarding (Task 6) y el selector del form (Task 7).

- [ ] **Step 1: Escribir el test de la action**

Mismo molde que `src/app/actions/__tests__/novedades.test.ts` (la otra action que escribe en `users`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: m.getUser }, from: m.from }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveIncomePeriodPreference } from '../actions'

const UID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  m.getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null })
  m.eq.mockResolvedValue({ error: null })
  m.update.mockReturnValue({ eq: m.eq })
  m.from.mockReturnValue({ update: m.update })
})

describe('saveIncomePeriodPreference', () => {
  it('guarda el booleano en la fila del propio usuario', async () => {
    const res = await saveIncomePeriodPreference(true)

    expect(res.success).toBe(true)
    expect(m.from).toHaveBeenCalledWith('users')
    expect(m.update).toHaveBeenCalledWith({ income_counts_next_month: true })
    // El filtro por dueño no es decorativo: sin él la mutación queda colgada de
    // RLS como única capa (auditoría L3).
    expect(m.eq).toHaveBeenCalledWith('id', UID)
  })

  it('sin sesion no escribe nada', async () => {
    m.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await saveIncomePeriodPreference(true)

    expect(res.error).toBe('No autorizado')
    expect(m.from).not.toHaveBeenCalled()
  })

  it('si la escritura falla lo reporta y no lanza', async () => {
    m.eq.mockResolvedValue({ error: { message: 'boom' } })

    const res = await saveIncomePeriodPreference(false)

    expect(res.error).toBe('No se pudo guardar tu preferencia')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/app/bolsillo/__tests__/preferencia-ingresos.test.ts`
Expected: FAIL — la función no existe.

- [ ] **Step 3: Escribir la action**

En `src/app/bolsillo/actions.ts`, siguiendo el molde exacto de `saveIncomeRhythm`:

```ts
/**
 * Preferencia de imputacion de cobros. SOLO pre-elige la opcion del selector:
 * ningun cobro cambia de mes por esto (ver el spec, "La decision").
 */
export async function saveIncomePeriodPreference(valor: boolean): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { error } = await supabase
      .from('users')
      .update({ income_counts_next_month: valor })
      .eq('id', user.id)

    if (error) {
      console.error('Error guardando la preferencia de imputacion:', error)
      return { error: 'No se pudo guardar tu preferencia' }
    }

    revalidatePath('/')
    revalidatePath('/ajustes')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in saveIncomePeriodPreference:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}
```

- [ ] **Step 4: Sumar el campo al store**

En `src/lib/store/financeStore.ts`: agregar `incomeCountsNextMonth: boolean | null` a la interfaz junto a `incomeRhythm`, con default `null`, y cargarlo en `fetchAllData` en la misma línea donde ya se lee `income_rhythm`:

```ts
        incomeCountsNextMonth: (userData as User)?.income_counts_next_month ?? null,
```

⚠️ Agregarlo también a la lista de campos de estado de `store-freshness.test.ts:40` (donde ya figura `incomeRhythm`), o el guard lo trata como getter.

- [ ] **Step 5: El control en Ajustes**

En `src/app/ajustes/page.tsx`, debajo del `RhythmPicker` existente y **sólo cuando `rhythm === 'monthly'`**:

```tsx
{rhythm === 'monthly' && (
  <div className="space-y-2">
    <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
      Cobros de fin de mes
    </span>
    <div className="flex flex-wrap gap-2" role="group" aria-label="A que mes cuenta un cobro de fin de mes">
      <Chip active={cuentaAlSiguiente === false} onClick={() => guardarPreferencia(false)}>
        Al mes en que cobro
      </Chip>
      <Chip active={cuentaAlSiguiente === true} onClick={() => guardarPreferencia(true)}>
        Al mes que arranca
      </Chip>
    </div>
    <p className="font-sans text-xs text-muted">
      Si cobrás los últimos días del mes, esto decide qué opción viene marcada cuando cargás
      el sueldo. Siempre podés cambiarla en cada cobro.
    </p>
  </div>
)}
```

- [ ] **Step 6: Verificar y commitear**

Run: `npm test && npm run lint && npx tsc --noEmit`

```bash
git add src/app/bolsillo src/lib/store src/app/ajustes
git commit -m "feat(ingresos): la preferencia de imputacion, editable en ajustes"
```

---

### Task 6: La preferencia en el onboarding

**Files:**
- Modify: `src/app/onboarding/slides/rhythm-slide.tsx`
- Test: `src/app/onboarding/__tests__/rhythm-slide.test.tsx` (crear o extender)

**Interfaces:**
- Consumes: `saveIncomePeriodPreference` (Task 5).
- Produces: nada para otras tasks.

⚠️ **No agregar un slide nuevo.** El onboarding es el punto más frágil de la app: 8 de 17 usuarios se caen antes de cargar un movimiento. La pregunta va **dentro** del slide de ritmo que ya existe, y sólo si el ritmo elegido es mensual.

- [ ] **Step 1: Escribir el test**

```tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RhythmSlide } from '../slides/rhythm-slide'

describe('RhythmSlide', () => {
  it('ofrece elegir a que mes cuenta un cobro de fin de mes', () => {
    const html = renderToStaticMarkup(<RhythmSlide onComplete={() => {}} />)
    // El default del slide es 'monthly', asi que la pregunta esta visible de entrada
    expect(html).toContain('Al mes que arranca')
  })

  it('sigue permitiendo saltear el paso entero', () => {
    const html = renderToStaticMarkup(<RhythmSlide onComplete={() => {}} />)
    expect(html).toContain('Ahora no, lo configuro después')
  })
})
```

- [ ] **Step 2: Correr y verificar que el primero falla**

Run: `npx vitest run src/app/onboarding/__tests__/rhythm-slide.test.tsx`
Expected: FAIL en el primero; el segundo pasa (ya existe ese botón).

- [ ] **Step 3: Sumar la pregunta al slide**

En `rhythm-slide.tsx`: estado local `const [cuentaAlSiguiente, setCuentaAlSiguiente] = useState<boolean | null>(null)`, el mismo bloque de dos `<Chip>` de Ajustes renderizado **sólo si `rhythm === 'monthly'`**, y en `handleSave`, después del `saveIncomeRhythm` exitoso:

```ts
      if (rhythm === 'monthly' && cuentaAlSiguiente !== null) {
        await saveIncomePeriodPreference(cuentaAlSiguiente)
      }
```

No bloquea: si el usuario no toca nada, `cuentaAlSiguiente` queda en `null` y la preferencia no se escribe.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run src/app/onboarding/__tests__/rhythm-slide.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verificar y commitear**

Run: `npm test && npm run lint && npx tsc --noEmit`

```bash
git add src/app/onboarding
git commit -m "feat(ingresos): la preferencia se declara junto al ritmo de cobro"
```

---

### Task 7: El selector en el alta y en la edición

**Files:**
- Create: `src/components/transactions/mes-del-cobro-field.tsx`
- Modify: `src/lib/schemas/transaction.ts` (los dos schemas)
- Modify: `src/components/transactions/create-transaction-dialog.tsx`
- Modify: `src/components/transactions/edit-transaction-dialog.tsx`
- Modify: `src/app/dashboard/transactions/actions.ts` (`createTransaction` y `updateTransaction`)
- Test: `src/components/transactions/__tests__/mes-del-cobro-field.test.tsx` (crear)

**Interfaces:**
- Consumes: `necesitaDeclararMes`, `mesesCandidatos`, `mesPorDefecto` (Task 2); `incomeCountsNextMonth` del store (Task 5).
- Produces: `income_period` viajando desde el form hasta la base.

⚠️ **Exportar el contenido suelto, no sólo dentro del `Dialog`.** El contenido de un `Dialog` de Radix es **intesteable** con `renderToStaticMarkup`: monta detrás de un Portal que resuelve en un `useLayoutEffect`, que nunca corre sin jsdom (verificado: devuelve `''` con `open` en true y en false). Por eso `MesDelCobroField` va en su propio archivo y se testea directo. Es la razón por la que ya existen sueltos `ContenidoNovedades` y `CicloFechasField`.

- [ ] **Step 1: Escribir el test del componente**

```tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MesDelCobroField } from '../mes-del-cobro-field'

describe('MesDelCobroField', () => {
  it('no se muestra si la fecha no esta en el borde del mes', () => {
    const html = renderToStaticMarkup(
      <MesDelCobroField fecha="2026-08-15" value={null} onChange={() => {}} />,
    )
    expect(html).toBe('')
  })

  it('ofrece los dos meses con su nombre cuando la fecha esta en el borde', () => {
    const html = renderToStaticMarkup(
      <MesDelCobroField fecha="2026-08-29" value="2026-08-01" onChange={() => {}} />,
    )
    expect(html).toContain('Agosto')
    expect(html).toContain('Septiembre')
  })

  it('los botones cumplen el minimo de 44px', () => {
    // El min-h-11 lo aporta <Chip>, que ya lo trae en su propio className: NO se le
    // pasa desde acá. Chip no acepta prop `className` -- intentar pasársela es un
    // error de TypeScript. El test igual vale: fija que estos controles se dibujen
    // con Chip y no con un <button> pelado, que es como se cuela un target de 40px
    // (el defecto del popup de novedades, 2026-09-01).
    const html = renderToStaticMarkup(
      <MesDelCobroField fecha="2026-08-29" value="2026-08-01" onChange={() => {}} />,
    )
    expect(html).toContain('min-h-11')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/components/transactions/__tests__/mes-del-cobro-field.test.tsx`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Escribir el componente**

```tsx
'use client'

import { Chip } from '@/components/ui/chip'
import { mesesCandidatos, necesitaDeclararMes } from '@/lib/finance/imputacion-ingresos'

/**
 * A que mes cuenta este cobro. Solo aparece cuando la fecha cae en los ultimos dias
 * del mes, que es donde la pregunta significa algo: quien cobra el 29 de agosto puede
 * estar cobrando agosto trabajado o septiembre por adelantado, y la app no puede
 * distinguirlo sin preguntar.
 *
 * Se muestran los NOMBRES de los meses y no "este / el que viene", que se lee ambiguo
 * justo donde importa.
 */
export function MesDelCobroField({
  fecha,
  value,
  onChange,
}: {
  fecha: string
  value: string | null
  onChange: (valor: string) => void
}) {
  if (!fecha || !necesitaDeclararMes(fecha)) return null

  const opciones = mesesCandidatos(fecha)

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
        ¿A qué mes cuenta?
      </span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Mes al que cuenta el cobro">
        {opciones.map((o) => (
          <Chip key={o.valor} active={value === o.valor} onClick={() => onChange(o.valor)}>
            {o.label}
          </Chip>
        ))}
      </div>
      <p className="font-sans text-xs text-muted">
        Cobraste sobre el final del mes: elegí para qué mes cuenta esta plata.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/components/transactions/__tests__/mes-del-cobro-field.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Cablearlo en el schema, los dialogs y las actions**

En `src/lib/schemas/transaction.ts`, agregar a **los dos** schemas (`transactionSchema` y `createTransactionSchema`):

```ts
  income_period: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
```

⚠️ `.nullable().optional()`, las dos. Un `.nullable()` solo —sin `.optional()`— es el agujero que el 2026-09-01 le mostró un error de Zod crudo a una usuaria.

En `create-transaction-dialog.tsx`: default `income_period: null`, y renderizar el campo sólo para ingresos, alimentándolo con la preferencia del store:

```tsx
{watchedType === 'income' && (
  <MesDelCobroField
    fecha={watchedDate}
    value={form.watch('income_period') ?? mesPorDefecto(watchedDate, store.incomeCountsNextMonth)}
    onChange={(v) => form.setValue('income_period', v)}
  />
)}
```

En `edit-transaction-dialog.tsx`: lo mismo, con el `income_period` de la transacción como valor inicial.

En `createTransaction` y `updateTransaction` (`src/app/dashboard/transactions/actions.ts`), en el objeto del insert/update, en la línea siguiente a `purchase_date` — **simétrico con ella**:

```ts
        income_period: type === 'income' ? (income_period ?? null) : null,
```

⚠️ Se persiste el string tal cual, **sin round trip por `Date`**.

- [ ] **Step 6: Verificar el flujo completo en el navegador contra DEV**

```bash
npm run build && npx next start -p 3100
```

Con la sesión del demo: cargar un ingreso con fecha del 29 del mes en curso, verificar que aparece el selector con los dos meses; elegir el mes siguiente; confirmar en la base que `income_period` quedó en el día 1 correcto; y confirmar que la card «Ingresos mes» **deja** de contarlo en el mes actual.

⚠️ `npm run dev` no sirve para esto: la CSP de desarrollo corre React degradado.

- [ ] **Step 7: Verificar y commitear**

Run: `npm test && npm run lint && npx tsc --noEmit`

```bash
git add src/components/transactions src/lib/schemas src/app/dashboard/transactions
git commit -m "feat(ingresos): elegir a que mes cuenta un cobro al cargarlo"
```

---

### Task 8: El chat pregunta en vez de adivinar

**Files:**
- Modify: `src/lib/ai/tools/writeTools.ts` (`createTransactionSchema` y `create_transaction`)
- Modify: `src/lib/ai/handlerTypes.ts` (`TransactionData`)
- Modify: `src/lib/ai/handlers.ts` (`handleTransaction`)
- Test: `src/lib/ai/tools/__tests__/writeTools.test.ts` (extender)

**Interfaces:**
- Consumes: `necesitaDeclararMes` (Task 2).
- Produces: `TransactionData.incomePeriod: string | null`.

- [ ] **Step 1: Escribir los tests**

El archivo **ya tiene** el `ctx` armado y `@/lib/ai/handlers` mockeado con `vi.mock` (`handleTransaction` entre ellos), así que el spy sale de `vi.mocked(handleTransaction)`. Agregar al principio del `describe` nuevo:

```ts
import { handleTransaction } from '@/lib/ai/handlers'

beforeEach(() => {
  vi.mocked(handleTransaction).mockResolvedValue({ success: true, message: 'Listo' } as ChatResponse)
})
```

```ts
describe('create_transaction e imputacion de cobros', () => {
  it('pide el mes cuando el ingreso cae en el borde y no vino', async () => {
    const r = await executeToolWith(writeTools, 'create_transaction', {
      descripcion: 'Sueldo', monto: 1_850_000, tipo: 'income',
      categoria_id: null, medio_pago: null, fecha: '2026-08-29',
    }, ctx)
    expect(r.ok).toBe(false)
    // El mensaje es para el MODELO, y en espanol: si se filtra al usuario tiene
    // que leerse como una pregunta, no como un error de Zod (bug del 2026-09-01).
    expect(r.error).toContain('a qué mes')
    expect(r.error).not.toContain('Invalid input')
  })

  it('no pregunta nada si el ingreso no cae en el borde', async () => {
    const r = await executeToolWith(writeTools, 'create_transaction', {
      descripcion: 'Sueldo', monto: 1_850_000, tipo: 'income',
      categoria_id: null, medio_pago: null, fecha: '2026-08-15',
    }, ctx)
    expect(r.ok).toBe(true)
  })

  it('no pregunta nada para un gasto en el borde', async () => {
    const r = await executeToolWith(writeTools, 'create_transaction', {
      descripcion: 'Chino', monto: 8_000, tipo: 'expense',
      categoria_id: null, medio_pago: null, fecha: '2026-08-29',
    }, ctx)
    expect(r.ok).toBe(true)
  })

  it('acepta el mes y lo persiste como el dia 1', async () => {
    const r = await executeToolWith(writeTools, 'create_transaction', {
      descripcion: 'Sueldo', monto: 1_850_000, tipo: 'income',
      categoria_id: null, medio_pago: null, fecha: '2026-08-29',
      mes_del_cobro: '2026-09',
    }, ctx)
    expect(r.ok).toBe(true)
    expect(vi.mocked(handleTransaction)).toHaveBeenCalledWith(
      expect.objectContaining({ incomePeriod: '2026-09-01' }), ctx.userId,
    )
  })

  it('un ingreso fuera del borde no lleva imputacion', async () => {
    await executeToolWith(writeTools, 'create_transaction', {
      descripcion: 'Sueldo', monto: 1_850_000, tipo: 'income',
      categoria_id: null, medio_pago: null, fecha: '2026-08-15',
    }, ctx)
    expect(vi.mocked(handleTransaction)).toHaveBeenCalledWith(
      expect.objectContaining({ incomePeriod: null }), ctx.userId,
    )
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run src/lib/ai/tools/__tests__/writeTools.test.ts`
Expected: FAIL en el primero y el último.

- [ ] **Step 3: Implementar**

En `writeTools.ts`, sumar al `createTransactionSchema`:

```ts
  mes_del_cobro: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable()
    .optional()
    .describe(
      'YYYY-MM: a que mes cuenta el cobro. Solo para ingresos cobrados en los ultimos dias del mes; null en cualquier otro caso',
    ),
```

Y al principio del `execute` de `create_transaction`:

```ts
      // El cobro del 29 de agosto puede ser de agosto trabajado o de septiembre por
      // adelantado, y no hay forma de saberlo sin preguntar. Se devuelve el pedido al
      // MODELO -- el mismo patron de dos pasos sin estado que usa delete_entity -- en
      // vez de imputarlo por una regla que va a acertar la mitad de las veces.
      if (args.tipo === 'income' && necesitaDeclararMes(args.fecha) && !args.mes_del_cobro) {
        const [esteMes, mesSiguiente] = mesesCandidatos(args.fecha)
        return {
          ok: false,
          error:
            `Ese cobro cae en los últimos días del mes. Preguntale al usuario a qué mes cuenta esa plata ` +
            `(${esteMes.label} o ${mesSiguiente.label}) y volvé a llamar a la tool con mes_del_cobro.`,
        }
      }
```

`incomePeriod` sale como `` `${args.mes_del_cobro}-01` `` cuando vino, y `null` cuando no. En `handlerTypes.ts` sumar `incomePeriod: string | null` a `TransactionData`, y en `handleTransaction` persistirlo con la misma regla que la action: sólo si `type === 'income'`.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run src/lib/ai/tools/__tests__/writeTools.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar y commitear**

Run: `npm test && npm run lint && npx tsc --noEmit`

```bash
git add src/lib/ai
git commit -m "feat(ingresos): el chat pregunta a que mes cuenta un cobro del borde"
```

---

### Task 9: El repaso de los cobros ya cargados

**Files:**
- Create: `src/components/dashboard/cobros-sin-imputar-banner.tsx`
- Modify: `src/lib/store/financeStore.ts` (getter `getCobrosSinImputar`)
- Modify: `src/app/bolsillo/actions.ts` (`imputarCobros`)
- Modify: `src/app/dashboard-client.tsx` (montar el banner junto a `OverdueCardPaymentBanner`, línea 102)
- Test: `src/components/dashboard/__tests__/cobros-sin-imputar-banner.test.tsx` (crear)

**Interfaces:**
- Consumes: `necesitaDeclararMes`, `mesesCandidatos` (Task 2).
- Produces: nada para otras tasks. Cierra el plan.

Hoy en producción esto alcanza a **8 cobros de 5 usuarios**, 4 de ellos de una sola persona.

- [ ] **Step 1: Escribir el test del getter y del banner**

```tsx
describe('getCobrosSinImputar', () => {
  it('lista los ingresos del borde que no tienen mes declarado', () => {
    useFinanceStore.setState({
      transactions: [
        { id: 'a', type: 'income', date: '2026-08-29', income_period: null, amount: 100,
          is_balance_adjustment: false },
        { id: 'b', type: 'income', date: '2026-08-29', income_period: '2026-09-01', amount: 100,
          is_balance_adjustment: false },
        { id: 'c', type: 'income', date: '2026-08-15', income_period: null, amount: 100,
          is_balance_adjustment: false },
        { id: 'd', type: 'expense', date: '2026-08-29', income_period: null, amount: 100,
          is_balance_adjustment: false },
      ] as never,
    })
    expect(useFinanceStore.getState().getCobrosSinImputar().map((t) => t.id)).toEqual(['a'])
  })
})

describe('CobrosSinImputarBanner', () => {
  it('no se muestra si no hay cobros ambiguos', () => {
    useFinanceStore.setState({ transactions: [] as never })
    expect(renderToStaticMarkup(<CobrosSinImputarBanner />)).toBe('')
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run src/components/dashboard/__tests__/cobros-sin-imputar-banner.test.tsx`
Expected: FAIL.

- [ ] **Step 3: El getter y la action**

Getter en el store, wrapper fino como manda la convención:

```ts
  getCobrosSinImputar: () => {
    const { transactions } = get();
    return transactions.filter(
      (t) =>
        t.type === 'income' &&
        !t.is_balance_adjustment &&
        !t.income_period &&
        necesitaDeclararMes(t.date),
    );
  },
```

Action en `src/app/bolsillo/actions.ts`:

```ts
/**
 * Imputa en lote los cobros que el usuario repaso. "Dejalos como estan" tambien
 * llega aca, con el mes de la propia fecha: persistir esa decision es lo que hace
 * que el banner desaparezca para siempre sin inventar un estado de "descartado"
 * aparte, que ademas no viajaria entre dispositivos.
 */
export async function imputarCobros(
  items: { id: string; income_period: string }[],
): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const parsed = z
      .array(z.object({
        id: z.string().uuid(),
        income_period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .max(100)
      .safeParse(items)
    if (!parsed.success) return { error: 'Datos inválidos' }

    for (const item of parsed.data) {
      const { error } = await supabase
        .from('transactions')
        .update({ income_period: item.income_period })
        .eq('id', item.id)
        .eq('user_id', user.id)   // RLS es el backstop, no la unica capa
        .eq('type', 'income')     // el CHECK lo prohibe igual, pero se dice acá tambien

      if (error) {
        console.error('Error imputando un cobro:', error)
        return { error: 'No se pudieron guardar todos los cobros' }
      }
    }

    revalidatePath('/')
    revalidatePath('/movimientos')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in imputarCobros:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}
```

- [ ] **Step 4: El banner**

```tsx
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { imputarCobros } from '@/app/bolsillo/actions'
import { mesesCandidatos } from '@/lib/finance/imputacion-ingresos'
import { useFinanceStore } from '@/lib/store/financeStore'
import { formatCurrency } from '@/lib/utils'

/**
 * Repaso de los cobros de fin de mes que se cargaron antes de que existiera la
 * imputacion. No hay backfill automatico: mover plata en pantalla sin que la
 * persona lo pida contradice la regla central de esta feature.
 *
 * A diferencia de OverdueCardPaymentBanner, este NO explica una cifra retenida ni
 * bloquea nada -- corrige una lente de analisis. Por eso su salida es "Dejalos como
 * estan", que ESCRIBE income_period con el mes de la propia fecha: una decision
 * explicita queda persistida y el banner no vuelve, sin inventar un estado de
 * "descartado" que ademas no viajaria entre dispositivos (la leccion del tour).
 */
export function CobrosSinImputarBanner() {
  // El store entero, no sus getters sueltos: son referencias estables y el
  // React Compiler congelaria el resultado (ver store-freshness.test.ts).
  const store = useFinanceStore()
  const cobros = store.getCobrosSinImputar()
  const [elegido, setElegido] = useState<Record<string, string>>({})
  const [isPending, setIsPending] = useState(false)

  if (cobros.length === 0) return null

  const guardar = async (dejarComoEstan: boolean) => {
    setIsPending(true)
    try {
      const items = cobros.map((t) => ({
        id: t.id,
        income_period: dejarComoEstan
          ? mesesCandidatos(t.date)[0].valor
          : (elegido[t.id] ?? mesesCandidatos(t.date)[0].valor),
      }))
      const res = await imputarCobros(items)
      if (res.error) {
        toast.error(res.error)
        return
      }
      await store.fetchAllData()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border-[1.5px] border-border bg-surface-2/40 p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-accent/15 p-2 shrink-0">
          <CalendarClock className="h-4 w-4 text-accent-deep" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="font-display text-base text-text">
            {cobros.length === 1 ? 'Tenés un cobro de fin de mes' : `Tenés ${cobros.length} cobros de fin de mes`}
          </p>
          <p className="font-sans text-xs text-muted">
            Cobraste sobre el final del mes: decinos para qué mes cuenta esa plata y las cifras
            del mes te van a cerrar.
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {cobros.map((t) => {
          const opciones = mesesCandidatos(t.date)
          const actual = elegido[t.id] ?? opciones[0].valor
          return (
            <li key={t.id} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-sans text-sm text-text truncate">{t.description}</span>
                <span className="font-display tnum text-sm text-good shrink-0">
                  {formatCurrency(Number(t.amount))}
                </span>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label={`Mes de ${t.description}`}>
                {opciones.map((o) => (
                  <Chip
                    key={o.valor}
                    active={actual === o.valor}
                    onClick={() => setElegido((prev) => ({ ...prev, [t.id]: o.valor }))}
                  >
                    {o.label}
                  </Chip>
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button variant="accent" onClick={() => guardar(false)} disabled={isPending} className="min-h-11">
          Listo
        </Button>
        <Button variant="ghost" onClick={() => guardar(true)} disabled={isPending} className="min-h-11">
          Dejalos como están
        </Button>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 5: Montar y correr**

En `src/app/dashboard-client.tsx`, junto a `<OverdueCardPaymentBanner />` (línea 102).

Run: `npx vitest run src/components/dashboard/__tests__/cobros-sin-imputar-banner.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verificación completa, navegador y commit**

Run: `npm test && npm run lint && npx tsc --noEmit`

En el navegador contra DEV (`npm run build && npx next start -p 3100`): sembrar un ingreso con fecha del 29 del mes pasado y `income_period` null, verificar que el banner aparece, resolverlo, y verificar que **desaparece y no vuelve** al recargar.

```bash
git add src/components/dashboard src/lib/store src/app/bolsillo src/app/dashboard-client.tsx
git commit -m "feat(ingresos): repaso de los cobros de fin de mes ya cargados"
```

---

## Cierre

Con las 9 tasks en verde:

- [ ] Actualizar `CLAUDE.md`: en «Fechas y ciclos de tarjeta», que `periodDate` para un ingreso sale de `income_period`; en el store, el criterio nuevo de `getMonthlyIncome`.
- [ ] Actualizar `docs/features/movimientos.md` y `docs/features/home-dashboard.md`.
- [ ] Revisión de rama sobre el diff completo (`superpowers:requesting-code-review`). **No saltearla**: en los cuatro planes anteriores de este repo, la review de rama encontró defectos que ninguna review por task podía ver.
- [ ] La migración a producción va **antes** del merge a `produccion`, con `--db-url`.

**Lo que este plan NO hace** (del spec, «Fuera de alcance»): no toca `pocket.ts` ni el disponible; no aplica a gastos; no modela «sueldo» como entidad; no hace backfill automático; y **no arregla el «Ingresos mes $0» de la landing**, que tiene la misma raíz pero otra causa — el seeder del demo genera los sueldos de los dos meses anteriores. Ese arreglo arrastra regenerar las capturas y `DISPONIBLE_DEMO` en el mismo commit.
