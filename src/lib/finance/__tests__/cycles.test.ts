import { describe, it, expect } from 'vitest'
import {
  ciclosDeMetodo, generarCiclos, cicloDeCompra, cicloVigente, cicloAnterior, cicloNEsimo,
  cicloSaldadoEn,
  type CreditCardCycle,
} from '../cycles'
import type { PaymentMethod } from '@/types/database'

// Los ciclos REALES de la Visa Galicia del resumen del 1-sep-2026. Van desparejos
// a proposito: los tres cierres son los tres jueves, y el dia calendario se corre
// hasta 4 dias. Un fixture mensual perfecto es como se escondieron los dos ultimos
// bugs grandes del repo (E8 con totalARS === total, el historico con periodDate === date).
const ciclo = (over: Partial<CreditCardCycle>): CreditCardCycle => ({
  id: 'c1', user_id: 'u1', payment_method_id: 'visa',
  closing_date: '2026-07-23', due_date: '2026-08-03',
  source: 'generated', created_at: '2026-01-01T00:00:00Z',
  ...over,
})

const JULIO = ciclo({ id: 'jul', closing_date: '2026-07-23', due_date: '2026-08-03' })
const AGOSTO = ciclo({ id: 'ago', closing_date: '2026-08-20', due_date: '2026-09-01' })
const SEPTIEMBRE = ciclo({ id: 'sep', closing_date: '2026-09-24', due_date: '2026-10-05' })
const TRES = [JULIO, AGOSTO, SEPTIEMBRE]

const visa = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: 'visa', user_id: 'u1', name: 'Visa', type: 'credit',
  default_closing_day: 20, default_payment_day: 1, created_at: '2026-01-01',
  is_personal: false, is_default: false, bucket: 'pocket',
  initial_balance: 0, initial_balance_at: null,
  ...over,
} as PaymentMethod)

describe('cicloDeCompra', () => {
  it('ubica la compra en el primer ciclo que cierra despues de ella', () => {
    expect(cicloDeCompra('2026-08-05', TRES)?.id).toBe('ago')
  })

  it('la compra del DIA del cierre entra en el ciclo que cierra (E16)', () => {
    // El ciclo corre hasta las 23:59 de la fecha de cierre. Es la regla del banco,
    // y coincide con lo que ya hacia calculateCreditPaymentDate (diaCompra > closingDay).
    expect(cicloDeCompra('2026-08-20', TRES)?.id).toBe('ago')
  })

  it('el dia siguiente al cierre ya es del ciclo que viene', () => {
    expect(cicloDeCompra('2026-08-21', TRES)?.id).toBe('sep')
  })

  it('sin ciclo que la contenga devuelve undefined, no inventa uno', () => {
    expect(cicloDeCompra('2026-11-01', TRES)).toBeUndefined()
  })
})

describe('cicloVigente', () => {
  it('el dia EXACTO del vencimiento el resumen sigue vigente: todavia lo debes', () => {
    expect(cicloVigente(TRES, new Date(2026, 8, 1))?.id).toBe('ago')
  })

  it('al dia siguiente del vencimiento avanza al proximo', () => {
    expect(cicloVigente(TRES, new Date(2026, 8, 2))?.id).toBe('sep')
  })

  it('sin ciclos futuros devuelve undefined', () => {
    expect(cicloVigente(TRES, new Date(2026, 11, 1))).toBeUndefined()
  })
})

describe('cicloAnterior', () => {
  it('devuelve el ciclo previo por fecha de cierre', () => {
    expect(cicloAnterior(TRES, SEPTIEMBRE)?.id).toBe('ago')
  })

  it('el primero no tiene anterior', () => {
    expect(cicloAnterior(TRES, JULIO)).toBeUndefined()
  })
})

describe('cicloNEsimo', () => {
  it('la cuota N cuenta RESUMENES, no meses (E14)', () => {
    // Vencimientos 3-ago, 1-sep y 5-oct: sumar meses a la primera daria 3-oct,
    // que no es ninguna fecha real de esta tarjeta.
    expect(cicloNEsimo(TRES, JULIO, 0)?.id).toBe('jul')
    expect(cicloNEsimo(TRES, JULIO, 2)?.due_date).toBe('2026-10-05')
  })

  it('sin suficientes ciclos materializados devuelve undefined', () => {
    expect(cicloNEsimo(TRES, JULIO, 5)).toBeUndefined()
  })
})

