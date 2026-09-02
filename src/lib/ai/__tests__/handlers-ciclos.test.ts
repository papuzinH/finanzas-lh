import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleTransaction, handleInstallment } from '@/lib/ai/handlers'
import { createClient } from '@/utils/supabase/server'
import { asegurarCiclos } from '@/lib/ciclos/asegurar'
import { calculateCreditPaymentDate, formatLocalDate, parseLocalDate } from '@/lib/utils/dates'
import { addMonths } from 'date-fns'
import type { CreditCardCycle } from '@/lib/finance/cycles'

// El chat tiene que resolver cycle_id/purchase_date con LAS MISMAS dos funciones que
// las server actions (Tasks 8/9: asegurarCiclos + cicloDeCompra/cicloNEsimo, ambas de
// lib/finance/cycles.ts, que acá se dejan reales — sólo se mockea la escritura).
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/ciclos/asegurar', () => ({
  asegurarCiclos: vi.fn(),
}))

// ============================================================
// Helpers de mock: mismo query builder encadenable que handleDelete.test.ts,
// extendido con `insert` (ninguno de los handlers hermanos lo necesitaba).
// ============================================================

type ChainResult = { data?: unknown; error?: unknown }
type RecordedCall = { method: string; args: unknown[] }

interface MockChain {
  __calls: RecordedCall[]
  select: (...args: unknown[]) => MockChain
  eq: (...args: unknown[]) => MockChain
  ilike: (...args: unknown[]) => MockChain
  limit: (...args: unknown[]) => MockChain
  insert: (...args: unknown[]) => MockChain
  single: () => Promise<ChainResult>
  then: (resolve: (v: ChainResult) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>
}

function createChain(result: ChainResult): MockChain {
  const calls: RecordedCall[] = []
  const chain = {} as MockChain
  const chainMethods = ['select', 'eq', 'ilike', 'limit', 'insert'] as const
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

function insertPayload(chain: MockChain): unknown {
  return chain.__calls.find((c) => c.method === 'insert')?.args[0]
}

function createSupabaseMock(chains: MockChain[]) {
  const from = vi.fn()
  for (const chain of chains) {
    from.mockImplementationOnce(() => chain)
  }
  return {
    from,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'auth-uuid-1' } } }),
    },
  }
}

const mockedCreateClient = vi.mocked(createClient)
const mockedAsegurarCiclos = vi.mocked(asegurarCiclos)

// Fixture de ciclos DESPAREJOS (regla del proyecto: nunca un corrimiento exacto de
// un mes, y distintos de los defaults de la tarjeta que arma cada test — closingDay
// 27 / paymentDay 4 —, para que la ruta "vino del ciclo" y la ruta
// "calculateCreditPaymentDate de fallback" sean observablemente distintas).
const CICLOS_FIXTURE: CreditCardCycle[] = [
  {
    id: 'cyc-jul',
    user_id: 'auth-uuid-1',
    payment_method_id: 'pm-1',
    closing_date: '2026-07-23',
    due_date: '2026-08-03',
    source: 'declared',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cyc-aug',
    user_id: 'auth-uuid-1',
    payment_method_id: 'pm-1',
    closing_date: '2026-08-20',
    due_date: '2026-09-01',
    source: 'declared',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cyc-sep',
    user_id: 'auth-uuid-1',
    payment_method_id: 'pm-1',
    closing_date: '2026-09-24',
    due_date: '2026-10-05',
    source: 'declared',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cyc-oct',
    user_id: 'auth-uuid-1',
    payment_method_id: 'pm-1',
    closing_date: '2026-10-29',
    due_date: '2026-11-10',
    source: 'declared',
    created_at: '2026-01-01T00:00:00Z',
  },
]

const VISA_ROW = {
  id: 'pm-1',
  user_id: 'u1',
  name: 'Visa',
  type: 'credit' as const,
  default_closing_day: 27,
  default_payment_day: 4,
  bucket: 'pocket' as const,
  initial_balance: 0,
  initial_balance_at: null,
  is_default: null,
  is_personal: null,
  created_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedAsegurarCiclos.mockResolvedValue(CICLOS_FIXTURE)
})

