import type { AgentContext, ToolDef, ToolResult } from './types'
import { zodToGeminiSchema } from './schema'
import { readTools } from './readTools'
import { appHelpTool } from './appHelp'
import { writeTools } from './writeTools'

// Tasks 9-13 agregan sus tools a este array vía los spreads.
export const allTools: ToolDef[] = [...readTools, appHelpTool, ...writeTools]

/** Convierte tools a function declarations para Gemini. */
export function getFunctionDeclarations(tools: ToolDef[] = allTools) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: zodToGeminiSchema(t.schema),
  }))
}

/** Variante inyectable para tests; executeTool usa el registro global. */
export async function executeToolWith(
  tools: ToolDef[],
  name: string,
  rawArgs: unknown,
  ctx: AgentContext,
): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === name)
  if (!tool) return { ok: false, error: `Tool desconocida: ${name}` }

  const parsed = tool.schema.safeParse(rawArgs ?? {})
  if (!parsed.success) {
    return {
      ok: false,
      error: `Argumentos inválidos: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    }
  }

  try {
    return await tool.execute(parsed.data, ctx)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error inesperado en la tool',
    }
  }
}

/** Ejecuta una tool del registro global. */
export function executeTool(name: string, rawArgs: unknown, ctx: AgentContext) {
  return executeToolWith(allTools, name, rawArgs, ctx)
}
