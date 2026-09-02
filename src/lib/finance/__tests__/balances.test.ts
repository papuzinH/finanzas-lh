import { describe, it, expect } from 'vitest'
import {
  computePaymentMethodStatus,
  computeGlobalBalance,
  computePendingCreditCards,
  hasCardPaymentInCycle,
} from '@/lib/finance/balances'
import type { PaymentMethod, RecurringPlan } from '@/types/database'
import type { ProcessedTransaction } from '@/lib/finance/types'
import type { CreditCardCycle } from '@/lib/finance/cycles'

// Builders duplicados de src/lib/finance/__tests__/creditCycle.test.ts (Task 1).
// YAGNI: no se extrae un helper compartido hasta el tercer uso real.
const credit = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: '1', user_id: '1', name: 'Visa', type: 'credit',
  default_closing_day: 19, default_payment_day: 1,
  is_default: false, is_personal: false, created_at: '2025-01-01',
  ...over,
} as PaymentMethod)

const tx = (over: Partial<ProcessedTransaction> = {}): ProcessedTransaction => ({
  id: '1', user_id: '1', description: 'x', amount: 100, date: '2026-07-05',
  type: 'expense', category_id: null, payment_method_id: '1',
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  periodDate: '2026-07-05', realPaymentDate: '2026-07-05',
  ...over,
} as ProcessedTransaction)

const plan = (over: Partial<RecurringPlan> = {}): RecurringPlan =>
  ({
    id: '1', description: 'Plan', amount: 1000, is_active: true,
    payment_method_id: '1', currency: 'ARS', original_amount: null,
    ...over,
  }) as RecurringPlan

const cycle = (over: Partial<CreditCardCycle> = {}): CreditCardCycle => ({
  id: 'c1', user_id: '1', payment_method_id: '1',
  closing_date: '2026-07-19', due_date: '2026-08-01',
  source: 'generated', created_at: '2026-01-01T00:00:00Z',
  reminder_dismissed_at: null,
  ...over,
})

