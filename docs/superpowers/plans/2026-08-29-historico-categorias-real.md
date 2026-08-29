# Histórico de gastos por categoría en términos reales — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ver cómo varió el gasto de cada categoría mes a mes, deflactado por IPC a pesos de hoy, en la pantalla y en el chat.

**Architecture:** Toda la lógica vive en una función pura nueva, `src/lib/finance/historico.ts`, que consumen tanto el store (cliente) como dos tools del chat (servidor). No hay tabla nueva, ni migración, ni proveedor de datos nuevo: la serie de IPC ya se trae en `fetchAllData()` y la mecánica de deflactación ya existe en `getRealAdjustedTrend`.

**Tech Stack:** TypeScript · Next.js App Router · Zustand · Vitest (`environment: 'node'`) · date-fns · Zod (tools del chat)

**Spec:** `docs/superpowers/specs/2026-08-29-historico-categorias-real-design.md`

## Global Constraints

- **Ningún número lo genera el LLM.** Las tools devuelven valores calculados por `lib/finance/`. Regla del CLAUDE.md.
- **`amount` es SIEMPRE positivo**; el signo lo lleva `type`. Usar `Math.abs(Number(t.amount))`.
- **Fechas: siempre `parseLocalDate()`** de `@/lib/utils/dates`. Nunca `new Date(string)`, que interpreta UTC y corre el día.
- **Se excluyen siempre** `card_payment_for` (pago de tarjeta) y `is_balance_adjustment` (ajuste de saldo): no son consumo nuevo.
- **Consumo del store desde componentes:** `const store = useFinanceStore()` y después `store.getX()`. NUNCA desestructurar getters ni sacarlos con selector — el React Compiler los congela. Lo vigila `src/lib/store/__tests__/store-freshness.test.ts`.
- **UI:** tokens semánticos siempre, `border-[1.5px] border-border`, `tnum` en todo número, `font-display` en cifras. Prohibido `emerald-*`/`rose-*`/`indigo-*`/`slate-*` y hex hardcodeado. Sin `--shadow-bandera` en esta feature (ya hay una cifra hero por pantalla).
- **Gate por task:** `npm test && npm run lint && npx tsc --noEmit`. El lint está en **0 errores** desde el 2026-08-29 y no se admite subirlo. `npm run build` antes del merge.
- **Ventana por defecto:** 6 meses (`months = 6`), igual que `getRealAdjustedTrend`.

---

### Task 1: Serie mensual por categoría, deflactada

**Files:**
- Create: `src/lib/finance/historico.ts`
- Test: `src/lib/finance/__tests__/historico-serie.test.ts`

**Interfaces:**
- Consumes: `ProcessedTransaction` de `@/lib/finance/types`, `Category` de `@/types/database`
- Produces:
  ```ts
  export type PuntoMes = { month: string; nominal: number; real: number; enCurso: boolean }
  export type SerieCategoria = { categoryId: string; categoryName: string; emoji: string | null; puntos: PuntoMes[] }
  export function computeSeriesPorCategoria(
    transactions: ProcessedTransaction[],
    categories: Category[],
    inflacion: Array<{ month: string; rate: number }>,
    months: number,
    now: Date,
  ): SerieCategoria[]
  ```

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/finance/__tests__/historico-serie.test.ts
import { describe, it, expect } from 'vitest'
import { computeSeriesPorCategoria } from '@/lib/finance/historico'
import type { Category } from '@/types/database'
import type { ProcessedTransaction } from '@/lib/finance/types'

const HOY = new Date(2026, 7, 29) // 29 de agosto de 2026

const tx = (over: Partial<ProcessedTransaction> = {}): ProcessedTransaction => ({
  id: '1', user_id: 'u1', description: 'x', amount: 100, date: '2026-07-05',
  type: 'expense', category_id: 'c1', payment_method_id: 'p1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  is_balance_adjustment: false, periodDate: '2026-07-05', realPaymentDate: '2026-07-05',
  ...over,
} as ProcessedTransaction)

const cat = (over: Partial<Category> = {}): Category => ({
  id: 'c1', user_id: 'u1', name: 'Supermercado', description: null, emoji: '🛒',
  is_system: false, type: 'expense', created_at: '2025-01-01',
  ...over,
} as Category)

// 2% en julio y 2% en agosto: un gasto de junio vale hoy 100 * 1.02 * 1.02.
const IPC = [
  { month: '2026-06', rate: 1.9 },
  { month: '2026-07', rate: 2.0 },
  { month: '2026-08', rate: 2.0 },
]

