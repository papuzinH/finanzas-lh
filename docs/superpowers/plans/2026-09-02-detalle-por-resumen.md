# Detalle de la tarjeta por resumen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario pueda poner el resumen del banco al lado de la app, navegar al resumen que tiene en la mano y cotejarlo línea por línea.

**Architecture:** Dos funciones puras nuevas en `lib/finance/detalle-resumen.ts` (listar los resúmenes navegables de una tarjeta; partir las filas de un resumen en las que tienen fecha de compra y las que no), un getter fino en el store que las combina con `computePaymentMethodStatus(..., cicloObjetivo)`, y una ruta nueva `/ajustes/medios/[id]` que reemplaza al modal de detalle. Ningún cambio de schema: los cuatro estados del resumen se derivan.

**Tech Stack:** Next 16.3.3 (App Router), React 19 con React Compiler, Zustand, Tailwind v4 con tokens semánticos, Vitest (`environment: 'node'`, sin jsdom), date-fns.

**Spec:** `docs/superpowers/specs/2026-09-02-detalle-por-resumen-design.md`

## Global Constraints

- **Ningún cambio de schema.** Ni una migración, ni una columna. Los estados se derivan.
- **Los totales no se recalculan.** Cualquier total de un resumen sale de `computePaymentMethodStatus(method, transactions, recurringPlans, now, cycles, cicloObjetivo)`. Prohibido sumar montos a mano en un componente, en el getter o en las funciones nuevas.
- **Fechas como strings `yyyy-MM-dd`**, comparadas con `<` / `>` / `localeCompare`. Nunca como `Date`. Para pasar un `Date` a string: `formatLocalDate(now)` de `@/lib/utils/dates` — el mismo helper que usa `cicloVigente`. Nunca `dateToLocalString(new Date(string))`: pierde un día en TZ negativa.
- **Pertenencia al resumen = `t.cycle_id === ciclo.id`.** Nunca el mes de `t.date`.
- **El store se consume entero**: `const store = useFinanceStore(); store.getX()`. Nunca desestructurar getters ni sacarlos con selector — el React Compiler los congela y `store-freshness.test.ts` falla.
- **Fixtures desparejos, obligatorio.** Las fechas de los tests salen de los ciclos reales del Galicia, ya usados en `src/lib/finance/__tests__/cycles.test.ts`: cierres `2026-07-23` / `2026-08-20` / `2026-09-24`, vencimientos `2026-08-03` / `2026-09-01` / `2026-10-05`. Un fixture con cierre y vencimiento derivados del mismo día del mes escondió los dos últimos bugs grandes del repo.
- **Tokens semánticos siempre**: `bg-surface`, `bg-surface-2`, `text-text`, `text-muted`, `text-faint`, `text-good`, `text-bad`, `text-warn`, `border-border`. Nunca hex ni `emerald-*`/`slate-*`/etc.
- **Bordes `border-[1.5px] border-border`**, nunca `border`. Touch targets ≥44px. Canvas base 390px, margen `px-5`.
- **Cifras**: `font-display tnum`. Una sola cifra por pantalla con `--shadow-bandera` (acá: el total del resumen).
- **Verificación en CADA commit**: `npm test && npm run lint && npx tsc --noEmit`. Baseline de lint: **0 errores, 9 warnings**. Un error nuevo de lint bloquea el commit.
- **Si un test que no escribiste vos se pone en rojo, no lo ajustes para que pase sin entender por qué.** Es la regla que atrapó dos bugs de brief en el plan anterior.

---

### Task 1: Funciones puras del detalle

**Files:**
- Create: `src/lib/finance/detalle-resumen.ts`
- Test: `src/lib/finance/__tests__/detalle-resumen.test.ts`

**Interfaces:**
- Consumes: `CreditCardCycle`, `ciclosDeMetodo` de `./cycles`; `hasCardPaymentInCycle` de `./balances`; `ProcessedTransaction` de `./types`; `PaymentMethod` de `@/types/database`; `formatLocalDate` de `@/lib/utils/dates`.
- Produces:
  - `type EstadoDeResumen = 'proyectado' | 'pendiente' | 'vencido' | 'pagado'`
  - `type ResumenNavegable = { id: string; closingDate: string; dueDate: string; source: 'generated' | 'declared'; estado: EstadoDeResumen }`
  - `type FilasDeResumen = { conFecha: ProcessedTransaction[]; sinFecha: ProcessedTransaction[] }`
  - `listarResumenesDeTarjeta(method: PaymentMethod, ciclos: CreditCardCycle[], transactions: ProcessedTransaction[], now: Date): ResumenNavegable[]`
  - `filasDeResumen(cycleId: string, transactions: ProcessedTransaction[]): FilasDeResumen`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/finance/__tests__/detalle-resumen.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { listarResumenesDeTarjeta, filasDeResumen } from '../detalle-resumen'
import type { CreditCardCycle } from '../cycles'
import type { ProcessedTransaction } from '../types'
import type { PaymentMethod } from '@/types/database'

// Ciclos REALES de la Visa Galicia (resumen del 1-sep-2026). Desparejos a proposito:
// los tres cierres son los tres jueves y el dia calendario se corre hasta 4 dias.
const ciclo = (over: Partial<CreditCardCycle>): CreditCardCycle => ({
  id: 'c1', user_id: 'u1', payment_method_id: 'visa',
  closing_date: '2026-07-23', due_date: '2026-08-03',
  source: 'generated', created_at: '2026-01-01T00:00:00Z',
  reminder_dismissed_at: null,
  ...over,
})

const JULIO = ciclo({ id: 'jul', closing_date: '2026-07-23', due_date: '2026-08-03' })
const AGOSTO = ciclo({ id: 'ago', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'declared' })
const SEPTIEMBRE = ciclo({ id: 'sep', closing_date: '2026-09-24', due_date: '2026-10-05' })
const TRES = [JULIO, AGOSTO, SEPTIEMBRE]

const visa: PaymentMethod = {
  id: 'visa', user_id: 'u1', name: 'Visa', type: 'credit',
  default_closing_day: 20, default_payment_day: 1, created_at: '2026-01-01',
  is_personal: false, is_default: false, bucket: 'pocket',
  initial_balance: 0, initial_balance_at: null,
} as PaymentMethod

const tx = (over: Partial<ProcessedTransaction>): ProcessedTransaction => ({
  id: 't1', user_id: 'u1', payment_method_id: 'visa', cycle_id: 'ago',
  amount: 1000, type: 'expense', description: 'Compra', date: '2026-09-01',
  purchase_date: '2026-08-05', category_id: 'cat1', created_at: '2026-08-05T10:00:00Z',
  periodDate: '2026-08-20', realPaymentDate: '2026-09-01',
  card_payment_for: null, installment_plan_id: null, recurring_plan_id: null,
  original_amount: null, original_currency: null, is_balance_adjustment: false,
  ...over,
} as ProcessedTransaction)

// 2026-08-25: julio y agosto ya cerraron, julio ya vencio, septiembre no cerro.
const HOY = new Date('2026-08-25T12:00:00')

describe('listarResumenesDeTarjeta', () => {
  it('devuelve los resumenes ordenados por cierre ascendente', () => {
    const r = listarResumenesDeTarjeta(visa, TRES, [], HOY)
    expect(r.map((x) => x.id)).toEqual(['jul', 'ago', 'sep'])
  })

  it('un resumen que todavia no cerro es proyectado', () => {
    const r = listarResumenesDeTarjeta(visa, TRES, [], HOY)
    expect(r.find((x) => x.id === 'sep')?.estado).toBe('proyectado')
  })

  it('un resumen cerrado cuyo vencimiento no paso es pendiente', () => {
    const r = listarResumenesDeTarjeta(visa, TRES, [], HOY)
    expect(r.find((x) => x.id === 'ago')?.estado).toBe('pendiente')
  })

  it('un resumen cuyo vencimiento paso y no tiene pago es vencido', () => {
    const r = listarResumenesDeTarjeta(visa, TRES, [], HOY)
    expect(r.find((x) => x.id === 'jul')?.estado).toBe('vencido')
  })

  it('un resumen con pago imputado es pagado, aunque haya vencido', () => {
    const pago = tx({ id: 'p1', cycle_id: 'jul', card_payment_for: 'visa', purchase_date: null })
    const r = listarResumenesDeTarjeta(visa, TRES, [pago], HOY)
    expect(r.find((x) => x.id === 'jul')?.estado).toBe('pagado')
  })

  it('el dia EXACTO del vencimiento todavia es pendiente, no vencido', () => {
    // Agosto vence el 2026-09-01: ese dia todavia lo debes.
    const r = listarResumenesDeTarjeta(visa, TRES, [], new Date('2026-09-01T12:00:00'))
    expect(r.find((x) => x.id === 'ago')?.estado).toBe('pendiente')
  })

  it('el dia EXACTO del cierre ya no es proyectado: el resumen quedo fijado', () => {
    const r = listarResumenesDeTarjeta(visa, TRES, [], new Date('2026-09-24T12:00:00'))
    expect(r.find((x) => x.id === 'sep')?.estado).not.toBe('proyectado')
  })

  it('conserva el source para que la UI marque declarado vs estimado', () => {
    const r = listarResumenesDeTarjeta(visa, TRES, [], HOY)
    expect(r.find((x) => x.id === 'ago')?.source).toBe('declared')
    expect(r.find((x) => x.id === 'jul')?.source).toBe('generated')
  })

  it('ignora los ciclos de otra tarjeta', () => {
    const ajeno = ciclo({ id: 'otra', payment_method_id: 'master', closing_date: '2026-08-27' })
    const r = listarResumenesDeTarjeta(visa, [...TRES, ajeno], [], HOY)
    expect(r.map((x) => x.id)).toEqual(['jul', 'ago', 'sep'])
  })

  it('una tarjeta sin ciclos materializados devuelve lista vacia, no inventa', () => {
    expect(listarResumenesDeTarjeta(visa, [], [], HOY)).toEqual([])
  })
})

