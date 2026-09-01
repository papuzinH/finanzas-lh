import { describe, it, expect } from 'vitest'
import { novedadParaMostrar } from '../decidir'
import type { Version } from '../versiones'

// Datos ficticios: el orden de la lista es "la más reciente primero", igual que
// en `versiones.ts`.
const V2: Version = {
  version: '1.2.0',
  fecha: '2026-09-20',
  titulo: 'Las tarjetas cuentan bien los dólares',
  items: ['El disponible ya no ignora las compras en USD.'],
}
const V1: Version = {
  version: '1.1.0',
  fecha: '2026-09-10',
  titulo: 'Histórico por categoría',
  items: ['Podés ver en qué se te fue la plata mes a mes.'],
}
const V0: Version = {
  version: '1.0.0',
  fecha: '2026-09-01',
  titulo: 'Chanchito, ahora con novedades',
  items: ['Te vamos a avisar cuando algo cambie.'],
}
const VERSIONES = [V2, V1, V0]

const ALTA_VIEJA = '2026-04-15T10:30:00Z'

describe('novedadParaMostrar', () => {
  it('le muestra la más reciente a quien nunca vio ninguna', () => {
    expect(novedadParaMostrar(VERSIONES, null, ALTA_VIEJA)).toEqual(V2)
  })

  it('no le muestra nada a quien ya vio la más reciente', () => {
    expect(novedadParaMostrar(VERSIONES, '1.2.0', ALTA_VIEJA)).toBeNull()
  })

  it('a quien se salteó dos versiones le muestra sólo la más reciente', () => {
    // La decisión de producto vive acá: NUNCA se acumula. Si alguien "arregla"
    // esto devolviendo las tres, este test se pone rojo.
    const resultado = novedadParaMostrar(VERSIONES, '1.0.0', ALTA_VIEJA)

    expect(resultado).toEqual(V2)
    expect(Array.isArray(resultado)).toBe(false)
  })

  it('no le muestra nada a quien se registró después de la última versión', () => {
    // Para el recién llegado todo es nuevo: ya tuvo su onboarding y su tour.
    expect(novedadParaMostrar(VERSIONES, null, '2026-09-25T08:00:00Z')).toBeNull()
  })

  it('no le muestra nada a quien se registró el mismo día que salió la versión', () => {
    // Comparación estricta por día: ante la duda, no molestar.
    expect(novedadParaMostrar(VERSIONES, null, '2026-09-20T23:59:00Z')).toBeNull()
  })

  it('devuelve null si todavía no hay ninguna versión cargada', () => {
    expect(novedadParaMostrar([], null, ALTA_VIEJA)).toBeNull()
  })

  it('elige por fecha, no por posición en el archivo', () => {
    // El archivo pide "la más reciente primero", pero eso es una convención que
    // nadie verifica: agregar la versión nueva al final es el error natural. Si
    // la función confiara en el orden, acá mostraría una versión vieja.
    const desordenada = [V0, V1, V2]

    expect(novedadParaMostrar(desordenada, null, ALTA_VIEJA)).toEqual(V2)
  })

  it('muestra la más reciente si la versión guardada ya no está en la lista', () => {
    // El archivo se editó y quedó un string huérfano en la base: se compara por
    // igualdad contra la más reciente, así que igual decide bien.
    expect(novedadParaMostrar(VERSIONES, '0.9.0-vieja', ALTA_VIEJA)).toEqual(V2)
  })
})
