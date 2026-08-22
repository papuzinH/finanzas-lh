/**
 * Captura del `beforeinstallprompt` de Chrome.
 *
 * Vive fuera de React a propósito: el evento llega apenas carga la página y
 * puede adelantarse a la hidratación, así que un listener montado en un
 * `useEffect` se lo pierde y el botón no aparece nunca. El registro se hace al
 * cargar el módulo; el hook sólo se suscribe a lo que ya está guardado.
 */

/** El evento no estándar de Chrome: un `Event` con su propio `prompt()`. */
export type PromptInstalacion = Event & {
  prompt: () => Promise<void>
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type RegistroDePrompt = {
  hayPrompt: () => boolean
  /** Devuelve la función de baja. */
  suscribir: (avisar: () => void) => () => void
  instalar: () => Promise<void>
}

export function crearRegistroDePrompt(target: EventTarget): RegistroDePrompt {
  let guardado: PromptInstalacion | null = null
  const suscriptores = new Set<() => void>()
  const avisarATodos = () => {
    for (const avisar of suscriptores) avisar()
  }

  target.addEventListener('beforeinstallprompt', (evento) => {
    // Sin esto Chrome muestra su propia barrita de instalación, que compite con
    // la invitación de la app y no respeta nada de la identidad.
    evento.preventDefault()
    guardado = evento as PromptInstalacion
    avisarATodos()
  })

  target.addEventListener('appinstalled', () => {
    guardado = null
    avisarATodos()
  })

  return {
    hayPrompt: () => guardado !== null,
    suscribir: (avisar) => {
      suscriptores.add(avisar)
      return () => {
        suscriptores.delete(avisar)
      }
    },
    instalar: async () => {
      const prompt = guardado
      if (!prompt) return
      // El navegador no deja reusar el mismo evento: apenas se abre el diálogo,
      // ese prompt queda quemado gane o pierda.
      guardado = null
      avisarATodos()
      await prompt.prompt()
    },
  }
}
