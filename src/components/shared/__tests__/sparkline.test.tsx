import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Sparkline } from '../sparkline'

describe('Sparkline', () => {
  it('dibuja una barra por valor', () => {
    const out = renderToStaticMarkup(<Sparkline valores={[10, 20, 30]} />)
    expect(out.match(/data-barra/g)).toHaveLength(3)
  })

  it('escala las alturas contra el valor máximo', () => {
    const out = renderToStaticMarkup(<Sparkline valores={[50, 100]} />)
    expect(out).toContain('height:50%')
    expect(out).toContain('height:100%')
  })

  it('marca la última barra cuando el mes está en curso', () => {
    const out = renderToStaticMarkup(<Sparkline valores={[10, 20]} ultimoParcial />)
    expect(out).toContain('data-parcial="true"')
  })

  it('no rompe con una serie vacía ni con todos los valores en cero', () => {
    expect(() => renderToStaticMarkup(<Sparkline valores={[]} />)).not.toThrow()
    expect(() => renderToStaticMarkup(<Sparkline valores={[0, 0]} />)).not.toThrow()
  })
})
