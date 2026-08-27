/**
 * Auditoría 2026-08-26 (M4): `createTransaction` de inversiones insertaba con el
 * `asset_id` que manda el cliente sin verificar que el activo sea del usuario.
 * RLS impide leer/mutar activos ajenos, pero no impide que una transacción propia
 * quede apuntando por FK a un activo de otro. El fix verifica el dueño antes de
 * insertar, con el filtro `.eq('user_id', user.id)`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const UID = '11111111-1111-4111-8111-111111111111'
const PROPIO = 'aaaaaaaa-0000-4000-8000-000000000001'
const AJENO = 'bbbbbbbb-9999-4999-8999-999999999999'

function clienteFalso() {
  const inserts: Array<{ tabla: string; row: Record<string, unknown> }> = []
  const ACTIVOS_DEL_USUARIO = new Set([PROPIO])

  const selectBuilder = (tabla: string) => {
    const filtros: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
    b.single = async () => {
      const id = filtros.id as string | undefined
      const visible = filtros.user_id === undefined || filtros.user_id === UID
      const ok = tabla === 'investment_assets' && id !== undefined && ACTIVOS_DEL_USUARIO.has(id) && visible
      return { data: ok ? { id } : null, error: null }
    }
    return b
  }

  return {
    inserts,
    auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) },
    from: (tabla: string) => ({
      select: () => selectBuilder(tabla),
      insert: async (row: Record<string, unknown>) => { inserts.push({ tabla, row }); return { error: null } },
    }),
  }
}

const estado = vi.hoisted(() => ({ cliente: null as ReturnType<typeof clienteFalso> | null }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => estado.cliente }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => estado.cliente }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createTransaction } from '../actions'

const tx = (asset_id: string) => ({
  asset_id, type: 'buy' as const, quantity: 10, price_per_unit: 100, currency: 'ARS', date: '2026-08-27',
})

beforeEach(() => { estado.cliente = clienteFalso() })

describe('createTransaction de inversiones: dueño del activo (M4)', () => {
  it('rechaza una transacción sobre un activo ajeno, sin insertar', async () => {
    const r = await createTransaction(tx(AJENO))

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.inserts.filter((i) => i.tabla === 'investment_transactions')).toHaveLength(0)
  })

  it('inserta cuando el activo es del usuario', async () => {
    const r = await createTransaction(tx(PROPIO))

    expect(r.error).toBeUndefined()
    const ins = estado.cliente!.inserts.filter((i) => i.tabla === 'investment_transactions')
    expect(ins).toHaveLength(1)
    expect(ins[0].row.asset_id).toBe(PROPIO)
    expect(ins[0].row.user_id).toBe(UID)
  })
})
