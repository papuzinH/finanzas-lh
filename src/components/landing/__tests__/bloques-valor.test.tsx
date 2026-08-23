import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// `next/image` reescribe el `src` a través de `/_next/image?url=...` incluso
// en SSR puro (sin el contexto de una request de Next real): fuera de eso,
// las medidas por defecto igual arman la URL. Acá sólo importa que el `src`
// llegue intacto al DOM, así que se sustituye por un `<img>` liso.
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { priority: _priority, ...resto } = props
    void _priority
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...resto} />
  },
}))

import { BloquesValor } from '../bloques-valor'

const html = () => renderToStaticMarkup(<BloquesValor />)

describe('BloquesValor', () => {
  it('cuenta las tres promesas, en orden', () => {
    const out = html()
    const posiciones = [
      'Un número que dice la verdad',
      'Las cuotas se anotan solas',
      'Pesos y verdes, sin mezclar',
    ].map((t) => out.indexOf(t))
    expect(posiciones.every((p) => p >= 0)).toBe(true)
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones)
  })
  it('cada bloque tiene su captura', () => {
    const out = html()
    for (const c of ['captura-home', 'captura-compromisos', 'captura-inversiones']) {
      expect(out).toContain(c)
    }
  })
})
