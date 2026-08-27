/**
 * Gemini 2.5 Flash devuelve, cada tanto, un candidato VACÍO: `finishReason: STOP`,
 * sin parts y con cero tokens de salida. No es un error — la llamada sale 200.
 *
 * El loop lo leía como «el modelo terminó sin pedir tools» y contestaba con el
 * fallback, así que toda consulta que necesitara una tool moría ahí. Medido el
 * 2026-08-27 contra DEV con el prompt real de un usuario con datos: 9 de cada 10
 * turnos vacíos con el thinking en su presupuesto dinámico (el default), 0 de 10
 * con un techo explícito de 512. De ahí las dos mitades del arreglo: el techo en
 * `createGeminiModel` y este reintento como red para el resto.
 */
import { describe, it, expect, vi } from 'vitest'
import { runAgent, MAX_EMPTY_RETRIES, type AgentModel, type ModelTurn } from '@/lib/ai/agent'
import type { AgentContext } from '@/lib/ai/tools/types'

const ctx = {} as AgentContext
const systemInstruction = 'sos Chanchito'
const okTool = async () => ({ ok: true, data: { x: 1 } })

/** Un turno vacío como el que devuelve la API: ni texto ni functionCalls. */
const VACIO: ModelTurn = { inputTokens: 4704, outputTokens: 0 }

function scripted(turns: ModelTurn[]): { model: AgentModel; llamados: number } {
  const estado = { llamados: 0 }
  const model: AgentModel = {
    async generate() {
      const t = turns[Math.min(estado.llamados, turns.length - 1)]
      estado.llamados++
      return t
    },
  }
  return {
    model,
    get llamados() {
      return estado.llamados
    },
  }
}

describe('turnos vacíos de la API', () => {
  it('reintenta el turno vacío en vez de darlo por respuesta final', async () => {
    const s = scripted([VACIO, { text: 'Tenés $1.581.702 disponibles.', inputTokens: 4704, outputTokens: 20 }])

    const result = await runAgent({ message: '¿cuánto tengo?', history: [], ctx, model: s.model, execute: okTool, systemInstruction })

    expect(result.message).toBe('Tenés $1.581.702 disponibles.')
    expect(s.llamados).toBe(2)
  })

  it('reintenta también cuando lo que viene tras el vacío es una tool', async () => {
    const s = scripted([
      VACIO,
      { functionCalls: [{ name: 'get_balance_snapshot', args: {} }], inputTokens: 4704, outputTokens: 12 },
      { text: 'Tenés $1.581.702 disponibles.', inputTokens: 4800, outputTokens: 20 },
    ])

    const result = await runAgent({ message: '¿cuánto tengo?', history: [], ctx, model: s.model, execute: okTool, systemInstruction })

    expect(result.message).toBe('Tenés $1.581.702 disponibles.')
    expect(s.llamados).toBe(3)
  })

  it('suma los tokens de los intentos vacíos: se pagaron igual', async () => {
    const s = scripted([VACIO, { text: 'Listo', inputTokens: 4704, outputTokens: 20 }])

    const result = await runAgent({ message: '¿cuánto tengo?', history: [], ctx, model: s.model, execute: okTool, systemInstruction })

    expect(result.inputTokens).toBe(4704 * 2)
    expect(result.outputTokens).toBe(20)
  })

  it('si el vacío no se corta nunca, deja de insistir y lo dice', async () => {
    const s = scripted([VACIO])

    const result = await runAgent({ message: '¿cuánto tengo?', history: [], ctx, model: s.model, execute: okTool, systemInstruction })

    expect(result.message).toBe('No pude generar una respuesta, probá de nuevo.')
    expect(s.llamados).toBe(1 + MAX_EMPTY_RETRIES)
  })

  it('un turno con texto NO se reintenta: es una respuesta legítima', async () => {
    const s = scripted([{ text: 'Hola', inputTokens: 10, outputTokens: 5 }])

    const result = await runAgent({ message: 'hola', history: [], ctx, model: s.model, execute: okTool, systemInstruction })

    expect(result.message).toBe('Hola')
    expect(s.llamados).toBe(1)
  })
})

describe('createGeminiModel: techo del thinking', () => {
  it('le pone un presupuesto explícito al thinking, que es lo que evita los turnos vacíos', async () => {
    const generateContent = vi.fn(async () => ({ text: 'ok', functionCalls: [], usageMetadata: {} }))
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        models = { generateContent }
      },
    }))
    vi.resetModules()
    const { createGeminiModel, THINKING_BUDGET } = await import('@/lib/ai/agent')

    await createGeminiModel('una-key').generate({ contents: [], systemInstruction, withTools: true })

    expect(THINKING_BUDGET).toBeGreaterThan(0)
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ thinkingConfig: { thinkingBudget: THINKING_BUDGET } }),
      }),
    )
    vi.doUnmock('@google/genai')
  })
})
