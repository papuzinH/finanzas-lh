'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { dateToLocalString } from '@/lib/utils/dates';

type ActionResponse = {
  error?: string;
  success?: boolean;
};

/**
 * Marca una mensualidad como pagada este mes creando la transacción real
 * vinculada (recurring_plan_id). El Disponible Real no cambia: el monto pasa
 * del bucket "pendiente" al saldo ya gastado.
 */
export async function markRecurringPlanPaid(planId: number): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'No autorizado' };
    }

    const { data: plan, error: planError } = await supabase
      .from('recurring_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', user.id)
      .single();
    if (planError || !plan) {
      return { error: 'Plan no encontrado' };
    }

    // Guard anti-duplicado: si ya hay pago registrado este mes, no crear otro.
    const now = new Date();
    const monthStart = dateToLocalString(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = dateToLocalString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('recurring_plan_id', planId)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .limit(1);
    if (existing && existing.length > 0) {
      return { success: true };
    }

    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      description: plan.description,
      amount: Math.abs(Number(plan.amount)),
      date: dateToLocalString(now),
      type: 'expense' as const,
      category_id: plan.category_id,
      payment_method_id: plan.payment_method_id,
      recurring_plan_id: plan.id,
      currency: plan.currency,
      original_amount: plan.original_amount,
      rate_pair: plan.rate_pair,
      exchange_rate: plan.exchange_rate,
    });
    if (txError) {
      console.error('Error registrando pago de mensualidad:', txError);
      return { error: 'No se pudo registrar el pago' };
    }

    revalidatePath('/compromisos');
    revalidatePath('/');
    return { success: true };
  } catch (e) {
    console.error('Error inesperado en markRecurringPlanPaid:', e);
    return { error: 'Ocurrió un error inesperado' };
  }
}

/**
 * Deshace el pago del mes actual de una mensualidad (borra la transacción
 * vinculada de este mes).
 */
export async function unmarkRecurringPlanPaid(planId: number): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'No autorizado' };
    }

    const now = new Date();
    const monthStart = dateToLocalString(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = dateToLocalString(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', user.id)
      .eq('recurring_plan_id', planId)
      .gte('date', monthStart)
      .lte('date', monthEnd);
    if (error) {
      console.error('Error deshaciendo pago de mensualidad:', error);
      return { error: 'No se pudo deshacer el pago' };
    }

    revalidatePath('/compromisos');
    revalidatePath('/');
    return { success: true };
  } catch (e) {
    console.error('Error inesperado en unmarkRecurringPlanPaid:', e);
    return { error: 'Ocurrió un error inesperado' };
  }
}

/**
 * Regulariza el historial: crea las transacciones de mensualidades de meses
 * PASADOS que nunca se registraron (desde el mes de creación de cada plan
 * activo hasta el mes pasado inclusive). El mes actual no se toca: lo maneja
 * el estado Pagado/Pendiente.
 */
export async function backfillRecurringPlansHistory(): Promise<ActionResponse & { created?: number }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'No autorizado' };
    }

    const [{ data: plans, error: plansError }, { data: existingTxs, error: txReadError }] =
      await Promise.all([
        supabase.from('recurring_plans').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase
          .from('transactions')
          .select('recurring_plan_id, date')
          .eq('user_id', user.id)
          .not('recurring_plan_id', 'is', null),
      ]);
    if (plansError || txReadError) {
      return { error: 'No se pudo leer el historial' };
    }

    // Meses ya cubiertos por plan: { planId: Set<'yyyy-MM'> }
    const coveredMonths = new Map<number, Set<string>>();
    for (const t of existingTxs ?? []) {
      if (!t.recurring_plan_id) continue;
      if (!coveredMonths.has(t.recurring_plan_id)) coveredMonths.set(t.recurring_plan_id, new Set());
      coveredMonths.get(t.recurring_plan_id)!.add(String(t.date).slice(0, 7));
    }

    const now = new Date();
    const currentMonthKey = dateToLocalString(now).slice(0, 7);
    const rows: Record<string, unknown>[] = [];

    for (const plan of plans ?? []) {
      const start = new Date(plan.created_at);
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const covered = coveredMonths.get(plan.id) ?? new Set<string>();

      while (dateToLocalString(cursor).slice(0, 7) < currentMonthKey) {
        const monthKey = dateToLocalString(cursor).slice(0, 7);
        if (!covered.has(monthKey)) {
          rows.push({
            user_id: user.id,
            description: plan.description,
            amount: Math.abs(Number(plan.amount)),
            date: `${monthKey}-01`,
            type: 'expense',
            category_id: plan.category_id,
            payment_method_id: plan.payment_method_id,
            recurring_plan_id: plan.id,
            currency: plan.currency,
            original_amount: plan.original_amount,
            rate_pair: plan.rate_pair,
            exchange_rate: plan.exchange_rate,
          });
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('transactions').insert(rows);
      if (insertError) {
        console.error('Error regularizando historial de mensualidades:', insertError);
        return { error: 'No se pudo regularizar el historial' };
      }
    }

    revalidatePath('/compromisos');
    revalidatePath('/');
    return { success: true, created: rows.length };
  } catch (e) {
    console.error('Error inesperado en backfillRecurringPlansHistory:', e);
    return { error: 'Ocurrió un error inesperado' };
  }
}
