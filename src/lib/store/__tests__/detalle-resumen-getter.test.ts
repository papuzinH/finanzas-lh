import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFinanceStore } from '../financeStore'
import { computePendingCreditCards } from '@/lib/finance/balances'
import type { CreditCardCycle } from '@/lib/finance/cycles'

const ciclo = (over: Partial<CreditCardCycle>): CreditCardCycle => ({
  id: 'c1', user_id: 'u1', payment_method_id: 'visa',
  closing_date: '2026-07-23', due_date: '2026-08-03',
  source: 'generated', created_at: '2026-01-01T00:00:00Z',
  reminder_dismissed_at: null,
  ...over,
})

const JULIO = ciclo({ id: 'jul', closing_date: '2026-07-23', due_date: '2026-08-03' })
const AGOSTO = ciclo({ id: 'ago', closing_date: '2026-08-20', due_date: '2026-09-01' })
const SEPTIEMBRE = ciclo({ id: 'sep', closing_date: '2026-09-24', due_date: '2026-10-05' })

const visa = {
  id: 'visa', user_id: 'u1', name: 'Visa Galicia', type: 'credit',
  default_closing_day: 20, default_payment_day: 1, created_at: '2026-01-01',
  is_personal: false, is_default: false, bucket: 'pocket',
  initial_balance: 0, initial_balance_at: null,
}

const compra = (over: Record<string, unknown>) => ({
  id: 't1', user_id: 'u1', payment_method_id: 'visa', cycle_id: 'ago',
  amount: 1000, type: 'expense', description: 'Compra', date: '2026-09-01',
  purchase_date: '2026-08-05', category_id: 'cat1', created_at: '2026-08-05T10:00:00Z',
  card_payment_for: null, installment_plan_id: null, recurring_plan_id: null,
  original_amount: null, original_currency: null, is_balance_adjustment: false,
  ...over,
})

function sembrar(transactions: unknown[]) {
  useFinanceStore.setState({
    paymentMethods: [visa],
    creditCardCycles: [JULIO, AGOSTO, SEPTIEMBRE],
    recurringPlans: [],
    transactions,
    isInitialized: true,
  } as never)
}

describe('getCardCycleDetail', () => {
  beforeEach(() => {
    sembrar([
      compra({ id: 'a', cycle_id: 'ago', amount: 15000, purchase_date: '2026-08-05' }),
      compra({ id: 'b', cycle_id: 'ago', amount: 5000, purchase_date: '2026-07-30' }),
      compra({ id: 'vieja', cycle_id: 'jul', amount: 9000, purchase_date: null }),
    ])
  })

  it('devuelve los tres resumenes navegables de la tarjeta', () => {
    const d = useFinanceStore.getState().getCardCycleDetail('visa')
    expect(d?.resumenes.map((r) => r.id)).toEqual(['jul', 'ago', 'sep'])
  })

  it('sin cycleId abre en el resumen vigente', () => {
    // El getter usa la fecha real del sistema; lo que se fija acá es que `actual`
    // sea SIEMPRE uno de los resumenes de la tarjeta y nunca null habiendo ciclos.
    const d = useFinanceStore.getState().getCardCycleDetail('visa')
    expect(d?.actual).not.toBeNull()
    expect(d?.resumenes.map((r) => r.id)).toContain(d?.actual?.id)
  })

  it('con cycleId abre en ese resumen y trae sus filas ordenadas', () => {
    const d = useFinanceStore.getState().getCardCycleDetail('visa', 'ago')
    expect(d?.actual?.id).toBe('ago')
    expect(d?.filas.conFecha.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('la deuda del resumen es positiva cuando debes', () => {
    const d = useFinanceStore.getState().getCardCycleDetail('visa', 'ago')
    expect(d?.deuda).toBe(20000)
  })

  it('un resumen sin movimientos da deuda cero y no desaparece', () => {
    const d = useFinanceStore.getState().getCardCycleDetail('visa', 'sep')
    expect(d?.actual?.id).toBe('sep')
    expect(d?.deuda).toBe(0)
    expect(d?.filas).toEqual({ conFecha: [], sinFecha: [] })
  })

  it('las filas sin fecha de compra llegan separadas', () => {
    const d = useFinanceStore.getState().getCardCycleDetail('visa', 'jul')
    expect(d?.filas.sinFecha.map((t) => t.id)).toEqual(['vieja'])
  })

  it('un cycleId que no es de esta tarjeta cae al vigente en vez de romper', () => {
    const d = useFinanceStore.getState().getCardCycleDetail('visa', 'no-existe')
    expect(d?.actual).not.toBeNull()
    expect(d?.resumenes.map((r) => r.id)).toContain(d?.actual?.id)
  })

  it('un medio que no es de credito devuelve null', () => {
    useFinanceStore.setState({
      paymentMethods: [{ ...visa, id: 'mp', type: 'debit', name: 'Mercado Pago' }],
    } as never)
    expect(useFinanceStore.getState().getCardCycleDetail('mp')).toBeNull()
  })
})

describe('paridad con Compromisos', () => {
  // EL RELOJ VA CONGELADO. Sin esto el test pasa por casualidad del calendario:
  // con la fecha real, el ciclo vigente seria 'sep', que no tiene movimientos, asi
  // que resumenDelCiclo devuelve null, computePendingCreditCards devuelve [] y el
  // for no itera -- verde sin haber comparado nada. Es literalmente el defecto que
  // el plan del historico encontro en SU test de paridad el 31-ago.
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-25T12:00:00')) })
  afterEach(() => { vi.useRealTimers() })

  it('la deuda del resumen vigente es IDENTICA a la que muestra Compromisos', () => {
    // El invariante de la pantalla: el detalle no puede contradecir al numero que
    // el usuario ya vio. Si esto se rompe, es el bug del 31-ago otra vez.
    sembrar([
      compra({ id: 'a', cycle_id: 'ago', amount: 15000 }),
      compra({ id: 'b', cycle_id: 'ago', amount: 5000 }),
    ])
    const s = useFinanceStore.getState()
    const desdeCompromisos = computePendingCreditCards(
      s.paymentMethods, s.transactions, s.recurringPlans, s.creditCardCycles, new Date(),
    )
    // Sin esta linea el test es vacuo: verifica que un for vacio no falle.
    expect(desdeCompromisos.length).toBeGreaterThan(0)

    for (const resumen of desdeCompromisos) {
      const d = s.getCardCycleDetail(resumen.methodId, resumen.cycleId)
      expect(d?.deuda).toBe(resumen.total)
      expect(d?.totalARS).toBe(resumen.totalARS)
      expect(d?.totalUSD).toBe(resumen.totalUSD)
    }
  })
})