describe('computeSeriesPorCategoria', () => {
  it('deflacta cada mes a pesos de hoy con el IPC de los meses posteriores', () => {
    const series = computeSeriesPorCategoria(
      [tx({ id: 'a', date: '2026-06-10', periodDate: '2026-06-10', amount: 1000 })],
      [cat()], IPC, 6, HOY,
    )

    const junio = series[0].puntos.find((p) => p.month === '2026-06')!
    expect(junio.nominal).toBe(1000)
    // factor = (1 + 2/100) [julio] * (1 + 2/100) [agosto]
    expect(junio.real).toBeCloseTo(1000 * 1.02 * 1.02, 2)
  })

  it('el mes en curso no se deflacta y queda marcado', () => {
    const series = computeSeriesPorCategoria(
      [tx({ id: 'a', date: '2026-08-05', periodDate: '2026-08-05', amount: 500 })],
      [cat()], IPC, 6, HOY,
    )

    const agosto = series[0].puntos.find((p) => p.month === '2026-08')!
    expect(agosto.real).toBe(500)
    expect(agosto.enCurso).toBe(true)
  })

  it('excluye pagos de tarjeta, ajustes de saldo, ingresos y fechas futuras', () => {
    const series = computeSeriesPorCategoria(
      [
        tx({ id: 'a', amount: 100 }),
        tx({ id: 'b', amount: 999, card_payment_for: 'pm1' }),
        tx({ id: 'c', amount: 999, is_balance_adjustment: true }),
        tx({ id: 'd', amount: 999, type: 'income' }),
        tx({ id: 'e', amount: 999, date: '2027-03-01', periodDate: '2027-03-01' }),
      ],
      [cat()], IPC, 6, HOY,
    )

    const total = series[0].puntos.reduce((acc, p) => acc + p.nominal, 0)
    expect(total).toBe(100)
  })

  it('no crea puntos para meses sin actividad de esa categoría', () => {
    const series = computeSeriesPorCategoria(
      [tx({ id: 'a', date: '2026-07-05', periodDate: '2026-07-05' })],
      [cat()], IPC, 6, HOY,
    )

    expect(series[0].puntos.map((p) => p.month)).toEqual(['2026-07'])
  })

  it('agrupa por categoría y arrastra nombre y emoji', () => {
    const series = computeSeriesPorCategoria(
      [
        tx({ id: 'a', category_id: 'c1', amount: 100 }),
        tx({ id: 'b', category_id: 'c2', amount: 200 }),
      ],
      [cat(), cat({ id: 'c2', name: 'Casa', emoji: '🏠' })],
      IPC, 6, HOY,
    )

    expect(series.map((s) => s.categoryName).sort()).toEqual(['Casa', 'Supermercado'])
    expect(series.find((s) => s.categoryId === 'c2')!.emoji).toBe('🏠')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- historico-serie`
Expected: FAIL — `Failed to resolve import "@/lib/finance/historico"`

- [ ] **Step 3: Implementar**

```ts
// src/lib/finance/historico.ts
import { format, subMonths } from 'date-fns'
import { parseLocalDate } from '@/lib/utils/dates'
import type { Category } from '@/types/database'
import type { ProcessedTransaction } from './types'

/** Un mes de la serie de una categoría. `real` está en pesos de hoy. */
export type PuntoMes = {
  /** 'YYYY-MM' */
  month: string
  nominal: number
  real: number
  /** El mes en curso: su monto es parcial, el mes no cerró. */
  enCurso: boolean
}

export type SerieCategoria = {
  categoryId: string
  categoryName: string
  emoji: string | null
  /** Sólo los meses CON actividad, del más viejo al más nuevo. */
  puntos: PuntoMes[]
}

/**
 * Factor para llevar un mes a pesos de hoy: el producto de (1 + ipc/100) de
 * todos los meses POSTERIORES a él, incluido el actual. Es la misma mecánica
 * que `getRealAdjustedTrend` en el store; un mes sin IPC publicado aporta
 * factor 1 (el INDEC publica con mes y medio de rezago, así que el mes en
 * curso nunca tiene el suyo).
 */
export function factorAPesosDeHoy(
  month: string,
  inflacion: Array<{ month: string; rate: number }>,
  now: Date,
): number {
  const porMes = new Map(inflacion.map((r) => [r.month, r.rate]))
  const mesActual = format(now, 'yyyy-MM')
  let factor = 1
  let cursor = now
  while (format(cursor, 'yyyy-MM') > month) {
    const fm = format(cursor, 'yyyy-MM')
    if (fm !== mesActual || porMes.has(fm)) {
      factor *= 1 + (porMes.get(fm) ?? 0) / 100
    }
    cursor = subMonths(cursor, 1)
  }
  return factor
}

export function computeSeriesPorCategoria(
  transactions: ProcessedTransaction[],
  categories: Category[],
  inflacion: Array<{ month: string; rate: number }>,
  months: number,
  now: Date,
): SerieCategoria[] {
  const mesActual = format(now, 'yyyy-MM')
  const desde = format(subMonths(now, months - 1), 'yyyy-MM')

  const relevantes = transactions.filter((t) => {
    if (t.type !== 'expense') return false
    if (t.card_payment_for || t.is_balance_adjustment) return false
    if (parseLocalDate(t.date) > now) return false // cuotas futuras: no son historia
    const mes = (t.periodDate || t.date).slice(0, 7)
    return mes >= desde && mes <= mesActual
  })

  const porCategoria = new Map<string, Map<string, number>>()
  for (const t of relevantes) {
    const mes = (t.periodDate || t.date).slice(0, 7)
    const porMes = porCategoria.get(t.category_id) ?? new Map<string, number>()
    porMes.set(mes, (porMes.get(mes) ?? 0) + Math.abs(Number(t.amount)))
    porCategoria.set(t.category_id, porMes)
  }

  return [...porCategoria.entries()].map(([categoryId, porMes]) => {
    const categoria = categories.find((c) => c.id === categoryId)
    return {
      categoryId,
      categoryName: categoria?.name ?? 'Otros',
      emoji: categoria?.emoji ?? null,
      puntos: [...porMes.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, nominal]) => ({
          month,
          nominal,
          real: nominal * factorAPesosDeHoy(month, inflacion, now),
          enCurso: month === mesActual,
        })),
    }
  })
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- historico-serie`
Expected: PASS, 5 tests

- [ ] **Step 5: Gate y commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/lib/finance/historico.ts src/lib/finance/__tests__/historico-serie.test.ts
git commit -m "feat(historico): serie mensual por categoría, deflactada a pesos de hoy"
```

---

### Task 2: Desvío del mes en curso, comparado por tramo

**Files:**
- Modify: `src/lib/finance/historico.ts`
- Test: `src/lib/finance/__tests__/historico-desvio.test.ts`

**Interfaces:**
- Consumes: `PuntoMes` de Task 1
- Produces:
  ```ts
  export type Vara = 'promedio' | 'mes_anterior'
  export type Desvio = {
    actual: number
    referencia: number
    pct: number | null
    diaDeCorte: number
    usaMesCerrado: boolean
  }
  export function computeDesvioPorTramo(
    txsDeLaCategoria: ProcessedTransaction[],
    inflacion: Array<{ month: string; rate: number }>,
    vara: Vara,
    months: number,
    now: Date,
    forzarMesCerrado?: boolean,
  ): Desvio | null
  ```

**Por qué `forzarMesCerrado` viene de afuera:** si el usuario todavía no cargó NADA
este mes, el tramo no dice nada y hay que caer al último mes cerrado. Pero eso se
decide mirando TODAS las transacciones, no las de una categoría: que una categoría
puntual no tenga gastos este mes **es** información (dejaste de gastar ahí), no falta
de datos. Quien tiene la vista completa es `computeHistorico` (Task 4), así que lo
calcula una vez y lo pasa.

**Por qué recibe transacciones y no la serie de Task 1:** recortar julio "hasta el día 29" necesita el día de cada movimiento, y la serie ya está agregada por mes.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/finance/__tests__/historico-desvio.test.ts
import { describe, it, expect } from 'vitest'
import { computeDesvioPorTramo } from '@/lib/finance/historico'
import type { ProcessedTransaction } from '@/lib/finance/types'

const HOY = new Date(2026, 7, 15) // 15 de agosto
const SIN_IPC: Array<{ month: string; rate: number }> = []

const tx = (date: string, amount: number, id = date + amount): ProcessedTransaction => ({
  id, user_id: 'u1', description: 'x', amount, date,
  type: 'expense', category_id: 'c1', payment_method_id: 'p1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  is_balance_adjustment: false, periodDate: date, realPaymentDate: date,
} as ProcessedTransaction)

describe('computeDesvioPorTramo', () => {
  it('compara el tramo del mes en curso contra el mismo tramo de los previos', () => {
    const d = computeDesvioPorTramo(
      [
        tx('2026-08-05', 600),   // en curso, día 5  -> entra
        tx('2026-08-20', 999),   // día 20 > hoy 15  -> no puede existir, pero se ignora igual
        tx('2026-06-03', 200), tx('2026-06-25', 800), // junio: 200 hasta el 15
        tx('2026-07-10', 400), tx('2026-07-28', 900), // julio: 400 hasta el 15
      ],
      SIN_IPC, 'promedio', 6, HOY,
    )

    expect(d!.actual).toBe(600)
    expect(d!.referencia).toBe(300)   // promedio de 200 y 400, no de los totales
    expect(d!.pct).toBeCloseTo(1.0)   // +100%
    expect(d!.diaDeCorte).toBe(15)
    expect(d!.usaMesCerrado).toBe(false)
  })

  it('con vara "mes_anterior" usa sólo el mes previo, también recortado', () => {
    const d = computeDesvioPorTramo(
      [tx('2026-08-05', 600), tx('2026-06-03', 200), tx('2026-07-10', 400), tx('2026-07-28', 900)],
      SIN_IPC, 'mes_anterior', 6, HOY,
    )

    expect(d!.referencia).toBe(400)
    expect(d!.pct).toBeCloseTo(0.5)
  })

  it('cae al último mes cerrado si el mes en curso no llega a 3 días', () => {
    const d = computeDesvioPorTramo(
      [tx('2026-08-01', 100), tx('2026-07-10', 400), tx('2026-06-10', 200)],
      SIN_IPC, 'promedio', 6, new Date(2026, 7, 2), // 2 de agosto
    )

    expect(d!.usaMesCerrado).toBe(true)
    expect(d!.actual).toBe(400)      // julio COMPLETO
    expect(d!.referencia).toBe(200)  // junio completo
  })

  it('devuelve pct null si la referencia es 0, en vez de dividir por cero', () => {
    const d = computeDesvioPorTramo([tx('2026-08-05', 600)], SIN_IPC, 'promedio', 6, HOY)

    expect(d!.referencia).toBe(0)
    expect(d!.pct).toBeNull()
  })

  it('devuelve null si no hay ningún mes previo con el que comparar', () => {
    const d = computeDesvioPorTramo([tx('2026-08-05', 600)], SIN_IPC, 'mes_anterior', 6, HOY)
    expect(d).toBeNull()
  })

  it('cae al mes cerrado cuando quien llama avisa que el mes en curso está vacío', () => {
    const d = computeDesvioPorTramo(
      [tx('2026-07-10', 400), tx('2026-06-10', 200)],
      SIN_IPC, 'promedio', 6, HOY, true,
    )

    expect(d!.usaMesCerrado).toBe(true)
    expect(d!.actual).toBe(400) // julio completo, no un agosto vacío que daría −100%
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- historico-desvio`
Expected: FAIL — `computeDesvioPorTramo is not a function`

- [ ] **Step 3: Implementar** (agregar al final de `src/lib/finance/historico.ts`)

```ts
/** Contra qué se compara el mes en curso. */
export type Vara = 'promedio' | 'mes_anterior'

export type Desvio = {
  /** Gasto del tramo del mes en curso, en pesos de hoy. */
  actual: number
  /** La vara, recortada al mismo tramo y en pesos de hoy. */
  referencia: number
  /** (actual − referencia) / referencia. `null` si la referencia es 0. */
  pct: number | null
  /** Hasta qué día del mes se recortaron los meses previos. */
  diaDeCorte: number
  /** true cuando el mes en curso tenía muy pocos días y se usó el último mes cerrado. */
  usaMesCerrado: boolean
}

/** Días mínimos del mes en curso para que el tramo diga algo. */
const DIAS_MINIMOS_DE_TRAMO = 3

export function computeDesvioPorTramo(
  txsDeLaCategoria: ProcessedTransaction[],
  inflacion: Array<{ month: string; rate: number }>,
  vara: Vara,
  months: number,
  now: Date,
  forzarMesCerrado?: boolean,
): Desvio | null {
  const diaDeHoy = now.getDate()
  const usaMesCerrado = diaDeHoy < DIAS_MINIMOS_DE_TRAMO || forzarMesCerrado === true
  const mesAncla = usaMesCerrado
    ? format(subMonths(now, 1), 'yyyy-MM')
    : format(now, 'yyyy-MM')
  const diaDeCorte = usaMesCerrado ? 31 : diaDeHoy

  const desde = format(subMonths(now, months - 1), 'yyyy-MM')

  /** Suma de una categoría en un mes, recortada al día de corte, en pesos de hoy. */
  const totalDelTramo = (mes: string): number =>
    txsDeLaCategoria
      .filter((t) => {
        if (t.type !== 'expense') return false
        if (t.card_payment_for || t.is_balance_adjustment) return false
        const fecha = parseLocalDate(t.date)
        if (fecha > now) return false
        if ((t.periodDate || t.date).slice(0, 7) !== mes) return false
        return parseLocalDate(t.periodDate || t.date).getDate() <= diaDeCorte
      })
      .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0) *
    factorAPesosDeHoy(mes, inflacion, now)

  const mesesPrevios: string[] = []
  for (let k = 1; k < months; k++) {
    const mes = format(subMonths(parseLocalDate(`${mesAncla}-01`), k), 'yyyy-MM')
    if (mes < desde) break
    mesesPrevios.push(mes)
  }
  if (mesesPrevios.length === 0) return null

  const actual = totalDelTramo(mesAncla)
  const referencia =
    vara === 'mes_anterior'
      ? totalDelTramo(mesesPrevios[0])
      : mesesPrevios.reduce((acc, m) => acc + totalDelTramo(m), 0) / mesesPrevios.length

  return {
    actual,
    referencia,
    pct: referencia > 0 ? (actual - referencia) / referencia : null,
    diaDeCorte,
    usaMesCerrado,
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- historico-desvio`
Expected: PASS, 5 tests

- [ ] **Step 5: Gate y commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/lib/finance/historico.ts src/lib/finance/__tests__/historico-desvio.test.ts
git commit -m "feat(historico): desvío del mes en curso comparado por tramo, no extrapolado"
```

---

### Task 3: Clasificar «cambió de nivel» vs. «fue una vez»

**Files:**
- Modify: `src/lib/finance/historico.ts`
- Test: `src/lib/finance/__tests__/historico-clasificacion.test.ts`

**Interfaces:**
- Consumes: `PuntoMes` de Task 1
- Produces:
  ```ts
  export type Clasificacion = 'nivel' | 'evento'
  export type Pico = { month: string; monto: number }
  export function clasificarSerie(
    puntos: PuntoMes[],
  ): { clasificacion: Clasificacion; pico: Pico | null }
  ```

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/finance/__tests__/historico-clasificacion.test.ts
import { describe, it, expect } from 'vitest'
import { clasificarSerie } from '@/lib/finance/historico'
import type { PuntoMes } from '@/lib/finance/historico'

const p = (month: string, real: number, enCurso = false): PuntoMes =>
  ({ month, nominal: real, real, enCurso })

describe('clasificarSerie', () => {
  it('marca evento cuando el pico supera 3 veces la mediana de los otros meses', () => {
    // El caso real: Fernet, con un pico de 255x
    const r = clasificarSerie([p('2026-04', 3007), p('2026-05', 1), p('2026-06', 41820), p('2026-07', 767871)])

    expect(r.clasificacion).toBe('evento')
    expect(r.pico).toEqual({ month: '2026-07', monto: 767871 })
  })

  it('marca cambio de nivel cuando el pico no llega a 3 veces la mediana', () => {
    // El caso real: Casa, pico 1.9x — sube sostenido, no es un evento
    const r = clasificarSerie([p('2026-04', 553951), p('2026-05', 527309), p('2026-06', 585378), p('2026-07', 1037320)])

    expect(r.clasificacion).toBe('nivel')
    expect(r.pico).toBeNull()
  })

  it('NO se degrada con la ventana: el mismo pico relativo clasifica igual con 4 y con 12 meses', () => {
    // Un pico de 5x lo típico. Con la regla vieja («más de la mitad del total»)
    // esto daba evento con 4 meses y NO con 12 — el defecto que motivó el cambio.
    const conCuatro = clasificarSerie([p('2026-05', 10), p('2026-06', 10), p('2026-07', 10), p('2026-08', 50)])
    const conDoce = clasificarSerie([
      ...Array.from({ length: 11 }, (_, i) => p(`2026-${String(i + 1).padStart(2, '0')}`, 10)),
      p('2026-12', 50),
    ])

    expect(conCuatro.clasificacion).toBe('evento')
    expect(conDoce.clasificacion).toBe('evento')
  })

  it('si la mediana de los otros meses es 0, compara contra el promedio de los que sí tienen', () => {
    const r = clasificarSerie([p('2026-05', 0), p('2026-06', 0), p('2026-07', 100), p('2026-08', 1000)])

    expect(r.clasificacion).toBe('evento') // 1000 vs promedio 100 de los activos
  })

  it('no clasifica con menos de 3 meses cerrados', () => {
    const r = clasificarSerie([p('2026-07', 10), p('2026-08', 5000)])
    expect(r.clasificacion).toBe('nivel')
  })

  it('ignora el mes en curso: un mes parcial no puede decidir si algo fue un evento', () => {
    const r = clasificarSerie([
      p('2026-05', 10), p('2026-06', 10), p('2026-07', 10), p('2026-08', 5000, true),
    ])

    expect(r.clasificacion).toBe('nivel')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- historico-clasificacion`
Expected: FAIL — `clasificarSerie is not a function`

- [ ] **Step 3: Implementar** (agregar a `src/lib/finance/historico.ts`)

```ts
export type Clasificacion = 'nivel' | 'evento'
export type Pico = { month: string; monto: number }

/**
 * Cuántas veces el mes típico tiene que valer el pico para ser un evento.
 *
 * Se compara contra la MEDIANA de los otros meses, no contra su promedio: el
 * promedio ya está contaminado por el pico que se intenta detectar.
 *
 * La primera formulación de esta regla era «un mes concentra más de la mitad
 * del total», y se descartó porque cambia de significado con la ventana: para
 * llevarse la mitad del total el pico tiene que valer (N−1) veces un mes
 * típico, o sea 3× con 4 meses y 11× con 12. La regla se volvía más exigente
 * sola a medida que el usuario junta historia.
 */
const VECES_PARA_SER_EVENTO = 3

/** Meses cerrados mínimos para animarse a clasificar. */
const MESES_MINIMOS = 3

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0
  const orden = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(orden.length / 2)
  return orden.length % 2 === 0 ? (orden[medio - 1] + orden[medio]) / 2 : orden[medio]
}

/**
 * ¿La categoría cambió de nivel, o tuvo un gasto excepcional?
 *
 * Sólo mira meses CERRADOS: hace falta un mes completo para saber si algo fue
 * un evento. Limitación conocida: un evento del mes en curso se clasifica como
 * «nivel» hasta que el mes cierre — se aceptó para que una fila no salte de
 * grupo a mitad de mes y vuelva sola.
 */
export function clasificarSerie(puntos: PuntoMes[]): {
  clasificacion: Clasificacion
  pico: Pico | null
} {
  const cerrados = puntos.filter((p) => !p.enCurso)
  if (cerrados.length < MESES_MINIMOS) return { clasificacion: 'nivel', pico: null }

  const pico = cerrados.reduce((max, p) => (p.real > max.real ? p : max), cerrados[0])
  const otros = cerrados.filter((p) => p.month !== pico.month).map((p) => p.real)

  let referencia = mediana(otros)
  if (referencia === 0) {
    // Pasa de verdad: una categoría sin gasto en algún mes (Fernet en mayo).
    // Con mediana 0 cualquier pico sería infinito, así que se usa el promedio
    // de los meses que sí tuvieron actividad.
    const activos = otros.filter((v) => v > 0)
    if (activos.length === 0) return { clasificacion: 'nivel', pico: null }
    referencia = activos.reduce((a, b) => a + b, 0) / activos.length
  }

  return pico.real > referencia * VECES_PARA_SER_EVENTO
    ? { clasificacion: 'evento', pico: { month: pico.month, monto: pico.real } }
    : { clasificacion: 'nivel', pico: null }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- historico-clasificacion`
Expected: PASS, 6 tests

- [ ] **Step 5: Gate y commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/lib/finance/historico.ts src/lib/finance/__tests__/historico-clasificacion.test.ts
git commit -m "feat(historico): separar «cambió de nivel» de «fue una vez» con ratio contra la mediana"
```

---

### Task 4: Ensamblar el histórico y exponerlo en el store

**Files:**
- Modify: `src/lib/finance/historico.ts`
- Modify: `src/lib/store/financeStore.ts` (interfaz `FinanceState` + implementación del getter)
- Test: `src/lib/finance/__tests__/historico-ensamble.test.ts`

**Interfaces:**
- Consumes: `computeSeriesPorCategoria` (Task 1), `computeDesvioPorTramo` (Task 2), `clasificarSerie` (Task 3)
- Produces:
  ```ts
  export type FilaHistorico = {
    categoryId: string
    categoryName: string
    emoji: string | null
    puntos: PuntoMes[]
    desvio: Desvio | null
    clasificacion: Clasificacion
    pico: Pico | null
  }
  export type Historico = {
    filas: FilaHistorico[]
    diaDeCorte: number
    usaMesCerrado: boolean
    mesAncla: string
    mesesDeReferencia: string[]
  }
  export function computeHistorico(
    transactions: ProcessedTransaction[],
    categories: Category[],
    inflacion: Array<{ month: string; rate: number }>,
    opciones: { vara: Vara; months?: number; now?: Date },
  ): Historico
  ```
  Y en el store: `getHistorico: (vara: Vara, months?: number) => Historico`

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/finance/__tests__/historico-ensamble.test.ts
import { describe, it, expect } from 'vitest'
import { computeHistorico } from '@/lib/finance/historico'
import type { Category } from '@/types/database'
import type { ProcessedTransaction } from '@/lib/finance/types'

const HOY = new Date(2026, 7, 15)

const tx = (date: string, amount: number, category_id = 'c1'): ProcessedTransaction => ({
  id: date + amount + category_id, user_id: 'u1', description: 'x', amount, date,
  type: 'expense', category_id, payment_method_id: 'p1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  is_balance_adjustment: false, periodDate: date, realPaymentDate: date,
} as ProcessedTransaction)

const cats: Category[] = [
  { id: 'c1', user_id: 'u1', name: 'Casa', emoji: '🏠', type: 'expense' } as Category,
  { id: 'c2', user_id: 'u1', name: 'Fernet', emoji: '🍷', type: 'expense' } as Category,
  { id: 'c3', user_id: 'u1', name: 'Nueva', emoji: '🆕', type: 'expense' } as Category,
]

describe('computeHistorico', () => {
  const movimientos = [
    // Casa: sube sostenido -> nivel
    tx('2026-05-05', 500), tx('2026-06-05', 550), tx('2026-07-05', 900), tx('2026-08-05', 1000),
    // Fernet: un pico en julio -> evento
    tx('2026-05-05', 10, 'c2'), tx('2026-06-05', 10, 'c2'), tx('2026-07-17', 5000, 'c2'),
    // Nueva: sólo existe en el mes en curso -> sin desvío
    tx('2026-08-10', 300, 'c3'),
  ]

  it('clasifica cada categoría y calcula su desvío', () => {
    const h = computeHistorico(movimientos, cats, [], { vara: 'promedio', now: HOY })

    const casa = h.filas.find((f) => f.categoryId === 'c1')!
    const fernet = h.filas.find((f) => f.categoryId === 'c2')!

    expect(casa.clasificacion).toBe('nivel')
    expect(casa.desvio).not.toBeNull()
    expect(fernet.clasificacion).toBe('evento')
    expect(fernet.pico!.month).toBe('2026-07')
  })

  it('una categoría sin meses previos no tiene desvío: no se movió, nació', () => {
    const h = computeHistorico(movimientos, cats, [], { vara: 'promedio', now: HOY })
    const nueva = h.filas.find((f) => f.categoryId === 'c3')!

    expect(nueva.desvio).toBeNull()
    expect(nueva.puntos).toHaveLength(1)
  })

  it('expone el tramo usado para que la UI pueda decirlo', () => {
    const h = computeHistorico(movimientos, cats, [], { vara: 'promedio', now: HOY })

    expect(h.diaDeCorte).toBe(15)
    expect(h.usaMesCerrado).toBe(false)
    expect(h.mesAncla).toBe('2026-08')
    expect(h.mesesDeReferencia).toContain('2026-07')
  })

  it('la vara cambia el desvío pero NO la clasificación ni el pico', () => {
    const conPromedio = computeHistorico(movimientos, cats, [], { vara: 'promedio', now: HOY })
    const conMesAnterior = computeHistorico(movimientos, cats, [], { vara: 'mes_anterior', now: HOY })

    const claves = (h: ReturnType<typeof computeHistorico>) =>
      h.filas.map((f) => `${f.categoryId}:${f.clasificacion}`).sort()

    expect(claves(conPromedio)).toEqual(claves(conMesAnterior))
    const casaProm = conPromedio.filas.find((f) => f.categoryId === 'c1')!.desvio!
    const casaMes = conMesAnterior.filas.find((f) => f.categoryId === 'c1')!.desvio!
    expect(casaProm.referencia).not.toBe(casaMes.referencia)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- historico-ensamble`
Expected: FAIL — `computeHistorico is not a function`

- [ ] **Step 3: Implementar el ensamble** (agregar a `src/lib/finance/historico.ts`)

```ts
export type FilaHistorico = {
  categoryId: string
  categoryName: string
  emoji: string | null
  /** Meses completos con actividad, para el sparkline. */
  puntos: PuntoMes[]
  /** `null` si la categoría no tiene meses previos con los que compararse. */
  desvio: Desvio | null
  clasificacion: Clasificacion
  /** Sólo cuando la clasificación es 'evento'. */
  pico: Pico | null
}

export type Historico = {
  filas: FilaHistorico[]
  /** Hasta qué día del mes se recortaron los meses de referencia. */
  diaDeCorte: number
  usaMesCerrado: boolean
  /** El mes del que habla el desvío ('YYYY-MM'). */
  mesAncla: string
  /** Los meses contra los que se comparó, para poder nombrarlos en la UI. */
  mesesDeReferencia: string[]
}

export function computeHistorico(
  transactions: ProcessedTransaction[],
  categories: Category[],
  inflacion: Array<{ month: string; rate: number }>,
  opciones: { vara: Vara; months?: number; now?: Date },
): Historico {
  const months = opciones.months ?? 6
  const now = opciones.now ?? new Date()
  const series = computeSeriesPorCategoria(transactions, categories, inflacion, months, now)

  // Si el usuario no cargó NADA este mes, el tramo no dice nada y se cae al
  // último mes cerrado. Se mira sobre el total, no por categoría: que UNA
  // categoría no tenga gastos este mes es información, no falta de datos.
  const mesEnCurso = format(now, 'yyyy-MM')
  const mesEnCursoVacio = !series.some((s) => s.puntos.some((p) => p.month === mesEnCurso))

  const filas: FilaHistorico[] = series.map((serie) => {
    const suyas = transactions.filter((t) => t.category_id === serie.categoryId)
    const { clasificacion, pico } = clasificarSerie(serie.puntos)
    return {
      categoryId: serie.categoryId,
      categoryName: serie.categoryName,
      emoji: serie.emoji,
      puntos: serie.puntos,
      desvio: computeDesvioPorTramo(suyas, inflacion, opciones.vara, months, now, mesEnCursoVacio),
      clasificacion,
      pico,
    }
  })

  const diaDeHoy = now.getDate()
  const usaMesCerrado = diaDeHoy < DIAS_MINIMOS_DE_TRAMO || mesEnCursoVacio
  const mesAncla = usaMesCerrado ? format(subMonths(now, 1), 'yyyy-MM') : format(now, 'yyyy-MM')
  const desde = format(subMonths(now, months - 1), 'yyyy-MM')
  const mesesDeReferencia: string[] = []
  for (let k = 1; k < months; k++) {
    const mes = format(subMonths(parseLocalDate(`${mesAncla}-01`), k), 'yyyy-MM')
    if (mes < desde) break
    mesesDeReferencia.push(mes)
  }

  return {
    filas,
    diaDeCorte: usaMesCerrado ? 31 : diaDeHoy,
    usaMesCerrado,
    mesAncla,
    mesesDeReferencia,
  }
}
```

- [ ] **Step 4: Agregar el getter al store**

En `src/lib/store/financeStore.ts`, en la interfaz `FinanceState`, junto a los otros getters de análisis:

```ts
  /** Histórico por categoría en pesos de hoy. Wrapper fino de computeHistorico. */
  getHistorico: (vara: Vara, months?: number) => Historico;
```

Con el import arriba del archivo:

```ts
import { computeHistorico } from '@/lib/finance/historico';
import type { Historico, Vara } from '@/lib/finance/historico';
```

Y la implementación, junto a `getRealAdjustedTrend`:

```ts
  getHistorico: (vara, months = 6) => {
    const { transactions, categories, inflationSeries } = get();
    return computeHistorico(transactions, categories, inflationSeries, { vara, months });
  },
```

- [ ] **Step 5: Correr el gate completo**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: todo verde; `historico-ensamble` con 4 tests nuevos

- [ ] **Step 6: Commit**

```bash
git add src/lib/finance/historico.ts src/lib/finance/__tests__/historico-ensamble.test.ts src/lib/store/financeStore.ts
git commit -m "feat(historico): ensamblar filas y exponer getHistorico en el store"
```

---

### Task 5: Las dos tools del chat, con test de paridad

**Files:**
- Modify: `src/lib/ai/tools/readTools.ts`
- Modify: `src/lib/ai/tools/dataLoader.ts` (sumar `inflacion` a `FinanceData`)
- Modify: `src/lib/ai/agentPrompt.ts` (la regla de "pesos de hoy")
- Test: `src/lib/ai/tools/__tests__/historico-tools.test.ts`

**Interfaces:**
- Consumes: `computeHistorico`, `Historico`, `Vara` (Task 4)
- Produces: las tools `get_historial_categoria` y `get_que_se_movio` dentro de `readTools`

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/ai/tools/__tests__/historico-tools.test.ts
import { describe, it, expect } from 'vitest'
import { readTools } from '@/lib/ai/tools/readTools'
import { computeHistorico } from '@/lib/finance/historico'
import type { Category } from '@/types/database'
import type { ProcessedTransaction } from '@/lib/finance/types'

const tx = (date: string, amount: number): ProcessedTransaction => ({
  id: date + amount, user_id: 'u1', description: 'x', amount, date,
  type: 'expense', category_id: 'c1', payment_method_id: 'p1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  is_balance_adjustment: false, periodDate: date, realPaymentDate: date,
} as ProcessedTransaction)

const cats = [{ id: 'c1', user_id: 'u1', name: 'Supermercado', emoji: '🛒', type: 'expense' } as Category]

describe('tools del histórico', () => {
  it('están registradas con los nombres que el prompt va a usar', () => {
    const nombres = readTools.map((t) => t.name)
    expect(nombres).toContain('get_historial_categoria')
    expect(nombres).toContain('get_que_se_movio')
  })

  it('PARIDAD: la tool devuelve exactamente lo que devuelve la función pura', async () => {
    // Este test es el que importa: si el chat y el home divergen, es un bug.
    // No puede haber una segunda implementación del cálculo en la capa de tools.
    const now = new Date(2026, 7, 15)
    const movimientos = [tx('2026-06-05', 100), tx('2026-07-05', 200), tx('2026-08-05', 300)]

    const esperado = computeHistorico(movimientos, cats, [], { vara: 'promedio', now })

    const tool = readTools.find((t) => t.name === 'get_que_se_movio')!
    const res = await tool.execute(
      { vara: 'promedio' },
      {
        supabase: null as never,
        userId: 'u1',
        authUserId: 'u1',
        today: '2026-08-15',
        _financeCache: Promise.resolve({
          transactions: movimientos,
          categories: cats,
          inflacion: [],
          paymentMethods: [], recurringPlans: [], internalTransfers: [],
          installmentPlans: [], incomeRhythm: 'monthly',
        }),
      } as never,
    )

    expect(res.ok).toBe(true)
    const fila = (res as { ok: true; data: { categorias: Array<{ categoria: string; desvio_pct: number | null }> } })
      .data.categorias.find((c) => c.categoria === 'Supermercado')!
    const filaEsperada = esperado.filas.find((f) => f.categoryName === 'Supermercado')!

    expect(fila.desvio_pct).toBe(filaEsperada.desvio!.pct)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- historico-tools`
Expected: FAIL — los nombres no están en `readTools`

- [ ] **Step 3: Sumar la inflación al loader**

En `src/lib/ai/tools/dataLoader.ts`, agregar el campo a la interfaz:

```ts
export interface FinanceData {
  transactions: ProcessedTransaction[]
  paymentMethods: PaymentMethod[]
  recurringPlans: RecurringPlan[]
  internalTransfers: InternalTransfer[]
  categories: Category[]
  installmentPlans: InstallmentPlan[]
  /** Ritmo de cobro declarado: define qué compromisos descuenta el disponible. */
  incomeRhythm: IncomeRhythm
  /** Serie mensual de IPC para deflactar a pesos de hoy. Vacía si la API falla. */
  inflacion: Array<{ month: string; rate: number }>
}
```

Y en `loadFinanceData`, traerla con el mismo endpoint que usa el store, sin bloquear si falla:

```ts
async function fetchInflacion(): Promise<Array<{ month: string; rate: number }>> {
  try {
    const res = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/inflacion', {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return []
    const raw = (await res.json()) as Array<{ fecha: string; valor: number }>
    return raw.map((r) => ({ month: r.fecha.slice(0, 7), rate: r.valor })).slice(-24)
  } catch {
    return [] // sin IPC, los montos quedan nominales; nunca rompe el chat
  }
}
```

Llamarla dentro del `Promise.all` existente de `loadFinanceData` y sumar `inflacion` al objeto que devuelve.

- [ ] **Step 4: Agregar las dos tools**

En `src/lib/ai/tools/readTools.ts`, los schemas junto a los otros:

```ts
const historialCategoriaSchema = z.object({
  categoria: z.string().describe('Nombre de la categoría, tal como la tiene el usuario'),
  vara: z.enum(['promedio', 'mes_anterior']).optional()
    .describe('Contra qué comparar: el promedio de los meses previos (default) o el mes anterior'),
})

const queSeMovioSchema = z.object({
  vara: z.enum(['promedio', 'mes_anterior']).optional(),
})
```

Y las dos tools dentro del array `readTools`:

```ts
  {
    name: 'get_historial_categoria',
    description:
      'Cómo viene el gasto de UNA categoría mes a mes, en pesos de hoy (ajustado por inflación). Devuelve la serie y cuánto se desvía el mes en curso. Usar para "cómo viene supermercado", "gasté más en salidas que antes".',
    kind: 'read',
    schema: historialCategoriaSchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof historialCategoriaSchema>
      const data = await loadFinanceData(ctx)
      const h = computeHistorico(data.transactions, data.categories, data.inflacion, {
        vara: args.vara ?? 'promedio',
      })
      const buscada = args.categoria.toLowerCase()
      const fila = h.filas.find((f) => f.categoryName.toLowerCase().includes(buscada))
      if (!fila) {
        return { ok: false, error: `No encontré movimientos en una categoría parecida a "${args.categoria}".` }
      }
      return {
        ok: true,
        data: {
          categoria: fila.categoryName,
          unidad: 'pesos de hoy (ajustado por inflación)',
          meses: fila.puntos.map((p) => ({ mes: p.month, monto: Math.round(p.real), en_curso: p.enCurso })),
          desvio_pct: fila.desvio?.pct ?? null,
          comparado_contra: args.vara === 'mes_anterior' ? 'el mes anterior' : 'el promedio de los meses previos',
          recortado_al_dia: h.diaDeCorte,
          clasificacion: fila.clasificacion,
        },
      }
    },
  },
  {
    name: 'get_que_se_movio',
    description:
      'Qué categorías se movieron respecto de lo normal del usuario, en pesos de hoy. Separa las que cambiaron de nivel de las que tuvieron un gasto excepcional de una sola vez. Usar para "en qué gasté de más", "qué cambió", "en qué me estoy yendo".',
    kind: 'read',
    schema: queSeMovioSchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof queSeMovioSchema>
      const data = await loadFinanceData(ctx)
      const h = computeHistorico(data.transactions, data.categories, data.inflacion, {
        vara: args.vara ?? 'promedio',
      })
      const conDesvio = h.filas.filter((f) => f.desvio?.pct != null)
      return {
        ok: true,
        data: {
          unidad: 'pesos de hoy (ajustado por inflación)',
          mes: h.mesAncla,
          recortado_al_dia: h.diaDeCorte,
          comparado_contra: args.vara === 'mes_anterior' ? 'el mes anterior' : 'el promedio de los meses previos',
          categorias: conDesvio
            .filter((f) => f.clasificacion === 'nivel')
            .sort((a, b) => Math.abs(b.desvio!.pct!) - Math.abs(a.desvio!.pct!))
            .slice(0, 8)
            .map((f) => ({ categoria: f.categoryName, desvio_pct: f.desvio!.pct })),
          gastos_de_una_vez: h.filas
            .filter((f) => f.clasificacion === 'evento')
            .sort((a, b) => (b.pico?.monto ?? 0) - (a.pico?.monto ?? 0))
            .slice(0, 5)
            .map((f) => ({ categoria: f.categoryName, mes: f.pico!.month, monto: Math.round(f.pico!.monto) })),
        },
      }
    },
  },
```

Con el import arriba: `import { computeHistorico } from '@/lib/finance/historico'`

- [ ] **Step 5: Enseñarle al prompt la única regla nueva**

En `src/lib/ai/agentPrompt.ts`, dentro de las reglas duras:

```
- Los montos de get_historial_categoria y get_que_se_movio están en PESOS DE HOY
  (ajustados por inflación), no en los pesos del momento del gasto. Decilo al
  responder: "en abril gastaste el equivalente a $X de hoy". Si no lo aclarás, el
  número no coincide con lo que el usuario ve en Movimientos y parece un error.
```

- [ ] **Step 6: Correr el test para verificar que pasa**

Run: `npm test -- historico-tools`
Expected: PASS, 2 tests

- [ ] **Step 7: Gate y commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/lib/ai/tools/readTools.ts src/lib/ai/tools/dataLoader.ts src/lib/ai/agentPrompt.ts src/lib/ai/tools/__tests__/historico-tools.test.ts
git commit -m "feat(chat): dos tools del histórico, sobre la misma función pura que el home"
```

---

### Task 6: El componente `<Sparkline>`

**Files:**
- Create: `src/components/shared/sparkline.tsx`
- Test: `src/components/shared/__tests__/sparkline.test.tsx`

**Interfaces:**
- Produces: `export function Sparkline({ valores, ultimoParcial, className }: { valores: number[]; ultimoParcial?: boolean; className?: string })`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// src/components/shared/__tests__/sparkline.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Sparkline } from '../sparkline'

describe('Sparkline', () => {
  it('dibuja una barra por valor', () => {
    const out = renderToStaticMarkup(<Sparkline valores={[10, 20, 30]} />)
    expect(out.match(/data-barra/g)).toHaveLength(3)
  })

  it('escala las alturas contra el valor máximo', () => {
    const out = renderToStaticMarkup(<Sparkline valores={[50, 100]} />)
    expect(out).toContain('height:50%')
    expect(out).toContain('height:100%')
  })

  it('marca la última barra cuando el mes está en curso', () => {
    const out = renderToStaticMarkup(<Sparkline valores={[10, 20]} ultimoParcial />)
    expect(out).toContain('data-parcial="true"')
  })

  it('no rompe con una serie vacía ni con todos los valores en cero', () => {
    expect(() => renderToStaticMarkup(<Sparkline valores={[]} />)).not.toThrow()
    expect(() => renderToStaticMarkup(<Sparkline valores={[0, 0]} />)).not.toThrow()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- sparkline`
Expected: FAIL — no existe `../sparkline`

- [ ] **Step 3: Implementar**

```tsx
// src/components/shared/sparkline.tsx
import { cn } from '@/lib/utils'

/**
 * Mini gráfico de barras para una serie corta. Sin librería: son divs con
 * altura porcentual, igual que la barra apilada de Inversiones.
 *
 * `ultimoParcial` marca la última barra como un mes que todavía no cerró.
 */
export function Sparkline({
  valores,
  ultimoParcial = false,
  className,
}: {
  valores: number[]
  ultimoParcial?: boolean
  className?: string
}) {
  const max = Math.max(...valores, 0)

  return (
    <div className={cn('flex items-end gap-[3px] h-6 w-[74px] flex-none', className)} aria-hidden="true">
      {valores.map((v, i) => {
        const esUltimo = i === valores.length - 1
        const parcial = esUltimo && ultimoParcial
        return (
          <div
            key={i}
            data-barra
            data-parcial={parcial ? 'true' : undefined}
            className={cn(
              'flex-1 rounded-t-[2px] min-h-[2px]',
              esUltimo ? 'bg-bandera' : 'bg-muted/45',
              parcial && 'opacity-60',
            )}
            style={{ height: max > 0 ? `${(v / max) * 100}%` : '2px' }}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- sparkline`
Expected: PASS, 4 tests

- [ ] **Step 5: Gate y commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/components/shared/sparkline.tsx src/components/shared/__tests__/sparkline.test.tsx
git commit -m "feat(ui): componente Sparkline, sin librería"
```

---

### Task 7: El bloque «Qué se movió» en la tab Tendencia

**Files:**
- Create: `src/components/dashboard/analysis/charts/que-se-movio.tsx`
- Modify: `src/components/dashboard/analysis/tab-tendencia.tsx`
- Test: `src/components/dashboard/analysis/__tests__/que-se-movio.test.tsx`

**Interfaces:**
- Consumes: `store.getHistorico(vara)` (Task 4), `<Sparkline>` (Task 6)
- Produces: `export function QueSeMovio({ onSelect }: { onSelect: (categoryId: string) => void })`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// src/components/dashboard/analysis/__tests__/que-se-movio.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useFinanceStore } from '@/lib/store/financeStore'
import { QueSeMovio } from '../charts/que-se-movio'

const tx = (date: string, amount: number, category_id: string) => ({
  id: date + amount + category_id, user_id: 'u1', description: 'x', amount, date,
  type: 'expense', category_id, payment_method_id: 'p1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  is_balance_adjustment: false, periodDate: date, realPaymentDate: date,
})

const BASE = {
  installmentPlans: [], paymentMethods: [], recurringPlans: [], categoryBudgets: [],
  savingsGoals: [], savingsGoalContributions: [], exchangeRates: [], dolarBlue: null,
  displayCurrency: 'ARS', internalTransfers: [], isInitialized: true,
}

describe('QueSeMovio', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      ...BASE,
      inflationSeries: [],
      categories: [
        { id: 'c1', user_id: 'u1', name: 'Casa', emoji: '🏠', type: 'expense' },
        { id: 'c2', user_id: 'u1', name: 'Fernet', emoji: '🍷', type: 'expense' },
      ],
      transactions: [
        tx('2026-05-05', 500, 'c1'), tx('2026-06-05', 550, 'c1'), tx('2026-07-05', 900, 'c1'),
        tx('2026-05-05', 10, 'c2'), tx('2026-06-05', 10, 'c2'), tx('2026-07-17', 5000, 'c2'),
      ],
    } as never)
  })

  it('separa las que cambiaron de nivel de las que fueron una vez', () => {
    const out = renderToStaticMarkup(<QueSeMovio onSelect={() => {}} />)

    expect(out).toContain('Cambió de nivel')
    expect(out).toContain('Fue una vez')
  })

  it('dice contra qué compara, para que no haya que adivinarlo', () => {
    const out = renderToStaticMarkup(<QueSeMovio onSelect={() => {}} />)
    expect(out).toMatch(/promedio/i)
  })

  it('aclara que los montos están en pesos de hoy', () => {
    const out = renderToStaticMarkup(<QueSeMovio onSelect={() => {}} />)
    expect(out).toMatch(/pesos de hoy/i)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- que-se-movio`
Expected: FAIL — no existe `../charts/que-se-movio`

- [ ] **Step 3: Implementar el componente**

```tsx
// src/components/dashboard/analysis/charts/que-se-movio.tsx
'use client';

import { useState } from 'react';
import { Sparkline } from '@/components/shared/sparkline';
import { InfoHint } from '@/components/ui/info-hint';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { FilaHistorico, Vara } from '@/lib/finance/historico';

const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const mesLargo = (yyyymm: string) => NOMBRE_MES[Number(yyyymm.slice(5, 7)) - 1];

export function QueSeMovio({ onSelect }: { onSelect: (categoryId: string) => void }) {
  const [vara, setVara] = useState<Vara>('promedio');
  // El store entero, no sus getters sueltos (ver store-freshness.test.ts).
  const store = useFinanceStore();
  const historico = store.getHistorico(vara);

  const conDesvio = historico.filas.filter((f) => f.desvio?.pct != null);
  const nivel = conDesvio
    .filter((f) => f.clasificacion === 'nivel')
    .sort((a, b) => Math.abs(b.desvio!.pct!) - Math.abs(a.desvio!.pct!));
  const eventos = historico.filas
    .filter((f) => f.clasificacion === 'evento')
    .sort((a, b) => (b.pico?.monto ?? 0) - (a.pico?.monto ?? 0));

  if (nivel.length === 0 && eventos.length === 0) return null;

  const referencia = historico.mesesDeReferencia.slice().reverse();
  const tramo = historico.usaMesCerrado
    ? `${mesLargo(historico.mesAncla)}, el último mes cerrado`
    : `lo que va de ${mesLargo(historico.mesAncla)}, contra lo que llevabas a esta altura`;

  return (
    <div className="grid gap-3">
      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="font-display text-[19px] text-text">Qué se movió</h3>
          <InfoHint label="Qué muestra">
            Compara {tramo} en <b>pesos de hoy</b>: cada mes se ajusta por inflación para
            que sean comparables. La vara por defecto es tu promedio y no el mes pasado
            porque un mes raro suelto mueve menos el promedio.
          </InfoHint>
        </div>
        <p className="text-[12px] text-muted">
          {tramo}
          {referencia.length > 0 && ` de ${mesLargo(referencia[referencia.length - 1])} a ${mesLargo(referencia[0])}`}
          {' · en pesos de hoy'}
        </p>
      </div>

      <div className="flex border-[1.5px] border-border rounded-full overflow-hidden w-fit">
        {(['promedio', 'mes_anterior'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVara(v)}
            className={cn(
              'px-3 py-1.5 text-[11.5px] font-sans transition-colors',
              vara === v ? 'bg-text text-surface font-bold' : 'bg-surface text-muted',
            )}
          >
            {v === 'promedio' ? 'vs. mi promedio' : 'vs. el mes pasado'}
          </button>
        ))}
      </div>

      {nivel.length > 0 && <Grupo titulo="Cambió de nivel" filas={nivel} onSelect={onSelect} />}
      {eventos.length > 0 && <Grupo titulo="Fue una vez" filas={eventos} onSelect={onSelect} esEvento />}
    </div>
  );
}

function Grupo({
  titulo, filas, onSelect, esEvento = false,
}: {
  titulo: string;
  filas: FilaHistorico[];
  onSelect: (categoryId: string) => void;
  esEvento?: boolean;
}) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wider text-muted font-bold mb-1.5">{titulo}</p>
      <div className="rounded-2xl bg-surface border-[1.5px] border-border shadow-card px-3.5">
        {filas.map((f) => {
          const pct = f.desvio?.pct;
          return (
            <button
              key={f.categoryId}
              type="button"
              onClick={() => onSelect(f.categoryId)}
              className="w-full flex items-center gap-2.5 py-2.5 border-b-[1.5px] border-border/10 last:border-b-0 text-left min-h-[44px]"
            >
              <span className="w-7 h-7 grid place-items-center rounded-lg border-[1.5px] border-border bg-surface-2 text-sm flex-none">
                {f.emoji ?? '•'}
              </span>
              <span className="flex-1 min-w-0 text-[13px] font-bold font-sans text-text truncate">
                {f.categoryName}
                {esEvento && f.pico && (
                  <small className="block font-normal text-[10.5px] text-muted">
                    {mesLargo(f.pico.month)}
                  </small>
                )}
              </span>
              <Sparkline
                valores={f.puntos.map((p) => p.real)}
                ultimoParcial={f.puntos[f.puntos.length - 1]?.enCurso}
              />
              <span
                className={cn(
                  'text-[12.5px] font-bold tnum text-right flex-none min-w-[52px]',
                  esEvento ? 'text-muted' : pct != null && pct > 0 ? 'text-bad' : 'text-good',
                )}
              >
                {esEvento && f.pico
                  ? formatCurrency(f.pico.monto)
                  : pct != null
                    ? `${pct > 0 ? '+' : '−'}${Math.abs(pct * 100).toFixed(0)}%`
                    : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Montarlo en la tab Tendencia**

En `src/components/dashboard/analysis/tab-tendencia.tsx`, importar y renderizar el bloque debajo del `TrendChart` y arriba de `SavingsRateBars`:

```tsx
import { QueSeMovio } from './charts/que-se-movio';
```

```tsx
      <QueSeMovio onSelect={(categoryId) => setCategoriaDetalle(categoryId)} />
```

Con el estado local `const [categoriaDetalle, setCategoriaDetalle] = useState<string | null>(null)`, que la Task 8 consume.

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npm test -- que-se-movio`
Expected: PASS, 3 tests

- [ ] **Step 6: Gate y commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/components/dashboard/analysis/charts/que-se-movio.tsx src/components/dashboard/analysis/tab-tendencia.tsx src/components/dashboard/analysis/__tests__/que-se-movio.test.tsx
git commit -m "feat(analisis): bloque «Qué se movió» en Tendencia, con toggle de vara"
```

---

### Task 8: El detalle de una categoría en el modal

**Files:**
- Create: `src/components/dashboard/analysis/charts/detalle-categoria.tsx`
- Modify: `src/components/dashboard/analysis/tab-tendencia.tsx` (montar el modal)
- Modify: `src/components/dashboard/analysis/tab-categorias.tsx` (usar el mismo detalle al tocar una categoría)
- Test: `src/components/dashboard/analysis/__tests__/detalle-categoria.test.tsx`

**Interfaces:**
- Consumes: `store.getHistorico(vara)` (Task 4). NO usa `<Sparkline>`: las barras acá son grandes y se escalan contra el máximo de la serie.
- Produces: `export function DetalleCategoria({ categoryId }: { categoryId: string })`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// src/components/dashboard/analysis/__tests__/detalle-categoria.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useFinanceStore } from '@/lib/store/financeStore'
import { DetalleCategoria } from '../charts/detalle-categoria'

const tx = (date: string, amount: number) => ({
  id: date + amount, user_id: 'u1', description: 'x', amount, date,
  type: 'expense', category_id: 'c1', payment_method_id: 'p1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  is_balance_adjustment: false, periodDate: date, realPaymentDate: date,
})

describe('DetalleCategoria', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      installmentPlans: [], paymentMethods: [], recurringPlans: [], categoryBudgets: [],
      savingsGoals: [], savingsGoalContributions: [], exchangeRates: [], dolarBlue: null,
      displayCurrency: 'ARS', internalTransfers: [], isInitialized: true, inflationSeries: [],
      categories: [{ id: 'c1', user_id: 'u1', name: 'Casa', emoji: '🏠', type: 'expense' }],
      transactions: [tx('2026-05-05', 500), tx('2026-06-05', 550), tx('2026-07-05', 900)],
    } as never)
  })

  it('muestra el nombre de la categoría y una barra por mes', () => {
    const out = renderToStaticMarkup(<DetalleCategoria categoryId="c1" />)

    expect(out).toContain('Casa')
    expect(out.match(/data-barra/g)!.length).toBeGreaterThanOrEqual(3)
  })

  it('aclara la unidad, porque el número no coincide con Movimientos', () => {
    const out = renderToStaticMarkup(<DetalleCategoria categoryId="c1" />)
    expect(out).toMatch(/pesos de hoy/i)
  })

  it('no rompe con una categoría que no tiene datos', () => {
    expect(() => renderToStaticMarkup(<DetalleCategoria categoryId="no-existe" />)).not.toThrow()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- detalle-categoria`
Expected: FAIL — no existe `../charts/detalle-categoria`

- [ ] **Step 3: Implementar**

```tsx
// src/components/dashboard/analysis/charts/detalle-categoria.tsx
'use client';

import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency, cn } from '@/lib/utils';

const NOMBRE_MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function DetalleCategoria({ categoryId }: { categoryId: string }) {
  // El store entero, no sus getters sueltos (ver store-freshness.test.ts).
  const store = useFinanceStore();
  const historico = store.getHistorico('promedio');
  const fila = historico.filas.find((f) => f.categoryId === categoryId);

  if (!fila) {
    return <p className="text-sm text-muted text-center py-4">Todavía no hay movimientos en esta categoría.</p>;
  }

  const ultimoCerrado = [...fila.puntos].reverse().find((p) => !p.enCurso) ?? fila.puntos[fila.puntos.length - 1];
  const pct = fila.desvio?.pct;
  const max = Math.max(...fila.puntos.map((p) => p.real), 0);

  return (
    <div className="grid gap-3 py-2">
      <div className="text-center">
        <p className="text-xs text-muted uppercase tracking-wider mb-1">
          {fila.emoji} {fila.categoryName} · en pesos de hoy
        </p>
        <p className="font-display tnum text-3xl text-text">{formatCurrency(ultimoCerrado?.real ?? 0)}</p>
        {pct != null && (
          <p className="text-sm text-muted mt-1">
            {pct > 0 ? 'Subió' : 'Bajó'} {Math.abs(pct * 100).toFixed(0)}% contra tu promedio
          </p>
        )}
      </div>

      <div className="flex items-end justify-center gap-2.5 h-28">
        {fila.puntos.map((p) => (
          <div key={p.month} className="flex-1 max-w-[46px] flex flex-col items-center gap-1.5 h-full justify-end">
            {/* Las barras se escalan contra el máximo de LA SERIE, no cada una
                contra sí misma: un <Sparkline> por mes las dibujaría todas del
                mismo alto. */}
            <div
              data-barra
              data-parcial={p.enCurso ? 'true' : undefined}
              className={cn(
                'w-full rounded-t-[5px] border-[1.5px] border-border min-h-[3px]',
                p.enCurso ? 'bg-surface-2' : 'bg-bandera',
              )}
              style={{ height: max > 0 ? `${(p.real / max) * 100}%` : '3px' }}
            />
            <span className="text-[10.5px] text-muted">
              {NOMBRE_MES_CORTO[Number(p.month.slice(5, 7)) - 1]}
              {p.enCurso && '*'}
            </span>
          </div>
        ))}
      </div>

      {fila.puntos.some((p) => p.enCurso) && (
        <p className="text-[11px] text-muted text-center">* el mes todavía no cerró</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Montar el modal en las dos tabs**

En `tab-tendencia.tsx`, con el estado que dejó la Task 7:

```tsx
<Modal isOpen={!!categoriaDetalle} onClose={() => setCategoriaDetalle(null)} title="Cómo viene">
  {categoriaDetalle && <DetalleCategoria categoryId={categoriaDetalle} />}
</Modal>
```

En `tab-categorias.tsx`, dentro del `<Modal>` que ya existe para `item`, agregar el detalle debajo del monto actual, resolviendo el `categoryId` por nombre:

```tsx
{item && (
  <DetalleCategoria
    categoryId={store.categories.find((c) => c.name === selected)?.id ?? ''}
  />
)}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npm test -- detalle-categoria`
Expected: PASS, 3 tests

- [ ] **Step 6: Gate completo + build**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/analysis/
git commit -m "feat(analisis): detalle de una categoría, en Tendencia y en Categorías"
```

---

## Gate visual (antes del merge)

Lo que los tests no pueden ver y hay que mirar en el navegador, con datos reales:

- [ ] El sparkline de una categoría que sube sostenido se lee distinto del de un pico (Casa vs. Fernet).
- [ ] La barra del mes en curso se distingue de las cerradas.
- [ ] El toggle cambia los números y **no** cambia el agrupado ni el orden de los grupos.
- [ ] El encabezado dice contra qué compara, y se entiende sin abrir el `InfoHint`.
- [ ] En 390px: las filas no desbordan con nombres largos de categoría, y el touch target llega a 44px.
- [ ] Tema noche: los colores de `bad`/`good` del porcentaje se leen sobre el papel de estraza.
- [ ] El chat contesta «¿cómo viene supermercado?» con números que **coinciden con la pantalla**, y aclara que son pesos de hoy.

## Fuera de alcance (del spec, repetido acá para el ejecutor)

No implementar: dolarizar, proactividad del chat, exportar, comparar contra otros usuarios, presupuesto sugerido por categoría, cambiar la ventana de 6 meses desde la UI.
