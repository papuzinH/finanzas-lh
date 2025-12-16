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

    const { description, category } = validatedFields.data;

    const { error } = await supabase
      .from('installment_plans')
      .update({
        description,
        category,
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating installment plan:', error);
      return { error: 'Error al actualizar el plan de cuotas' };
    }

    revalidatePath('/cuotas');
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
