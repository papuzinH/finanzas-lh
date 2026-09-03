import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeTools } from '@/lib/ai/tools/writeTools'
import { executeToolWith } from '@/lib/ai/tools/registry'
import {
  handleTransaction,
  handleInstallment,
  handleSubscription,
  handleCardConfig,
} from '@/lib/ai/handlers'
import type { AgentContext } from '@/lib/ai/tools/types'
import type { ChatResponse } from '@/lib/ai/handlers'

vi.mock('@/lib/ai/handlers', () => ({
  handleTransaction: vi.fn(),
  handleInstallment: vi.fn(),
  handleSubscription: vi.fn(),
  handleCardConfig: vi.fn(),
}))

// --- Mock de supabase encadenable (select/eq/insert → this), usado por
// create_category y create_payment_method (inserts directos, sin handler legacy).
// `tables['X'].existing` simula las filas (con `name`) del usuario que trae el select
// para el duplicate-check client-side; `tables['X'].insertError` simula un error al
// insertar. A propósito NO expone `ilike`/`limit`: el duplicate-check debe ser
// comparación client-side (fix post-review: ilike sin escapar trata % y _ como
// wildcards LIKE vivos); si una regresión reintroduce ilike, el mock revienta.
type TableFixture = { existing?: unknown[]; findError?: boolean; insertError?: boolean }

function createSupabaseMock(tables: Record<string, TableFixture>) {
  const insertCalls: Record<string, unknown[]> = {}
  const from = (table: string) => {
    const fixture = tables[table] ?? {}
    const selectResult = fixture.findError
      ? { data: null, error: new Error('boom') }
      : { data: fixture.existing ?? [] }
    const chain = {
      select: () => chain,
      eq: () => chain,
      insert: (payload: unknown) => {
        insertCalls[table] = insertCalls[table] ?? []
        insertCalls[table].push(payload)
        return fixture.insertError
          ? Promise.resolve({ data: null, error: new Error('boom') })
          : Promise.resolve({ data: null, error: null })
      },
      then: (resolve: (v: typeof selectResult) => void) => resolve(selectResult),
    }
    return chain
  }
  return { supabase: { from } as unknown as AgentContext['supabase'], insertCalls }
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

describe('create_transaction', () => {
  it('mapea args a TransactionData y llama handleTransaction(data, ctx.userId)', async () => {
    vi.mocked(handleTransaction).mockResolvedValue(ok('✅ Gasto registrado'))

    const res = await executeToolWith(
      writeTools,
      'create_transaction',
      {
        descripcion: 'Café',
        monto: 2500,
        tipo: 'expense',
        categoria_id: 'cat-1',
        medio_pago: 'Visa',
        fecha: '2026-07-08',
      },
      ctx,
    )

    expect(handleTransaction).toHaveBeenCalledWith(
      {
        description: 'Café',
        amount: 2500,
        type: 'expense',
        categoryId: 'cat-1',
        categoryName: null,
        paymentMethodName: 'Visa',
        date: '2026-07-08',
        isReal: true,
        // Task 8: un gasto nunca lleva imputación de mes.
        incomePeriod: null,
      },
      ctx.userId,
    )
    expect(res).toEqual({ ok: true, data: { mensaje: '✅ Gasto registrado' }, mutated: true })
  })

  it('categoria_id y medio_pago null se pasan tal cual (default en el handler)', async () => {
    vi.mocked(handleTransaction).mockResolvedValue(ok())

    await executeToolWith(
      writeTools,
      'create_transaction',
      {
        descripcion: 'Sueldo',
        monto: 500000,
        tipo: 'income',
        categoria_id: null,
        medio_pago: null,
        fecha: '2026-07-08',
      },
      ctx,
    )

    expect(handleTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: null, paymentMethodName: null }),
      ctx.userId,
    )
  })

  it('mutated:false cuando el handler devuelve success:false', async () => {
    vi.mocked(handleTransaction).mockResolvedValue(fail('Error al guardar la transacción'))

    const res = await executeToolWith(
      writeTools,
      'create_transaction',
      {
        descripcion: 'Café',
        monto: 2500,
        tipo: 'expense',
        categoria_id: null,
        medio_pago: null,
        fecha: '2026-07-08',
      },
      ctx,
    )

    expect(res).toEqual({ ok: false, data: { mensaje: 'Error al guardar la transacción' }, mutated: false })
  })

  it('monto negativo o cero rechazado por Zod, sin tocar el handler', async () => {
    const res = await executeToolWith(
      writeTools,
      'create_transaction',
      {
        descripcion: 'Café',
        monto: -100,
        tipo: 'expense',
        categoria_id: null,
        medio_pago: null,
        fecha: '2026-07-08',
      },
      ctx,
    )

    expect(res.ok).toBe(false)
    expect(res.error).toContain('monto')
    expect(handleTransaction).not.toHaveBeenCalled()
  })

  it('fecha con formato inválido rechazada por Zod', async () => {
    const res = await executeToolWith(
      writeTools,
      'create_transaction',
      {
        descripcion: 'Café',
        monto: 100,
        tipo: 'expense',
        categoria_id: null,
        medio_pago: null,
        fecha: '08/07/2026',
      },
      ctx,
    )

    expect(res.ok).toBe(false)
    expect(handleTransaction).not.toHaveBeenCalled()
  })
})

