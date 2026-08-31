// src/lib/finance/__tests__/historico-clasificacion.test.ts
import { describe, it, expect } from 'vitest'
import { clasificarSerie } from '@/lib/finance/historico'
import type { PuntoMes } from '@/lib/finance/historico'

const p = (month: string, real: number, enCurso = false): PuntoMes =>
  ({ month, nominal: real, real, enCurso })

describe('clasificarSerie', () => {
  it('marca evento cuando el pico supera 3 veces la mediana de los otros meses', () => {
    // El caso real: Fernet, con un pico de 255x
    const r = clasificarSerie([p('2026-04', 3007), p('2026-05', 1), p('2026-06', 41820), p('2026-07', 767871)])

    expect(r.clasificacion).toBe('evento')
    expect(r.pico).toEqual({ month: '2026-07', monto: 767871 })
  })

  it('marca cambio de nivel cuando el pico no llega a 3 veces la mediana', () => {
    // El caso real: Casa, pico 1.9x — sube sostenido, no es un evento
    const r = clasificarSerie([p('2026-04', 553951), p('2026-05', 527309), p('2026-06', 585378), p('2026-07', 1037320)])

    expect(r.clasificacion).toBe('nivel')
    expect(r.pico).toBeNull()
  })

  it('NO se degrada con la ventana: el mismo pico relativo clasifica igual con 4 y con 12 meses', () => {
    // Un pico de 5x lo típico. Con la regla vieja («más de la mitad del total»)
    // esto daba evento con 4 meses y NO con 12 — el defecto que motivó el cambio.
    const conCuatro = clasificarSerie([p('2026-05', 10), p('2026-06', 10), p('2026-07', 10), p('2026-08', 50)])
    const conDoce = clasificarSerie([
      ...Array.from({ length: 11 }, (_, i) => p(`2026-${String(i + 1).padStart(2, '0')}`, 10)),
      p('2026-12', 50),
    ])

    expect(conCuatro.clasificacion).toBe('evento')
    expect(conDoce.clasificacion).toBe('evento')
  })

  it('si la mediana de los otros meses es 0, compara contra el promedio de los que sí tienen', () => {
    const r = clasificarSerie([p('2026-05', 0), p('2026-06', 0), p('2026-07', 100), p('2026-08', 1000)])

    expect(r.clasificacion).toBe('evento') // 1000 vs promedio 100 de los activos
  })

  it('no clasifica con menos de 3 meses cerrados', () => {
    const r = clasificarSerie([p('2026-07', 10), p('2026-08', 5000)])
    expect(r.clasificacion).toBe('nivel')
  })

  it('ignora el mes en curso: un mes parcial no puede decidir si algo fue un evento', () => {
    const r = clasificarSerie([
      p('2026-05', 10), p('2026-06', 10), p('2026-07', 10), p('2026-08', 5000, true),
    ])

    expect(r.clasificacion).toBe('nivel')
  })

  it('el límite es estricto: exactamente 3 veces la mediana NO alcanza para ser evento', () => {
    const r = clasificarSerie([p('2026-05', 100), p('2026-06', 100), p('2026-07', 100), p('2026-08', 300)])

    expect(r.clasificacion).toBe('nivel')
  })
})
