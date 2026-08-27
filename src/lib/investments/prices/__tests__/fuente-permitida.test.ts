/**
 * Auditoría 2026-08-26 (H1): `data_source_url` la elige el usuario y el server la
 * fetcheaba tal cual, y el precio resultante se escribía con service_role en
 * `market_prices`, que es global por ticker. Un usuario podía envenenar el precio
 * de cualquier ticker para todos los demás (y usar el server como proxy, SSRF).
 * Desde hoy sólo se acepta la página de cotización de IOL *del propio ticker*.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { esFuentePermitida } from '../fuente-permitida'
import { investmentAssetSchema } from '@/lib/schemas/investment-asset'

const IOL = 'https://iol.invertironline.com/titulo/cotizacion/BCBA'

describe('esFuentePermitida', () => {
  it('acepta la página de cotización de IOL del ticker del activo', () => {
    expect(esFuentePermitida(`${IOL}/AL30/1`, 'AL30')).toBe(true)
    expect(esFuentePermitida(`${IOL}/al30/1`, 'AL30')).toBe(true)
    expect(esFuentePermitida('https://iol.invertironline.com/titulo/cotizacion/BYMA/GD30/1', 'GD30')).toBe(true)
  })

  it('acepta la variante D/C del ticker (AL30D → página de AL30 o de AL30D)', () => {
    expect(esFuentePermitida(`${IOL}/AL30/1`, 'AL30D')).toBe(true)
    expect(esFuentePermitida(`${IOL}/AL30D/1`, 'AL30D')).toBe(true)
  })

  it('rechaza cualquier host que no sea IOL, y http', () => {
    expect(esFuentePermitida('https://atacante.example/AL30/1', 'AL30')).toBe(false)
    expect(esFuentePermitida('https://iol.invertironline.com.atacante.example/titulo/cotizacion/BCBA/AL30/1', 'AL30')).toBe(false)
    expect(esFuentePermitida(`http://iol.invertironline.com/titulo/cotizacion/BCBA/AL30/1`, 'AL30')).toBe(false)
    expect(esFuentePermitida('https://169.254.169.254/latest/meta-data/', 'AL30')).toBe(false)
    expect(esFuentePermitida('no es una url', 'AL30')).toBe(false)
  })

  it('rechaza la página de OTRO instrumento: con eso se pegaba el precio de AL30 al ticker GGAL', () => {
    expect(esFuentePermitida(`${IOL}/AL30/1`, 'GGAL')).toBe(false)
    expect(esFuentePermitida(`${IOL}/AL30/1/../GGAL/1`, 'GGAL')).toBe(false)
    expect(esFuentePermitida('https://iol.invertironline.com/otra/cosa/AL30', 'AL30')).toBe(false)
  })
})

describe('investmentAssetSchema', () => {
  const base = { ticker: 'AL30', name: 'Bonar 2030', asset_type: 'bond' as const }

  it('rechaza una data_source_url que no sea la página de IOL del ticker', () => {
    const r = investmentAssetSchema.safeParse({ ...base, data_source_url: 'https://atacante.example/al30.html' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.join('.') === 'data_source_url')).toBe(true)
  })

  it('acepta la página de IOL del ticker, y la ausencia de URL', () => {
    expect(investmentAssetSchema.safeParse({ ...base, data_source_url: `${IOL}/AL30/1` }).success).toBe(true)
    expect(investmentAssetSchema.safeParse({ ...base, data_source_url: '' }).success).toBe(true)
    expect(investmentAssetSchema.safeParse(base).success).toBe(true)
  })
})

describe('el dispatcher ignora una URL no permitida y cae a la fuente canónica', () => {
  beforeEach(() => vi.resetModules())

  it('bond con data_source_url ajena → fetchBondPrice(ticker), nunca fetchFromUrl', async () => {
    const fetchBondPrice = vi.fn(async () => 12345)
    const fetchFromUrl = vi.fn(async () => 999999)
    vi.doMock('../iol', () => ({ fetchBondPrice, fetchFromUrl, fetchONPrice: vi.fn(), fetchFCIPrice: vi.fn(), fetchLetrasPrice: vi.fn() }))
    const { fetchPriceForAsset } = await import('../dispatcher')
    const r = await fetchPriceForAsset({ ticker: 'AL30', asset_type: 'bond', data_source_url: 'https://atacante.example/x.html' })
    expect(fetchFromUrl).not.toHaveBeenCalled()
    expect(fetchBondPrice).toHaveBeenCalledWith('AL30')
    expect(r?.price_ars).toBe(123.45)
  })

  it('bond con la página de IOL del propio ticker → sí usa la URL', async () => {
    const fetchBondPrice = vi.fn(async () => 1)
    const fetchFromUrl = vi.fn(async () => 5000)
    vi.doMock('../iol', () => ({ fetchBondPrice, fetchFromUrl, fetchONPrice: vi.fn(), fetchFCIPrice: vi.fn(), fetchLetrasPrice: vi.fn() }))
    const { fetchPriceForAsset } = await import('../dispatcher')
    const r = await fetchPriceForAsset({ ticker: 'AL30', asset_type: 'bond', data_source_url: `${IOL}/AL30/1` })
    expect(fetchFromUrl).toHaveBeenCalledWith(`${IOL}/AL30/1`, 'AL30')
    expect(fetchBondPrice).not.toHaveBeenCalled()
    expect(r?.price_ars).toBe(50)
  })
})

describe('fetchFromUrl (defensa en profundidad)', () => {
  it('no hace ningún fetch si la URL no es la de IOL del ticker', async () => {
    vi.doUnmock('../iol') // los tests del dispatcher lo mockearon; acá va el módulo real
    vi.resetModules()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { fetchFromUrl } = await import('../iol')
    const r = await fetchFromUrl('https://atacante.example/x.html', 'AL30')
    expect(r).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
