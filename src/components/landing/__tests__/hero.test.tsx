/**
 * El hero es la promesa de la página: el claim, los dos caminos (instalar /
 * navegador) y el teléfono con el número. Sin DOM no se prueba la animación
 * (eso es navegador), pero sí lo que decide el markup.
 */
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

import { Hero } from '../hero'
import { PhoneFrame } from '../phone-frame'
import { DISPONIBLE_DEMO } from '../constantes'

const html = () => renderToStaticMarkup(<Hero />)

describe('Hero', () => {
  it('abre con el claim en la voz de la marca', () => {
    expect(html()).toContain('Tus gastos, en orden')
  })
  it('ofrece los dos caminos: entrar por el navegador siempre; instalar según el navegador', () => {
    const out = html()
    expect(out).toContain('href="/login"')
    expect(out).toContain('Usar en el navegador')
    // El botón de instalar arranca oculto en SSR (useInstallApp decide en cliente).
  })
  it('el teléfono muestra la captura del home del demo', () => {
    expect(html()).toContain('captura-home')
  })
  it('el contador cubre la zona del número con superficie propia', () => {
    // El overlay tapa el número quemado en la captura; si desaparece, se ven dos números.
    expect(html()).toContain('data-overlay-disponible')
  })
  it('el número demo está acoplado a la captura', () => {
    expect(DISPONIBLE_DEMO).toBe(1581702)
  })
})

describe('PhoneFrame', () => {
  it('recorta la captura con el marco y no deja overflow', () => {
    const out = renderToStaticMarkup(
      <PhoneFrame captura="/landing/captura-home.png" alt="El home de Chanchito" />,
    )
    expect(out).toContain('overflow-hidden')
    expect(out).toContain('/landing/captura-home.png')
  })
})
