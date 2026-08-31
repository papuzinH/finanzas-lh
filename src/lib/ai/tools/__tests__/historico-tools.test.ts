import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readTools } from '@/lib/ai/tools/readTools'
import { computeHistorico } from '@/lib/finance/historico'
import type { Category } from '@/types/database'
import type { ProcessedTransaction } from '@/lib/finance/types'
import type { AgentContext } from '@/lib/ai/tools/types'

const tx = (date: string, amount: number): ProcessedTransaction => ({
  id: date + amount, user_id: 'u1', description: 'x', amount, date,
  type: 'expense', category_id: 'c1', payment_method_id: 'p1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  is_balance_adjustment: false, periodDate: date, realPaymentDate: date,
} as ProcessedTransaction)

const cats = [{ id: 'c1', user_id: 'u1', name: 'Supermercado', emoji: '🛒', type: 'expense' } as Category]

/**
 * Ctx mínimo con el snapshot inyectado directamente en `_financeCache`: las tools de
 * este archivo no pasan por `loadFinanceData`/Supabase, así que `supabase: null` nunca
 * se toca. Mismo patrón de la Task 5 original.
 */
function ctxWith(overrides: {
  transactions: ProcessedTransaction[]
  categories: Category[]
  inflacion?: Array<{ month: string; rate: number }>
}): AgentContext {
  return {
    supabase: null as never,
    userId: 'u1',
    authUserId: 'u1',
    today: '2026-08-15',
    _financeCache: Promise.resolve({
      transactions: overrides.transactions,
      categories: overrides.categories,
      inflacion: overrides.inflacion ?? [],
      paymentMethods: [], recurringPlans: [], internalTransfers: [],
      installmentPlans: [], incomeRhythm: 'monthly',
    }),
  } as never
}

