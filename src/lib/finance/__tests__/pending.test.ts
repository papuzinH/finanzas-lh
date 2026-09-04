import { describe, it, expect } from 'vitest'
import { computePendingFixedExpenses } from '@/lib/finance/pending'
import type { RecurringPlan, PaymentMethod } from '@/types/database'
import type { ProcessedTransaction } from '@/lib/finance/types'

const plan = (id: string, amount: number, active = true, methodId: string | null = null) =>
  ({ id, description: `Plan ${id}`, amount, is_active: active, payment_method_id: methodId }) as RecurringPlan

const VISA = { id: 'visa', name: 'Visa', type: 'credit' } as PaymentMethod
const CUENTA = { id: 'mp', name: 'Mercado Pago', type: 'debit' } as PaymentMethod
const MEDIOS = [VISA, CUENTA]

describe('computePendingFixedExpenses', () => {
  const now = new Date(2026, 6, 15) // julio 2026

  it('plan activo sin transacción este mes está pendiente', () => {
    const r = computePendingFixedExpenses([plan('1', 5000, true, 'mp')], [], MEDIOS, now)
    expect(r.total).toBe(5000)
    expect(r.items).toEqual([{ id: '1', name: 'Plan 1', amount: 5000 }])
  })

  it('plan con transacción del mes (por periodDate) NO está pendiente', () => {
    const tx = { recurring_plan_id: '1', periodDate: '2026-07-03', date: '2026-07-03' } as ProcessedTransaction
    expect(computePendingFixedExpenses([plan('1', 5000, true, 'mp')], [tx], MEDIOS, now).total).toBe(0)
  })

  it('planes inactivos no cuentan', () => {
    expect(computePendingFixedExpenses([plan('1', 5000, false, 'mp')], [], MEDIOS, now).total).toBe(0)
  })

  /**
   * Una mensualidad facturada en tarjeta NO se paga aparte: se cobra dentro del
   * resumen, y la plata sale cuando se paga la tarjeta. Nunca es un pendiente.
   *
   * `computeCommitments` (pocket.ts) ya la excluía del disponible por esta misma
   * razón -- "un fijo de crédito ya está facturado dentro del resumen de su
   * tarjeta" -- pero esta función no, así que la pantalla decía "pendiente" sobre
   * algo que el disponible ya daba por cobrado.
   */
  it('una mensualidad en tarjeta nunca está pendiente: la cobra el resumen', () => {
    const r = computePendingFixedExpenses([plan('1', 5000, true, 'visa')], [], MEDIOS, now)
    expect(r.total).toBe(0)
    expect(r.items).toEqual([])
  })

  /**
   * El caso real que lo destapó (Lauti, 2026-09-04): su Mastercard tiene los
   * resúmenes declarados cerrando el 27-ago y el 1-oct, o sea NINGUNO cierra en
   * septiembre. `periodDate` es el cierre del resumen, así que el cargo de Claude
   * --que existe y está posteado-- cae en "2026-10" y el filtro, que compara contra
   * el mes CALENDARIO, no lo encontraba nunca. Resultado: "pendiente" todos los
   * meses en que esa tarjeta no tenga un cierre.
   */
  it('no la reclama aunque su cargo esté imputado a un resumen que cierra otro mes', () => {
    const cargoPosteado = {
      recurring_plan_id: '1',
      periodDate: '2026-10-01', // cierre del resumen
      date: '2026-10-04', // vencimiento
    } as ProcessedTransaction
    const septiembre = new Date(2026, 8, 4)

    const r = computePendingFixedExpenses([plan('1', 5000, true, 'visa')], [cargoPosteado], MEDIOS, septiembre)

    expect(r.total).toBe(0)
  })

  it('un plan sin medio de pago sigue contando como pendiente', () => {
    const r = computePendingFixedExpenses([plan('1', 5000, true, null)], [], MEDIOS, now)
    expect(r.total).toBe(5000)
  })
})
