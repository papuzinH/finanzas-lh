import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readTools } from '@/lib/ai/tools/readTools'
import { executeToolWith } from '@/lib/ai/tools/registry'
import { loadFinanceData } from '@/lib/ai/tools/dataLoader'
import type { AgentContext } from '@/lib/ai/tools/types'
import type { FinanceData } from '@/lib/ai/tools/dataLoader'
import type { ProcessedTransaction } from '@/lib/finance/types'
import type { PaymentMethod, RecurringPlan, Category, InstallmentPlan } from '@/types/database'

vi.mock('@/lib/ai/tools/dataLoader', () => ({
  loadFinanceData: vi.fn(),
}))

// --- Mock de supabase encadenable (select/eq/or/in/order/limit → this), usado solo
// por las tools que consultan directo (list_goals_and_budgets, get_portfolio_status).
// `tables['X'] === 'ERROR'` simula una fila con error para probar el camino de falla.
type TableFixture = unknown[] | 'ERROR'

function createSupabaseMock(tables: Record<string, TableFixture>): AgentContext['supabase'] {
  const from = (table: string) => {
    const raw = tables[table]
    const result = raw === 'ERROR' ? { data: null, error: new Error('boom') } : { data: raw ?? [] }
    const chain = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      then: (resolve: (v: typeof result) => void) => resolve(result),
    }
    return chain
  }
  return { from } as unknown as AgentContext['supabase']
}

const baseCtx: AgentContext = {
  supabase: {} as AgentContext['supabase'],
  userId: 1,
  authUserId: 'uuid-1',
  today: '2026-07-08',
}

const pmVisa = {
  id: 1,
  user_id: 1,
  name: 'Visa',
  type: 'credit',
  default_closing_day: 20,
  default_payment_day: 10,
  is_personal: false,
  is_default: false,
  created_at: '2026-01-01',
} as PaymentMethod

const pmDebito = {
  id: 2,
  user_id: 1,
  name: 'Débito Galicia',
  type: 'debit',
  default_closing_day: null,
  default_payment_day: null,
  is_personal: false,
  is_default: true,
  created_at: '2026-01-01',
} as PaymentMethod

const catComida = {
  id: 'c1',
  user_id: 'uuid-1',
  name: 'Comida',
  description: null,
  emoji: '🍔',
  is_system: false,
  type: 'expense',
  created_at: '2026-01-01',
} as Category

const catTransporte = {
  id: 'c2',
  user_id: 'uuid-1',
  name: 'Transporte',
  description: null,
  emoji: '🚌',
  is_system: false,
  type: 'expense',
  created_at: '2026-01-01',
} as Category

const catSueldo = {
  id: 'c3',
  user_id: 'uuid-1',
  name: 'Sueldo',
  description: null,
  emoji: '💰',
  is_system: false,
  type: 'income',
  created_at: '2026-01-01',
} as Category

function tx(overrides: Partial<ProcessedTransaction>): ProcessedTransaction {
  return {
    id: 0,
    user_id: 1,
    description: '',
    category_id: null,
    amount: 0,
    date: '',
    type: 'expense',
    installment_plan_id: null,
    recurring_plan_id: null,
    created_at: '2026-07-01',
    payment_method_id: null,
    original_currency: 'ARS',
    original_amount: null,
    rate_pair: null,
    exchange_rate: null,
    card_payment_for: null,
    periodDate: '',
    realPaymentDate: '',
    ...overrides,
  } as ProcessedTransaction
}

function baseFinanceData(overrides: Partial<FinanceData> = {}): FinanceData {
  return {
    transactions: [],
    paymentMethods: [pmVisa, pmDebito],
    recurringPlans: [],
    internalTransfers: [],
    categories: [catComida, catTransporte, catSueldo],
    installmentPlans: [],
    ...overrides,
  }
}

