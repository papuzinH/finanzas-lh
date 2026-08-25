import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import PrivacidadPage, { metadata } from '../page'

describe('/privacidad', () => {
  it('es Server Component estático con metadata propia', () => {
    const src = readFileSync('src/app/privacidad/page.tsx', 'utf8')
    expect(src).not.toMatch(/^'use client'/)
    expect(String(metadata.title)).toContain('Privacidad')
    expect(metadata.description).toBeTruthy()
  })

  it('renderiza la política completa', () => {
    const out = renderToStaticMarkup(<PrivacidadPage />)
    expect(out).toContain('Qué datos guardamos')
    expect(out).toContain('Condiciones de uso')
  })
})
