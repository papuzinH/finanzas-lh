/**
 * Auditoría 2026-08-26 (M4): `reassignAndDeletePaymentMethod` verificaba que el
 * medio a BORRAR fuera del usuario, pero no el DESTINO de la reasignación
 * (`newMethodId`). RLS impide leer o mutar datos ajenos, pero no impide que una
 * fila propia (las transacciones reasignadas) quede apuntando por FK a un medio
 * de otro usuario — invariante de aislamiento roto. El fix: validar el destino
 * con el patrón que ya usa `deletePaymentMethod` (`.eq('user_id', user.id)`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const UID = '11111111-1111-4111-8111-111111111111'
const PROPIO = 'aaaaaaaa-0000-4000-8000-000000000001'
const A_BORRAR = 'aaaaaaaa-0000-4000-8000-000000000002'
const AJENO = 'bbbbbbbb-9999-4999-8999-999999999999'

/**
 * Cliente Supabase de prueba. Registra cada `.from(tabla)` con sus filtros y
 * decide qué devuelve el `.single()` según la política de RLS que simulamos:
 * un select sobre `payment_methods` sólo devuelve la fila si el filtro incluye
 * `user_id = UID` y el `id` pedido es uno de los medios del usuario.
 */
function clienteFalso() {
  const llamadas: Array<{ tabla: string; op: string; filtros: Record<string, unknown>; set?: unknown }> = []
  const MEDIOS_DEL_USUARIO = new Set([PROPIO, A_BORRAR])

  const builder = (tabla: string, op: string, set?: unknown) => {
    const filtros: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
    b.single = async () => {
      llamadas.push({ tabla, op, filtros, set })
      // RLS: sólo devuelve la fila si es de payment_methods, el user_id filtra
      // por UID (o no se filtró, pero entonces RLS igual esconde lo ajeno) y el
      // id pedido pertenece al usuario.
      const idPedido = filtros.id as string | undefined
      const visiblePorRls = filtros.user_id === undefined || filtros.user_id === UID
      const esDelUsuario = idPedido !== undefined && MEDIOS_DEL_USUARIO.has(idPedido) && visiblePorRls
      return { data: esDelUsuario ? { id: idPedido, type: 'debit' } : null, error: null }
    }
    // update/delete resuelven al await sin `.single()`
    b.then = (resolve: (v: unknown) => void) => { llamadas.push({ tabla, op, filtros, set }); resolve({ error: null }) }
    return b
  }

  return {
    llamadas,
    auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) },
    from: (tabla: string) => ({
      select: () => builder(tabla, 'select'),
      update: (set: unknown) => builder(tabla, 'update', set),
      delete: () => builder(tabla, 'delete'),
    }),
  }
}

const estado = vi.hoisted(() => ({ cliente: null as ReturnType<typeof clienteFalso> | null }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => estado.cliente }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { reassignAndDeletePaymentMethod } from '../actions'

beforeEach(() => { estado.cliente = clienteFalso() })

describe('reassignAndDeletePaymentMethod: dueño del destino (M4)', () => {
  it('rechaza reasignar a un medio que no es del usuario, sin tocar transacciones', async () => {
    const r = await reassignAndDeletePaymentMethod(A_BORRAR, AJENO)

    expect(r.error).toBeTruthy()
    const escrituras = estado.cliente!.llamadas.filter((l) => l.op === 'update' || l.op === 'delete')
    expect(escrituras).toHaveLength(0) // no reasignó ni borró nada
  })

  it('valida el destino con user_id antes de reasignar', async () => {
    await reassignAndDeletePaymentMethod(A_BORRAR, PROPIO)

    // Hubo un select sobre payment_methods para el destino, filtrando por user_id.
    const validacionesDestino = estado.cliente!.llamadas.filter(
      (l) => l.tabla === 'payment_methods' && l.op === 'select' && l.filtros.id === PROPIO,
    )
    expect(validacionesDestino.length).toBeGreaterThan(0)
    expect(validacionesDestino.every((l) => l.filtros.user_id === UID)).toBe(true)
  })

  it('con un destino propio válido, sí reasigna y borra', async () => {
    const r = await reassignAndDeletePaymentMethod(A_BORRAR, PROPIO)

    expect(r.success).toBe(true)
    const tablasReasignadas = estado.cliente!.llamadas.filter((l) => l.op === 'update').map((l) => l.tabla)
    expect(tablasReasignadas).toEqual(expect.arrayContaining(['transactions', 'recurring_plans', 'installment_plans']))
  })

  it('reasignar a null (dejar sin medio) sigue permitido: no hay dueño que validar', async () => {
    const r = await reassignAndDeletePaymentMethod(A_BORRAR, null)

    expect(r.success).toBe(true)
  })
})
