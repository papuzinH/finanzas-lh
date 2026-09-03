# Mover una compra al resumen vecino — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario pueda corregir a mano el resumen al que la app imputó una compra, cuando el banco usó el otro.

**Architecture:** Una función pura nueva (`cicloSiguiente`) y otra que decide qué transacciones se mueven y adónde (`planDeMovimiento`), una server action que recibe una **dirección** y nunca un id de destino, y un `<ActionSheet>` en las filas del detalle por resumen con su diálogo. Ningún cambio de schema: `transactions.cycle_id` es reasignable por diseño.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19 con React Compiler, Supabase, Zustand, Tailwind v4, Vitest (`environment: 'node'`, sin jsdom), date-fns.

**Spec:** `docs/superpowers/specs/2026-09-02-mover-al-resumen-vecino-design.md`

## Global Constraints

- **Ningún cambio de schema.** Ni una migración, ni una columna.
- **`purchase_date` NUNCA se toca al mover.** Mover cambia en qué resumen te lo cobraron, no cuándo compraste. Hay un test por cada camino que lo fija.
- **El cliente manda la dirección (`'anterior' | 'siguiente'`), nunca un `cycleId`.** El destino lo resuelve el servidor desde el ciclo actual de la transacción.
- **Todo id que llega del cliente se valida con `.eq('user_id', user.id)`** antes de tocarlo (auditoría M4, 2026-08-27). Patrón de referencia: `src/app/medios-pago/__tests__/reassign-dueno.test.ts`.
- **Fechas como strings `yyyy-MM-dd`**, comparadas con `<` / `>` / `localeCompare`. Nunca como `Date`. Para pasar un `Date` a string: `formatLocalDate` de `@/lib/utils/dates`.
- **Pertenencia al resumen = `t.cycle_id`.** Nunca el mes de `t.date`.
- **Fixtures desparejos, obligatorio.** Ciclos reales del Galicia: cierres `2026-07-23` / `2026-08-20` / `2026-09-24`, vencimientos `2026-08-03` / `2026-09-01` / `2026-10-05`. Un fixture con cierre y vencimiento del mismo día del mes escondió los dos últimos bugs grandes del repo.
- **El store se consume entero** (`const store = useFinanceStore(); store.getX()`); las **dependencias de un `useEffect`** van sobre los valores estables desestructurados (`isInitialized`, `fetchAllData`). Poner el store entero como dep encadena llamadas concurrentes de ~17 queries — fue un Critical del plan anterior.
- **Un token del design system dentro de una clase arbitraria de Tailwind va con `var()`**: `leading-[var(--leading-display)]`, nunca `leading-[--leading-display]`, que compila a un literal que el navegador descarta. Fue otro Critical del plan anterior.
- Tokens semánticos SIEMPRE. Bordes `border-[1.5px] border-border`. Touch targets ≥44px. Nunca `any`. Imports absolutos `@/...`.
- **Verificación en CADA commit**: `npm test && npm run lint && npx tsc --noEmit`. Baseline de lint: **0 errores y 9 warnings**.
- **Si un test que no escribiste vos se pone en rojo, no lo ajustes para que pase sin entender por qué.**

---

### Task 1: `cicloSiguiente`

**Files:**
- Modify: `src/lib/finance/cycles.ts` (agregar junto a `cicloAnterior`, línea ~62)
- Test: `src/lib/finance/__tests__/cycles.test.ts` (agregar un `describe`)

**Interfaces:**
- Consumes: `CreditCardCycle` de `./cycles`.
- Produces: `cicloSiguiente(ciclos: CreditCardCycle[], ciclo: CreditCardCycle): CreditCardCycle | undefined`

- [ ] **Step 1: Write the failing tests**

Agregar en `src/lib/finance/__tests__/cycles.test.ts`, después del `describe('cicloAnterior', ...)` que ya existe. El archivo ya define `JULIO`, `AGOSTO`, `SEPTIEMBRE` y `TRES` con las fechas reales del Galicia — reusarlos, no crear fixtures nuevos:

```ts
describe('cicloSiguiente', () => {
  it('devuelve el resumen inmediatamente posterior por fecha de cierre', () => {
    expect(cicloSiguiente(TRES, JULIO)?.id).toBe('ago')
    expect(cicloSiguiente(TRES, AGOSTO)?.id).toBe('sep')
  })

  it('el ultimo resumen no tiene siguiente', () => {
    expect(cicloSiguiente(TRES, SEPTIEMBRE)).toBeUndefined()
  })

  it('una lista de un solo resumen no tiene siguiente', () => {
    expect(cicloSiguiente([AGOSTO], AGOSTO)).toBeUndefined()
  })

  it('es la inversa exacta de cicloAnterior', () => {
    // La propiedad que importa: moverse y volver deja donde se estaba.
    const sig = cicloSiguiente(TRES, JULIO)!
    expect(cicloAnterior(TRES, sig)?.id).toBe('jul')
  })
})
```

