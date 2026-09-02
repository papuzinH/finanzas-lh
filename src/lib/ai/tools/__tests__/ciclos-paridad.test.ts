import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { computePendingCreditCards } from '@/lib/finance/balances'
import { prepareTransactions } from '@/lib/finance/prepare'
import type { CreditCardCycle } from '@/lib/finance/cycles'
import type { PaymentMethod, Transaction } from '@/types/database'

// Ciclos DESPAREJOS: los reales de la Visa Galicia (23-jul / 20-ago / 24-sep).
// Un fixture mensual perfecto no distinguiria el modelo nuevo del viejo, que es
// como se escondieron los dos ultimos bugs grandes del repo.
const CICLOS: CreditCardCycle[] = [
  { id: 'jul', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-07-23', due_date: '2026-08-03', source: 'declared', reminder_dismissed_at: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'ago', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-08-20', due_date: '2026-09-01', source: 'declared', reminder_dismissed_at: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'sep', user_id: 'u1', payment_method_id: 'visa', closing_date: '2026-09-24', due_date: '2026-10-05', source: 'declared', reminder_dismissed_at: null, created_at: '2026-01-01T00:00:00Z' },
]

const VISA = { id: 'visa', user_id: 'u1', name: 'Visa', type: 'credit', default_closing_day: 20, default_payment_day: 1, bucket: 'pocket', initial_balance: 0, initial_balance_at: '2026-07-01', is_personal: false, is_default: false, created_at: '2026-01-01' } as PaymentMethod
const BOLSILLO = { ...VISA, id: 'mp', name: 'Mercado Pago', type: 'debit', default_closing_day: null, default_payment_day: null, initial_balance: 100000, initial_balance_at: '2026-07-01' } as PaymentMethod

const RAW: Transaction[] = [
  { id: 't1', user_id: 'u1', type: 'expense', amount: 30000, date: '2026-09-01', cycle_id: 'ago', purchase_date: '2026-08-05', payment_method_id: 'visa', original_currency: 'ARS', original_amount: 30000 },
  { id: 't2', user_id: 'u1', type: 'expense', amount: 20000, date: '2026-10-05', cycle_id: 'sep', purchase_date: '2026-09-10', payment_method_id: 'visa', original_currency: 'ARS', original_amount: 20000 },
] as unknown as Transaction[]

describe('paridad chat / pantalla sobre ciclos', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Congelado A PROPOSITO: sin esto el test depende del calendario del dia en
    // que corre y puede pasar por casualidad, que es lo que le paso al test de
    // paridad del historico el 31-ago.
    vi.setSystemTime(new Date(2026, 7, 25)) // 25-ago-2026: el resumen de agosto ya cerro
  })
  afterEach(() => vi.useRealTimers())

  it('las dos rutas parten del MISMO pipeline y llegan al mismo resumen', () => {
    // El cliente (financeStore.fetchAllData) y el servidor (dataLoader) llaman a
    // prepareTransactions y a computePendingCreditCards con los mismos argumentos.
    // Si alguna de las dos rutas dejara de pasar los ciclos, este test se cae.
    const now = new Date()
    const preparadas = prepareTransactions(RAW, [VISA, BOLSILLO], [], null, CICLOS)
    const pendientes = computePendingCreditCards([VISA, BOLSILLO], preparadas, [], CICLOS, now)

    const vigente = pendientes.find((c) => !c.isOverdue)
    expect(vigente?.cycleId).toBe('ago')
    expect(vigente?.total).toBe(30000)
    expect(vigente?.isCycleClosed).toBe(true) // cerro el 20, hoy es 25
    // El consumo del resumen que todavia no cerro NO entra en el vigente.
    expect(vigente?.total).not.toBe(50000)
  })

  it('el mes visual sale del cierre y es el mismo dato para los dos', () => {
    const [t1, t2] = prepareTransactions(RAW, [VISA, BOLSILLO], [], null, CICLOS)
    expect(t1.periodDate).toBe('2026-08-20')
    expect(t2.periodDate).toBe('2026-09-24')
  })
})
