import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadFinanceData, fetchDolarBlue } from '@/lib/ai/tools/dataLoader'
import type { AgentContext } from '@/lib/ai/tools/types'
import type {
  Transaction,
  PaymentMethod,
  RecurringPlan,
  InternalTransfer,
  Category,
  InstallmentPlan,
  ExchangeRate,
} from '@/types/database'

const USER_ID = 42
const AUTH_USER_ID = 'auth-uuid-123'

/** Builder encadenable mínimo: cada método devuelve el mismo objeto y es un thenable. */
function makeTable(data: unknown[]) {
  const builder: {
    select: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    or: ReturnType<typeof vi.fn>
    order: ReturnType<typeof vi.fn>
    then: (resolve: (v: { data: unknown; error: null }) => void) => void
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (resolve) => resolve({ data, error: null }),
  }
  return builder
}

function makeSupabase(tables: Record<string, unknown[]>) {
  const from = vi.fn((table: string) => makeTable(tables[table] ?? []))
  return { from } as unknown as AgentContext['supabase'] & { from: typeof from }
}

/** Builder encadenable que resuelve con `.error` seteado, para probar la propagación. */
function makeErrorTable(message: string) {
  const builder: {
    select: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    or: ReturnType<typeof vi.fn>
    order: ReturnType<typeof vi.fn>
    then: (resolve: (v: { data: null; error: { message: string } }) => void) => void
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (resolve) => resolve({ data: null, error: { message } }),
  }
  return builder
}

/** Mismo mock que `makeSupabase`, pero la tabla `errorTable` devuelve `.error`. */
function makeSupabaseWithError(tables: Record<string, unknown[]>, errorTable: string, message: string) {
  const from = vi.fn((table: string) =>
    table === errorTable ? makeErrorTable(message) : makeTable(tables[table] ?? [])
  )
  return { from } as unknown as AgentContext['supabase'] & { from: typeof from }
}

const visa = {
  id: 1,
  user_id: USER_ID,
  name: 'Visa',
  type: 'credit',
  default_closing_day: 20,
  default_payment_day: 10,
  created_at: '2026-01-01',
} as PaymentMethod

const tx = {
  id: 1,
  user_id: USER_ID,
  description: 'Compra',
  category_id: null,
  amount: 5000,
  date: '2026-07-08', // paymentDay(10) < closingDay(20) y day(8) <= 10+2 → retrocede un mes
  type: 'expense',
  installment_plan_id: null,
  recurring_plan_id: null,
  created_at: '2026-07-08',
  payment_method_id: 1,
  original_currency: 'ARS',
  original_amount: null,
  rate_pair: null,
  exchange_rate: null,
  card_payment_for: null,
} as Transaction

const netflix = {
  id: 1,
  user_id: USER_ID,
  description: 'Netflix',
  amount: 0,
  currency: 'USD',
  frequency: 'monthly',
  is_active: true,
  category_id: null,
  created_at: '2026-01-01',
  payment_method_id: null,
  original_amount: 10,
  rate_pair: null,
  exchange_rate: 900, // sin exchange_rates ni blue → cae al snapshot
} as unknown as RecurringPlan

const transfer = {
  id: 't1',
  user_id: AUTH_USER_ID,
  amount: 1000,
  currency: 'ARS',
  period_date: '2026-07-01',
  real_transfer_date: '2026-07-01',
  transfer_type: 'manual',
  description: null,
  created_at: '2026-07-01',
} as InternalTransfer

const category = {
  id: 'c1',
  user_id: AUTH_USER_ID,
  name: 'Comida',
  description: null,
  emoji: '🍔',
  is_system: false,
  type: 'expense',
  created_at: '2026-01-01',
} as Category

const installment = {
  id: 1,
  user_id: USER_ID,
  description: 'Notebook',
  total_amount: 300000,
  installments_count: 6,
  purchase_date: '2026-06-01',
  category_id: null,
  created_at: '2026-06-01',
  payment_method_id: 1,
} as InstallmentPlan

function ctxWithTables(tables: Record<string, unknown[]>): AgentContext {
  return {
    supabase: makeSupabase(tables),
    userId: USER_ID,
    authUserId: AUTH_USER_ID,
    today: '2026-07-08',
  }
}

