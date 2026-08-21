import { describe, expect, it } from 'vitest'
import type { PaymentMethod, RecurringPlan, Transaction } from '@/types/database'
import { parseLocalDate } from '@/lib/utils/dates'
import {
  computeMissingAutomaticCharges,
  expectedChargeDate,
  isAutomaticPlan,
} from '../recurring'

/** Tarjeta que cierra el 20 y vence el 1 del mes siguiente. */
const visa = {
  id: 'card-visa',
  name: 'Visa',
  type: 'credit',
  default_closing_day: 20,
  default_payment_day: 1,
  bucket: 'pocket',
  initial_balance: 0,
  initial_balance_at: null,
  is_personal: false,
  is_default: false,
  user_id: 'u1',
  created_at: '2025-12-01T00:00:00Z',
} as unknown as PaymentMethod

/** Tarjeta que cierra el 27 y vence el 4. */
const master = {
  ...visa,
  id: 'card-master',
  name: 'Master',
  default_closing_day: 27,
  default_payment_day: 4,
} as PaymentMethod

/** Cuenta a la vista: nunca se automatiza. */
const debito = {
  ...visa,
  id: 'acc-debito',
  name: 'Cuenta',
  type: 'debit',
  default_closing_day: null,
  default_payment_day: null,
} as PaymentMethod

function plan(over: Partial<RecurringPlan> = {}): RecurringPlan {
  return {
    id: 'plan-1',
    user_id: 'u1',
    description: 'Servicio',
    // amount SIEMPRE positivo: el signo lo lleva `type` en la transacción.
    amount: 10000,
    category_id: 'cat-1',
    payment_method_id: visa.id,
    currency: 'ARS',
    frequency: 'monthly',
    is_active: true,
    created_at: '2026-01-10T00:00:00Z',
    original_amount: null,
    rate_pair: null,
    exchange_rate: null,
    billing_day: null,
    ...over,
  } as RecurringPlan
}

let txSeq = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  txSeq += 1
  return {
    id: `tx-${txSeq}`,
    user_id: 'u1',
    description: 'Servicio',
    amount: 10000,
    date: '2026-09-01',
    type: 'expense',
    category_id: 'cat-1',
    payment_method_id: visa.id,
    recurring_plan_id: 'plan-1',
    installment_plan_id: null,
    created_at: '2026-09-01T00:00:00Z',
    original_amount: null,
    original_currency: 'ARS',
    rate_pair: null,
    exchange_rate: null,
    card_payment_for: null,
    is_balance_adjustment: false,
    ...over,
  } as unknown as Transaction
}

describe('isAutomaticPlan', () => {
  it('automatiza un plan mensual en una tarjeta con ciclo cargado', () => {
    expect(isAutomaticPlan(plan(), visa)).toBe(true)
  })

  it('A5: no automatiza si la tarjeta no tiene el ciclo cargado', () => {
    const sinCiclo = { ...visa, default_closing_day: null } as PaymentMethod
    expect(isAutomaticPlan(plan(), sinCiclo)).toBe(false)
  })

  it('A6: no automatiza un plan anual', () => {
    expect(isAutomaticPlan(plan({ frequency: 'yearly' }), visa)).toBe(false)
  })

  it('A7: no automatiza un plan de débito', () => {
    expect(isAutomaticPlan(plan({ payment_method_id: debito.id }), debito)).toBe(false)
  })

  it('no automatiza si el plan no tiene medio de pago', () => {
    expect(isAutomaticPlan(plan({ payment_method_id: null }), undefined)).toBe(false)
  })

  it('trata frequency null como mensual (el default del producto)', () => {
    expect(isAutomaticPlan(plan({ frequency: null }), visa)).toBe(true)
  })
})

