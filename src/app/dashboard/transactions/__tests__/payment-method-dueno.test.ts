/**
 * Auditoría 2026-08-26 (M4): al crear o editar una transacción, el
 * `payment_method_id` que manda el cliente se guardaba sin verificar dueño. RLS
 * no impide que una transacción propia quede apuntando por FK a un medio ajeno.
 * Además, la validación previa (para calcular la fecha de crédito) sólo corría
 * en `expense`, así que un `income` con medio ajeno ni se miraba. El fix valida
 * el dueño para cualquier tipo, con `.eq('user_id', user.id)`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const UID = '11111111-1111-4111-8111-111111111111'
const PROPIO = 'aaaaaaaa-0000-4000-8000-000000000001'
const AJENO = 'bbbbbbbb-9999-4999-8999-999999999999'

/** RLS simulada: `payment_methods` sólo devuelve la fila si es propia. */
function clienteFalso() {
  const escrituras: Array<{ tabla: string; op: 'insert' | 'update'; row: Record<string, unknown> }> = []
  const MEDIOS_DEL_USUARIO = new Map([[PROPIO, { type: 'debit', default_closing_day: null, default_payment_day: null }]])

  const builder = (tabla: string) => {
    const filtros: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
    b.single = async () => {
      const id = filtros.id as string | undefined
      const visible = filtros.user_id === undefined || filtros.user_id === UID
      if (tabla === 'payment_methods') {
        const fila = id && visible ? MEDIOS_DEL_USUARIO.get(id) : undefined
        return { data: fila ? { id, ...fila } : null, error: null }
      }
      // `transactions` (el current de update): existe y es del usuario
      if (tabla === 'transactions') return { data: { payment_method_id: null }, error: null }
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
        // el update termina en un await tras los .eq(): registramos y resolvemos
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

const base = { description: 'gasto de prueba', amount: 100, date: '2026-08-27', category_id: 'cat-1', currency: 'ARS' as const }

beforeEach(() => { estado.cliente = clienteFalso() })

describe('createTransaction: dueño del medio (M4)', () => {
  it('rechaza un gasto con medio ajeno, sin insertar', async () => {
    const r = await createTransaction({ ...base, type: 'expense', payment_method_id: AJENO })

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.escrituras).toHaveLength(0)
  })

  it('rechaza también un ingreso con medio ajeno (antes ni se miraba)', async () => {
    const r = await createTransaction({ ...base, type: 'income', payment_method_id: AJENO })

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.escrituras).toHaveLength(0)
  })

  it('inserta con un medio propio', async () => {
    const r = await createTransaction({ ...base, type: 'expense', payment_method_id: PROPIO })

    expect(r.error).toBeUndefined()
    const ins = estado.cliente!.escrituras.filter((e) => e.tabla === 'transactions')
    expect(ins).toHaveLength(1)
    expect(ins[0].row.payment_method_id).toBe(PROPIO)
  })

  it('sin medio sigue funcionando', async () => {
    const r = await createTransaction({ ...base, type: 'expense', payment_method_id: 'none' })

    expect(r.error).toBeUndefined()
    expect(estado.cliente!.escrituras.filter((e) => e.tabla === 'transactions')).toHaveLength(1)
  })
})

describe('updateTransaction: dueño del medio (M4)', () => {
  it('rechaza cambiar el medio a uno ajeno, sin actualizar', async () => {
    const r = await updateTransaction('tx-1', { ...base, type: 'expense', payment_method_id: AJENO })

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.escrituras.filter((e) => e.op === 'update')).toHaveLength(0)
  })

  it('permite cambiar a un medio propio', async () => {
    const r = await updateTransaction('tx-1', { ...base, type: 'expense', payment_method_id: PROPIO })

    expect(r.error).toBeUndefined()
    expect(estado.cliente!.escrituras.filter((e) => e.op === 'update')).toHaveLength(1)
  })
})