const allTables = {
  transactions: [tx],
  payment_methods: [visa],
  recurring_plans: [netflix],
  internal_transfers: [transfer],
  categories: [category],
  installment_plans: [installment],
  exchange_rates: [] as ExchangeRate[],
}

describe('loadFinanceData', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('devuelve transacciones procesadas por el mismo pipeline que el store (periodDate calculado)', async () => {
    const ctx = ctxWithTables(allTables)
    const result = await loadFinanceData(ctx)

    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].periodDate).toBe('2026-06-08')
    expect(result.transactions[0].realPaymentDate).toBe('2026-07-08')
  })

  it('normaliza planes recurrentes en USD a ARS con el mismo pipeline', async () => {
    const ctx = ctxWithTables(allTables)
    const result = await loadFinanceData(ctx)

    expect(result.recurringPlans).toHaveLength(1)
    expect(result.recurringPlans[0].amount).toBe(9000) // 10 * 900 (fallback exchange_rate)
  })

  it('pasa el resto de las tablas sin transformar', async () => {
    const ctx = ctxWithTables(allTables)
    const result = await loadFinanceData(ctx)

    expect(result.paymentMethods).toEqual([visa])
    expect(result.internalTransfers).toEqual([transfer])
    expect(result.categories).toEqual([category])
    expect(result.installmentPlans).toEqual([installment])
  })

  it('filtra transactions/payment_methods/recurring_plans/installment_plans por el user_id numérico', async () => {
    const tables = makeSupabase(allTables)
    const ctx: AgentContext = {
      supabase: tables,
      userId: USER_ID,
      authUserId: AUTH_USER_ID,
      today: '2026-07-08',
    }
    await loadFinanceData(ctx)

    const calls = (tables.from as unknown as ReturnType<typeof vi.fn>).mock.results
    // Cada from() devuelve el builder encadenable; verificamos que eq('user_id', USER_ID) se haya invocado
    // reconstruyendo la secuencia de llamadas por tabla.
    const fromCalls = (tables.from as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(fromCalls).toEqual(
      expect.arrayContaining(['transactions', 'payment_methods', 'recurring_plans', 'installment_plans'])
    )
    fromCalls.forEach((table, i) => {
      if (['transactions', 'payment_methods', 'recurring_plans', 'installment_plans'].includes(table)) {
        const builder = calls[i].value
        expect(builder.eq).toHaveBeenCalledWith('user_id', USER_ID)
      }
    })
  })

  it('filtra internal_transfers por el UUID de auth (columna user_id es UUID, no numérica)', async () => {
    const tables = makeSupabase(allTables)
    const ctx: AgentContext = {
      supabase: tables,
      userId: USER_ID,
      authUserId: AUTH_USER_ID,
      today: '2026-07-08',
    }
    await loadFinanceData(ctx)

    const fromMock = tables.from as unknown as ReturnType<typeof vi.fn>
    const idx = fromMock.mock.calls.findIndex((c) => c[0] === 'internal_transfers')
    const builder = fromMock.mock.results[idx].value
    expect(builder.eq).toHaveBeenCalledWith('user_id', AUTH_USER_ID)
  })

  it('filtra categories con el UUID de auth vía or(user_id.eq,is_system.eq) — igual que route.ts/fetchAllData', async () => {
    const tables = makeSupabase(allTables)
    const ctx: AgentContext = {
      supabase: tables,
      userId: USER_ID,
      authUserId: AUTH_USER_ID,
      today: '2026-07-08',
    }
    await loadFinanceData(ctx)

    const fromMock = tables.from as unknown as ReturnType<typeof vi.fn>
    const idx = fromMock.mock.calls.findIndex((c) => c[0] === 'categories')
    const builder = fromMock.mock.results[idx].value
    expect(builder.or).toHaveBeenCalledWith(`user_id.eq.${AUTH_USER_ID},is_system.eq.true`)
  })

  it('cuando fetch del dólar blue rechaza, igual resuelve usando el snapshot exchange_rate', async () => {
    const ctx = ctxWithTables(allTables)
    const result = await loadFinanceData(ctx)
    // Si dolarBlue no fuera null, el fallback de 900 usado arriba no aplicaría igual
    // (dolarBlue tiene prioridad sobre el fallback). Este test ya lo cubre indirectamente
    // pero lo hacemos explícito llamando fetchDolarBlue por separado abajo.
    expect(result.recurringPlans[0].amount).toBe(9000)
  })
})

