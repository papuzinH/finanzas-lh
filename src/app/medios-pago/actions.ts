'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { createPaymentMethodSchema, type CreatePaymentMethodSchema } from '@/lib/schemas/payment-method'

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
