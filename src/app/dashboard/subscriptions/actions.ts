'use server';

import { createClient } from '@/utils/supabase/server';
import { subscriptionSchema, type SubscriptionSchema, createSubscriptionSchema, type CreateSubscriptionSchema } from '@/lib/schemas/subscription';
import { revalidatePath } from 'next/cache';

type ActionResponse = {
  error?: string;
  success?: boolean;
};

export async function createSubscription(data: CreateSubscriptionSchema): Promise<ActionResponse> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'No autorizado' };
    }

    const validatedFields = createSubscriptionSchema.safeParse(data);

    if (!validatedFields.success) {
      return { error: 'Datos inválidos' };
    }

    const { description, amount, category_id, payment_method_id, currency, rate_pair, exchange_rate, billing_day } = validatedFields.data;

    const isUsd = currency === 'USD';
    const rate = isUsd ? Number(exchange_rate) : null;
    if (isUsd && (!rate || rate <= 0)) {
      return { error: 'Cotización del dólar inválida' };
    }
    const amountArs = isUsd ? amount * (rate as number) : amount;

    const { error } = await supabase
      .from('recurring_plans')
      .insert({
        user_id: user.id,
        description,
        amount: amountArs,
        category_id,
        payment_method_id: payment_method_id && payment_method_id !== 'none' ? payment_method_id : null,
        is_active: true,
        billing_day: billing_day ?? null,
        currency: isUsd ? 'USD' : 'ARS',
        original_amount: amount,
        rate_pair: isUsd ? rate_pair : null,
        exchange_rate: rate,
      });

    if (error) {
      console.error('Error creating subscription:', error);
      return { error: 'Error al crear la suscripción' };
    }

    revalidatePath('/compromisos');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { error: 'Ocurrió un error inesperado' };
  }
}

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

    const { description, amount, is_active, category_id, payment_method_id, currency, rate_pair, exchange_rate, billing_day } = validatedFields.data;

    const isUsd = currency === 'USD';
    const rate = isUsd ? Number(exchange_rate) : null;
    if (isUsd && (!rate || rate <= 0)) {
      return { error: 'Cotización del dólar inválida' };
    }
    const amountArs = isUsd ? amount * (rate as number) : amount;

    const { error } = await supabase
      .from('recurring_plans')
      .update({
        description,
        amount: amountArs,
        is_active,
        category_id,
        payment_method_id,
        billing_day: billing_day ?? null,
        currency: isUsd ? 'USD' : 'ARS',
        original_amount: amount,
        rate_pair: isUsd ? rate_pair : null,
        exchange_rate: rate,
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating subscription:', error);
      return { error: 'Error al actualizar la suscripción' };
    }

    revalidatePath('/compromisos');
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

    revalidatePath('/compromisos');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { error: 'Ocurrió un error inesperado' };
  }
}
