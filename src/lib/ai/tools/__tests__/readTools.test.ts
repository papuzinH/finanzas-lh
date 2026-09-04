import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readTools } from '@/lib/ai/tools/readTools'
import { executeToolWith } from '@/lib/ai/tools/registry'
import { loadFinanceData } from '@/lib/ai/tools/dataLoader'
import { useFinanceStore } from '@/lib/store/financeStore'
import type { AgentContext } from '@/lib/ai/tools/types'
import type { FinanceData } from '@/lib/ai/tools/dataLoader'
import type { ProcessedTransaction } from '@/lib/finance/types'
import type { CreditCardCycle } from '@/lib/finance/cycles'
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
  bucket: 'pocket',
  initial_balance_at: null,
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

// Ciclo vigente de la Visa (cierra 20, vence 10) visto desde el "hoy" del dataset
// (2026-07-08): cerró el 2026-06-20, vence el 2026-07-10.
const cicloVisaJulio: CreditCardCycle = {
  id: 'visa-jul',
  user_id: '1',
  payment_method_id: '1',
  closing_date: '2026-06-20',
  due_date: '2026-07-10',
  source: 'generated',
  created_at: '2026-01-01T00:00:00Z',
  reminder_dismissed_at: null,
}

// Compra en Visa imputada (cycle_id) al ciclo vigente.
const txVisaCompra = tx({
  id: '3',
  description: 'Compra',
  amount: 15000,
  date: '2026-07-10',
  type: 'expense',
  payment_method_id: '1',
  periodDate: '2026-07-10',
  realPaymentDate: '2026-07-10',
  cycle_id: cicloVisaJulio.id,
})

const financeData: FinanceData = {
  transactions: [txSueldo, txSuper, txVisaCompra],
  paymentMethods: [pmVisa, pmDebito],
  recurringPlans: [planNetflix],
  internalTransfers: [],
  categories: [],
  installmentPlans: [],
  creditCardCycles: [cicloVisaJulio],
  incomeRhythm: 'monthly',
  inflacion: [],
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
    it('devuelve el disponible del bolsillo, con las cuentas y lo comprometido', async () => {
      const r = await executeToolWith(readTools, 'get_balance_snapshot', {}, ctx)
      expect(r.ok).toBe(true)
      const d = r.data as Record<string, unknown>
      expect(d).toHaveProperty('disponible')
      expect(d).toHaveProperty('enTusCuentas')
      expect(d).toHaveProperty('comprometido')
      expect(d).toHaveProperty('cuentas')
    })

    it('calcula los valores exactos a partir del dataset (a mano)', async () => {
      const r = await executeToolWith(readTools, 'get_balance_snapshot', {}, ctx)
      expect(r.ok).toBe(true)
      const d = r.data as Record<string, number>
      // El debito no esta anclado: suma su historial (200000 ingresos - 30000 gasto = 170000).
      // La Visa no tiene saldo: su resumen (15000) vence el 10-jul, dentro del mes → comprometido.
      // Netflix (5000) no tiene medio asignado, asi que no es un fijo de credito: tambien comprometido.
      expect(d.enTusCuentas).toBe(170000)
      expect(d.comprometido).toBe(20000)
      expect(d.disponible).toBe(150000)
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
          bolsillo: true,
          saldoDeclarado: false,
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
      expect(r.data).toEqual({
        medio: 'Débito Galicia',
        tipo: 'debit',
        saldo: 170000,
        bolsillo: true,
        saldoDeclarado: false,
      })
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

    it('cuenta los ingresos con el mismo criterio que la pantalla', async () => {
      // La garantia estructural del repo: la pantalla y el chat no pueden decir
      // numeros distintos. Se comparan las DOS puntas sobre el MISMO conjunto de
      // filas -- el chat via get_monthly_summary, la pantalla via getMonthlyIncome()
      // del store -- no solo el lado del chat contra un numero fijo.
      vi.setSystemTime(new Date('2026-09-03T12:00:00'))

      // Cobro del 29 de agosto imputado a septiembre (income_period): igual que
      // hace prepareTransactions (Task 3), periodDate sigue al mes declarado.
      const txCobroImputado = tx({
        id: '4',
        description: 'Cobro imputado',
        amount: 100000,
        date: '2026-08-29',
        type: 'income',
        payment_method_id: '2',
        periodDate: '2026-09-01',
        realPaymentDate: '2026-08-29',
        income_period: '2026-09-01',
      })
      const transactions = [...financeData.transactions, txCobroImputado]

      vi.mocked(loadFinanceData).mockResolvedValueOnce({ ...financeData, transactions })

      const r = await executeToolWith(readTools, 'get_monthly_summary', { mes: '2026-09' }, ctx)
      expect(r.ok).toBe(true)
      const d = r.data as Record<string, unknown>
      // El fixture incluye un ingreso con date 2026-08-29 e income_period
      // 2026-09-01: aparece en el total de septiembre.
      expect(d.mes).toBe('2026-09')
      expect(d.ingresos).toBe(100000)

      // Las MISMAS filas, del lado de la pantalla: el store, con el mismo reloj.
      useFinanceStore.setState({ transactions } as never)
      const ingresosPantalla = useFinanceStore.getState().getMonthlyIncome()
      expect(ingresosPantalla).toBe(100000)
      expect(ingresosPantalla).toBe(d.ingresos)
    })
  })
})