describe('filasDeResumen', () => {
  it('la pertenencia sale de cycle_id, nunca del mes de t.date', () => {
    const dentro = tx({ id: 'a', cycle_id: 'ago', date: '2026-12-31' })
    const fuera = tx({ id: 'b', cycle_id: 'sep', date: '2026-09-01' })
    const r = filasDeResumen('ago', [dentro, fuera])
    expect(r.conFecha.map((t) => t.id)).toEqual(['a'])
  })

  it('ordena ascendente por fecha de compra, como imprime el banco', () => {
    const filas = [
      tx({ id: 'c', purchase_date: '2026-08-18' }),
      tx({ id: 'a', purchase_date: '2026-07-24' }),
      tx({ id: 'b', purchase_date: '2026-08-05' }),
    ]
    expect(filasDeResumen('ago', filas).conFecha.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('desempata por created_at para que el orden sea determinista', () => {
    const filas = [
      tx({ id: 'segunda', purchase_date: '2026-08-05', created_at: '2026-08-05T18:00:00Z' }),
      tx({ id: 'primera', purchase_date: '2026-08-05', created_at: '2026-08-05T09:00:00Z' }),
    ]
    expect(filasDeResumen('ago', filas).conFecha.map((t) => t.id)).toEqual(['primera', 'segunda'])
  })

  it('las que no tienen fecha de compra van aparte, no mezcladas', () => {
    const filas = [
      tx({ id: 'vieja', purchase_date: null }),
      tx({ id: 'nueva', purchase_date: '2026-08-05' }),
    ]
    const r = filasDeResumen('ago', filas)
    expect(r.conFecha.map((t) => t.id)).toEqual(['nueva'])
    expect(r.sinFecha.map((t) => t.id)).toEqual(['vieja'])
  })

  it('el pago del resumen no es una fila del resumen', () => {
    // card_payment_for sale del medio que financia, no es consumo de la tarjeta.
    const pago = tx({ id: 'pago', card_payment_for: 'visa', purchase_date: null })
    const compra = tx({ id: 'compra' })
    const r = filasDeResumen('ago', [pago, compra])
    expect(r.conFecha.map((t) => t.id)).toEqual(['compra'])
    expect(r.sinFecha).toEqual([])
  })

  it('un resumen sin movimientos devuelve los dos grupos vacios', () => {
    expect(filasDeResumen('sep', [])).toEqual({ conFecha: [], sinFecha: [] })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/finance/__tests__/detalle-resumen.test.ts`
Expected: FAIL — `Failed to resolve import "../detalle-resumen"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/finance/detalle-resumen.ts`:

```ts
//
// El detalle de una tarjeta, resumen por resumen. PURO: sin Zustand ni Supabase.
//
// NO calcula totales. El total de un resumen sale de computePaymentMethodStatus
// con `cicloObjetivo` -- una segunda definicion de "cuanto debo" es exactamente lo
// que produjo el falso "bajaste" del 31-ago.
//
// Spec: docs/superpowers/specs/2026-09-02-detalle-por-resumen-design.md
import { formatLocalDate } from '@/lib/utils/dates'
import { ciclosDeMetodo, type CreditCardCycle } from './cycles'
import { hasCardPaymentInCycle } from './balances'
import type { ProcessedTransaction } from './types'
import type { PaymentMethod } from '@/types/database'

export type EstadoDeResumen = 'proyectado' | 'pendiente' | 'vencido' | 'pagado'

export type ResumenNavegable = {
  id: string
  closingDate: string
  dueDate: string
  source: 'generated' | 'declared'
  estado: EstadoDeResumen
}

export type FilasDeResumen = {
  /** Ordenadas ascendente por purchase_date: el orden en que el banco imprime el resumen. */
  conFecha: ProcessedTransaction[]
  /** Anteriores a que la app guardara la fecha de compra. No se pueden intercalar. */
  sinFecha: ProcessedTransaction[]
}

/**
 * El estado se DERIVA; no hay columna. El orden de las guardas importa: un resumen
 * pagado no es "vencido" aunque su vencimiento haya pasado.
 */
function estadoDeResumen(
  ciclo: CreditCardCycle,
  method: PaymentMethod,
  transactions: ProcessedTransaction[],
  hoy: string,
): EstadoDeResumen {
  if (hasCardPaymentInCycle(transactions, method, ciclo)) return 'pagado'
  // El dia EXACTO del cierre el resumen ya quedo fijado (el ciclo corre hasta las
  // 23:59 de esa fecha, misma regla del borde que E16).
  if (ciclo.closing_date > hoy) return 'proyectado'
  // El dia EXACTO del vencimiento todavia lo debes: sigue pendiente.
  if (ciclo.due_date < hoy) return 'vencido'
  return 'pendiente'
}

export function listarResumenesDeTarjeta(
  method: PaymentMethod,
  ciclos: CreditCardCycle[],
  transactions: ProcessedTransaction[],
  now: Date,
): ResumenNavegable[] {
  const hoy = formatLocalDate(now)
  // ciclosDeMetodo ya filtra por tarjeta y ordena ascendente por closing_date.
  return ciclosDeMetodo(method.id, ciclos).map((c) => ({
    id: c.id,
    closingDate: c.closing_date,
    dueDate: c.due_date,
    source: c.source,
    estado: estadoDeResumen(c, method, transactions, hoy),
  }))
}

export function filasDeResumen(
  cycleId: string,
  transactions: ProcessedTransaction[],
): FilasDeResumen {
  // El pago del resumen sale del medio que lo financia: no es consumo de la tarjeta
  // y no va en la lista que se cotea contra el papel.
  const delCiclo = transactions.filter((t) => t.cycle_id === cycleId && !t.card_payment_for)

  const conFecha = delCiclo
    .filter((t) => Boolean(t.purchase_date))
    .sort((a, b) => {
      const porFecha = (a.purchase_date ?? '').localeCompare(b.purchase_date ?? '')
      return porFecha !== 0 ? porFecha : (a.created_at ?? '').localeCompare(b.created_at ?? '')
    })

  const sinFecha = delCiclo.filter((t) => !t.purchase_date)

  return { conFecha, sinFecha }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/finance/__tests__/detalle-resumen.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Full verification**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: suite entera en verde, lint 0 errores / 9 warnings, tsc sin salida.

- [ ] **Step 6: Commit**

```bash
git add src/lib/finance/detalle-resumen.ts src/lib/finance/__tests__/detalle-resumen.test.ts
git commit -m "feat(detalle): los resumenes navegables de una tarjeta y sus filas"
```

---

### Task 2: El getter del store, con paridad contra Compromisos

**Files:**
- Modify: `src/lib/store/financeStore.ts` (agregar el getter a la interfaz y a la implementación)
- Test: `src/lib/store/__tests__/detalle-resumen-getter.test.ts`

**Interfaces:**
- Consumes: `listarResumenesDeTarjeta`, `filasDeResumen`, `ResumenNavegable`, `FilasDeResumen` (Task 1); `computePaymentMethodStatus` de `@/lib/finance/balances`; `cicloVigente`, `ciclosDeMetodo` de `@/lib/finance/cycles`.
- Produces:
  - `type DetalleDeResumen = { resumenes: ResumenNavegable[]; actual: ResumenNavegable | null; deuda: number; totalARS: number; totalUSD: number; filas: FilasDeResumen }`
  - `getCardCycleDetail(methodId: string, cycleId?: string): DetalleDeResumen | null` — `null` si el medio no existe o no es de crédito.

**Notas para el implementer:**
- `computePaymentMethodStatus` devuelve `projectedTotal` como `ingresos − gastos`: es **negativo cuando debés**. La deuda es `-projectedTotal`. Un valor ≤ 0 significa que el resumen está al día o tiene saldo a favor — no uses `Math.abs`, que diría «debés» sobre un saldo a favor.
- Si `cycleId` no existe o no pertenece a esa tarjeta, cae al vigente en vez de romper. Si no hay vigente (todos vencidos), cae al último de la lista.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/store/__tests__/detalle-resumen-getter.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFinanceStore } from '../financeStore'
import { computePendingCreditCards } from '@/lib/finance/balances'
import type { CreditCardCycle } from '@/lib/finance/cycles'

const ciclo = (over: Partial<CreditCardCycle>): CreditCardCycle => ({
  id: 'c1', user_id: 'u1', payment_method_id: 'visa',
  closing_date: '2026-07-23', due_date: '2026-08-03',
  source: 'generated', created_at: '2026-01-01T00:00:00Z',
  reminder_dismissed_at: null,
  ...over,
})

const JULIO = ciclo({ id: 'jul', closing_date: '2026-07-23', due_date: '2026-08-03' })
const AGOSTO = ciclo({ id: 'ago', closing_date: '2026-08-20', due_date: '2026-09-01' })
const SEPTIEMBRE = ciclo({ id: 'sep', closing_date: '2026-09-24', due_date: '2026-10-05' })

const visa = {
  id: 'visa', user_id: 'u1', name: 'Visa Galicia', type: 'credit',
  default_closing_day: 20, default_payment_day: 1, created_at: '2026-01-01',
  is_personal: false, is_default: false, bucket: 'pocket',
  initial_balance: 0, initial_balance_at: null,
}

const compra = (over: Record<string, unknown>) => ({
  id: 't1', user_id: 'u1', payment_method_id: 'visa', cycle_id: 'ago',
  amount: 1000, type: 'expense', description: 'Compra', date: '2026-09-01',
  purchase_date: '2026-08-05', category_id: 'cat1', created_at: '2026-08-05T10:00:00Z',
  card_payment_for: null, installment_plan_id: null, recurring_plan_id: null,
  original_amount: null, original_currency: null, is_balance_adjustment: false,
  ...over,
})

function sembrar(transactions: unknown[]) {
  useFinanceStore.setState({
    paymentMethods: [visa],
    creditCardCycles: [JULIO, AGOSTO, SEPTIEMBRE],
    recurringPlans: [],
    transactions,
    isInitialized: true,
  } as never)
}

describe('getCardCycleDetail', () => {
  beforeEach(() => {
    sembrar([
      compra({ id: 'a', cycle_id: 'ago', amount: 15000, purchase_date: '2026-08-05' }),
      compra({ id: 'b', cycle_id: 'ago', amount: 5000, purchase_date: '2026-07-30' }),
      compra({ id: 'vieja', cycle_id: 'jul', amount: 9000, purchase_date: null }),
    ])
  })

  it('devuelve los tres resumenes navegables de la tarjeta', () => {
    const d = useFinanceStore.getState().getCardCycleDetail('visa')
    expect(d?.resumenes.map((r) => r.id)).toEqual(['jul', 'ago', 'sep'])
  })

  it('sin cycleId abre en el resumen vigente', () => {
    // El getter usa la fecha real del sistema; lo que se fija acá es que `actual`
    // sea SIEMPRE uno de los resumenes de la tarjeta y nunca null habiendo ciclos.
    const d = useFinanceStore.getState().getCardCycleDetail('visa')
    expect(d?.actual).not.toBeNull()
    expect(d?.resumenes.map((r) => r.id)).toContain(d?.actual?.id)
  })

  it('con cycleId abre en ese resumen y trae sus filas ordenadas', () => {
    const d = useFinanceStore.getState().getCardCycleDetail('visa', 'ago')
    expect(d?.actual?.id).toBe('ago')
    expect(d?.filas.conFecha.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('la deuda del resumen es positiva cuando debes', () => {
    const d = useFinanceStore.getState().getCardCycleDetail('visa', 'ago')
    expect(d?.deuda).toBe(20000)
  })

  it('un resumen sin movimientos da deuda cero y no desaparece', () => {
    const d = useFinanceStore.getState().getCardCycleDetail('visa', 'sep')
    expect(d?.actual?.id).toBe('sep')
    expect(d?.deuda).toBe(0)
    expect(d?.filas).toEqual({ conFecha: [], sinFecha: [] })
  })

  it('las filas sin fecha de compra llegan separadas', () => {
    const d = useFinanceStore.getState().getCardCycleDetail('visa', 'jul')
    expect(d?.filas.sinFecha.map((t) => t.id)).toEqual(['vieja'])
  })

  it('un cycleId que no es de esta tarjeta cae al vigente en vez de romper', () => {
    const d = useFinanceStore.getState().getCardCycleDetail('visa', 'no-existe')
    expect(d?.actual).not.toBeNull()
    expect(d?.resumenes.map((r) => r.id)).toContain(d?.actual?.id)
  })

  it('un medio que no es de credito devuelve null', () => {
    useFinanceStore.setState({
      paymentMethods: [{ ...visa, id: 'mp', type: 'debit', name: 'Mercado Pago' }],
    } as never)
    expect(useFinanceStore.getState().getCardCycleDetail('mp')).toBeNull()
  })
})

describe('paridad con Compromisos', () => {
  // EL RELOJ VA CONGELADO. Sin esto el test pasa por casualidad del calendario:
  // con la fecha real, el ciclo vigente seria 'sep', que no tiene movimientos, asi
  // que resumenDelCiclo devuelve null, computePendingCreditCards devuelve [] y el
  // for no itera -- verde sin haber comparado nada. Es literalmente el defecto que
  // el plan del historico encontro en SU test de paridad el 31-ago.
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-25T12:00:00')) })
  afterEach(() => { vi.useRealTimers() })

  it('la deuda del resumen vigente es IDENTICA a la que muestra Compromisos', () => {
    // El invariante de la pantalla: el detalle no puede contradecir al numero que
    // el usuario ya vio. Si esto se rompe, es el bug del 31-ago otra vez.
    sembrar([
      compra({ id: 'a', cycle_id: 'ago', amount: 15000 }),
      compra({ id: 'b', cycle_id: 'ago', amount: 5000 }),
    ])
    const s = useFinanceStore.getState()
    const desdeCompromisos = computePendingCreditCards(
      s.paymentMethods, s.transactions, s.recurringPlans, s.creditCardCycles, new Date(),
    )
    // Sin esta linea el test es vacuo: verifica que un for vacio no falle.
    expect(desdeCompromisos.length).toBeGreaterThan(0)

    for (const resumen of desdeCompromisos) {
      const d = s.getCardCycleDetail(resumen.methodId, resumen.cycleId)
      expect(d?.deuda).toBe(resumen.total)
      expect(d?.totalARS).toBe(resumen.totalARS)
      expect(d?.totalUSD).toBe(resumen.totalUSD)
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/store/__tests__/detalle-resumen-getter.test.ts`
Expected: FAIL — `getCardCycleDetail is not a function`.

- [ ] **Step 3: Add the type and interface entry**

In `src/lib/store/financeStore.ts`, next to the other getter declarations in the store interface (near `getPaymentMethodStatus`), add:

```ts
  getCardCycleDetail: (methodId: string, cycleId?: string) => DetalleDeResumen | null;
```

And near the top, with the other type imports:

```ts
import {
  listarResumenesDeTarjeta,
  filasDeResumen,
  type ResumenNavegable,
  type FilasDeResumen,
} from '@/lib/finance/detalle-resumen';

export type DetalleDeResumen = {
  resumenes: ResumenNavegable[];
  actual: ResumenNavegable | null;
  /** Positiva cuando debes. <= 0 = al dia o saldo a favor. */
  deuda: number;
  totalARS: number;
  totalUSD: number;
  filas: FilasDeResumen;
};
```

- [ ] **Step 4: Write the implementation**

In the store body, next to `getPaymentMethodStatus`:

```ts
  getCardCycleDetail: (methodId, cycleId) => {
    const { transactions, paymentMethods, recurringPlans, creditCardCycles } = get();
    const method = paymentMethods.find((m) => m.id === methodId);
    if (!method || method.type !== 'credit') return null;

    const now = new Date();
    const resumenes = listarResumenesDeTarjeta(method, creditCardCycles, transactions, now);
    if (resumenes.length === 0) {
      return { resumenes, actual: null, deuda: 0, totalARS: 0, totalUSD: 0, filas: { conFecha: [], sinFecha: [] } };
    }

    // Un cycleId ajeno o inexistente cae al vigente en vez de romper la pantalla;
    // sin vigente (todos vencidos), al ultimo de la lista.
    const ciclos = ciclosDeMetodo(methodId, creditCardCycles);
    const vigente = cicloVigente(ciclos, now);
    const elegido =
      resumenes.find((r) => r.id === cycleId) ??
      resumenes.find((r) => r.id === vigente?.id) ??
      resumenes[resumenes.length - 1];

    // El total NO se calcula aca: sale de la misma funcion que alimenta Compromisos.
    const ciclo = ciclos.find((c) => c.id === elegido.id)!;
    const status = computePaymentMethodStatus(method, transactions, recurringPlans, now, creditCardCycles, ciclo);

    return {
      resumenes,
      actual: elegido,
      // projectedTotal es ingresos - gastos: negativo cuando debes.
      deuda: -status.projectedTotal,
      totalARS: status.arsExpenses,
      totalUSD: status.usdExpenses,
      filas: filasDeResumen(elegido.id, transactions),
    };
  },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/store/__tests__/detalle-resumen-getter.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Full verification and commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/lib/store/financeStore.ts src/lib/store/__tests__/detalle-resumen-getter.test.ts
git commit -m "feat(detalle): getter del detalle por resumen, con paridad contra Compromisos"
```

---

### Task 3: Selector de resumen (navegación)

**Files:**
- Create: `src/components/medios-pago/selector-de-resumen.tsx`
- Test: `src/components/medios-pago/__tests__/selector-de-resumen.test.tsx`

**Interfaces:**
- Consumes: `ResumenNavegable`, `EstadoDeResumen` (Task 1); `Button` de `@/components/ui/button`; `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` de `@/components/ui/dialog`; `parseLocalDate` de `@/lib/utils/dates`.
- Produces:
  - `ETIQUETA_ESTADO: Record<EstadoDeResumen, string>` — `{ proyectado: 'Proyectado', pendiente: 'Pendiente', vencido: 'Vencido', pagado: 'Pagado' }`
  - `SelectorDeResumen({ resumenes, actualId, onSelect }: { resumenes: ResumenNavegable[]; actualId: string; onSelect: (id: string) => void })`

**Nota:** no reusar `MonthSelector`: navega por meses vía `router.push` y consume `getMonthlyComparison`. Se copia la **forma** (flechas + pill tappable + diálogo para saltar), no el componente. El pill muestra el mes del **cierre**; si dos resúmenes de la tarjeta cierran en el mismo mes calendario, ambos agregan el día (`«ago 20»`, `«ago 31»`) para desambiguar.

- [ ] **Step 1: Write the failing tests**

Create `src/components/medios-pago/__tests__/selector-de-resumen.test.tsx`:

```tsx
/**
 * Markup del selector de resumen. Sin jsdom: se verifica el HTML que produce
 * renderToStaticMarkup, no el layout ni la interaccion.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SelectorDeResumen } from '../selector-de-resumen';
import type { ResumenNavegable } from '@/lib/finance/detalle-resumen';

const R: ResumenNavegable[] = [
  { id: 'jul', closingDate: '2026-07-23', dueDate: '2026-08-03', source: 'generated', estado: 'vencido' },
  { id: 'ago', closingDate: '2026-08-20', dueDate: '2026-09-01', source: 'declared', estado: 'pendiente' },
  { id: 'sep', closingDate: '2026-09-24', dueDate: '2026-10-05', source: 'generated', estado: 'proyectado' },
];

describe('SelectorDeResumen', () => {
  it('muestra el mes del cierre del resumen actual', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="ago" onSelect={() => {}} />);
    expect(html.toLowerCase()).toContain('agosto');
  });

  it('las flechas tienen label accesible', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="ago" onSelect={() => {}} />);
    expect(html).toContain('Resumen anterior');
    expect(html).toContain('Resumen siguiente');
  });

  // React emite los atributos en el orden del JSX: aria-label viene ANTES de
  // disabled, asi que hay que mirar hacia ADELANTE desde el label hasta cerrar
  // la etiqueta. Mirar hacia atras da un falso rojo.
  const atributosDelBoton = (html: string, label: string) => {
    const i = html.indexOf(`aria-label="${label}"`);
    return i === -1 ? '' : html.slice(i, html.indexOf('>', i));
  };

  it('en el primer resumen la flecha de anterior queda deshabilitada', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="jul" onSelect={() => {}} />);
    expect(atributosDelBoton(html, 'Resumen anterior')).toContain('disabled');
    expect(atributosDelBoton(html, 'Resumen siguiente')).not.toContain('disabled');
  });

  it('en el ultimo resumen la flecha de siguiente queda deshabilitada', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="sep" onSelect={() => {}} />);
    expect(atributosDelBoton(html, 'Resumen siguiente')).toContain('disabled');
    expect(atributosDelBoton(html, 'Resumen anterior')).not.toContain('disabled');
  });

  it('en un resumen del medio ninguna flecha esta deshabilitada', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="ago" onSelect={() => {}} />);
    expect(atributosDelBoton(html, 'Resumen anterior')).not.toContain('disabled');
    expect(atributosDelBoton(html, 'Resumen siguiente')).not.toContain('disabled');
  });

  it('los controles cumplen el minimo de 44px', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="ago" onSelect={() => {}} />);
    expect(html).toContain('min-h-[44px]');
  });

  it('con dos resumenes que cierran el mismo mes, el pill desambigua con el dia', () => {
    const mismoMes: ResumenNavegable[] = [
      { id: 'a', closingDate: '2026-08-04', dueDate: '2026-08-15', source: 'generated', estado: 'pagado' },
      { id: 'b', closingDate: '2026-08-31', dueDate: '2026-09-10', source: 'generated', estado: 'pendiente' },
    ];
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={mismoMes} actualId="b" onSelect={() => {}} />);
    expect(html).toContain('31');
  });

  it('una tarjeta con un solo resumen no ofrece navegacion rota', () => {
    const uno = [R[1]];
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={uno} actualId="ago" onSelect={() => {}} />);
    expect(html.match(/disabled/g)?.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/medios-pago/__tests__/selector-de-resumen.test.tsx`
Expected: FAIL — cannot resolve `../selector-de-resumen`.

- [ ] **Step 3: Write the implementation**

Create `src/components/medios-pago/selector-de-resumen.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import type { EstadoDeResumen, ResumenNavegable } from '@/lib/finance/detalle-resumen';

export const ETIQUETA_ESTADO: Record<EstadoDeResumen, string> = {
  proyectado: 'Proyectado',
  pendiente: 'Pendiente',
  vencido: 'Vencido',
  pagado: 'Pagado',
};

const mesDe = (d: string) => format(parseLocalDate(d), 'MMMM', { locale: es });
const mesCorto = (d: string) => format(parseLocalDate(d), 'd MMM', { locale: es });

/**
 * Navegacion entre RESUMENES, no entre meses: dos resumenes pueden vencer en el mismo
 * mes calendario (declarar produce exactamente eso), asi que un picker de meses no
 * puede representarlos. Se copia la forma de MonthSelector, no el componente.
 */
export function SelectorDeResumen({
  resumenes,
  actualId,
  onSelect,
}: {
  resumenes: ResumenNavegable[];
  actualId: string;
  onSelect: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const i = resumenes.findIndex((r) => r.id === actualId);
  const actual = resumenes[i];
  if (!actual) return null;

  // Si otro resumen cierra en el mismo mes calendario, el mes solo no alcanza.
  const mes = mesDe(actual.closingDate);
  const hayHomonimo = resumenes.some((r) => r.id !== actual.id && mesDe(r.closingDate) === mes);
  const etiqueta = hayHomonimo
    ? `${mes} ${format(parseLocalDate(actual.closingDate), 'd')}`
    : mes;

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        aria-label="Resumen anterior"
        disabled={i <= 0}
        onClick={() => onSelect(resumenes[i - 1].id)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-[1.5px] border-border text-muted disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-border bg-surface-2 px-4"
      >
        <span className="font-display text-base capitalize text-text">{etiqueta}</span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>

      <button
        type="button"
        aria-label="Resumen siguiente"
        disabled={i >= resumenes.length - 1}
        onClick={() => onSelect(resumenes[i + 1].id)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-[1.5px] border-border text-muted disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-[380px] bg-surface border-border text-text p-5">
          <DialogHeader className="px-1 pt-1 pb-2">
            <DialogTitle className="text-sm font-bold text-muted">Elegir resumen</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto grid gap-1.5">
            {[...resumenes].reverse().map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { onSelect(r.id); setAbierto(false); }}
                className={cn(
                  'flex min-h-[44px] items-center justify-between rounded-xl border-[1.5px] px-3 text-left',
                  r.id === actual.id ? 'border-accent-deep bg-accent/10' : 'border-border bg-surface-2',
                )}
              >
                <span className="text-sm text-text">
                  Cierra {mesCorto(r.closingDate)} · vence {mesCorto(r.dueDate)}
                </span>
                <span className="text-[10px] uppercase text-muted">{ETIQUETA_ESTADO[r.estado]}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/medios-pago/__tests__/selector-de-resumen.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/components/medios-pago/selector-de-resumen.tsx src/components/medios-pago/__tests__/selector-de-resumen.test.tsx
git commit -m "feat(detalle): selector de resumen, que navega resumenes y no meses"
```

---

### Task 4: Cabecera del resumen

**Files:**
- Create: `src/components/medios-pago/cabecera-de-resumen.tsx`
- Test: `src/components/medios-pago/__tests__/cabecera-de-resumen.test.tsx`

**Interfaces:**
- Consumes: `ResumenNavegable` (Task 1); `ETIQUETA_ESTADO` (Task 3); `EtiquetaProcedencia` de `./ciclo-fechas-field`; `formatCurrency`, `formatUsd` de `@/lib/utils`; `Button`.
- Produces: `CabeceraDeResumen({ resumen, deuda, totalARS, totalUSD, onCorregirFechas }: { resumen: ResumenNavegable; deuda: number; totalARS: number; totalUSD: number; onCorregirFechas: () => void })`

**Nota:** la cifra del total lleva `shadow-bandera` — es **la única** cifra con la firma en esta pantalla. `deuda <= 0` se muestra como «Al día», no como un monto negativo.

- [ ] **Step 1: Write the failing tests**

Create `src/components/medios-pago/__tests__/cabecera-de-resumen.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CabeceraDeResumen } from '../cabecera-de-resumen';
import type { ResumenNavegable } from '@/lib/finance/detalle-resumen';

const base: ResumenNavegable = {
  id: 'ago', closingDate: '2026-08-20', dueDate: '2026-09-01',
  source: 'generated', estado: 'pendiente',
};

const render = (over: Partial<Parameters<typeof CabeceraDeResumen>[0]> = {}) =>
  renderToStaticMarkup(
    <CabeceraDeResumen
      resumen={base} deuda={20000} totalARS={20000} totalUSD={0}
      onCorregirFechas={() => {}}
      {...over}
    />,
  );

describe('CabeceraDeResumen', () => {
  it('muestra las dos fechas del resumen completas', () => {
    const html = render();
    expect(html).toContain('20 ago');
    expect(html).toContain('1 sep');
  });

  it('un resumen estimado se marca como tal', () => {
    expect(render()).toContain('estimado');
  });

  it('un resumen declarado dice "del resumen"', () => {
    expect(render({ resumen: { ...base, source: 'declared' } })).toContain('del resumen');
  });

  it('el total lleva la firma bandera, que es unica por pantalla', () => {
    const html = render();
    expect(html).toContain('shadow-bandera');
    expect(html.match(/shadow-bandera/g)?.length).toBe(1);
  });

  it('muestra el chip de estado', () => {
    expect(render({ resumen: { ...base, estado: 'vencido' } })).toContain('Vencido');
    expect(render({ resumen: { ...base, estado: 'proyectado' } })).toContain('Proyectado');
  });

  it('un resumen proyectado avisa que esta incompleto', () => {
    const html = render({ resumen: { ...base, estado: 'proyectado' } });
    expect(html.toLowerCase()).toContain('todavía no cerró');
  });

  it('un resumen sin deuda dice "Al dia" y no un monto negativo', () => {
    const html = render({ deuda: 0, totalARS: 0, totalUSD: 0 });
    expect(html).toContain('Al día');
    expect(html).not.toContain('-$');
  });

  it('desglosa ARS y USD sin mezclarlos', () => {
    const html = render({ deuda: 175500, totalARS: 20000, totalUSD: 100 });
    expect(html).toContain('20.000');
    expect(html).toContain('100');
  });

  it('ofrece corregir las fechas, con touch target valido', () => {
    const html = render();
    expect(html).toContain('Corregir fechas');
    expect(html).toContain('min-h-[44px]');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/medios-pago/__tests__/cabecera-de-resumen.test.tsx`
Expected: FAIL — cannot resolve `../cabecera-de-resumen`.

- [ ] **Step 3: Write the implementation**

Create `src/components/medios-pago/cabecera-de-resumen.tsx`:

```tsx
'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency, formatUsd } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import { EtiquetaProcedencia } from './ciclo-fechas-field';
import { ETIQUETA_ESTADO } from './selector-de-resumen';
import type { ResumenNavegable } from '@/lib/finance/detalle-resumen';

const corto = (d: string) => format(parseLocalDate(d), 'd MMM', { locale: es });

const TONO_ESTADO: Record<ResumenNavegable['estado'], string> = {
  proyectado: 'text-muted',
  pendiente: 'text-warn',
  vencido: 'text-bad',
  pagado: 'text-good',
};

/**
 * Lo que se cotea contra el papel del banco: las dos fechas con su procedencia, el
 * total, el estado, y la via para declarar las fechas reales -- estar con el resumen
 * enfrente es el mejor momento para hacerlo.
 */
export function CabeceraDeResumen({
  resumen,
  deuda,
  totalARS,
  totalUSD,
  onCorregirFechas,
}: {
  resumen: ResumenNavegable;
  deuda: number;
  totalARS: number;
  totalUSD: number;
  onCorregirFechas: () => void;
}) {
  const alDia = deuda <= 0;

  return (
    <div className="rounded-2xl border-[1.5px] border-border bg-surface p-5 grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm text-text">
            Cierra {corto(resumen.closingDate)} · vence {corto(resumen.dueDate)}
          </p>
          <EtiquetaProcedencia source={resumen.source} />
        </div>
        <span className={cn('text-[10px] font-semibold uppercase tracking-wide', TONO_ESTADO[resumen.estado])}>
          {ETIQUETA_ESTADO[resumen.estado]}
        </span>
      </div>

      <div className="pr-3 pb-2">
        {alDia ? (
          <p className="font-display tnum text-3xl leading-[--leading-display] text-good shadow-bandera">
            Al día
          </p>
        ) : (
          <p className="font-display tnum text-3xl leading-[--leading-display] text-text shadow-bandera">
            {formatCurrency(totalARS)}
          </p>
        )}
        {totalUSD > 0 && (
          <p className="font-display tnum mt-1 text-sm text-muted">+ {formatUsd(totalUSD)}</p>
        )}
      </div>

      {resumen.estado === 'proyectado' && (
        <p className="text-xs text-muted">
          Este resumen todavía no cerró: solo trae lo que ya está comprometido (cuotas y
          mensualidades), no lo que gastes de acá al cierre.
        </p>
      )}

      <Button variant="soft" className="min-h-[44px] justify-self-start" onClick={onCorregirFechas}>
        Corregir fechas
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/medios-pago/__tests__/cabecera-de-resumen.test.tsx`
Expected: PASS, 9 tests.

**If the `shadow-bandera` test fails because the utility doesn't exist**, check the compiled CSS of a real build before "fixing" the class name — `bg-bandera` was written three times in a previous plan and never existed. Run `npm run build` and grep the generated CSS for `shadow-bandera`. Use whatever the design system actually exposes (see CLAUDE.md, section UI → Marca).

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/components/medios-pago/cabecera-de-resumen.tsx src/components/medios-pago/__tests__/cabecera-de-resumen.test.tsx
git commit -m "feat(detalle): cabecera del resumen con fechas, total y procedencia"
```

---

### Task 5: Filas del resumen

**Files:**
- Create: `src/components/medios-pago/filas-del-resumen.tsx`
- Test: `src/components/medios-pago/__tests__/filas-del-resumen.test.tsx`

**Interfaces:**
- Consumes: `FilasDeResumen` (Task 1); `EmptyState` de `@/components/shared/empty-state`; `formatCurrency`, `formatUsd`; `parseLocalDate`.
- Produces:
  - `FilasDelResumen({ filas }: { filas: FilasDeResumen })`
  - `Fila({ t }: { t: ProcessedTransaction })` — **exportada**, porque la Task 7 la reusa para la lista del mes de las cuentas de débito y de los medios personales.

**Nota:** la fecha de cada fila es `purchase_date`, **nunca** `t.date` (que en crédito es el vencimiento y sería la misma en todas las filas). Las sin fecha van en un bloque propio al final, con su explicación.

- [ ] **Step 1: Write the failing tests**

Create `src/components/medios-pago/__tests__/filas-del-resumen.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilasDelResumen } from '../filas-del-resumen';
import type { ProcessedTransaction } from '@/lib/finance/types';

const tx = (over: Partial<ProcessedTransaction>): ProcessedTransaction => ({
  id: 't1', user_id: 'u1', payment_method_id: 'visa', cycle_id: 'ago',
  amount: 15000, type: 'expense', description: 'Supermercado', date: '2026-09-01',
  purchase_date: '2026-08-05', category_id: 'cat1', created_at: '2026-08-05T10:00:00Z',
  periodDate: '2026-08-20', realPaymentDate: '2026-09-01',
  card_payment_for: null, installment_plan_id: null, recurring_plan_id: null,
  original_amount: null, original_currency: null, is_balance_adjustment: false,
  ...over,
} as ProcessedTransaction);

describe('FilasDelResumen', () => {
  it('muestra la fecha de COMPRA, no la de vencimiento', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ purchase_date: '2026-08-05', date: '2026-09-01' })], sinFecha: [] }} />,
    );
    expect(html).toContain('5 ago');
    expect(html).not.toContain('1 sep');
  });

  it('marca las cuotas', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ installment_plan_id: 'p1' })], sinFecha: [] }} />,
    );
    expect(html).toContain('Cuota');
  });

  it('marca las mensualidades', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ recurring_plan_id: 'r1' })], sinFecha: [] }} />,
    );
    expect(html).toContain('Mensualidad');
  });

  it('un consumo en dolares se muestra en su moneda original', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ original_currency: 'USD', original_amount: 100 })], sinFecha: [] }} />,
    );
    expect(html).toContain('100');
  });

  it('un reintegro se distingue de un consumo', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({ type: 'income', description: 'Reintegro' })], sinFecha: [] }} />,
    );
    expect(html).toContain('+');
  });

  it('las sin fecha de compra van en su propio bloque, con explicacion', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [], sinFecha: [tx({ id: 'v', purchase_date: null })] }} />,
    );
    expect(html).toContain('Sin fecha de compra');
    expect(html.toLowerCase()).toContain('antes de que');
  });

  it('sin ningun movimiento muestra el estado vacio del sistema', () => {
    const html = renderToStaticMarkup(<FilasDelResumen filas={{ conFecha: [], sinFecha: [] }} />);
    expect(html).toContain('border-dashed');
  });

  it('no dibuja el bloque de sin fecha cuando no hay ninguna', () => {
    const html = renderToStaticMarkup(
      <FilasDelResumen filas={{ conFecha: [tx({})], sinFecha: [] }} />,
    );
    expect(html).not.toContain('Sin fecha de compra');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/medios-pago/__tests__/filas-del-resumen.test.tsx`
Expected: FAIL — cannot resolve `../filas-del-resumen`.

- [ ] **Step 3: Write the implementation**

Create `src/components/medios-pago/filas-del-resumen.tsx`:

```tsx
'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Receipt } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { cn, formatCurrency, formatUsd } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import type { FilasDeResumen } from '@/lib/finance/detalle-resumen';
import type { ProcessedTransaction } from '@/lib/finance/types';

const monto = (t: ProcessedTransaction) =>
  t.original_currency === 'USD' && t.original_amount
    ? formatUsd(Math.abs(Number(t.original_amount)))
    : formatCurrency(Math.abs(Number(t.amount)));

/** Exportada: la Task 7 la reusa para la lista del mes de cuentas y medios personales. */
export function Fila({ t }: { t: ProcessedTransaction }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border-[1.5px] border-border bg-surface-2 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">{t.description}</p>
        <p className="text-[10px] text-muted">
          {/* La fecha de COMPRA. t.date en credito es el vencimiento: seria la misma en todas las filas. */}
          {t.purchase_date
            ? format(parseLocalDate(t.purchase_date), "d MMM", { locale: es })
            : 'Sin fecha'}
          {t.installment_plan_id && ' · Cuota'}
          {t.recurring_plan_id && ' · Mensualidad'}
        </p>
      </div>
      <p className={cn('shrink-0 tnum text-sm font-bold', t.type === 'income' ? 'text-good' : 'text-text')}>
        {t.type === 'income' ? '+' : '-'}{monto(t)}
      </p>
    </div>
  );
}

export function FilasDelResumen({ filas }: { filas: FilasDeResumen }) {
  const vacio = filas.conFecha.length === 0 && filas.sinFecha.length === 0;

  if (vacio) {
    return (
      <EmptyState
        icon={<Receipt className="h-5 w-5 text-muted" />}
        title="Sin movimientos en este resumen"
        description="Cuando cargues un consumo con esta tarjeta, va a aparecer acá."
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {filas.conFecha.map((t) => <Fila key={t.id} t={t} />)}
      </div>

      {filas.sinFecha.length > 0 && (
        <div className="grid gap-2 border-t-[1.5px] border-border pt-4">
          <div>
            <h3 className="text-sm font-semibold text-text">Sin fecha de compra</h3>
            <p className="text-xs text-muted">
              Se cargaron antes de que la app guardara cuándo compraste, así que no se pueden
              ordenar con las demás. Cuentan igual en el total.
            </p>
          </div>
          {filas.sinFecha.map((t) => <Fila key={t.id} t={t} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/medios-pago/__tests__/filas-del-resumen.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/components/medios-pago/filas-del-resumen.tsx src/components/medios-pago/__tests__/filas-del-resumen.test.tsx
git commit -m "feat(detalle): filas del resumen con la fecha de compra real"
```

---

### Task 6: La ruta `/ajustes/medios/[id]`

**Files:**
- Create: `src/app/ajustes/medios/[id]/page.tsx`
- Create: `src/app/ajustes/medios/[id]/detalle-client.tsx`
- Modify: `src/components/medios-pago/institutional-card.tsx` (navegar en vez de abrir el modal)
- Test: `src/app/ajustes/medios/__tests__/ruta-detalle.test.ts`

**Interfaces:**
- Consumes: `getCardCycleDetail` (Task 2), `SelectorDeResumen` (Task 3), `CabeceraDeResumen` (Task 4), `FilasDelResumen` (Task 5), `EditarCicloDialog` de `@/components/medios-pago/editar-ciclo-dialog` (props `{ open, onOpenChange, methodId, ciclo }`).
- Produces: la ruta `/ajustes/medios/[id]`, con el resumen en `?resumen=<cycleId>`.

**Notas para el implementer:**
- **Next 16: `params` es una `Promise`.** En un Client Component se lee con `use(params)`; en un Server Component, con `await`. Ver `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`. **Es la primera ruta dinámica del repo**: no hay precedente que copiar.
- El patrón de query param en un client component ya existe en `src/app/movimientos/page.tsx:58` (`useSearchParams` + `useRouter` + `usePathname`). Copiarlo.
- El store se toma entero (`const store = useFinanceStore()`), nunca desestructurando getters.
- Cambiar de resumen actualiza la URL con `router.replace` (no `push`): navegar entre resúmenes no debería llenar el historial del navegador.

- [ ] **Step 1: Write the failing test**

Create `src/app/ajustes/medios/__tests__/ruta-detalle.test.ts`:

```ts
/**
 * Guard estructural de la ruta de detalle. Mismo criterio que nav-config.test.ts:
 * un destino que no existe se descubre en produccion como un 404, no en la suite.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(__dirname, '../../../../..');

describe('ruta /ajustes/medios/[id]', () => {
  it('tiene su page.tsx', () => {
    expect(existsSync(resolve(raiz, 'src/app/ajustes/medios/[id]/page.tsx'))).toBe(true);
  });

  it('lee params como Promise, que es la API de Next 16', () => {
    const src = readFileSync(resolve(raiz, 'src/app/ajustes/medios/[id]/page.tsx'), 'utf8');
    expect(src).toMatch(/params:\s*Promise</);
  });

  it('el detalle no desestructura getters del store', () => {
    // El React Compiler congela un getter sacado suelto; ver store-freshness.test.ts.
    const src = readFileSync(resolve(raiz, 'src/app/ajustes/medios/[id]/detalle-client.tsx'), 'utf8');
    expect(src).not.toMatch(/const\s*\{[^}]*getCardCycleDetail[^}]*\}\s*=\s*useFinanceStore/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/ajustes/medios/__tests__/ruta-detalle.test.ts`
Expected: FAIL — `expected false to be true` (no existe el `page.tsx`).

- [ ] **Step 3: Create the route**

Create `src/app/ajustes/medios/[id]/page.tsx`:

```tsx
import { DetalleClient } from './detalle-client';

// Next 16: los params de un segmento dinamico llegan como Promise.
// Ver node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleClient methodId={id} />;
}
```

- [ ] **Step 4: Create the client component**

Create `src/app/ajustes/medios/[id]/detalle-client.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { FullPageLoader } from '@/components/shared/full-page-loader';
import { SelectorDeResumen } from '@/components/medios-pago/selector-de-resumen';
import { CabeceraDeResumen } from '@/components/medios-pago/cabecera-de-resumen';
import { FilasDelResumen } from '@/components/medios-pago/filas-del-resumen';
import { EditarCicloDialog } from '@/components/medios-pago/editar-ciclo-dialog';

export function DetalleClient({ methodId }: { methodId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // El store ENTERO: sus getters son referencias estables y el React Compiler
  // congelaria el resultado si se desestructuraran (store-freshness.test.ts).
  const store = useFinanceStore();
  const [editandoFechas, setEditandoFechas] = useState(false);

  useEffect(() => {
    if (!store.isInitialized) store.fetchAllData();
  }, [store]);

  if (store.isLoading && !store.isInitialized) {
    return <FullPageLoader text="Cargando movimientos..." />;
  }

  const method = store.paymentMethods.find((m) => m.id === methodId);
  if (!method) {
    return (
      <main className="mx-auto max-w-[720px] px-5 py-6">
        <p className="text-sm text-muted">Ese medio de pago no existe.</p>
        <Link href="/ajustes/medios" className="text-sm text-accent-deep underline">
          Volver a la billetera
        </Link>
      </main>
    );
  }

  const detalle = store.getCardCycleDetail(methodId, searchParams.get('resumen') ?? undefined);

  // Navegar entre resumenes no debe llenar el historial: replace, no push.
  const irA = (cycleId: string) =>
    router.replace(`/ajustes/medios/${methodId}?resumen=${cycleId}`, { scroll: false });

  const cicloActual = detalle?.actual
    ? store.creditCardCycles.find((c) => c.id === detalle.actual!.id)
    : undefined;

  return (
    <main className="mx-auto max-w-[720px] px-5 py-6 pb-28 grid gap-5">
      <div className="flex items-center gap-3">
        <Link
          href="/ajustes/medios"
          aria-label="Volver a la billetera"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-[1.5px] border-border text-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-display text-xl text-text">{method.name}</h1>
          <p className="text-xs uppercase tracking-widest text-muted">
            {method.type === 'credit' ? 'Tarjeta de crédito' : 'Cuenta / Efectivo'}
          </p>
        </div>
      </div>

      {detalle && detalle.actual ? (
        <>
          <SelectorDeResumen
            resumenes={detalle.resumenes}
            actualId={detalle.actual.id}
            onSelect={irA}
          />
          <CabeceraDeResumen
            resumen={detalle.actual}
            deuda={detalle.deuda}
            totalARS={detalle.totalARS}
            totalUSD={detalle.totalUSD}
            onCorregirFechas={() => setEditandoFechas(true)}
          />
          <FilasDelResumen filas={detalle.filas} />
          {cicloActual && (
            <EditarCicloDialog
              open={editandoFechas}
              onOpenChange={setEditandoFechas}
              methodId={methodId}
              ciclo={cicloActual}
            />
          )}
        </>
      ) : (
        <p className="text-sm text-muted">
          Esta tarjeta todavía no tiene resúmenes cargados. Configurá el día de cierre y el de
          vencimiento en la ficha para que la app los pueda armar.
        </p>
      )}
    </main>
  );
}
```

**Note:** if `FullPageLoader` is not at `@/components/shared/full-page-loader`, find its real path with `grep -rn "FullPageLoader" src/app/ajustes/medios/page.tsx` and use that import. Do not invent a loader.

- [ ] **Step 5: Make the card navigate instead of opening the modal**

In `src/components/medios-pago/institutional-card.tsx`, replace the `onClick={() => setIsDetailOpen(true)}` at line ~103 with navigation:

```tsx
onClick={() => router.push(`/ajustes/medios/${data.id}`)}
```

Add `import { useRouter } from 'next/navigation';` and `const router = useRouter();` in the component body. Leave `isDetailOpen` / the modal render in place for now — Task 7 removes them together with the modal, so this task stays independently revertible.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/app/ajustes/medios/__tests__/ruta-detalle.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Full verification and commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
git add src/app/ajustes/medios src/components/medios-pago/institutional-card.tsx
git commit -m "feat(detalle): la pantalla de detalle por resumen, primera ruta dinamica del repo"
```

`npm run build` corre acá y no en las tasks anteriores porque es la primera ruta nueva: un error de segmento dinámico no lo ve ni vitest ni tsc.

---

### Task 7: Portar cuentas y personales, y retirar el modal

**Files:**
- Modify: `src/app/ajustes/medios/[id]/detalle-client.tsx` (contenido para no-crédito)
- Modify: `src/components/medios-pago/institutional-card.tsx` (borrar el modal y su estado)
- Modify: `src/components/medios-pago/personal-debt-card.tsx` (navegar; borrar el modal y su estado)
- Modify: `src/app/ajustes/medios/page.tsx` (retirar `getPaymentMethodTransactionsForCurrentMonth` del `useMemo` y de la desestructuración)
- Modify: `src/lib/store/financeStore.ts` (retirar el getter huérfano de la interfaz y del body)
- Modify: `src/components/shared/__tests__/empty-state-adoption.test.ts` (sacar la excepción muerta)
- Delete: `src/components/medios-pago/payment-method-detail-modal.tsx`
- Test: `src/app/ajustes/medios/__tests__/ruta-detalle.test.ts` (agregar los dos casos de abajo)

**Interfaces:**
- Consumes: `AccountBalance` de `@/lib/finance/pocket` (vía `store.getAvailableToSpend().accounts`).
- Produces: nada nuevo. Esta task sólo mueve y borra.

**Nota:** el contenido de no-crédito se **porta**, no se rediseña: saldo (del bolsillo, `cuenta.balance`), costos fijos y los movimientos del mes en lista plana, más la línea «Se transfiere el día N» que hoy vive en `personal-debt-card`. Como `getPaymentMethodTransactionsForCurrentMonth` se retira, la lista del mes se arma en el cliente con la misma regla que ese getter usaba para no-crédito: `isExpenseInCurrentMonthScope` para gastos e `isSameMonth(parseLocalDate(t.date), now)` para ingresos.

- [ ] **Step 1: Write the failing tests**

Add to `src/app/ajustes/medios/__tests__/ruta-detalle.test.ts`:

```ts
describe('el modal de detalle se retiro', () => {
  it('el archivo ya no existe', () => {
    expect(existsSync(resolve(raiz, 'src/components/medios-pago/payment-method-detail-modal.tsx'))).toBe(false);
  });

  it('nadie lo importa', () => {
    const cards = ['institutional-card.tsx', 'personal-debt-card.tsx'];
    for (const f of cards) {
      const src = readFileSync(resolve(raiz, 'src/components/medios-pago', f), 'utf8');
      expect(src).not.toContain('PaymentMethodDetailModal');
    }
  });

  it('el guard de estados vacios no exceptua un archivo que ya no existe', () => {
    const src = readFileSync(resolve(raiz, 'src/components/shared/__tests__/empty-state-adoption.test.ts'), 'utf8');
    expect(src).not.toContain('payment-method-detail-modal');
  });

  it('el getter huerfano se retiro del store', () => {
    const src = readFileSync(resolve(raiz, 'src/lib/store/financeStore.ts'), 'utf8');
    expect(src).not.toContain('getPaymentMethodTransactionsForCurrentMonth');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/ajustes/medios/__tests__/ruta-detalle.test.ts`
Expected: FAIL — los cuatro casos nuevos en rojo.

- [ ] **Step 3: Add the non-credit branch to the detail screen**

Create `src/app/ajustes/medios/[id]/detalle-cuenta.tsx` — el contenido portado, en su propio archivo para que `detalle-client.tsx` no crezca a dos pantallas:

```tsx
'use client';

import { isSameMonth } from 'date-fns';
import { Wallet } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Fila } from '@/components/medios-pago/filas-del-resumen';
import { isExpenseInCurrentMonthScope } from '@/lib/finance/creditCycle';
import { formatCurrency } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';
import type { AccountBalance } from '@/lib/finance/pocket';
import type { ProcessedTransaction } from '@/lib/finance/types';
import type { PaymentMethod } from '@/types/database';

/**
 * Detalle de una cuenta de debito/efectivo o de un medio personal: el contenido que
 * tenia el modal, PORTADO tal cual. No se rediseña acá -- queda fuera de alcance del
 * plan del detalle por resumen (spec 2026-09-02).
 */
export function DetalleDeCuenta({
  method,
  cuenta,
  fixedCosts,
  transactions,
  paymentMethods,
}: {
  method: PaymentMethod;
  cuenta: AccountBalance | null;
  fixedCosts: number;
  transactions: ProcessedTransaction[];
  paymentMethods: PaymentMethod[];
}) {
  const now = new Date();
  // La MISMA regla que usaba getPaymentMethodTransactionsForCurrentMonth para
  // no-credito, que esta task retira: gastos por el scope del mes, ingresos por
  // mes calendario de t.date.
  const delMes = transactions.filter((t) => {
    if (t.payment_method_id !== method.id) return false;
    if (t.type === 'income') return isSameMonth(parseLocalDate(t.date), now);
    return isExpenseInCurrentMonthScope(t, paymentMethods, now);
  });

  const saldo = cuenta?.balance ?? 0;

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border-[1.5px] border-border bg-surface-2 p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase text-muted">Saldo actual</p>
          <p className={cn('font-display tnum text-xl leading-none', saldo < 0 ? 'text-bad' : 'text-good')}>
            {formatCurrency(saldo)}
          </p>
          {cuenta && !cuenta.anchored && (
            <p className="mt-1 text-[10px] text-faint">Sin saldo declarado</p>
          )}
        </div>
        <div className="rounded-2xl border-[1.5px] border-border bg-surface-2 p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase text-muted">Costos fijos</p>
          <p className="font-display tnum text-xl leading-none text-text">{formatCurrency(fixedCosts)}</p>
        </div>
      </div>

      {method.is_personal && (
        <p className="rounded-xl border-[1.5px] border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          {method.default_payment_day
            ? `Se transfiere el día ${method.default_payment_day}`
            : 'Sin fecha de pago definida'}
        </p>
      )}

      <div className="grid gap-2">
        <h2 className="text-sm font-semibold text-text">Movimientos del mes</h2>
        {delMes.length > 0 ? (
          delMes.map((t) => <Fila key={t.id} t={t} />)
        ) : (
          <EmptyState
            icon={<Wallet className="h-5 w-5 text-muted" />}
            title="Sin movimientos este mes"
            description="Lo que cargues con este medio va a aparecer acá."
          />
        )}
      </div>
    </div>
  );
}
```

Then in `detalle-client.tsx`, branch before the cycle blocks:

```tsx
  if (method.type !== 'credit') {
    const cuenta = store.getAvailableToSpend().accounts.find((a) => a.methodId === methodId) ?? null;
    return (
      <main className="mx-auto max-w-[720px] px-5 py-6 pb-28 grid gap-5">
        {/* mismo encabezado con el boton de volver que el caso credito */}
        <DetalleDeCuenta
          method={method}
          cuenta={cuenta}
          fixedCosts={store.getPaymentMethodStatus(methodId).fixedCosts}
          transactions={store.transactions}
          paymentMethods={store.paymentMethods}
        />
      </main>
    );
  }
```

Extract the header (back button + name + type) into a small local component so both branches share it instead of duplicating the markup.

- [ ] **Step 4: Delete the modal and its consumers' wiring**

```bash
git rm src/components/medios-pago/payment-method-detail-modal.tsx
```

Then in `institutional-card.tsx` and `personal-debt-card.tsx`: remove the `PaymentMethodDetailModal` import, its JSX, and the now-unused `isDetailOpen` state. In `personal-debt-card.tsx`, make the card navigate with `router.push(\`/ajustes/medios/${data.id}\`)` the same way Task 6 did for `institutional-card.tsx`.

- [ ] **Step 5: Retire the orphaned getter and the dead exception**

In `financeStore.ts`, delete `getPaymentMethodTransactionsForCurrentMonth` from the store interface and from the store body. In `src/app/ajustes/medios/page.tsx`, remove it from the destructuring, from the `useMemo` body (the `history` field of `methodsWithData`) and from the dependency array — the cards no longer receive `history`. In `empty-state-adoption.test.ts`, delete the `'components/medios-pago/payment-method-detail-modal.tsx'` entry from `EXCEPCIONES`.

Its tests go too: search with `grep -rln "getPaymentMethodTransactionsForCurrentMonth" src` and remove the cases that only covered the retired getter. **Do not delete a test that covers something else** — if a test fails and you didn't write it, understand why before touching it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: suite entera en verde, incluidos los 7 casos de `ruta-detalle.test.ts`.

- [ ] **Step 7: Full verification and commit**

```bash
npm run lint && npx tsc --noEmit && npm run build
git add -A
git commit -m "refactor(detalle): el modal muere y todos los medios van a la pantalla"
```

---

### Task 8: Documentación y gate visual

**Files:**
- Modify: `docs/features/medios-de-pago.md`
- Modify: `src/components/medios-pago/cabecera-de-resumen.tsx` (Task 4) y la card de resumen de `/compromisos` — sólo para agregar el `data-testid` que el gate necesita para leer el mismo total en las dos pantallas
- Modify: `CLAUDE.md` (sección «Medios de pago»)
- Create: `scripts/verificar-detalle-resumen.mjs`

- [ ] **Step 1: Update the feature doc**

In `docs/features/medios-de-pago.md`, replace any description of the detail modal with the new screen: the route, the `?resumen=` param, the four derived states, the rule that totals come from `computePaymentMethodStatus(..., cicloObjetivo)`, and the fact that credit cards no longer show «Costos Fijos» / «Mensualidades Activas» because those are already rows of the cycle.

- [ ] **Step 2: Update CLAUDE.md**

In the «Medios de pago» section, add:

```markdown
- **El detalle de un medio es una pantalla, no un modal**: `/ajustes/medios/[id]`, con el resumen que se está mirando en `?resumen=<cycleId>`. Para crédito muestra un resumen por vez, navegable, con las filas ordenadas **ascendente por `purchase_date`** (el orden en que el banco imprime el resumen) y las que no tienen fecha de compra en un bloque aparte al final. El total de un resumen SIEMPRE sale de `computePaymentMethodStatus(..., cicloObjetivo)`: hay un test de paridad (`detalle-resumen-getter.test.ts`) que exige que coincida con lo que muestra Compromisos. ⚠️ En crédito **no** se muestran «Costos Fijos» ni «Mensualidades Activas»: con el modelo de ciclos las mensualidades de tarjeta ya se postean como filas del resumen, y mostrarlas de nuevo invita a sumarlas dos veces.
```

- [ ] **Step 3: Write the browser gate script**

Create `scripts/verificar-detalle-resumen.mjs`, modeled on `scripts/verificar-escenarios-tarjeta.mjs` — copy from it the session injection, the hardcoded production-ref guard, and the pass/fail accounting. Shape:

```js
// Gate de navegador del detalle por resumen. Verifica en el DOM, no por captura:
// una captura no distingue "el total dice 20.000" de "el total dice 20.000 pero
// Compromisos dice 24.000".
import { chromium } from 'playwright';

const BASE = process.env.VERIFY_BASE_URL ?? 'http://localhost:3100';
const REF_PROD = 'mkkgdjxaotgimqwhyesx'; // prohibido: mismo guard que el seeder
if ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(REF_PROD)) {
  console.error('ABORTADO: apunta a produccion');
  process.exit(1);
}

const checks = [];
const check = (nombre, ok, detalle = '') => checks.push({ nombre, ok, detalle });

const page = await (await chromium.launch()).newPage({ viewport: { width: 390, height: 844 } });
// ...inyectar las cookies de sesion del demo, igual que capture-demo.mjs...

await page.goto(`${BASE}/ajustes/medios`);
await page.getByText('Visa Galicia').click();
await page.waitForURL(/\/ajustes\/medios\/[^/]+/);

const totalDe = () => page.locator('[data-testid="total-resumen"]').innerText();

const antes = await totalDe();
await page.getByLabel('Resumen anterior').click();
check('navegar al anterior cambia el total y la URL',
  (await totalDe()) !== antes && page.url().includes('resumen='));

// ...los puntos 2 a 8, cada uno con su check(...)...

const fallaron = checks.filter((c) => !c.ok);
console.log(`${checks.length - fallaron.length}/${checks.length}`);
for (const f of fallaron) console.error(`FALLO: ${f.nombre} ${f.detalle}`);
process.exit(fallaron.length ? 1 : 0);
```

Los ocho asserts:

1. Navegar de un resumen al anterior y al siguiente cambia el total y la URL (`?resumen=`).
2. El selector permite saltar a un resumen no contiguo.
3. Un resumen con filas sin `purchase_date` muestra el bloque «Sin fecha de compra».
4. Un resumen futuro muestra «Proyectado» y el aviso de que todavía no cerró.
5. El total de la pantalla es **idéntico** al que muestra `/compromisos` para ese mismo resumen.
6. **En una tarjeta NO aparecen «Costos fijos» ni «Mensualidades activas»** — ya son filas del resumen, y mostrarlas otra vez invita a sumarlas dos veces. Es la única verificación de esa decisión: ningún test unitario la cubre.
7. Una cuenta de débito y un medio personal abren la pantalla sin romperse, y ahí «Costos fijos» **sí** aparece.
8. Los controles del selector miden ≥44px (`getBoundingClientRect`).

Para el punto 5 hace falta un `data-testid` estable en el total, tanto acá como en la card de `/compromisos`. Agregarlo en esta task.

- [ ] **Step 4: Run the gate against DEV**

```bash
npm run seed:demo
node scripts/seed-escenarios-tarjeta.mjs
npm run build && npx next start -p 3100 &
VERIFY_BASE_URL=http://localhost:3100 node scripts/verificar-detalle-resumen.mjs
```

Expected: 7/7. **Un fallo acá no se arregla ajustando el assert**: el gate del plan anterior encontró dos defectos reales (un botón de 40px y un diálogo sin descripción accesible) que ningún test de markup veía.

- [ ] **Step 5: Commit**

```bash
git add docs/features/medios-de-pago.md CLAUDE.md scripts/verificar-detalle-resumen.mjs
git commit -m "docs(detalle): la pantalla de detalle por resumen, y su gate de navegador"
```

---

## Fuera de alcance de este plan

**El ActionSheet de la fila (editar / eliminar).** El spec dice «tocar la fila abre el ActionSheet
de siempre», y este plan **no lo implementa**: las filas son de lectura. Se declara acá en vez de
dejarlo caer en silencio.

La razón: el ActionSheet de transacciones vive en `/movimientos` acoplado a `TransactionItem`,
`SwipeableRow` y sus diálogos de edición, y traerlo es un trabajo propio que no sirve al objetivo
de esta pantalla, que es cotejar contra el papel. Además el **Plan 4 tiene que tocar ese mismo
ActionSheet** para sumarle «Mover a otro resumen»: hacerlo una vez, ahí, cuesta menos que hacerlo
dos veces. Si al usar la pantalla resulta que editar desde acá hace falta antes que eso, es una
task nueva y chica sobre esta base.

**Rediseñar el detalle de cuentas y medios personales.** Se portan (Task 7), no se mejoran.

**Conciliar contra el total declarado del banco** (`declared_total`) y **mover una compra**
(Plan 4): ya estaban fuera de alcance en el spec.

---

## Cierre

Terminadas las 8 tasks, la rama `feat/detalle-por-resumen` queda lista para review final sobre el diff completo — **no sólo por task**. Las reviews por task no vieron el Critical del 31-ago ni el cargo duplicado del Plan 2; los dos aparecieron mirando el conjunto.

Prestar atención en esa review a:

- **Paridad real**, no sólo el test: abrir `/compromisos` y el detalle del mismo resumen y leer los dos números.
- **Que ningún componente sume montos.** `grep -rn "reduce(" src/components/medios-pago src/app/ajustes/medios` no debería devolver ninguna suma de dinero.
- **El caso de la tarjeta sin ciclos** (2 en producción, sin `default_closing_day`/`default_payment_day`): la pantalla tiene que abrir y explicar, no romper.
- **Reintegros**: un `income` en tarjeta tiene `purchase_date` null por diseño, así que cae en el bloque «sin fecha». Verificar que se lea bien y que no parezca un error.
