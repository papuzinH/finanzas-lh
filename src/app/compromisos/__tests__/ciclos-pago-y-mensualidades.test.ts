/**
 * Task 10: el pago de un resumen y las mensualidades automáticas se imputan al
 * ciclo (cycle_id), no a un rango de mes. Estos tests prueban el WIRING de las
 * actions contra un cliente Supabase falso; la REGLA (a qué resumen cae cada
 * cosa) la prueban recurring.test.ts (expectedChargeDatePorCiclo) y
 * cycles.test.ts (cicloSaldadoEn) sobre las funciones puras.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { addMonths, subMonths } from 'date-fns'
import type { CreditCardCycle } from '@/lib/finance/cycles'
import { expectedChargeDate } from '@/lib/finance/recurring'
import type { RecurringPlan, PaymentMethod } from '@/types/database'

const UID = '11111111-1111-4111-8111-111111111111'
const CARD = 'aaaaaaaa-0000-4000-8000-000000000001'
const FUNDING = 'bbbbbbbb-0000-4000-8000-000000000002'
const CYCLE_A = 'cccccccc-0000-4000-8000-000000000003'
const CYCLE_B = 'dddddddd-0000-4000-8000-000000000004'

// Los ciclos que `asegurarCiclos` devuelve para syncAutomaticRecurringCharges.
// Cierres/vencimientos desparejos A PROPOSITO: NINGUNO coincide con lo que dan
// los defaults de `method` (cierra el 20, vence el 1 del mes siguiente — ver
// más abajo). Con fechas iguales a los defaults, una regresión que volviera a
// calcular la fecha con `expectedChargeDate` (el fallback) en vez de leerla del
// ciclo real habría dejado la suite entera en verde igual.
const CICLOS_TARJETA: CreditCardCycle[] = [
  { id: 'c-jul', user_id: UID, payment_method_id: CARD, closing_date: '2026-07-23', due_date: '2026-08-03', source: 'declared', reminder_dismissed_at: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'c-ago', user_id: UID, payment_method_id: CARD, closing_date: '2026-08-20', due_date: '2026-09-04', source: 'declared', reminder_dismissed_at: null, created_at: '2026-01-01T00:00:00Z' },
]

type AsegurarCiclos = (supabase: unknown, method: unknown, desde: Date, hasta: Date) => Promise<CreditCardCycle[]>
const asegurarCiclosMock: Mock<AsegurarCiclos> = vi.fn(async () => CICLOS_TARJETA)
vi.mock('@/lib/ciclos/asegurar', () => ({
  asegurarCiclos: (...args: Parameters<AsegurarCiclos>) => asegurarCiclosMock(...args),
}))

/**
 * Cliente Supabase falso genérico: soporta las lecturas (`select` + cadena de
 * `.eq/.gte/.lte/.not/.order/.limit`, siempre "thenable") y escrituras
 * (`insert`/`delete`) que tocan estas actions. Los datos que devuelve cada
 * lectura salen de `config`, indexados por tabla + columnas pedidas.
 */
