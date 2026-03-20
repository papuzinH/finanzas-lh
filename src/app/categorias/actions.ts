'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { categorySchema } from '@/lib/schemas/category'

function revalidateAll() {
  revalidatePath('/categorias')
  revalidatePath('/dashboard/categories')
}

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

  revalidateAll()
  return { success: true }
}

export async function updateCategory(id: string, formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const rawData = {
    name: formData.get('name'),
    emoji: formData.get('emoji'),
    description: formData.get('description'),
  }

  const validated = categorySchema.safeParse(rawData)
  if (!validated.success) return { error: validated.error.issues[0].message }

  const { error } = await supabase
    .from('categories')
    .update(validated.data)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidateAll()
  return { success: true }
}

export async function getCategoryDependencies(id: string) {
  const supabase = await createClient()

  const [{ count: txCount }, { count: planCount }, { count: recurringCount }] = await Promise.all([
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('category_id', id),
    supabase.from('installment_plans').select('id', { count: 'exact', head: true }).eq('category_id', id),
    supabase.from('recurring_plans').select('id', { count: 'exact', head: true }).eq('category_id', id),
  ])

  return {
    transactions: txCount ?? 0,
    installmentPlans: planCount ?? 0,
    recurringPlans: recurringCount ?? 0,
    total: (txCount ?? 0) + (planCount ?? 0) + (recurringCount ?? 0),
  }
}

export async function deleteCategoryReassign(id: string, newCategoryId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  await Promise.all([
    supabase.from('transactions').update({ category_id: newCategoryId }).eq('category_id', id),
    supabase.from('installment_plans').update({ category_id: newCategoryId }).eq('category_id', id),
    supabase.from('recurring_plans').update({ category_id: newCategoryId }).eq('category_id', id),
  ])

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidateAll()
  return { success: true }
}

export async function deleteCategoryUnlink(id: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  await Promise.all([
    supabase.from('transactions').update({ category_id: null }).eq('category_id', id),
    supabase.from('installment_plans').update({ category_id: null }).eq('category_id', id),
    supabase.from('recurring_plans').update({ category_id: null }).eq('category_id', id),
  ])

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidateAll()
  return { success: true }
}

export async function deleteCategory(id: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidateAll()
  return { success: true }
}