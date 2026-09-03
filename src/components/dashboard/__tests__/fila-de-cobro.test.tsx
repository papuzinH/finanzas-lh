import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FilaDeCobro } from '../fila-de-cobro'

describe('FilaDeCobro', () => {
  it('muestra la descripcion y el monto que le pasan', () => {
    const html = renderToStaticMarkup(
      <FilaDeCobro
        fecha="2026-08-29"
        descripcion="Sueldo"
        monto="$ 1.850.000,00"
        value="2026-08-01"
        onChange={() => {}}
      />,
    )
    expect(html).toContain('Sueldo')
    expect(html).toContain('$ 1.850.000,00')
  })

  it('ofrece los dos meses con su nombre', () => {
    const html = renderToStaticMarkup(
      <FilaDeCobro
        fecha="2026-08-29"
        descripcion="Sueldo"
        monto="$ 100,00"
        value="2026-08-01"
        onChange={() => {}}
      />,
    )
    expect(html).toContain('Agosto')
    expect(html).toContain('Septiembre')
  })

  it('los chips cumplen el minimo de 44px (min-h-11, via Chip)', () => {
    const html = renderToStaticMarkup(
      <FilaDeCobro
        fecha="2026-08-29"
        descripcion="Sueldo"
        monto="$ 100,00"
        value="2026-08-01"
        onChange={() => {}}
      />,
    )
    expect(html).toContain('min-h-11')
  })

  it('marca como activo el chip que coincide con value, y solo ese', () => {
    const html = renderToStaticMarkup(
      <FilaDeCobro
        fecha="2026-08-29"
        descripcion="Sueldo"
        monto="$ 100,00"
        value="2026-09-01"
        onChange={() => {}}
      />,
    )
    const botones = [...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)</g)].map(
      ([, pressed, texto]) => ({ pressed, texto }),
    )
    expect(botones).toEqual([
      { pressed: 'false', texto: 'Agosto' },
      { pressed: 'true', texto: 'Septiembre' },
    ])
  })

  it('con value en Agosto, es el chip de Agosto el que queda activo', () => {
    const html = renderToStaticMarkup(
      <FilaDeCobro
        fecha="2026-08-29"
        descripcion="Sueldo"
        monto="$ 100,00"
        value="2026-08-01"
        onChange={() => {}}
      />,
    )
    const activo = html.match(/aria-pressed="true"[^>]*>([^<]*)</)
    expect(activo?.[1]).toBe('Agosto')
  })
})
