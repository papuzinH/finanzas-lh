'use server';

import { createClient } from '@/utils/supabase/server';
import { installmentPlanSchema, type InstallmentPlanSchema, createInstallmentPlanSchema, type CreateInstallmentPlanSchema } from '@/lib/schemas/installment-plan';
import { revalidatePath } from 'next/cache';
import { addMonths } from 'date-fns';
import { parseLocalDate, formatLocalDate } from '@/lib/utils/dates';
import { getOrCreateCategoriaDescarte } from '@/lib/categorias/descarte'
import { resolverCicloDeCompra } from '@/lib/ciclos/resolver';
import { cicloNEsimo, type CreditCardCycle } from '@/lib/finance/cycles';

type ActionResponse = {
  error?: string;
  success?: boolean;
};

export async function createInstallmentPlan(data: CreateInstallmentPlanSchema): Promise<ActionResponse> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'No autorizado' };
    }

    const validatedFields = createInstallmentPlanSchema.safeParse(data);

    if (!validatedFields.success) {
      return { error: 'Datos inválidos' };
    }

    const { description, total_amount, installments_count, purchase_date, category_id, payment_method_id } = validatedFields.data;
    const finalPaymentMethodId = payment_method_id && payment_method_id !== 'none' ? payment_method_id : null;

    // `purchase_date` ya llega como 'yyyy-MM-dd' (el schema lo valida con regex): se usa
    // TAL CUAL. El round trip `dateToLocalString(new Date(purchase_date))` que había acá
    // perdía un día en runtimes con TZ negativa (`new Date('2026-07-15')` = medianoche UTC
    // = 14-jul en Argentina), y esta fecha decide `cicloDeCompra` (E16) además de quedar
    // persistida en `purchase_date` de las cuotas.
    const purchaseDateStr = purchase_date;

    // Calcular la fecha de la primera cuota:
    // - Crédito: aplica lógica de ciclo de tarjeta (fecha de vencimiento del ciclo correspondiente)
    // - Débito/efectivo: se usa la fecha de compra directamente
    let firstInstallmentDateStr: string;
    let ciclosDelPlan: CreditCardCycle[] = [];
    let cicloInicial: CreditCardCycle | undefined;
    if (finalPaymentMethodId) {
      const { data: pm } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('id', finalPaymentMethodId)
        .eq('user_id', user.id)
        .single();

      // El medio tiene que ser del usuario (M4): sin el filtro, un id ajeno se
      // trataba como no-crédito y el plan quedaba con una FK a un medio de otro.
      if (!pm) return { error: 'Medio de pago inválido' };

      if (pm.type === 'credit') {
        // Hasta el ultimo resumen que el plan necesita, mas uno de margen.
        const r = await resolverCicloDeCompra(supabase, pm, purchaseDateStr, installments_count + 1);
        ciclosDelPlan = r.ciclos;
        cicloInicial = r.ciclo;
        firstInstallmentDateStr = r.dueDate;
      } else {
        firstInstallmentDateStr = purchaseDateStr;
      }
    } else {
      firstInstallmentDateStr = purchaseDateStr;
    }

    // 1. Crear el plan de cuotas
    const { data: plan, error: planError } = await supabase
      .from('installment_plans')
      .insert({
        user_id: user.id,
        description,
        total_amount,
        installments_count,
        purchase_date: purchaseDateStr,
        category_id,
        payment_method_id: finalPaymentMethodId,
      })
      .select('id')
      .single();

    if (planError || !plan) {
      console.error('Error creating installment plan:', planError);
      return { error: 'Error al crear el plan de cuotas' };
    }

    // 2. Crear las transacciones asociadas (una por cuota)
    // La cuota i va al i-esimo RESUMEN. Antes se sumaban meses a la primera, que
    // con ciclos desparejos da fechas que la tarjeta no tiene (4-sep + 1 mes = 4-oct,
    // cuando el resumen siguiente vence el 9-oct).
    const installmentAmount = total_amount / installments_count;
    const transactions = Array.from({ length: installments_count }, (_, i) => {
      const ciclo = cicloInicial ? cicloNEsimo(ciclosDelPlan, cicloInicial, i) : undefined;
      return {
        user_id: user.id,
        description: `${description} (${i + 1}/${installments_count})`,
        amount: installmentAmount,
        date: ciclo ? ciclo.due_date : formatLocalDate(addMonths(parseLocalDate(firstInstallmentDateStr), i)),
        purchase_date: purchaseDateStr,
        cycle_id: ciclo?.id ?? null,
        type: 'expense' as const,
        category_id,
        installment_plan_id: plan.id,
        payment_method_id: finalPaymentMethodId,
      };
    });

    const { error: txError } = await supabase
      .from('transactions')
      .insert(transactions);

    if (txError) {
      console.error('Error creating installment transactions:', txError);
      // Rollback: eliminar el plan creado
      await supabase.from('installment_plans').delete().eq('id', plan.id);
      return { error: 'Error al crear las cuotas. El plan fue revertido.' };
    }

    revalidatePath('/compromisos');
    revalidatePath('/movimientos');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { error: 'Ocurrió un error inesperado' };
  }
}

