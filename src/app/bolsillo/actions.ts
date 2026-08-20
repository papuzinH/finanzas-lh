'use server'

import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { reconcileOptionsFor } from '@/lib/finance/reconcile'

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

const reconcileSchema = z.object({
  payment_method_id: z.string().min(1),
  /** Saldo declarado − saldo calculado. El signo importa. */
  difference: z.number(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  classification: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('adjustment') }),
    z.object({ kind: z.literal('expense'), category_id: z.string().min(1), description: z.string().min(1).max(120) }),
    z.object({ kind: z.literal('income'), category_id: z.string().min(1), description: z.string().min(1).max(120) }),
    z.object({ kind: z.literal('transfer'), to_payment_method_id: z.string().min(1) }),
  ]),
})

export type ReconcileInput = z.infer<typeof reconcileSchema>

const ADJUSTMENT_CATEGORY = 'Ajustes de saldo'

/** category_id es NOT NULL: los ajustes usan una categoría propia (get-or-create), y
 *  quedan fuera de las analíticas por el marcador `is_balance_adjustment`. */
async function getOrCreateAdjustmentCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  type: 'expense' | 'income',
): Promise<string | null> {
  const { data: cats } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', ADJUSTMENT_CATEGORY)
    .eq('type', type)
    .limit(1)

  if (cats && cats.length > 0) return cats[0].id

  const { data: nueva, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name: ADJUSTMENT_CATEGORY, emoji: '⚖️', is_system: true, type })
    .select('id')
    .single()

  if (error || !nueva) {
    console.error('Error creando la categoría de ajustes:', error)
    return null
  }
  return nueva.id
}

/**
 * Concilia una cuenta: registra la diferencia entre lo declarado y lo calculado,
 * clasificada como el usuario la explicó. NUNCA borra ni edita movimientos previos.
 */
export async function reconcileAccount(input: ReconcileInput): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const parsed = reconcileSchema.safeParse(input)
    if (!parsed.success) return { error: 'Datos inválidos' }

    const { payment_method_id, difference, date, classification } = parsed.data

    // Qué clasificaciones son válidas para esta diferencia: [] = redondeo, nada que
    // registrar. El mismo set descarta, por ejemplo, un "transfer" con plata que apareció.
    const opciones = reconcileOptionsFor(difference)
    if (opciones.length === 0) return { success: true }
    if (!opciones.includes(classification.kind)) {
      return { error: 'Esa opción no aplica para esta diferencia' }
    }

    const { data: method } = await supabase
      .from('payment_methods')
      .select('id, type')
      .eq('id', payment_method_id)
      .eq('user_id', user.id)
      .single()

    if (!method) return { error: 'Ese medio de pago no es tuyo' }
    if (method.type === 'credit') {
      return { error: 'Una tarjeta de crédito no tiene saldo: su deuda sale del resumen' }
    }

    const monto = Math.abs(difference)

    if (classification.kind === 'transfer') {
      const { error } = await supabase.from('internal_transfers').insert({
        user_id: user.id,
        amount: monto,
        currency: 'ARS' as const,
        period_date: date,
        real_transfer_date: date,
        transfer_type: 'manual' as const,
        from_payment_method_id: payment_method_id,
        to_payment_method_id: classification.to_payment_method_id,
        description: 'Movida a reserva (conciliación)',
      })
      if (error) {
        console.error('Error registrando la transferencia de conciliación:', error)
        return { error: 'No se pudo registrar el movimiento a la reserva' }
      }
    } else {
      const esAjuste = classification.kind === 'adjustment'
      const type: 'expense' | 'income' = difference < 0 ? 'expense' : 'income'

      const categoryId = esAjuste
        ? await getOrCreateAdjustmentCategory(supabase, user.id, type)
        : classification.category_id

      if (!categoryId) return { error: 'No se pudo preparar la categoría del ajuste' }

      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        description: esAjuste ? 'Ajuste de saldo' : classification.description,
        amount: monto,
        date,
        type,
        category_id: categoryId,
        payment_method_id,
        is_balance_adjustment: esAjuste,
        original_currency: 'ARS',
        original_amount: monto,
        rate_pair: null,
        exchange_rate: null,
      })
      if (error) {
        console.error('Error registrando la conciliación:', error)
        return { error: 'No se pudo registrar el movimiento' }
      }
    }

    revalidatePath('/')
    revalidatePath('/movimientos')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in reconcileAccount:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}
