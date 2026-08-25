import type { Metadata } from 'next'
import { PoliticaPrivacidad } from '@/components/legal/politica-privacidad'

/**
 * Pública y sin shell: la lista `RUTAS_PUBLICAS` (`lib/rutas-publicas.ts`) es
 * lo que hace que el middleware no la mande al login y que el AppShell no la
 * envuelva en nav/chat/tour. Quien llega desde el consent screen de Google no
 * tiene sesión.
 */
export const metadata: Metadata = {
  title: 'Privacidad · Chanchito',
  description:
    'Qué datos guarda Chanchito, para qué los usa, con quién los comparte y cómo los borrás. Sin vueltas.',
}

export default function PrivacidadPage() {
  return (
    <div className="paper-grain min-h-screen bg-bg text-text">
      <PoliticaPrivacidad />
    </div>
  )
}