describe('create_transaction e imputacion de cobros', () => {
  beforeEach(() => {
    vi.mocked(handleTransaction).mockResolvedValue({ success: true, message: 'Listo' } as ChatResponse)
  })

  it('pide el mes cuando el ingreso cae en el borde y no vino', async () => {
    const r = await executeToolWith(writeTools, 'create_transaction', {
      descripcion: 'Sueldo', monto: 1_850_000, tipo: 'income',
      categoria_id: null, medio_pago: null, fecha: '2026-08-29',
    }, ctx)
    expect(r.ok).toBe(false)
    // El mensaje es para el MODELO, y en espanol: si se filtra al usuario tiene
    // que leerse como una pregunta, no como un error de Zod (bug del 2026-09-01).
    expect(r.error).toContain('a qué mes')
    expect(r.error).not.toContain('Invalid input')
  })

  it('no pregunta nada si el ingreso no cae en el borde', async () => {
    const r = await executeToolWith(writeTools, 'create_transaction', {
      descripcion: 'Sueldo', monto: 1_850_000, tipo: 'income',
      categoria_id: null, medio_pago: null, fecha: '2026-08-15',
    }, ctx)
    expect(r.ok).toBe(true)
  })

  it('no pregunta nada para un gasto en el borde', async () => {
    const r = await executeToolWith(writeTools, 'create_transaction', {
      descripcion: 'Chino', monto: 8_000, tipo: 'expense',
      categoria_id: null, medio_pago: null, fecha: '2026-08-29',
    }, ctx)
    expect(r.ok).toBe(true)
  })

  it('acepta el mes y lo persiste como el dia 1', async () => {
    const r = await executeToolWith(writeTools, 'create_transaction', {
      descripcion: 'Sueldo', monto: 1_850_000, tipo: 'income',
      categoria_id: null, medio_pago: null, fecha: '2026-08-29',
      mes_del_cobro: '2026-09',
    }, ctx)
    expect(r.ok).toBe(true)
    expect(vi.mocked(handleTransaction)).toHaveBeenCalledWith(
      expect.objectContaining({ incomePeriod: '2026-09-01' }), ctx.userId,
    )
  })

  it('un ingreso fuera del borde no lleva imputacion', async () => {
    await executeToolWith(writeTools, 'create_transaction', {
      descripcion: 'Sueldo', monto: 1_850_000, tipo: 'income',
      categoria_id: null, medio_pago: null, fecha: '2026-08-15',
    }, ctx)
    expect(vi.mocked(handleTransaction)).toHaveBeenCalledWith(
      expect.objectContaining({ incomePeriod: null }), ctx.userId,
    )
  })

  it('un mes_del_cobro sintacticamente valido pero fuera de los dos candidatos reales se descarta (alucinacion del modelo)', async () => {
    // '2027-03' pasa el regex de Zod (YYYY-MM) pero no es ni agosto ni
    // septiembre de 2026 -- los unicos dos candidatos reales de esta fecha. Sin
    // resolverImputacion filtrando esto, el string alucinado se persistiria tal
    // cual. Valor esperado: resolverImputacion('2026-08-29', '2027-03-01', null)
    // -- candidato invalido, preferencia null (no `true`) -> mesPorDefecto cae a
    // esteMes, '2026-08-01'. Confirmado por analogia con el caso ya cubierto en
    // imputacion-ingresos.test.ts: resolverImputacion('2026-07-28', '2026-09-01',
    // false) -> '2026-07-01' (el mes de la propia fecha, no el candidato invalido).
    const r = await executeToolWith(writeTools, 'create_transaction', {
      descripcion: 'Sueldo', monto: 1_850_000, tipo: 'income',
      categoria_id: null, medio_pago: null, fecha: '2026-08-29',
      mes_del_cobro: '2027-03',
    }, ctx)
    expect(r.ok).toBe(true)
    expect(vi.mocked(handleTransaction)).toHaveBeenCalledWith(
      expect.objectContaining({ incomePeriod: '2026-08-01' }), ctx.userId,
    )
  })

  it('el mes vecino equivocado (confundir anterior con siguiente) tambien se descarta', async () => {
    // La alucinacion mas plausible: para una fecha de agosto, el modelo manda
    // julio (el mes anterior) en vez de agosto o septiembre (los dos candidatos
    // reales). Mismo mecanismo que el caso de arriba, mismo valor esperado.
    const r = await executeToolWith(writeTools, 'create_transaction', {
      descripcion: 'Sueldo', monto: 1_850_000, tipo: 'income',
      categoria_id: null, medio_pago: null, fecha: '2026-08-29',
      mes_del_cobro: '2026-07',
    }, ctx)
    expect(r.ok).toBe(true)
    expect(vi.mocked(handleTransaction)).toHaveBeenCalledWith(
      expect.objectContaining({ incomePeriod: '2026-08-01' }), ctx.userId,
    )
  })
})