describe('readTools (B)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 8, 10, 0, 0)) // 8 jul 2026, 10hs
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('get_expenses_by_category', () => {
    const txSuper = tx({
      id: 1,
      description: 'Super',
      category_id: 'c1',
      amount: 20000,
      date: '2026-07-05',
      periodDate: '2026-07-05',
      type: 'expense',
      payment_method_id: 2,
    })
    const txNafta = tx({
      id: 2,
      description: 'Nafta',
      category_id: 'c2',
      amount: 10000,
      date: '2026-07-06',
      periodDate: '2026-07-06',
      type: 'expense',
      payment_method_id: 2,
    })
    const txSueldo = tx({
      id: 3,
      description: 'Sueldo',
      category_id: 'c3',
      amount: 100000,
      date: '2026-07-01',
      periodDate: '2026-07-01',
      type: 'income',
      payment_method_id: 2,
    })

    it('sin mes desglosa gastos del mes actual, ordenado desc con porcentaje', async () => {
      vi.mocked(loadFinanceData).mockResolvedValue(
        baseFinanceData({ transactions: [txSuper, txNafta, txSueldo] }),
      )
      const r = await executeToolWith(readTools, 'get_expenses_by_category', {}, baseCtx)
      expect(r.ok).toBe(true)
      expect(r.data).toEqual({
        mes: '2026-07',
        tipo: 'expense',
        total: 30000,
        items: [
          { categoria: 'Comida', monto: 20000, porcentaje: 66.7 },
          { categoria: 'Transporte', monto: 10000, porcentaje: 33.3 },
        ],
      })
    })

    it('tipo income desglosa ingresos del mes actual', async () => {
      vi.mocked(loadFinanceData).mockResolvedValue(
        baseFinanceData({ transactions: [txSuper, txNafta, txSueldo] }),
      )
      const r = await executeToolWith(readTools, 'get_expenses_by_category', { tipo: 'income' }, baseCtx)
      expect(r.ok).toBe(true)
      expect(r.data).toEqual({
        mes: '2026-07',
        tipo: 'income',
        total: 100000,
        items: [{ categoria: 'Sueldo', monto: 100000, porcentaje: 100 }],
      })
    })

    it('con mes histórico filtra por periodDate (semántica de ciclo vía scope global pre-filtrado)', async () => {
      const txSuperJunio = tx({
        id: 4,
        description: 'Super junio',
        category_id: 'c1',
        amount: 6000,
        date: '2026-06-10',
        periodDate: '2026-06-10',
        type: 'expense',
        payment_method_id: 2,
      })
      const txNaftaJunio = tx({
        id: 5,
        description: 'Nafta junio',
        category_id: 'c2',
        amount: 3000,
        date: '2026-06-15',
        periodDate: '2026-06-15',
        type: 'expense',
        payment_method_id: 2,
      })
      vi.mocked(loadFinanceData).mockResolvedValue(
        // Incluye también transacciones de julio para probar que NO se filtran en el mes pedido.
        baseFinanceData({ transactions: [txSuperJunio, txNaftaJunio, txSuper] }),
      )
      const r = await executeToolWith(readTools, 'get_expenses_by_category', { mes: '2026-06' }, baseCtx)
      expect(r.ok).toBe(true)
      expect(r.data).toEqual({
        mes: '2026-06',
        tipo: 'expense',
        total: 9000,
        items: [
          { categoria: 'Comida', monto: 6000, porcentaje: 66.7 },
          { categoria: 'Transporte', monto: 3000, porcentaje: 33.3 },
        ],
      })
    })

    it('recorta a las 20 categorías con más monto', async () => {
      const categories: Category[] = []
      const transactions: ProcessedTransaction[] = []
      for (let i = 0; i < 25; i++) {
        const id = `cat-${i}`
        categories.push({
          id,
          user_id: 'uuid-1',
          name: `Categoria ${i}`,
          description: null,
          emoji: null,
          is_system: false,
          type: 'expense',
          created_at: '2026-01-01',
        } as Category)
        transactions.push(
          tx({
            id: 100 + i,
            description: `Gasto ${i}`,
            category_id: id,
            amount: 1000 + i, // montos distintos, sin empates
            date: '2026-07-02',
            periodDate: '2026-07-02',
            type: 'expense',
            payment_method_id: 2,
          }),
        )
      }
      vi.mocked(loadFinanceData).mockResolvedValue(baseFinanceData({ transactions, categories }))
      const r = await executeToolWith(readTools, 'get_expenses_by_category', {}, baseCtx)
      expect(r.ok).toBe(true)
      const data = r.data as { items: Array<{ monto: number }> }
      expect(data.items).toHaveLength(20)
      expect(data.items[0].monto).toBe(1024) // el de mayor monto (i=24)
    })

    it('mes con formato inválido → error de validación', async () => {
      vi.mocked(loadFinanceData).mockResolvedValue(baseFinanceData())
      const r = await executeToolWith(readTools, 'get_expenses_by_category', { mes: '2026/07' }, baseCtx)
      expect(r.ok).toBe(false)
      expect(r.error).toBeDefined()
    })
  })

  describe('search_transactions', () => {
    function makeSearchDataset(): ProcessedTransaction[] {
      const rows: ProcessedTransaction[] = []
      for (let i = 1; i <= 12; i++) {
        rows.push(
          tx({
            id: i,
            description: `Compra ${i}`,
            category_id: 'c1',
            amount: 1000 * i,
            date: `2026-07-${String(i).padStart(2, '0')}`,
            periodDate: `2026-07-${String(i).padStart(2, '0')}`,
            type: 'expense',
            payment_method_id: 2,
          }),
        )
      }
      rows.push(
        tx({
          id: 20,
          description: 'Netflix suscripción',
          category_id: 'c2',
          amount: 5000,
          date: '2026-07-15',
          periodDate: '2026-07-15',
          type: 'expense',
          payment_method_id: 1,
        }),
      )
      return rows
    }

    it('sin filtros devuelve como máximo 10 filas (default) ordenadas por fecha desc', async () => {
      vi.mocked(loadFinanceData).mockResolvedValue(baseFinanceData({ transactions: makeSearchDataset() }))
      const r = await executeToolWith(readTools, 'search_transactions', {}, baseCtx)
      expect(r.ok).toBe(true)
      const rows = r.data as Array<{ id: number; fecha: string }>
      expect(rows).toHaveLength(10)
      expect(rows[0].fecha >= rows[rows.length - 1].fecha).toBe(true)
    })

    it('filtra por texto (case-insensitive, inclusión parcial)', async () => {
      vi.mocked(loadFinanceData).mockResolvedValue(baseFinanceData({ transactions: makeSearchDataset() }))
      const r = await executeToolWith(readTools, 'search_transactions', { texto: 'netflix' }, baseCtx)
      expect(r.ok).toBe(true)
      expect(r.data).toEqual([
        { id: 20, fecha: '2026-07-15', descripcion: 'Netflix suscripción', monto: 5000, categoria: 'Transporte', medio: 'Visa' },
      ])
    })

    it('filtra por categoria y medio por nombre', async () => {
      vi.mocked(loadFinanceData).mockResolvedValue(baseFinanceData({ transactions: makeSearchDataset() }))
      const r = await executeToolWith(readTools, 'search_transactions', { medio: 'visa' }, baseCtx)
      expect(r.ok).toBe(true)
      const rows = r.data as Array<{ descripcion: string }>
      expect(rows).toEqual([
        { id: 20, fecha: '2026-07-15', descripcion: 'Netflix suscripción', monto: 5000, categoria: 'Transporte', medio: 'Visa' },
      ])
    })

    it('filtra por rango de fechas desde/hasta (inclusive)', async () => {
      vi.mocked(loadFinanceData).mockResolvedValue(baseFinanceData({ transactions: makeSearchDataset() }))
      const r = await executeToolWith(
        readTools,
        'search_transactions',
        { desde: '2026-07-10', hasta: '2026-07-12' },
        baseCtx,
      )
      expect(r.ok).toBe(true)
      const rows = r.data as Array<{ id: number }>
      expect(rows.map((row) => row.id).sort()).toEqual([10, 11, 12])
    })

    it('respeta limite explícito por debajo del tope', async () => {
      vi.mocked(loadFinanceData).mockResolvedValue(baseFinanceData({ transactions: makeSearchDataset() }))
      const r = await executeToolWith(readTools, 'search_transactions', { limite: 3 }, baseCtx)
      expect(r.ok).toBe(true)
      expect((r.data as unknown[]).length).toBe(3)
    })

    it('limite > 20 es rechazado por el schema con error legible', async () => {
      vi.mocked(loadFinanceData).mockResolvedValue(baseFinanceData({ transactions: makeSearchDataset() }))
      const r = await executeToolWith(readTools, 'search_transactions', { limite: 50 }, baseCtx)
      expect(r.ok).toBe(false)
      expect(r.error).toBeDefined()
      expect(loadFinanceData).not.toHaveBeenCalled()
    })
  })

  describe('get_installments_status', () => {
    const planNotebook = {
      id: 1,
      user_id: 1,
      description: 'Notebook',
      total_amount: 60000,
      installments_count: 6,
      purchase_date: '2026-01-08',
      category_id: null,
      created_at: '2026-01-08',
      payment_method_id: 1,
    } as InstallmentPlan

    const planHeladera = {
      id: 2,
      user_id: 1,
      description: 'Heladera',
      total_amount: 30000,
      installments_count: 3,
      purchase_date: '2026-02-01',
      category_id: null,
      created_at: '2026-02-01',
      payment_method_id: 1,
    } as InstallmentPlan

    function cuota(id: number, planId: number, date: string, amount = 10000): ProcessedTransaction {
      return tx({
        id,
        description: `Cuota ${id}`,
        installment_plan_id: planId,
        amount,
        date,
        periodDate: date,
        type: 'expense',
        payment_method_id: 1,
      })
    }

    it('calcula cuotas pagadas/restantes y monto restante por plan', async () => {
      const transactions = [
        cuota(1, 1, '2026-04-08'),
        cuota(2, 1, '2026-05-08'),
        cuota(3, 1, '2026-06-08'),
        // 3 cuotas de Notebook pagadas (<= hoy 2026-07-08), 3 restantes.
        cuota(4, 2, '2026-02-01', 10000),
        cuota(5, 2, '2026-03-01', 10000),
        cuota(6, 2, '2026-04-01', 10000),
        // Heladera: las 3 cuotas ya pagadas → finalizado.
      ]
      vi.mocked(loadFinanceData).mockResolvedValue(
        baseFinanceData({ installmentPlans: [planNotebook, planHeladera], transactions }),
      )
      const r = await executeToolWith(readTools, 'get_installments_status', {}, baseCtx)
      expect(r.ok).toBe(true)
      expect(r.data).toEqual([
        {
          id: 1,
          descripcion: 'Notebook',
          cuotasPagadas: 3,
          cuotasRestantes: 3,
          montoRestante: 30000,
          progreso: 50,
          finalizado: false,
        },
        {
          id: 2,
          descripcion: 'Heladera',
          cuotasPagadas: 3,
          cuotasRestantes: 0,
          montoRestante: 0,
          progreso: 100,
          finalizado: true,
        },
      ])
    })

    it('filtra por busqueda (case-insensitive, inclusión parcial)', async () => {
      vi.mocked(loadFinanceData).mockResolvedValue(
        baseFinanceData({ installmentPlans: [planNotebook, planHeladera], transactions: [] }),
      )
      const r = await executeToolWith(readTools, 'get_installments_status', { busqueda: 'note' }, baseCtx)
      expect(r.ok).toBe(true)
      const data = r.data as Array<{ descripcion: string }>
      expect(data).toHaveLength(1)
      expect(data[0].descripcion).toBe('Notebook')
    })

    it('recorta a un máximo de 20 planes', async () => {
      const plans: InstallmentPlan[] = []
      for (let i = 0; i < 25; i++) {
        plans.push({
          id: i,
          user_id: 1,
          description: `Plan ${i}`,
          total_amount: 1000,
          installments_count: 1,
          purchase_date: '2026-01-01',
          category_id: null,
          created_at: '2026-01-01',
          payment_method_id: null,
        } as InstallmentPlan)
      }
      vi.mocked(loadFinanceData).mockResolvedValue(baseFinanceData({ installmentPlans: plans, transactions: [] }))
      const r = await executeToolWith(readTools, 'get_installments_status', {}, baseCtx)
      expect(r.ok).toBe(true)
      expect((r.data as unknown[]).length).toBe(20)
    })
  })

  describe('list_recurring_plans', () => {
    const planNetflix = {
      id: 1,
      user_id: 1,
      description: 'Netflix',
      amount: 5000,
      currency: 'ARS',
      frequency: 'monthly',
      is_active: true,
      category_id: null,
      created_at: '2026-01-01',
      payment_method_id: null,
      original_amount: null,
      rate_pair: null,
      exchange_rate: null,
    } as RecurringPlan

    const planSpotify = {
      id: 2,
      user_id: 1,
      description: 'Spotify',
      amount: 2000,
      currency: 'ARS',
      frequency: 'monthly',
      is_active: true,
      category_id: null,
      created_at: '2026-01-01',
      payment_method_id: null,
      original_amount: null,
      rate_pair: null,
      exchange_rate: null,
    } as RecurringPlan

    const planGimnasio = {
      id: 3,
      user_id: 1,
      description: 'Gimnasio',
      amount: 8000,
      currency: 'ARS',
      frequency: 'monthly',
      is_active: false, // inactiva: no debe listarse
      category_id: null,
      created_at: '2026-01-01',
      payment_method_id: null,
      original_amount: null,
      rate_pair: null,
      exchange_rate: null,
    } as RecurringPlan

    it('lista activas con monto y pendienteEsteMes según transacciones del mes', async () => {
      const txSpotify = tx({
        id: 1,
        description: 'Spotify',
        recurring_plan_id: 2,
        amount: 2000,
        date: '2026-07-03',
        periodDate: '2026-07-03',
        type: 'expense',
        payment_method_id: 2,
      })
      vi.mocked(loadFinanceData).mockResolvedValue(
        baseFinanceData({ recurringPlans: [planNetflix, planSpotify, planGimnasio], transactions: [txSpotify] }),
      )
      const r = await executeToolWith(readTools, 'list_recurring_plans', {}, baseCtx)
      expect(r.ok).toBe(true)
      expect(r.data).toEqual([
        { id: 1, descripcion: 'Netflix', monto: 5000, frecuencia: 'monthly', pendienteEsteMes: true },
        { id: 2, descripcion: 'Spotify', monto: 2000, frecuencia: 'monthly', pendienteEsteMes: false },
      ])
    })

    it('recorta a un máximo de 20 planes activos', async () => {
      const plans: RecurringPlan[] = []
      for (let i = 0; i < 25; i++) {
        plans.push({
          id: i,
          user_id: 1,
          description: `Plan ${i}`,
          amount: 100,
          currency: 'ARS',
          frequency: 'monthly',
          is_active: true,
          category_id: null,
          created_at: '2026-01-01',
          payment_method_id: null,
          original_amount: null,
          rate_pair: null,
          exchange_rate: null,
        } as RecurringPlan)
      }
      vi.mocked(loadFinanceData).mockResolvedValue(baseFinanceData({ recurringPlans: plans, transactions: [] }))
      const r = await executeToolWith(readTools, 'list_recurring_plans', {}, baseCtx)
      expect(r.ok).toBe(true)
      expect((r.data as unknown[]).length).toBe(20)
    })
  })

  describe('list_goals_and_budgets', () => {
    it('devuelve metas y presupuestos con progreso/estado calculados', async () => {
      const ctx: AgentContext = {
        ...baseCtx,
        supabase: createSupabaseMock({
          savings_goals: [
            {
              id: 'g1',
              user_id: 'uuid-1',
              name: 'Viaje',
              type: 'one_time',
              target_amount: 500000,
              currency: 'ARS',
              target_date: '2026-12-31',
              is_active: true,
              created_at: '2026-01-01',
            },
            {
              id: 'g2',
              user_id: 'uuid-1',
              name: 'Ahorro mensual',
              type: 'monthly',
              target_amount: 50000,
              currency: 'ARS',
              target_date: null,
              is_active: true,
              created_at: '2026-01-01',
            },
          ],
          savings_goal_contributions: [
            { id: 'sc1', goal_id: 'g1', user_id: 'uuid-1', amount: 200000, currency: 'ARS', note: null, date: '2026-05-01', created_at: '2026-05-01' },
            { id: 'sc2', goal_id: 'g2', user_id: 'uuid-1', amount: 50000, currency: 'ARS', note: null, date: '2026-07-05', created_at: '2026-07-05' },
          ],
          category_budgets: [
            { id: 'b1', user_id: 'uuid-1', category_id: 'c1', amount: 30000, currency: 'ARS', is_active: true, created_at: '2026-01-01' },
          ],
        }),
      }
      const txComida = tx({
        id: 1,
        description: 'Super',
        category_id: 'c1',
        amount: 26000,
        date: '2026-07-08',
        periodDate: '2026-07-08',
        type: 'expense',
        payment_method_id: 2,
      })
      vi.mocked(loadFinanceData).mockResolvedValue(baseFinanceData({ transactions: [txComida] }))

      const r = await executeToolWith(readTools, 'list_goals_and_budgets', {}, ctx)
      expect(r.ok).toBe(true)
      expect(r.data).toEqual({
        metas: [
          { nombre: 'Viaje', tipo: 'one_time', objetivo: 500000, progreso: 40, estado: 'activa' },
          { nombre: 'Ahorro mensual', tipo: 'monthly', objetivo: 50000, progreso: 100, estado: 'completada' },
        ],
        presupuestos: [
          { categoria: 'Comida', limite: 30000, gastado: 26000, porcentaje: 86.7, estado: 'alerta' },
        ],
      })
    })

    it('sin metas ni presupuestos devuelve arrays vacíos', async () => {
      const ctx: AgentContext = { ...baseCtx, supabase: createSupabaseMock({}) }
      vi.mocked(loadFinanceData).mockResolvedValue(baseFinanceData())
      const r = await executeToolWith(readTools, 'list_goals_and_budgets', {}, ctx)
      expect(r.ok).toBe(true)
      expect(r.data).toEqual({ metas: [], presupuestos: [] })
    })
  })

  describe('get_portfolio_status', () => {
    it('devuelve el resumen de handlePortfolio cuando hay inversiones (tablas v2)', async () => {
      const ctx: AgentContext = {
        ...baseCtx,
        supabase: createSupabaseMock({
          investment_assets: [
            {
              id: 'a1',
              user_id: 'uuid-1',
              ticker: 'GGAL',
              name: 'Grupo Galicia',
              asset_type: 'stock',
              currency: 'ARS',
              metadata: {},
              is_active: true,
            },
          ],
          investment_transactions: [
            {
              id: 't1',
              asset_id: 'a1',
              user_id: 'uuid-1',
              type: 'buy',
              quantity: 10,
              price_per_unit: 100,
              total_amount: 1000,
              fees: 0,
              currency: 'ARS',
              date: '2026-06-01',
            },
          ],
          market_prices: [{ ticker: 'GGAL', last_price: 150, last_update: '2026-07-08' }],
          // exchange_rates y savings ausentes → el mock devuelve []
        }),
      }
      vi.mocked(loadFinanceData).mockResolvedValue(baseFinanceData())
      const r = await executeToolWith(readTools, 'get_portfolio_status', {}, ctx)
      expect(r.ok).toBe(true)
      const data = r.data as { resumen: string }
      expect(data.resumen).toContain('Grupo Galicia')
      // 10 × 150 con PPC 100 → +50.0% (número calculado por lib/finance, no por el LLM)
      expect(data.resumen).toContain('+50.0%')
    })

    it('sin inversiones devuelve el mensaje correspondiente', async () => {
      const ctx: AgentContext = { ...baseCtx, supabase: createSupabaseMock({ investment_assets: [] }) }
      const r = await executeToolWith(readTools, 'get_portfolio_status', {}, ctx)
      expect(r.ok).toBe(true)
      const data = r.data as { resumen: string }
      expect(data.resumen).toContain('No tenés inversiones')
    })

    it('si la query falla devuelve ok:false con el mensaje de error', async () => {
      const ctx: AgentContext = { ...baseCtx, supabase: createSupabaseMock({ investment_assets: 'ERROR' }) }
      const r = await executeToolWith(readTools, 'get_portfolio_status', {}, ctx)
      expect(r.ok).toBe(false)
      expect(r.error).toBeDefined()
    })
  })
})
