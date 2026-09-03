/**
 * `moverTransaccionAlResumenVecino`: la server action que APLICA el plan que decide
 * `planDeMovimiento` (puro, en lib/finance/mover-resumen.ts). El cliente manda
 * transactionId + direccion, nunca un cycleId -- el destino se resuelve acá.
 *
 * Mismo patrón de mock que reassign-dueno.test.ts / declarar-ciclo.test.ts: un
 * cliente Supabase falso que registra filtros y resuelve según lo que "existe" en
 * la base simulada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const UID = '11111111-1111-4111-8111-111111111111'
const OTRO_USUARIO = 'bbbbbbbb-9999-4999-8999-999999999999'
const METHOD = 'aaaaaaaa-0000-4000-8000-000000000001'
const TX = 'cccccccc-0000-4000-8000-000000000001'

const metodoCredito = {
  id: METHOD,
  user_id: UID,
  name: 'Visa',
  type: 'credit' as const,
  default_closing_day: 20,
  default_payment_day: 1,
  bucket: 'pocket' as const,
  created_at: '2026-01-01T00:00:00Z',
  initial_balance: 0,
  initial_balance_at: null,
  is_default: null,
  is_personal: null,
}

type Filtros = Record<string, unknown>

const ciclo = (over: Filtros) => ({
  id: 'x',
  user_id: UID,
  payment_method_id: METHOD,
  closing_date: '2026-07-23',
  due_date: '2026-08-03',
  source: 'generated',
  created_at: '2026-01-01T00:00:00Z',
  reminder_dismissed_at: null,
  ...over,
})
// Cuatro resúmenes consecutivos, como en mover-resumen.test.ts.
const JUL = ciclo({ id: 'jul', closing_date: '2026-07-23', due_date: '2026-08-03' })
const AGO = ciclo({ id: 'ago', closing_date: '2026-08-20', due_date: '2026-09-01' })
const SEP = ciclo({ id: 'sep', closing_date: '2026-09-24', due_date: '2026-10-05' })
const OCT = ciclo({ id: 'oct', closing_date: '2026-10-22', due_date: '2026-11-02' })
const CUATRO_CICLOS = [JUL, AGO, SEP, OCT]

const tx = (over: Filtros) => ({
  id: TX,
  user_id: UID,
  payment_method_id: METHOD,
  cycle_id: 'ago',
  amount: 1000,
  type: 'expense',
  description: 'Compra',
  date: '2026-09-01',
  purchase_date: '2026-08-19',
  category_id: 'cat1',
  created_at: '2026-08-19T10:00:00Z',
  card_payment_for: null,
  installment_plan_id: null,
  recurring_plan_id: null,
  original_amount: null,
  original_currency: 'ARS',
  is_balance_adjustment: false,
  confirmation_status: 'confirmed',
  exchange_rate: null,
  rate_pair: null,
  source: 'manual',
  ...over,
})

/**
 * Cliente Supabase de prueba. `transacciones`/`ciclos`/`metodo` simulan lo que hay
 * en la base; `updates` registra cada UPDATE de `transactions` que la action emite,
 * con el payload EXACTO que mandó -- ahí se verifica que `purchase_date` no aparece.
 */
function clienteFalso(opts: { transacciones: Filtros[]; ciclos: Filtros[]; metodo: Filtros | null }) {
  const updates: Array<{ id: string; set: Record<string, unknown> }> = []
  const ciclosDB = [...opts.ciclos]

  const selectBuilder = (tabla: string) => {
    const filtros: Filtros = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble de test, cadena flexible
    const b: any = {}
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
    b.order = () => b

    const resolverUno = () => {
      if (tabla === 'transactions') {
        const row = opts.transacciones.find(
          (t) => t.id === filtros.id && (filtros.user_id === undefined || t.user_id === filtros.user_id),
        )
        return { data: row ?? null, error: null }
      }
      if (tabla === 'payment_methods') {
        const m = opts.metodo
        const visible = !!m && m.id === filtros.id && (filtros.user_id === undefined || m.user_id === filtros.user_id)
        return { data: visible ? m : null, error: null }
      }
      return { data: null, error: null }
    }
    b.maybeSingle = async () => resolverUno()
    b.single = async () => resolverUno()

    // Sin .single()/.maybeSingle(): query de lista, resuelta al hacer `await` del builder.
    b.then = (resolve: (v: unknown) => void) => {
      let rows: Filtros[] = []
      if (tabla === 'transactions') rows = opts.transacciones.filter((t) => coincide(t, filtros))
      else if (tabla === 'credit_card_cycles') rows = ciclosDB.filter((c) => coincide(c, filtros))
      resolve({ data: rows, error: null })
    }
    return b
  }

  const updateBuilder = (tabla: string, set: Record<string, unknown>) => {
    const filtros: Filtros = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble de test, cadena flexible
    const b: any = {}
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
    b.then = (resolve: (v: unknown) => void) => {
      if (tabla === 'transactions') updates.push({ id: filtros.id as string, set })
      resolve({ error: null })
    }
    return b
  }

  return {
    updates,
    auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) },
    from: (tabla: string) => ({
      select: () => selectBuilder(tabla),
      update: (set: Record<string, unknown>) => updateBuilder(tabla, set),
      upsert: (rows: Filtros[]) => {
        ciclosDB.push(...rows.map((r, i) => ({ ...r, id: `nuevo-${ciclosDB.length + i}` })))
        return { select: () => Promise.resolve({ data: [], error: null }) }
      },
    }),
  }
}