describe('tools del histórico', () => {
  it('están registradas con los nombres que el prompt va a usar', () => {
    const nombres = readTools.map((t) => t.name)
    expect(nombres).toContain('get_historial_categoria')
    expect(nombres).toContain('get_que_se_movio')
  })

  // Ambas tools llaman a `computeHistorico` sin pasarle `now` (`execute` no recibe un
  // reloj propio: cae al `opciones.now ?? new Date()` de la función pura). El test de
  // paridad necesita que la tool y el `esperado` calculado a mano miren el MISMO
  // instante, o compara dos momentos distintos y puede pasar por casualidad del
  // calendario (ver hallazgo del fix round 1: sin fake timers, esto sólo coincidía
  // porque hoy es agosto de 2026 — desde octubre el `mesAncla` real se corre de mes
  // mientras `esperado` queda clavado en '2026-08').
  describe('con el reloj congelado (paridad hermética)', () => {
    const now = new Date(2026, 7, 15) // 15 ago 2026

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(now)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('PARIDAD: la tool devuelve exactamente lo que devuelve la función pura', async () => {
      // Este test es el que importa: si el chat y el home divergen, es un bug.
      // No puede haber una segunda implementación del cálculo en la capa de tools.
      const movimientos = [tx('2026-06-05', 100), tx('2026-07-05', 200), tx('2026-08-05', 300)]

      const esperado = computeHistorico(movimientos, cats, [], { vara: 'promedio', now })

      const tool = readTools.find((t) => t.name === 'get_que_se_movio')!
      const res = await tool.execute({ vara: 'promedio' }, ctxWith({ transactions: movimientos, categories: cats }))

      expect(res.ok).toBe(true)
      const fila = (res as { ok: true; data: { categorias: Array<{ categoria: string; desvio_pct: number | null }> } })
        .data.categorias.find((c) => c.categoria === 'Supermercado')!
      const filaEsperada = esperado.filas.find((f) => f.categoryName === 'Supermercado')!

      expect(fila.desvio_pct).toBe(filaEsperada.desvio!.pct)
    })

    describe('get_historial_categoria', () => {
      const movimientos = [tx('2026-06-05', 100), tx('2026-07-05', 200), tx('2026-08-05', 300)]
      // Con IPC: `deflactado` da true y el test de abajo puede seguir afirmando
      // la unidad "ajustada". El caso sin IPC (deflactado: false) tiene su propio
      // test (fix-final, Important 3).
      const inflacion = [{ month: '2026-07', rate: 2 }, { month: '2026-08', rate: 1 }]

      it('devuelve la serie de la categoría encontrada en pesos de hoy', async () => {
        const esperado = computeHistorico(movimientos, cats, inflacion, { vara: 'promedio', now })
        const filaEsperada = esperado.filas.find((f) => f.categoryName === 'Supermercado')!

        const tool = readTools.find((t) => t.name === 'get_historial_categoria')!
        const res = await tool.execute(
          { categoria: 'Supermercado' },
          ctxWith({ transactions: movimientos, categories: cats, inflacion }),
        )

        expect(res.ok).toBe(true)
        const data = (
          res as {
            ok: true
            data: {
              categoria: string
              unidad: string
              meses: Array<{ mes: string; monto: number; en_curso: boolean }>
              desvio_pct: number | null
            }
          }
        ).data
        expect(data.categoria).toBe('Supermercado')
        expect(data.unidad).toBe('pesos de hoy (ajustado por inflación)')
        expect(data.meses.map((m) => m.mes)).toEqual(filaEsperada.puntos.map((p) => p.month))
        expect(data.desvio_pct).toBe(filaEsperada.desvio!.pct)
      })

      // Fix-final, ola 1 — Important 3: sin IPC (`inflacion: []`, el default de
      // `ctxWith`), `computeHistorico` devuelve `deflactado: false` y la tool NO
      // puede seguir afirmando un ajuste que no hizo.
      it('sin datos de inflación disponibles, la unidad dice "pesos corrientes"', async () => {
        const tool = readTools.find((t) => t.name === 'get_historial_categoria')!
        const res = await tool.execute(
          { categoria: 'Supermercado' },
          ctxWith({ transactions: movimientos, categories: cats }), // inflacion: [] por default
        )

        expect(res.ok).toBe(true)
        const data = (res as { ok: true; data: { unidad: string } }).data
        expect(data.unidad).toBe('pesos corrientes')
      })

      it('sin una categoría parecida, devuelve { ok: false, error } y no lanza', async () => {
        const tool = readTools.find((t) => t.name === 'get_historial_categoria')!
        const res = await tool.execute(
          { categoria: 'Categoría inexistente' },
          ctxWith({ transactions: movimientos, categories: cats }),
        )

        expect(res.ok).toBe(false)
        expect((res as { ok: false; error: string }).error).toMatch(/Categoría inexistente/)
      })

      // Fix-final, ola 1 — Important 4: `.find` + `.includes` devolvía el primer
      // hit en orden de inserción del Map (la categoría con la transacción más
      // vieja), no el mejor match. "Auto" contra ["Autos y repuestos", "Auto"]
      // tiene que resolver a "Auto" (match exacto), no a la que aparece primero.
      it('con match ambiguo, prioriza el match exacto sobre el primero en orden de inserción', async () => {
        const catsAuto = [
          { id: 'ca1', user_id: 'u1', name: 'Autos y repuestos', emoji: '🚗', type: 'expense' } as Category,
          { id: 'ca2', user_id: 'u1', name: 'Auto', emoji: '🚙', type: 'expense' } as Category,
        ]
        const movimientosAuto = [
          { ...tx('2026-08-05', 100), category_id: 'ca1' },
          { ...tx('2026-08-10', 50), category_id: 'ca2' },
        ]

        const tool = readTools.find((t) => t.name === 'get_historial_categoria')!
        const res = await tool.execute(
          { categoria: 'Auto' },
          ctxWith({ transactions: movimientosAuto, categories: catsAuto }),
        )

        expect(res.ok).toBe(true)
        const data = (res as { ok: true; data: { categoria: string } }).data
        expect(data.categoria).toBe('Auto')
      })
    })

    // Fix-final, ola 1 — punto 7: el mismo invariante de orden que la UI
    // (`que-se-movio.tsx`) está duplicado acá; un test barato lo cubre en los
    // dos lugares.
    it('el orden de "categorias" y "gastos_de_una_vez" replica el invariante del spec', async () => {
      const catsVarios: Category[] = [
        { id: 'c1', user_id: 'u1', name: 'Supermercado', emoji: '🛒', type: 'expense' } as Category,
        { id: 'c2', user_id: 'u1', name: 'Casa', emoji: '🏠', type: 'expense' } as Category,
        { id: 'c3', user_id: 'u1', name: 'Fernet', emoji: '🍷', type: 'expense' } as Category,
        { id: 'c4', user_id: 'u1', name: 'Uso personal', emoji: '💅', type: 'expense' } as Category,
      ]
      const txCat = (date: string, amount: number, category_id: string): ProcessedTransaction => ({
        id: date + amount + category_id, user_id: 'u1', description: 'x', amount, date,
        type: 'expense', category_id, payment_method_id: 'p1',
        installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
        is_balance_adjustment: false, periodDate: date, realPaymentDate: date,
      } as ProcessedTransaction)

      const movimientos = [
        // Supermercado: sube fuerte en agosto -> desvío grande (nivel)
        txCat('2026-05-05', 100, 'c1'), txCat('2026-06-05', 100, 'c1'), txCat('2026-07-05', 100, 'c1'), txCat('2026-08-05', 900, 'c1'),
        // Casa: sube poco -> desvío chico (nivel)
        txCat('2026-05-05', 500, 'c2'), txCat('2026-06-05', 500, 'c2'), txCat('2026-07-05', 500, 'c2'), txCat('2026-08-05', 600, 'c2'),
        // Fernet: pico grande en julio (evento)
        txCat('2026-05-05', 10, 'c3'), txCat('2026-06-05', 10, 'c3'), txCat('2026-07-17', 5000, 'c3'),
        // Uso personal: pico chico en julio (evento)
        txCat('2026-05-05', 10, 'c4'), txCat('2026-06-05', 10, 'c4'), txCat('2026-07-20', 100, 'c4'),
      ]

      const tool = readTools.find((t) => t.name === 'get_que_se_movio')!
      const res = await tool.execute(
        { vara: 'promedio' },
        ctxWith({ transactions: movimientos, categories: catsVarios }),
      )

      expect(res.ok).toBe(true)
      const data = (
        res as {
          ok: true
          data: {
            categorias: Array<{ categoria: string }>
            gastos_de_una_vez: Array<{ categoria: string }>
          }
        }
      ).data
      expect(data.categorias.map((c) => c.categoria)).toEqual(['Supermercado', 'Casa'])
      expect(data.gastos_de_una_vez.map((c) => c.categoria)).toEqual(['Fernet', 'Uso personal'])
    })
  })
})
