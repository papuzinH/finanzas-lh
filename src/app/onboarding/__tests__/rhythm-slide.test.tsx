import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RhythmSlide } from '../slides/rhythm-slide'

describe('RhythmSlide', () => {
  it('monta la pregunta de cobro de fin de mes cuando el ritmo es mensual (default)', () => {
    const html = renderToStaticMarkup(<RhythmSlide onComplete={() => {}} />)
    // El default del slide es 'monthly', asi que PreferenciaCobroFinDeMes esta montado de entrada
    expect(html).toContain('A que mes cuenta un cobro de fin de mes')
    expect(html).toContain('Al mes que arranca')
  })
})
