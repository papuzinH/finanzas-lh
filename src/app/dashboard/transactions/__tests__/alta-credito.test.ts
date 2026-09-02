/**
 * El camino de credito de `createTransaction`/`updateTransaction`, probado contra la
 * ACTION entera (patron de payment-method-dueno.test.ts + `asegurarCiclos` mockeado),
 * no solo sobre la funcion pura: lo que se fija aca es el WIRING -- que fecha, cycle_id
 * y purchase_date que se persisten salen del resumen y no de recalcular con los
 * defaults de la tarjeta, y que editar una fila sin cambiar de medio no la mueve de
 * resumen (E13).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { calculateCreditPaymentDate } from '@/lib/utils/dates'
import { cicloDeCompra, type CreditCardCycle } from '@/lib/finance/cycles'

const UID = '11111111-1111-4111-8111-111111111111'
const MASTER = 'aaaaaaaa-0000-4000-8000-000000000001'
const DEBITO = 'bbbbbbbb-0000-4000-8000-000000000002'

// Ciclos DESPAREJOS: ninguno cae donde lo pondrian los defaults de la tarjeta
// (cierra 27, vence 4) ni a un corrimiento exacto de un mes del anterior. Sin eso,
// "vino del ciclo" y "lo recalculo con los defaults" darian el mismo numero.
const CICLOS: CreditCardCycle[] = [
  { id: 'c-jul', user_id: UID, payment_method_id: MASTER, closing_date: '2026-07-23', due_date: '2026-08-03', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  { id: 'c-ago', user_id: UID, payment_method_id: MASTER, closing_date: '2026-08-20', due_date: '2026-09-07', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  { id: 'c-sep', user_id: UID, payment_method_id: MASTER, closing_date: '2026-09-24', due_date: '2026-10-06', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
]

type AsegurarCiclos = (supabase: unknown, method: unknown, desde: Date, hasta: Date) => Promise<CreditCardCycle[]>
const asegurarCiclosMock: Mock<AsegurarCiclos> = vi.fn(async () => CICLOS)
vi.mock('@/lib/ciclos/asegurar', () => ({
  asegurarCiclos: (...args: Parameters<AsegurarCiclos>) => asegurarCiclosMock(...args),
}))

const MEDIOS = new Map<string, Record<string, unknown>>([
  [MASTER, { id: MASTER, user_id: UID, name: 'Mastercard', type: 'credit', default_closing_day: 27, default_payment_day: 4, is_default: false, is_personal: false, bucket: 'pocket', initial_balance: 0, initial_balance_at: null, created_at: '2026-01-01T00:00:00Z' }],
  [DEBITO, { id: DEBITO, user_id: UID, name: 'Cuenta', type: 'debit', default_closing_day: null, default_payment_day: null, is_default: false, is_personal: false, bucket: 'pocket', initial_balance: 0, initial_balance_at: null, created_at: '2026-01-01T00:00:00Z' }],
])

/** `currentMethodId` = el medio que la transaccion YA tenia (el `current` del update). */
function clienteFalso(currentMethodId: string | null = null) {
  const escrituras: Array<{ tabla: string; op: 'insert' | 'update'; row: Record<string, unknown> }> = []

  const builder = (tabla: string) => {
    const filtros: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
    b.single = async () => {
      const visible = filtros.user_id === undefined || filtros.user_id === UID
      if (tabla === 'payment_methods') {
        const fila = visible ? MEDIOS.get(filtros.id as string) : undefined
        return { data: fila ?? null, error: null }
      }
      if (tabla === 'transactions') return { data: { payment_method_id: currentMethodId }, error: null }
      return { data: null, error: null }
    }
    return b
  }

  return {
    escrituras,
    auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) },
    from: (tabla: string) => ({
      select: () => builder(tabla),
      insert: async (row: Record<string, unknown>) => { escrituras.push({ tabla, op: 'insert', row }); return { error: null } },
      update: (row: Record<string, unknown>) => {
        const b = builder(tabla) as Record<string, unknown>
        const eqOrig = b.eq as (c: string, v: unknown) => unknown
        b.eq = (c: string, v: unknown) => { eqOrig(c, v); return b }
        b.then = (resolve: (x: unknown) => void) => { escrituras.push({ tabla, op: 'update', row }); resolve({ error: null }) }
        return b
      },
    }),
  }
}

const estado = vi.hoisted(() => ({ cliente: null as ReturnType<typeof clienteFalso> | null }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => estado.cliente }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createTransaction, updateTransaction } from '../actions'

const base = { description: 'compra de prueba', amount: 15000, category_id: 'cat-1', currency: 'ARS' as const }

function filaEscrita(op: 'insert' | 'update') {
  const e = estado.cliente!.escrituras.filter((x) => x.tabla === 'transactions' && x.op === op)
  expect(e).toHaveLength(1)
  return e[0].row
}

beforeEach(() => {
  asegurarCiclosMock.mockClear()
  asegurarCiclosMock.mockResolvedValue(CICLOS)
})