describe('computePaymentMethodStatus (crédito)', () => {
  // tarjeta cierre 19 vence 1; hoy 15 jul 2026 -> ciclo vigente cierra 19-jul, vence 1-ago
  const cicloVigenteFixture = cycle({ closing_date: '2026-07-19', due_date: '2026-08-01' })

  it('suma al ciclo solo tx cuyo cycle_id coincide con el ciclo vigente; separa ARS/USD', () => {
    const now = new Date(2026, 6, 15)
    const transactions = [
      tx({ payment_method_id: '1', type: 'expense', date: '2026-08-01', amount: -1000, cycle_id: 'c1' }),
      tx({
        id: '2', payment_method_id: '1', type: 'expense', date: '2026-08-01',
        amount: -12000, original_currency: 'USD', original_amount: 10, cycle_id: 'c1',
      }),
    ]
    const status = computePaymentMethodStatus(credit(), transactions, [], now, [cicloVigenteFixture])
    expect(status.nextPaymentDate?.getMonth()).toBe(7) // agosto
    expect(status.arsExpenses).toBe(1000)
    expect(status.usdExpenses).toBe(10)
    // expensesInCycleArs = 1000 + 12000 = 13000 -> projectedTotal = -13000
    expect(status.projectedTotal).toBe(-13000)
  })

  it('una tx con cycle_id de OTRO ciclo no entra, aunque su t.date caiga en el mismo mes', () => {
    const now = new Date(2026, 6, 15)
    const transactions = [
      tx({ payment_method_id: '1', type: 'expense', date: '2026-08-01', amount: -1000, cycle_id: 'c1' }),
      tx({ id: '2', payment_method_id: '1', type: 'expense', date: '2026-08-01', amount: -99999, cycle_id: 'otro-ciclo' }),
    ]
    const status = computePaymentMethodStatus(credit(), transactions, [], now, [cicloVigenteFixture])
    expect(status.projectedTotal).toBe(-1000)
  })

  it('mensualidad adherida sin tx en el ciclo se suma; con tx en el ciclo NO se duplica', () => {
    const now = new Date(2026, 6, 15) // nextPaymentDate = 1 ago 2026
    const recurringPlans = [plan({ id: '5', payment_method_id: '1', amount: 2000, currency: 'ARS' })]

    // Sin tx vinculada: la mensualidad se suma al ciclo.
    const withoutTx = computePaymentMethodStatus(credit(), [], recurringPlans, now, [cicloVigenteFixture])
    expect(withoutTx.fixedCosts).toBe(2000)
    expect(withoutTx.projectedTotal).toBe(-2000)

    // Con tx vinculada (recurring_plan_id 5) dentro del ciclo: no se duplica.
    const transactions = [
      tx({ payment_method_id: '1', type: 'expense', date: '2026-08-01', amount: -2000, recurring_plan_id: '5', cycle_id: 'c1' }),
    ]
    const withTx = computePaymentMethodStatus(credit(), transactions, recurringPlans, now, [cicloVigenteFixture])
    expect(withTx.projectedTotal).toBe(-2000)
  })

  it('reintegros (income del ciclo) restan', () => {
    const now = new Date(2026, 6, 15) // nextPaymentDate = 1 ago 2026
    const baseTransactions = [
      tx({ payment_method_id: '1', type: 'expense', date: '2026-08-01', amount: -1000, cycle_id: 'c1' }),
    ]
    const withoutRefund = computePaymentMethodStatus(credit(), baseTransactions, [], now, [cicloVigenteFixture])
    expect(withoutRefund.projectedTotal).toBe(-1000)

    const withRefund = computePaymentMethodStatus(
      credit(),
      [...baseTransactions, tx({ id: '2', payment_method_id: '1', type: 'income', date: '2026-08-01', amount: 500, cycle_id: 'c1' })],
      [],
      now,
      [cicloVigenteFixture],
    )
    // -1000 + 500 = -500 (sube 500 respecto de -1000)
    expect(withRefund.projectedTotal).toBe(-500)
    expect(withRefund.projectedTotal - withoutRefund.projectedTotal).toBe(500)
  })
})

describe('computePaymentMethodStatus (débito)', () => {
  it('saldo histórico ingresos − gastos, cuotas hasta fin de mes', () => {
    const now = new Date(2026, 6, 15) // 15 jul 2026, fin de mes = 31 jul
    const method = credit({ type: 'debit', default_closing_day: null, default_payment_day: null })
    const transactions = [
      tx({ payment_method_id: '1', type: 'income', amount: 10000 }),
      tx({ id: '2', payment_method_id: '1', type: 'expense', amount: -3000 }),
      tx({
        id: '3', payment_method_id: '1', type: 'expense', amount: -1000,
        installment_plan_id: '7', date: '2026-07-31', periodDate: '2026-07-31',
      }),
    ]
    const status = computePaymentMethodStatus(method, transactions, [], now, [])
    expect(status.nextPaymentDate).toBeUndefined()
    // 10000 - 3000 - 1000 = 6000
    expect(status.projectedTotal).toBe(6000)
  })
})