describe('expectedChargeDate', () => {
  it('A1: cobro el día 1, cierre 20 → vence el 1 del mes siguiente', () => {
    expect(expectedChargeDate(plan({ billing_day: 1 }), visa, '2026-08')).toBe('2026-09-01')
  })

  it('A2: cobro el día 25 (después del cierre) → se va un resumen más', () => {
    expect(expectedChargeDate(plan({ billing_day: 25 }), visa, '2026-08')).toBe('2026-10-01')
  })

  it('A3: la otra tarjeta usa su propio ciclo (cierra 27, vence 4)', () => {
    expect(expectedChargeDate(plan({ billing_day: 1 }), master, '2026-08')).toBe('2026-09-04')
  })

  it('A4: billing_day 31 en febrero clampea al último día del mes', () => {
    // 28 de febrero es posterior al cierre (20) → resumen de abril.
    expect(expectedChargeDate(plan({ billing_day: 31 }), visa, '2026-02')).toBe('2026-04-01')
  })

  it('billing_day nulo se lee como día 1', () => {
    expect(expectedChargeDate(plan({ billing_day: null }), visa, '2026-08')).toBe('2026-09-01')
  })
})

describe('computeMissingAutomaticCharges', () => {
  const methods = [visa, master, debito]
  const hoy = parseLocalDate('2026-08-21')

  it('genera los meses faltantes desde el piso hasta lo ya facturado', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-01-10T00:00:00Z' })],
      methods,
      [],
      '2026-06',
      hoy,
    )
    // Junio, julio y agosto: los tres ya se facturaron (el día 1 ya pasó).
    expect(faltantes.map((f) => f.month)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(faltantes.map((f) => f.date)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
  })

  it('A8: no genera el mes en curso si el día de cobro todavía no llegó', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 28, created_at: '2026-07-01T00:00:00Z' })],
      methods,
      [],
      '2026-07',
      hoy, // 21 de agosto: el cobro del 28 de agosto todavía no ocurrió
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-07'])
  })

  it('A9: el piso es la creación del plan cuando es posterior al primer ingreso', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-07-15T00:00:00Z' })],
      methods,
      [],
      '2026-04',
      hoy,
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-07', '2026-08'])
  })

  it('A10: el piso es el primer ingreso cuando el plan es anterior', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2025-12-01T00:00:00Z' })],
      methods,
      [],
      '2026-08',
      hoy,
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-08'])
  })

  it('A11: no duplica un mes que ya tiene su transacción', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-07-01T00:00:00Z' })],
      methods,
      [tx({ date: '2026-08-01' })], // consumo de julio, ya posteado
      '2026-07',
      hoy,
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-08'])
  })

  it('A12: una transacción con la fecha editada a mano igual cuenta como cubierta', () => {
    const faltantes = computeMissingAutomaticCharges(
      [plan({ billing_day: 1, created_at: '2026-07-01T00:00:00Z' })],
      methods,
      [tx({ date: '2026-08-14' })], // mismo mes de vencimiento, otro día
      '2026-07',
      hoy,
    )
    expect(faltantes.map((f) => f.month)).toEqual(['2026-08'])
  })

  it('ignora los planes inactivos y los que no se automatizan', () => {
    const faltantes = computeMissingAutomaticCharges(
      [
        plan({ id: 'p-inactivo', is_active: false, created_at: '2026-07-01T00:00:00Z' }),
        plan({ id: 'p-debito', payment_method_id: debito.id, created_at: '2026-07-01T00:00:00Z' }),
        plan({ id: 'p-anual', frequency: 'yearly', created_at: '2026-07-01T00:00:00Z' }),
      ],
      methods,
      [],
      '2026-07',
      hoy,
    )
    expect(faltantes).toEqual([])
  })

  it('la cobertura se mira por plan, no globalmente', () => {
    const faltantes = computeMissingAutomaticCharges(
      [
        plan({ id: 'p-a', created_at: '2026-08-01T00:00:00Z' }),
        plan({ id: 'p-b', created_at: '2026-08-01T00:00:00Z' }),
      ],
      methods,
      [tx({ recurring_plan_id: 'p-a', date: '2026-09-01' })],
      '2026-08',
      hoy,
    )
    expect(faltantes.map((f) => f.planId)).toEqual(['p-b'])
  })
})
