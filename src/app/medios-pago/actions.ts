'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { createPaymentMethodSchema, type CreatePaymentMethodSchema } from '@/lib/schemas/payment-method'
import { declararCicloSchema, type DeclararCicloSchema } from '@/lib/schemas/ciclo'
import { guardarDeclaracion, realinearFuturos } from '@/lib/ciclos/declarar'
import { dateToLocalString } from '@/lib/utils/dates'

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