describe('computeGlobalBalance', () => {
  it('resta mensualidades históricas + pendientes del mes (no el burn rate)', () => {
    const now = new Date(2026, 6, 15) // 15 jul 2026
    const transactions = [
      tx({ payment_method_id: '1', type: 'income', amount: 100000 }),
      tx({
        id: '2', payment_method_id: '1', type: 'expense', amount: -10000,
        recurring_plan_id: '9', date: '2026-06-05', periodDate: '2026-06-05',
      }),
    ]
    // recurringPaid (10000, mes pasado) + pendingFixedTotal (10000, mes actual) = 20000
    // 100000 - 20000 = 80000
    const result = computeGlobalBalance(transactions, [credit()], [], 10000, now)
    expect(result).toBe(80000)
  })

  it('excluye pagos de tarjeta (card_payment_for) del gasto', () => {
    const now = new Date(2026, 6, 15)
    const transactions = [
      tx({ payment_method_id: '1', type: 'income', amount: 100000 }),
      tx({ id: '2', payment_method_id: '1', type: 'expense', amount: -20000, card_payment_for: '1' }),
    ]
    // El gasto con card_payment_for no resta: solo queda el ingreso.
    const result = computeGlobalBalance(transactions, [credit()], [], 0, now)
    expect(result).toBe(100000)
  })

  it('cuotas futuras no restan; cuota del mes según ciclo sí', () => {
    const now = new Date(2026, 6, 15) // cierre 19, vence 1 -> ciclo vigente vence 1 ago 2026
    const method = credit() // closing 19, payment 1
    const transactions = [
      // cuota que vence en el ciclo vigente (agosto) -> SÍ resta
      tx({
        payment_method_id: '1', type: 'expense', installment_plan_id: '7',
        date: '2026-08-01', periodDate: '2026-08-01', amount: -5000,
      }),
      // cuota de un ciclo futuro (octubre) -> NO resta
      tx({
        id: '2', payment_method_id: '1', type: 'expense', installment_plan_id: '7',
        date: '2026-10-01', periodDate: '2026-10-01', amount: -5000,
      }),
    ]
    const result = computeGlobalBalance(transactions, [method], [], 0, now)
    expect(result).toBe(-5000)
  })
})

describe('computePendingCreditCards', () => {
  it('isPending true hasta el día del vencimiento inclusive; isPaidManually si hay card_payment_for imputado al ciclo', () => {
    // Master: cierra 2, vence 13. Hoy = 13 jul (día exacto del vencimiento).
    const method = credit({ id: '1', name: 'Master', default_closing_day: 2, default_payment_day: 13 })
    const now = new Date(2026, 6, 13, 10, 0, 0)
    const cycles = [cycle({ id: 'master-jul', closing_date: '2026-07-02', due_date: '2026-07-13' })]
    const baseTransactions = [
      tx({ payment_method_id: '1', type: 'expense', date: '2026-07-13', periodDate: '2026-07-13', amount: -50000, cycle_id: 'master-jul' }),
    ]

    const before = computePendingCreditCards([method], baseTransactions, [], cycles, now)
    expect(before[0].isPending).toBe(true)
    expect(before[0].isPaidManually).toBe(false)

    const paidTransactions = [
      ...baseTransactions,
      tx({
        id: '2', payment_method_id: '2', type: 'expense', date: '2026-07-05',
        periodDate: '2026-07-05', amount: -50000, card_payment_for: '1', cycle_id: 'master-jul',
      }),
    ]
    const after = computePendingCreditCards([method], paidTransactions, [], cycles, now)
    expect(after[0].isPaidManually).toBe(true)
    expect(after[0].isPending).toBe(false)
  })

  it('isCycleClosed cuando el cierre ya pasó', () => {
    const now = new Date(2026, 6, 7, 10, 0, 0) // 7 jul 2026
    // Master cerró el 2 jul (vence 13 jul) -> cerrado
    const master = credit({ id: '1', name: 'Master', default_closing_day: 2, default_payment_day: 13 })
    // Visa cierra el 23 jul (vence 3 ago) -> en curso
    const visa = credit({ id: '2', name: 'Visa', default_closing_day: 23, default_payment_day: 3 })
    const cycles = [
      cycle({ id: 'master-jul', payment_method_id: '1', closing_date: '2026-07-02', due_date: '2026-07-13' }),
      cycle({ id: 'visa-jul', payment_method_id: '2', closing_date: '2026-07-23', due_date: '2026-08-03' }),
    ]
    const transactions = [
      tx({ payment_method_id: '1', type: 'expense', date: '2026-07-13', periodDate: '2026-07-13', amount: -50000, cycle_id: 'master-jul' }),
      tx({ id: '2', payment_method_id: '2', type: 'expense', date: '2026-08-03', periodDate: '2026-08-03', amount: -90000, cycle_id: 'visa-jul' }),
    ]
    const result = computePendingCreditCards([master, visa], transactions, [], cycles, now)
    const masterItem = result.find((i) => i.methodId === '1')
    const visaItem = result.find((i) => i.methodId === '2')
    expect(masterItem?.isCycleClosed).toBe(true)
    expect(visaItem?.isCycleClosed).toBe(false)
  })
})

