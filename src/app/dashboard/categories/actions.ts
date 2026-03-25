'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { categorySchema, type CategoryFormValues } from '@/lib/schemas/category'

export async function createCategory(data: CategoryFormValues) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const validated = categorySchema.safeParse(data)

  if (!validated.success) {
    return { error: validated.error.issues[0].message }
  }

  const { error } = await supabase
    .from('categories')
    .insert({
      user_id: user.id,
      ...validated.data,
      is_system: false
    })

  if (error) return { error: error.message }

  revalidatePath('/dashboard/categories')
  revalidatePath('/categorias')
  return { success: true }
}