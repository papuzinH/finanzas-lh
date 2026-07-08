import { z } from 'zod'

/**
 * Limpia recursivamente claves que Gemini no acepta en function declarations.
 *
 * OJO con `z.record(...)`: su schema de valores se serializa en `additionalProperties`,
 * que acá se borra — Gemini termina viendo el campo como objeto opaco sin tipos. Si una
 * tool usa z.record, compensá documentando forma y tipos permitidos en el `.describe()`
 * del campo (ej. `cambios` de update_entity en writeTools.ts).
 */
function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean)
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) {
      if (k === '$schema' || k === 'additionalProperties') continue
      out[k] = clean(v)
    }
    return out
  }
  return node
}

/** Convierte un schema Zod a JSON Schema compatible con Gemini function declarations. */
export function zodToGeminiSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return clean(z.toJSONSchema(schema)) as Record<string, unknown>
}
