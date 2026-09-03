import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => {
  const state: { error: { message: string } | null } = { error: null }
  const chain: { eq: ReturnType<typeof vi.fn>; then: (resolve: (v: { error: { message: string } | null }) => void) => void } = {
    eq: vi.fn(() => chain),
    then: (resolve) => resolve({ error: state.error }),
  }
  return {
    getUser: vi.fn(),
    from: vi.fn(),
    update: vi.fn(() => chain),
    chain,
    state,
  }
})

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: m.getUser }, from: m.from }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { imputarCobros } from '../actions'

const UID = '11111111-1111-4111-8111-111111111111'
const TX_ID = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  m.state.error = null
  m.getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null })
  m.from.mockReturnValue({ update: m.update })
})

describe('imputarCobros', () => {
  it('escribe income_period filtrando por dueño, tipo income y solo la fila propia', async () => {
    const res = await imputarCobros([{ id: TX_ID, income_period: '2026-09-01' }])

    expect(res.success).toBe(true)
    expect(m.from).toHaveBeenCalledWith('transactions')
    expect(m.update).toHaveBeenCalledWith({ income_period: '2026-09-01' })
    // El filtro por dueño no es decorativo: sin él la mutación queda colgada de
    // RLS como única capa (auditoría L3, igual que saveIncomePeriodPreference).
    expect(m.chain.eq).toHaveBeenCalledWith('id', TX_ID)
    expect(m.chain.eq).toHaveBeenCalledWith('user_id', UID)
    expect(m.chain.eq).toHaveBeenCalledWith('type', 'income')
  })

  it('sin sesion no escribe nada', async () => {
    m.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await imputarCobros([{ id: TX_ID, income_period: '2026-09-01' }])

    expect(res.error).toBe('No autorizado')
    expect(m.from).not.toHaveBeenCalled()
  })

  it('si la escritura falla lo reporta y no lanza', async () => {
    m.state.error = { message: 'boom' }

    const res = await imputarCobros([{ id: TX_ID, income_period: '2026-09-01' }])

    expect(res.error).toBe('No se pudieron guardar todos los cobros')
  })

  it('rechaza un payload invalido (id que no es uuid) sin llegar a la escritura', async () => {
    const res = await imputarCobros([{ id: 'no-es-uuid', income_period: '2026-09-01' }])

    expect(res.error).toBe('Datos inválidos')
    expect(m.from).not.toHaveBeenCalled()
  })

  it('rechaza un income_period con formato invalido sin llegar a la escritura', async () => {
    const res = await imputarCobros([{ id: TX_ID, income_period: '2026/09/01' }])

    expect(res.error).toBe('Datos inválidos')
    expect(m.from).not.toHaveBeenCalled()
  })
})
