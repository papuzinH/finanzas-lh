/**
 * Motor agéntico de Chanchito (Task 14a).
 *
 * `runAgent` es un loop de function calling: le manda el mensaje (+ historial) al
 * modelo, y si el modelo pide ejecutar una tool, la corre contra el registro de
 * `tools/registry.ts` y le devuelve el resultado, repitiendo hasta que el modelo
 * conteste con texto (o hasta pisar alguno de los límites de seguridad de abajo).
 *
 * El modelo se inyecta vía la interface `AgentModel`: los tests usan un modelo
 * guionado (sin red) y la route real usa el adapter `createGeminiModel` de más
 * abajo, que envuelve `@google/genai`.
 *
 * Límites de seguridad:
 * - `MAX_STEPS`: como mucho 6 idas y vueltas con tools antes de forzar una
 *   respuesta final sin tools.
 * - `TOKEN_CEILING`: si el consumo acumulado de tokens supera este techo, el
 *   siguiente llamado ya se hace con `withTools: false` (no se espera a agotar
 *   los 6 pasos).
 * - Anti-bucle: si el modelo pide la MISMA tool con los MISMOS args dos veces,
 *   se corta ahí (nunca se re-ejecuta) y se fuerza el cierre.
 */

import { GoogleGenAI, type Content, type FunctionDeclaration } from '@google/genai'
import type { AgentContext } from './tools/types'
import { executeTool, getFunctionDeclarations } from './tools/registry'

export interface ModelTurn {
  functionCalls?: Array<{ name: string; args: Record<string, unknown> }>
  text?: string
  inputTokens: number
  outputTokens: number
}

export interface AgentModel {
  generate(opts: { contents: unknown[]; systemInstruction: string; withTools: boolean }): Promise<ModelTurn>
}

export interface AgentResult {
  message: string
  mutated: boolean
  inputTokens: number
  outputTokens: number
}

export interface AgentHistoryMessage {
  role: 'user' | 'chanchito'
  content: string
}

export interface RunAgentOpts {
  message: string
  history: AgentHistoryMessage[]
  ctx: AgentContext
  model: AgentModel // inyectable → tests sin red
  execute?: typeof executeTool // inyectable → tests
  systemInstruction: string // construido por buildAgentPrompt en la route (Task 14b)
}

export const MAX_STEPS = 6
export const TOKEN_CEILING = 50_000

/**
 * Reintentos ante un turno VACÍO (ni texto ni functionCalls). Gemini devuelve eso
 * cada tanto con `finishReason: STOP` y 0 tokens de salida: no es una respuesta,
 * es una falla transitoria que sale 200. Ver `THINKING_BUDGET`, que ataca la causa.
 */
export const MAX_EMPTY_RETRIES = 2

const FORCED_FINAL_MESSAGE =
  'No hagas más consultas: respondé ahora con la información que ya tenés, y si te faltó algo decilo honestamente.'

/** Un turno sin texto y sin tools no es una respuesta: la API no devolvió nada. */
function esVacio(turn: ModelTurn): boolean {
  return !turn.functionCalls?.length && !turn.text
}

/**
 * `model.generate` con reintento ante turnos vacíos, sumando los tokens de cada
 * intento — se facturaron igual, y el guard de costos tiene que verlos.
 */
async function generateConReintento(
  model: AgentModel,
  opts: { contents: unknown[]; systemInstruction: string; withTools: boolean },
): Promise<ModelTurn> {
  let inputTokens = 0
  let outputTokens = 0
  let turn: ModelTurn = { inputTokens: 0, outputTokens: 0 }

  for (let intento = 0; intento <= MAX_EMPTY_RETRIES; intento++) {
    turn = await model.generate(opts)
    inputTokens += turn.inputTokens
    outputTokens += turn.outputTokens
    if (!esVacio(turn)) break
  }

  return { ...turn, inputTokens, outputTokens }
}