describe('generarCiclos', () => {
  it('pare un ciclo por mes desde los defaults de la tarjeta', () => {
    const nuevos = generarCiclos(visa(), new Date(2026, 6, 1), new Date(2026, 8, 1), [])
    expect(nuevos).toHaveLength(3)
    expect(nuevos[0]).toMatchObject({ closing_date: '2026-07-20', due_date: '2026-08-01', source: 'generated' })
  })

  it('cierra y vence en el MISMO mes cuando el vencimiento es posterior al cierre', () => {
    const m = visa({ default_closing_day: 10, default_payment_day: 25 })
    const nuevos = generarCiclos(m, new Date(2026, 6, 1), new Date(2026, 6, 1), [])
    expect(nuevos[0]).toMatchObject({ closing_date: '2026-07-10', due_date: '2026-07-25' })
  })

  it('NO genera un ciclo para un mes que ya tiene uno: un declarado nunca se pisa', () => {
    // El invariante central visto desde la generacion. El declarado de agosto cierra
    // el 27 y el default diria 20: aun asi no se agrega otro, porque la clave es el
    // MES del cierre y no la fecha exacta.
    const declarado = ciclo({ id: 'ago', closing_date: '2026-08-27', due_date: '2026-09-04', source: 'declared' })
    const nuevos = generarCiclos(visa(), new Date(2026, 7, 1), new Date(2026, 8, 1), [declarado])
    expect(nuevos).toHaveLength(1)
    expect(nuevos[0].closing_date).toBe('2026-09-20')
  })

  it('clampea al ultimo dia del mes cuando el dia configurado no existe', () => {
    const m = visa({ default_closing_day: 31, default_payment_day: 15 })
    const nuevos = generarCiclos(m, new Date(2026, 1, 1), new Date(2026, 1, 1), [])
    expect(nuevos[0].closing_date).toBe('2026-02-28')
  })

  it('genera hacia atras igual que hacia adelante', () => {
    const nuevos = generarCiclos(visa(), new Date(2025, 11, 1), new Date(2026, 0, 1), [])
    expect(nuevos.map((c) => c.closing_date)).toEqual(['2025-12-20', '2026-01-20'])
  })

  it('una tarjeta sin ciclo configurado no genera nada: no se le inventa uno', () => {
    const sinCiclo = visa({ default_closing_day: null })
    expect(generarCiclos(sinCiclo, new Date(2026, 6, 1), new Date(2026, 8, 1), [])).toEqual([])
    expect(generarCiclos(visa({ type: 'debit' }), new Date(2026, 6, 1), new Date(2026, 8, 1), [])).toEqual([])
  })
})

describe('cicloSaldadoEn', () => {
  // Cierres reales: 07-23 / 08-20 / 09-24 (TRES). El ruling del controller:
  // "el ULTIMO ciclo (por closing_date) con closing_date <= fechaPago".
  it('pago 2026-09-03: cerro ago (08-20) pero sep (09-24) todavia no -> salda ago', () => {
    expect(cicloSaldadoEn(TRES, '2026-09-03')?.id).toBe('ago')
  })

  it('pago 2026-08-15: solo cerro jul (07-23) -> salda jul', () => {
    expect(cicloSaldadoEn(TRES, '2026-08-15')?.id).toBe('jul')
  })

  it('sin ciclos, o pago anterior a todos los cierres: no hay resumen que saldar', () => {
    expect(cicloSaldadoEn([], '2026-09-03')).toBeUndefined()
    expect(cicloSaldadoEn(TRES, '2026-07-01')).toBeUndefined()
  })
})

describe('ciclosDeMetodo', () => {
  it('filtra por tarjeta y ordena por cierre ascendente', () => {
    const otra = ciclo({ id: 'x', payment_method_id: 'master', closing_date: '2026-08-27' })
    const r = ciclosDeMetodo('visa', [SEPTIEMBRE, otra, JULIO, AGOSTO])
    expect(r.map((c) => c.id)).toEqual(['jul', 'ago', 'sep'])
  })
})
