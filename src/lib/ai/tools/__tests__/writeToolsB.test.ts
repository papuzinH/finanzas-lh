import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeTools } from '@/lib/ai/tools/writeTools'
import { executeToolWith } from '@/lib/ai/tools/registry'
import {
  handleEdit,
  handleDelete,
  handleCreateGoal,
  handleCreateBudget,
  handleEditGoal,
  handleDeleteGoal,
  handleGoalContribution,
} from '@/lib/ai/handlers'
import type { AgentContext } from '@/lib/ai/tools/types'
import type { ChatResponse } from '@/lib/ai/handlers'

// `writeTools.ts` importa TODOS estos handlers desde el mismo módulo (Tasks 11 y 13),
// así que hay que mockearlos todos acá aunque este archivo solo ejercite las 6 tools
// nuevas: si no, las tools de Task 11 (create_transaction, etc.) intentarían llamar a
// las implementaciones reales al cargar el módulo mockeado a medias.
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

// --- Mock de supabase encadenable, usado solo por create_budget (resuelve el nombre
// de la categoría por id vía select().eq().eq().maybeSingle()).
type TableFixture = { category?: { name: string; emoji: string | null } | null }

function createSupabaseMock(tables: Record<string, TableFixture>) {
  const from = (table: string) => {
    const fixture = tables[table] ?? {}
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: fixture.category ?? null, error: null }),
    }
    return chain
  }
  return { from } as unknown as AgentContext['supabase']
}

const ctx: AgentContext = {
  supabase: {} as AgentContext['supabase'],
  userId: '1',
  authUserId: 'uuid-1',
  today: '2026-07-08',
}

function ok(message = 'listo'): ChatResponse {
  return { success: true, message }
}

