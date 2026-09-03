/**
 * `moverTransaccionAlResumenVecino`: la server action que APLICA el plan que decide
 * `planDeMovimiento` (puro, en lib/finance/mover-resumen.ts). El cliente manda
 * transactionId + direccion, nunca un cycleId -- el destino se resuelve acá.
 *
 * Mismo patrón de mock que reassign-dueno.test.ts / declarar-ciclo.test.ts: un
 * cliente Supabase falso que registra filtros y resuelve según lo que "existe" en
 * la base simulada.
 *
 * Fix round 1 (Critical): la escritura pasó de un `for` de N updates a un único
 * `upsert` multi-fila -- PostgREST lo corre como una sola transacción, así que
 * "cuota 2 movida, cuota 3 no" por un fallo a mitad de loop deja de ser posible.
 * Las filas que viajan son las COMPLETAS (no `{cycle_id, date}` sueltos), así que
 * los tests verifican que `purchase_date` no CAMBIA de valor, no que la clave esté
 * ausente del payload -- eso ya no aplica con upsert de fila entera.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const UID = '11111111-1111-4111-8111-111111111111'
const OTRO_USUARIO = 'bbbbbbbb-9999-4999-8999-999999999999'
const METHOD = 'aaaaaaaa-0000-4000-8000-000000000001'
const METHOD_AJENO = 'eeeeeeee-0000-4000-8000-000000000099'
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
 * en la base. `upserts` registra cada UPSERT a `transactions` (la ÚNICA escritura
 * que la action hace hoy: fix round 1 reemplazó el loop de updates), con las filas
 * COMPLETAS que mandó. `llamadas` registra cada select resuelto, para poder
 * verificar que un filtro (p.ej. `user_id`) REALMENTE se usó, no solo que el
 * resultado dio null (mismo cuidado que reassign-dueno.test.ts / declarar-ciclo.test.ts).
 */
