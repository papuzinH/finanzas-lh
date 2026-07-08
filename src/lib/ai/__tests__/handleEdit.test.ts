import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleEdit } from '@/lib/ai/handlers'
import { createClient } from '@/utils/supabase/server'

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}))

// ============================================================
// Helpers de mock: mismo query builder encadenable que handleDelete.test.ts
// (select/eq/ilike/limit/update → this, resuelto vía `then`).
// ============================================================

type ChainResult = { data?: unknown; error?: unknown }
type RecordedCall = { method: string; args: unknown[] }

interface MockChain {
  __calls: RecordedCall[]
  select: (...args: unknown[]) => MockChain
  eq: (...args: unknown[]) => MockChain
  ilike: (...args: unknown[]) => MockChain
  order: (...args: unknown[]) => MockChain
  limit: (...args: unknown[]) => MockChain
  update: (...args: unknown[]) => MockChain
  then: (resolve: (v: ChainResult) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>
}

function createChain(result: ChainResult): MockChain {
  const calls: RecordedCall[] = []
  const chain = {} as MockChain
  const chainMethods = ['select', 'eq', 'ilike', 'order', 'limit', 'update'] as const
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
  return chain.__calls.some((c) => c.method === method && (!args || JSON.stringify(c.args) === JSON.stringify(args)))
}

function createSupabaseMock(chains: MockChain[], authUserId: string | null = 'auth-uuid-1') {
  const from = vi.fn()
  for (const chain of chains) {
    from.mockImplementationOnce(() => chain)
  }
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

describe('handleEdit - categoria filtra por UUID de auth (bug fix)', () => {
  it('busca y actualiza la categoría usando el UUID de auth, no el userId numérico', async () => {
    const authUuid = 'auth-uuid-42'
    const catsChain = createChain({ data: [{ id: 'cat-1', name: 'Comida', emoji: '🍔' }] })
    const updateChain = createChain({ error: null })
    const supabase = createSupabaseMock([catsChain, updateChain], authUuid)
    mockedCreateClient.mockResolvedValue(supabase as never)

    const result = await handleEdit({ entity: 'categoria', search: 'comida', changes: { emoji: '🌮' } }, 1)

    expect(result.success).toBe(true)
    expect(result.message).toContain('Comida')

    // El lookup y el update de `categories` deben filtrar por el UUID de auth...
    expect(hasCall(catsChain, 'eq', ['user_id', authUuid])).toBe(true)
    expect(hasCall(updateChain, 'eq', ['user_id', authUuid])).toBe(true)
    // ...nunca por el userId numérico (ese es el bug que se corrige).
    expect(hasCall(catsChain, 'eq', ['user_id', 1])).toBe(false)
    expect(hasCall(updateChain, 'eq', ['user_id', 1])).toBe(false)
  })

  it('sin usuario autenticado devuelve "No autorizado" sin consultar categories', async () => {
    const supabase = createSupabaseMock([], null)
    mockedCreateClient.mockResolvedValue(supabase as never)

    const result = await handleEdit({ entity: 'categoria', search: 'comida', changes: { emoji: '🌮' } }, 1)

    expect(result).toEqual({ success: false, message: 'No autorizado' })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('handleEdit - transaccion sigue usando el userId numérico (no se toca en este task)', () => {
  it('filtra transactions por userId numérico', async () => {
    const txChain = createChain({ data: [{ id: 't1', description: 'Café', amount: 2500, type: 'expense', date: '2026-07-08', category_id: null, payment_method_id: null }] })
    const updateChain = createChain({ error: null })
    const supabase = createSupabaseMock([txChain, updateChain])
    mockedCreateClient.mockResolvedValue(supabase as never)

    const result = await handleEdit({ entity: 'transaccion', search: 'Café', changes: { amount: 3000 } }, 7)

    expect(result.success).toBe(true)
    expect(hasCall(txChain, 'eq', ['user_id', 7])).toBe(true)
    expect(hasCall(updateChain, 'eq', ['user_id', 7])).toBe(true)
  })
})
