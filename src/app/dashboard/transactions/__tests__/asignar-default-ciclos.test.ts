/**
 * `assignDefaultToUnassignedTransactions` (el banner de /ajustes/medios) re-fechaba
 * los movimientos sin medio con `calculateCreditPaymentDate` y los dejaba con
 * `cycle_id` NULL: huerfanos permanentes que desaparecian del resumen, porque desde
 * esta rama la pertenencia al ciclo sale de la FK y no del mes de `t.date`.
 *
 * Este test prueba el WIRING de la action contra un cliente Supabase falso (patron de
 * payment-method-dueno.test.ts) con `asegurarCiclos` mockeado; la REGLA (a que resumen
 * cae cada compra) la prueba cycles.test.ts sobre `cicloDeCompra`.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { addMonths, subMonths } from 'date-fns'
import { calculateCreditPaymentDate, parseLocalDate } from '@/lib/utils/dates'
import type { CreditCardCycle } from '@/lib/finance/cycles'

const UID = '11111111-1111-4111-8111-111111111111'
const CARD = 'aaaaaaaa-0000-4000-8000-000000000001'

// Ciclos DESPAREJOS: ninguno cae donde lo pondrian los defaults de la tarjeta
// (cierra 27, vence 4) ni a un corrimiento exacto de un mes del anterior. Sin eso,
// una regresion que volviera a fechar con `calculateCreditPaymentDate` pasaria igual.
const CICLOS: CreditCardCycle[] = [
  { id: 'c-jul', user_id: UID, payment_method_id: CARD, closing_date: '2026-07-23', due_date: '2026-08-03', source: 'declared', reminder_dismissed_at: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'c-ago', user_id: UID, payment_method_id: CARD, closing_date: '2026-08-20', due_date: '2026-09-07', source: 'declared', reminder_dismissed_at: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'c-sep', user_id: UID, payment_method_id: CARD, closing_date: '2026-09-24', due_date: '2026-10-06', source: 'declared', reminder_dismissed_at: null, created_at: '2026-01-01T00:00:00Z' },
]

type AsegurarCiclos = (supabase: unknown, method: unknown, desde: Date, hasta: Date) => Promise<CreditCardCycle[]>
const asegurarCiclosMock: Mock<AsegurarCiclos> = vi.fn(async () => CICLOS)
vi.mock('@/lib/ciclos/asegurar', () => ({
  asegurarCiclos: (...args: Parameters<AsegurarCiclos>) => asegurarCiclosMock(...args),
}))

type Fila = { id: string; date: string; type: 'expense' | 'income' }

const TARJETA_DEFAULT = {
  id: CARD,
  user_id: UID,
  name: 'Mastercard',
  type: 'credit',
  default_closing_day: 27,
  default_payment_day: 4,
  is_default: true,
  is_personal: false,
  bucket: 'pocket',
  initial_balance: 0,
  initial_balance_at: null,
  created_at: '2026-01-01T00:00:00Z',
}

function clienteFalso(config: { rows: Fila[]; def?: Record<string, unknown> | null }) {
  const { rows, def = TARJETA_DEFAULT } = config
  const updates: Array<{ id: string | undefined; row: Record<string, unknown> }> = []

  function readBuilder(tabla: string) {
    const filtros: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
    b.is = () => b
    const resolve = () => (tabla === 'payment_methods' ? def : rows)
    b.single = async () => {
      const data = resolve()
      return { data: Array.isArray(data) ? (data[0] ?? null) : data, error: null }
    }
    b.then = (res: (x: { data: unknown; error: null }) => void) => res({ data: resolve(), error: null })
    return b
  }

  return {
    updates,
    auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) },
    from: (tabla: string) => ({
      select: () => readBuilder(tabla),
      update: (row: Record<string, unknown>) => {
        const filtros: Record<string, unknown> = {}
        const b: Record<string, unknown> = {}
        b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
        b.is = () => b
        b.then = (res: (x: { error: null }) => void) => {
          updates.push({ id: filtros.id as string | undefined, row })
          res({ error: null })
        }
        return b
      },
    }),
  }
}

const estado = vi.hoisted(() => ({ cliente: null as ReturnType<typeof clienteFalso> | null }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => estado.cliente }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { assignDefaultToUnassignedTransactions } from '../actions'

beforeEach(() => {
  asegurarCiclosMock.mockClear()
  asegurarCiclosMock.mockResolvedValue(CICLOS)
})

describe('assignDefaultToUnassignedTransactions: el default de credito imputa cada fila a su resumen', () => {
  const ROWS: Fila[] = [
    { id: 'tx-1', date: '2026-07-15', type: 'expense' }, // cierre >= 15-jul → c-jul
    { id: 'tx-2', date: '2026-08-10', type: 'expense' }, // cierre >= 10-ago → c-ago
  ]

  it('cada gasto queda con el cycle_id de su resumen, purchase_date = su fecha vieja y date = due_date', async () => {
    estado.cliente = clienteFalso({ rows: ROWS })

    const r = await assignDefaultToUnassignedTransactions()

    expect(r.error).toBeUndefined()
    const porId = new Map(estado.cliente!.updates.map((u) => [u.id, u.row]))

    expect(porId.get('tx-1')).toMatchObject({
      payment_method_id: CARD,
      cycle_id: 'c-jul',
      purchase_date: '2026-07-15',
      date: '2026-08-03',
    })
    expect(porId.get('tx-2')).toMatchObject({
      payment_method_id: CARD,
      cycle_id: 'c-ago',
      purchase_date: '2026-08-10',
      date: '2026-09-07',
    })

    // Procedencia: si la fecha saliera del calculo por defaults (el codigo viejo)
    // seria otra. La igualdad con due_date confirma que vino del ciclo real.
    expect(porId.get('tx-1')!.date).not.toBe(calculateCreditPaymentDate('2026-07-15', 27, 4))
    expect(porId.get('tx-2')!.date).not.toBe(calculateCreditPaymentDate('2026-08-10', 27, 4))
  })

  it('un reintegro (income) en la tarjeta tambien va al resumen, con purchase_date sin tocar', async () => {
    // Item 5: `refundsInCycle` descuenta por cycle_id, asi que un income sin ciclo
    // deja de restar del resumen. purchase_date es SOLO de compras: no se escribe.
    estado.cliente = clienteFalso({ rows: [{ id: 'tx-in', date: '2026-08-10', type: 'income' }] })

    const r = await assignDefaultToUnassignedTransactions()

    expect(r.error).toBeUndefined()
    const row = estado.cliente!.updates[0].row
    expect(row.cycle_id).toBe('c-ago')
    expect(row.date).toBe('2026-09-07')
    expect(row).not.toHaveProperty('purchase_date')
  })

  it('pide los ciclos UNA sola vez, para el rango [min − 1 mes, max + 2 meses] de las filas', async () => {
    estado.cliente = clienteFalso({ rows: ROWS })

    await assignDefaultToUnassignedTransactions()

    expect(asegurarCiclosMock).toHaveBeenCalledTimes(1)
    const [, , desde, hasta] = asegurarCiclosMock.mock.calls[0]
    expect(desde.getTime()).toBeLessThanOrEqual(subMonths(parseLocalDate('2026-07-15'), 1).getTime())
    expect(hasta.getTime()).toBeGreaterThanOrEqual(addMonths(parseLocalDate('2026-08-10'), 2).getTime())
  })

  it('una fecha que ningun resumen materializado alcanza cae al fallback, con cycle_id null', async () => {
    // Sin ciclos: `cicloDeCompra` no encuentra destino y la fila se guarda igual.
    asegurarCiclosMock.mockResolvedValue([])
    estado.cliente = clienteFalso({ rows: [{ id: 'tx-9', date: '2026-07-15', type: 'expense' }] })

    const r = await assignDefaultToUnassignedTransactions()

    expect(r.error).toBeUndefined()
    const row = estado.cliente!.updates[0].row
    expect(row.cycle_id).toBeNull()
    expect(row.date).toBe(calculateCreditPaymentDate('2026-07-15', 27, 4))
  })

  it('con un default que no es tarjeta con ciclo, sigue el update masivo sin tocar fechas', async () => {
    estado.cliente = clienteFalso({
      rows: ROWS,
      def: { ...TARJETA_DEFAULT, type: 'debit', default_closing_day: null, default_payment_day: null },
    })

    const r = await assignDefaultToUnassignedTransactions()

    expect(r.error).toBeUndefined()
    expect(asegurarCiclosMock).not.toHaveBeenCalled()
    expect(estado.cliente!.updates).toHaveLength(1)
    expect(estado.cliente!.updates[0].row).toEqual({ payment_method_id: CARD })
  })
})
