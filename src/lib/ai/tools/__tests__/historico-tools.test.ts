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
