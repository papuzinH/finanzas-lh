/**
 * La landing referencia capturas por path: si falta el archivo, la sección
 * renderiza un teléfono vacío y ningún test de markup lo ve. Y el peso tiene
 * presupuesto (spec: <150KB) porque estas imágenes cargan en la primera
 * visita de cualquiera que llegue al dominio.
 */
import { describe, it, expect } from 'vitest'
import { statSync } from 'node:fs'

const CAPTURAS = ['captura-home.png', 'captura-compromisos.png', 'captura-inversiones.png']

describe('las capturas de la landing', () => {
  for (const nombre of CAPTURAS) {
    it(`${nombre} existe y pesa menos de 150KB`, () => {
      const peso = statSync(`public/landing/${nombre}`).size
      expect(peso).toBeGreaterThan(0)
      expect(peso).toBeLessThan(150 * 1024)
    })
  }
})