describe('computePaymentMethodStatus / computePendingCreditCards — tarjeta configurada sin ciclos materializados (Finding 3)', () => {
  // El caso que importa: NO es debito (que nunca entra al branch de credito), es
  // credito CON default_closing_day/default_payment_day pero sin una sola fila en
  // credit_card_cycles todavia -- el escenario real de 2 tarjetas en produccion.
  // cicloVigente([], now) da undefined y el fallback tiene que sostenerse solo.
  it('computePaymentMethodStatus cae al saldo historico, NO "a pagar en el vencimiento"', () => {
    const now = new Date(2026, 6, 15)
    const method = credit({ default_closing_day: 19, default_payment_day: 1 }) // credito, configurada
    const transactions = [
      tx({ payment_method_id: '1', type: 'income', amount: 10000 }),
      tx({ id: '2', payment_method_id: '1', type: 'expense', amount: -3000 }),
    ]
    const status = computePaymentMethodStatus(method, transactions, [], now, []) // cycles: nada materializado
    expect(status.nextPaymentDate).toBeUndefined()
    expect(status.projectedTotal).toBe(7000) // 10000 - 3000, igual que debito/efectivo
  })

  it('computePendingCreditCards no la lista: no se le inventa un ciclo', () => {
    const now = new Date(2026, 6, 15)
    const method = credit({ default_closing_day: 19, default_payment_day: 1 })
    const transactions = [tx({ payment_method_id: '1', type: 'expense', amount: -50000 })]
    const r = computePendingCreditCards([method], transactions, [], [], now)
    expect(r).toHaveLength(0)
  })
})

describe('hasCardPaymentInCycle', () => {
  const ciclo = cycle({ id: 'master-jul', closing_date: '2026-07-02', due_date: '2026-07-13' })

  it('true si hay una transacción card_payment_for imputada (cycle_id) a este ciclo', () => {
    const method = credit({ id: '1', default_closing_day: 2, default_payment_day: 13 })
    const transactions = [
      tx({ payment_method_id: '2', type: 'expense', date: '2026-07-05', card_payment_for: '1', cycle_id: 'master-jul', amount: -50000 }),
    ]
    expect(hasCardPaymentInCycle(transactions, method, ciclo)).toBe(true)
  })

  it('false sin pago vinculado, o si el pago apunta a otro ciclo', () => {
    const method = credit({ id: '1', default_closing_day: 2, default_payment_day: 13 })
    expect(hasCardPaymentInCycle([], method, ciclo)).toBe(false)

    const pagoDeOtroCiclo = tx({ card_payment_for: '1', cycle_id: 'otro-ciclo' })
    expect(hasCardPaymentInCycle([pagoDeOtroCiclo], method, ciclo)).toBe(false)
  })
})

