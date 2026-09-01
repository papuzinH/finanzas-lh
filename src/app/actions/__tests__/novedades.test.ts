/**
 * Marcar el changelog como visto es la única escritura de esta feature, y su
 * contrato tiene una parte incómoda a propósito: si falla, NO se le avisa al
 * usuario ni se rompe nada. El costo de fallar es que el popup vuelve a
 * aparecer la próxima vez, y no hay nada que el usuario pueda hacer al
 * respecto, así que un error en pantalla sería ruido puro.
 */
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

import { marcarNovedadVista } from '../novedades'

const UID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  m.getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null })
  m.eq.mockResolvedValue({ error: null })
  m.update.mockReturnValue({ eq: m.eq })
  m.from.mockReturnValue({ update: m.update })
})

describe('marcarNovedadVista', () => {
  it('guarda la versión en la fila del propio usuario', async () => {
    await marcarNovedadVista('1.2.0')

    expect(m.from).toHaveBeenCalledWith('users')
    expect(m.update).toHaveBeenCalledWith({ last_seen_version: '1.2.0' })
    // El filtro por dueño no es decorativo: sin él la mutación queda colgada de
    // RLS como única capa (auditoría L3).
    expect(m.eq).toHaveBeenCalledWith('id', UID)
  })

  it('sin sesión no escribe nada', async () => {
    m.getUser.mockResolvedValue({ data: { user: null }, error: null })

    await marcarNovedadVista('1.2.0')

    expect(m.from).not.toHaveBeenCalled()
  })

  it('si la escritura falla no lanza: el modal se cierra igual', async () => {
    m.eq.mockResolvedValue({ error: { message: 'boom' } })

    await expect(marcarNovedadVista('1.2.0')).resolves.toBeUndefined()
  })
})
