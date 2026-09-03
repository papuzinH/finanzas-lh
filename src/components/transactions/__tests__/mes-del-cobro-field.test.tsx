import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MesDelCobroField } from '../mes-del-cobro-field'

describe('MesDelCobroField', () => {
  it('no se muestra si la fecha no esta en el borde del mes', () => {
    const html = renderToStaticMarkup(
      <MesDelCobroField fecha="2026-08-15" value={null} onChange={() => {}} />,
    )
    expect(html).toBe('')
  })

  it('ofrece los dos meses con su nombre cuando la fecha esta en el borde', () => {
    const html = renderToStaticMarkup(
      <MesDelCobroField fecha="2026-08-29" value="2026-08-01" onChange={() => {}} />,
    )
    expect(html).toContain('Agosto')
    expect(html).toContain('Septiembre')
  })

  it('los botones cumplen el minimo de 44px', () => {
    // El min-h-11 lo aporta <Chip>, que ya lo trae en su propio className: NO se le
    // pasa desde acá. Chip no acepta prop `className` -- intentar pasársela es un
    // error de TypeScript. El test igual vale: fija que estos controles se dibujen
    // con Chip y no con un <button> pelado, que es como se cuela un target de 40px
    // (el defecto del popup de novedades, 2026-09-01).
    const html = renderToStaticMarkup(
      <MesDelCobroField fecha="2026-08-29" value="2026-08-01" onChange={() => {}} />,
    )
    expect(html).toContain('min-h-11')
  })

  it('marca como activo el chip que coincide con value, y solo ese', () => {
    const html = renderToStaticMarkup(
      <MesDelCobroField fecha="2026-08-29" value="2026-09-01" onChange={() => {}} />,
    )
    const botones = [...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)</g)].map(
      ([, pressed, texto]) => ({ pressed, texto }),
    )
    expect(botones).toEqual([
      { pressed: 'false', texto: 'Agosto' },
      { pressed: 'true', texto: 'Septiembre' },
    ])
  })
})
