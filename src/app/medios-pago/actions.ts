'use server'

import { addMonths } from 'date-fns'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { createPaymentMethodSchema, type CreatePaymentMethodSchema } from '@/lib/schemas/payment-method'
import { declararCicloSchema, type DeclararCicloSchema } from '@/lib/schemas/ciclo'
import { guardarDeclaracion, realinearFuturos } from '@/lib/ciclos/declarar'
import { asegurarCiclos } from '@/lib/ciclos/asegurar'
import { dateToLocalString, parseLocalDate } from '@/lib/utils/dates'
import { ciclosDeMetodo, type CreditCardCycle } from '@/lib/finance/cycles'
import { planDeMovimiento, type DireccionDeMovimiento } from '@/lib/finance/mover-resumen'
import type { Transaction } from '@/types/database'

type ActionResponse = {
  error?: string
  success?: boolean
}

export async function createPaymentMethod(data: CreatePaymentMethodSchema): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const validated = createPaymentMethodSchema.safeParse(data)
    if (!validated.success) return { error: 'Datos inválidos' }

    const isDefault = validated.data.is_default ?? false

    // Invariante: un solo predeterminado por usuario.
    if (isDefault) {
      await supabase
        .from('payment_methods')
        .update({ is_default: false })
        .eq('user_id', user.id)
    }

    const { error } = await supabase
      .from('payment_methods')
      .insert({
        user_id: user.id,
        name: validated.data.name,
        type: validated.data.type,
        default_closing_day: validated.data.default_closing_day ?? null,
        default_payment_day: validated.data.default_payment_day ?? null,
        is_personal: validated.data.is_personal ?? false,
        is_default: isDefault,
      })

    if (error) {
      console.error('Error creating payment method:', error)
      return { error: 'Error al crear el medio de pago' }
    }

    revalidatePath('/ajustes/medios')
    return { success: true }
  } catch (error) {
    console.error('Unexpected error:', error)
    return { error: 'Ocurrió un error inesperado' }
  }
}

export async function updatePaymentMethod(id: string, data: CreatePaymentMethodSchema): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const validated = createPaymentMethodSchema.safeParse(data)
    if (!validated.success) return { error: 'Datos inválidos' }

    const isDefault = validated.data.is_default ?? false

    // Tarjeta como estaba guardada, para comparar los dias despues del update
    // y decidir si hay que re-fechar los resumenes futuros.
    const { data: previo } = await supabase
      .from('payment_methods')
      .select('type, default_closing_day, default_payment_day')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    // Invariante: un solo predeterminado por usuario. Si este pasa a ser el
    // default, primero se resetean todos (incluido este) y luego se marca.
    if (isDefault) {
      await supabase
        .from('payment_methods')
        .update({ is_default: false })
        .eq('user_id', user.id)
    }

    const { error } = await supabase
      .from('payment_methods')
      .update({
        name: validated.data.name,
        type: validated.data.type,
        default_closing_day: validated.data.default_closing_day ?? null,
        default_payment_day: validated.data.default_payment_day ?? null,
        is_personal: validated.data.is_personal ?? false,
        is_default: isDefault,
      })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error updating payment method:', error)
      return { error: 'Error al actualizar el medio de pago' }
    }

    const diasCambiaron =
      previo?.default_closing_day !== (validated.data.default_closing_day ?? null) ||
      previo?.default_payment_day !== (validated.data.default_payment_day ?? null)

    if (validated.data.type === 'credit' && diasCambiaron) {
      // Los resumenes que todavia no cerraron toman los dias nuevos. Los que ya
      // cerraron no: sus compras ya estan imputadas. Los declarados tampoco: son
      // dato que el usuario leyo del resumen real. Si esto falla, la tarjeta ya
      // se guardo: dejar los resumenes desalineados es el estado de hoy y se
      // corrige en el proximo intento -- devolver error diria "no se guardo" y
      // no seria cierto.
      try {
        const { data: method } = await supabase
          .from('payment_methods')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle()
        if (method) await realinearFuturos(supabase, method, dateToLocalString(new Date()))
      } catch (e) {
        console.error('Error re-fechando resumenes futuros:', e)
      }
    }

    revalidatePath('/ajustes/medios')
    return { success: true }
  } catch (error) {
    console.error('Unexpected error:', error)
    return { error: 'Ocurrió un error inesperado' }
  }
}