function fail(message = 'error'): ChatResponse {
  return { success: false, message }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('update_entity', () => {
  it('entidad transaccion/medio_pago/categoria/suscripcion/cuota → handleEdit(data, ctx.userId)', async () => {
    vi.mocked(handleEdit).mockResolvedValue(ok('✅ Transacción actualizada'))

    const res = await executeToolWith(
      writeTools,
      'update_entity',
      { entidad: 'transaccion', busqueda: 'Café', cambios: { amount: 3000 } },
      ctx,
    )

    expect(handleEdit).toHaveBeenCalledWith(
      { entity: 'transaccion', search: 'Café', changes: { amount: 3000 } },
      ctx.userId,
    )
    expect(handleEditGoal).not.toHaveBeenCalled()
    expect(res).toEqual({ ok: true, data: { mensaje: '✅ Transacción actualizada' }, mutated: true })
  })

  it('entidad objetivo → rutea a handleEditGoal(data) SIN userId', async () => {
    vi.mocked(handleEditGoal).mockResolvedValue(ok('✅ Meta actualizada'))

    const res = await executeToolWith(
      writeTools,
      'update_entity',
      { entidad: 'objetivo', busqueda: 'Viaje', cambios: { monto_objetivo: 500000 } },
      ctx,
    )

    expect(handleEditGoal).toHaveBeenCalledWith({ entity: 'objetivo', search: 'Viaje', changes: { monto_objetivo: 500000 } })
    expect(handleEdit).not.toHaveBeenCalled()
    expect(res).toEqual({ ok: true, data: { mensaje: '✅ Meta actualizada' }, mutated: true })
  })

  it('entidad presupuesto → rutea a handleEditGoal(data) SIN userId', async () => {
    vi.mocked(handleEditGoal).mockResolvedValue(ok('✅ Presupuesto actualizado'))

    await executeToolWith(
      writeTools,
      'update_entity',
      { entidad: 'presupuesto', busqueda: 'Comida', cambios: { monto_limite: 100000 } },
      ctx,
    )

    expect(handleEditGoal).toHaveBeenCalledWith({ entity: 'presupuesto', search: 'Comida', changes: { monto_limite: 100000 } })
    expect(handleEdit).not.toHaveBeenCalled()
  })

  it('mutated:false cuando el handler devuelve success:false', async () => {
    vi.mocked(handleEdit).mockResolvedValue(fail('No encontré esa transacción'))

    const res = await executeToolWith(
      writeTools,
      'update_entity',
      { entidad: 'transaccion', busqueda: 'Nada', cambios: { amount: 100 } },
      ctx,
    )

    expect(res).toEqual({ ok: false, data: { mensaje: 'No encontré esa transacción' }, mutated: false })
  })

  it('entidad inválida rechazada por Zod, sin tocar ningún handler', async () => {
    const res = await executeToolWith(
      writeTools,
      'update_entity',
      { entidad: 'otra_cosa', busqueda: 'X', cambios: {} },
      ctx,
    )

    expect(res.ok).toBe(false)
    expect(handleEdit).not.toHaveBeenCalled()
    expect(handleEditGoal).not.toHaveBeenCalled()
  })

  it('entidad cuota rechazada por Zod (handleEdit no soporta editar cuotas; delete_entity sí la acepta)', async () => {
    const res = await executeToolWith(
      writeTools,
      'update_entity',
      { entidad: 'cuota', busqueda: 'Notebook', cambios: { amount: 100 } },
      ctx,
    )

    expect(res.ok).toBe(false)
    expect(handleEdit).not.toHaveBeenCalled()
    expect(handleEditGoal).not.toHaveBeenCalled()
  })
})

describe('delete_entity', () => {
  it('mapea args a DeleteData y propaga confirmed/reassignTo a handleDelete(data, ctx.userId)', async () => {
    vi.mocked(handleDelete).mockResolvedValue(ok('🗑️ Transacción eliminada'))

    const res = await executeToolWith(
      writeTools,
      'delete_entity',
      { entidad: 'transaccion', busqueda: 'Café', confirmed: true, reasignar_a: 'Otra' },
      ctx,
    )

    expect(handleDelete).toHaveBeenCalledWith(
      { entity: 'transaccion', search: 'Café', confirmed: true, reassignTo: 'Otra' },
      ctx.userId,
    )
    expect(res).toEqual({ ok: true, data: { mensaje: '🗑️ Transacción eliminada' }, mutated: true })
  })

  it('confirmed default false y reasignar_a ausente → reassignTo: null', async () => {
    vi.mocked(handleDelete).mockResolvedValue(ok('listo'))

    await executeToolWith(writeTools, 'delete_entity', { entidad: 'categoria', busqueda: 'Comida' }, ctx)

    expect(handleDelete).toHaveBeenCalledWith(
      { entity: 'categoria', search: 'Comida', confirmed: false, reassignTo: null },
      ctx.userId,
    )
  })

  it('mutated:false cuando el mensaje de éxito empieza con ⚠️ (confirmación pendiente, no borró nada)', async () => {
    vi.mocked(handleDelete).mockResolvedValue(ok('⚠️ Esa categoría tiene 3 transacciones asociadas. ¿Reasignar o cancelar?'))

    const res = await executeToolWith(
      writeTools,
      'delete_entity',
      { entidad: 'categoria', busqueda: 'Comida', confirmed: false },
      ctx,
    )

    expect(res.ok).toBe(true)
    expect(res.mutated).toBe(false)
  })

  it('mutated:false cuando el handler falla (success:false)', async () => {
    vi.mocked(handleDelete).mockResolvedValue(fail('No encontré esa transacción'))

    const res = await executeToolWith(writeTools, 'delete_entity', { entidad: 'transaccion', busqueda: 'X' }, ctx)

    expect(res.mutated).toBe(false)
  })

  it('mutated:true cuando el handler tiene éxito real (sin ⚠️)', async () => {
    vi.mocked(handleDelete).mockResolvedValue(ok('🗑️ Medio de pago "Visa" eliminado.'))

    const res = await executeToolWith(writeTools, 'delete_entity', { entidad: 'medio_pago', busqueda: 'Visa', confirmed: true }, ctx)

    expect(res.mutated).toBe(true)
  })

  it('entidad objetivo/presupuesto rechazada por Zod (no soportadas por delete_entity)', async () => {
    const res = await executeToolWith(writeTools, 'delete_entity', { entidad: 'objetivo', busqueda: 'Viaje' }, ctx)

    expect(res.ok).toBe(false)
    expect(handleDelete).not.toHaveBeenCalled()
  })
})

describe('delete_goal_or_budget', () => {
  it('entidad objetivo → handleDeleteGoal(data) SIN userId', async () => {
    vi.mocked(handleDeleteGoal).mockResolvedValue(ok('🗑️ Meta "Viaje" eliminada'))

    const res = await executeToolWith(writeTools, 'delete_goal_or_budget', { entidad: 'objetivo', busqueda: 'Viaje' }, ctx)

    expect(handleDeleteGoal).toHaveBeenCalledWith({ entity: 'objetivo', search: 'Viaje' })
    expect(res).toEqual({ ok: true, data: { mensaje: '🗑️ Meta "Viaje" eliminada' }, mutated: true })
  })

  it('entidad presupuesto → handleDeleteGoal(data) SIN userId', async () => {
    vi.mocked(handleDeleteGoal).mockResolvedValue(ok('🗑️ Presupuesto de Comida eliminado'))

    await executeToolWith(writeTools, 'delete_goal_or_budget', { entidad: 'presupuesto', busqueda: 'Comida' }, ctx)

    expect(handleDeleteGoal).toHaveBeenCalledWith({ entity: 'presupuesto', search: 'Comida' })
  })

  it('mutated:false cuando falla', async () => {
    vi.mocked(handleDeleteGoal).mockResolvedValue(fail('No encontré esa meta'))

    const res = await executeToolWith(writeTools, 'delete_goal_or_budget', { entidad: 'objetivo', busqueda: 'X' }, ctx)

    expect(res.mutated).toBe(false)
  })

  it('entidad no soportada (ej. transaccion) rechazada por Zod', async () => {
    const res = await executeToolWith(writeTools, 'delete_goal_or_budget', { entidad: 'transaccion', busqueda: 'X' }, ctx)

    expect(res.ok).toBe(false)
    expect(handleDeleteGoal).not.toHaveBeenCalled()
  })
})

describe('create_goal', () => {
  it('mapea args a CreateGoalData y llama handleCreateGoal(data) SIN userId', async () => {
    vi.mocked(handleCreateGoal).mockResolvedValue(ok('🎯 ¡Meta de ahorro creada!'))

    const res = await executeToolWith(
      writeTools,
      'create_goal',
      { nombre: 'Viaje a Bariloche', tipo: 'one_time', monto_objetivo: 500000, moneda: 'ARS', fecha_objetivo: '2026-12-01' },
      ctx,
    )

    expect(handleCreateGoal).toHaveBeenCalledWith({
      name: 'Viaje a Bariloche',
      type: 'one_time',
      targetAmount: 500000,
      currency: 'ARS',
      targetDate: '2026-12-01',
    })
    expect(res).toEqual({ ok: true, data: { mensaje: '🎯 ¡Meta de ahorro creada!' }, mutated: true })
  })

  it('moneda default ARS y fecha_objetivo null se respetan', async () => {
    vi.mocked(handleCreateGoal).mockResolvedValue(ok())

    await executeToolWith(
      writeTools,
      'create_goal',
      { nombre: 'Ahorro mensual', tipo: 'monthly', monto_objetivo: 50000, fecha_objetivo: null },
      ctx,
    )

    expect(handleCreateGoal).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'ARS', targetDate: null, type: 'monthly' }),
    )
  })

  it('monto_objetivo negativo o cero rechazado por Zod', async () => {
    const res = await executeToolWith(
      writeTools,
      'create_goal',
      { nombre: 'X', tipo: 'one_time', monto_objetivo: 0, fecha_objetivo: null },
      ctx,
    )

    expect(res.ok).toBe(false)
    expect(handleCreateGoal).not.toHaveBeenCalled()
  })
})

