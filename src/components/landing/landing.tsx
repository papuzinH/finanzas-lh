import { Hero } from './hero'
import { BloquesValor } from './bloques-valor'

/**
 * La landing de michanchito.net — lo que ve quien llega sin sesión.
 * Estructura B del spec: teléfono protagonista. Cada sección es un
 * componente propio; este archivo solo las ordena.
 */
export function Landing() {
  return (
    <main className="paper-grain min-h-screen overflow-x-clip bg-bg text-text">
      <Hero />
      <BloquesValor />
      {/* Las secciones restantes se suman acá a medida que existen (tasks 4-5). */}
    </main>
  )
}
