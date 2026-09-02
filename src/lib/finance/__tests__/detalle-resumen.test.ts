import { describe, it, expect } from 'vitest'
import { listarResumenesDeTarjeta, filasDeResumen } from '../detalle-resumen'
import type { CreditCardCycle } from '../cycles'
import type { ProcessedTransaction } from '../types'
import type { PaymentMethod } from '@/types/database'

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
    const r = filasDeResumen('ago', [dentro, fuera])
    expect(r.conFecha.map((t) => t.id)).toEqual(['a'])
  })

  it('ordena ascendente por fecha de compra, como imprime el banco', () => {
    const filas = [
      tx({ id: 'c', purchase_date: '2026-08-18' }),
      tx({ id: 'a', purchase_date: '2026-07-24' }),
      tx({ id: 'b', purchase_date: '2026-08-05' }),
    ]
    expect(filasDeResumen('ago', filas).conFecha.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('desempata por created_at para que el orden sea determinista', () => {
    const filas = [
      tx({ id: 'segunda', purchase_date: '2026-08-05', created_at: '2026-08-05T18:00:00Z' }),
      tx({ id: 'primera', purchase_date: '2026-08-05', created_at: '2026-08-05T09:00:00Z' }),
    ]
    expect(filasDeResumen('ago', filas).conFecha.map((t) => t.id)).toEqual(['primera', 'segunda'])
  })

  it('las que no tienen fecha de compra van aparte, no mezcladas', () => {
    const filas = [
      tx({ id: 'vieja', purchase_date: null }),
      tx({ id: 'nueva', purchase_date: '2026-08-05' }),
    ]
    const r = filasDeResumen('ago', filas)
    expect(r.conFecha.map((t) => t.id)).toEqual(['nueva'])
    expect(r.sinFecha.map((t) => t.id)).toEqual(['vieja'])
  })

  it('el pago del resumen no es una fila del resumen', () => {
    // card_payment_for sale del medio que financia, no es consumo de la tarjeta.
    const pago = tx({ id: 'pago', card_payment_for: 'visa', purchase_date: null })
    const compra = tx({ id: 'compra' })
    const r = filasDeResumen('ago', [pago, compra])
    expect(r.conFecha.map((t) => t.id)).toEqual(['compra'])
    expect(r.sinFecha).toEqual([])
  })

  it('un resumen sin movimientos devuelve los dos grupos vacios', () => {
    expect(filasDeResumen('sep', [])).toEqual({ conFecha: [], sinFecha: [] })
  })
})
