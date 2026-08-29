/**
 * `category_id` es NOT NULL en transactions, installment_plans y recurring_plans
 * (verificado contra la base el 2026-08-29), pero seis lugares del código lo
 * trataban como nullable: el chat ponía `categoryId = null` cuando el tipo de la
 * categoría no coincidía con el del movimiento, `deleteCategoryUnlink` hacía
 * `update({ category_id: null })` y el editor de cuotas mandaba null cuando el
 * campo venía vacío. Los tres fallaban con 23502 — y el de borrar categoría,
 * además, arrastraba después un 23503 con un mensaje crudo de Postgres.
 *
 * El repo ya había resuelto lo mismo para «Pagos de tarjeta»: una categoría
 * `is_system` get-or-create. Esto lo generaliza.
 */
import { describe, it, expect } from 'vitest'
import { CATEGORIA_DESCARTE, getOrCreateCategoriaDescarte } from '../descarte'

const UID = '11111111-1111-4111-8111-111111111111'
const ID_GASTO = 'aaaaaaaa-0000-4000-8000-00000000000e'
const ID_INGRESO = 'aaaaaaaa-0000-4000-8000-00000000000i'

/** Cliente falso con una tabla `categories` en memoria. */
function clienteFalso(filas: Array<{ id: string; name: string; type: string; user_id: string }> = []) {
  const creadas: Array<Record<string, unknown>> = []

  const selectBuilder = () => {
    const filtros: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b }
    b.limit = async () => ({
      data: filas.filter((f) =>
        Object.entries(filtros).every(([c, v]) => (f as Record<string, unknown>)[c] === v)
      ),
      error: null,
    })
    return b
  }

  return {
    creadas,
    from: () => ({
      select: () => selectBuilder(),
      insert: (set: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            creadas.push(set)
            return { data: { id: 'nueva-' + set.type }, error: null }
          },
        }),
      }),
    }),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const como = (c: unknown) => c as any

describe('getOrCreateCategoriaDescarte', () => {
  it('devuelve la categoría de descarte que ya existe, sin crear otra', async () => {
    const cliente = clienteFalso([
      { id: ID_GASTO, name: CATEGORIA_DESCARTE, type: 'expense', user_id: UID },
    ])

    const id = await getOrCreateCategoriaDescarte(como(cliente), UID, 'expense')

    expect(id).toBe(ID_GASTO)
    expect(cliente.creadas).toHaveLength(0)
  })

  it('la crea como is_system cuando no existe', async () => {
    const cliente = clienteFalso([])

    const id = await getOrCreateCategoriaDescarte(como(cliente), UID, 'expense')

    expect(id).toBe('nueva-expense')
    expect(cliente.creadas).toHaveLength(1)
    expect(cliente.creadas[0]).toMatchObject({
      user_id: UID,
      name: CATEGORIA_DESCARTE,
      type: 'expense',
      is_system: true,
    })
  })

  it('no confunde la de gastos con la de ingresos: son categorías distintas', async () => {
    // Sólo existe la de gastos; pedir la de ingresos no puede devolverla,
    // porque una transacción `income` con categoría `expense` es justo la
    // combinación inconsistente que el chat quería evitar.
    const cliente = clienteFalso([
      { id: ID_GASTO, name: CATEGORIA_DESCARTE, type: 'expense', user_id: UID },
    ])

    const id = await getOrCreateCategoriaDescarte(como(cliente), UID, 'income')

    expect(id).toBe('nueva-income')
    expect(cliente.creadas[0]).toMatchObject({ type: 'income' })
  })

  it('no devuelve la categoría de otro usuario', async () => {
    const cliente = clienteFalso([
      { id: ID_INGRESO, name: CATEGORIA_DESCARTE, type: 'expense', user_id: 'otro-usuario' },
    ])

    const id = await getOrCreateCategoriaDescarte(como(cliente), UID, 'expense')

    expect(id).toBe('nueva-expense')
  })
})
