'use server'

import { createClient } from '@/utils/supabase/server'

/**
 * Deja registrado que el usuario ya leyó el changelog de esta versión.
 *
 * No devuelve nada y no propaga el error a propósito: si la escritura falla, el
 * popup vuelve a aparecer en la próxima carga. Molesta un poco y no pierde
 * nada, que es el trade-off correcto — mostrarle un error a alguien que no
 * tiene forma de resolverlo sería ruido.
 *
 * Spec: docs/superpowers/specs/2026-09-01-popup-novedades-design.md
 */
export async function marcarNovedadVista(version: string): Promise<void> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  // `.eq('id', user.id)` es el patrón de dueño del repo: RLS es el backstop,
  // no la única capa (auditoría L3).
  await supabase.from('users').update({ last_seen_version: version }).eq('id', user.id)
}
