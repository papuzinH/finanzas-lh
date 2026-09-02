import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleCardConfig } from '@/lib/ai/handlers'
import { createClient } from '@/utils/supabase/server'

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}))

// ============================================================
// Helpers de mock: mismo query builder encadenable que handleDelete.test.ts
// (select/eq/ilike/limit/gt/update → this, resuelto vía `then` o `single`).
// ============================================================

type ChainResult = { data?: unknown; error?: unknown; count?: number | null }
type RecordedCall = { method: string; args: unknown[] }

interface MockChain {
  __calls: RecordedCall[]
  select: (...args: unknown[]) => MockChain
  eq: (...args: unknown[]) => MockChain
  ilike: (...args: unknown[]) => MockChain
  limit: (...args: unknown[]) => MockChain
  gt: (...args: unknown[]) => MockChain
  in: (...args: unknown[]) => MockChain
  update: (...args: unknown[]) => MockChain
  single: () => Promise<ChainResult>
  then: (resolve: (v: ChainResult) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>
}

function createChain(result: ChainResult): MockChain {
  const calls: RecordedCall[] = []
  const chain = {} as MockChain
  const chainMethods = ['select', 'eq', 'ilike', 'limit', 'gt', 'in', 'update'] as const
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
 * chain de `chains`, y registra con qué nombre de tabla se llamó cada una
 * (para poder correlacionar tabla → chain después).
 */
function createSupabaseMock(chains: MockChain[]) {
  const from = vi.fn()
  for (const chain of chains) {
    from.mockImplementationOnce(() => chain)
  }
  return { from }
}

/**
 * true si ninguna llamada a `.from('transactions')` fue seguida de `.update(...)`
 * sobre la chain que devolvió (la traducción, con este mock, del
 * `updates.filter(u => u.table === 'transactions')` del brief).
 */
function noTransactionsUpdateCalls(supabase: ReturnType<typeof createSupabaseMock>): boolean {
  return supabase.from.mock.calls.every((call, i) => {
    if (call[0] !== 'transactions') return true
    const chain = supabase.from.mock.results[i]?.value as MockChain | undefined
    return !chain || !hasCall(chain, 'update')
  })
}

const mockedCreateClient = vi.mocked(createClient)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleCardConfig - E13 desde el chat', () => {
  it('editar el ciclo de la tarjeta NO mueve ninguna transaccion existente', async () => {
    // handleCardConfig re-fechaba las cuotas futuras desde purchase_date del plan y
    // corría el día de las compras simples "dentro del mismo mes". Con la pertenencia
    // a un resumen ya persistida en cycle_id, eso es justo lo que no puede pasar: le
    // movería las cuotas cada vez que el usuario copia el día real del resumen.
    const methodChain = createChain({ data: { id: 'pm-1', name: 'Visa' } })
    const updateConfigChain = createChain({ error: null })
    // Si el código viejo sigue vivo, esta chain (transactions → futureTxns) va a
    // encontrar una compra simple futura y disparar un update sobre ella.
    const futureTxnsChain = createChain({
      data: [{ id: 'tx-1', date: '2026-10-04', installment_plan_id: null, description: 'Compra simple' }],
      error: null,
    })
    const simpleUpdateChain = createChain({ error: null })

    const chains = [methodChain, updateConfigChain, futureTxnsChain, simpleUpdateChain]
    const supabase = createSupabaseMock(chains)
    mockedCreateClient.mockResolvedValueOnce(supabase as never)

    const result = await handleCardConfig({ paymentMethodName: 'Visa', closingDay: 27, paymentDay: 4 }, 'u1')

    expect(result.success).toBe(true)
    expect(noTransactionsUpdateCalls(supabase)).toBe(true)
  })

  it('actualiza los días de cierre/vencimiento y el mensaje aclara que los movimientos ya cargados no se mueven', async () => {
    const methodChain = createChain({ data: { id: 'pm-1', name: 'Visa' } })
    const updateConfigChain = createChain({ error: null })
    const supabase = createSupabaseMock([methodChain, updateConfigChain])
    mockedCreateClient.mockResolvedValueOnce(supabase as never)

    const result = await handleCardConfig({ paymentMethodName: 'Visa', closingDay: 27, paymentDay: 4 }, 'u1')

    expect(result.success).toBe(true)
    expect(hasCall(updateConfigChain, 'update', [{ default_closing_day: 27, default_payment_day: 4 }])).toBe(true)
    expect(hasCall(updateConfigChain, 'eq', ['id', 'pm-1'])).toBe(true)
    expect(hasCall(updateConfigChain, 'eq', ['user_id', 'u1'])).toBe(true)
    expect(result.message).toContain('no se movieron de resumen')
    // No debe haber quedado ninguna llamada extra a `transactions` (el bloque de
    // re-fechado desapareció entero, no sólo se quedó sin efecto).
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })
})
