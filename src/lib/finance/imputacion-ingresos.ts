import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseLocalDate } from '@/lib/utils/dates'

/**
 * A que mes cuenta un cobro.
 *
 * Quien cobra el 29 de agosto POR septiembre y quien cobra el 29 de agosto por
 * agosto trabajado anotan exactamente el mismo movimiento: la app no puede
 * distinguirlos sin preguntar. Por eso aca no hay ninguna regla que impute sola
 * -- solo se decide CUANDO la pregunta tiene sentido, y cual de las dos opciones
 * viene pre-elegida.
 */

/**
 * Ancho de la ventana ambigua, en dias, contados desde el final del mes.
 *
 * Medido contra produccion el 2026-09-03: de 33 ingresos, los 8 de fin de mes caen
 * entre el dia 25 y el 29, y el ingreso no ambiguo mas cercano por debajo esta el
 * dia 23 (no hay ninguno el 30 ni el 31). Siete dias cubren los 8 casos reales en
 * cualquier longitud de mes sin tocar a los otros 25.
 */
export const DIAS_DE_BORDE = 7

export type OpcionDeMes = { valor: string; label: string }

/** true si la fecha cae en los ultimos DIAS_DE_BORDE dias de su mes. */
export function necesitaDeclararMes(fecha: string): boolean {
  const d = parseLocalDate(fecha)
  return d.getDate() > endOfMonth(d).getDate() - DIAS_DE_BORDE
}

/** El mes de la fecha y el siguiente, en ese orden. Siempre dos. */
export function mesesCandidatos(fecha: string): OpcionDeMes[] {
  const primero = startOfMonth(parseLocalDate(fecha))
  return [primero, addMonths(primero, 1)].map((m) => {
    const nombre = format(m, 'LLLL', { locale: es })
    return {
      valor: format(m, 'yyyy-MM-dd'),
      label: nombre.charAt(0).toUpperCase() + nombre.slice(1),
    }
  })
}

/**
 * Que opcion viene marcada. La preferencia SOLO pre-elige: nada se imputa sin que
 * el usuario guarde el formulario con el selector a la vista.
 */
export function mesPorDefecto(fecha: string, prefiereMesSiguiente: boolean | null): string {
  const [esteMes, mesSiguiente] = mesesCandidatos(fecha)
  return prefiereMesSiguiente === true ? mesSiguiente.valor : esteMes.valor
}

/**
 * El income_period que corresponde a esta fecha. `null` = la pregunta no aplica
 * (fuera del borde, o fecha vacia/invalida).
 *
 * SE DERIVA, no se retiene: un `elegido` que quedo de una fecha anterior (el
 * usuario cargo 29-ago → septiembre, y despues movio la fecha a 15-ago o a
 * 28-jul) deja de ser valido en cuanto no esta entre los candidatos de la
 * fecha ACTUAL -y ahi se descarta, cae al default- igual que si nunca se
 * hubiese elegido nada. Es la misma regla en las dos direcciones: completar
 * cuando falta Y descartar cuando sobra, para que lo que se persiste sea
 * siempre lo que el usuario tenia a la vista al guardar.
 */
export function resolverImputacion(
  fecha: string,
  elegido: string | null | undefined,
  prefiereMesSiguiente: boolean | null,
): string | null {
  if (!fecha || !necesitaDeclararMes(fecha)) return null
  const candidatos = mesesCandidatos(fecha).map((o) => o.valor)
  return elegido && candidatos.includes(elegido) ? elegido : mesPorDefecto(fecha, prefiereMesSiguiente)
}

/**
 * El mes que corresponde persistir en un formulario de movimiento: `null` cuando la
 * pregunta no aplica.
 *
 * UNA sola condicion para mostrar el selector y para guardar. Cuando eran dos, el
 * submit miraba solo `type === 'income'` y el selector ademas `!medioEsCredito`: un
 * reintegro en tarjeta fechado el 29 se guardaba con el mes que arrastraba la
 * preferencia SIN que el control hubiera aparecido nunca en pantalla. Y no es
 * inocuo: el ciclo le gana a `income_period` en prepare.ts, pero una tarjeta sin
 * `default_closing_day`/`default_payment_day` no tiene ciclo que gane (caso
 * soportado a proposito, ver lib/ciclos/resolver.ts), asi que ahi manda
 * `income_period` y el cobro se muda de mes solo -- justo lo que esta feature
 * existe para no hacer.
 */
export function imputacionAlGuardar(args: {
  esIngreso: boolean
  medioEsCredito: boolean
  fecha: string
  elegido: string | null | undefined
  prefiereMesSiguiente: boolean | null
}): string | null {
  if (!args.esIngreso || args.medioEsCredito) return null
  return resolverImputacion(args.fecha, args.elegido, args.prefiereMesSiguiente)
}
