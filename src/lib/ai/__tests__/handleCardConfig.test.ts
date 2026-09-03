import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleCardConfig } from '@/lib/ai/handlers'
import { createClient } from '@/utils/supabase/server'

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}))

// La escritura de los resumenes se mockea: aca se prueba que el handler la invoque
// (mismo patron que medios-pago/__tests__/update-realinea-ciclos.test.ts), no lo que
// escribe -- eso vive en lib/ciclos/__tests__/declarar.test.ts.
vi.mock('@/lib/ciclos/declarar', () => ({ realinearFuturos: vi.fn().mockResolvedValue(0) }))

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
  maybeSingle: () => Promise<ChainResult>
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
  chain.maybeSingle = () => {
    calls.push({ method: 'maybeSingle', args: [] })
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

import { realinearFuturos } from '@/lib/ciclos/declarar'

const mockedCreateClient = vi.mocked(createClient)
const realinearMock = vi.mocked(realinearFuturos)

/** La fila entera de la tarjeta, la que `realinearFuturos` necesita para regenerar. */
const FILA_TARJETA = {
  id: 'pm-1',
  user_id: 'u1',
  name: 'Visa',
  type: 'credit',
  default_closing_day: 27,
  default_payment_day: 4,
}

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

    // La relectura de la fila para el realineado va tercera: el orden de `from()`
    // es buscar la tarjeta, actualizarla, releerla.
    const releerChain = createChain({ data: FILA_TARJETA, error: null })
    const chains = [methodChain, updateConfigChain, releerChain, futureTxnsChain, simpleUpdateChain]
    const supabase = createSupabaseMock(chains)
    mockedCreateClient.mockResolvedValueOnce(supabase as never)

    const result = await handleCardConfig({ paymentMethodName: 'Visa', closingDay: 27, paymentDay: 4 }, 'u1')

    expect(result.success).toBe(true)
    expect(noTransactionsUpdateCalls(supabase)).toBe(true)
  })

  it('actualiza los días de cierre/vencimiento y el mensaje aclara que los movimientos ya cargados no se mueven', async () => {
    const methodChain = createChain({ data: { id: 'pm-1', name: 'Visa' } })
    const updateConfigChain = createChain({ error: null })
    const releerChain = createChain({ data: FILA_TARJETA, error: null })
    const supabase = createSupabaseMock([methodChain, updateConfigChain, releerChain])
    mockedCreateClient.mockResolvedValueOnce(supabase as never)

    const result = await handleCardConfig({ paymentMethodName: 'Visa', closingDay: 27, paymentDay: 4 }, 'u1')

    expect(result.success).toBe(true)
    expect(hasCall(updateConfigChain, 'update', [{ default_closing_day: 27, default_payment_day: 4 }])).toBe(true)
    expect(hasCall(updateConfigChain, 'eq', ['id', 'pm-1'])).toBe(true)
    expect(hasCall(updateConfigChain, 'eq', ['user_id', 'u1'])).toBe(true)
    expect(result.message).toContain('no se movieron de resumen')
    // Ninguna tabla fuera de `payment_methods`: el bloque de re-fechado de
    // transacciones desapareció entero, no sólo se quedó sin efecto.
    expect(supabase.from.mock.calls.map((c) => c[0])).toEqual([
      'payment_methods',
      'payment_methods',
      'payment_methods',
    ])
  })

  it('re-fecha los resúmenes futuros estimados, con la fila releída de la tarjeta', async () => {
    // La pantalla (updatePaymentMethod) ya lo hacía; el chat no, así que la misma frase
    // dicha por chat dejaba la tarjeta con días nuevos y sus resúmenes con los viejos.
    const methodChain = createChain({ data: { id: 'pm-1', name: 'Visa' } })
    const updateConfigChain = createChain({ error: null })
    const releerChain = createChain({ data: FILA_TARJETA, error: null })
    const supabase = createSupabaseMock([methodChain, updateConfigChain, releerChain])
    mockedCreateClient.mockResolvedValueOnce(supabase as never)

    const result = await handleCardConfig({ paymentMethodName: 'Visa', closingDay: 27, paymentDay: 4 }, 'u1')

    expect(result.success).toBe(true)
    expect(realinearMock).toHaveBeenCalledTimes(1)
    // La fila ENTERA, no el `{ id, name }` del lookup: recalcularFuturosGenerated lee
    // type y los dos días, y sin ellos se va sin hacer nada y en silencio.
    expect(realinearMock.mock.calls[0][1]).toEqual(FILA_TARJETA)
    // El re-fechado se pide sobre la fila propia, nunca sobre una tarjeta ajena.
    expect(hasCall(releerChain, 'eq', ['user_id', 'u1'])).toBe(true)
    // Y el mensaje ya no dice que esto sólo afecta a los resúmenes futuros por generar.
    expect(result.message).toContain('todavía no cerraron')
  })

  it('si el re-fechado falla, la tarjeta igual queda actualizada', async () => {
    // El medio ya se guardó: devolver error acá diría "no se guardó" y no sería cierto.
    const methodChain = createChain({ data: { id: 'pm-1', name: 'Visa' } })
    const updateConfigChain = createChain({ error: null })
    const releerChain = createChain({ data: FILA_TARJETA, error: null })
    const supabase = createSupabaseMock([methodChain, updateConfigChain, releerChain])
    mockedCreateClient.mockResolvedValueOnce(supabase as never)
    realinearMock.mockRejectedValueOnce(new Error('No pude actualizar un resumen futuro'))

    const result = await handleCardConfig({ paymentMethodName: 'Visa', closingDay: 27, paymentDay: 4 }, 'u1')

    expect(result.success).toBe(true)
  })
})