describe('create_budget', () => {
  it('resuelve categoryName por categoria_id vía supabase y llama handleCreateBudget(data) SIN userId', async () => {
    vi.mocked(handleCreateBudget).mockResolvedValue(ok('💰 ¡Presupuesto configurado!'))
    const supabase = createSupabaseMock({ categories: { category: { name: 'Comida', emoji: '🍔' } } })
    const localCtx: AgentContext = { ...ctx, supabase }

    const res = await executeToolWith(
      writeTools,
      'create_budget',
      { categoria_id: 'cat-1', monto_limite: 100000 },
      localCtx,
    )

    expect(handleCreateBudget).toHaveBeenCalledWith({
      categoryName: '🍔 Comida',
      categoryId: 'cat-1',
      limitAmount: 100000,
      currency: 'ARS',
    })
    expect(res).toEqual({ ok: true, data: { mensaje: '💰 ¡Presupuesto configurado!' }, mutated: true })
  })

  it('si no encuentra la categoría, usa el id crudo como categoryName (fallback documentado)', async () => {
    vi.mocked(handleCreateBudget).mockResolvedValue(ok())
    const supabase = createSupabaseMock({ categories: { category: null } })
    const localCtx: AgentContext = { ...ctx, supabase }

    await executeToolWith(writeTools, 'create_budget', { categoria_id: 'cat-inexistente', monto_limite: 50000 }, localCtx)

    expect(handleCreateBudget).toHaveBeenCalledWith(
      expect.objectContaining({ categoryName: 'cat-inexistente', categoryId: 'cat-inexistente' }),
    )
  })

  it('moneda default ARS', async () => {
    vi.mocked(handleCreateBudget).mockResolvedValue(ok())
    const supabase = createSupabaseMock({ categories: { category: { name: 'Ocio', emoji: null } } })
    const localCtx: AgentContext = { ...ctx, supabase }

    await executeToolWith(writeTools, 'create_budget', { categoria_id: 'cat-2', monto_limite: 20000 }, localCtx)

    expect(handleCreateBudget).toHaveBeenCalledWith(expect.objectContaining({ currency: 'ARS', categoryName: 'Ocio' }))
  })

  it('monto_limite negativo o cero rechazado por Zod, sin tocar supabase ni el handler', async () => {
    const supabase = createSupabaseMock({})
    const localCtx: AgentContext = { ...ctx, supabase }

    const res = await executeToolWith(writeTools, 'create_budget', { categoria_id: 'cat-1', monto_limite: -1 }, localCtx)

    expect(res.ok).toBe(false)
    expect(handleCreateBudget).not.toHaveBeenCalled()
  })
})

