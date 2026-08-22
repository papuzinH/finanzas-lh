/**
 * Decisiones de instalación de la PWA, sin navegador de por medio.
 *
 * Las tres señales llegan de afuera (el hook las junta del navegador) y acá se
 * resuelven a una sola respuesta. Separado a propósito: el repo testea en
 * `environment: 'node'` y sin esta frontera esta lógica sería inverificable.
 */

/** Qué ofrecerle al usuario: nada, el botón nativo, o el paso a paso de iOS. */
export type VistaInstalacion = 'oculto' | 'boton' | 'ios'

export type SenalesInstalacion = {
  /** El navegador nos dejó guardar su `beforeinstallprompt`. */
  tienePrompt: boolean
  /** Safari/iOS: no existe el evento, la instalación es a mano. */
  esIOS: boolean
  /** Corriendo dentro de la app ya instalada. */
  yaInstalada: boolean
}

export function decidirVista({ tienePrompt, esIOS, yaInstalada }: SenalesInstalacion): VistaInstalacion {
  // Adentro de la app instalada, ofrecer instalarla es ruido.
  if (yaInstalada) return 'oculto'
  if (tienePrompt) return 'boton'
  if (esIOS) return 'ios'
  // Navegador sin soporte (Firefox de escritorio, por ejemplo): mejor callarse
  // que prometer un botón que no va a hacer nada.
  return 'oculto'
}

export type DatosPlataforma = {
  userAgent: string
  /** `navigator.maxTouchPoints`: 0 en una Mac, 5 en un iPad. */
  maxTouchPoints: number
}

export function esIOS({ userAgent, maxTouchPoints }: DatosPlataforma): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true
  // Desde iPadOS 13 Safari manda el user agent de una Mac de escritorio, así
  // que el texto no alcanza: lo que separa un iPad de una Mac es el táctil.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}
