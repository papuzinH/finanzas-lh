import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { TOUR_STEPS_BY_ROUTE } from '@/lib/store/onboardingStore'

/**
 * Test de regresión estructural: cada target del tour de onboarding tiene que
 * existir como atributo `data-tour="..."` en algún componente de src/.
 *
 * Si un rediseño de UI elimina el atributo, el tour queda con el backdrop
 * oscuro a pantalla completa y SIN tooltip (los botones Siguiente/Saltar viven
 * en el tooltip) → pantalla bloqueada. Ya pasó con search-input,
 * compromisos-tabs y tabs-list.
 */

function collectTsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectTsxFiles(full, acc)
    else if (full.endsWith('.tsx')) acc.push(full)
  }
  return acc
}

describe('targets del tour de onboarding', () => {
  const srcDir = join(process.cwd(), 'src')
  const allSource = collectTsxFiles(srcDir)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')

  const allTargets = Object.values(TOUR_STEPS_BY_ROUTE).flatMap((steps) =>
    steps.map((s) => s.target)
  )

  it.each(allTargets)('el target "%s" existe como data-tour en src/', (target) => {
    // Acepta el atributo literal (data-tour="x") o una expresión JSX que lo
    // produzca en runtime (data-tour={cond ? 'x' : undefined}).
    const literal = allSource.includes(`data-tour="${target}"`)
    const inExpression = new RegExp(`data-tour=\\{[^}]*'${target}'[^}]*\\}`).test(allSource)
    expect(literal || inExpression, `falta data-tour="${target}" en src/ — el tour se bloquea en ese paso`).toBe(true)
  })
})
