import { describe, it, expect } from 'vitest'
import { listarResumenesDeTarjeta, filasDeResumen, mensualidadesPorDebitar } from '../detalle-resumen'
import type { CreditCardCycle } from '../cycles'
import type { ProcessedTransaction } from '../types'
import type { PaymentMethod, RecurringPlan } from '@/types/database'

// Ciclos REALES de la Visa Galicia (resumen del 1-sep-2026). Desparejos a proposito:
// los tres cierres son los tres jueves y el dia calendario se corre hasta 4 dias.
const ciclo = (over: Partial<CreditCardCycle>): CreditCardCycle => ({
  id: 'c1', user_id: 'u1', payment_method_id: 'visa',
  closing_date: '2026-07-23', due_date: '2026-08-03',
  source: 'generated', created_at: '2026-01-01T00:00:00Z',
  reminder_dismissed_at: null,
  ...over,
})

const JULIO = ciclo({ id: 'jul', closing_date: '2026-07-23', due_date: '2026-08-03' })
const AGOSTO = ciclo({ id: 'ago', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'declared' })
const SEPTIEMBRE = ciclo({ id: 'sep', closing_date: '2026-09-24', due_date: '2026-10-05' })
const TRES = [JULIO, AGOSTO, SEPTIEMBRE]

const visa: PaymentMethod = {
  id: 'visa', user_id: 'u1', name: 'Visa', type: 'credit',
  default_closing_day: 20, default_payment_day: 1, created_at: '2026-01-01',
  is_personal: false, is_default: false, bucket: 'pocket',
  initial_balance: 0, initial_balance_at: null,
} as PaymentMethod

const tx = (over: Partial<ProcessedTransaction>): ProcessedTransaction => ({
  id: 't1', user_id: 'u1', payment_method_id: 'visa', cycle_id: 'ago',
  amount: 1000, type: 'expense', description: 'Compra', date: '2026-09-01',
  purchase_date: '2026-08-05', category_id: 'cat1', created_at: '2026-08-05T10:00:00Z',
  periodDate: '2026-08-20', realPaymentDate: '2026-09-01',
  card_payment_for: null, installment_plan_id: null, recurring_plan_id: null,
  original_amount: null, original_currency: null, is_balance_adjustment: false,
  ...over,
} as ProcessedTransaction)

// 2026-08-25: julio y agosto ya cerraron, julio ya vencio, septiembre no cerro.
const HOY = new Date('2026-08-25T12:00:00')

describe('listarResumenesDeTarjeta', () => {
  it('devuelve los resumenes ordenados por cierre ascendente', () => {
    const r = listarResumenesDeTarjeta(visa, TRES, [], HOY)
    expect(r.map((x) => x.id)).toEqual(['jul', 'ago', 'sep'])
  })

  it('un resumen que todavia no cerro es proyectado', () => {
    const r = listarResumenesDeTarjeta(visa, TRES, [], HOY)
    expect(r.find((x) => x.id === 'sep')?.estado).toBe('proyectado')
  })

  it('un resumen cerrado cuyo vencimiento no paso es pendiente', () => {
    const r = listarResumenesDeTarjeta(visa, TRES, [], HOY)
    expect(r.find((x) => x.id === 'ago')?.estado).toBe('pendiente')
  })

  it('un resumen cuyo vencimiento paso y no tiene pago es vencido', () => {
    const r = listarResumenesDeTarjeta(visa, TRES, [], HOY)
    expect(r.find((x) => x.id === 'jul')?.estado).toBe('vencido')
  })

  it('un resumen con pago imputado es pagado, aunque haya vencido', () => {
    const pago = tx({ id: 'p1', cycle_id: 'jul', card_payment_for: 'visa', purchase_date: null })
    const r = listarResumenesDeTarjeta(visa, TRES, [pago], HOY)
    expect(r.find((x) => x.id === 'jul')?.estado).toBe('pagado')
  })

  it('el dia EXACTO del vencimiento todavia es pendiente, no vencido', () => {
    // Agosto vence el 2026-09-01: ese dia todavia lo debes.
    const r = listarResumenesDeTarjeta(visa, TRES, [], new Date('2026-09-01T12:00:00'))
    expect(r.find((x) => x.id === 'ago')?.estado).toBe('pendiente')
  })

  it('el dia EXACTO del cierre ya no es proyectado: el resumen quedo fijado', () => {
    const r = listarResumenesDeTarjeta(visa, TRES, [], new Date('2026-09-24T12:00:00'))
    expect(r.find((x) => x.id === 'sep')?.estado).toBe('pendiente')
  })

  it('conserva el source para que la UI marque declarado vs estimado', () => {
    const r = listarResumenesDeTarjeta(visa, TRES, [], HOY)
    expect(r.find((x) => x.id === 'ago')?.source).toBe('declared')
    expect(r.find((x) => x.id === 'jul')?.source).toBe('generated')
  })

  it('ignora los ciclos de otra tarjeta', () => {
    const ajeno = ciclo({ id: 'otra', payment_method_id: 'master', closing_date: '2026-08-27' })
    const r = listarResumenesDeTarjeta(visa, [...TRES, ajeno], [], HOY)
    expect(r.map((x) => x.id)).toEqual(['jul', 'ago', 'sep'])
  })

  it('una tarjeta sin ciclos materializados devuelve lista vacia, no inventa', () => {
    expect(listarResumenesDeTarjeta(visa, [], [], HOY)).toEqual([])
  })
})

