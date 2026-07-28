import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkAndIncrementUsage, accumulateBudget } from '../usageGuard'

/**
 * Estos tests blindan el invariante de seguridad de
 * `20260728_harden_chat_usage_rpcs.sql`: los RPC del guard están expuestos al
 * rol `authenticated`, así que la política (usuario, tier, límite diario,
 * presupuesto y precios) NO puede viajar como parámetro — la resuelve la DB.
 * Si alguien vuelve a mandarla desde el cliente, estos tests fallan.
 */

// Parámetros que jamás deben salir del cliente.
const PARAMS_DE_POLITICA = [
  'p_user_id',
  'p_daily_limit',
  'p_monthly_budget_usd',
  'p_input_price_per_1m',
  'p_output_price_per_1m',
]

function fakeSupabase(result: { data?: unknown; error?: unknown } = { data: 'ok', error: null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('checkAndIncrementUsage', () => {
  it('llama al RPC sin ningún parámetro de política', async () => {
    const { client, rpc } = fakeSupabase({ data: 'ok' })

    await checkAndIncrementUsage(client)

    expect(rpc).toHaveBeenCalledWith('check_and_increment_chat_usage')
    const args = rpc.mock.calls[0][1] ?? {}
    for (const param of PARAMS_DE_POLITICA) {
      expect(args).not.toHaveProperty(param)
    }
  })

  it('devuelve el estado que reporta la DB', async () => {
    const { client } = fakeSupabase({ data: 'user_limit_exceeded' })
    await expect(checkAndIncrementUsage(client)).resolves.toBe('user_limit_exceeded')
  })

  it('propaga el error para que la route decida (fail-open)', async () => {
    const { client } = fakeSupabase({ error: new Error('rpc caído') })
    await expect(checkAndIncrementUsage(client)).rejects.toThrow('rpc caído')
  })
})

describe('accumulateBudget', () => {
  it('manda solo los tokens, nunca los precios', async () => {
    const { client, rpc } = fakeSupabase({ data: null })

    await accumulateBudget(client, 1200, 800)

    expect(rpc).toHaveBeenCalledWith('accumulate_chat_budget', {
      p_input_tokens: 1200,
      p_output_tokens: 800,
    })
    const args = rpc.mock.calls[0][1] ?? {}
    for (const param of PARAMS_DE_POLITICA) {
      expect(args).not.toHaveProperty(param)
    }
  })

  it('no lanza si el RPC falla (el consumo no debe romper la respuesta)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeSupabase({ error: new Error('boom') })

    await expect(accumulateBudget(client, 10, 10)).resolves.toBeUndefined()

    spy.mockRestore()
  })
})
