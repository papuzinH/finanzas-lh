/**
 * La CSP (auditoría M3) no permite `'unsafe-eval'`, así que en el navegador Zod
 * no puede compilar sus validadores con `new Function`: su `allowsEval` detecta
 * el bloqueo —lo prueba en un try/catch y cachea el resultado— y cae al camino
 * interpretado. Este test corre los schemas reales del proyecto en ese modo
 * (`jitless`), que es el único que se ejecuta en producción desde el 2026-08-27.
 *
 * Si Zod cambiara de comportamiento y el camino sin JIT dejara de validar igual,
 * los formularios aceptarían basura en el navegador y ningún otro test lo vería:
 * el resto de la suite corre en node, sin CSP, con el JIT habilitado.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'zod/v4/core'
import { transactionSchema } from '@/lib/schemas/transaction'
import { investmentAssetSchema } from '@/lib/schemas/investment-asset'

beforeAll(() => { config({ jitless: true }) })
afterAll(() => { config({ jitless: false }) })

describe('los schemas validan igual sin el JIT de Zod', () => {
  it('rechaza lo que tiene que rechazar', () => {
    expect(transactionSchema.safeParse({}).success).toBe(false)
    expect(
      investmentAssetSchema.safeParse({
        ticker: 'AL30', name: 'Bonar', asset_type: 'bond',
        data_source_url: 'https://atacante.example/al30.html',
      }).success,
    ).toBe(false)
  })

  it('acepta lo que tiene que aceptar', () => {
    expect(
      investmentAssetSchema.safeParse({ ticker: 'AL30', name: 'Bonar 2030', asset_type: 'bond' }).success,
    ).toBe(true)
  })

  it('el modo sin JIT está realmente activo mientras corre este test', () => {
    // Si el flag no tomara efecto, los dos casos de arriba probarían el camino
    // con JIT y este archivo no estaría verificando nada.
    expect(config().jitless).toBe(true)
  })
})
