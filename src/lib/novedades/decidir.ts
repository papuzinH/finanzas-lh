import type { Version } from './versiones'

/**
 * Qué novedad mostrarle a un usuario, o `null` si ninguna.
 *
 * Función pura: sin React, sin Supabase y sin reloj propio — la fecha de alta
 * entra por parámetro. Es el patrón de `lib/finance/`, y por la misma razón: la
 * decisión se prueba directo y el componente queda sin lógica.
 *
 * Dos condiciones, y las dos importan:
 *  - **No la vio.** `users.last_seen_version` guarda la última que cerró.
 *  - **Salió después de que él llegó.** Esto es lo que resuelve al recién
 *    registrado sin ningún flag "es nuevo" ni escribir nada en el onboarding:
 *    si la última versión es anterior a su alta, no hay nada que contarle.
 *
 * Se devuelve UNA sola versión, nunca un acumulado: ver el spec.
 */
export function novedadParaMostrar(
  versiones: Version[],
  lastSeenVersion: string | null,
  createdAt: string,
): Version | null {
  // Por fecha y no por posición: el archivo pide "la más reciente primero", pero
  // esa convención no la verifica nadie, y agregar la nueva al final es el error
  // natural. Así el orden del archivo no puede provocar que se muestre una vieja.
  const masReciente = versiones.reduce<Version | null>(
    (mejor, v) => (mejor === null || v.fecha > mejor.fecha ? v : mejor),
    null,
  )
  if (!masReciente) return null

  if (masReciente.version === lastSeenVersion) return null

  // Por día y estrictamente posterior: quien se registró el mismo día que salió
  // la versión no la ve. Ante la duda, no molestar.
  const diaDeAlta = createdAt.slice(0, 10)
  if (masReciente.fecha <= diaDeAlta) return null

  return masReciente
}
