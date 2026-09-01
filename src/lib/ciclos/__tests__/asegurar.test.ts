import { describe, it, expect } from 'vitest'
import { asegurarCiclos } from '../asegurar'
import type { PaymentMethod } from '@/types/database'

const visa = {
  id: 'visa', user_id: 'u1', name: 'Visa', type: 'credit',
  default_closing_day: 20, default_payment_day: 1,
} as PaymentMethod

/** Doble minimo del cliente: registra lo insertado y devuelve lo que se le siembra. */
function fakeSupabase(existentes: unknown[]) {
  const insertados: unknown[] = []
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: existentes, error: null }) }) }),
      upsert: (rows: unknown[]) => {
        insertados.push(...rows)
        return { select: () => Promise.resolve({ data: rows, error: null }) }
      },
    }),
  }
  return { client, insertados }
}

describe('asegurarCiclos', () => {
  it('inserta solo los meses que faltan', async () => {
    const existente = {
      id: 'ago', user_id: 'u1', payment_method_id: 'visa',
      closing_date: '2026-08-20', due_date: '2026-09-01',
      source: 'declared', created_at: '2026-01-01T00:00:00Z',
    }
    const { client, insertados } = fakeSupabase([existente])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble de test
    const r = await asegurarCiclos(client as any, visa, new Date(2026, 7, 1), new Date(2026, 9, 1))

    expect(insertados).toHaveLength(2) // septiembre y octubre; agosto ya estaba
    expect(r.map((c) => c.closing_date)).toEqual(['2026-08-20', '2026-09-20', '2026-10-20'])
  })

  it('no escribe nada si no falta ninguno', async () => {
    const todos = [
      { id: 'ago', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'generated', created_at: '2026-01-01T00:00:00Z' },
    ]
    const { client, insertados } = fakeSupabase(todos)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble de test
    await asegurarCiclos(client as any, visa, new Date(2026, 7, 1), new Date(2026, 7, 1))
    expect(insertados).toHaveLength(0)
  })

  it('una tarjeta sin ciclo configurado no genera nada', async () => {
    const { client, insertados } = fakeSupabase([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble de test
    const r = await asegurarCiclos(client as any, { ...visa, default_closing_day: null } as PaymentMethod, new Date(2026, 7, 1), new Date(2026, 9, 1))
    expect(insertados).toHaveLength(0)
    expect(r).toEqual([])
  })
})