function clienteFalso(config: {
  existingPayments?: Array<{ card_payment_for: string; cycle_id: string | null }>
  plans?: Array<Record<string, unknown>>
  methods?: Array<Record<string, unknown>>
  existingTxs?: Array<{ recurring_plan_id: string; date: string; cycle_id?: string | null }>
  firstIncomeDate?: string | null
}) {
  const {
    existingPayments = [],
    plans = [],
    methods = [],
    existingTxs = [],
    firstIncomeDate = null,
  } = config

  const insertedTransactions: Array<Record<string, unknown>> = []
  const deleteEqCalls: Array<[string, unknown]> = []

  function readBuilder(tabla: string, columns?: string) {
    const filtros: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
    b.gte = () => b
    b.lte = () => b
    b.not = () => b
    b.order = () => b
    b.limit = () => b
    b.single = async () => {
      const { data } = resolve()
      return { data: Array.isArray(data) ? data[0] ?? null : data, error: null }
    }
    function resolve(): { data: unknown } {
      if (tabla === 'transactions' && columns === 'id') {
        // Guard anti-duplicado de payCreditCardCycle
        const found = existingPayments.filter(
          (p) => p.card_payment_for === filtros.card_payment_for && p.cycle_id === filtros.cycle_id,
        )
        return { data: found.map((_, i) => ({ id: `existing-${i}` })) }
      }
      if (tabla === 'transactions' && columns === 'recurring_plan_id, date, cycle_id') {
        return { data: existingTxs }
      }
      if (tabla === 'transactions' && columns === 'date') {
        return { data: firstIncomeDate ? [{ date: firstIncomeDate }] : [] }
      }
      if (tabla === 'categories' && columns === 'id') {
        return { data: [{ id: 'cat-pago-tarjeta' }] } // siempre existe: se salta la rama de creación
      }
      if (tabla === 'recurring_plans') return { data: plans }
      if (tabla === 'payment_methods') return { data: methods }
      return { data: null }
    }
    b.then = (res: (x: { data: unknown; error: null }) => void) => res({ ...resolve(), error: null })
    return b
  }

  return {
    insertedTransactions,
    deleteEqCalls,
    auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) },
    from: (tabla: string) => ({
      select: (columns?: string) => readBuilder(tabla, columns),
      insert: async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        if (tabla === 'transactions') {
          insertedTransactions.push(...(Array.isArray(rows) ? rows : [rows]))
        }
        return { error: null }
      },
      delete: () => {
        const b: Record<string, unknown> = {}
        b.eq = (col: string, val: unknown) => { deleteEqCalls.push([col, val]); return b }
        b.then = (res: (x: { error: null }) => void) => res({ error: null })
        return b
      },
    }),
  }
}

