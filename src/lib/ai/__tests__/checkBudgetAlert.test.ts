import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleTransaction } from '@/lib/ai/handlers'
import { createClient } from '@/utils/supabase/server'
import type { TransactionData } from '@/lib/ai/handlerTypes'

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}))

// ============================================================
// Helpers de mock: mismo query builder encadenable que handleEdit.test.ts /
// handleDelete.test.ts (select/eq/ilike/limit/single/insert/gte/lte → this,
// resuelto vía `then` o `.single()`).
// ============================================================

type ChainResult = { data?: unknown; error?: unknown }
type RecordedCall = { method: string; args: unknown[] }

interface MockChain {
  __calls: RecordedCall[]
  select: (...args: unknown[]) => MockChain
  eq: (...args: unknown[]) => MockChain
  ilike: (...args: unknown[]) => MockChain
  gte: (...args: unknown[]) => MockChain
  lte: (...args: unknown[]) => MockChain
  limit: (...args: unknown[]) => MockChain
  insert: (...args: unknown[]) => MockChain
  single: () => Promise<ChainResult>
  then: (resolve: (v: ChainResult) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>
}

function createChain(result: ChainResult): MockChain {
  const calls: RecordedCall[] = []
  const chain = {} as MockChain
  const chainMethods = ['select', 'eq', 'ilike', 'gte', 'lte', 'limit', 'insert'] as const
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

const baseTx: TransactionData = {
  description: 'Super',
  amount: 900,
  type: 'expense',
  categoryId: 'cat-1',
  categoryName: null,
  paymentMethodName: 'visa',
  date: '2026-07-08',
  isReal: true,
  incomePeriod: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleTransaction - checkBudgetAlert filtra category_budgets por el UUID de auth (bug fix)', () => {
  it('consulta category_budgets con el UUID de auth (no el userId numérico) y dispara el aviso al 90%', async () => {
    const authUuid = 'auth-uuid-77'

    const pmChain = createChain({
      data: { id: 3, name: 'Visa', type: 'debit', default_closing_day: null, default_payment_day: null },
    })
    const categoryTypeChain = createChain({ data: { type: 'expense' } })
    const insertChain = createChain({ error: null })
    const budgetChain = createChain({
      data: { amount: 1000, currency: 'ARS', categories: { name: 'Comida', emoji: '🍔' } },
    })
    const spentChain = createChain({ data: [{ amount: 900 }] })

    const supabase = createSupabaseMock([pmChain, categoryTypeChain, insertChain, budgetChain, spentChain], authUuid)
    mockedCreateClient.mockResolvedValue(supabase as never)

    const result = await handleTransaction(baseTx, '7')

    expect(result.success).toBe(true)
    expect(result.message).toContain('⚠️')
    expect(result.message).toContain('Comida')

    // category_budgets se consulta con el UUID de auth...
    expect(hasCall(budgetChain, 'eq', ['user_id', authUuid])).toBe(true)
    // ...nunca con el userId numérico (ese es el bug que se corrige).
    expect(hasCall(budgetChain, 'eq', ['user_id', '7'])).toBe(false)

    // El conteo de gasto del mes sí sigue usando transactions.user_id (numérico).
    expect(hasCall(spentChain, 'eq', ['user_id', '7'])).toBe(true)

    // Las fechas del rango van con formatLocalDate (YYYY-MM-DD), no toISOString()
    // (que puede correrse de día por UTC).
    const gteArg = spentChain.__calls.find((c) => c.method === 'gte')?.args[1] as string
    const lteArg = spentChain.__calls.find((c) => c.method === 'lte')?.args[1] as string
    expect(gteArg).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(lteArg).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('sin usuario autenticado no consulta category_budgets ni dispara alerta', async () => {
    const pmChain = createChain({
      data: { id: 3, name: 'Visa', type: 'debit', default_closing_day: null, default_payment_day: null },
    })
    const categoryTypeChain = createChain({ data: { type: 'expense' } })
    const insertChain = createChain({ error: null })

    const supabase = createSupabaseMock([pmChain, categoryTypeChain, insertChain], null)
    mockedCreateClient.mockResolvedValue(supabase as never)

    const result = await handleTransaction(baseTx, '7')

    expect(result.success).toBe(true)
    expect(result.message).not.toContain('⚠️')
    // Sólo las 3 consultas previas al budget alert: no llega a pedir category_budgets.
    expect(supabase.from).toHaveBeenCalledTimes(3)
  })
})