export async function deletePaymentMethod(id: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    // Verificar que el método pertenece al usuario
    const { data: method } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!method) return { error: 'Medio de pago no encontrado' }

    const { error } = await supabase
      .from('payment_methods')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting payment method:', error)
      return { error: 'Error al eliminar el medio de pago' }
    }

    revalidatePath('/ajustes/medios')
    return { success: true }
  } catch (error) {
    console.error('Unexpected error:', error)
    return { error: 'Ocurrió un error inesperado' }
  }
}

export async function reassignAndDeletePaymentMethod(
  id: string,
  newMethodId: string | null
): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    // Verificar que el método pertenece al usuario
    const { data: method } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!method) return { error: 'Medio de pago no encontrado' }

    // El destino de la reasignación también tiene que ser del usuario (M4): RLS
    // no impide que las transacciones queden apuntando por FK a un medio ajeno.
    if (newMethodId) {
      const { data: destino } = await supabase
        .from('payment_methods')
        .select('id')
        .eq('id', newMethodId)
        .eq('user_id', user.id)
        .single()

      if (!destino) return { error: 'Medio de pago de destino inválido' }
    }

    // Reasignar transacciones
    const { error: txError } = await supabase
      .from('transactions')
      .update({ payment_method_id: newMethodId })
      .eq('payment_method_id', id)

    if (txError) {
      console.error('Error reasignando transacciones:', txError)
      return { error: 'Error al reasignar las transacciones' }
    }

    // Reasignar planes recurrentes
    const { error: rpError } = await supabase
      .from('recurring_plans')
      .update({ payment_method_id: newMethodId })
      .eq('payment_method_id', id)

    if (rpError) {
      console.error('Error reasignando planes recurrentes:', rpError)
      return { error: 'Error al reasignar los planes recurrentes' }
    }

    // Reasignar planes de cuotas
    const { error: ipError } = await supabase
      .from('installment_plans')
      .update({ payment_method_id: newMethodId })
      .eq('payment_method_id', id)

    if (ipError) {
      console.error('Error reasignando planes de cuotas:', ipError)
      return { error: 'Error al reasignar los planes de cuotas' }
    }

    // Eliminar el medio de pago
    const { error: deleteError } = await supabase
      .from('payment_methods')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Error eliminando medio de pago:', deleteError)
      return { error: 'Error al eliminar el medio de pago' }
    }

    revalidatePath('/ajustes/medios')
    return { success: true }
  } catch (error) {
    console.error('Unexpected error:', error)
    return { error: 'Ocurrió un error inesperado' }
  }
}

export async function declararCiclo(input: DeclararCicloSchema): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const parsed = declararCicloSchema.safeParse(input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos invalidos' }

    // Dueno del id que llega del cliente (auditoria M4): RLS impide mutar filas ajenas, pero no
    // impide que una fila propia apunte a una tarjeta de otro.
    const { data: method } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('id', parsed.data.paymentMethodId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!method) return { error: 'Medio de pago invalido' }
    if (method.type !== 'credit') return { error: 'Solo las tarjetas de credito tienen resumenes' }

    try {
      await guardarDeclaracion(
        supabase,
        method,
        parsed.data.closingDate,
        parsed.data.dueDate,
        dateToLocalString(new Date()),
        parsed.data.cycleId,
      )
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'No pude guardar el resumen' }
    }

    revalidatePath('/ajustes/medios')
    revalidatePath('/compromisos')
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Unexpected error:', error)
    return { error: 'Ocurrió un error inesperado' }
  }
}

