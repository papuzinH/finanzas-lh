import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readTools } from '@/lib/ai/tools/readTools'
import { executeToolWith } from '@/lib/ai/tools/registry'
import { loadFinanceData } from '@/lib/ai/tools/dataLoader'
import type { AgentContext } from '@/lib/ai/tools/types'
import type { FinanceData } from '@/lib/ai/tools/dataLoader'
import type { ProcessedTransaction } from '@/lib/finance/types'
import type { PaymentMethod, RecurringPlan } from '@/types/database'

vi.mock('@/lib/ai/tools/dataLoader', () => ({
  loadFinanceData: vi.fn(),
}))

const ctx: AgentContext = {
  supabase: {} as AgentContext['supabase'],
  userId: '1',
  authUserId: 'uuid-1',
  today: '2026-07-08',
}

// --- Dataset fijo: "hoy" = 2026-07-08. Visa cierra el 20, vence el 10. ---
const pmVisa = {
  id: '1',
  user_id: '1',
  name: 'Visa',
  type: 'credit',
  default_closing_day: 20,
  default_payment_day: 10,
  is_personal: false,
  is_default: false,
  created_at: '2026-01-01',
} as PaymentMethod

const pmDebito = {
  id: '2',
  user_id: '1',
  name: 'Débito Galicia',
  type: 'debit',
  default_closing_day: null,
  default_payment_day: null,
  is_personal: false,
  is_default: true,
  created_at: '2026-01-01',
} as PaymentMethod

const planNetflix = {
  id: '1',
  user_id: '1',
  description: 'Netflix',
  amount: 5000,
  currency: 'ARS',
  frequency: 'monthly',
  is_active: true,
  category_id: 'c1',
  created_at: '2026-01-01',
  payment_method_id: null,
  original_amount: null,
  rate_pair: null,
  exchange_rate: null,
} as RecurringPlan