function coincide(row: Filtros, filtros: Filtros): boolean {
  return Object.entries(filtros).every(([k, v]) => row[k] === v)
}

const estado = vi.hoisted(() => ({ cliente: null as ReturnType<typeof clienteFalso> | null }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => estado.cliente }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { moverTransaccionAlResumenVecino } from '../actions'

beforeEach(() => { estado.cliente = null })

describe('moverTransaccionAlResumenVecino', () => {
  it('rechaza una transaccion que no es del usuario', async () => {
    // El select por id devuelve null porque el filtro .eq('user_id', ...) no matchea:
    // la fila existe, pero pertenece a otro usuario.
    estado.cliente = clienteFalso({
      transacciones: [tx({ user_id: OTRO_USUARIO })],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
    })

    const r = await moverTransaccionAlResumenVecino(TX, 'anterior')

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.updates).toHaveLength(0)
  })

  it('rechaza una mensualidad posteada', async () => {
    estado.cliente = clienteFalso({
      transacciones: [tx({ recurring_plan_id: 'plan-1' })],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
    })

    const r = await moverTransaccionAlResumenVecino(TX, 'siguiente')

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.updates).toHaveLength(0)
  })

  it('rechaza un reintegro', async () => {
    estado.cliente = clienteFalso({
      transacciones: [tx({ type: 'income' })],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
    })

    const r = await moverTransaccionAlResumenVecino(TX, 'siguiente')

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.updates).toHaveLength(0)
  })

  it('rechaza un pago de tarjeta', async () => {
    estado.cliente = clienteFalso({
      transacciones: [tx({ card_payment_for: METHOD })],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
    })

    const r = await moverTransaccionAlResumenVecino(TX, 'siguiente')

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.updates).toHaveLength(0)
  })

  it('rechaza si no hay resumen vecino en esa direccion', async () => {
    // La transaccion esta en el primer ciclo (jul) y se pide 'anterior': no hay uno antes.
    estado.cliente = clienteFalso({
      transacciones: [tx({ cycle_id: 'jul' })],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
    })

    const r = await moverTransaccionAlResumenVecino(TX, 'anterior')

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.updates).toHaveLength(0)
  })

  it('mueve una compra suelta: un update con cycle_id y date, sin purchase_date', async () => {
    estado.cliente = clienteFalso({
      transacciones: [tx({ cycle_id: 'ago' })],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
    })

    const r = await moverTransaccionAlResumenVecino(TX, 'anterior')

    expect(r.success).toBe(true)
    expect(estado.cliente!.updates).toHaveLength(1)
    expect(estado.cliente!.updates[0]).toEqual({ id: TX, set: { cycle_id: 'jul', date: '2026-08-03' } })
    expect(Object.keys(estado.cliente!.updates[0].set)).not.toContain('purchase_date')
  })

  it('mover una cuota emite un update por cada cuota desde la tocada', async () => {
    // Plan de 3 cuotas: jul, ago, sep. Se mueve la 2 (ago) 'siguiente' -> corre 2 y 3.
    const c1 = tx({ id: 'c1', cycle_id: 'jul', date: '2026-08-03', installment_plan_id: 'p1' })
    const c2 = tx({ id: 'c2', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p1' })
    const c3 = tx({ id: 'c3', cycle_id: 'sep', date: '2026-10-05', installment_plan_id: 'p1' })
    estado.cliente = clienteFalso({
      transacciones: [c1, c2, c3],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
    })

    const r = await moverTransaccionAlResumenVecino('c2', 'siguiente')

    expect(r.success).toBe(true)
    expect(estado.cliente!.updates).toHaveLength(2)
    expect(estado.cliente!.updates).toEqual([
      { id: 'c2', set: { cycle_id: 'sep', date: '2026-10-05' } },
      { id: 'c3', set: { cycle_id: 'oct', date: '2026-11-02' } },
    ])
  })

  it('si el plan de cuotas no se puede mover entero, NO mueve ninguna', async () => {
    // Tarjeta SIN default_closing_day/default_payment_day: asegurarCiclos no puede
    // generar nada. Con solo 3 resumenes materializados (jul/ago/sep), mover la cuota
    // 2 'siguiente' necesitaria un 4to resumen para la cuota 3, que no existe y no se
    // puede crear. Aplicar a medias dejaria dos cuotas del mismo plan en 'sep'.
    const metodoSinDias = { ...metodoCredito, default_closing_day: null, default_payment_day: null }
    const c1 = tx({ id: 'c1', cycle_id: 'jul', date: '2026-08-03', installment_plan_id: 'p1' })
    const c2 = tx({ id: 'c2', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p1' })
    const c3 = tx({ id: 'c3', cycle_id: 'sep', date: '2026-10-05', installment_plan_id: 'p1' })
    estado.cliente = clienteFalso({
      transacciones: [c1, c2, c3],
      ciclos: [JUL, AGO, SEP],
      metodo: metodoSinDias,
    })

    const r = await moverTransaccionAlResumenVecino('c2', 'siguiente')

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.updates).toHaveLength(0)
  })
})
