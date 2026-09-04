import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard estructural: un componente NO puede sembrar `useState` con un CAMPO del
 * store.
 *
 * `useState(x)` sólo mira `x` en el primer render. Los campos del store arrancan en
 * su valor por defecto y se llenan recién cuando `fetchAllData()` vuelve, así que
 * con un reload duro el componente se queda para siempre con el default: el control
 * se dibuja sin marcar aunque el usuario tenga la preferencia guardada.
 *
 * Ya tuvo dos víctimas en dos líneas seguidas de `/ajustes` (`incomeRhythm` desde
 * antes, `incomeCountsNextMonth` sumada el 2026-09-03), y no se ve en los tests de
 * markup: bajo `renderToStaticMarkup` zustand sirve `getServerSnapshot`, o sea el
 * estado inicial, que es justo lo que el bug muestra.
 *
 * El patrón correcto es DERIVAR: estado local sólo para "lo que el usuario tocó en
 * esta pantalla", y el campo del store como base cuando no tocó nada.
 */

function archivosTsx(dir: string): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) {
      if (entrada === '__tests__' || entrada === 'node_modules') continue
      salida.push(...archivosTsx(ruta))
    } else if (entrada.endsWith('.tsx')) {
      salida.push(ruta)
    }
  }
  return salida
}

/**
 * Saca comentarios antes de analizar: un comentario que EXPLICA el patrón prohibido
 * (los hay, justo en la pantalla que lo tuvo) no es una infracción.
 */
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Nombres desestructurados de `useFinanceStore()` en ese archivo. */
function camposDelStore(codigo: string): string[] {
  const nombres: string[] = []
  const re = /const\s*\{([^}]*)\}\s*=\s*useFinanceStore\(\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(codigo))) {
    for (const parte of m[1].split(',')) {
      const nombre = parte.split(':').pop()!.trim()
      // Los getters devuelven estado fresco (su cuerpo llama get()): sembrar
      // useState con el RESULTADO de un getter es otra cosa y no la mira este guard.
      if (nombre && !nombre.startsWith('get')) nombres.push(nombre)
    }
  }
  return nombres
}

describe('useState sembrado con estado del store', () => {
  it('ningun componente arranca su estado local con un campo del store', () => {
    const infractores: string[] = []

    for (const ruta of archivosTsx('src')) {
      const codigo = sinComentarios(readFileSync(ruta, 'utf-8'))
      const campos = camposDelStore(codigo)
      if (campos.length === 0) continue

      for (const campo of campos) {
        // useState(campo) o useState<Tipo>(campo)
        const usa = new RegExp(`useState(?:<[^>]*>)?\\(\\s*${campo}\\s*\\)`)
        if (usa.test(codigo)) {
          infractores.push(`${ruta.replace(/\\/g, '/')} → useState(${campo})`)
        }
      }
    }

    expect(infractores).toEqual([])
  })
})