describe('create_installment_plan', () => {
  it('mapea a InstallmentData con amount = monto por cuota y totalAmount = monto_total', async () => {
    vi.mocked(handleInstallment).mockResolvedValue(ok('✅ Cuotas registradas'))

    const res = await executeToolWith(
      writeTools,
      'create_installment_plan',
      {
        descripcion: 'Notebook',
        monto_total: 300000,
        cantidad_cuotas: 6,
        categoria_id: 'cat-tech',
        medio_pago: 'Visa',
        fecha: '2026-07-08',
      },
      ctx,
    )

    expect(handleInstallment).toHaveBeenCalledWith(
      {
        description: 'Notebook',
        amount: 50000,
        totalAmount: 300000,
        installmentsCount: 6,
        type: 'expense',
        categoryId: 'cat-tech',
        categoryName: null,
        paymentMethodName: 'Visa',
        date: '2026-07-08',
        isReal: true,
      },
      ctx.userId,
    )
    expect(res).toEqual({ ok: true, data: { mensaje: '✅ Cuotas registradas' }, mutated: true })
  })

  it('cantidad_cuotas fuera de rango (1 o 61) rechazada por Zod', async () => {
    const resLow = await executeToolWith(
      writeTools,
      'create_installment_plan',
      {
        descripcion: 'X',
        monto_total: 1000,
        cantidad_cuotas: 1,
        categoria_id: null,
        medio_pago: null,
        fecha: '2026-07-08',
      },
      ctx,
    )
    const resHigh = await executeToolWith(
      writeTools,
      'create_installment_plan',
      {
        descripcion: 'X',
        monto_total: 1000,
        cantidad_cuotas: 61,
        categoria_id: null,
        medio_pago: null,
        fecha: '2026-07-08',
      },
      ctx,
    )

    expect(resLow.ok).toBe(false)
    expect(resHigh.ok).toBe(false)
    expect(handleInstallment).not.toHaveBeenCalled()
  })

  it('mutated:false cuando el handler falla', async () => {
    vi.mocked(handleInstallment).mockResolvedValue(fail('Error al crear el plan de cuotas'))

    const res = await executeToolWith(
      writeTools,
      'create_installment_plan',
      {
        descripcion: 'Notebook',
        monto_total: 300000,
        cantidad_cuotas: 6,
        categoria_id: null,
        medio_pago: null,
        fecha: '2026-07-08',
      },
      ctx,
    )

    expect(res.mutated).toBe(false)
  })
})

