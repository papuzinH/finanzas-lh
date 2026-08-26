import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PoliticaPrivacidad } from '../politica-privacidad'

const out = renderToStaticMarkup(<PoliticaPrivacidad />)

describe('PoliticaPrivacidad', () => {
  it('recorre las secciones en orden', () => {
    const titulos = [
      'Quién es responsable',
      'Qué datos guardamos',
      'Para qué los usamos',
      'Con quién se comparten',
      'Cookies y almacenamiento local',
      'Cuánto tiempo y cómo los borrás',
      'Tus derechos',
      'Condiciones de uso',
      'Cambios',
    ]
    const pos = titulos.map((t) => out.indexOf(t))
    const faltan = titulos.filter((_, i) => pos[i] < 0)
    expect(faltan, `faltan secciones: ${faltan.join(', ')}`).toEqual([])
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
  })

  it('dice quién responde y a dónde escribir', () => {
    expect(out).toContain('LH Studio')
    expect(out).toContain('mailto:lhstudio.dev@gmail.com')
  })

  it('nombra a cada tercero que toca los datos — verificado contra el código, no genérico', () => {
    for (const t of ['Supabase', 'Vercel', 'Google', 'Gemini', 'RackNerd']) expect(out).toContain(t)
  })

  it('promete lo que la app hace: sin publicidad, sin venta, sin analytics', () => {
    for (const t of ['publicidad', 'vend', 'analytics']) expect(out.toLowerCase()).toContain(t)
  })

  it('cuenta el camino al borrado y cómo funcionan las copias de respaldo', () => {
    expect(out).toContain('Borrar la cuenta')
    // Desde 2026-08-26 hay backup diario en el VPS (infra/vps/): la política
    // tiene que contarlo, con la retención que ata el borrado a las copias.
    expect(out.toLowerCase()).toContain('copia de respaldo automática por día')
    expect(out).toContain('14 días')
  })

  it('cita la ley argentina y a la AAIP', () => {
    expect(out).toContain('25.326')
    expect(out).toContain('AAIP')
  })

  it('lleva fecha de última actualización y vuelta a la landing', () => {
    expect(out).toContain('Última actualización')
    expect(out).toMatch(/href="\/"/)
  })

  it('respeta los tokens: ni hex ni escalas Tailwind', () => {
    const clases = (out.match(/class="[^"]*"/g) ?? []).join(' ')
    expect(clases).not.toMatch(/\b(?:bg|text|border)-(?:slate|gray|zinc|emerald|red|blue|amber|stone)-\d{2,3}\b/)
    expect(out).not.toMatch(/#[0-9a-fA-F]{6}\b/)
  })
})