describe('loadFinanceData - propaga errores de PostgREST (no los traga con `?? []`)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('si transactions trae .error, lanza con el nombre de la tabla y el mensaje original', async () => {
    const supabase = makeSupabaseWithError(allTables, 'transactions', 'permission denied for table transactions')
    const ctx: AgentContext = { supabase, userId: USER_ID, authUserId: AUTH_USER_ID, today: '2026-07-08' }

    await expect(loadFinanceData(ctx)).rejects.toThrow(
      'No pude leer tus datos (transactions): permission denied for table transactions'
    )
  })

  it.each([
    'payment_methods',
    'recurring_plans',
    'internal_transfers',
    'categories',
    'installment_plans',
    'exchange_rates',
  ])('también lanza si %s trae .error', async (table) => {
    const supabase = makeSupabaseWithError(allTables, table, 'boom')
    const ctx: AgentContext = { supabase, userId: USER_ID, authUserId: AUTH_USER_ID, today: '2026-07-08' }

    await expect(loadFinanceData(ctx)).rejects.toThrow(new RegExp(`No pude leer tus datos \\(${table}\\): boom`))
  })

  it('fetchDolarBlue NO se chequea por error: un rechazo de fetch sigue degradando a null sin tirar', async () => {
    // Ya lo cubre el resto de los tests (fetch mockeado para rechazar en el beforeEach
    // de este describe), pero lo hacemos explícito: si dolarBlue tuviera un chequeo de
    // error igual que las tablas, este loadFinanceData exitoso fallaría.
    const ctx = ctxWithTables(allTables)
    await expect(loadFinanceData(ctx)).resolves.toBeDefined()
  })
})

describe('loadFinanceData - memoiza el snapshot en ctx._financeCache (cache de promesa por request)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('llamadas concurrentes con el mismo ctx comparten UNA sola ronda de queries', async () => {
    const ctx = ctxWithTables(allTables)
    const fromSpy = ctx.supabase.from as unknown as ReturnType<typeof vi.fn>

    const [a, b] = await Promise.all([loadFinanceData(ctx), loadFinanceData(ctx)])

    expect(a).toBe(b) // mismo objeto: ambas llamadas resolvieron la MISMA promesa cacheada
    expect(fromSpy).toHaveBeenCalledTimes(7) // 7 tablas × 1 sola ronda, no 14
  })

  it('llamadas secuenciales con el mismo ctx también reutilizan el cache', async () => {
    const ctx = ctxWithTables(allTables)
    const fromSpy = ctx.supabase.from as unknown as ReturnType<typeof vi.fn>

    await loadFinanceData(ctx)
    await loadFinanceData(ctx)

    expect(fromSpy).toHaveBeenCalledTimes(7)
  })

  it('un ctx nuevo (o con el cache invalidado) dispara una ronda de queries propia', async () => {
    const ctx1 = ctxWithTables(allTables)
    const ctx2 = ctxWithTables(allTables)

    await loadFinanceData(ctx1)
    await loadFinanceData(ctx2)

    expect(ctx1.supabase.from as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(7)
    expect(ctx2.supabase.from as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(7)

    // Invalidar el cache (como hace runAgent tras una write mutada) fuerza una segunda
    // ronda sobre el MISMO ctx.
    ctx1._financeCache = undefined
    await loadFinanceData(ctx1)
    expect(ctx1.supabase.from as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(14)
  })
})

describe('fetchDolarBlue', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('devuelve null si fetch rechaza (timeout u otro error de red)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    const result = await fetchDolarBlue()
    expect(result).toBeNull()
  })

  it('devuelve null si la respuesta no es ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const result = await fetchDolarBlue()
    expect(result).toBeNull()
  })

  it('devuelve el DolarBlue parseado si la respuesta es ok', async () => {
    const payload = { compra: 1200, venta: 1250, fechaActualizacion: '2026-07-08T00:00:00Z' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => payload })
    )
    const result = await fetchDolarBlue()
    expect(result).toEqual(payload)
  })

  it('llama a dolarapi.com/v1/dolares/blue con un timeout de 2s', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ compra: 1, venta: 1, fechaActualizacion: '' }) })
    vi.stubGlobal('fetch', fetchMock)
    await fetchDolarBlue()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://dolarapi.com/v1/dolares/blue',
      expect.objectContaining({ signal: expect.any(Object) })
    )
  })
})
