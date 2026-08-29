import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Categoría a la que van los movimientos que se quedaron sin categoría propia.
 *
 * `categories.category_id` es NOT NULL en `transactions`, `installment_plans` y
 * `recurring_plans`, así que "sin categoría" no puede representarse con `null`:
 * el insert falla con 23502. El repo ya usaba este patrón para «Pagos de
 * tarjeta» (`compromisos/actions.ts`) por exactamente la misma razón.
 */
export const CATEGORIA_DESCARTE = 'Sin categoría'

/**
 * Devuelve el id de la categoría de descarte del usuario para ese tipo,
 * creándola si hace falta. `null` sólo si la creación falla — el llamador
 * decide si aborta o sigue.
 *
 * Hay una por tipo a propósito: una transacción `income` con una categoría
 * `expense` es la combinación inconsistente que el chat quiere evitar.
 */
export async function getOrCreateCategoriaDescarte(
  supabase: SupabaseClient<Database>,
  userId: string,
  type: 'income' | 'expense',
): Promise<string | null> {
  const { data: existentes } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', CATEGORIA_DESCARTE)
    .eq('type', type)
    .limit(1)

  if (existentes && existentes.length > 0) return existentes[0].id

  const { data: creada } = await supabase
    .from('categories')
    .insert({
      user_id: userId,
      name: CATEGORIA_DESCARTE,
      emoji: '🏷️',
      is_system: true,
      type,
    })
    .select('id')
    .single()

  return creada?.id ?? null
}