function clienteFalso(opts: {
  transacciones: Filtros[]
  ciclos: Filtros[]
  metodo: Filtros | null
  fallaUpsertTransacciones?: boolean
  /**
   * Ids que ya no existen para la RELECTURA previa al upsert (la única query que usa
   * `.in()`): simula que otra pestaña -- o el chat, que tiene `delete_entity` -- borró
   * la fila entre la lectura del plan y la escritura.
   */
  desaparecenAlReleer?: string[]
}) {
  const upserts: Array<{ tabla: string; rows: Filtros[] }> = []
  const llamadas: Array<{ tabla: string; op: string; filtros: Filtros }> = []
  const ciclosDB = [...opts.ciclos]

  const selectBuilder = (tabla: string) => {
    const filtros: Filtros = {}
    const enFiltros: Record<string, unknown[]> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble de test, cadena flexible
    const b: any = {}
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
    b.in = (col: string, vals: unknown[]) => { enFiltros[col] = vals; return b }
    b.order = () => b

    const resolverUno = () => {
      llamadas.push({ tabla, op: 'select-uno', filtros: { ...filtros } })
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
      const esRelectura = Object.keys(enFiltros).length > 0
      llamadas.push({ tabla, op: esRelectura ? 'select-in' : 'select-lista', filtros: { ...filtros } })
      let rows: Filtros[] = []
      if (tabla === 'transactions') rows = opts.transacciones.filter((t) => coincide(t, filtros))
      else if (tabla === 'credit_card_cycles') rows = ciclosDB.filter((c) => coincide(c, filtros))
      for (const [col, vals] of Object.entries(enFiltros)) rows = rows.filter((r) => vals.includes(r[col]))
      // Las filas "borradas" desaparecen sólo de la relectura: antes de ella el plan ya
      // las vio, que es exactamente la ventana que este doble simula.
      if (esRelectura && opts.desaparecenAlReleer) {
        rows = rows.filter((r) => !opts.desaparecenAlReleer!.includes(r.id as string))
      }
      resolve({ data: rows, error: null })
    }
    return b
  }

  return {
    upserts,
    llamadas,
    auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) },
    from: (tabla: string) => ({
      select: () => selectBuilder(tabla),
      upsert: (rows: Filtros[]) => {
        if (tabla === 'transactions') {
          upserts.push({ tabla, rows })
          if (opts.fallaUpsertTransacciones) {
            return Promise.resolve({ error: { message: 'conexión caída' } })
          }
          return Promise.resolve({ error: null })
        }
        // credit_card_cycles: lo usa asegurarCiclos. Ninguno de estos tests necesita
        // que genere de verdad (o ya hay 4 resúmenes materializados, o la tarjeta no
        // tiene default_closing_day y generarCiclos devuelve [] antes de upsertear).
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
    expect(estado.cliente!.upserts).toHaveLength(0)
  })

  it('rechaza cuando el medio de pago de la transaccion es de otro usuario', async () => {
    // Minor (fix round 1): guard 2 no tenia test negativo. La transaccion apunta a un
    // payment_method_id que existe pero es de OTRO_USUARIO -- mismo patron M4 que
    // reassign-dueno.test.ts: no alcanza con que el resultado sea null, hay que
    // verificar que la consulta REALMENTE filtro por user_id.
    const metodoAjeno = { ...metodoCredito, id: METHOD_AJENO, user_id: OTRO_USUARIO }
    estado.cliente = clienteFalso({
      transacciones: [tx({ payment_method_id: METHOD_AJENO, cycle_id: 'ago' })],
      ciclos: CUATRO_CICLOS,
      metodo: metodoAjeno,
    })

    const r = await moverTransaccionAlResumenVecino(TX, 'anterior')

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.upserts).toHaveLength(0)
    const consultaMedio = estado.cliente!.llamadas.find(
      (l) => l.tabla === 'payment_methods' && l.filtros.id === METHOD_AJENO,
    )
    expect(consultaMedio?.filtros.user_id).toBe(UID)
  })

  it('rechaza una mensualidad posteada', async () => {
    estado.cliente = clienteFalso({
      transacciones: [tx({ recurring_plan_id: 'plan-1' })],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
    })

    const r = await moverTransaccionAlResumenVecino(TX, 'siguiente')

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.upserts).toHaveLength(0)
  })

  it('rechaza un reintegro', async () => {
    estado.cliente = clienteFalso({
      transacciones: [tx({ type: 'income' })],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
    })

    const r = await moverTransaccionAlResumenVecino(TX, 'siguiente')

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.upserts).toHaveLength(0)
  })

  it('rechaza un pago de tarjeta', async () => {
    estado.cliente = clienteFalso({
      transacciones: [tx({ card_payment_for: METHOD })],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
    })

    const r = await moverTransaccionAlResumenVecino(TX, 'siguiente')

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.upserts).toHaveLength(0)
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
    expect(estado.cliente!.upserts).toHaveLength(0)
  })

  it('mueve una compra suelta: un upsert con cycle_id y date actualizados, sin tocar purchase_date', async () => {
    const compra = tx({ cycle_id: 'ago' })
    estado.cliente = clienteFalso({
      transacciones: [compra],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
    })

    const r = await moverTransaccionAlResumenVecino(TX, 'anterior')

    expect(r.success).toBe(true)
    expect(estado.cliente!.upserts).toHaveLength(1) // UNA sola llamada, no un update por fila
    const filas = estado.cliente!.upserts[0].rows
    expect(filas).toHaveLength(1)
    expect(filas[0].id).toBe(TX)
    expect(filas[0].cycle_id).toBe('jul')
    expect(filas[0].date).toBe('2026-08-03')
    // purchase_date viaja (la fila va completa) pero con el MISMO valor: mover no lo toca.
    expect(filas[0].purchase_date).toBe(compra.purchase_date)
  })

  it('mover una cuota emite UN SOLO upsert con una fila por cuota desde la tocada', async () => {
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
    expect(estado.cliente!.upserts).toHaveLength(1) // atomicidad: una sola llamada para las 2 cuotas
    const filas = estado.cliente!.upserts[0].rows
    expect(filas.map((f) => f.id)).toEqual(['c2', 'c3'])
    expect(filas.map((f) => f.cycle_id)).toEqual(['sep', 'oct'])
    expect(filas.map((f) => f.date)).toEqual(['2026-10-05', '2026-11-02'])
  })

  it('con dos cuotas en la misma fecha, cuantas filas se mueven lo decide planDeMovimiento', async () => {
    // C1 (fix wave final): la action recontaba las filas a mover con `x.date >= t.date`,
    // una SEGUNDA definicion que divergia de la del plan en cuanto dos cuotas compartian
    // `date` -- el estado que producia el camino 'anterior' de esta misma feature. Con
    // c2 y c3 las dos en 'ago', mover c3 'siguiente' mueve UNA fila; la cuenta vieja
    // esperaba DOS y la action moria con "No pude mover todas las cuotas del plan",
    // un mensaje falso y cero escrituras.
    const c1 = tx({ id: 'c1', cycle_id: 'jul', date: '2026-08-03', installment_plan_id: 'p1', description: 'Tele (1/3)' })
    const c2 = tx({ id: 'c2', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p1', description: 'Tele (2/3)' })
    const c3 = tx({ id: 'c3', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p1', description: 'Tele (3/3)' })
    estado.cliente = clienteFalso({
      transacciones: [c1, c2, c3],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
    })

    const r = await moverTransaccionAlResumenVecino('c3', 'siguiente')

    expect(r.success).toBe(true)
    expect(estado.cliente!.upserts).toHaveLength(1)
    const filas = estado.cliente!.upserts[0].rows
    // SOLO c3. c2 comparte fecha con ella pero es una cuota ANTERIOR: no se toca.
    expect(filas.map((f) => f.id)).toEqual(['c3'])
    expect(filas[0].cycle_id).toBe('sep')
  })

  it('rechaza mover una cuota al resumen que ya tiene la cuota previa del plan', async () => {
    // C1: sin este guard, mover la cuota 2 al anterior la dejaba encima de la 1 -- las
    // dos con el mismo `due_date`, que es de donde salian los empates de `date`.
    const c1 = tx({ id: 'c1', cycle_id: 'jul', date: '2026-08-03', installment_plan_id: 'p1', description: 'Tele (1/3)' })
    const c2 = tx({ id: 'c2', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p1', description: 'Tele (2/3)' })
    const c3 = tx({ id: 'c3', cycle_id: 'sep', date: '2026-10-05', installment_plan_id: 'p1', description: 'Tele (3/3)' })
    estado.cliente = clienteFalso({
      transacciones: [c1, c2, c3],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
    })

    const r = await moverTransaccionAlResumenVecino('c2', 'anterior')

    expect(r.error).toContain('cuota 1')
    expect(estado.cliente!.upserts).toHaveLength(0)
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
    expect(estado.cliente!.upserts).toHaveLength(0)
  })

  it('si una fila del plan se borró entre la lectura y la escritura, no la resucita: no mueve nada', async () => {
    // El payload del upsert lleva el `id`. Si la fila ya no existe, ON CONFLICT no
    // encuentra conflicto y la RE-INSERTA con los valores viejos -- un `UPDATE ... WHERE
    // id =` habría afectado 0 filas. La ventana no es angosta: en el camino de cuotas hay
    // un round-trip completo a `asegurarCiclos` en el medio, y el chat tiene delete_entity.
    const c1 = tx({ id: 'c1', cycle_id: 'jul', date: '2026-08-03', installment_plan_id: 'p1', description: 'Tele (1/3)' })
    const c2 = tx({ id: 'c2', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p1', description: 'Tele (2/3)' })
    const c3 = tx({ id: 'c3', cycle_id: 'sep', date: '2026-10-05', installment_plan_id: 'p1', description: 'Tele (3/3)' })
    estado.cliente = clienteFalso({
      transacciones: [c1, c2, c3],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
      desaparecenAlReleer: ['c3'],
    })

    const r = await moverTransaccionAlResumenVecino('c2', 'siguiente')

    expect(r.error).toBeTruthy()
    expect(estado.cliente!.upserts).toHaveLength(0)
    // Y la relectura filtró por dueño: las filas que se escriben salen de ahí, no de la
    // lista cargada antes.
    const relectura = estado.cliente!.llamadas.find((l) => l.op === 'select-in')
    expect(relectura?.filtros.user_id).toBe(UID)
  })

  it('si el upsert falla, la action devuelve error y no queda ninguna escritura parcial', async () => {
    // Critical (fix round 1): antes de la atomicidad, un fallo a mitad del loop de
    // updates podia dejar una cuota movida y otra no. Con un unico upsert, el fallo
    // es todo o nada por diseño -- este test fija ese comportamiento.
    const c1 = tx({ id: 'c1', cycle_id: 'jul', date: '2026-08-03', installment_plan_id: 'p1' })
    const c2 = tx({ id: 'c2', cycle_id: 'ago', date: '2026-09-01', installment_plan_id: 'p1' })
    const c3 = tx({ id: 'c3', cycle_id: 'sep', date: '2026-10-05', installment_plan_id: 'p1' })
    estado.cliente = clienteFalso({
      transacciones: [c1, c2, c3],
      ciclos: CUATRO_CICLOS,
      metodo: metodoCredito,
      fallaUpsertTransacciones: true,
    })

    const r = await moverTransaccionAlResumenVecino('c2', 'siguiente')

    expect(r.error).toBeTruthy()
    // Se intento UNA sola escritura (no N updates parciales) y esa unica escritura
    // fallo -- no hay una segunda llamada que haya aplicado la mitad del plan.
    expect(estado.cliente!.upserts).toHaveLength(1)
  })
})