export async function updateInstallmentPlan(id: string, data: InstallmentPlanSchema): Promise<ActionResponse> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'No autorizado' };
    }

    const validatedFields = installmentPlanSchema.safeParse(data);

    if (!validatedFields.success) {
      return { error: 'Datos inválidos' };
    }

    const { description, category_id } = validatedFields.data;
    // `category_id` es NOT NULL: el campo vacío no puede guardarse como `null`
    // (23502 → "Error al actualizar el plan de cuotas"), va a la de descarte.
    const finalCategoryId =
      category_id === '' || category_id == null
        ? await getOrCreateCategoriaDescarte(supabase, user.id, 'expense')
        : category_id;

    if (!finalCategoryId) {
      return { error: 'No se pudo preparar la categoría «Sin categoría»' };
    }

    // 1. Actualizar el plan de cuotas
    const { error: planError } = await supabase
      .from('installment_plans')
      .update({
        description,
        category_id: finalCategoryId,
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (planError) {
      console.error('Error updating installment plan:', planError);
      return { error: 'Error al actualizar el plan de cuotas' };
    }

    // 2. Actualizar todas las transacciones asociadas
    // Obtenemos las transacciones actuales para preservar el sufijo (X/Y) si existe
    const { data: transactions, error: fetchError } = await supabase
      .from('transactions')
      .select('id, description')
      .eq('installment_plan_id', id)
      .eq('user_id', user.id);

    if (fetchError) {
      console.error('Error fetching associated transactions:', fetchError);
    } else if (transactions) {
      // Actualizamos cada transacción para mantener su sufijo individual
      const updatePromises = transactions.map(tx => {
        let newTxDescription = description;

        // Intentar extraer el sufijo (X/Y) o similar al final
        const suffixMatch = tx.description.match(/\s\(\d+\/\d+\)$/);
        if (suffixMatch) {
          newTxDescription += suffixMatch[0];
        }

        return supabase
          .from('transactions')
          .update({
            description: newTxDescription,
            category_id: finalCategoryId,
          })
          .eq('id', tx.id)
          .eq('user_id', user.id);
      });

      await Promise.all(updatePromises);
    }

    revalidatePath('/compromisos');
    revalidatePath('/movimientos');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { error: 'Ocurrió un error inesperado' };
  }
}

export async function deleteInstallmentPlan(id: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'No autorizado' };
    }

    // Note: Assuming ON DELETE CASCADE is set up in the database for transactions linked to installment_plans.
    // If not, we would need to delete transactions first.
    // Based on typical Supabase setups, foreign keys often have cascade, but let's be safe.
    // If it fails due to FK constraint, we might need to manually delete transactions.
    // Let's try deleting the plan directly first.

    const { error } = await supabase
      .from('installment_plans')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting installment plan:', error);
      // Check for foreign key violation if cascade isn't set
      if (error.code === '23503') {
         // Fallback: Delete transactions first manually if cascade is missing
         const { error: transError } = await supabase
            .from('transactions')
            .delete()
            .eq('installment_plan_id', id)
            .eq('user_id', user.id);

         if (transError) {
             console.error('Error deleting associated transactions:', transError);
             return { error: 'Error al eliminar las cuotas asociadas' };
         }

         // Retry deleting the plan
         const { error: retryError } = await supabase
            .from('installment_plans')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

         if (retryError) {
             return { error: 'Error al eliminar el plan tras borrar cuotas' };
         }
      } else {
          return { error: 'Error al eliminar el plan de cuotas' };
      }
    }

    revalidatePath('/compromisos');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { error: 'Ocurrió un error inesperado' };
  }
}
