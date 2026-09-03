import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: m.getUser }, from: m.from }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveIncomePeriodPreference } from '../actions'

const UID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  m.getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null })
  m.eq.mockResolvedValue({ error: null })
  m.update.mockReturnValue({ eq: m.eq })
  m.from.mockReturnValue({ update: m.update })
})

describe('saveIncomePeriodPreference', () => {
  it('guarda el booleano en la fila del propio usuario', async () => {
    const res = await saveIncomePeriodPreference(true)

    expect(res.success).toBe(true)
    expect(m.from).toHaveBeenCalledWith('users')
    expect(m.update).toHaveBeenCalledWith({ income_counts_next_month: true })
    // El filtro por dueño no es decorativo: sin él la mutación queda colgada de
    // RLS como única capa (auditoría L3).
    expect(m.eq).toHaveBeenCalledWith('id', UID)
  })

  it('sin sesion no escribe nada', async () => {
    m.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await saveIncomePeriodPreference(true)

    expect(res.error).toBe('No autorizado')
    expect(m.from).not.toHaveBeenCalled()
  })

  it('si la escritura falla lo reporta y no lanza', async () => {
    m.eq.mockResolvedValue({ error: { message: 'boom' } })

    const res = await saveIncomePeriodPreference(false)

    expect(res.error).toBe('No se pudo guardar tu preferencia')
  })
})
