import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { zodToGeminiSchema } from '@/lib/ai/tools/schema'
import { executeToolWith } from '@/lib/ai/tools/registry'
import type { ToolDef, AgentContext } from '@/lib/ai/tools/types'

const ctx = {} as AgentContext

const echoTool: ToolDef = {
  name: 'echo', description: 'test', kind: 'read',
  schema: z.object({ msg: z.string() }),
  execute: async (args) => ({ ok: true, data: args }),
}

describe('zodToGeminiSchema', () => {
  it('produce JSON Schema sin $schema ni additionalProperties', () => {
    const s = zodToGeminiSchema(z.object({ a: z.string().describe('la a'), b: z.number().optional() }))
    expect(s.$schema).toBeUndefined()
    expect(s.additionalProperties).toBeUndefined()
    expect(s.type).toBe('object')
    expect((s.properties as Record<string, { description?: string }>).a.description).toBe('la a')
    expect(s.required).toEqual(['a'])
  })
})

describe('executeToolWith', () => {
  it('valida args con Zod y ejecuta', async () => {
    const r = await executeToolWith([echoTool], 'echo', { msg: 'hola' }, ctx)
    expect(r).toEqual({ ok: true, data: { msg: 'hola' } })
  })
  it('args inválidos → error legible, nunca throw', async () => {
    const r = await executeToolWith([echoTool], 'echo', { msg: 42 }, ctx)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('msg')
  })
  it('tool inexistente → error', async () => {
    const r = await executeToolWith([echoTool], 'nope', {}, ctx)
    expect(r.ok).toBe(false)
  })
  it('excepción dentro de execute → capturada como error', async () => {
    const boom: ToolDef = { ...echoTool, name: 'boom', execute: async () => { throw new Error('db down') } }
    const r = await executeToolWith([boom], 'boom', { msg: 'x' }, ctx)
    expect(r).toEqual({ ok: false, error: 'db down' })
  })
})
