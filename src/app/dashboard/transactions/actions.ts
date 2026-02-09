'use server';

import { createClient } from '@/utils/supabase/server';
import { transactionSchema, type TransactionSchema, createTransactionSchema, type CreateTransactionSchema } from '@/lib/schemas/transaction';
import { revalidatePath } from 'next/cache';

type ActionResponse = {
  error?: string;
  success?: boolean;
};

export async function createTransaction(data: CreateTransactionSchema): Promise<ActionResponse> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'No autorizado' };
    }

    const validatedFields = createTransactionSchema.safeParse(data);

    if (!validatedFields.success) {
      return { error: 'Datos inválidos' };
    }

    const { description, amount, date, category_id, type, payment_method_id } = validatedFields.data;

    const { error } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        description,
        amount,
        date: date.toISOString(),
        category_id,
        type,
        payment_method_id: payment_method_id && payment_method_id !== 'none' ? payment_method_id : null,
      });

    if (error) {
      console.error('Error creating transaction:', error);
      return { error: 'Error al crear la transacción' };
    }

    revalidatePath('/movimientos');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { error: 'Ocurrió un error inesperado' };
  }
}

export async function updateTransaction(id: string, data: TransactionSchema): Promise<ActionResponse> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'No autorizado' };
    }

    const validatedFields = transactionSchema.safeParse(data);

    if (!validatedFields.success) {
      return { error: 'Datos inválidos' };
    }

    const { description, amount, date, category_id, type } = validatedFields.data;


    const { error } = await supabase
      .from('transactions')
      .update({
        description,
        amount,
        date: date.toISOString(),
        category_id,
        type,
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating transaction:', error);
      return { error: 'Error al actualizar la transacción' };
    }

    revalidatePath('/dashboard/transactions');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { error: 'Ocurrió un error inesperado' };
  }
}

export async function deleteTransaction(id: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'No autorizado' };
    }

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting transaction:', error);
      return { error: 'Error al eliminar la transacción' };
    }

    revalidatePath('/dashboard/transactions');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { error: 'Ocurrió un error inesperado' };
  }
}
