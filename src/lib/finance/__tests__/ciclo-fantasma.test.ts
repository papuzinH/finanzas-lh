import { describe, it, expect } from 'vitest'
import { generarCiclos, recalcularFuturosGenerated, type CreditCardCycle } from '../cycles'
import type { PaymentMethod } from '@/types/database'

// Los ciclos REALES de la Mastercard Galicia de produccion el 2026-09-17, el dia que se
// reporto el bug. Galicia movio el cierre de septiembre al 1-oct (mueve cierre y
// vencimiento como un par), asi que NINGUN resumen de esa tarjeta cierra en septiembre:
// el consumo de septiembre cierra el 1 de octubre. Ese es el fixture que importa, y es
// el que ningun test tenia: los de cycles.test.ts corren el cierre dentro del mes.
const ciclo = (over: Partial<CreditCardCycle>): CreditCardCycle => ({
  id: 'c1', user_id: 'u1', payment_method_id: 'master',
  closing_date: '2026-08-27', due_date: '2026-09-04',
  source: 'declared', created_at: '2026-09-02T18:56:57Z',
  reminder_dismissed_at: null,
  ...over,
})

// El resumen que ya se pago (cerro 27-ago, vencio 4-sep).
const AGOSTO = ciclo({ id: 'ago', closing_date: '2026-08-27', due_date: '2026-09-04' })
// El que cubre el consumo de SEPTIEMBRE, declarado del papel del banco.
const SEPTIEMBRE = ciclo({ id: 'sep', closing_date: '2026-10-01', due_date: '2026-10-09' })

const master = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: 'master', user_id: 'u1', name: 'Mastercard Galicia', type: 'credit',
  default_closing_day: 27, default_payment_day: 4, created_at: '2026-01-01',
  is_personal: false, is_default: false, bucket: 'pocket',
  initial_balance: 0, initial_balance_at: null,
  ...over,
} as PaymentMethod)

// Los defaults que el usuario cargo al ver el bug, y que son el dato real de su tarjeta.
const diaUno = { default_closing_day: 1, default_payment_day: 9 }

describe('generarCiclos: el resumen fantasma (incidente 2026-09-17)', () => {
  it('NO fabrica un resumen de septiembre cuando el de septiembre cierra el 1-oct', () => {
    // El bug: mesesOcupados indexa por closing_date.slice(0,7), asi que el declarado del
    // 1-oct ocupa '2026-10' y deja '2026-09' libre. El sync llenaba ese hueco con los
    // defaults (cierre 27) y nacia un resumen vacio que vencia ANTES (4-oct) que el real
    // (9-oct): cicloVigente lo elegia a el, y la pantalla mostraba un resumen en cero
    // con la mensualidad inyectada como unica linea.
    const nuevos = generarCiclos(master(), new Date(2026, 7, 1), new Date(2026, 10, 1), [AGOSTO, SEPTIEMBRE])
    expect(nuevos.map((c) => c.closing_date)).not.toContain('2026-09-27')
  })

  it('con el cierre el dia 1 tampoco duplica: el candidato de septiembre cae sobre el de agosto', () => {
    // Con el dia 1 el candidato de septiembre es el 1-sep, a 5 dias del cierre del
    // resumen de agosto: son el mismo resumen con fechas distintas, no dos.
    const nuevos = generarCiclos(master(diaUno), new Date(2026, 7, 1), new Date(2026, 9, 1), [AGOSTO, SEPTIEMBRE])
    expect(nuevos.map((c) => c.closing_date)).not.toContain('2026-09-01')
  })

  it('sigue generando el resumen que de verdad falta', () => {
    // Guard del guard: que el fix no deje de generar lo que si hace falta. El candidato
    // de noviembre (1-nov) no tiene ningun cierre cerca: el mas proximo es el 1-oct, a
    // 31 dias. Entre resumenes consecutivos reales hay 28-35 dias (medido en las dos
    // tarjetas de produccion), asi que el umbral no los puede colapsar.
    const nuevos = generarCiclos(master(diaUno), new Date(2026, 8, 1), new Date(2026, 10, 1), [AGOSTO, SEPTIEMBRE])
    expect(nuevos.map((c) => c.closing_date)).toContain('2026-11-01')
  })
})

