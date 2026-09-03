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

describe('planDeMovimiento — el orden no depende de como venga la lista', () => {
  // Con las dos descripciones editadas, nroDeCuota da undefined en ambas y el
  // desempate por numero de cuota devuelve 0. Ahi Array.sort es estable y el orden
  // pasa a ser el de la query -- que no tiene ORDER BY. Es la ultima puerta del
  // Critical: sin un desempate total, mover una cuota podia arrastrar una hermana
  // que vive en un resumen anterior.
  const editadaA = tx({ id: 'aaa', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p9', description: 'Notebook nueva' })
  const editadaB = tx({ id: 'bbb', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p9', description: 'Notebook usada' })

  it('da el mismo plan venga la lista en el orden que venga', () => {
    const enUnOrden = planDeMovimiento(editadaA, [editadaA, editadaB], CUATRO, 'siguiente')
    const enElOtro = planDeMovimiento(editadaA, [editadaB, editadaA], CUATRO, 'siguiente')
    expect(enUnOrden.reasignaciones).toEqual(enElOtro.reasignaciones)
    expect(enUnOrden.motivoDeRechazo).toBe(enElOtro.motivoDeRechazo)
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
    const r = planDeMovimiento(c3, PLAN, CUATRO, 'siguiente')
    expect(r.reasignaciones).toEqual([{ transactionId: 'c3', cycleId: 'oct', date: '2026-11-02' }])
    expect(r.esperadas).toBe(1)
  })

  // C1: el camino 'anterior' era la unica forma de dejar dos cuotas del mismo plan en un
  // mismo resumen -- un estado que en el papel del banco no existe, y del que salian
  // empates de `date` que hacian divergir las dos cuentas de "que filas se mueven".
  it('mover una cuota al resumen que ya tiene la cuota previa del plan se rechaza, y nombra cual', () => {
    const r = planDeMovimiento(c3, PLAN, CUATRO, 'anterior')
    expect(r.reasignaciones).toEqual([])
    expect(r.esperadas).toBe(0)
    expect(r.motivoDeRechazo).toContain('cuota 2')
  })

  it('mover la cuota mas vieja hacia atras sigue funcionando y arrastra el resto', () => {
    // El caso legitimo que el guard NO cierra: el resumen anterior a la cuota 1 no tiene
    // ninguna cuota de este plan, asi que corre el plan entero un resumen para atras.
    const CINCO = [ciclo({ id: 'jun', closing_date: '2026-06-22', due_date: '2026-07-02' }), ...CUATRO]
    const r = planDeMovimiento(c1, PLAN, CINCO, 'anterior')
    expect(r.reasignaciones.map((x) => x.transactionId)).toEqual(['c1', 'c2', 'c3'])
    expect(r.reasignaciones.map((x) => x.cycleId)).toEqual(['jun', 'jul', 'ago'])
    expect(r.esperadas).toBe(3)
  })

  it('`esperadas` cuenta la tocada mas las posteriores, aunque no todas tengan destino', () => {
    // Con solo tres ciclos la cuota 3 se queda sin resumen: el plan emite 1 reasignacion
    // pero sigue declarando 2 esperadas, y de ahi sale el todo-o-nada de la action.
    const TRES = [JUL, AGO, SEP]
    const r = planDeMovimiento(c2, PLAN, TRES, 'siguiente')
    expect(r.esperadas).toBe(2)
    expect(r.reasignaciones).toHaveLength(1)
  })

  it('con dos cuotas en la misma fecha, el desempate lo da el numero de cuota, no el orden de la query', () => {
    // Estado colisionado (el que producia el 'anterior' antes del guard): q2 y q3
    // comparten `date`. Las filas llegan en el orden en que Postgres las devolvio --
    // esa query no tiene ORDER BY --, asi que aca vienen al reves a proposito.
    const q1 = tx({ id: 'q1', cycle_id: 'jul', date: '2026-08-03', installment_plan_id: 'p3', description: 'X (1/3)' })
    const q2 = tx({ id: 'q2', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p3', description: 'X (2/3)' })
    const q3 = tx({ id: 'q3', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p3', description: 'X (3/3)' })

    const r = planDeMovimiento(q3, [q3, q2, q1], CUATRO, 'siguiente')

    // Sin desempate, `q3` quedaba ANTES que `q2` (el sort es estable y ese fue el orden
    // de entrada) y mover q3 arrastraba a q2: una cuota que el usuario no toco, en un
    // resumen ya cerrado, dos resumenes hacia adelante.
    expect(r.reasignaciones).toEqual([{ transactionId: 'q3', cycleId: 'sep', date: '2026-10-05' }])
    expect(r.esperadas).toBe(1)
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

  it('si la cuota no está en `todas`, rechaza y NO mueve la última cuota del plan', () => {
    // c2 es del plan p1, pero no está en `todas`. Sin el guard, slice(-1) devolvería [c3].
    const r = planDeMovimiento(c2, [c1, c3], CUATRO, 'siguiente')
    expect(r.reasignaciones).toEqual([])
    expect(r.motivoDeRechazo).toBeTruthy()
    // Verificar que NO emite c3 (la última cuota)
    expect(r.reasignaciones.map((x) => x.transactionId)).not.toContain('c3')
  })
})
