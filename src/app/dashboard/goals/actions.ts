'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { savingsGoalSchema, savingsGoalContributionSchema } from '@/lib/schemas/savings-goal'
import { categoryBudgetSchema } from '@/lib/schemas/category-budget'

// ============================================================
// METAS DE AHORRO
// ============================================================

export async function createSavingsGoal(data: { name: string; type: string; target_amount: number; currency: string; target_date: string | null }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const validated = savingsGoalSchema.safeParse(data)
  if (!validated.success) return { error: validated.error.issues[0].message }

  const { error } = await supabase.from('savings_goals').insert({
    user_id: user.id,
    ...validated.data,
  })

  if (error) return { error: error.message }

  revalidatePath('/objetivos')
  return { success: true }
}

export async function updateSavingsGoal(id: string, data: { name: string; type: string; target_amount: number; currency: string; target_date: string | null }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const validated = savingsGoalSchema.safeParse(data)
  if (!validated.success) return { error: validated.error.issues[0].message }

  const { error } = await supabase
    .from('savings_goals')
    .update(validated.data)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/objetivos')
  return { success: true }
}

export async function deleteSavingsGoal(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { error } = await supabase
    .from('savings_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/objetivos')
  return { success: true }
}

// ============================================================
// APORTES A METAS
// ============================================================

export async function addGoalContribution(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const rawData = {
    goal_id: formData.get('goal_id') as string,
    amount: Number(formData.get('amount')),
    currency: formData.get('currency') as string,
    note: (formData.get('note') as string) || null,
    date: formData.get('date') as string,
  }

  const validated = savingsGoalContributionSchema.safeParse(rawData)
  if (!validated.success) return { error: validated.error.issues[0].message }

  const { error } = await supabase.from('savings_goal_contributions').insert({
    user_id: user.id,
    ...validated.data,
  })

  if (error) return { error: error.message }

  revalidatePath('/objetivos')
  return { success: true }
}

export async function completeGoal(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { error } = await supabase
    .from('savings_goals')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/objetivos')
  return { success: true }
}

export async function deleteGoalContribution(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { error } = await supabase
    .from('savings_goal_contributions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/objetivos')
  return { success: true }
}

// ============================================================
// PRESUPUESTOS POR CATEGORÍA
// ============================================================

export async function createCategoryBudget(data: { category_id: string; amount: number; currency: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const validated = categoryBudgetSchema.safeParse(data)
  if (!validated.success) return { error: validated.error.issues[0].message }

  const { error } = await supabase.from('category_budgets').upsert(
    {
      user_id: user.id,
      ...validated.data,
      is_active: true,
    },
    { onConflict: 'user_id,category_id' }
  )

  if (error) return { error: error.message }

  revalidatePath('/objetivos')
  return { success: true }
}

export async function updateCategoryBudget(id: string, data: { category_id: string; amount: number; currency: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const validated = categoryBudgetSchema.safeParse(data)
  if (!validated.success) return { error: validated.error.issues[0].message }

  const { error } = await supabase
    .from('category_budgets')
    .update(validated.data)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/objetivos')
  return { success: true }
}

export async function deleteCategoryBudget(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { error } = await supabase
    .from('category_budgets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/objetivos')
  return { success: true }
}
