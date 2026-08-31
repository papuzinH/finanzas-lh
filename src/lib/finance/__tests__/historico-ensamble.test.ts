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

  it('un gasto tardío en el mes da desvío null por el recorte del tramo, NO por falta de historia', () => {
    // Alquiler: se paga el 28 de cada mes, con tres meses previos reales de historia.
    // Evaluado un día 15, el tramo de cada mes de referencia se recorta a
    // getDate() <= 15 y ninguno de los tres "28" entra: mesesConActividad queda
    // vacío y computeDesvioPorTramo devuelve { referencia: 0, pct: null } aunque la
    // categoría tenga historia real (a diferencia de 'Nueva' en el test de arriba,
    // que directamente no tiene meses previos).
    const catsConAlquiler: Category[] = [
      ...cats,
      { id: 'c4', user_id: 'u1', name: 'Alquiler', emoji: '🏠', type: 'expense' } as Category,
    ]
    const movimientosConAlquiler = [
      tx('2026-05-28', 900_000, 'c4'),
      tx('2026-06-28', 900_000, 'c4'),
      tx('2026-07-28', 900_000, 'c4'),
      // Otra categoría con actividad en el mes en curso, para que usaMesCerrado
      // quede en false y el tramo se recorte al día de hoy (15), no al mes cerrado.
      tx('2026-08-05', 500),
    ]

    const h = computeHistorico(movimientosConAlquiler, catsConAlquiler, [], {
      vara: 'promedio',
      now: HOY,
    })
    const alquiler = h.filas.find((f) => f.categoryId === 'c4')!

    expect(h.usaMesCerrado).toBe(false)
    expect(alquiler.puntos.length).toBeGreaterThan(0) // sí tiene historia real: 3 meses cargados
    expect(alquiler.desvio).toBeNull() // pero el tramo (día <= 15) no alcanza a verla
  })

  // Fix-final, ola 1 — Important 3: sin datos de IPC, todos los montos son
  // nominales (`real === nominal`, factor 1) y afirmar "pesos de hoy" sería
  // afirmar un ajuste que no ocurrió. `deflactado` es lo único que distingue
  // los dos casos: el resto del objeto `Historico` es idéntico en forma.
  it('deflactado es true sólo si hay datos de IPC', () => {
    const sinIPC = computeHistorico(movimientos, cats, [], { vara: 'promedio', now: HOY })
    const conIPC = computeHistorico(movimientos, cats, [{ month: '2026-07', rate: 2 }], { vara: 'promedio', now: HOY })

    expect(sinIPC.deflactado).toBe(false)
    expect(conIPC.deflactado).toBe(true)
  })
})