describe('recalcularFuturosGenerated: el re-fechado no manda un resumen al pasado', () => {
  it('no mueve un resumen futuro a una fecha que ya paso', () => {
    // Lo que paso de verdad: con el fantasma en 27-sep (futuro el 17-sep) y los defaults
    // cambiados a 1/9, el fresco de '2026-09' es el 1-sep. El re-fechado lo movio ahi y
    // el resumen nacio VENCIDO, reclamando un pago que no existia.
    const fantasma = ciclo({ id: 'fantasma', closing_date: '2026-09-27', due_date: '2026-10-04', source: 'generated' })
    const cambios = recalcularFuturosGenerated(master(diaUno), [AGOSTO, fantasma, SEPTIEMBRE], '2026-09-17')
    expect(cambios.find((c) => c.id === 'fantasma')).toBeUndefined()
  })

  it('no re-fecha un resumen encima del cierre de otro', () => {
    // El otro modo de falla del mismo dia: el generated de octubre (27-oct) queria pasar
    // a 1-oct, que ya es el cierre del declarado. La unique (payment_method_id,
    // closing_date) lo rechaza y, como aplicarRealineado escribe fila por fila y corta al
    // primer error, el conjunto quedaba a medias sin que la pantalla avisara.
    const octubre = ciclo({ id: 'oct', closing_date: '2026-10-27', due_date: '2026-11-04', source: 'generated' })
    const cambios = recalcularFuturosGenerated(master(diaUno), [AGOSTO, SEPTIEMBRE, octubre], '2026-09-17')
    expect(cambios.find((c) => c.closing_date === '2026-10-01')).toBeUndefined()
  })
})

describe('el sync no revive el fantasma una vez borrado', () => {
  // Los cierres REALES de la Mastercard Galicia de produccion tal como quedan despues de
  // borrar el fantasma, con los defaults que el usuario cargo del papel (cierra 1, vence 9).
  // Es la condicion para que la limpieza de datos sea estable: con el codigo viejo, borrar el
  // fantasma liberaba el casillero '2026-09' y el sync lo fabricaba de nuevo en la proxima
  // carga de la app -- esta vez ya vencido, reclamando un pago.
  const REALES: CreditCardCycle[] = [
    ciclo({ id: 'jul', closing_date: '2026-07-30', due_date: '2026-08-07' }),
    ciclo({ id: 'ago', closing_date: '2026-08-27', due_date: '2026-09-04' }),
    ciclo({ id: 'sep', closing_date: '2026-10-01', due_date: '2026-10-09' }),
    ciclo({ id: 'oct', closing_date: '2026-10-27', due_date: '2026-11-04', source: 'generated' }),
    ciclo({ id: 'nov', closing_date: '2026-11-27', due_date: '2026-12-04', source: 'generated' }),
  ]

  it('no genera ningun resumen nuevo en la ventana que asegura el sync', () => {
    // La ventana real de syncAutomaticRecurringCharges: hoy-1 mes a hoy+2 meses.
    const nuevos = generarCiclos(master(diaUno), new Date(2026, 7, 17), new Date(2026, 10, 17), REALES)
    expect(nuevos).toEqual([])
  })

  it('y con el codigo viejo habria revivido: el candidato de septiembre cae sobre el de agosto', () => {
    // Guard del guard, al reves: si alguien vuelve a indexar por mes calendario, el candidato
    // 1-sep aparece y este test lo delata. Se afirma sobre el cierre concreto, no sobre el
    // largo de la lista, para que no pase por casualidad.
    const cierres = generarCiclos(master(diaUno), new Date(2026, 7, 17), new Date(2026, 10, 17), REALES)
      .map((c) => c.closing_date)
    expect(cierres).not.toContain('2026-09-01')
    expect(cierres).not.toContain('2026-09-27')
  })
})
