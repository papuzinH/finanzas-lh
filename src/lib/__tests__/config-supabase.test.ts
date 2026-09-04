import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * `supabase/config.toml` declaraba el ref de PRODUCCIÓN mientras el link real del
 * CLI (`supabase/.temp/project-ref`, gitignoreado) apunta a DEV desde el 2026-08-26.
 *
 * No rompía nada por sí solo —los `--linked` van por el link real— pero cualquiera
 * que abra el config para saber contra qué base está trabajando lee "producción", y
 * un `supabase link` sin argumentos lo toma de ahí. Es la misma trampa que el guard
 * del seeder viene a cerrar del otro lado: el default del repo es DEV, y producción
 * es siempre un paso explícito (`--db-url`).
 */

const REF_PRODUCCION = 'mkkgdjxaotgimqwhyesx'
const REF_DEV = 'hgxuxoqyrooaariimqmg'

describe('config del CLI de Supabase', () => {
  it('el project_id por defecto es DEV, no producción', () => {
    const config = readFileSync('supabase/config.toml', 'utf-8')
    const linea = config.match(/^project_id\s*=\s*"([^"]+)"/m)

    expect(linea?.[1]).toBe(REF_DEV)
    expect(linea?.[1]).not.toBe(REF_PRODUCCION)
  })
})