describe('create_recurring_plan', () => {
  it('mapea a SubscriptionData con frequency "monthly" y moneda default ARS', async () => {
    vi.mocked(handleSubscription).mockResolvedValue(ok('✅ Suscripción registrada'))

    const res = await executeToolWith(
      writeTools,
      'create_recurring_plan',
      {
        descripcion: 'Netflix',
        monto: 5000,
        categoria_id: null,
        medio_pago: 'Débito',
      },
      ctx,
    )

    expect(handleSubscription).toHaveBeenCalledWith(
      {
        description: 'Netflix',
        amount: 5000,
        currency: 'ARS',
        frequency: 'monthly',
        categoryId: null,
        categoryName: null,
        paymentMethodName: 'Débito',
      },
      ctx.userId,
    )
    expect(res).toEqual({ ok: true, data: { mensaje: '✅ Suscripción registrada' }, mutated: true })
  })

  it('moneda USD explícita se respeta', async () => {
    vi.mocked(handleSubscription).mockResolvedValue(ok())

    await executeToolWith(
      writeTools,
      'create_recurring_plan',
      {
        descripcion: 'Spotify',
        monto: 12,
        moneda: 'USD',
        categoria_id: null,
        medio_pago: null,
      },
      ctx,
    )

    expect(handleSubscription).toHaveBeenCalledWith(expect.objectContaining({ currency: 'USD' }), ctx.userId)
  })
})

describe('set_card_dates', () => {
  it('mapea a CardConfigData', async () => {
    vi.mocked(handleCardConfig).mockResolvedValue(ok('✅ Tarjeta actualizada'))

    const res = await executeToolWith(
      writeTools,
      'set_card_dates',
      { medio_pago: 'Visa', dia_cierre: 20, dia_vencimiento: 10 },
      ctx,
    )

    expect(handleCardConfig).toHaveBeenCalledWith(
      { paymentMethodName: 'Visa', closingDay: 20, paymentDay: 10 },
      ctx.userId,
    )
    expect(res).toEqual({ ok: true, data: { mensaje: '✅ Tarjeta actualizada' }, mutated: true })
  })

  it('dia_cierre fuera de rango (0 o 32) rechazado por Zod', async () => {
    const res = await executeToolWith(
      writeTools,
      'set_card_dates',
      { medio_pago: 'Visa', dia_cierre: 32, dia_vencimiento: 10 },
      ctx,
    )
    expect(res.ok).toBe(false)
    expect(handleCardConfig).not.toHaveBeenCalled()
  })
})

