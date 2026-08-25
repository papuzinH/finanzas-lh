import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/app/perfil/actions', () => ({ deleteMyAccount: vi.fn() }))

import { BorrarCuenta } from '../_components/borrar-cuenta'

describe('BorrarCuenta', () => {
  const out = renderToStaticMarkup(<BorrarCuenta />)

  it('dice qué se borra y que no hay vuelta atrás, antes de ofrecer el botón', () => {
    expect(out).toContain('Borrar la cuenta')
    expect(out).toContain('No hay vuelta atrás')
    expect(out).toContain('Borrar mi cuenta')
    expect(out.indexOf('No hay vuelta atrás')).toBeLessThan(out.indexOf('Borrar mi cuenta'))
  })

  it('linkea la política de privacidad', () => {
    expect(out).toContain('href="/privacidad"')
  })

  it('el modal de confirmación arranca cerrado', () => {
    expect(out).not.toContain('Sí, borrar todo')
  })

  it('respeta los tokens y el borde de 1.5px del sistema', () => {
    const clases = (out.match(/class="[^"]*"/g) ?? []).join(' ')
    expect(clases).not.toMatch(/\b(?:bg|text|border)-(?:slate|gray|zinc|emerald|red|blue|amber|stone)-\d{2,3}\b/)
    expect(clases).toContain('border-[1.5px]')
  })

  it('vive al final de Ajustes → Perfil', () => {
    const page = readFileSync('src/app/ajustes/perfil/page.tsx', 'utf8')
    expect(page).toContain('<BorrarCuenta />')
    expect(page.indexOf('Cerrar sesión')).toBeLessThan(page.indexOf('<BorrarCuenta />'))
  })
})
