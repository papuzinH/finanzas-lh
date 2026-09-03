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
