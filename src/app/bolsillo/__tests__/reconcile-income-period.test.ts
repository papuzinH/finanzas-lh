/**
 * La conciliacion inserta INGRESOS reales (kind: 'income' no es un ajuste), y sin
 * income_period conciliar un dia 28 hacia aparecer al instante el banner de "cobros
 * sin imputar" preguntando a que mes cuenta una diferencia de $500. Un movimiento de
 * conciliacion pertenece al mes en que se detecto: no es ambiguo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type MethodRow = { id: string; type: string } | null

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  insert: vi.fn(),
  method: { data: null as MethodRow },
}))

vi.mock('@/utils/supabase/server', () => {
  type Chain = {
    select: () => Chain
    eq: () => Chain
    limit: () => Promise<{ data: { id: string }[] }>
    single: () => Promise<{ data: MethodRow }>
  }
  const chain: Chain = {
    select: () => chain,
    eq: () => chain,
    limit: async () => ({ data: [{ id: 'cat-ajuste' }] }),
    single: async () => m.method,
  }
  return {
    createClient: async () => ({
      auth: { getUser: m.getUser },
      from: (tabla: string) => (tabla === 'transactions' ? { insert: m.insert } : chain),
    }),
  }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { reconcileAccount } from '../actions'

const UID = '11111111-1111-4111-8111-111111111111'

function payload(): Record<string, unknown> {
  return m.insert.mock.calls[0][0] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  m.getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null })
  m.method.data = { id: 'pm-1', type: 'debit' }
  m.insert.mockResolvedValue({ error: null })
})

describe('reconcileAccount e income_period', () => {
  it('un ingreso de conciliacion cuenta para el mes de su propia fecha', async () => {
    const res = await reconcileAccount({
      payment_method_id: 'pm-1',
      difference: 500,
      date: '2026-08-28', // dentro del borde: sin income_period dispararia el banner
      classification: { kind: 'income', category_id: 'cat-1', description: 'Me devolvieron una plata' },
    })

    expect(res.success).toBe(true)
    expect(payload()).toMatchObject({
      type: 'income',
      income_period: '2026-08-01',
      is_balance_adjustment: false,
    })
  })

  it('un ajuste de saldo positivo tambien queda con su mes', async () => {
    const res = await reconcileAccount({
      payment_method_id: 'pm-1',
      difference: 500,
      date: '2026-08-28',
      classification: { kind: 'adjustment' },
    })

    expect(res.success).toBe(true)
    expect(payload()).toMatchObject({
      type: 'income',
      income_period: '2026-08-01',
      is_balance_adjustment: true,
    })
  })

  it('un gasto de conciliacion no lleva mes (el CHECK lo prohibe)', async () => {
    const res = await reconcileAccount({
      payment_method_id: 'pm-1',
      difference: -500,
      date: '2026-08-28',
      classification: { kind: 'expense', category_id: 'cat-1', description: 'Un cafe sin anotar' },
    })

    expect(res.success).toBe(true)
    expect(payload()).toMatchObject({ type: 'expense', income_period: null })
  })
})
