'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { savingsGoalSchema, savingsGoalContributionSchema } from '@/lib/schemas/savings-goal'
import { categoryBudgetSchema } from '@/lib/schemas/category-budget'

// ============================================================
// METAS DE AHORRO
// ============================================================

export async function createSavingsGoal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const rawData = {
    name: formData.get('name') as string,
    type: formData.get('type') as string,
    target_amount: Number(formData.get('target_amount')),
    currency: formData.get('currency') as string,
    target_date: (formData.get('target_date') as string) || null,
  }

  const validated = savingsGoalSchema.safeParse(rawData)
  if (!validated.success) return { error: validated.error.issues[0].message }

  const { error } = await supabase.from('savings_goals').insert({
    user_id: user.id,
    ...validated.data,
  })

  if (error) return { error: error.message }

  revalidatePath('/objetivos')
  return { success: true }
}

export async function updateSavingsGoal(id: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const rawData = {
    name: formData.get('name') as string,
    type: formData.get('type') as string,
    target_amount: Number(formData.get('target_amount')),
    currency: formData.get('currency') as string,
    target_date: (formData.get('target_date') as string) || null,
  }

  const validated = savingsGoalSchema.safeParse(rawData)
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

export async function createCategoryBudget(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const rawData = {
    category_id: formData.get('category_id') as string,
    amount: Number(formData.get('amount')),
    currency: formData.get('currency') as string,
  }

  const validated = categoryBudgetSchema.safeParse(rawData)
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

export async function updateCategoryBudget(id: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const rawData = {
    category_id: formData.get('category_id') as string,
    amount: Number(formData.get('amount')),
    currency: formData.get('currency') as string,
  }

  const validated = categoryBudgetSchema.safeParse(rawData)
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
