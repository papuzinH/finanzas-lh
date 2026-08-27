/**
 * Auditoría 2026-08-26 (H3 + M2): la route del chat es el único lugar donde se
 * gasta plata de verdad (Gemini, plan pago). Tres reglas que este test fija:
 *
 * 1. Un mensaje sin tope de largo mandaba cientos de miles de tokens en un solo
 *    turno (el TOKEN_CEILING recién corta las tools, no el primer llamado).
 * 2. Si el guard de cuota falla, NO se llama a Gemini (fail-closed). Antes
 *    "dejaba pasar para no romper UX": sin base, sin límite.
 * 3. El presupuesto global se acumula con service_role, no con la sesión: la
 *    RPC `accumulate_chat_budget` dejó de ser ejecutable por `authenticated`
 *    (cualquier usuario podía "gastar" los USD 50 y apagar el chat para todos).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Fila = Record<string, unknown>

/** Builder mínimo: cualquier método encadena, `await` resuelve `{ data, error }`. */
function tabla(data: unknown) {
  const b: Record<string, unknown> = {}
  const resultado = { data, error: null }
  for (const m of ['select', 'eq', 'or', 'limit', 'order']) b[m] = () => b
  b.single = async () => resultado
  b.maybeSingle = async () => resultado
  b.then = (ok: (v: typeof resultado) => unknown) => Promise.resolve(resultado).then(ok)
  return b
}

// vi.mock se hoistea por encima de las const: los spies se declaran con vi.hoisted.
const { sesionRpc, adminRpc, runAgent } = vi.hoisted(() => ({ sesionRpc: vi.fn(), adminRpc: vi.fn(), runAgent: vi.fn() }))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'uid-1' } }, error: null }) },
    from: (t: string) => {
      const filas: Record<string, Fila | Fila[]> = {
        users: { id: 'uid-1', chat_tier: 'free', first_name: 'Emi' },
        categories: [],
        payment_methods: [],
      }
      return tabla(filas[t] ?? [])
    },
    rpc: sesionRpc,
  }),
}))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({ rpc: adminRpc }) }))
vi.mock('@/lib/ai/agent', () => ({ runAgent, createGeminiModel: () => ({}) }))
vi.mock('@/lib/ai/agentPrompt', () => ({ buildAgentPrompt: () => 'prompt' }))

import { POST } from '../route'

const req = (body: unknown) =>
  new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  sesionRpc.mockReset()
  adminRpc.mockReset()
  runAgent.mockReset()
  sesionRpc.mockImplementation(async (fn: string) => (fn === 'check_and_increment_chat_usage' ? { data: 'ok', error: null } : { data: null, error: null }))
  adminRpc.mockResolvedValue({ data: null, error: null })
  runAgent.mockResolvedValue({ message: 'hola', mutated: false, inputTokens: 100, outputTokens: 20 })
})

describe('POST /api/chat', () => {
  it('rechaza un mensaje de más de 2.000 caracteres con 400, sin llamar a Gemini', async () => {
    const res = await POST(req({ message: 'x'.repeat(2001) }) as never)
    expect(res.status).toBe(400)
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('si el guard de cuota falla, responde 503 y NO llama a Gemini (fail-closed)', async () => {
    sesionRpc.mockImplementation(async () => ({ data: null, error: { message: 'boom' } }))
    const res = await POST(req({ message: 'gasté 8 lucas en el chino' }) as never)
    expect(res.status).toBe(503)
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('acumula el presupuesto global con el admin client, nunca con la sesión', async () => {
    const res = await POST(req({ message: 'gasté 8 lucas en el chino' }) as never)
    expect(res.status).toBe(200)
    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(adminRpc).toHaveBeenCalledWith('accumulate_chat_budget', { p_input_tokens: 100, p_output_tokens: 20 })
    const llamadasSesion = sesionRpc.mock.calls.map((c) => c[0])
    expect(llamadasSesion).toContain('check_and_increment_chat_usage')
    expect(llamadasSesion).not.toContain('accumulate_chat_budget')
  })
})
