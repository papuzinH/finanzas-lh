import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PreferenciaCobroFinDeMes } from '../preferencia-cobro-fin-de-mes'

describe('PreferenciaCobroFinDeMes', () => {
  it('con value null, ningun chip queda marcado activo', () => {
    const html = renderToStaticMarkup(
      <PreferenciaCobroFinDeMes value={null} onChange={() => {}} />
    )
    expect(html).not.toContain('aria-pressed="true"')
  })

  it('con value false, el chip "Al mes en que cobro" queda activo', () => {
    const html = renderToStaticMarkup(
      <PreferenciaCobroFinDeMes value={false} onChange={() => {}} />
    )
    const activeChip = html.match(/aria-pressed="true"[^>]*>([^<]*)</)
    expect(activeChip?.[1]).toBe('Al mes en que cobro')
  })

  it('con value true, el chip "Al mes que arranca" queda activo', () => {
    const html = renderToStaticMarkup(
      <PreferenciaCobroFinDeMes value={true} onChange={() => {}} />
    )
    const activeChip = html.match(/aria-pressed="true"[^>]*>([^<]*)</)
    expect(activeChip?.[1]).toBe('Al mes que arranca')
  })
})