const estado = vi.hoisted(() => ({ cliente: null as ReturnType<typeof clienteFalso> | null }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => estado.cliente }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { payCreditCardCycle, undoCreditCardPayment, syncAutomaticRecurringCharges } from '../actions'

beforeEach(() => {
  asegurarCiclosMock.mockClear()
})

describe('payCreditCardCycle: imputa el pago al ciclo', () => {
  it('inserta la transacción de pago con cycle_id y card_payment_for', async () => {
    estado.cliente = clienteFalso({ existingPayments: [] })

    const r = await payCreditCardCycle({
      cardMethodId: CARD,
      fundingMethodId: FUNDING,
      amountArs: 50000,
      date: '2026-09-01',
      cardName: 'Visa',
      cycleId: CYCLE_A,
    })

    expect(r.error).toBeUndefined()
    expect(estado.cliente!.insertedTransactions).toHaveLength(1)
    const row = estado.cliente!.insertedTransactions[0]
    expect(row.cycle_id).toBe(CYCLE_A)
    expect(row.card_payment_for).toBe(CARD)
  })

  it('guard por ciclo: si ya hay un pago con ese cycle_id para la tarjeta, no inserta y devuelve success', async () => {
    estado.cliente = clienteFalso({
      existingPayments: [{ card_payment_for: CARD, cycle_id: CYCLE_A }],
    })

    const r = await payCreditCardCycle({
      cardMethodId: CARD,
      fundingMethodId: FUNDING,
      amountArs: 50000,
      date: '2026-09-01',
      cardName: 'Visa',
      cycleId: CYCLE_A,
    })

    expect(r.success).toBe(true)
    expect(estado.cliente!.insertedTransactions).toHaveLength(0)
  })

  it('un pago de OTRO ciclo de la misma tarjeta no lo bloquea el guard', async () => {
    estado.cliente = clienteFalso({
      existingPayments: [{ card_payment_for: CARD, cycle_id: CYCLE_A }],
    })

    const r = await payCreditCardCycle({
      cardMethodId: CARD,
      fundingMethodId: FUNDING,
      amountArs: 50000,
      date: '2026-10-01',
      cardName: 'Visa',
      cycleId: CYCLE_B,
    })

    expect(r.error).toBeUndefined()
    expect(estado.cliente!.insertedTransactions).toHaveLength(1)
    expect(estado.cliente!.insertedTransactions[0].cycle_id).toBe(CYCLE_B)
  })

  it('con cycleId null (tarjeta sin ningun resumen materializado) inserta igual, sin guard por ciclo', async () => {
    // Una tarjeta SIN default_closing_day/default_payment_day no genera ciclos a
    // proposito, asi que `cicloSaldadoEn` nunca devuelve nada y el dialogo quedaba
    // deshabilitado para siempre: esas tarjetas tampoco tienen chip en Compromisos,
    // o sea que perdian la unica via de registrar un pago. Con cycleId null el pago
    // es un registro manual sin resumen que saldar -como eran TODOS antes de esta
    // rama-, asi que el guard anti-duplicado por ciclo no aplica.
    estado.cliente = clienteFalso({
      // Un pago previo sin ciclo NO puede bloquear este: si el guard corriera,
      // esta fila lo haria devolver success sin insertar.
      existingPayments: [{ card_payment_for: CARD, cycle_id: null }],
    })

    const r = await payCreditCardCycle({
      cardMethodId: CARD,
      fundingMethodId: FUNDING,
      amountArs: 50000,
      date: '2026-09-01',
      cardName: 'Visa sin resumen',
      cycleId: null,
    })

    expect(r.error).toBeUndefined()
    expect(estado.cliente!.insertedTransactions).toHaveLength(1)
    expect(estado.cliente!.insertedTransactions[0].cycle_id).toBeNull()
    expect(estado.cliente!.insertedTransactions[0].card_payment_for).toBe(CARD)
  })
})

describe('undoCreditCardPayment: borra por card_payment_for + cycle_id', () => {
  it('el delete filtra por card_payment_for y cycle_id (no por rango de mes)', async () => {
    estado.cliente = clienteFalso({})

    const r = await undoCreditCardPayment({ cardMethodId: CARD, cycleId: CYCLE_A })

    expect(r.error).toBeUndefined()
    const cols = estado.cliente!.deleteEqCalls.map(([c]) => c)
    expect(cols).toContain('card_payment_for')
    expect(cols).toContain('cycle_id')
    expect(estado.cliente!.deleteEqCalls).toContainEqual(['card_payment_for', CARD])
    expect(estado.cliente!.deleteEqCalls).toContainEqual(['cycle_id', CYCLE_A])
    // Ya no queda ningún filtro por rango de fechas (gte/lte de mes).
    expect(cols).not.toContain('date')
  })
})

describe('syncAutomaticRecurringCharges: las mensualidades se postean con cycle_id y purchase_date del resumen', () => {
  const plan = {
    id: 'plan-1',
    user_id: UID,
    description: 'Netflix',
    amount: 5000,
    category_id: 'cat-1',
    payment_method_id: CARD,
    currency: 'ARS',
    frequency: 'monthly',
    is_active: true,
    created_at: '2026-07-01T00:00:00Z',
    original_amount: null,
    rate_pair: null,
    exchange_rate: null,
    billing_day: 1,
  }

  const method = {
    id: CARD,
    user_id: UID,
    name: 'Visa',
    type: 'credit',
    default_closing_day: 20,
    default_payment_day: 1,
    created_at: '2026-01-01',
    is_personal: false,
    is_default: false,
    bucket: 'pocket',
    initial_balance: 0,
    initial_balance_at: null,
  }

  beforeEach(() => {
    vi.useFakeTimers()
    // Fijo "hoy" bien lejos de cualquier borde de mes de este fixture: el 25 de
    // agosto ya facturó julio y agosto, y todavía no llegó el cobro de septiembre.
    vi.setSystemTime(new Date(2026, 7, 25))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('postea julio y agosto con el cycle_id y purchase_date del resumen que les corresponde', async () => {
    estado.cliente = clienteFalso({
      plans: [plan],
      methods: [method],
      existingTxs: [],
      firstIncomeDate: '2026-01-15',
    })

    const r = await syncAutomaticRecurringCharges()

    expect(r.error).toBeUndefined()
    expect(asegurarCiclosMock).toHaveBeenCalledTimes(1) // una tarjeta, un asegurarCiclos

    const filas = estado.cliente!.insertedTransactions
    // Fechas de CICLOS_TARJETA (due_date de c-jul/c-ago), no las que darían los
    // defaults de `method` (cierra 20, vence 1 → '2026-08-01'/'2026-09-01').
    expect(filas.map((f) => f.date)).toEqual(['2026-08-03', '2026-09-04'])
    expect(filas.map((f) => f.cycle_id)).toEqual(['c-jul', 'c-ago'])
    expect(filas.map((f) => f.purchase_date)).toEqual(['2026-07-01', '2026-08-01'])

    // Provenance explícita: si la fecha viniera del fallback por defaults en vez
    // del ciclo real, coincidiría con esto — y no coincide.
    expect(filas[0].date).not.toBe(expectedChargeDate(plan as unknown as RecurringPlan, method as unknown as PaymentMethod, '2026-07'))
    expect(filas[1].date).not.toBe(expectedChargeDate(plan as unknown as RecurringPlan, method as unknown as PaymentMethod, '2026-08'))
  })

  it('asegura los ciclos de TODA tarjeta configurada, aunque no tenga ningún plan automático', async () => {
    // El sync corre una vez por carga y era el único lugar que materializaba
    // ciclos "de fondo", pero sólo para tarjetas con planes automáticos. Una
    // tarjeta configurada sin compras nuevas ni planes se quedaba sin ciclo
    // vigente materializado, `computePendingCreditCards` la dejaba caer
    // (`if (!vigente) return acc`) y su deuda dejaba de comprometerse: el
    // disponible subía en silencio. Es la vuelta de E11.
    estado.cliente = clienteFalso({
      plans: [],
      methods: [method],
      existingTxs: [],
      firstIncomeDate: '2026-01-15',
    })

    const r = await syncAutomaticRecurringCharges()

    expect(r.error).toBeUndefined()
    expect(asegurarCiclosMock).toHaveBeenCalledTimes(1)
    const [, methodArg, desde, hasta] = asegurarCiclosMock.mock.calls[0]
    expect(methodArg).toMatchObject({ id: CARD })
    expect(desde.getTime()).toBeLessThanOrEqual(subMonths(new Date(), 1).getTime())
    expect(hasta.getTime()).toBeGreaterThanOrEqual(addMonths(new Date(), 2).getTime())
  })

  it('no toca una tarjeta sin día de cierre/vencimiento: no hay ciclos que generar', async () => {
    estado.cliente = clienteFalso({
      plans: [],
      methods: [{ ...method, default_closing_day: null, default_payment_day: null }],
      existingTxs: [],
      firstIncomeDate: '2026-01-15',
    })

    const r = await syncAutomaticRecurringCharges()

    expect(r.error).toBeUndefined()
    expect(asegurarCiclosMock).not.toHaveBeenCalled()
  })

  it('no duplica un mes que ya tiene su transacción posteada', async () => {
    estado.cliente = clienteFalso({
      plans: [plan],
      methods: [method],
      // Sin cycle_id (respaldo por mes): asi quedaron las mensualidades posteadas
      // antes de que existiera esta columna. Julio ya cubierto.
      existingTxs: [{ recurring_plan_id: 'plan-1', date: '2026-08-01', cycle_id: null }],
      firstIncomeDate: '2026-01-15',
    })

    const r = await syncAutomaticRecurringCharges()

    expect(r.error).toBeUndefined()
    const filas = estado.cliente!.insertedTransactions
    expect(filas.map((f) => f.cycle_id)).toEqual(['c-ago'])
  })
})
