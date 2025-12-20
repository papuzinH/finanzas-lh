'use server';

import { createClient } from '@/utils/supabase/server';
import { installmentPlanSchema, type InstallmentPlanSchema } from '@/lib/schemas/installment-plan';
import { revalidatePath } from 'next/cache';

type ActionResponse = {
  error?: string;
  success?: boolean;
};

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
    const finalCategoryId = category_id === '' ? null : category_id;

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

    revalidatePath('/cuotas');
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

    revalidatePath('/cuotas');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { error: 'Ocurrió un error inesperado' };
  }
}