export async function posponerRecordatorioDeCiclo(cycleId: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { error } = await supabase
      .from('credit_card_cycles')
      .update({ reminder_dismissed_at: new Date().toISOString() })
      .eq('id', cycleId)
      .eq('user_id', user.id)
    if (error) return { error: 'No pude guardar' }

    revalidatePath('/compromisos')
    return { success: true }
  } catch (error) {
    console.error('Unexpected error:', error)
    return { error: 'Ocurrió un error inesperado' }
  }
}

/**
 * Mueve una compra (o un plan de cuotas desde la cuota tocada) al resumen vecino.
 *
 * El cliente manda la DIRECCION, nunca un cycleId: el destino se resuelve acá, desde
 * el ciclo actual de la transacción. Así no hay forma de imputar a un resumen
 * arbitrario, de otra tarjeta o de otro usuario.
 *
 * `purchase_date` no se toca: mover cambia en qué resumen te lo cobraron, no cuándo
 * compraste (ver Reasignacion en lib/finance/mover-resumen.ts).
 *
 * TODO O NADA: si el plan de cuotas queda incompleto incluso después de intentar
 * materializar los resúmenes que falten, no se aplica ninguna reasignación. Un plan
 * a medias deja dos cuotas del mismo plan en el mismo resumen, un estado que en el
 * papel del banco no existe.
 */
