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

    const isUsd = plan.currency === 'USD';
    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      description: plan.description,
      amount: Math.abs(Number(plan.amount)),
      date: dateToLocalString(now),
      type: 'expense' as const,
      category_id: plan.category_id,
      payment_method_id: plan.payment_method_id,
      recurring_plan_id: plan.id,
      original_currency: isUsd ? 'USD' : 'ARS',
      original_amount: isUsd ? plan.original_amount : Math.abs(Number(plan.amount)),
      rate_pair: isUsd ? plan.rate_pair : null,
      exchange_rate: isUsd ? plan.exchange_rate : null,
    });
    if (txError) {
      console.error('Error registrando pago de mensualidad:', txError);
      return { error: `No se pudo registrar el pago: ${txError.message}` };
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

    const [
      { data: plans, error: plansError },
      { data: existingTxs, error: txReadError },
      { data: firstRealTx, error: firstTxError },
    ] = await Promise.all([
      supabase.from('recurring_plans').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase
        .from('transactions')
        .select('recurring_plan_id, date')
        .eq('user_id', user.id)
        .not('recurring_plan_id', 'is', null),
      supabase
        .from('transactions')
        .select('date')
        .eq('user_id', user.id)
        .is('recurring_plan_id', null)
        .order('date', { ascending: true })
        .limit(1),
    ]);
    if (plansError || txReadError || firstTxError) {
      return { error: 'No se pudo leer el historial' };
    }

    const now = new Date();
    const currentMonthKey = dateToLocalString(now).slice(0, 7);

    // Piso del historial: mes de la primera transacción REAL del usuario.
    // Antes de ese mes la app no tiene ingresos registrados; backfillear ahí
    // resta gastos sin contrapartida y hunde el saldo. Sin transacciones
    // reales, no hay nada que backfillear.
    const floorMonth = firstRealTx?.[0]?.date
      ? String(firstRealTx[0].date).slice(0, 7)
      : currentMonthKey;

    // Limpieza: pagos generados por backfills previos en meses anteriores al
    // piso. Seguro de borrar: solo esta feature crea transacciones con
    // recurring_plan_id (nada más las escribe en la app).
    const { error: cleanupError } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', user.id)
      .not('recurring_plan_id', 'is', null)
      .lt('date', `${floorMonth}-01`);
    if (cleanupError) {
      console.error('Error limpiando exceso de backfill:', cleanupError);
      return { error: `No se pudo corregir el historial: ${cleanupError.message}` };
    }

    // Meses ya cubiertos por plan: { planId: Set<'yyyy-MM'> } (solo desde el piso)
    const coveredMonths = new Map<number, Set<string>>();
    for (const t of existingTxs ?? []) {
      if (!t.recurring_plan_id) continue;
      const m = String(t.date).slice(0, 7);
      if (m < floorMonth) continue; // recién borrados
      if (!coveredMonths.has(t.recurring_plan_id)) coveredMonths.set(t.recurring_plan_id, new Set());
      coveredMonths.get(t.recurring_plan_id)!.add(m);
    }

    const rows: Record<string, unknown>[] = [];

    for (const plan of plans ?? []) {
      const start = new Date(plan.created_at);
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const covered = coveredMonths.get(plan.id) ?? new Set<string>();

      while (dateToLocalString(cursor).slice(0, 7) < currentMonthKey) {
        const monthKey = dateToLocalString(cursor).slice(0, 7);
        if (monthKey >= floorMonth && !covered.has(monthKey)) {
          const isUsdPlan = plan.currency === 'USD';
          rows.push({
            user_id: user.id,
            description: plan.description,
            amount: Math.abs(Number(plan.amount)),
            date: `${monthKey}-01`,
            type: 'expense',
            category_id: plan.category_id,
            payment_method_id: plan.payment_method_id,
            recurring_plan_id: plan.id,
            original_currency: isUsdPlan ? 'USD' : 'ARS',
            original_amount: isUsdPlan ? plan.original_amount : Math.abs(Number(plan.amount)),
            rate_pair: isUsdPlan ? plan.rate_pair : null,
            exchange_rate: isUsdPlan ? plan.exchange_rate : null,
          });
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('transactions').insert(rows);
      if (insertError) {
        console.error('Error regularizando historial de mensualidades:', insertError);
        return { error: `No se pudo regularizar el historial: ${insertError.message}` };
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
