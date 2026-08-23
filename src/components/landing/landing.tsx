import { Hero } from './hero'
import { BloquesValor } from './bloques-valor'
import { ChatTeatro } from './chat-teatro'

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
      <ChatTeatro />
      {/* Las secciones restantes se suman acá a medida que existen (task 5). */}
    </main>
  )
}
