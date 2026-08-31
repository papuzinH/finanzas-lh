import { describe, it, expect } from 'vitest'
import { hayHomonimos } from '../tab-categorias'

// Fix-final, ola 1 — Important 6 (menor): `tab-categorias.tsx` resolvía
// `categoryId` con `store.categories.find(c => c.name === selected)?.id`, que con
// dos categorías del mismo nombre elige una arbitraria — así que el modal de
// detalle podía mostrar la serie de la categoría que NO es, mientras el total de
// arriba (que agrega por nombre) sigue sumando las dos. El bug de fondo (que dos
// categorías compartan nombre) es pre-existente y no se toca acá: se cierra sólo
// la cara nueva, no montando `<DetalleCategoria>` cuando hay homónimos.
describe('hayHomonimos', () => {
  it('false sin selección', () => {
    expect(hayHomonimos([{ name: 'Casa' }, { name: 'Casa' }], null)).toBe(false)
  })

  it('false con un solo match para el nombre', () => {
    expect(hayHomonimos([{ name: 'Casa' }, { name: 'Comida' }], 'Casa')).toBe(false)
  })

  it('true con dos categorías del mismo nombre (ids distintos)', () => {
    expect(hayHomonimos([{ name: 'Casa' }, { name: 'Casa' }, { name: 'Comida' }], 'Casa')).toBe(true)
  })

  it('false si el nombre buscado no matchea ninguna', () => {
    expect(hayHomonimos([{ name: 'Casa' }], 'Otra')).toBe(false)
  })
})
