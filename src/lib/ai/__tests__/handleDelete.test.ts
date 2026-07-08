import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleDelete } from '@/lib/ai/handlers'
import { createClient } from '@/utils/supabase/server'

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}))

// ============================================================
// Helpers de mock: query builder encadenable de supabase-js.
// Cada `createChain(result)` registra los métodos invocados sobre sí
// (select/eq/ilike/limit/order/gte/update/delete/single) y se resuelve
// como thenable (o via `.single()`) con `result`.
// ============================================================

type ChainResult = { data?: unknown; error?: unknown; count?: number | null }
type RecordedCall = { method: string; args: unknown[] }

interface MockChain {
  __calls: RecordedCall[]
  select: (...args: unknown[]) => MockChain
  eq: (...args: unknown[]) => MockChain
  ilike: (...args: unknown[]) => MockChain
  order: (...args: unknown[]) => MockChain
  limit: (...args: unknown[]) => MockChain
  gte: (...args: unknown[]) => MockChain
  lte: (...args: unknown[]) => MockChain
  update: (...args: unknown[]) => MockChain
  delete: (...args: unknown[]) => MockChain
  single: () => Promise<ChainResult>
  then: (resolve: (v: ChainResult) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>
}

function createChain(result: ChainResult): MockChain {
  const calls: RecordedCall[] = []
  const chain = {} as MockChain
  const chainMethods = ['select', 'eq', 'ilike', 'order', 'limit', 'gte', 'lte', 'update', 'delete'] as const
  for (const method of chainMethods) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return chain
    }
  }
  chain.single = () => {
    calls.push({ method: 'single', args: [] })
    return Promise.resolve(result)
  }
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  chain.__calls = calls
  return chain
}

function hasCall(chain: MockChain, method: string, args?: unknown[]) {
  return chain.__calls.some((c) => c.method === method && (!args || JSON.stringify(c.args) === JSON.stringify(args)))
}

/**
 * Arma un mock de supabase donde `.from(table)` devuelve, en orden, cada
 * chain de `chains` (independiente de la tabla pedida). Esto replica el
 * orden exacto de llamadas de `handleDelete` para el caso bajo test.
 */
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

describe('handleDelete - medio_pago con dependencias', () => {
  it('confirmed: false → devuelve el mensaje ⚠️ y no llama .delete() en ninguna tabla', async () => {
    const methodsChain = createChain({ data: [{ id: 5, name: 'Visa' }] })
    const txCountChain = createChain({ count: 3 })
    const planCountChain = createChain({ count: 0 })
    const subCountChain = createChain({ count: 0 })
    const chains = [methodsChain, txCountChain, planCountChain, subCountChain]
    const supabase = createSupabaseMock(chains)
    mockedCreateClient.mockResolvedValueOnce(supabase as never)

    const result = await handleDelete({ entity: 'medio_pago', search: 'visa', confirmed: false }, '1')

    expect(result.success).toBe(true)
    expect(result.message).toContain('⚠️')
    expect(result.message).toContain('Visa')
    expect(result.message).toContain('3 transacciones')

    // Solo se hicieron las 4 consultas de lookup/deps, nada más.
    expect(supabase.from).toHaveBeenCalledTimes(4)
    for (const chain of chains) {
      expect(hasCall(chain, 'delete')).toBe(false)
    }
  })

  it('confirmed: true sin reassignTo → ejecuta .delete() sobre payment_methods', async () => {
    const methodsChain = createChain({ data: [{ id: 5, name: 'Visa' }] })
    const txCountChain = createChain({ count: 3 })
    const planCountChain = createChain({ count: 0 })
    const subCountChain = createChain({ count: 0 })
    const deleteChain = createChain({ error: null })
    const supabase = createSupabaseMock([methodsChain, txCountChain, planCountChain, subCountChain, deleteChain])
    mockedCreateClient.mockResolvedValueOnce(supabase as never)

    const result = await handleDelete({ entity: 'medio_pago', search: 'visa', confirmed: true }, '1')

    expect(result).toEqual({ success: true, message: '🗑️ Medio de pago "Visa" eliminado.' })
    expect(hasCall(deleteChain, 'delete')).toBe(true)
    expect(hasCall(deleteChain, 'eq', ['id', 5])).toBe(true)
    expect(hasCall(deleteChain, 'eq', ['user_id', '1'])).toBe(true)
  })

  it('confirmed: true + reassignTo → reasigna dependencias y luego borra el medio original', async () => {
    const methodsChain = createChain({ data: [{ id: 5, name: 'Visa' }] })
    const txCountChain = createChain({ count: 3 })
    const planCountChain = createChain({ count: 0 })
    const subCountChain = createChain({ count: 0 })
    const resolveNewMethodChain = createChain({
      data: { id: 9, name: 'Mercado Pago', type: 'debit', default_closing_day: null, default_payment_day: null },
    })
    const reassignTxChain = createChain({ error: null })
    const reassignPlansChain = createChain({ error: null })
    const reassignSubsChain = createChain({ error: null })
    const deleteOriginalChain = createChain({ error: null })

    const supabase = createSupabaseMock([
      methodsChain,
      txCountChain,
      planCountChain,
      subCountChain,
      resolveNewMethodChain,
      reassignTxChain,
      reassignPlansChain,
      reassignSubsChain,
      deleteOriginalChain,
    ])
    mockedCreateClient.mockResolvedValueOnce(supabase as never)

    const result = await handleDelete(
      { entity: 'medio_pago', search: 'visa', confirmed: true, reassignTo: 'Mercado Pago' },
      '1'
    )

    expect(result).toEqual({
      success: true,
      message: '✅ 3 entidades reasignadas a "Mercado Pago". Medio de pago "Visa" eliminado.',
    })

    // Update de reasignación en cada tabla dependiente, apuntando al nuevo medio.
    expect(hasCall(reassignTxChain, 'update', [{ payment_method_id: 9 }])).toBe(true)
    expect(hasCall(reassignTxChain, 'eq', ['payment_method_id', 5])).toBe(true)
    expect(hasCall(reassignPlansChain, 'update', [{ payment_method_id: 9 }])).toBe(true)
    expect(hasCall(reassignSubsChain, 'update', [{ payment_method_id: 9 }])).toBe(true)

    // Y el medio original se borra después de reasignar.
    expect(hasCall(deleteOriginalChain, 'delete')).toBe(true)
    expect(hasCall(deleteOriginalChain, 'eq', ['id', 5])).toBe(true)
  })
})