function tx(overrides: Partial<ProcessedTransaction>): ProcessedTransaction {
  return {
    id: '0',
    user_id: '1',
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

// Sueldo: ingreso de julio en Débito.
const txSueldo = tx({
  id: '1',
  description: 'Sueldo',
  amount: 200000,
  date: '2026-07-05',
  type: 'income',
  payment_method_id: '2',
  periodDate: '2026-07-05',
  realPaymentDate: '2026-07-05',
})

// Super: gasto variable en Débito.
const txSuper = tx({
  id: '2',
  description: 'Super',
  amount: 30000,
  date: '2026-07-06',
  type: 'expense',
  payment_method_id: '2',
  periodDate: '2026-07-06',
  realPaymentDate: '2026-07-06',
})

// Compra en Visa cuyo vencimiento (t.date) cae en el ciclo vigente (nextPaymentDate 2026-07-10).
const txVisaCompra = tx({
  id: '3',
  description: 'Compra',
  amount: 15000,
  date: '2026-07-10',
  type: 'expense',
  payment_method_id: '1',
  periodDate: '2026-07-10',
  realPaymentDate: '2026-07-10',
})

const financeData: FinanceData = {
  transactions: [txSueldo, txSuper, txVisaCompra],
  paymentMethods: [pmVisa, pmDebito],
  recurringPlans: [planNetflix],
  internalTransfers: [],
  categories: [],
  installmentPlans: [],
}

describe('readTools', () => {
  beforeEach(() => {
    vi.mocked(loadFinanceData).mockResolvedValue(financeData)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 8, 10, 0, 0)) // 8 jul 2026, 10hs
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('get_balance_snapshot', () => {
    it('devuelve disponibleReal, saldoBruto y pendientes', async () => {
      const r = await executeToolWith(readTools, 'get_balance_snapshot', {}, ctx)
      expect(r.ok).toBe(true)
      const d = r.data as Record<string, unknown>
      expect(d).toHaveProperty('disponibleReal')
      expect(d).toHaveProperty('saldoBruto')
      expect(d).toHaveProperty('mensualidadesPendientes')
      expect(d).toHaveProperty('tarjetasPendientes')
    })

    it('calcula los valores exactos a partir del dataset (a mano)', async () => {
      const r = await executeToolWith(readTools, 'get_balance_snapshot', {}, ctx)
      expect(r.ok).toBe(true)
      // disponibleReal = ingresos(200000) - gastos variables(30000+15000) - mensualidades pendientes(5000) = 150000
      // saldoBruto = disponibleReal + mensualidadesPendientes(5000) + tarjetasPendientes(15000) = 170000
      expect(r.data).toEqual({
        disponibleReal: 150000,
        saldoBruto: 170000,
        mensualidadesPendientes: {
          total: 5000,
          items: [{ id: '1', name: 'Netflix', amount: 5000 }],
        },
        tarjetasPendientes: [
          { tarjeta: 'Visa', total: 15000, vence: '2026-07-10', estado: 'cerrado' },
        ],
      })
    })
  })

  describe('get_payment_method_status', () => {
    it('sin nombre lista todos los medios con su estado resumido', async () => {
      const r = await executeToolWith(readTools, 'get_payment_method_status', {}, ctx)
      expect(r.ok).toBe(true)
      expect(r.data).toEqual([
        {
          medio: 'Visa',
          tipo: 'credit',
          totalAPagar: 15000,
          vencimiento: '2026-07-10',
          cierre: '2026-06-20',
          arsExpenses: 15000,
          usdExpenses: 0,
          estado: 'cerrado',
        },
        {
          medio: 'Débito Galicia',
          tipo: 'debit',
          saldo: 170000, // 200000 ingresos - 30000 gasto
        },
      ])
    })

    it('con nombre parcial (case-insensitive) devuelve el detalle de crédito', async () => {
      const r = await executeToolWith(readTools, 'get_payment_method_status', { nombre: 'visa' }, ctx)
      expect(r.ok).toBe(true)
      expect(r.data).toEqual({
        medio: 'Visa',
        tipo: 'credit',
        totalAPagar: 15000,
        vencimiento: '2026-07-10',
        cierre: '2026-06-20',
        arsExpenses: 15000,
        usdExpenses: 0,
        estado: 'cerrado',
      })
    })

    it('con nombre de débito devuelve el saldo', async () => {
      const r = await executeToolWith(readTools, 'get_payment_method_status', { nombre: 'galicia' }, ctx)
      expect(r.ok).toBe(true)
      expect(r.data).toEqual({ medio: 'Débito Galicia', tipo: 'debit', saldo: 170000 })
    })

    it('con nombre inexistente → error con lista de medios disponibles', async () => {
      const r = await executeToolWith(readTools, 'get_payment_method_status', { nombre: 'Naranja' }, ctx)
      expect(r.ok).toBe(false)
      expect(r.error).toBe('No encontré "Naranja". Medios: Visa, Débito Galicia')
    })
  })

  describe('get_monthly_summary', () => {
    it('sin mes usa el mes actual', async () => {
      const r = await executeToolWith(readTools, 'get_monthly_summary', {}, ctx)
      expect(r.ok).toBe(true)
      const d = r.data as Record<string, unknown>
      expect(d.mes).toBe('2026-07')
    })

    it('calcula ingresos/gastos/balance del mes actual a partir del dataset', async () => {
      const r = await executeToolWith(readTools, 'get_monthly_summary', {}, ctx)
      expect(r.ok).toBe(true)
      // ingresos = 200000 (sueldo); gastos = 30000 (super) + 15000 (visa) = 45000
      // balance = computeMonthlyBalance: (200000-30000-15000) - mensualidad pendiente(5000) = 150000
      expect(r.data).toEqual({ mes: '2026-07', ingresos: 200000, gastos: 45000, balance: 150000 })
    })

    it('con mes explícito sin movimientos devuelve todo en cero', async () => {
      const r = await executeToolWith(readTools, 'get_monthly_summary', { mes: '2026-06' }, ctx)
      expect(r.ok).toBe(true)
      expect(r.data).toEqual({ mes: '2026-06', ingresos: 0, gastos: 0, balance: 0 })
    })

    it('mes con formato inválido → error de validación', async () => {
      const r = await executeToolWith(readTools, 'get_monthly_summary', { mes: '2026/07' }, ctx)
      expect(r.ok).toBe(false)
      expect(r.error).toBeDefined()
    })
  })
})