describe('la REGLA que aplican las actions', () => {
  it('una compra despues del cierre vence en el resumen siguiente, con la fecha REAL de ese resumen', () => {
    const ciclo = cicloDeCompra('2026-08-21', CICLOS)
    expect(ciclo?.id).toBe('c-sep')
    expect(ciclo?.due_date).toBe('2026-10-06') // y no el "dia 4" que dicen los defaults
  })
})

describe('createTransaction: camino credito', () => {
  it('(a) el gasto se inserta con el cycle_id del resumen que contiene la fecha, purchase_date del form y date = due_date', async () => {
    estado.cliente = clienteFalso()

    const r = await createTransaction({ ...base, type: 'expense', date: '2026-08-10', payment_method_id: MASTER })

    expect(r.error).toBeUndefined()
    const row = filaEscrita('insert')
    expect(row.cycle_id).toBe('c-ago')
    expect(row.purchase_date).toBe('2026-08-10')
    expect(row.date).toBe('2026-09-07')
    // Procedencia: si la fecha se recalculara con los defaults (27/4) seria otra.
    expect(row.date).not.toBe(calculateCreditPaymentDate('2026-08-10', 27, 4))
  })

  it('un reintegro (income) en la tarjeta tambien va al resumen, con purchase_date null', async () => {
    // `refundsInCycle` (balances.ts) descuenta del resumen por cycle_id: un income
    // sin ciclo deja de restar y el "a pagar" queda inflado. purchase_date es SOLO
    // de compras, asi que en un ingreso va null.
    estado.cliente = clienteFalso()

    const r = await createTransaction({ ...base, type: 'income', date: '2026-08-10', payment_method_id: MASTER })

    expect(r.error).toBeUndefined()
    const row = filaEscrita('insert')
    expect(row.cycle_id).toBe('c-ago')
    expect(row.purchase_date).toBeNull()
    expect(row.date).toBe('2026-09-07')
  })

  it('(b) sin resumen materializado que la contenga, cae al fallback por defaults y cycle_id null', async () => {
    asegurarCiclosMock.mockResolvedValue([])
    estado.cliente = clienteFalso()

    const r = await createTransaction({ ...base, type: 'expense', date: '2026-08-10', payment_method_id: MASTER })

    expect(r.error).toBeUndefined()
    const row = filaEscrita('insert')
    expect(row.cycle_id).toBeNull()
    expect(row.date).toBe(calculateCreditPaymentDate('2026-08-10', 27, 4))
    expect(row.purchase_date).toBe('2026-08-10')
  })
})

describe('updateTransaction: camino credito', () => {
  it('(c) editar descripcion y monto SIN cambiar de medio no toca cycle_id ni purchase_date (E13)', async () => {
    estado.cliente = clienteFalso(MASTER)

    // `date` en una fila de credito ya cargada ES el vencimiento, no una fecha de
    // compra: reescribir purchase_date con eso la corromperia y moveria la compra
    // de resumen. Por eso las dos keys se omiten del update.
    const r = await updateTransaction('tx-1', {
      ...base, description: 'compra editada', amount: 20000, type: 'expense',
      date: '2026-09-07', payment_method_id: MASTER,
    })

    expect(r.error).toBeUndefined()
    const row = filaEscrita('update')
    expect(row).not.toHaveProperty('cycle_id')
    expect(row).not.toHaveProperty('purchase_date')
    expect(row.date).toBe('2026-09-07')
    expect(row.description).toBe('compra editada')
    expect(asegurarCiclosMock).not.toHaveBeenCalled()
  })

  it('(d) cambiar de debito a tarjeta resuelve cycle_id, purchase_date y el vencimiento', async () => {
    estado.cliente = clienteFalso(DEBITO)

    const r = await updateTransaction('tx-1', {
      ...base, type: 'expense', date: '2026-08-10', payment_method_id: MASTER,
    })

    expect(r.error).toBeUndefined()
    const row = filaEscrita('update')
    expect(row.cycle_id).toBe('c-ago')
    expect(row.purchase_date).toBe('2026-08-10')
    expect(row.date).toBe('2026-09-07')
    expect(row.date).not.toBe(calculateCreditPaymentDate('2026-08-10', 27, 4))
  })

  it('cambiar un reintegro de debito a tarjeta tambien lo imputa al resumen, con purchase_date null', async () => {
    estado.cliente = clienteFalso(DEBITO)

    const r = await updateTransaction('tx-1', {
      ...base, type: 'income', date: '2026-08-10', payment_method_id: MASTER,
    })

    expect(r.error).toBeUndefined()
    const row = filaEscrita('update')
    expect(row.cycle_id).toBe('c-ago')
    expect(row.purchase_date).toBeNull()
    expect(row.date).toBe('2026-09-07')
  })

  it('(e) cambiar de tarjeta a debito deja cycle_id null y la fecha tal cual', async () => {
    estado.cliente = clienteFalso(MASTER)

    const r = await updateTransaction('tx-1', {
      ...base, type: 'expense', date: '2026-08-10', payment_method_id: DEBITO,
    })

    expect(r.error).toBeUndefined()
    const row = filaEscrita('update')
    expect(row.cycle_id).toBeNull()
    expect(row.date).toBe('2026-08-10') // en debito la fecha es la de compra
    expect(asegurarCiclosMock).not.toHaveBeenCalled()
  })
})
