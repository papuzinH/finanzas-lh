/**
 * L3 de la auditoría 2026-08-26: `handleEditGoal` y `handleDeleteGoal` buscan
 * la meta o el presupuesto filtrando por usuario, y después mutan **sólo por
 * `id`**. RLS es el backstop real y hoy no hay forma de que el id sea ajeno,
 * pero el filtro de dueño no se repite en la mutación: si mañana el lookup
 * cambia (un id que llegue del modelo, una búsqueda global), el update deja de
 * estar protegido por el código y queda colgado de una sola capa.
 *
 * Defensa en profundidad: la mutación repite `.eq('user_id', authId)`. Es el
 * mismo patrón que ya usan `handleEdit`/`handleDelete` para categorías.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleEditGoal, handleDeleteGoal } from '@/lib/ai/handlers'
import { createClient } from '@/utils/supabase/server'

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mismo query builder encadenable que handleEdit.test.ts / handleDelete.test.ts,
// más `delete`.
type ChainResult = { data?: unknown; error?: unknown }
type RecordedCall = { method: string; args: unknown[] }

interface MockChain {
  __calls: RecordedCall[]
  select: (...args: unknown[]) => MockChain
  eq: (...args: unknown[]) => MockChain
  ilike: (...args: unknown[]) => MockChain
  limit: (...args: unknown[]) => MockChain
  update: (...args: unknown[]) => MockChain
  delete: (...args: unknown[]) => MockChain
  then: (resolve: (v: ChainResult) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>
}

function createChain(result: ChainResult): MockChain {
  const calls: RecordedCall[] = []
  const chain = {} as MockChain
  const chainMethods = ['select', 'eq', 'ilike', 'limit', 'update', 'delete'] as const
  for (const method of chainMethods) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return chain
    }
  }
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  chain.__calls = calls
  return chain
}

function hasCall(chain: MockChain, method: string, args?: unknown[]) {
  return chain.__calls.some(
    (c) => c.method === method && (!args || JSON.stringify(c.args) === JSON.stringify(args))
  )
}

const AUTH = 'auth-uuid-7'

function createSupabaseMock(chains: MockChain[], authUserId: string | null = AUTH) {
  const from = vi.fn()
  for (const chain of chains) from.mockImplementationOnce(() => chain)
  return {
    from,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: authUserId ? { id: authUserId } : null } }),
    },
  }
}

const mockedCreateClient = vi.mocked(createClient)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleEditGoal repite el filtro de dueño en la mutación', () => {
  it('el update de la meta filtra por user_id, no sólo por id', async () => {
    const lookup = createChain({ data: [{ id: 'goal-1', name: 'Viaje' }] })
    const update = createChain({ error: null })
    mockedCreateClient.mockResolvedValue(createSupabaseMock([lookup, update]) as never)

    const result = await handleEditGoal({
      entity: 'objetivo',
      search: 'viaje',
      changes: { monto_objetivo: 500000 },
    } as never)

    expect(result.success).toBe(true)
    expect(hasCall(update, 'eq', ['id', 'goal-1'])).toBe(true)
    expect(hasCall(update, 'eq', ['user_id', AUTH])).toBe(true)
  })

  it('el update del presupuesto filtra por user_id, no sólo por id', async () => {
    const lookup = createChain({
      data: [{ id: 'bud-1', categories: { name: 'Comida' } }],
    })
    const update = createChain({ error: null })
    mockedCreateClient.mockResolvedValue(createSupabaseMock([lookup, update]) as never)

    const result = await handleEditGoal({
      entity: 'presupuesto',
      search: 'comida',
      changes: { monto_limite: 90000 },
    } as never)

    expect(result.success).toBe(true)
    expect(hasCall(update, 'eq', ['id', 'bud-1'])).toBe(true)
    expect(hasCall(update, 'eq', ['user_id', AUTH])).toBe(true)
  })
})

describe('handleDeleteGoal repite el filtro de dueño en la mutación', () => {
  it('el delete de la meta filtra por user_id, no sólo por id', async () => {
    const lookup = createChain({ data: [{ id: 'goal-2', name: 'Auto' }] })
    const del = createChain({ error: null })
    mockedCreateClient.mockResolvedValue(createSupabaseMock([lookup, del]) as never)

    const result = await handleDeleteGoal({ entity: 'objetivo', search: 'auto' } as never)

    expect(result.success).toBe(true)
    expect(hasCall(del, 'eq', ['id', 'goal-2'])).toBe(true)
    expect(hasCall(del, 'eq', ['user_id', AUTH])).toBe(true)
  })

  it('el delete del presupuesto filtra por user_id, no sólo por id', async () => {
    const lookup = createChain({
      data: [{ id: 'bud-2', categories: { name: 'Transporte' } }],
    })
    const del = createChain({ error: null })
    mockedCreateClient.mockResolvedValue(createSupabaseMock([lookup, del]) as never)

    const result = await handleDeleteGoal({ entity: 'presupuesto', search: 'transporte' } as never)

    expect(result.success).toBe(true)
    expect(hasCall(del, 'eq', ['id', 'bud-2'])).toBe(true)
    expect(hasCall(del, 'eq', ['user_id', AUTH])).toBe(true)
  })
})

describe('sin usuario autenticado no se toca la base', () => {
  it('handleEditGoal corta antes de cualquier query', async () => {
    const supabase = createSupabaseMock([], null)
    mockedCreateClient.mockResolvedValue(supabase as never)

    const result = await handleEditGoal({
      entity: 'objetivo',
      search: 'viaje',
      changes: { monto_objetivo: 1 },
    } as never)

    expect(result).toEqual({ success: false, message: 'No autorizado' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('handleDeleteGoal corta antes de cualquier query', async () => {
    const supabase = createSupabaseMock([], null)
    mockedCreateClient.mockResolvedValue(supabase as never)

    const result = await handleDeleteGoal({ entity: 'objetivo', search: 'viaje' } as never)

    expect(result).toEqual({ success: false, message: 'No autorizado' })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