Y agregar `cicloSiguiente` al import del principio del archivo, que hoy trae `cicloAnterior`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/finance/__tests__/cycles.test.ts`
Expected: FAIL — `cicloSiguiente is not a function`.

- [ ] **Step 3: Write the implementation**

En `src/lib/finance/cycles.ts`, inmediatamente después de `cicloAnterior`:

```ts
/**
 * El resumen inmediatamente posterior a `ciclo` por fecha de cierre.
 *
 * Precondicion: `ciclos` debe llegar ya filtrado por tarjeta y ordenado ascendente por
 * `closing_date`, como lo produce `ciclosDeMetodo`. Quien llame es responsable del orden.
 */
export function cicloSiguiente(ciclos: CreditCardCycle[], ciclo: CreditCardCycle): CreditCardCycle | undefined {
  return ciclos.find((c) => c.closing_date > ciclo.closing_date)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/finance/__tests__/cycles.test.ts`
Expected: PASS, incluidos los 4 nuevos.

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/lib/finance/cycles.ts src/lib/finance/__tests__/cycles.test.ts
git commit -m "feat(mover): cicloSiguiente, la simetrica de cicloAnterior"
```

---

### Task 2: Qué se mueve y adónde (función pura)

**Files:**
- Create: `src/lib/finance/mover-resumen.ts`
- Test: `src/lib/finance/__tests__/mover-resumen.test.ts`

**Interfaces:**
- Consumes: `cicloAnterior`, `cicloSiguiente`, `cicloNEsimo`, `CreditCardCycle` de `./cycles`; `Transaction` de `@/types/database`.
- Produces:
  - `type DireccionDeMovimiento = 'anterior' | 'siguiente'`
  - `type Reasignacion = { transactionId: string; cycleId: string; date: string }`
  - `type PlanDeMovimiento = { reasignaciones: Reasignacion[]; motivoDeRechazo?: string }`
  - `planDeMovimiento(transaccion: Transaction, todas: Transaction[], ciclos: CreditCardCycle[], direccion: DireccionDeMovimiento): PlanDeMovimiento`

  ⚠️ Tipa contra **`Transaction`** (la fila cruda de `@/types/database`), NO contra `ProcessedTransaction`: sólo lee `id`, `cycle_id`, `date` e `installment_plan_id`, y ninguno de los campos derivados. La action la llama con filas que vienen directo de Supabase, así que pedir `ProcessedTransaction` obligaría a un cast mentiroso.

**Notas para el implementer:**
- `ciclos` llega ya filtrado por la tarjeta de la transacción y ordenado por `closing_date`.
- Para una cuota, «cuáles son las posteriores» se decide por **`date` ascendente** dentro del mismo `installment_plan_id`, no parseando el `(3/6)` de la descripción.
- La cuota tocada va al vecino; cada cuota posterior va a `cicloNEsimo(ciclos, destinoDeLaTocada, k)` donde `k` es su posición relativa (1, 2, 3…). Si `cicloNEsimo` se agota, esa reasignación no se emite: la Task 3 materializa los ciclos que falten y vuelve a pedir el plan.
- `date` de cada reasignación es el `due_date` del ciclo destino.
- **Ningún `purchase_date` aparece en `Reasignacion`.** Es la garantía estructural de que no se puede tocar.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/finance/__tests__/mover-resumen.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { planDeMovimiento } from '../mover-resumen'
import type { CreditCardCycle } from '../cycles'
import type { ProcessedTransaction } from '../types'

// Ciclos REALES de la Visa Galicia. Desparejos a proposito.
const ciclo = (over: Partial<CreditCardCycle>): CreditCardCycle => ({
  id: 'c1', user_id: 'u1', payment_method_id: 'visa',
  closing_date: '2026-07-23', due_date: '2026-08-03',
  source: 'generated', created_at: '2026-01-01T00:00:00Z',
  reminder_dismissed_at: null,
  ...over,
})

const JUL = ciclo({ id: 'jul', closing_date: '2026-07-23', due_date: '2026-08-03' })
const AGO = ciclo({ id: 'ago', closing_date: '2026-08-20', due_date: '2026-09-01' })
const SEP = ciclo({ id: 'sep', closing_date: '2026-09-24', due_date: '2026-10-05' })
const OCT = ciclo({ id: 'oct', closing_date: '2026-10-22', due_date: '2026-11-02' })
const CUATRO = [JUL, AGO, SEP, OCT]

const tx = (over: Partial<ProcessedTransaction>): ProcessedTransaction => ({
  id: 't1', user_id: 'u1', payment_method_id: 'visa', cycle_id: 'ago',
  amount: 1000, type: 'expense', description: 'Compra', date: '2026-09-01',
  purchase_date: '2026-08-19', category_id: 'cat1', created_at: '2026-08-19T10:00:00Z',
  periodDate: '2026-08-20', realPaymentDate: '2026-09-01',
  card_payment_for: null, installment_plan_id: null, recurring_plan_id: null,
  original_amount: null, original_currency: null, is_balance_adjustment: false,
  ...over,
} as ProcessedTransaction)

describe('planDeMovimiento — compra suelta', () => {
  it('la manda al resumen anterior con la fecha de vencimiento de ese resumen', () => {
    const compra = tx({ id: 'a', cycle_id: 'ago' })
    const r = planDeMovimiento(compra, [compra], CUATRO, 'anterior')
    expect(r.reasignaciones).toEqual([{ transactionId: 'a', cycleId: 'jul', date: '2026-08-03' }])
  })

  it('la manda al resumen siguiente', () => {
    const compra = tx({ id: 'a', cycle_id: 'ago' })
    const r = planDeMovimiento(compra, [compra], CUATRO, 'siguiente')
    expect(r.reasignaciones).toEqual([{ transactionId: 'a', cycleId: 'sep', date: '2026-10-05' }])
  })

  it('NUNCA emite purchase_date: no esta en la forma del resultado', () => {
    const compra = tx({ id: 'a', cycle_id: 'ago' })
    const r = planDeMovimiento(compra, [compra], CUATRO, 'anterior')
    expect(Object.keys(r.reasignaciones[0]).sort()).toEqual(['cycleId', 'date', 'transactionId'])
  })

  it('sin resumen anterior no se mueve y explica por que', () => {
    const compra = tx({ id: 'a', cycle_id: 'jul' })
    const r = planDeMovimiento(compra, [compra], CUATRO, 'anterior')
    expect(r.reasignaciones).toEqual([])
    expect(r.motivoDeRechazo).toBeTruthy()
  })

  it('sin resumen siguiente tampoco', () => {
    const compra = tx({ id: 'a', cycle_id: 'oct' })
    const r = planDeMovimiento(compra, [compra], CUATRO, 'siguiente')
    expect(r.reasignaciones).toEqual([])
    expect(r.motivoDeRechazo).toBeTruthy()
  })

  it('una transaccion sin cycle_id se rechaza', () => {
    const compra = tx({ id: 'a', cycle_id: null })
    const r = planDeMovimiento(compra, [compra], CUATRO, 'anterior')
    expect(r.reasignaciones).toEqual([])
    expect(r.motivoDeRechazo).toBeTruthy()
  })
})

describe('planDeMovimiento — cuotas (E15)', () => {
  // Plan de 3 cuotas: jul, ago, sep.
  const c1 = tx({ id: 'c1', cycle_id: 'jul', date: '2026-08-03', installment_plan_id: 'p1', description: 'Tele (1/3)' })
  const c2 = tx({ id: 'c2', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p1', description: 'Tele (2/3)' })
  const c3 = tx({ id: 'c3', cycle_id: 'sep', date: '2026-10-05', installment_plan_id: 'p1', description: 'Tele (3/3)' })
  const PLAN = [c1, c2, c3]

  it('mover la cuota 2 corre la 2 y la 3, y NO la 1', () => {
    const r = planDeMovimiento(c2, PLAN, CUATRO, 'siguiente')
    expect(r.reasignaciones).toEqual([
      { transactionId: 'c2', cycleId: 'sep', date: '2026-10-05' },
      { transactionId: 'c3', cycleId: 'oct', date: '2026-11-02' },
    ])
  })

  it('mover la primera cuota corre el plan entero', () => {
    const r = planDeMovimiento(c1, PLAN, CUATRO, 'siguiente')
    expect(r.reasignaciones.map((x) => x.transactionId)).toEqual(['c1', 'c2', 'c3'])
    expect(r.reasignaciones.map((x) => x.cycleId)).toEqual(['ago', 'sep', 'oct'])
  })

  it('mover la ultima cuota mueve solo esa', () => {
    const r = planDeMovimiento(c3, PLAN, CUATRO, 'anterior')
    expect(r.reasignaciones).toEqual([{ transactionId: 'c3', cycleId: 'ago', date: '2026-09-01' }])
  })

  it('las cuotas se ordenan por date, no por el numero de la descripcion', () => {
    // Descripciones desordenadas a proposito: el orden lo da la fecha.
    const a = tx({ id: 'a', cycle_id: 'jul', date: '2026-08-03', installment_plan_id: 'p2', description: 'X (3/3)' })
    const b = tx({ id: 'b', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p2', description: 'X (1/3)' })
    const r = planDeMovimiento(a, [a, b], CUATRO, 'siguiente')
    expect(r.reasignaciones.map((x) => x.transactionId)).toEqual(['a', 'b'])
  })

  it('no arrastra cuotas de OTRO plan', () => {
    const otro = tx({ id: 'z', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p9' })
    const r = planDeMovimiento(c2, [...PLAN, otro], CUATRO, 'siguiente')
    expect(r.reasignaciones.map((x) => x.transactionId)).not.toContain('z')
  })

  it('cuando el plan se estira mas alla del ultimo resumen, esa cuota no se reasigna', () => {
    // Con solo tres ciclos, correr la cuota 3 hacia adelante no tiene destino.
    const TRES = [JUL, AGO, SEP]
    const r = planDeMovimiento(c2, PLAN, TRES, 'siguiente')
    expect(r.reasignaciones.map((x) => x.transactionId)).toEqual(['c2'])
    expect(r.motivoDeRechazo).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/finance/__tests__/mover-resumen.test.ts`
Expected: FAIL — cannot resolve `../mover-resumen`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/finance/mover-resumen.ts`:

```ts
//
// Mover una compra al resumen vecino. PURO: sin Zustand ni Supabase.
//
// Decide QUE transacciones se mueven y adonde. No escribe nada: la action
// (app/ajustes/medios/actions.ts) aplica las reasignaciones.
//
// Spec: docs/superpowers/specs/2026-09-02-mover-al-resumen-vecino-design.md
import { cicloAnterior, cicloSiguiente, cicloNEsimo, type CreditCardCycle } from './cycles'
import type { Transaction } from '@/types/database'

export type DireccionDeMovimiento = 'anterior' | 'siguiente'

/** Lo unico que una reasignacion puede cambiar. `purchase_date` no esta, y es a proposito. */
export type Reasignacion = {
  transactionId: string
  cycleId: string
  date: string
}

export type PlanDeMovimiento = {
  reasignaciones: Reasignacion[]
  motivoDeRechazo?: string
}

const vecino = (ciclos: CreditCardCycle[], ciclo: CreditCardCycle, d: DireccionDeMovimiento) =>
  d === 'anterior' ? cicloAnterior(ciclos, ciclo) : cicloSiguiente(ciclos, ciclo)

export function planDeMovimiento(
  transaccion: Transaction,
  todas: Transaction[],
  ciclos: CreditCardCycle[],
  direccion: DireccionDeMovimiento,
): PlanDeMovimiento {
  const actual = ciclos.find((c) => c.id === transaccion.cycle_id)
  if (!actual) {
    return { reasignaciones: [], motivoDeRechazo: 'Este movimiento no está imputado a ningún resumen.' }
  }

  const destino = vecino(ciclos, actual, direccion)
  if (!destino) {
    return {
      reasignaciones: [],
      motivoDeRechazo:
        direccion === 'anterior'
          ? 'No hay un resumen anterior a este.'
          : 'No hay un resumen siguiente a este.',
    }
  }

  // Compra suelta: se mueve sola.
  if (!transaccion.installment_plan_id) {
    return { reasignaciones: [{ transactionId: transaccion.id, cycleId: destino.id, date: destino.due_date }] }
  }

  // Cuota: corre el plan DESDE ella hacia adelante. Las anteriores no se tocan --
  // sus resumenes ya cerraron y probablemente ya se pagaron.
  // El orden lo da `date`, no el "(3/6)" de la descripcion, que es texto.
  const delPlan = todas
    .filter((t) => t.installment_plan_id === transaccion.installment_plan_id)
    .sort((a, b) => a.date.localeCompare(b.date))

  const desde = delPlan.findIndex((t) => t.id === transaccion.id)
  // slice(-1) NO devuelve vacio: devuelve la ULTIMA cuota. Sin este guard, una
  // `todas` que no contenga la tocada moveria una cuota distinta, en silencio.
  if (desde === -1) {
    return { reasignaciones: [], motivoDeRechazo: 'No encontré este movimiento entre las cuotas del plan.' }
  }
  const aMover = delPlan.slice(desde)

  const reasignaciones: Reasignacion[] = []
  for (const [k, cuota] of aMover.entries()) {
    // La cuota k-esima despues de la tocada va al k-esimo resumen despues del destino.
    const ciclo = cicloNEsimo(ciclos, destino, k)
    if (!ciclo) break // se agotaron los resumenes materializados; la action los crea y reintenta
    reasignaciones.push({ transactionId: cuota.id, cycleId: ciclo.id, date: ciclo.due_date })
  }

  return { reasignaciones }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/finance/__tests__/mover-resumen.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/lib/finance/mover-resumen.ts src/lib/finance/__tests__/mover-resumen.test.ts
git commit -m "feat(mover): que se mueve y adonde, con las cuotas corriendo desde la tocada"
```

---

### Task 3: La server action

**Files:**
- Modify: `src/app/ajustes/medios/actions.ts` — si no existe, crearlo; si la convención del repo pone estas actions en `src/app/medios-pago/actions.ts`, usar ese (verificar con `ls src/app/ajustes/medios/` y `grep -n "^export async function" src/app/medios-pago/actions.ts`)
- Test: `src/app/medios-pago/__tests__/mover-resumen-action.test.ts`

**Interfaces:**
- Consumes: `planDeMovimiento`, `DireccionDeMovimiento` (Task 2); `ciclosDeMetodo` de `@/lib/finance/cycles`; `asegurarCiclos` de `@/lib/ciclos/asegurar`.
- Produces: `moverTransaccionAlResumenVecino(transactionId: string, direccion: DireccionDeMovimiento): Promise<ActionResponse>`

**Notas para el implementer:**
- Mirá `declararCiclo` en `src/app/medios-pago/actions.ts` como patrón de action de este dominio (validación, forma de la respuesta, `revalidatePath`).
- El test se escribe con el cliente de Supabase **mockeado**, igual que `reassign-dueno.test.ts`. Ese patrón ya está establecido en el repo: las server actions SÍ se testean así.
- Los cuatro guards del spec, en orden: dueño → es crédito y tiene `cycle_id` → no es mensualidad/reintegro/pago → el vecino existe.
- Si `planDeMovimiento` devuelve menos reasignaciones que cuotas a mover (se agotaron los ciclos), llamar a `asegurarCiclos` para materializar los que faltan y volver a pedir el plan **una sola vez**.
- ⚠️ **Si después de ese reintento el plan SIGUE incompleto, se rechaza entero: no se aplica ninguna reasignación.** Aplicar un plan parcial deja **dos cuotas en el mismo resumen** — mover `c2` de agosto a septiembre sin poder mover `c3`, que ya estaba en septiembre, produce un resumen con dos cuotas del mismo plan, que en el papel del banco no existe. Un estado peor que no haber movido nada. El caso llega a producción con una tarjeta sin `default_closing_day`/`default_payment_day`, donde `asegurarCiclos` no puede generar nada.

- [ ] **Step 1: Write the failing tests**

Create `src/app/medios-pago/__tests__/mover-resumen-action.test.ts`, siguiendo el estilo de mock de `reassign-dueno.test.ts` (leelo primero para copiar la forma exacta del mock del cliente). Los casos que tienen que estar:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// El mock del cliente de Supabase va como en reassign-dueno.test.ts.
// Leer ese archivo y replicar su estructura antes de escribir esto.

describe('moverTransaccionAlResumenVecino', () => {
  it('rechaza una transaccion que no es del usuario', async () => {
    // El select por id devuelve null porque el filtro .eq('user_id', ...) no matchea.
    // Espera: { error } y NINGUN update.
  })

  it('rechaza una mensualidad posteada', async () => {
    // transaccion con recurring_plan_id != null -> { error }, sin update
  })

  it('rechaza un reintegro', async () => {
    // type === 'income' -> { error }, sin update
  })

  it('rechaza un pago de tarjeta', async () => {
    // card_payment_for != null -> { error }, sin update
  })

  it('rechaza si no hay resumen vecino en esa direccion', async () => {
    // la transaccion esta en el primer ciclo y se pide 'anterior' -> { error }, sin update
  })

  it('mueve una compra suelta: un update con cycle_id y date, sin purchase_date', async () => {
    // El payload del update NO debe tener la clave purchase_date.
    // expect(Object.keys(payload)).not.toContain('purchase_date')
  })

  it('mover una cuota emite un update por cada cuota desde la tocada', async () => {
    // 3 cuotas, se mueve la segunda -> 2 updates
  })

  it('si el plan de cuotas no se puede mover entero, NO mueve ninguna', async () => {
    // Tarjeta sin default_closing_day: asegurarCiclos no puede generar, el plan
    // queda incompleto -> { error } y CERO updates. Aplicarlo a medias dejaria
    // dos cuotas en el mismo resumen.
    // expect(updates).toHaveLength(0)
  })
})
```

**Escribí los siete con el mock real y aserciones concretas sobre el payload**, no como comentarios. El punto que no se puede omitir: **verificar que `purchase_date` no aparece en ningún payload de update**.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/medios-pago/__tests__/mover-resumen-action.test.ts`
Expected: FAIL — `moverTransaccionAlResumenVecino is not exported`.

- [ ] **Step 3: Write the action**

En el archivo de actions que corresponda:

```ts
/**
 * Mueve una compra (o un plan de cuotas desde la cuota tocada) al resumen vecino.
 *
 * El cliente manda la DIRECCION, nunca un cycleId: el destino se resuelve acá, desde
 * el ciclo actual de la transaccion. Asi no hay forma de imputar a un resumen
 * arbitrario, de otra tarjeta o de otro usuario.
 *
 * `purchase_date` no se toca: mover cambia en que resumen te lo cobraron, no cuando
 * compraste.
 */
export async function moverTransaccionAlResumenVecino(
  transactionId: string,
  direccion: DireccionDeMovimiento,
): Promise<ActionResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // Guard 1: la transaccion es del usuario.
  const { data: t } = await supabase
    .from('transactions')
    .select('*, payment_methods(type)')
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .single()
  if (!t) return { error: 'Movimiento inválido' }

  // Guard 2 y 3.
  if (t.payment_methods?.type !== 'credit' || !t.cycle_id) {
    return { error: 'Sólo se pueden mover movimientos de una tarjeta de crédito.' }
  }
  if (t.recurring_plan_id) return { error: 'Las mensualidades se manejan desde Compromisos.' }
  if (t.type === 'income') return { error: 'Los reintegros no se mueven de resumen.' }
  if (t.card_payment_for) return { error: 'Un pago de tarjeta no pertenece a un resumen de consumo.' }

  // Los ciclos y las transacciones de ESA tarjeta.
  const [{ data: ciclosRaw }, { data: txsRaw }] = await Promise.all([
    supabase.from('credit_card_cycles').select('*').eq('payment_method_id', t.payment_method_id),
    supabase.from('transactions').select('*').eq('user_id', user.id).eq('payment_method_id', t.payment_method_id),
  ])
  const ciclos = ciclosDeMetodo(t.payment_method_id, ciclosRaw ?? [])
  const txs = txsRaw ?? []

  let plan = planDeMovimiento(t, txs, ciclos, direccion)
  if (plan.motivoDeRechazo) return { error: plan.motivoDeRechazo }

  // Cuantas filas HAY que mover: la tocada, mas las cuotas posteriores del mismo plan.
  const aMover = t.installment_plan_id
    ? txs.filter((x) => x.installment_plan_id === t.installment_plan_id && x.date >= t.date).length
    : 1

  // Si el plan se estira mas alla de los resumenes materializados, se crean los que
  // falten y se pide el plan UNA sola vez mas. Nunca en loop.
  if (plan.reasignaciones.length < aMover) {
    // asegurarCiclos necesita el PaymentMethod COMPLETO: genera los resumenes a
    // partir de default_closing_day / default_payment_day. Fabricar { id } rompe.
    const { data: method } = await supabase
      .from('payment_methods').select('*').eq('id', t.payment_method_id).eq('user_id', user.id).single()
    if (method) {
      const ultima = txs
        .filter((x) => x.installment_plan_id === t.installment_plan_id)
        .reduce((max, x) => (x.date > max ? x.date : max), t.date)
      // Hasta la ultima cuota mas un margen: correr el plan la empuja un resumen.
      await asegurarCiclos(supabase, method, new Date(), addMonths(parseLocalDate(ultima), 2))
      const { data: masCiclos } = await supabase
        .from('credit_card_cycles').select('*').eq('payment_method_id', t.payment_method_id)
      plan = planDeMovimiento(t, txs, ciclosDeMetodo(t.payment_method_id, masCiclos ?? []), direccion)
    }
  }

  // Todo o nada: un plan de cuotas movido a medias deja dos cuotas en el mismo
  // resumen, que es peor que no mover.
  if (plan.reasignaciones.length < aMover) {
    return { error: 'No pude mover todas las cuotas del plan, así que no moví ninguna.' }
  }

  // Cada reasignacion, un update. SOLO cycle_id y date: purchase_date no se toca.
  for (const r of plan.reasignaciones) {
    const { error } = await supabase
      .from('transactions')
      .update({ cycle_id: r.cycleId, date: r.date })
      .eq('id', r.transactionId)
      .eq('user_id', user.id)
    if (error) return { error: 'No se pudo mover el movimiento de resumen.' }
  }

  revalidatePath('/ajustes/medios')
  return { success: true }
}
```

La firma de `asegurarCiclos` está verificada contra el código: `(supabase, method, desde: Date, hasta: Date)`. Tira excepción ante un error de Supabase, así que la llamada va dentro del try/catch de la action. Regla que no cambia: **una sola llamada, nunca en loop**.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/medios-pago/__tests__/mover-resumen-action.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/app/medios-pago src/app/ajustes/medios
git commit -m "feat(mover): la action recibe una direccion, nunca un resumen destino"
```

---

### Task 4: El menú de la fila y el diálogo

**Files:**
- Modify: `src/components/medios-pago/filas-del-resumen.tsx` (`Fila` gana el ActionSheet)
- Create: `src/components/medios-pago/mover-al-resumen-dialog.tsx`
- Test: `src/components/medios-pago/__tests__/mover-al-resumen-dialog.test.tsx`

**Interfaces:**
- Consumes: `ActionSheet` de `@/components/ui/action-sheet` (props `{ open, onOpenChange, title, actions }`, donde cada action es `{ label, icon, onClick, variant?, disabled?, disabledHint? }`); `ResumenNavegable` de `@/lib/finance/detalle-resumen`; `moverTransaccionAlResumenVecino` (Task 3).
- Produces: `MoverAlResumenDialog({ open, onOpenChange, transaccion, anterior, siguiente, cuotasQueMueve, onMovido })`

**Notas para el implementer:**
- **Mover SÍ se ofrece en las cuotas.** `TransactionItem` en `/movimientos` deshabilita editar y eliminar para una cuota con el hint «Esta transacción pertenece a un plan de cuotas»; acá es al revés: mover es justamente lo que una cuota necesita, y arrastra el plan. Editar y eliminar sí siguen deshabilitados para cuotas, con el mismo hint.
- Un vecino que no existe **no se ofrece como opción**. Si no existe ninguno, la acción «Mover a otro resumen» va `disabled` con `disabledHint`.
- El diálogo muestra las fechas reales, no «anterior/siguiente».
- Si es una cuota, el diálogo dice cuántas mueve y hasta cuándo se estira, **antes** de confirmar.
- Si el destino es un resumen `pagado`, el diálogo lo advierte y permite igual.

- [ ] **Step 1: Write the failing tests**

Create `src/components/medios-pago/__tests__/mover-al-resumen-dialog.test.tsx`, en el estilo del repo (`renderToStaticMarkup`, sin jsdom — mirá `ciclo-fechas.test.tsx`). Los casos:

Cada uno con su assert concreto sobre el HTML (el markup lo escribís vos; el assert está fijado acá):

| test | assert que tiene que estar |
|---|---|
| ofrece los dos vecinos con sus fechas reales | `toContain('23 jul')` y `toContain('24 sep')`, y **`not.toContain('anterior')`** — las fechas son lo que el usuario reconoce del papel |
| un vecino que no existe no se ofrece | pasando sólo `siguiente`, el HTML no contiene la fecha del anterior |
| para una cuota avisa cuántas mueve | `toContain('3 a 6')` o el texto exacto que elijas, **y el número de cuotas tiene que salir de la prop**, no estar hardcodeado en el componente |
| para una compra suelta no habla de cuotas | `not.toMatch(/cuota/i)` |
| advierte cuando el destino ya está pagado | con `estado: 'pagado'` en el vecino, el HTML trae el aviso; con `'pendiente'`, **no** lo trae |
| touch targets | `toContain('min-h-[44px]')` |

El quinto es el que más fácil se escribe vacuo: si sólo verificás que el aviso aparece y nunca que **no** aparece, un componente que lo muestre siempre pasa igual.

Y en `filas-del-resumen.test.tsx`:

| test | assert |
|---|---|
| una fila con vecinos ofrece el menú | el HTML trae el botón que abre el ActionSheet |
| **una fila SIN vecinos no monta el menú** | sin `anterior` ni `siguiente`, el markup es el mismo de antes de esta task |
| mover se ofrece en una cuota, editar y eliminar no | con `installment_plan_id`, «Mover a otro resumen» sin `disabled` y los otros dos con el `disabledHint` de `TransactionItem` |
| una mensualidad posteada no ofrece mover | con `recurring_plan_id`, «Mover a otro resumen» no está o está `disabled` |
| un reintegro no ofrece mover | con `type: 'income'`, ídem |

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/medios-pago/__tests__/`
Expected: FAIL — cannot resolve `../mover-al-resumen-dialog`.

- [ ] **Step 3: Write the dialog and wire the ActionSheet**

`MoverAlResumenDialog` usa `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` de `@/components/ui/dialog` y `Button` de `@/components/ui/button`, con las clases del design system (`border-[1.5px] border-border`, `bg-surface`, `min-h-[44px]`). Cada vecino es un botón con su texto de fechas; el aviso de cuotas y el de resumen pagado son párrafos `text-xs text-muted` / `text-warn` arriba de los botones.

En `Fila`, agregar el estado del ActionSheet y su render, siguiendo exactamente el patrón de `TransactionItem` (`transaction-item.tsx:291-320`): `<ActionSheet open title={t.description} actions={[...]} />`, con `Editar` y `Eliminar` deshabilitados para cuotas —mismo `disabledHint` que usa `TransactionItem`— y `Mover a otro resumen` habilitado salvo que no haya ningún vecino.

`Fila` gana estas props, **todas opcionales**, para que `FilasDelResumen` y `DetalleDeCuenta` sigan compilando sin tocarlas — y sin ellas la fila no ofrece menú, que es justo lo que corresponde en el detalle de una cuenta de débito:

```ts
export function Fila({
  t,
  fechaDe = 'compra',
  anterior,
  siguiente,
  onMovido,
}: {
  t: ProcessedTransaction;
  fechaDe?: 'compra' | 'movimiento' | 'ninguna';
  /** Resumen anterior al que la fila está mostrando. Sin él, «mover al anterior» no se ofrece. */
  anterior?: ResumenNavegable;
  /** Resumen siguiente. Sin él, «mover al siguiente» no se ofrece. */
  siguiente?: ResumenNavegable;
  /** Se llama después de mover, para que la pantalla refresque el store. */
  onMovido?: () => void;
})
```

Si no llegan ni `anterior` ni `siguiente`, no se monta el ActionSheet: una fila sin menú se comporta exactamente como hoy.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: verde, incluidos los nuevos y los preexistentes de `filas-del-resumen`.

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/components/medios-pago
git commit -m "feat(mover): el menu de la fila y el dialogo con los resumenes vecinos"
```

---

### Task 5: Cableado, docs y gate de navegador

**Files:**
- Modify: `src/components/medios-pago/filas-del-resumen.tsx` (pasar los vecinos desde `FilasDelResumen`)
- Modify: `src/app/ajustes/medios/[id]/detalle-client.tsx` (pasar los vecinos y refrescar tras mover)
- Modify: `docs/features/medios-de-pago.md`, `CLAUDE.md`
- Create: `scripts/verificar-mover-resumen.mjs`

**Notas para el implementer:**
- Los vecinos del resumen actual salen de `detalle.resumenes` y el actual de `detalle.actual`: el anterior y el siguiente por posición en esa lista, que ya viene ordenada por `closing_date`.
- Tras mover, hay que refrescar el store (`store.fetchAllData()`) y quedarse en el resumen que se está mirando.
- El gate se modela sobre `scripts/verificar-detalle-resumen.mjs`: misma inyección de sesión del demo, mismo guard con el ref de producción hardcodeado como prohibido, misma contabilidad. **Verificar en el DOM.**

- [ ] **Step 1: Wire the neighbours**

`FilasDelResumen` recibe los vecinos y se los pasa a cada `Fila`. `detalle-client.tsx` los calcula desde `detalle.resumenes` y `detalle.actual`.

- [ ] **Step 2: Update the docs**

En `docs/features/medios-de-pago.md` y en el bullet del detalle en `CLAUDE.md`: que se puede mover una compra al resumen vecino desde el menú de la fila, que una cuota arrastra el plan **desde ella hacia adelante**, que `purchase_date` no cambia, y que las mensualidades y los reintegros no se mueven (con el motivo: el sync podría re-postear una mensualidad movida).

- [ ] **Step 3: Write the browser gate**

Create `scripts/verificar-mover-resumen.mjs` con los siete asserts del spec:

1. Mover una compra al resumen anterior: la fila desaparece de un resumen y aparece en el otro, y **los dos totales cambian en consecuencia**.
2. La fecha de compra de esa fila **no cambió**.
3. Mover una cuota: el diálogo avisa cuántas mueve, y tras confirmar las posteriores se corrieron y las anteriores no.
4. Una mensualidad posteada y un reintegro no ofrecen «Mover a otro resumen».
5. En el primer resumen no se ofrece «anterior»; en el último, no se ofrece «siguiente».
6. Mover de vuelta deja todo como estaba.
7. Los controles miden ≥44px (`getBoundingClientRect`).

- [ ] **Step 4: Run the gate against DEV**

```bash
npm run seed:demo
node scripts/seed-escenarios-tarjeta.mjs
npm run build && npx next start -p 3100 &
VERIFY_BASE_URL=http://localhost:3100 node scripts/verificar-mover-resumen.mjs
```

Expected: 7/7. **Un fallo no se tapa ajustando el assert** — verificá primero que el servidor que responde es el tuyo y no uno viejo del puerto (pasó en el plan anterior y costó dos corridas).

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
git add -A
git commit -m "feat(mover): cableado en la pantalla, docs y gate de navegador"
```

---

## Cierre

Terminadas las 5 tasks, review final sobre el diff completo de la rama — **no sólo por task**. En los tres planes anteriores, los hallazgos graves aparecieron mirando el conjunto.

Prestar atención en esa review a:

- **Que mover no rompa la paridad con Compromisos.** Después de mover, el total del origen y el del destino tienen que seguir coincidiendo con lo que muestra `/compromisos`. Es el invariante que fijó el Plan 3.
- **Que ninguna ruta escriba `purchase_date`.** `grep -rn "purchase_date" src/app src/lib/finance/mover-resumen.ts` y verificar que en el camino de mover sólo aparece leyéndose.
- **El caso del plan de cuotas que cruza el último resumen materializado**: que `asegurarCiclos` se llame una sola vez y no en loop.
- **Que mover una cuota no dispare el sync de mensualidades** ni ninguna otra escritura automática que reimpute lo recién movido.

## Fuera de alcance de este plan

Los cuatro puntos que el spec ya declara: mover mensualidades posteadas, mover a un resumen no vecino, un undo dedicado, y las mensualidades que el modelo inyecta en resúmenes ya cerrados.
