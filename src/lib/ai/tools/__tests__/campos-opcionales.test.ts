import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { writeTools } from '@/lib/ai/tools/writeTools'
import { executeToolWith } from '@/lib/ai/tools/registry'
import { handleGoalContribution, handleTransaction, handleCreateGoal } from '@/lib/ai/handlers'
import type { AgentContext } from '@/lib/ai/tools/types'
import type { ChatResponse } from '@/lib/ai/handlers'

vi.mock('@/lib/ai/handlers', () => ({
  handleTransaction: vi.fn(),
  handleInstallment: vi.fn(),
  handleSubscription: vi.fn(),
  handleCardConfig: vi.fn(),
  handleEdit: vi.fn(),
  handleDelete: vi.fn(),
  handleCreateGoal: vi.fn(),
  handleCreateBudget: vi.fn(),
  handleEditGoal: vi.fn(),
  handleDeleteGoal: vi.fn(),
  handleGoalContribution: vi.fn(),
}))

const ctx = { authUserId: 'u1' } as AgentContext
const ok: ChatResponse = { success: true, message: 'listo' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(handleGoalContribution).mockResolvedValue(ok)
  vi.mocked(handleTransaction).mockResolvedValue(ok)
  vi.mocked(handleCreateGoal).mockResolvedValue(ok)
})

/**
 * El 2026-09-01 una usuaria vio en el chat: "nota: Invalid input: expected string,
 * received undefined". `contributeToGoalSchema.nota` era `z.string().nullable()` sin
 * `.optional()` y sin `describe`, asi que Gemini lo omitia, `undefined` no pasaba el
 * `nullable`, y el mensaje crudo de Zod salia por pantalla.
 *
 * Son dos defectos: el schema, y el contrato de errores -- un "Argumentos invalidos"
 * es error DEL MODELO, no del usuario.
 */
describe('campos que el modelo puede omitir', () => {
  it('contribute_to_goal acepta que no venga la nota', async () => {
    const r = await executeToolWith(writeTools, 'contribute_to_goal', {
      busqueda: 'Viaje', monto: 5000, moneda: 'ARS', fecha: '2026-09-04',
    }, ctx)

    expect(r.ok).toBe(true)
    expect(handleGoalContribution).toHaveBeenCalled()
  })

  it('create_transaction acepta que no vengan categoria ni medio', async () => {
    const r = await executeToolWith(writeTools, 'create_transaction', {
      descripcion: 'Cafe', monto: 3000, tipo: 'expense', fecha: '2026-09-04',
    }, ctx)

    expect(r.ok).toBe(true)
  })

  it('create_goal acepta que no venga la fecha objetivo', async () => {
    const r = await executeToolWith(writeTools, 'create_goal', {
      nombre: 'Viaje', tipo: 'monthly', monto_objetivo: 100000, moneda: 'ARS',
    }, ctx)

    expect(r.ok).toBe(true)
  })

  /**
   * Guard del barrido: si un campo admite `null`, tiene que admitir que lo omitan.
   * Un modelo que "no sabe" un dato lo omite tan seguido como lo manda en null, y la
   * diferencia entre las dos cosas no le importa a ningun handler de este repo.
   */
  it('ningun campo nullable de writeTools exige estar presente', () => {
    const infractores: string[] = []

    for (const tool of writeTools) {
      const shape = (tool.schema as z.ZodObject<z.ZodRawShape>).shape
      if (!shape) continue
      for (const [campo, def] of Object.entries(shape) as [string, z.ZodType][]) {
        const aceptaNull = def.safeParse(null).success
        const aceptaOmision = def.safeParse(undefined).success
        if (aceptaNull && !aceptaOmision) infractores.push(`${tool.name}.${campo}`)
      }
    }

    expect(infractores).toEqual([])
  })
})

describe('contrato de errores de validacion', () => {
  it('un error de argumentos se le devuelve al modelo para que corrija, no al usuario', async () => {
    const r = await executeToolWith(writeTools, 'contribute_to_goal', {
      busqueda: 'Viaje', // falta monto, que si es obligatorio de verdad
      fecha: '2026-09-04',
    }, ctx)

    expect(r.ok).toBe(false)
    // Sigue nombrando el campo: el modelo necesita saber que arreglar.
    expect(r.error).toContain('monto')
    // Y lleva la instruccion de corregir sin mostrarlo, que es lo que faltaba:
    // la regla 2 del prompt ("si una tool falla, decisela al usuario") hacia que
    // el modelo transcribiera el mensaje de Zod tal cual, en ingles.
    expect(r.error?.toLowerCase()).toContain('no se lo muestres al usuario')
  })
})
