'use server';

import { createClient } from '@/utils/supabase/server';
import { transactionSchema, type TransactionSchema, createTransactionSchema, type CreateTransactionSchema } from '@/lib/schemas/transaction';
import { revalidatePath } from 'next/cache';
import { calculateCreditPaymentDate, dateToLocalString } from '@/lib/utils/dates';

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

    const { description, amount, date, category_id, type, payment_method_id, currency, rate_pair, exchange_rate } = validatedFields.data;

    // Para gastos con tarjeta de crédito, calcular la fecha real de pago según el ciclo de la tarjeta.
    // Para débito/efectivo, se guarda la fecha de compra sin modificar.
    let storedDate = dateToLocalString(new Date(date));
    const resolvedMethodId = payment_method_id && payment_method_id !== 'none' ? payment_method_id : null;

    // El medio tiene que ser del usuario (M4): RLS no impide que la transacción
    // quede apuntando por FK a un medio ajeno. Se valida para cualquier tipo,
    // no sólo en 'expense' — el payment_method_id se persiste igual.
    if (resolvedMethodId) {
      const { data: method } = await supabase
        .from('payment_methods')
        .select('type, default_closing_day, default_payment_day')
        .eq('id', resolvedMethodId)
        .eq('user_id', user.id)
        .single();

      if (!method) return { error: 'Medio de pago inválido' };

      if (type === 'expense' && method.type === 'credit' && method.default_closing_day && method.default_payment_day) {
        storedDate = calculateCreditPaymentDate(storedDate, method.default_closing_day, method.default_payment_day);
      }
    }

    const isUsd = currency === 'USD';
    const rate = isUsd ? Number(exchange_rate) : null;
    if (isUsd && (!rate || rate <= 0)) {
      return { error: 'Cotización del dólar inválida' };
    }
    // amount viene en la moneda elegida; persistimos el equivalente ARS del momento.
    const amountArs = isUsd ? amount * (rate as number) : amount;

    const { error } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        description,
        amount: amountArs,
        date: storedDate,
        category_id,
        type,
        payment_method_id: resolvedMethodId,
        original_currency: isUsd ? 'USD' : 'ARS',
        original_amount: amount,
        rate_pair: isUsd ? rate_pair : null,
        exchange_rate: rate,
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

    const { description, amount, date, category_id, type, payment_method_id, currency, rate_pair, exchange_rate } = validatedFields.data;

    const isUsd = currency === 'USD';
    const rate = isUsd ? Number(exchange_rate) : null;
    if (isUsd && (!rate || rate <= 0)) {
      return { error: 'Cotización del dólar inválida' };
    }
    const amountArs = isUsd ? amount * (rate as number) : amount;

    const resolvedMethodId = payment_method_id && payment_method_id !== 'none' ? payment_method_id : null;

    // Por defecto la fecha se guarda tal cual. Solo si se ASIGNA un medio de
    // crédito distinto al que tenía, se recalcula el vencimiento tratando `date`
    // como fecha de compra (evita re-desplazar la fecha de un crédito ya cargado).
    let storedDate = dateToLocalString(new Date(date));

    const { data: current } = await supabase
      .from('transactions')
      .select('payment_method_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    const methodChanged = (current?.payment_method_id ?? null) !== resolvedMethodId;

    // Si cambia a un medio nuevo, tiene que ser del usuario (M4). Se valida
    // aunque no sea 'expense': el payment_method_id se guarda igual.
    if (methodChanged && resolvedMethodId) {
      const { data: method } = await supabase
        .from('payment_methods')
        .select('type, default_closing_day, default_payment_day')
        .eq('id', resolvedMethodId)
        .eq('user_id', user.id)
        .single();

      if (!method) return { error: 'Medio de pago inválido' };

      if (type === 'expense' && method.type === 'credit' && method.default_closing_day && method.default_payment_day) {
        storedDate = calculateCreditPaymentDate(storedDate, method.default_closing_day, method.default_payment_day);
      }
    }

    const { error } = await supabase
      .from('transactions')
      .update({
        description,
        amount: amountArs,
        date: storedDate,
        category_id,
        type,
        payment_method_id: resolvedMethodId,
        original_currency: isUsd ? 'USD' : 'ARS',
        original_amount: amount,
        rate_pair: isUsd ? rate_pair : null,
        exchange_rate: rate,
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

/**
 * Asigna el medio de pago predeterminado del usuario a TODAS sus transacciones
 * que hoy no tienen medio (payment_method_id null). Si el default es una tarjeta
 * de crédito, recalcula la fecha de vencimiento de cada gasto.
 */
export async function assignDefaultToUnassignedTransactions(): Promise<ActionResponse & { updated?: number }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'No autorizado' };

    const { data: def } = await supabase
      .from('payment_methods')
      .select('id, type, default_closing_day, default_payment_day')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single();

    if (!def) return { error: 'No tenés un medio predeterminado configurado' };

    const { data: rows } = await supabase
      .from('transactions')
      .select('id, date, type')
      .eq('user_id', user.id)
      .is('payment_method_id', null);

    if (!rows || rows.length === 0) return { success: true, updated: 0 };

    const isCredit = def.type === 'credit' && !!def.default_closing_day && !!def.default_payment_day;

    if (!isCredit) {
      const { error } = await supabase
        .from('transactions')
        .update({ payment_method_id: def.id })
        .eq('user_id', user.id)
        .is('payment_method_id', null);
      if (error) {
        console.error('Error asignando medio por defecto:', error);
        return { error: 'Error al asignar el medio' };
      }
    } else {
      // Crédito: recalcular el vencimiento por fila (los gastos usan la fecha de compra).
      for (const r of rows) {
        const newDate =
          r.type === 'expense'
            ? calculateCreditPaymentDate(r.date, def.default_closing_day!, def.default_payment_day!)
            : r.date;
        const { error } = await supabase
          .from('transactions')
          .update({ payment_method_id: def.id, date: newDate })
          .eq('id', r.id)
          .eq('user_id', user.id);
        if (error) {
          console.error('Error asignando medio por defecto (crédito):', error);
          return { error: 'Error al asignar el medio' };
        }
      }
    }

    revalidatePath('/movimientos');
    return { success: true, updated: rows.length };
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
