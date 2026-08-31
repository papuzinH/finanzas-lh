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

      it('devuelve la serie de la categoría encontrada en pesos de hoy', async () => {
        const esperado = computeHistorico(movimientos, cats, [], { vara: 'promedio', now })
        const filaEsperada = esperado.filas.find((f) => f.categoryName === 'Supermercado')!

        const tool = readTools.find((t) => t.name === 'get_historial_categoria')!
        const res = await tool.execute(
          { categoria: 'Supermercado' },
          ctxWith({ transactions: movimientos, categories: cats }),
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

      it('sin una categoría parecida, devuelve { ok: false, error } y no lanza', async () => {
        const tool = readTools.find((t) => t.name === 'get_historial_categoria')!
        const res = await tool.execute(
          { categoria: 'Categoría inexistente' },
          ctxWith({ transactions: movimientos, categories: cats }),
        )

        expect(res.ok).toBe(false)
        expect((res as { ok: false; error: string }).error).toMatch(/Categoría inexistente/)
      })
    })
  })
})