describe('create_category', () => {
  it('rechaza duplicado (case-insensitive) sin insertar', async () => {
    const { supabase, insertCalls } = createSupabaseMock({
      categories: { existing: [{ id: 'c1', name: 'Comida' }] },
    })
    const localCtx: AgentContext = { ...ctx, supabase }

    const res = await executeToolWith(
      writeTools,
      'create_category',
      { nombre: 'comida', tipo: 'expense' },
      localCtx,
    )

    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
    expect(res.mutated).toBe(false)
    expect(insertCalls.categories).toBeUndefined()
  })

  it('un nombre con % NO matchea por substring contra otro existente (sin wildcards LIKE)', async () => {
    const { supabase, insertCalls } = createSupabaseMock({
      categories: { existing: [{ id: 'c1', name: 'Compras' }] },
    })
    const localCtx: AgentContext = { ...ctx, supabase }

    const res = await executeToolWith(
      writeTools,
      'create_category',
      { nombre: 'Compras 20%', tipo: 'expense' },
      localCtx,
    )

    expect(res.ok).toBe(true)
    expect(res.mutated).toBe(true)
    expect(insertCalls.categories[0]).toMatchObject({ name: 'Compras 20%' })
  })

  it('crea la categoría con el user_id UUID (authUserId) cuando no hay duplicado', async () => {
    const { supabase, insertCalls } = createSupabaseMock({ categories: { existing: [] } })
    const localCtx: AgentContext = { ...ctx, supabase }

    const res = await executeToolWith(
      writeTools,
      'create_category',
      { nombre: 'Mascotas', tipo: 'expense', emoji: '🐶' },
      localCtx,
    )

    expect(res.ok).toBe(true)
    expect(res.mutated).toBe(true)
    expect(insertCalls.categories).toHaveLength(1)
    expect(insertCalls.categories[0]).toMatchObject({
      user_id: 'uuid-1',
      name: 'Mascotas',
      type: 'expense',
      emoji: '🐶',
    })
  })

  it('error al insertar devuelve ok:false, mutated:false y loguea el error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase } = createSupabaseMock({ categories: { existing: [], insertError: true } })
    const localCtx: AgentContext = { ...ctx, supabase }

    const res = await executeToolWith(
      writeTools,
      'create_category',
      { nombre: 'Mascotas', tipo: 'expense' },
      localCtx,
    )

    expect(res.ok).toBe(false)
    expect(res.mutated).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('error en el duplicate-check devuelve ok:false, mutated:false y loguea el error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase, insertCalls } = createSupabaseMock({ categories: { findError: true } })
    const localCtx: AgentContext = { ...ctx, supabase }

    const res = await executeToolWith(
      writeTools,
      'create_category',
      { nombre: 'Mascotas', tipo: 'expense' },
      localCtx,
    )

    expect(res.ok).toBe(false)
    expect(res.mutated).toBe(false)
    expect(insertCalls.categories).toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('create_payment_method', () => {
  it('rechaza duplicado (case-insensitive) sin insertar', async () => {
    const { supabase, insertCalls } = createSupabaseMock({
      payment_methods: { existing: [{ id: 1, name: 'Visa' }] },
    })
    const localCtx: AgentContext = { ...ctx, supabase }

    const res = await executeToolWith(
      writeTools,
      'create_payment_method',
      { nombre: 'visa', tipo: 'credit' },
      localCtx,
    )

    expect(res.ok).toBe(false)
    expect(res.mutated).toBe(false)
    expect(insertCalls.payment_methods).toBeUndefined()
  })

  it('un nombre con _ NO matchea por wildcard contra otro existente', async () => {
    // En LIKE, "_" matchea cualquier caracter: "Visa_" matchearía "Visas".
    const { supabase, insertCalls } = createSupabaseMock({
      payment_methods: { existing: [{ id: 1, name: 'Visas' }] },
    })
    const localCtx: AgentContext = { ...ctx, supabase }

    const res = await executeToolWith(
      writeTools,
      'create_payment_method',
      { nombre: 'Visa_', tipo: 'debit' },
      localCtx,
    )

    expect(res.ok).toBe(true)
    expect(res.mutated).toBe(true)
    expect(insertCalls.payment_methods[0]).toMatchObject({ name: 'Visa_' })
  })

  it('crea el medio con el user_id de ctx y días de tarjeta si tipo=credit', async () => {
    const { supabase, insertCalls } = createSupabaseMock({ payment_methods: { existing: [] } })
    const localCtx: AgentContext = { ...ctx, supabase }

    const res = await executeToolWith(
      writeTools,
      'create_payment_method',
      { nombre: 'Visa', tipo: 'credit', dia_cierre: 20, dia_vencimiento: 10 },
      localCtx,
    )

    expect(res.ok).toBe(true)
    expect(res.mutated).toBe(true)
    expect(insertCalls.payment_methods[0]).toMatchObject({
      user_id: '1',
      name: 'Visa',
      type: 'credit',
      default_closing_day: 20,
      default_payment_day: 10,
    })
  })

  it('NO setea días de cierre/vencimiento si tipo no es credit, aunque vengan en los args', async () => {
    const { supabase, insertCalls } = createSupabaseMock({ payment_methods: { existing: [] } })
    const localCtx: AgentContext = { ...ctx, supabase }

    await executeToolWith(
      writeTools,
      'create_payment_method',
      { nombre: 'Efectivo', tipo: 'cash', dia_cierre: 20, dia_vencimiento: 10 },
      localCtx,
    )

    const payload = insertCalls.payment_methods[0] as Record<string, unknown>
    expect(payload.default_closing_day).toBeUndefined()
    expect(payload.default_payment_day).toBeUndefined()
  })
})

describe('writeTools registry', () => {
  // El conteo/listado exacto de las 12 tools (Tasks 11 + 13) vive en
  // writeToolsB.test.ts junto a las tools nuevas; acá solo verificamos que las
  // 6 de Task 11 siguen presentes y son 'write', sin duplicar el assert exacto.
  it('incluye las 6 tools de Task 11, todas de kind write', () => {
    const names = writeTools.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'create_category',
        'create_installment_plan',
        'create_payment_method',
        'create_recurring_plan',
        'create_transaction',
        'set_card_dates',
      ]),
    )
    expect(writeTools.every((t) => t.kind === 'write')).toBe(true)
  })
})
