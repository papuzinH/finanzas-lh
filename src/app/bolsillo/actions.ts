'use server'

import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

type ActionResponse = {
  error?: string
  success?: boolean
}

const accountAnchorSchema = z.object({
  payment_method_id: z.string().min(1),
  bucket: z.enum(['pocket', 'reserve']),
  /** Saldo al COMIENZO del día del ancla. Lo calcula el cliente con
   *  `anchorValueForDeclaredBalance` a partir de lo que declaró el usuario. */
  initial_balance: z.number(),
  /** null = el usuario salteó esta cuenta: queda sin anclar (suma desde el primer movimiento). */
  initial_balance_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})

export type AccountAnchorInput = z.infer<typeof accountAnchorSchema>

const incomeRhythmSchema = z.enum(['monthly', 'biweekly', 'weekly', 'irregular'])

/**
 * Persiste el bucket y el saldo anclado de cada cuenta. Idempotente: se puede
 * volver a correr desde Ajustes cuantas veces haga falta.
 */
export async function saveAccountAnchors(anchors: AccountAnchorInput[]): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const parsed = z.array(accountAnchorSchema).safeParse(anchors)
    if (!parsed.success) return { error: 'Datos inválidos' }
    if (parsed.data.length === 0) return { success: true }

    // Una tarjeta de crédito no tiene saldo propio: su deuda sale del ciclo.
    const { data: methods } = await supabase
      .from('payment_methods')
      .select('id, type')
      .eq('user_id', user.id)

    const byId = new Map((methods ?? []).map((m) => [m.id, m.type]))

    for (const a of parsed.data) {
      if (!byId.has(a.payment_method_id)) return { error: 'Ese medio de pago no es tuyo' }
      const esCredito = byId.get(a.payment_method_id) === 'credit'

      const { error } = await supabase
        .from('payment_methods')
        .update({
          bucket: esCredito ? 'pocket' : a.bucket,
          initial_balance: esCredito ? 0 : a.initial_balance,
          initial_balance_at: esCredito ? null : a.initial_balance_at,
        })
        .eq('id', a.payment_method_id)
        .eq('user_id', user.id)

      if (error) {
        console.error('Error guardando el ancla del medio:', error)
        return { error: 'No se pudo guardar el saldo de una de tus cuentas' }
      }
    }

    revalidatePath('/')
    revalidatePath('/ajustes/medios')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in saveAccountAnchors:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}

/** Ritmo de cobro declarado. Define qué compromisos entran en el disponible de hoy. */
export async function saveIncomeRhythm(rhythm: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const parsed = incomeRhythmSchema.safeParse(rhythm)
    if (!parsed.success) return { error: 'Ritmo inválido' }

    const { error } = await supabase
      .from('users')
      .update({ income_rhythm: parsed.data })
      .eq('id', user.id)

    if (error) {
      console.error('Error guardando el ritmo de cobro:', error)
      return { error: 'No se pudo guardar tu ritmo de cobro' }
    }

    revalidatePath('/')
    revalidatePath('/ajustes')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in saveIncomeRhythm:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}

/** Cierra la puesta a punto. También la marca el usuario que la saltea. */
export async function completePocketSetup(): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { error } = await supabase
      .from('users')
      .update({ pocket_setup_completed: true })
      .eq('id', user.id)

    if (error) {
      console.error('Error cerrando la puesta a punto:', error)
      return { error: 'No se pudo cerrar la puesta a punto' }
    }

    revalidatePath('/')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in completePocketSetup:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}
