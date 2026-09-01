import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'

import { ContenidoNovedades } from '../novedades-modal'
import type { Version } from '@/lib/novedades/versiones'

const VERSION: Version = {
  version: '1.2.0',
  fecha: '2026-09-20',
  titulo: 'Las tarjetas cuentan bien los dólares',
  items: [
    'El disponible ya no ignora las compras en dólares.',
    'Si vence un resumen y no lo marcaste, te avisamos.',
  ],
}

describe('ContenidoNovedades', () => {
  const out = renderToStaticMarkup(<ContenidoNovedades version={VERSION} onCerrar={() => {}} />)

  it('muestra el título y todos los items', () => {
    expect(out).toContain('Las tarjetas cuentan bien los dólares')
    expect(out).toContain('El disponible ya no ignora las compras en dólares.')
    expect(out).toContain('Si vence un resumen y no lo marcaste, te avisamos.')
  })

  it('ofrece una sola salida', () => {
    // Es un changelog, no una decisión: sin "después", sin "no mostrar más".
    expect(out).toContain('Listo')
    expect(out).not.toMatch(/Después|No mostrar|Recordar/i)
  })

  it('no le muestra el número de versión al usuario', () => {
    // '1.2.0' es una llave interna para el flag. A alguien que entró a ver
    // cuánta plata le queda no le dice nada.
    expect(out).not.toContain('1.2.0')
  })

  it('respeta los tokens y el borde de 1.5px del sistema', () => {
    const clases = (out.match(/class="[^"]*"/g) ?? []).join(' ')
    expect(clases).not.toMatch(/\b(?:bg|text|border)-(?:slate|gray|zinc|emerald|rose|red|blue|amber|stone|indigo|violet)-\d{2,3}\b/)
    expect(clases).toContain('border-[1.5px]')
  })
})

describe('dónde vive el popup', () => {
  const shell = readFileSync('src/components/layout/app-shell.tsx', 'utf8')

  it('lo monta el AppShell, que es lo que le da gratis las exclusiones', () => {
    // El shell devuelve `children` pelado en las rutas públicas, /login, /auth,
    // /onboarding, /puesta-a-punto y la landing anónima, y no pasa de
    // `isInitialized`. Montarlo en el home en vez de acá obligaría a reescribir
    // todas esas condiciones — y a olvidarse de alguna.
    expect(shell).toContain('NovedadesModal')
    expect(shell).toMatch(/<NovedadesModal\s*\/>/)
  })
})
