import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HechaAca } from '../hecha-aca'
import { CtaFinal } from '../cta-final'
import { Pie } from '../pie'
import { Landing } from '../landing'

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => <img src={src} alt={alt} {...props} />,
}))

describe('HechaAca', () => {
  it('nombra lo argentino concreto, no genérico', () => {
    const out = renderToStaticMarkup(<HechaAca />)
    for (const t of ['cuotas', 'blue', 'fin de mes']) expect(out.toLowerCase()).toContain(t)
  })
})

describe('CtaFinal', () => {
  it('lleva el chancho y la línea de confianza', () => {
    const out = renderToStaticMarkup(<CtaFinal />)
    expect(out).toContain('Tenelo a mano')
    expect(out).toContain('Tus datos quedan tuyos')
    expect(out).toContain('<svg') // el Chancho es SVG inline
  })
})

describe('Pie', () => {
  it('firma y fuentes, discreto', () => {
    const out = renderToStaticMarkup(<Pie />)
    expect(out).toContain('LH Studio')
    expect(out).toContain('github.com')
  })
})

describe('Landing completa', () => {
  it('ordena las seis secciones', () => {
    const out = renderToStaticMarkup(<Landing />)
    const orden = ['Tus gastos, en orden', 'Un número que dice la verdad', 'Anotalo como lo dirías', 'Una app de plata que entiende este país', 'Tenelo a mano', 'LH Studio']
      .map((t) => out.indexOf(t))
    expect(orden.every((p) => p >= 0)).toBe(true)
    expect([...orden].sort((a, b) => a - b)).toEqual(orden)
  })
  it('todo el markup respeta los tokens: ni hex ni escalas Tailwind', () => {
    const out = renderToStaticMarkup(<Landing />)
    const clases = (out.match(/class="[^"]*"/g) ?? []).join(' ')
    expect(clases).not.toMatch(/\b(?:bg|text|border)-(?:slate|gray|zinc|emerald|red|blue|amber|stone)-\d{2,3}\b/)
  })
})