export async function moverTransaccionAlResumenVecino(
  transactionId: string,
  direccion: DireccionDeMovimiento,
): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    // Guard 1: la transaccion es del usuario.
    const { data: t } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!t) return { error: 'Movimiento inválido' }

    // Guard 2: solo se mueven consumos de una tarjeta de crédito ya imputados a un
    // resumen. El medio también se valida contra el usuario (M4): una fila propia
    // no debería poder apuntar a un medio ajeno, pero no confiamos en eso.
    const { data: method } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('id', t.payment_method_id ?? '')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!method || method.type !== 'credit' || !t.cycle_id) {
      return { error: 'Sólo se pueden mover movimientos de una tarjeta de crédito.' }
    }

    // Guard 3: ni mensualidad, ni reintegro, ni pago de tarjeta.
    if (t.recurring_plan_id) return { error: 'Las mensualidades se manejan desde Compromisos.' }
    if (t.type === 'income') return { error: 'Los reintegros no se mueven de resumen.' }
    if (t.card_payment_for) return { error: 'Un pago de tarjeta no pertenece a un resumen de consumo.' }

    // Los ciclos y las transacciones de ESA tarjeta: planDeMovimiento los necesita
    // para correr el plan de cuotas y para resolver el resumen vecino.
    const [{ data: ciclosRaw }, { data: txsRaw }] = await Promise.all([
      supabase.from('credit_card_cycles').select('*').eq('payment_method_id', method.id),
      supabase.from('transactions').select('*').eq('user_id', user.id).eq('payment_method_id', method.id),
    ])
    const ciclos = ciclosDeMetodo(method.id, (ciclosRaw ?? []) as CreditCardCycle[])
    const txs = (txsRaw ?? []) as Transaction[]

    // Guard 4 (el vecino existe) lo resuelve planDeMovimiento vía motivoDeRechazo.
    let plan = planDeMovimiento(t, txs, ciclos, direccion)
    if (plan.motivoDeRechazo) return { error: plan.motivoDeRechazo }

    // Cuántas filas HAY que mover lo decide `planDeMovimiento` y NADIE MÁS. Esta cuenta
    // vivía acá duplicada como `x.date >= t.date`, y coincidía con la del plan sólo
    // mientras las `date` del plan fueran únicas -- que es justo lo que el camino
    // 'anterior' de esta feature rompía (dos cuotas en el mismo resumen comparten el
    // `due_date`). Ver `esperadas` en lib/finance/mover-resumen.ts (fix wave final, C1).
    const esperadas = plan.esperadas

    // Si el plan se estira más allá de los resúmenes materializados, se crean los que
    // falten y se pide el plan UNA sola vez más. Nunca en loop.
    if (plan.reasignaciones.length < esperadas) {
      const ultima = txs
        .filter((x) => x.installment_plan_id === t.installment_plan_id)
        .reduce((max, x) => (x.date > max ? x.date : max), t.date)
      try {
        // asegurarCiclos necesita el PaymentMethod COMPLETO: genera los resúmenes a
        // partir de default_closing_day/default_payment_day. Fabricar { id } rompe.
        await asegurarCiclos(supabase, method, new Date(), addMonths(parseLocalDate(ultima), 2))
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'No pude asegurar los resúmenes de la tarjeta' }
      }
      const { data: masCiclos } = await supabase
        .from('credit_card_cycles')
        .select('*')
        .eq('payment_method_id', method.id)
      plan = planDeMovimiento(t, txs, ciclosDeMetodo(method.id, (masCiclos ?? []) as CreditCardCycle[]), direccion)
    }

    // Todo o nada: un plan de cuotas movido a medias deja dos cuotas en el mismo
    // resumen, que es peor que no mover.
    if (plan.reasignaciones.length < esperadas) {
      return { error: 'No pude mover todas las cuotas del plan, así que no moví ninguna.' }
    }

    // Una sola escritura para TODAS las reasignaciones: un `upsert` multi-fila corre
    // como una unica transaccion en PostgREST, asi que la atomicidad sale gratis. Un
    // loop de N updates independientes podia mover c2 y fallar en c3 -- exactamente el
    // estado de "dos cuotas en el mismo resumen" que esta task existe para prevenir, y
    // encima en silencio (fix round 1, Critical).
    //
    // Se mandan las filas COMPLETAS (no solo {id, cycle_id, date}): upsert reemplaza la
    // fila entera, y una parcial violaria los NOT NULL de columnas como amount/
    // description/category_id. `purchase_date` viaja en el payload, pero con el mismo
    // valor que ya tenia -- el invariante sigue siendo que mover no lo TOCA, no que la
    // clave este ausente del payload.
    //
    // RELECTURA JUSTO ANTES DE ESCRIBIR: el payload lleva el `id`, asi que un upsert
    // sobre una fila que dejo de existir entre la lectura y la escritura -- otra pestaña,
    // o el chat, que tiene `delete_entity` -- no encuentra conflicto y la RE-INSERTA con
    // los valores viejos. Un `UPDATE ... WHERE id =` habria afectado 0 filas. Y la
    // ventana no es angosta: en el camino de cuotas hay un round-trip completo a
    // `asegurarCiclos` en el medio. Si alguna de las filas que el plan quiere mover ya no
    // esta, se rechaza entero -- mismo criterio de todo-o-nada que el resto de la action.
    // La relectura filtra por `user_id`: las filas que se escriben salen de ella, no de
    // `txs`, asi que el dueño se revalida en el mismo instante de la escritura.
    const ids = plan.reasignaciones.map((r) => r.transactionId)
    const { data: frescasRaw, error: eFrescas } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .in('id', ids)
    if (eFrescas) {
      console.error('Error releyendo las transacciones antes de moverlas:', eFrescas)
      return { error: 'No pude leer los movimientos antes de moverlos.' }
    }
    const frescas = new Map((frescasRaw ?? []).map((x) => [x.id, x as Transaction]))
    if (frescas.size !== ids.length) {
      return { error: 'Alguno de los movimientos dejó de existir mientras lo movía, así que no moví ninguno.' }
    }

    const filas = plan.reasignaciones.map((r) => ({
      ...frescas.get(r.transactionId)!,
      cycle_id: r.cycleId,
      date: r.date,
    }))
    // `onConflict: 'id'` explícito: es el default de PostgREST (la PK) y el gate lo
    // verificó contra Postgres real, pero los otros upserts del repo lo pasan y una
    // escritura que reemplaza filas enteras no debería depender de un default implícito.
    const { error } = await supabase.from('transactions').upsert(filas, { onConflict: 'id' })
    if (error) {
      console.error('Error moviendo transacciones de resumen:', error)
      return { error: 'No se pudo mover el movimiento de resumen.' }
    }

    revalidatePath('/ajustes/medios')
    return { success: true }
  } catch (error) {
    console.error('Unexpected error:', error)
    return { error: 'Ocurrió un error inesperado' }
  }
}
