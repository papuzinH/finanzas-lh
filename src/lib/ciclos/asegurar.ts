//
// Get-or-create de los resumenes de una tarjeta. La DECISION de que ciclos hacen
// falta es pura y vive en lib/finance/cycles.ts; aca solo esta la escritura.
// Mismo reparto que lib/categorias/descarte.ts.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, PaymentMethod } from '@/types/database'
import { ciclosDeMetodo, generarCiclos, type CreditCardCycle } from '@/lib/finance/cycles'

/**
 * Devuelve todos los ciclos de `method`, materializando los que falten entre
 * `desde` y `hasta` (por mes, ambos inclusive).
 *
 * Generacion perezosa: se llama al cargar un movimiento, no por cron. Genera
 * tambien hacia atras, porque cargar una compra vieja en cuotas necesita los
 * resumenes de entonces.
 *
 * El upsert va con `ignoreDuplicates` sobre la unique (payment_method_id,
 * closing_date): dos requests del mismo usuario en paralelo --el chat y la
 * pantalla, por ejemplo-- pueden intentar generar el mismo mes. Bajo concurrencia,
 * `INSERT ... ON CONFLICT DO NOTHING RETURNING *` solo devuelve las filas que se
 * insertaron; las que perdieron el conflicto quedan afuera. Por eso, tras un upsert
 * exitoso, se relee la tabla para garantizar que el return refleja la verdad de la DB.
 */
export async function asegurarCiclos(
  supabase: SupabaseClient<Database>,
  method: PaymentMethod,
  desde: Date,
  hasta: Date,
): Promise<CreditCardCycle[]> {
  const { data: existentes, error } = await supabase
    .from('credit_card_cycles')
    .select('*')
    .eq('payment_method_id', method.id)
    .order('closing_date', { ascending: true })

  if (error) throw new Error(`No pude leer los resumenes de la tarjeta: ${error.message}`)

  const actuales = (existentes ?? []) as CreditCardCycle[]
  const faltantes = generarCiclos(method, desde, hasta, actuales)
  if (faltantes.length === 0) return ciclosDeMetodo(method.id, actuales)

  const { error: insertError } = await supabase
    .from('credit_card_cycles')
    .upsert(faltantes, { onConflict: 'payment_method_id,closing_date', ignoreDuplicates: true })
    .select('*')

  if (insertError) throw new Error(`No pude crear los resumenes de la tarjeta: ${insertError.message}`)

  // Re-read from DB to ensure we get all cycles, including those that won a conflict
  const { data: todos, error: leerError } = await supabase
    .from('credit_card_cycles')
    .select('*')
    .eq('payment_method_id', method.id)
    .order('closing_date', { ascending: true })

  if (leerError) throw new Error(`No pude leer los resumenes despues de crearlos: ${leerError.message}`)

  return ciclosDeMetodo(method.id, (todos ?? []) as CreditCardCycle[])
}
