import { describe, it, expect, vi } from 'vitest'
import { runAgent, MAX_STEPS, TOKEN_CEILING, type AgentModel, type ModelTurn } from '@/lib/ai/agent'
import type { AgentContext } from '@/lib/ai/tools/types'

const ctx = {} as AgentContext
const systemInstruction = 'sos Chanchito'

/** Snapshot de los args con los que se llamó a `generate` en cada turno. */
interface RecordedCall {
  contents: unknown[]
  systemInstruction: string
  withTools: boolean
}

/**
 * Modelo guionado: devuelve `turns[i]` en el i-ésimo llamado (clampeado al último
 * turno si se piden más llamados de los guionados). Graba una copia superficial de
 * `contents` en cada llamado para poder inspeccionar cómo creció el historial call
 * a call (el array real se sigue mutando in-place por `runAgent`).
 */
function scripted(turns: ModelTurn[]): { model: AgentModel; calls: RecordedCall[] } {
  let i = 0
  const calls: RecordedCall[] = []
  const model: AgentModel = {
    async generate(opts) {
      calls.push({
        contents: [...opts.contents],
        systemInstruction: opts.systemInstruction,
        withTools: opts.withTools,
      })
      return turns[Math.min(i++, turns.length - 1)]
    },
  }
  return { model, calls }
}

const okTool = async () => ({ ok: true, data: { x: 1 } })

