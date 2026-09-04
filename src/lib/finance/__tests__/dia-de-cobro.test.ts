import { describe, it, expect } from 'vitest'
import { pideDiaDeCobro } from '@/lib/finance/recurring'
import type { PaymentMethod } from '@/types/database'

const medio = (type: string) => ({ id: 'm', name: 'Medio', type }) as PaymentMethod

describe('pideDiaDeCobro', () => {
  it('en tarjeta de credito NO lo pide: la plata sale al pagar el resumen', () => {
    expect(pideDiaDeCobro(medio('credit'))).toBe(false)
  })

  it('en efectivo tampoco: no hay cuenta ni ciclo de donde salga', () => {
    expect(pideDiaDeCobro(medio('cash'))).toBe(false)
  })

  it('en debito si: ahi el dia es cuando sale la plata de la cuenta', () => {
    expect(pideDiaDeCobro(medio('debit'))).toBe(true)
  })

  it('sin medio elegido no se pide nada', () => {
    expect(pideDiaDeCobro(undefined)).toBe(false)
  })
})