describe('filasDeResumen', () => {
  it('la pertenencia sale de cycle_id, nunca del mes de t.date', () => {
    const dentro = tx({ id: 'a', cycle_id: 'ago', date: '2026-12-31' })
    const fuera = tx({ id: 'b', cycle_id: 'sep', date: '2026-09-01' })
    const r = filasDeResumen('ago', [dentro, fuera], visa, [])
    expect(r.conFecha.map((t) => t.id)).toEqual(['a'])
  })

  it('ordena ascendente por fecha de compra, como imprime el banco', () => {
    const filas = [
      tx({ id: 'c', purchase_date: '2026-08-18' }),
      tx({ id: 'a', purchase_date: '2026-07-24' }),
      tx({ id: 'b', purchase_date: '2026-08-05' }),
    ]
    expect(filasDeResumen('ago', filas, visa, []).conFecha.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('desempata por created_at para que el orden sea determinista', () => {
    const filas = [
      tx({ id: 'segunda', purchase_date: '2026-08-05', created_at: '2026-08-05T18:00:00Z' }),
      tx({ id: 'primera', purchase_date: '2026-08-05', created_at: '2026-08-05T09:00:00Z' }),
    ]
    expect(filasDeResumen('ago', filas, visa, []).conFecha.map((t) => t.id)).toEqual(['primera', 'segunda'])
  })

  it('las que no tienen fecha de compra van aparte, no mezcladas', () => {
    const filas = [
      tx({ id: 'vieja', purchase_date: null }),
      tx({ id: 'nueva', purchase_date: '2026-08-05' }),
    ]
    const r = filasDeResumen('ago', filas, visa, [])
    expect(r.conFecha.map((t) => t.id)).toEqual(['nueva'])
    expect(r.sinFecha.map((t) => t.id)).toEqual(['vieja'])
  })

  it('un ingreso va a reintegros, no al bloque de "sin fecha de compra"', () => {
    // purchase_date es null en TODO income por diseño: meterlo en sinFecha lo ponia
    // bajo un encabezado que dice "se cargaron antes de que la app guardara cuando
    // compraste" -- falso, y ademas lo sacaba del orden cronologico.
    const reintegro = tx({ id: 'r', type: 'income', purchase_date: null })
    const vieja = tx({ id: 'vieja', purchase_date: null })
    const r = filasDeResumen('ago', [reintegro, vieja], visa, [])
    expect(r.reintegros.map((t) => t.id)).toEqual(['r'])
    expect(r.sinFecha.map((t) => t.id)).toEqual(['vieja'])
    expect(r.conFecha).toEqual([])
  })

  it('los reintegros salen ordenados por created_at, que es lo unico determinista', () => {
    const filas = [
      tx({ id: 'b', type: 'income', purchase_date: null, created_at: '2026-08-20T10:00:00Z' }),
      tx({ id: 'a', type: 'income', purchase_date: null, created_at: '2026-08-05T10:00:00Z' }),
    ]
    expect(filasDeResumen('ago', filas, visa, []).reintegros.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('el pago del resumen no es una fila del resumen', () => {
    // card_payment_for sale del medio que financia, no es consumo de la tarjeta.
    const pago = tx({ id: 'pago', card_payment_for: 'visa', purchase_date: null })
    const compra = tx({ id: 'compra' })
    const r = filasDeResumen('ago', [pago, compra], visa, [])
    expect(r.conFecha.map((t) => t.id)).toEqual(['compra'])
    expect(r.sinFecha).toEqual([])
  })

  it('un resumen sin movimientos devuelve los dos grupos vacios', () => {
    expect(filasDeResumen('sep', [], visa, [])).toEqual({ conFecha: [], sinFecha: [], reintegros: [], porDebitar: [] })
  })
})

describe('mensualidadesPorDebitar', () => {
  // La MISMA regla con la que computePaymentMethodStatus inyecta las mensualidades en
  // el total del ciclo. Si se separan, la cabecera y las filas dicen numeros distintos.
  const plan = (over: Partial<RecurringPlan>): RecurringPlan => ({
    id: 'p1', user_id: 'u1', payment_method_id: 'visa', description: 'Netflix',
    amount: 15000, category_id: 'cat1', created_at: '2026-08-01T00:00:00Z',
    is_active: true, billing_day: 5, currency: 'ARS', exchange_rate: null,
    frequency: 'monthly', original_amount: null, rate_pair: null,
    ...over,
  } as RecurringPlan)

  it('un plan activo sin transaccion en el ciclo queda por debitar', () => {
    expect(mensualidadesPorDebitar(visa, 'ago', [], [plan({})]).map((p) => p.id)).toEqual(['p1'])
  })

  it('un plan que YA tiene su transaccion en el ciclo no se duplica', () => {
    const debitada = tx({ id: 'd', cycle_id: 'ago', recurring_plan_id: 'p1' })
    expect(mensualidadesPorDebitar(visa, 'ago', [debitada], [plan({})])).toEqual([])
  })

  it('la transaccion de OTRO ciclo no lo saca de este', () => {
    const enJulio = tx({ id: 'd', cycle_id: 'jul', recurring_plan_id: 'p1' })
    expect(mensualidadesPorDebitar(visa, 'ago', [enJulio], [plan({})]).map((p) => p.id)).toEqual(['p1'])
  })

  it('ignora los planes inactivos y los de otro medio', () => {
    const otros = [plan({ id: 'off', is_active: false }), plan({ id: 'ajeno', payment_method_id: 'master' })]
    expect(mensualidadesPorDebitar(visa, 'ago', [], otros)).toEqual([])
  })

  it('filasDeResumen las devuelve junto con los movimientos', () => {
    const r = filasDeResumen('ago', [tx({ id: 'compra' })], visa, [plan({})])
    expect(r.conFecha.map((t) => t.id)).toEqual(['compra'])
    expect(r.porDebitar.map((p) => p.id)).toEqual(['p1'])
  })
})