describe('runAgent', () => {
  it('texto directo en el primer turno → responde sin tools', async () => {
    const { model, calls } = scripted([{ text: 'Hola', inputTokens: 10, outputTokens: 5 }])

    const result = await runAgent({
      message: 'hola chanchito',
      history: [],
      ctx,
      model,
      execute: okTool,
      systemInstruction,
    })

    expect(result).toEqual({ message: 'Hola', mutated: false, inputTokens: 10, outputTokens: 5 })
    expect(calls).toHaveLength(1)
    expect(calls[0].withTools).toBe(true)
    expect(calls[0].systemInstruction).toBe(systemInstruction)
    // El primer contents incluye el mensaje del usuario (sin historial previo).
    expect(calls[0].contents).toEqual([{ role: 'user', parts: [{ text: 'hola chanchito' }] }])
  })

  it('respeta el historial reciente (rol chanchito → model) en el primer llamado', async () => {
    const { model, calls } = scripted([{ text: 'Listo', inputTokens: 1, outputTokens: 1 }])

    await runAgent({
      message: '¿y ahora?',
      history: [
        { role: 'user', content: 'cuánto gasté' },
        { role: 'chanchito', content: 'gastaste 1000' },
      ],
      ctx,
      model,
      execute: okTool,
      systemInstruction,
    })

    expect(calls[0].contents).toEqual([
      { role: 'user', parts: [{ text: 'cuánto gasté' }] },
      { role: 'model', parts: [{ text: 'gastaste 1000' }] },
      { role: 'user', parts: [{ text: '¿y ahora?' }] },
    ])
  })

  it('functionCall → ejecuta tool → segunda llamada con functionResponse → texto final', async () => {
    const execute = vi.fn(async () => ({ ok: true, data: { total: 42 } }))
    const { model, calls } = scripted([
      { functionCalls: [{ name: 'get_balance', args: { scope: 'mes' } }], inputTokens: 20, outputTokens: 3 },
      { text: 'Tenés $42.000', inputTokens: 15, outputTokens: 8 },
    ])

    const result = await runAgent({
      message: 'cuánto tengo',
      history: [],
      ctx,
      model,
      execute,
      systemInstruction,
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith('get_balance', { scope: 'mes' }, ctx)

    expect(result).toEqual({
      message: 'Tenés $42.000',
      mutated: false,
      inputTokens: 20 + 15,
      outputTokens: 3 + 8,
    })

    expect(calls).toHaveLength(2)
    // El primer llamado sólo tiene el mensaje del usuario.
    expect(calls[0].contents).toEqual([{ role: 'user', parts: [{ text: 'cuánto tengo' }] }])
    // El segundo llamado ya incluye el par functionCall/functionResponse.
    expect(calls[1].contents).toEqual([
      { role: 'user', parts: [{ text: 'cuánto tengo' }] },
      { role: 'model', parts: [{ functionCall: { name: 'get_balance', args: { scope: 'mes' } } }] },
      {
        role: 'user',
        parts: [{ functionResponse: { name: 'get_balance', response: { ok: true, data: { total: 42 } } } }],
      },
    ])
    expect(calls[1].withTools).toBe(true)
  })

  it('mutated true si una write tool devolvió mutated', async () => {
    const execute = vi.fn(async () => ({ ok: true, data: { id: 'tx-1' }, mutated: true }))
    const { model } = scripted([
      { functionCalls: [{ name: 'create_transaction', args: { amount: 100 } }], inputTokens: 5, outputTokens: 1 },
      { text: 'Listo, lo registré', inputTokens: 5, outputTokens: 2 },
    ])

    const result = await runAgent({
      message: 'gasté 100 en comida',
      history: [],
      ctx,
      model,
      execute,
      systemInstruction,
    })

    expect(result.mutated).toBe(true)
    expect(result.message).toBe('Listo, lo registré')
  })

  it('mutated se queda en false si la tool no mutó (ok true pero mutated ausente)', async () => {
    const { model } = scripted([
      { functionCalls: [{ name: 'get_balance', args: {} }], inputTokens: 5, outputTokens: 1 },
      { text: 'Tenés $10.000', inputTokens: 5, outputTokens: 2 },
    ])

    const result = await runAgent({
      message: 'cuánto tengo',
      history: [],
      ctx,
      model,
      execute: okTool,
      systemInstruction,
    })

    expect(result.mutated).toBe(false)
  })

  it('tope de 6 pasos: al 7mo turno con functionCall fuerza withTools=false y devuelve el texto', async () => {
    const execute = vi.fn(async () => ({ ok: true, data: {} }))
    const turns: ModelTurn[] = [0, 1, 2, 3, 4, 5].map((i) => ({
      functionCalls: [{ name: 'get_balance', args: { i } }],
      inputTokens: 100,
      outputTokens: 10,
    }))
    turns.push({ text: 'Me quedé sin pasos pero esto es lo que tengo', inputTokens: 50, outputTokens: 20 })

    const { model, calls } = scripted(turns)

    const result = await runAgent({
      message: 'hacé muchas consultas',
      history: [],
      ctx,
      model,
      execute,
      systemInstruction,
    })

    // 6 llamados dentro del loop (uno por MAX_STEPS) + 1 llamado final forzado.
    expect(calls).toHaveLength(MAX_STEPS + 1)
    expect(execute).toHaveBeenCalledTimes(MAX_STEPS)
    expect(calls[MAX_STEPS].withTools).toBe(false)
    // El mensaje forzado de cierre se agregó al historial antes del llamado final.
    const lastContents = calls[MAX_STEPS].contents
    const lastPart = (lastContents[lastContents.length - 1] as { role: string; parts: Array<{ text?: string }> })
    expect(lastPart.role).toBe('user')
    expect(lastPart.parts[0].text).toMatch(/no hagas más consultas/i)

    expect(result.message).toBe('Me quedé sin pasos pero esto es lo que tengo')
    const totalInput = 100 * 6 + 50
    const totalOutput = 10 * 6 + 20
    expect(result.inputTokens).toBe(totalInput)
    expect(result.outputTokens).toBe(totalOutput)
  })

  it('anti-bucle: misma tool con mismos args dos veces → corta y fuerza final', async () => {
    const execute = vi.fn(async () => ({ ok: true, data: {} }))
    const repeatedCall = { name: 'get_balance', args: { scope: 'mes' } }
    const { model, calls } = scripted([
      { functionCalls: [repeatedCall], inputTokens: 10, outputTokens: 1 },
      { functionCalls: [repeatedCall], inputTokens: 10, outputTokens: 1 },
      { text: 'Ya te lo dije: tenés $5.000', inputTokens: 5, outputTokens: 5 },
    ])

    const result = await runAgent({
      message: 'cuánto tengo, y de nuevo',
      history: [],
      ctx,
      model,
      execute,
      systemInstruction,
    })

    // La tool se ejecuta una sola vez: la repetición se detecta antes de re-ejecutar.
    expect(execute).toHaveBeenCalledTimes(1)
    // 2 llamados dentro del loop (el 2do detecta la repetición y corta) + 1 final forzado.
    expect(calls).toHaveLength(3)
    expect(calls[2].withTools).toBe(false)
    expect(result.message).toBe('Ya te lo dije: tenés $5.000')
    expect(result.inputTokens).toBe(10 + 10 + 5)
    expect(result.outputTokens).toBe(1 + 1 + 5)
  })

  it('techo de tokens: turnos con inputTokens enormes → corta antes de MAX_STEPS', async () => {
    const execute = vi.fn(async () => ({ ok: true, data: {} }))
    const { model, calls } = scripted([
      { functionCalls: [{ name: 'get_balance', args: {} }], inputTokens: TOKEN_CEILING + 10_000, outputTokens: 0 },
      { text: 'Con lo que tengo alcanza para responder', inputTokens: 100, outputTokens: 20 },
    ])

    const result = await runAgent({
      message: 'consulta cara',
      history: [],
      ctx,
      model,
      execute,
      systemInstruction,
    })

    // Sólo 2 llamados: el que superó el techo, y el siguiente (ya con withTools=false)
    // que corta apenas entra al loop, SIN pasar por el mensaje forzado de cierre de pasos
    // (si hubiera pasado por ahí habría un 3er llamado final).
    expect(calls).toHaveLength(2)
    expect(calls[1].withTools).toBe(false)
    expect(execute).toHaveBeenCalledTimes(1) // la tool del primer turno sí se ejecutó
    expect(result.message).toBe('Con lo que tengo alcanza para responder')
    expect(result.inputTokens).toBe(TOKEN_CEILING + 10_000 + 100)
    expect(result.outputTokens).toBe(0 + 20)

    // El corte por techo de tokens NO agrega el mensaje forzado "no hagas más consultas":
    // el 2do (y último) contents es sólo el mensaje original + el par functionCall/functionResponse.
    expect(calls[1].contents).toHaveLength(3)
    const allTexts = calls[1].contents.flatMap((c) => {
      const entry = c as { parts: Array<{ text?: string }> }
      return entry.parts.map((p) => p.text).filter((t): t is string => typeof t === 'string')
    })
    expect(allTexts.some((t) => /no hagas más consultas/i.test(t))).toBe(false)
  })

  it('tool con error → el functionResponse lleva { ok:false, error } y el loop sigue', async () => {
    const execute = vi.fn(async () => ({ ok: false, error: 'la categoría no existe' }))
    const { model, calls } = scripted([
      { functionCalls: [{ name: 'create_transaction', args: { category_id: 'no-existe' } }], inputTokens: 5, outputTokens: 1 },
      { text: 'No encontré esa categoría, ¿podés confirmarla?', inputTokens: 5, outputTokens: 2 },
    ])

    const result = await runAgent({
      message: 'gasté 100 en una categoría rara',
      history: [],
      ctx,
      model,
      execute,
      systemInstruction,
    })

    expect(result.message).toBe('No encontré esa categoría, ¿podés confirmarla?')
    expect(result.mutated).toBe(false)

    const functionResponsePart = calls[1].contents[2] as {
      role: string
      parts: Array<{ functionResponse: { name: string; response: { ok: boolean; error?: string } } }>
    }
    expect(functionResponsePart.parts[0].functionResponse.response).toEqual({
      ok: false,
      error: 'la categoría no existe',
    })
  })

  it('sin texto ni functionCalls en el turno final devuelve un mensaje de fallback', async () => {
    const { model } = scripted([{ inputTokens: 1, outputTokens: 1 }])

    const result = await runAgent({
      message: 'hola',
      history: [],
      ctx,
      model,
      execute: okTool,
      systemInstruction,
    })

    expect(result.message).toBe('No pude generar una respuesta, probá de nuevo.')
  })

  it('usa executeTool por default si no se inyecta execute', async () => {
    // No pasamos `execute`: runAgent debe caer al import real de executeTool.
    // Usamos una tool inexistente para no tocar red/DB y sólo verificar el wiring.
    const { model } = scripted([
      { functionCalls: [{ name: 'tool_que_no_existe', args: {} }], inputTokens: 1, outputTokens: 1 },
      { text: 'no pude hacer eso', inputTokens: 1, outputTokens: 1 },
    ])

    const result = await runAgent({
      message: 'probá algo raro',
      history: [],
      ctx,
      model,
      systemInstruction,
    })

    expect(result.message).toBe('no pude hacer eso')
  })
})
