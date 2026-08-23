import { Hero } from './hero'

/**
 * La landing de michanchito.net — lo que ve quien llega sin sesión.
 * Estructura B del spec: teléfono protagonista. Cada sección es un
 * componente propio; este archivo solo las ordena.
 */
export function Landing() {
  return (
    <main className="paper-grain min-h-screen overflow-x-clip bg-bg text-text">
      <Hero />
      {/* Las secciones restantes se suman acá a medida que existen (tasks 3-5). */}
    </main>
  )
}