describe('handleTransaction - persiste cycle_id/purchase_date del ciclo (Task 8, misma regla que createTransaction)', () => {
  it('una compra con tarjeta de crédito inserta cycle_id del ciclo que contiene la fecha de compra, purchase_date = esa fecha y date = due_date del ciclo', async () => {
    const methodChain = createChain({ data: VISA_ROW })
    const categoryChain = createChain({ data: { type: 'expense' } })
    const insertChain = createChain({ error: null })
    const budgetChain = createChain({ data: null }) // checkBudgetAlert: sin presupuesto activo

    const supabase = createSupabaseMock([methodChain, categoryChain, insertChain, budgetChain])
    mockedCreateClient.mockResolvedValue(supabase as never)

    const result = await handleTransaction(
      {
        description: 'Compra en Visa',
        amount: 15000,
        type: 'expense',
        categoryId: 'cat-1',
        categoryName: 'Compras',
        paymentMethodName: 'Visa',
        date: '2026-08-05', // entre el cierre de jul (23) y el de ago (20) → cae en cyc-aug
        isReal: true,
      },
      'u1'
    )

    expect(result.success).toBe(true)

    const payload = insertPayload(insertChain) as Record<string, unknown>
    expect(payload.cycle_id).toBe('cyc-aug')
    expect(payload.purchase_date).toBe('2026-08-05')
    expect(payload.date).toBe('2026-09-01') // due_date de cyc-aug

    // Provenance: si viniera del fallback calculateCreditPaymentDate (sin ciclo)
    // con los defaults de la tarjeta (27/4), la fecha sería otra. La igualdad con
    // due_date confirma que la fecha salió del ciclo, no de una recomputación.
    expect(payload.date).not.toBe(calculateCreditPaymentDate('2026-08-05', 27, 4))

    // asegurarCiclos se llamó con la tarjeta completa (no el ResolvedPaymentMethod
    // reducido), como pide el brief.
    expect(mockedAsegurarCiclos).toHaveBeenCalledTimes(1)
    const [, methodArg] = mockedAsegurarCiclos.mock.calls[0]
    expect(methodArg).toMatchObject({ id: 'pm-1', default_closing_day: 27, default_payment_day: 4 })
  })

  it('un reintegro (income) con tarjeta tambien se imputa al resumen, con purchase_date null', async () => {
    // `refundsInCycle` (balances.ts) descuenta del resumen por cycle_id: un income
    // sin ciclo deja de restar y el "a pagar" queda inflado. Hay uno real en produccion.
    const methodChain = createChain({ data: VISA_ROW })
    const categoryChain = createChain({ data: { type: 'income' } })
    const insertChain = createChain({ error: null })

    const supabase = createSupabaseMock([methodChain, categoryChain, insertChain])
    mockedCreateClient.mockResolvedValue(supabase as never)

    const result = await handleTransaction(
      {
        description: 'Reintegro Visa',
        amount: 3000,
        type: 'income',
        categoryId: 'cat-2',
        categoryName: 'Reintegros',
        paymentMethodName: 'Visa',
        date: '2026-08-05', // entre el cierre de jul (23) y el de ago (20) → cyc-aug
        isReal: true,
      },
      'u1'
    )

    expect(result.success).toBe(true)

    const payload = insertPayload(insertChain) as Record<string, unknown>
    expect(payload.cycle_id).toBe('cyc-aug')
    expect(payload.purchase_date).toBeNull()
    expect(payload.date).toBe('2026-09-01') // due_date de cyc-aug
    expect(payload.date).not.toBe(calculateCreditPaymentDate('2026-08-05', 27, 4))
  })

  it('sin ciclo materializado en el rango, cae al fallback calculateCreditPaymentDate y no persiste cycle_id', async () => {
    mockedAsegurarCiclos.mockResolvedValue([]) // ningún ciclo cubre la compra

    const methodChain = createChain({ data: VISA_ROW })
    const categoryChain = createChain({ data: { type: 'expense' } })
    const insertChain = createChain({ error: null })
    const budgetChain = createChain({ data: null })

    const supabase = createSupabaseMock([methodChain, categoryChain, insertChain, budgetChain])
    mockedCreateClient.mockResolvedValue(supabase as never)

    const result = await handleTransaction(
      {
        description: 'Compra en Visa',
        amount: 8000,
        type: 'expense',
        categoryId: 'cat-1',
        categoryName: 'Compras',
        paymentMethodName: 'Visa',
        date: '2026-08-05',
        isReal: true,
      },
      'u1'
    )

    expect(result.success).toBe(true)

    const payload = insertPayload(insertChain) as Record<string, unknown>
    expect(payload.cycle_id).toBeNull()
    expect(payload.purchase_date).toBe('2026-08-05')
    expect(payload.date).toBe(calculateCreditPaymentDate('2026-08-05', 27, 4))
  })
})

describe('handleInstallment - la cuota i va al i-ésimo resumen (Task 9, misma regla que createInstallmentPlan)', () => {
  it('inserta N cuotas con cycle_id distintos consecutivos y date = due_date de cada ciclo', async () => {
    const methodChain = createChain({ data: VISA_ROW })
    const planChain = createChain({ data: { id: 'plan-1' }, error: null })
    const txInsertChain = createChain({ error: null })

    const supabase = createSupabaseMock([methodChain, planChain, txInsertChain])
    mockedCreateClient.mockResolvedValue(supabase as never)

    const result = await handleInstallment(
      {
        description: 'Notebook',
        amount: 1000,
        totalAmount: 3000,
        installmentsCount: 3,
        type: 'expense',
        categoryId: 'cat-1',
        categoryName: 'Tecnología',
        paymentMethodName: 'Visa',
        date: '2026-08-05', // cae en cyc-aug, igual que la compra simple de arriba
        isReal: true,
      },
      'u1'
    )

    expect(result.success).toBe(true)

    const payload = insertPayload(txInsertChain) as Array<Record<string, unknown>>
    expect(payload).toHaveLength(3)

    expect(payload[0].cycle_id).toBe('cyc-aug')
    expect(payload[0].date).toBe('2026-09-01')
    expect(payload[0].purchase_date).toBe('2026-08-05')

    expect(payload[1].cycle_id).toBe('cyc-sep')
    expect(payload[1].date).toBe('2026-10-05')
    expect(payload[1].purchase_date).toBe('2026-08-05')

    expect(payload[2].cycle_id).toBe('cyc-oct')
    expect(payload[2].date).toBe('2026-11-10')
    expect(payload[2].purchase_date).toBe('2026-08-05')

    // Provenance: la cuota 2 (i=1) NO cae en due_date + 1 mes calendario (el viejo
    // addMonths que este task reemplaza) — cyc-sep vence el 5, no el 1.
    expect(payload[1].date).not.toBe(
      formatLocalDate(addMonths(parseLocalDate(payload[0].date as string), 1))
    )
  })
})
