/**
 * Auditoría 2026-08-26 (M6): `runUpdatePrices` sólo pedía sesión. Cada llamada
 * dispara 5 APIs externas más un scrape por activo, así que un usuario en loop
 * hacía que el server martillara dolarapi/coingecko/yahoo/IOL hasta que esos
 * proveedores bloquearan la IP de Vercel — y ahí los precios se rompen para
 * todos. El umbral de 1 h que existía vivía sólo en el cliente, o sea en el lado
 * que el atacante controla.
 *
 * El guard va en el server y ANTES de cualquier fetch: lo que importa no es que
 * devuelva 0, es que no haya salido a la red.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const admin = { from: vi.fn() }
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => admin }))

const fetchPriceForAsset = vi.fn()
vi.mock('../prices/dispatcher', () => ({ fetchPriceForAsset: (...a: unknown[]) => fetchPriceForAsset(...a) }))

const fetchAllRates = vi.fn()
vi.mock('../prices/exchange-rates', () => ({ fetchAllRates: () => fetchAllRates() }))

import { runUpdatePrices, UMBRAL_REFRESCO_MS } from '../update-prices-core'

/**
 * Supabase mínimo: `exchange_rates` devuelve la fecha que le pasemos y
 * `investment_assets` un activo del usuario.
 */
function supabaseCon(ultimoUpdate: string | null) {
  return {
    from(tabla: string) {
      if (tabla === 'exchange_rates') {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: ultimoUpdate ? { last_update: ultimoUpdate } : null,
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            eq: async () => ({
              data: [{ id: 'a1', ticker: 'AL30', asset_type: 'bond', currency: 'ARS', data_source_url: null, metadata: null }],
              error: null,
            }),
          }),
        }),
      }
    },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  admin.from.mockReturnValue({ upsert: async () => ({ error: null }) })
  fetchPriceForAsset.mockResolvedValue({ price_ars: 100, source: 'iol' })
  fetchAllRates.mockResolvedValue({ USD_ARS_BLUE: { sell: 1400 }, USD_ARS_MEP: null, USD_ARS_CCL: null, USDT_ARS: null })
})

describe('umbral de refresco en el server', () => {
  it('no sale a la red si las cotizaciones se actualizaron recién', async () => {
    const haceUnMinuto = new Date(Date.now() - 60_000).toISOString()

    const r = await runUpdatePrices(supabaseCon(haceUnMinuto), 'user-1')

    expect(fetchPriceForAsset).not.toHaveBeenCalled()
    expect(fetchAllRates).not.toHaveBeenCalled()
    expect(r.skipped).toBe(true)
  })

  it('al saltear no miente: cero actualizados y ninguna cotización “fallada”', async () => {
    // Devolver las 4 pairs en failedRates haría que la UI avise «no se pudo
    // traer el dólar», que es falso: no se intentó porque ya estaba fresco.
    const r = await runUpdatePrices(supabaseCon(new Date().toISOString()), 'user-1')

    expect(r).toEqual({ updated: 0, failed: [], rates_updated: false, failedRates: [], skipped: true })
  })

  it('procede cuando la última actualización ya quedó vieja', async () => {
    const viejo = new Date(Date.now() - UMBRAL_REFRESCO_MS - 60_000).toISOString()

    const r = await runUpdatePrices(supabaseCon(viejo), 'user-1')

    expect(fetchPriceForAsset).toHaveBeenCalled()
    expect(fetchAllRates).toHaveBeenCalled()
    expect(r.skipped).toBe(false)
    expect(r.updated).toBe(1)
  })

  it('procede si nunca hubo una cotización: base recién creada', async () => {
    const r = await runUpdatePrices(supabaseCon(null), 'user-1')

    expect(fetchAllRates).toHaveBeenCalled()
    expect(r.skipped).toBe(false)
  })

  it('el umbral es de 10 minutos', () => {
    expect(UMBRAL_REFRESCO_MS).toBe(10 * 60 * 1000)
  })
})
