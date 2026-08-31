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

  it('no incluye una transacción fuera de la ventana de `months` meses', () => {
    // 7 meses antes de HOY (2026-08-29): enero 2026, fuera de la ventana de 6.
    const series = computeSeriesPorCategoria(
      [tx({ id: 'a', date: '2026-01-29', periodDate: '2026-01-29' })],
      [cat()], IPC, 6, HOY,
    )

    expect(series).toEqual([])
  })

  it('incluye una transacción en el borde exacto de la ventana de `months` meses', () => {
    // El mes más viejo que months = 6 todavía alcanza desde HOY (2026-08-29) es 2026-03.
    const series = computeSeriesPorCategoria(
      [tx({ id: 'a', date: '2026-03-05', periodDate: '2026-03-05' })],
      [cat()], IPC, 6, HOY,
    )

    expect(series[0].puntos.map((p) => p.month)).toEqual(['2026-03'])
  })
})
