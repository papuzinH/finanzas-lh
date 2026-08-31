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

  it('con exactamente 3 días transcurridos ya usa el tramo del mes en curso (borde de DIAS_MINIMOS_DE_TRAMO)', () => {
    const d = computeDesvioPorTramo(
      [tx('2026-08-03', 100), tx('2026-07-10', 400), tx('2026-06-10', 200)],
      SIN_IPC, 'promedio', 6, new Date(2026, 7, 3), // 3 de agosto
    )

    expect(d!.usaMesCerrado).toBe(false)
    expect(d!.actual).toBe(100)
  })

  it('con months=1 no hay mes previo posible dentro de la ventana y devuelve null', () => {
    const d = computeDesvioPorTramo(
      [tx('2026-08-05', 600), tx('2026-07-10', 400)],
      SIN_IPC, 'promedio', 1, HOY,
    )

    expect(d).toBeNull()
  })
})
