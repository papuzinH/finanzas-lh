/**
 * `declararCiclo` valida dueño del medio (auditoría M4, mismo patrón que
 * `reassign-dueno.test.ts`) y delega la escritura en `guardarDeclaracion`
 * (Step 4). Acá se mockea esa función: lo que se prueba es la validación y el
 * despacho de la action, no la escritura en sí (eso ya lo cubre
 * `lib/ciclos/__tests__/declarar.test.ts`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const UID = '11111111-1111-4111-8111-111111111111'
const PROPIO = 'aaaaaaaa-0000-4000-8000-000000000001'
const AJENO = 'bbbbbbbb-9999-4999-8999-999999999999'

/** RLS simulada: `payment_methods` sólo devuelve la fila si es del usuario. */
function clienteFalso() {
  const MEDIOS_DEL_USUARIO = new Map([[PROPIO, { id: PROPIO, user_id: UID, type: 'credit' }]])

  const builder = () => {
    const filtros: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
    b.maybeSingle = async () => {
      const id = filtros.id as string | undefined
      const visible = filtros.user_id === undefined || filtros.user_id === UID
      const fila = id && visible ? MEDIOS_DEL_USUARIO.get(id) : undefined
      return { data: fila ?? null, error: null }
    }
    return b
  }

  return {
    auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) },
    from: () => ({ select: () => builder() }),
  }
}

const estado = vi.hoisted(() => ({ cliente: null as ReturnType<typeof clienteFalso> | null }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => estado.cliente }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const guardarDeclaracionMock = vi.hoisted(() =>
  vi.fn(async (
    _supabase: unknown,
    _method: unknown,
    closingDate: string,
    dueDate: string,
    hoy: string,
  ) => ({ id: 'nuevo', closing_date: closingDate, due_date: dueDate, hoy })),
)
vi.mock('@/lib/ciclos/declarar', () => ({ guardarDeclaracion: guardarDeclaracionMock }))

import { declararCiclo } from '../actions'

beforeEach(() => {
  estado.cliente = clienteFalso()
  guardarDeclaracionMock.mockClear()
})

const base = { paymentMethodId: PROPIO, closingDate: '2026-09-24', dueDate: '2026-10-02' }

describe('declararCiclo', () => {
  it('rechaza una tarjeta de otro usuario, sin llamar a guardarDeclaracion', async () => {
    const r = await declararCiclo({ ...base, paymentMethodId: AJENO })

    expect(r).toEqual({ error: 'Medio de pago invalido' })
    expect(guardarDeclaracionMock).not.toHaveBeenCalled()
  })

  it('rechaza un vencimiento anterior al cierre', async () => {
    const r = await declararCiclo({ ...base, closingDate: '2026-09-24', dueDate: '2026-09-20' })

    expect(r).toEqual({ error: 'El vencimiento no puede ser anterior al cierre' })
    expect(guardarDeclaracionMock).not.toHaveBeenCalled()
  })

  it('camino feliz: llama a guardarDeclaracion con los strings tal cual llegaron', async () => {
    const r = await declararCiclo(base)

    expect(r).toEqual({ success: true })
    expect(guardarDeclaracionMock).toHaveBeenCalledTimes(1)
    const [, , closingDate, dueDate] = guardarDeclaracionMock.mock.calls[0]
    // Sin round trip por Date: los strings yyyy-MM-dd llegan intactos.
    expect(closingDate).toBe('2026-09-24')
    expect(dueDate).toBe('2026-10-02')
  })
})
