/**
 * Cómo la app instalada le avisa al server que es ella.
 *
 * `/` sirve dos mundos —la landing al anónimo, el dashboard al logueado— y el
 * server no puede distinguir un arranque de la PWA de una visita en una
 * pestaña: `display-mode: standalone` sólo existe en el navegador. Entonces la
 * app se anuncia sola, con un parámetro en su `start_url`. A quien llega por
 * ahí no se le muestra la landing: ya la instaló, ofrecerle «usar en el
 * navegador» es ruido.
 *
 * Las dos puntas del contrato salen de acá —el manifest y el middleware— para
 * que nadie cambie el parámetro en un lado y deje el otro adivinando.
 */

export const PARAM_ARRANQUE = 'modo'
export const VALOR_APP_INSTALADA = 'app'

/** El `start_url` del manifest de la PWA. */
export const START_URL_APP = `/?${PARAM_ARRANQUE}=${VALOR_APP_INSTALADA}`

/**
 * ¿Esta request es el arranque de la app instalada?
 *
 * Sólo la raíz: es la única ruta que sirve la landing, y por lo tanto la única
 * donde el dato cambia algo. En cualquier otra el parámetro se ignora.
 */
export function esArranqueDeAppInstalada(pathname: string, modo: string | null): boolean {
  return pathname === '/' && modo === VALOR_APP_INSTALADA
}