describe('computePendingCreditCards — resúmenes vencidos sin pago', () => {
  // El ciclo vigente avanza solo al día siguiente del vencimiento y el resumen viejo
  // desaparecía: el compromiso se liberaba sin que la plata saliera de ninguna
  // cuenta, así que el disponible SUBÍA por el monto del resumen, todos los meses y
  // en silencio (ver E11 en escenarios-disponible.test.ts). Retenerlo hasta que haya
  // un pago registrado es la lectura conservadora.
  //
  // Ciclos DESPAREJOS a propósito (cierres 23-jul/22-ago, vencimientos 3-ago/8-sep
  // — ni los cierres ni los vencimientos están a un mes exacto entre sí): fixturear ciclos parejos es cómo se
  // escondieron los últimos dos bugs grandes del repo (E8, el histórico) y es lo
  // que dejó pasar Finding 1 en la primera ronda de esta misma task. Los defaults
  // de la tarjeta (closing 20/payment 1) quedan deliberadamente desalineados de
  // LOS DOS ciclos reales (ni jul ni ago coinciden con ellos) — una vez que el
  // ciclo está materializado, ni cicloAnterior ni cicloVigente miran
  // default_closing_day/default_payment_day para nada.
  const bolsillo = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
    id: 'poc', user_id: '1', name: 'Billetera', type: 'debit',
    default_closing_day: null, default_payment_day: null,
    is_default: true, is_personal: false, created_at: '2025-01-01',
    bucket: 'pocket', initial_balance: 0, initial_balance_at: '2026-07-01',
    ...over,
  } as PaymentMethod)

  const visa = credit({ id: '1', name: 'Visa', default_closing_day: 20, default_payment_day: 1 })
  const cycles = [
    cycle({ id: 'jul', payment_method_id: '1', closing_date: '2026-07-23', due_date: '2026-08-03' }),
    cycle({ id: 'ago', payment_method_id: '1', closing_date: '2026-08-22', due_date: '2026-09-08' }),
  ]
  const consumo = [tx({ payment_method_id: '1', type: 'expense', date: '2026-08-03', periodDate: '2026-08-03', amount: -50000, cycle_id: 'jul' })]
  const HOY = new Date(2026, 7, 10) // 10-ago: el vencimiento del 3-ago ya pasó, el vigente (8-sep) todavía no

  it('retiene el resumen vencido y lo marca como tal', () => {
    const r = computePendingCreditCards([visa, bolsillo()], consumo, [], cycles, HOY)

    expect(r).toHaveLength(1)
    expect(r[0].cycleId).toBe('jul')
    expect(r[0].isOverdue).toBe(true)
    expect(r[0].isPending).toBe(true)
    expect(r[0].total).toBe(50000)
    expect(r[0].nextPaymentDate.getMonth()).toBe(7) // agosto: 2026-08-03
  })

  it('con el pago registrado, no lo retiene', () => {
    const pagado = [
      ...consumo,
      tx({ id: 'p', payment_method_id: 'poc', type: 'expense', date: '2026-08-03', card_payment_for: '1', amount: -50000, cycle_id: 'jul' }),
    ]
    expect(computePendingCreditCards([visa, bolsillo()], pagado, [], cycles, HOY)).toHaveLength(0)
  })

  it('no retiene lo que venció ANTES del último saldo declarado', () => {
    // El ancla del 15-ago (posterior al vencimiento 3-ago, anterior al vigente
    // 8-sep) ya refleja que ese resumen se pagó: retenerlo lo restaría dos veces.
    // Es el agujero de −$850.613 del 2026-08-21, que no se puede reabrir.
    const anclaPosterior = bolsillo({ initial_balance_at: '2026-08-15' });
    const luego = new Date(2026, 7, 20) // 20-ago, con el ancla ya puesta
    expect(computePendingCreditCards([visa, anclaPosterior], consumo, [], cycles, luego)).toHaveLength(0)
  })

  it('sin ninguna cuenta anclada no retiene nada: no hay piso que lo haga seguro', () => {
    const sinAncla = bolsillo({ initial_balance_at: null })
    expect(computePendingCreditCards([visa, sinAncla], consumo, [], cycles, HOY)).toHaveLength(0)
  })

  it('con ciclos desparejos, el vencido es el ciclo ANTERIOR, no "un mes antes"', () => {
    // Cierres 23-jul/22-ago, vencimientos 3-ago/8-sep: ni un mes exacto entre sí ni
    // alineados con los defaults de la tarjeta (20/1). El modelo viejo restaba un
    // mes al vencimiento vigente (subMonths) para adivinar la fecha del anterior —
    // acá daría 8-ago, que no es el vencimiento de ningún ciclo; eso podía apuntar a una fecha que ningún ciclo real tenía (el agujero de E11)
    // o, peor, "caer para adelante" y devolver el mismo ciclo vigente duplicado
    // como "vencido" (Finding 1). Con la entidad, "el anterior" es una consulta real
    // (cicloAnterior sobre la tabla de ciclos), nunca una resta de calendario.
    const r = computePendingCreditCards([visa, bolsillo()], consumo, [], cycles, HOY)
    const vencido = r.find((c) => c.isOverdue)
    expect(vencido?.cycleId).toBe('jul')
    expect(vencido?.total).toBe(50000)
  })
})

