/**
 * Auditoría 2026-08-26 (M4): `createInstallmentPlan` buscaba el `payment_method`
 * por id sin filtrar por dueño (sólo para calcular la fecha de crédito) y después
 * guardaba el plan y las cuotas con ese `payment_method_id`. Con un id ajeno, RLS
 * escondía la fila → se trataba como no-crédito y el plan quedaba apuntando por FK
 * a un medio de otro usuario. El fix valida el dueño y rechaza si no es propio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const UID = '11111111-1111-4111-8111-111111111111'
const PROPIO = 'aaaaaaaa-0000-4000-8000-000000000001'
const AJENO = 'bbbbbbbb-9999-4999-8999-999999999999'

function clienteFalso() {
  const escrituras: Array<{ tabla: string; op: string }> = []
  const MEDIOS_DEL_USUARIO = new Set([PROPIO])

  const builder = (tabla: string, op: string) => {
    const filtros: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
    b.select = () => b
    b.single = async () => {
      if (op === 'select' && tabla === 'payment_methods') {
        const id = filtros.id as string | undefined
        const visible = filtros.user_id === undefined || filtros.user_id === UID
        const ok = id && visible && MEDIOS_DEL_USUARIO.has(id)
        return { data: ok ? { id, type: 'debit', default_closing_day: null, default_payment_day: null } : null, error: null }
      }
      // insert ... .select('id').single() del plan
      if (op === 'insert') { escrituras.push({ tabla, op }); return { data: { id: 'plan-1' }, error: null } }
      return { data: null, error: null }
    }
    // insert de las cuotas (array) resuelve sin single
    b.then = (resolve: (x: unknown) => void) => { escrituras.push({ tabla, op }); resolve({ error: null }) }
    return b
  }

  return {
    escrituras,
    auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) },
    from: (tabla: string) => ({
      select: () => builder(tabla, 'select'),
      insert: () => builder(tabla, 'insert'),
      delete: () => builder(tabla, 'delete'),
    }),
  }
}

const estado = vi.hoisted(() => ({ cliente: null as ReturnType<typeof clienteFalso> | null }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => estado.cliente }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createInstallmentPlan } from '../actions'

const base = {
  description: 'compra en cuotas', total_amount: 60000, installments_count: 6,
  purchase_date: '2026-08-27', category_id: 'cat-1',
}

beforeEach(() => { estado.cliente = clienteFalso() })

describe('createInstallmentPlan: dueño del medio (M4)', () => {
  it('rechaza un plan con medio ajeno, sin crear plan ni cuotas', async () => {
    const r = await createInstallmentPlan({ ...base, payment_method_id: AJENO })

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.escrituras.filter((e) => e.op === 'insert')).toHaveLength(0)
  })

  it('crea el plan con un medio propio', async () => {
    const r = await createInstallmentPlan({ ...base, payment_method_id: PROPIO })

    expect(r.error).toBeUndefined()
    expect(estado.cliente!.escrituras.filter((e) => e.tabla === 'installment_plans' && e.op === 'insert')).toHaveLength(1)
  })

  it('sin medio (none) sigue permitido', async () => {
    const r = await createInstallmentPlan({ ...base, payment_method_id: 'none' })

    expect(r.error).toBeUndefined()
  })
})
