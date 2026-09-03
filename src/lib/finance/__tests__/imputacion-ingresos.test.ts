import { describe, it, expect } from 'vitest'
import { necesitaDeclararMes, mesesCandidatos, mesPorDefecto, resolverImputacion } from '../imputacion-ingresos'

describe('necesitaDeclararMes', () => {
  // La ventana sale de los datos de produccion (2026-09-03): los 8 cobros de fin de
  // mes reales caen entre el 25 y el 29, y el ingreso no ambiguo mas cercano por
  // debajo esta el dia 23. Siete dias los cubre sin tocar a los otros 25.
  it('toma los ultimos 7 dias de un mes de 31', () => {
    expect(necesitaDeclararMes('2026-08-25')).toBe(true)
    expect(necesitaDeclararMes('2026-08-31')).toBe(true)
    expect(necesitaDeclararMes('2026-08-24')).toBe(false)
  })

  it('se corre solo en un mes de 30', () => {
    expect(necesitaDeclararMes('2026-09-24')).toBe(true)
    expect(necesitaDeclararMes('2026-09-23')).toBe(false)
  })

  it('se corre solo en febrero, con y sin bisiesto', () => {
    expect(necesitaDeclararMes('2026-02-22')).toBe(true)
    expect(necesitaDeclararMes('2026-02-21')).toBe(false)
    expect(necesitaDeclararMes('2028-02-23')).toBe(true) // 2028 bisiesto: 29 dias
    expect(necesitaDeclararMes('2028-02-22')).toBe(false)
  })

  it('el dia 1 nunca es ambiguo', () => {
    expect(necesitaDeclararMes('2026-08-01')).toBe(false)
  })
})

describe('mesesCandidatos', () => {
  it('ofrece el mes de la fecha y el siguiente, con el nombre del mes', () => {
    expect(mesesCandidatos('2026-08-29')).toEqual([
      { valor: '2026-08-01', label: 'Agosto' },
      { valor: '2026-09-01', label: 'Septiembre' },
    ])
  })

  it('cruza el ano sin romperse', () => {
    expect(mesesCandidatos('2026-12-29')).toEqual([
      { valor: '2026-12-01', label: 'Diciembre' },
      { valor: '2027-01-01', label: 'Enero' },
    ])
  })
})

describe('mesPorDefecto', () => {
  it('sin preferencia declarada usa el mes de la fecha', () => {
    expect(mesPorDefecto('2026-08-29', null)).toBe('2026-08-01')
  })

  it('con la preferencia en false usa el mes de la fecha', () => {
    expect(mesPorDefecto('2026-08-29', false)).toBe('2026-08-01')
  })

  it('con la preferencia en true propone el mes siguiente', () => {
    expect(mesPorDefecto('2026-08-29', true)).toBe('2026-09-01')
  })
})

describe('resolverImputacion', () => {
  it('fecha fuera del borde: null, sin importar lo elegido', () => {
    expect(resolverImputacion('2026-08-15', '2026-09-01', true)).toBeNull()
  })

  it('fecha vacia: null, no explota', () => {
    expect(resolverImputacion('', '2026-09-01', true)).toBeNull()
  })

  it('elegido valido (entre los candidatos de la fecha actual): se respeta', () => {
    expect(resolverImputacion('2026-08-29', '2026-09-01', false)).toBe('2026-09-01')
  })

  it('elegido que ya no esta entre los candidatos: se descarta y cae al default', () => {
    // Se eligio septiembre con la fecha en 29-ago; la fecha se movio a 28-jul
    // (julio tiene 31 dias, sigue en el borde) -- los candidatos pasan a ser
    // Julio/Agosto y "2026-09-01" no es ninguno de los dos.
    expect(resolverImputacion('2026-07-28', '2026-09-01', false)).toBe('2026-07-01')
  })

  it('sin elegido: usa el default segun la preferencia', () => {
    expect(resolverImputacion('2026-08-29', null, true)).toBe('2026-09-01')
    expect(resolverImputacion('2026-08-29', undefined, false)).toBe('2026-08-01')
  })
})