export async function runAgent({
  message,
  history,
  ctx,
  model,
  execute = executeTool,
  systemInstruction,
}: RunAgentOpts): Promise<AgentResult> {
  const contents: unknown[] = [
    ...history.slice(-10).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ]

  let mutated = false
  let inputTokens = 0
  let outputTokens = 0
  const seenCalls = new Set<string>()

  for (let step = 0; step < MAX_STEPS; step++) {
    const overBudget = inputTokens + outputTokens > TOKEN_CEILING
    const turn = await generateConReintento(model, { contents, systemInstruction, withTools: !overBudget })
    inputTokens += turn.inputTokens
    outputTokens += turn.outputTokens

    if (!turn.functionCalls?.length || overBudget) {
      return { message: turn.text ?? 'No pude generar una respuesta, probá de nuevo.', mutated, inputTokens, outputTokens }
    }

    const call = turn.functionCalls[0]
    const key = `${call.name}:${JSON.stringify(call.args)}`
    if (seenCalls.has(key)) break // anti-bucle → cae al cierre forzado de abajo
    seenCalls.add(key)

    const result = await execute(call.name, call.args, ctx)
    if (result.ok && result.mutated) {
      mutated = true
      // El snapshot cacheado por loadFinanceData (si algún read tool ya lo pidió en
      // este mismo loop) quedó stale tras la escritura: se invalida para que las
      // próximas lecturas disparen una carga fresca.
      ctx._financeCache = undefined
    }

    contents.push({ role: 'model', parts: [{ functionCall: { name: call.name, args: call.args } }] })
    contents.push({
      role: 'user',
      parts: [{ functionResponse: { name: call.name, response: result as unknown as Record<string, unknown> } }],
    })
  }

  // Pasos agotados o anti-bucle: un último llamado sin tools, pidiéndole al modelo
  // que responda con lo que ya tiene en vez de intentar otra tool.
  contents.push({ role: 'user', parts: [{ text: FORCED_FINAL_MESSAGE }] })
  const final = await generateConReintento(model, { contents, systemInstruction, withTools: false })
  inputTokens += final.inputTokens
  outputTokens += final.outputTokens
  return { message: final.text ?? 'Me quedé sin pasos para resolver esto, ¿probamos de nuevo?', mutated, inputTokens, outputTokens }
}

/**
 * Adapter de `AgentModel` sobre el SDK `@google/genai`.
 *
 * Firmas verificadas contra `node_modules/@google/genai/dist/node/node.d.ts`
 * (Task 14a): `GoogleGenAI({ apiKey })`, `ai.models.generateContent({ model,
 * contents, config })`, `response.text`/`response.functionCalls`/
 * `response.usageMetadata.{promptTokenCount,candidatesTokenCount}` — todo matchea
 * el plan tal cual.
 *
 * Tools: las declarations van en `FunctionDeclaration.parametersJsonSchema`
 * (node.d.ts:4435), el campo oficial del SDK para JSON Schema estándar crudo —
 * exactamente lo que produce `zodToGeminiSchema` (Task 6). El propio SDK lo usa
 * así para tools MCP (dist/index.mjs:3643), o sea que no hay mismatch de tipos ni
 * hace falta castear. (`parameters`, en cambio, espera el `Schema` propio del SDK
 * con el enum `Type` en mayúsculas — es mutuamente excluyente con
 * `parametersJsonSchema`, no usarlos juntos.)
 *
 * Único cast restante: `contents` — nuestro loop lo tipa `unknown[]` a propósito
 * para no acoplar `agent.ts` (ni los tests) al SDK; acá se castea a `Content[]`.
 */
/**
 * Techo del razonamiento interno de Gemini 2.5 Flash.
 *
 * Sin techo (el default: presupuesto "dinámico") el modelo devuelve turnos VACÍOS
 * — `finishReason: STOP`, sin parts, 0 tokens de salida — y el chat contestaba el
 * fallback a toda consulta que necesitara una tool. Medido contra DEV el
 * 2026-08-27, mismo prompt y mismas 22 tools, 10 llamadas por fila:
 *
 *   dinámico (default) → 9/10 vacíos   |   1024 → 1/10
 *   512                → 0/10          |   0    → 0/20
 *
 * 512 es el punto elegido: sin vacíos y con razonamiento acotado, que el agente
 * necesita para elegir tool y armar args. Si vuelve a aparecer el síntoma, medir
 * de nuevo antes de mover este número — el reintento de `runAgent` es la red.
 */
export const THINKING_BUDGET = 512

export function createGeminiModel(apiKey: string): AgentModel {
  const ai = new GoogleGenAI({ apiKey })
  // El registro de tools es estático: las declarations se arman una sola vez.
  const functionDeclarations: FunctionDeclaration[] = getFunctionDeclarations().map((d) => ({
    name: d.name,
    description: d.description,
    parametersJsonSchema: d.parameters,
  }))
  return {
    async generate({ contents, systemInstruction, withTools }) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents as unknown as Content[],
        config: {
          systemInstruction,
          thinkingConfig: { thinkingBudget: THINKING_BUDGET },
          ...(withTools ? { tools: [{ functionDeclarations }] } : {}),
        },
      })
      return {
        functionCalls: response.functionCalls?.map((fc) => ({
          name: fc.name ?? '',
          args: (fc.args ?? {}) as Record<string, unknown>,
        })),
        text: response.text,
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      }
    },
  }
}
