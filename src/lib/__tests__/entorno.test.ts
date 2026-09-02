import { describe, it, expect } from 'vitest'
import { esBaseDeProduccion, permiteLoginPorEmail } from '../entorno'

const URL_PROD = 'https://mkkgdjxaotgimqwhyesx.supabase.co'
const URL_DEV = 'https://hgxuxoqyrooaariimqmg.supabase.co'

describe('esBaseDeProduccion', () => {
  it('reconoce la URL de producción', () => {
    expect(esBaseDeProduccion(URL_PROD)).toBe(true)
  })

  it('no confunde DEV con producción', () => {
    expect(esBaseDeProduccion(URL_DEV)).toBe(false)
  })

  it('sin URL, no es producción', () => {
    expect(esBaseDeProduccion(undefined)).toBe(false)
  })

  it('una URL inválida no rompe, y no cuenta como producción', () => {
    expect(esBaseDeProduccion('no-es-una-url')).toBe(false)
  })
})

describe('permiteLoginPorEmail', () => {
  it('en producción, no', () => {
    expect(permiteLoginPorEmail(URL_PROD)).toBe(false)
  })

  it('en DEV, sí', () => {
    expect(permiteLoginPorEmail(URL_DEV)).toBe(true)
  })

  it('sin URL, fail-closed: no', () => {
    expect(permiteLoginPorEmail(undefined)).toBe(false)
  })
})
