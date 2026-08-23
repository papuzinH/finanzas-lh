/**
 * El chat de la landing es teatro: un guion fijo, cero API. Estos tests fijan
 * el guion y que el SSR ya traiga la conversación completa (el guion entra en
 * cliente por stagger de burbujas al hacer scroll, pero sin JS la sección no
 * puede quedar muda).
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChatTeatro } from '../chat-teatro'

const html = () => renderToStaticMarkup(<ChatTeatro />)

describe('ChatTeatro', () => {
  it('el guion está completo en el markup', () => {
    const out = html()
    expect(out).toContain('gasté 8 lucas en el chino')
    expect(out).toContain('Delivery de comida')
  })
  it('se presenta como lo que es: anotalo como lo dirías', () => {
    expect(html()).toContain('Anotalo como lo dirías')
  })
  it('no llama a ninguna API: es un guion', () => {
    const out = html()
    expect(out).not.toContain('/api/')
  })
})
