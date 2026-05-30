'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { categorySchema, type CategoryFormValues } from '@/lib/schemas/category'

function revalidateAll() {
  revalidatePath('/categorias')
  revalidatePath('/dashboard/categories')
}

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

  revalidateAll()
  return { success: true }
}

export async function updateCategory(id: string, data: CategoryFormValues) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const validated = categorySchema.safeParse(data)
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { transactions: 0, installmentPlans: 0, recurringPlans: 0, total: 0 }

  // Restringimos al usuario autenticado para evitar contar/editar datos de otro usuario.
  const { data: dbUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!dbUser) return { transactions: 0, installmentPlans: 0, recurringPlans: 0, total: 0 }

  const [{ count: txCount }, { count: planCount }, { count: recurringCount }] = await Promise.all([
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('category_id', id).eq('user_id', dbUser.id),
    supabase.from('installment_plans').select('id', { count: 'exact', head: true }).eq('category_id', id).eq('user_id', dbUser.id),
    supabase.from('recurring_plans').select('id', { count: 'exact', head: true }).eq('category_id', id).eq('user_id', dbUser.id),
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

  // Restringimos al usuario autenticado para evitar actualizar datos de otro usuario.
  const { data: dbUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!dbUser) return { error: 'Usuario no encontrado' }

  await Promise.all([
    supabase.from('transactions').update({ category_id: newCategoryId }).eq('category_id', id).eq('user_id', dbUser.id),
    supabase.from('installment_plans').update({ category_id: newCategoryId }).eq('category_id', id).eq('user_id', dbUser.id),
    supabase.from('recurring_plans').update({ category_id: newCategoryId }).eq('category_id', id).eq('user_id', dbUser.id),
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

  // Restringimos al usuario autenticado para evitar actualizar datos de otro usuario.
  const { data: dbUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!dbUser) return { error: 'Usuario no encontrado' }

  await Promise.all([
    supabase.from('transactions').update({ category_id: null }).eq('category_id', id).eq('user_id', dbUser.id),
    supabase.from('installment_plans').update({ category_id: null }).eq('category_id', id).eq('user_id', dbUser.id),
    supabase.from('recurring_plans').update({ category_id: null }).eq('category_id', id).eq('user_id', dbUser.id),
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

  if (error) {
    if (error.code === '23503') {
      return { error: 'No se puede eliminar la categoría porque tiene movimientos asociados. Reasigná o desvinculá antes de borrar.' }
    }
    return { error: error.message }
  }

  revalidateAll()
  return { success: true }
}