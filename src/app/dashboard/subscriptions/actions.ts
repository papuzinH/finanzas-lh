'use server';

import { createClient } from '@/utils/supabase/server';
import { subscriptionSchema, type SubscriptionSchema } from '@/lib/schemas/subscription';
import { revalidatePath } from 'next/cache';

type ActionResponse = {
  error?: string;
  success?: boolean;
};

export async function updateSubscription(id: string, data: SubscriptionSchema): Promise<ActionResponse> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'No autorizado' };
    }

    const validatedFields = subscriptionSchema.safeParse(data);

    if (!validatedFields.success) {
      return { error: 'Datos inválidos' };
    }

    const { description, amount, is_active, category_id, payment_method_id } = validatedFields.data;

    // Assuming subscriptions are always expenses, store as negative
    const finalAmount = -Math.abs(amount);

    const { error } = await supabase
      .from('recurring_plans')
      .update({
        description,
        amount: finalAmount,
        is_active,
        category_id,
        payment_method_id
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating subscription:', error);
      return { error: 'Error al actualizar la suscripción' };
    }

    revalidatePath('/mensualidades');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { error: 'Ocurrió un error inesperado' };
  }
}

export async function deleteSubscription(id: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'No autorizado' };
    }

    const { error } = await supabase
      .from('recurring_plans')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting subscription:', error);
      return { error: 'Error al eliminar la suscripción' };
    }

    revalidatePath('/mensualidades');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { error: 'Ocurrió un error inesperado' };
  }
}
