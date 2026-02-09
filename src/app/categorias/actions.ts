'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { categorySchema } from '@/lib/schemas/category'

export async function createCategory(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const rawData = {
    name: formData.get('name'),
    emoji: formData.get('emoji'),
    description: formData.get('description'),
  }

  const validated = categorySchema.safeParse(rawData)

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

  revalidatePath('/categorias')
  revalidatePath('/dashboard/categories')
  return { success: true }
}