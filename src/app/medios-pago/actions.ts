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

    const { error } = await supabase
      .from('payment_methods')
      .insert({
        user_id: user.id as any,
        name: validated.data.name,
        type: validated.data.type,
        default_closing_day: validated.data.default_closing_day ?? null,
        default_payment_day: validated.data.default_payment_day ?? null,
        is_personal: validated.data.is_personal ?? false,
      })

    if (error) {
      console.error('Error creating payment method:', error)
      return { error: 'Error al crear el medio de pago' }
    }

    revalidatePath('/medios-pago')
    return { success: true }
  } catch (error) {
    console.error('Unexpected error:', error)
    return { error: 'Ocurrió un error inesperado' }
  }
}
