import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RhythmSlide } from '../slides/rhythm-slide'

describe('RhythmSlide', () => {
  it('ofrece elegir a que mes cuenta un cobro de fin de mes', () => {
    const html = renderToStaticMarkup(<RhythmSlide onComplete={() => {}} />)
    // El default del slide es 'monthly', asi que la pregunta esta visible de entrada
    expect(html).toContain('Al mes que arranca')
  })

  it('sigue permitiendo saltear el paso entero', () => {
    const html = renderToStaticMarkup(<RhythmSlide onComplete={() => {}} />)
    expect(html).toContain('Ahora no, lo configuro después')
  })
})