describe('contribute_to_goal', () => {
  it('mapea args a GoalContributionData y llama handleGoalContribution(data) SIN userId', async () => {
    vi.mocked(handleGoalContribution).mockResolvedValue(ok('🐷 ¡Aporte registrado!'))

    const res = await executeToolWith(
      writeTools,
      'contribute_to_goal',
      { busqueda: 'Viaje', monto: 10000, moneda: 'ARS', nota: 'aguinaldo', fecha: '2026-07-08' },
      ctx,
    )

    expect(handleGoalContribution).toHaveBeenCalledWith({
      search: 'Viaje',
      amount: 10000,
      currency: 'ARS',
      note: 'aguinaldo',
      date: '2026-07-08',
    })
    expect(res).toEqual({ ok: true, data: { mensaje: '🐷 ¡Aporte registrado!' }, mutated: true })
  })

  it('moneda default ARS y nota null se respetan', async () => {
    vi.mocked(handleGoalContribution).mockResolvedValue(ok())

    await executeToolWith(
      writeTools,
      'contribute_to_goal',
      { busqueda: 'Viaje', monto: 5000, nota: null, fecha: '2026-07-08' },
      ctx,
    )

    expect(handleGoalContribution).toHaveBeenCalledWith(expect.objectContaining({ currency: 'ARS', note: null }))
  })

  it('monto negativo rechazado por Zod', async () => {
    const res = await executeToolWith(
      writeTools,
      'contribute_to_goal',
      { busqueda: 'Viaje', monto: -100, nota: null, fecha: '2026-07-08' },
      ctx,
    )

    expect(res.ok).toBe(false)
    expect(handleGoalContribution).not.toHaveBeenCalled()
  })

  it('fecha con formato inválido rechazada por Zod', async () => {
    const res = await executeToolWith(
      writeTools,
      'contribute_to_goal',
      { busqueda: 'Viaje', monto: 100, nota: null, fecha: '08/07/2026' },
      ctx,
    )

    expect(res.ok).toBe(false)
    expect(handleGoalContribution).not.toHaveBeenCalled()
  })
})

describe('writeTools registry (Fase 2 completa)', () => {
  it('expone exactamente 12 tools de kind write', () => {
    expect(writeTools).toHaveLength(12)
    expect(writeTools.every((t) => t.kind === 'write')).toBe(true)
    expect(writeTools.map((t) => t.name).sort()).toEqual(
      [
        'create_budget',
        'create_category',
        'create_goal',
        'create_installment_plan',
        'create_payment_method',
        'create_recurring_plan',
        'create_transaction',
        'contribute_to_goal',
        'delete_entity',
        'delete_goal_or_budget',
        'set_card_dates',
        'update_entity',
      ].sort(),
    )
  })
})
