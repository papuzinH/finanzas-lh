/**
 * Task 9 (E14 en la action): la cuota N va al N-esimo resumen, no a N meses
 * de la primera. `createInstallmentPlan` usaba `addMonths(primera, i)`; con
 * ciclos desparejos (cierre 27, vencimientos que no caen todos el mismo dia)
 * eso inventaba una fecha que la tarjeta no tiene. Este test prueba el
 * WIRING contra la action completa; E14 en escenarios-disponible.test.ts
 * prueba la REGLA sobre las funciones puras.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { addMonths } from 'date-fns'
import { dateToLocalString, parseLocalDate } from '@/lib/utils/dates'
import type { CreditCardCycle } from '@/lib/finance/cycles'

const UID = '11111111-1111-4111-8111-111111111111'
const MASTER = 'aaaaaaaa-0000-4000-8000-000000000001'

// `createInstallmentPlan` recalcula purchaseDateStr con `dateToLocalString(new Date(...))`
// (linea preexistente, fuera del alcance de Task 9): en un runtime con TZ negativo
// (esta maquina corre America/Buenos_Aires, UTC-3) ese round-trip corre la fecha un dia
// hacia atras. Se computa aca con el mismo helper para que el test sea honesto sobre
// el valor real que la action calcula, en vez de asumir el literal de entrada.
const COMPRA_INPUT = '2026-07-15'
const PURCHASE_DATE_STR = dateToLocalString(new Date(COMPRA_INPUT))

// Los tres ciclos desparejos de E14 (Mastercard Galicia, resumen del 1-sep-2026).
const CICLOS: CreditCardCycle[] = [
  { id: 'c0', user_id: UID, payment_method_id: MASTER, closing_date: '2026-07-30', due_date: '2026-08-07', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  { id: 'c1', user_id: UID, payment_method_id: MASTER, closing_date: '2026-08-27', due_date: '2026-09-04', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  { id: 'c2', user_id: UID, payment_method_id: MASTER, closing_date: '2026-10-01', due_date: '2026-10-09', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
]

type AsegurarCiclos = (supabase: unknown, method: unknown, desde: Date, hasta: Date) => Promise<CreditCardCycle[]>
const asegurarCiclosMock: Mock<AsegurarCiclos> = vi.fn(async () => CICLOS)
vi.mock('@/lib/ciclos/asegurar', () => ({
  asegurarCiclos: (...args: Parameters<AsegurarCiclos>) => asegurarCiclosMock(...args),
}))

function clienteFalso() {
  const escrituras: Array<{ tabla: string; op: string }> = []
  let transaccionesInsertadas: Array<Record<string, unknown>> = []

  const builder = (tabla: string, op: string) => {
    const filtros: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
    b.select = () => b
    b.single = async () => {
      if (op === 'select' && tabla === 'payment_methods') {
        const id = filtros.id as string | undefined
        const visible = filtros.user_id === undefined || filtros.user_id === UID
        if (id === MASTER && visible) {
          return {
            data: {
              id: MASTER, user_id: UID, name: 'Mastercard', type: 'credit',
              default_closing_day: 27, default_payment_day: 4,
              created_at: '2026-01-01', is_personal: false, is_default: false,
              bucket: 'pocket', initial_balance: 0, initial_balance_at: null,
            },
            error: null,
          }
        }
        return { data: null, error: null }
      }
      // insert ... .select('id').single() del plan
      if (op === 'insert' && tabla === 'installment_plans') {
        escrituras.push({ tabla, op })
        return { data: { id: 'plan-1' }, error: null }
      }
      return { data: null, error: null }
    }
    return b
  }

  return {
    escrituras,
    get transaccionesInsertadas() { return transaccionesInsertadas },
    auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) },
    from: (tabla: string) => ({
      select: (cols?: string) => {
        // payment_methods busca con select('*') segun el patron de Task 8.
        void cols
        return builder(tabla, 'select')
      },
      insert: (rows: unknown) => {
        if (tabla === 'transactions') {
          escrituras.push({ tabla, op: 'insert' })
          transaccionesInsertadas = rows as Array<Record<string, unknown>>
          return { then: (resolve: (x: unknown) => void) => resolve({ error: null }) }
        }
        return builder(tabla, 'insert')
      },
      delete: () => builder(tabla, 'delete'),
    }),
  }
}

const estado = vi.hoisted(() => ({ cliente: null as ReturnType<typeof clienteFalso> | null }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => estado.cliente }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createInstallmentPlan } from '../actions'

beforeEach(() => {
  estado.cliente = clienteFalso()
  asegurarCiclosMock.mockClear()
})

describe('createInstallmentPlan: la cuota N va al N-esimo resumen (E14, wiring)', () => {
  it('las tres cuotas quedan con la fecha, cycle_id y purchase_date del resumen que les toca', async () => {
    const r = await createInstallmentPlan({
      description: 'Notebook', total_amount: 300000, installments_count: 3,
      purchase_date: COMPRA_INPUT, category_id: 'cat-1', payment_method_id: MASTER,
    })

    expect(r.error).toBeUndefined()

    const filas = estado.cliente!.transaccionesInsertadas
    expect(filas.map((f) => f.date)).toEqual(['2026-08-07', '2026-09-04', '2026-10-09'])
    expect(filas.map((f) => f.cycle_id)).toEqual(['c0', 'c1', 'c2'])
    expect(filas.every((f) => f.purchase_date === PURCHASE_DATE_STR)).toBe(true)
  })

  it('pide los ciclos con margen de installments_count + 1 meses hacia adelante', async () => {
    await createInstallmentPlan({
      description: 'Notebook', total_amount: 300000, installments_count: 3,
      purchase_date: COMPRA_INPUT, category_id: 'cat-1', payment_method_id: MASTER,
    })

    expect(asegurarCiclosMock).toHaveBeenCalledTimes(1)
    const [, , , hasta] = asegurarCiclosMock.mock.calls[0]
    // installments_count (3) + 1 de margen, desde la fecha de compra real (PURCHASE_DATE_STR).
    const minimo = addMonths(parseLocalDate(PURCHASE_DATE_STR), 3 + 1)
    expect(hasta.getTime()).toBeGreaterThanOrEqual(minimo.getTime())
  })
})