describe('handleDelete - statelessness (sin Map compartido entre requests)', () => {
  it('dos llamadas independientes con mocks frescos (simulando lambdas distintas) funcionan sin estado compartido', async () => {
    // "Lambda" 1: confirma un borrado sin haber pasado antes por una llamada
    // que "recuerde" el pending (no hay Map: todo viaja en el propio request).
    const methodsChain1 = createChain({ data: [{ id: 5, name: 'Visa' }] })
    const txCountChain1 = createChain({ count: 3 })
    const planCountChain1 = createChain({ count: 0 })
    const subCountChain1 = createChain({ count: 0 })
    const deleteChain1 = createChain({ error: null })
    const supabase1 = createSupabaseMock([methodsChain1, txCountChain1, planCountChain1, subCountChain1, deleteChain1])
    mockedCreateClient.mockResolvedValueOnce(supabase1 as never)

    const result1 = await handleDelete({ entity: 'medio_pago', search: 'visa', confirmed: true }, '1')
    expect(result1).toEqual({ success: true, message: '🗑️ Medio de pago "Visa" eliminado.' })

    // "Lambda" 2: mock completamente nuevo, otro userId, misma acción confirmada
    // directamente. Si hubiera estado compartido (el viejo Map), esta llamada
    // dependería de lo que dejó la "lambda" 1 — acá no debería importarle nada.
    const methodsChain2 = createChain({ data: [{ id: 7, name: 'Naranja X' }] })
    const txCountChain2 = createChain({ count: 1 })
    const planCountChain2 = createChain({ count: 0 })
    const subCountChain2 = createChain({ count: 0 })
    const deleteChain2 = createChain({ error: null })
    const supabase2 = createSupabaseMock([methodsChain2, txCountChain2, planCountChain2, subCountChain2, deleteChain2])
    mockedCreateClient.mockResolvedValueOnce(supabase2 as never)

    const result2 = await handleDelete({ entity: 'medio_pago', search: 'naranja', confirmed: true }, '2')
    expect(result2).toEqual({ success: true, message: '🗑️ Medio de pago "Naranja X" eliminado.' })

    // Cada invocación llamó createClient() por su cuenta; no hay un Map de módulo
    // que las conecte (no existe pendingActions en el código).
    expect(mockedCreateClient).toHaveBeenCalledTimes(2)
  })
})

describe('handleDelete - cuota no soporta reasignación', () => {
  it('confirmed: true + reassignTo → rechaza con el mensaje de no soportado y no llama .delete()', async () => {
    const plansChain = createChain({ data: [{ id: 3, description: 'Notebook', total_amount: 1200000, installments_count: 12 }] })
    const futureCountChain = createChain({ count: 6 })
    const chains = [plansChain, futureCountChain]
    const supabase = createSupabaseMock(chains)
    mockedCreateClient.mockResolvedValueOnce(supabase as never)

    const result = await handleDelete(
      { entity: 'cuota', search: 'notebook', confirmed: true, reassignTo: 'Visa' },
      '1'
    )

    expect(result).toEqual({
      success: false,
      message: 'Reasignación no soportada para este tipo de entidad.',
    })

    // Solo lookup del plan + conteo de cuotas futuras; nada se borra.
    expect(supabase.from).toHaveBeenCalledTimes(2)
    for (const chain of chains) {
      expect(hasCall(chain, 'delete')).toBe(false)
    }
  })
})

describe('handleDelete - categoria filtra por UUID de auth (bug fix)', () => {
  it('busca y borra la categoría usando el UUID de auth, no el userId numérico', async () => {
    const authUuid = 'auth-uuid-42'
    const catsChain = createChain({ data: [{ id: 'cat-1', name: 'Comida', emoji: '🍔' }] })
    const txCountChain = createChain({ count: 0 })
    const deleteChain = createChain({ error: null })
    const supabase = createSupabaseMock([catsChain, txCountChain, deleteChain], authUuid)
    mockedCreateClient.mockResolvedValue(supabase as never)

    const result = await handleDelete({ entity: 'categoria', search: 'comida', confirmed: false }, '1')

    expect(result).toEqual({ success: true, message: '🗑️ Categoría "🍔 Comida" eliminada.' })

    // El lookup y el delete de `categories` deben filtrar por el UUID de auth...
    expect(hasCall(catsChain, 'eq', ['user_id', authUuid])).toBe(true)
    expect(hasCall(deleteChain, 'eq', ['user_id', authUuid])).toBe(true)
    // ...nunca por el userId numérico (ese es el bug que se corrige).
    expect(hasCall(catsChain, 'eq', ['user_id', '1'])).toBe(false)
    expect(hasCall(deleteChain, 'eq', ['user_id', '1'])).toBe(false)

    // El conteo de dependencias sí usa transactions.user_id, que es numérico.
    expect(hasCall(txCountChain, 'eq', ['user_id', '1'])).toBe(true)
  })
})