// FINDING 1 (revisión 2026-09-01, ronda 1): `resumenDelCiclo` derivaba el ciclo
// "anterior" con cicloVigente(ciclos, subMonths(vencimiento, 1)) -- una fecha
// aproximada, no una consulta real. Si ningún ciclo materializado vence en esa
// fecha aproximada, cicloVigente (find con >=) NO devuelve undefined: cae para
// ADELANTE y devuelve el MISMO ciclo vigente. Se materializan entonces DOS
// resúmenes para la misma tarjeta -- el vigente real, y un "vencido" fantasma
// que es el mismo ciclo con isOverdue:true -- mientras el ciclo REALMENTE vencido
// (sin transacciones en el ciclo vigente) desaparece sin dejar rastro.
//
// Reproducido con el caso real del hallazgo: el usuario corrige el día de
// vencimiento por defecto de la tarjeta (1 -> 15) DESPUÉS de que los ciclos ya
// estaban materializados con el día viejo.
//
// El RED original de este test se corrió con la firma VIEJA de
// computePendingCreditCards (now en 4to lugar, cycles en 5to) contra el código
// tal como vivía antes de este fix -- ver la evidencia en task-3-report.md. Acá
// abajo ya está actualizado a la firma nueva (cycles 4to, now 5to) para seguir
// compilando y sirviendo como regresión permanente.
describe('computePendingCreditCards — Finding 1: no duplica el resumen vigente como "vencido"', () => {
  const method = credit({ default_closing_day: 20, default_payment_day: 15 }) // default HOY, ya corregido
  const bolsilloAncla = {
    id: 'poc', user_id: '1', name: 'Billetera', type: 'debit',
    default_closing_day: null, default_payment_day: null,
    is_default: true, is_personal: false, created_at: '2025-01-01',
    bucket: 'pocket', initial_balance: 0, initial_balance_at: '2026-07-01',
  } as PaymentMethod

  // Materializados bajo el default VIEJO (vencía el día 1): todavía no se
  // regeneraron con el default nuevo.
  const cycles = [
    cycle({ id: 'ago', closing_date: '2026-07-20', due_date: '2026-08-01' }),
    cycle({ id: 'sep', closing_date: '2026-08-20', due_date: '2026-09-01' }),
  ]
  const consumo = [
    tx({ id: 'a', payment_method_id: '1', cycle_id: 'ago', amount: -30000, date: '2026-08-01' }),
    tx({ id: 'b', payment_method_id: '1', cycle_id: 'sep', amount: -80000, date: '2026-09-01' }),
  ]
  const HOY = new Date(2026, 7, 25) // 25-ago: 'ago' (vence 1-ago) ya venció y sigue sin pago; 'sep' es el vigente

  it('el resumen "vencido" es el ciclo REAL anterior (ago, $30.000), no un duplicado del vigente (sep, $80.000)', () => {
    const r = computePendingCreditCards([method, bolsilloAncla], consumo, [], cycles, HOY)
    const vencido = r.find((c) => c.isOverdue)
    const vigente = r.find((c) => !c.isOverdue)
    expect(vencido?.cycleId).toBe('ago')
    expect(vencido?.total).toBe(30000)
    expect(vigente?.cycleId).toBe('sep')
    expect(vigente?.total).toBe(80000)
  })

  it('el total comprometido es la suma de los DOS resúmenes reales, no el vigente contado dos veces', () => {
    const r = computePendingCreditCards([method, bolsilloAncla], consumo, [], cycles, HOY)
    expect(r.reduce((acc, c) => acc + c.total, 0)).toBe(110000) // 30000 (ago) + 80000 (sep)
  })
})
