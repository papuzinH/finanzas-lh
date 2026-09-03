/**
 * Los dos diálogos de movimiento tienen que DERIVAR el mes del cobro con la misma
 * condición con la que muestran el selector, y hacerlo sobre lo que efectivamente
 * mandan (`data.payment_method_id`), no sobre el `watch`, que es estado de render.
 *
 * Hasta este fix el submit miraba sólo `data.type === 'income'`: con la preferencia
 * en "cuenta al mes que arranca", un reintegro en tarjeta fechado el 29 se guardaba
 * con `income_period` de septiembre sin que el control hubiera aparecido nunca en
 * pantalla.
 *
 * Es un test estructural (lee el fuente) porque la suite corre en `environment: node`
 * y sin DOM no hay forma de disparar un submit de react-hook-form. Lo que el submit
 * DECIDE se prueba de verdad, con datos, sobre la función pura:
 * lib/finance/__tests__/imputacion-ingresos.test.ts → `imputacionAlGuardar`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const DIALOGOS = ['create-transaction-dialog.tsx', 'edit-transaction-dialog.tsx'] as const

function fuente(archivo: string): string {
  return readFileSync(path.resolve(__dirname, '..', archivo), 'utf-8')
}

describe.each(DIALOGOS)('%s', (archivo) => {
  const src = fuente(archivo)

  it('el submit decide con el medio que se está guardando, no con el del render', () => {
    expect(src).toContain('medioEsCredito: medioEsCreditoDe(data.payment_method_id)')
  })

  it('toda la derivación pasa por imputacionAlGuardar', () => {
    // `resolverImputacion` suelto era el segundo camino, el que no miraba el medio.
    expect(src).not.toContain('resolverImputacion')
    expect(src.match(/imputacionAlGuardar\(/g)?.length).toBe(2)
  })

  it('el selector se muestra exactamente cuando hay un mes para guardar', () => {
    expect(src).toContain('{mesDelCobro !== null && (')
  })
})
