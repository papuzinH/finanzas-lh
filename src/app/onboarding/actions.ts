'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { GoogleGenAI } from '@google/genai'

type OnboardingCategoryInput = {
  emoji: string
  name: string
  description?: string | null
}

type OnboardingPaymentMethodInput = {
  name: string
  type: 'credit' | 'debit' | 'cash'
  default_closing_day?: number | null
  default_payment_day?: number | null
}

type ActionResponse<T = void> = {
  success?: boolean
  error?: string
  data?: T
}

// =============================================================================
// 1. GUARDAR NOMBRE
// =============================================================================
export async function saveOnboardingName(name: string): Promise<ActionResponse> {
  try {
    const trimmed = (name || '').trim()
    if (!trimmed) return { error: 'Necesito un nombre para llamarte 🙂' }
    if (trimmed.length > 50) return { error: 'El nombre es muy largo (máximo 50 caracteres)' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { error } = await supabase
      .from('users')
      .update({ first_name: trimmed })
      .eq('id', user.id)

    if (error) {
      console.error('Error saving onboarding name:', error)
      return { error: 'No se pudo guardar el nombre. Intentá de nuevo.' }
    }

    return { success: true }
  } catch (err) {
    console.error('Unexpected error in saveOnboardingName:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}

// =============================================================================
// 2. GUARDAR CATEGORÍAS (batch)
// =============================================================================
// Inserta todas las categorías de una vez. Borra las custom previas del usuario
// para que el onboarding sea idempotente si se reinicia.
const DEFAULT_ONBOARDING_INCOME_CATEGORIES = [
  { name: 'Sueldo', emoji: '💰', description: 'Sueldo, honorarios, pagos fijos de trabajo en relación de dependencia o autónomo.' },
  { name: 'Freelance / Otros ingresos', emoji: '📈', description: 'Trabajos independientes, ventas, regalos en dinero y cualquier otro ingreso no fijo.' },
] as const

export async function saveOnboardingCategories(
  categories: OnboardingCategoryInput[]
): Promise<ActionResponse> {
  try {
    if (!Array.isArray(categories) || categories.length === 0) {
      return { error: 'Necesito al menos una categoría' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    // Limpiar categorías custom previas (idempotencia)
    await supabase
      .from('categories')
      .delete()
      .eq('user_id', user.id)
      .eq('is_system', false)

    const expenseRows = categories.map((c) => ({
      user_id: user.id,
      name: c.name.trim(),
      emoji: c.emoji,
      description: (c.description || '').trim() || null,
      is_system: false,
      type: 'expense' as const,
    }))

    // Las categorías del slide de onboarding son siempre de gasto; se suman
    // categorías de ingreso por defecto para que el selector de "Ingreso"
    // nunca quede vacío en el primer uso.
    const incomeRows = DEFAULT_ONBOARDING_INCOME_CATEGORIES.map((c) => ({
      user_id: user.id,
      name: c.name,
      emoji: c.emoji,
      description: c.description,
      is_system: false,
      type: 'income' as const,
    }))

    const { error } = await supabase.from('categories').insert([...expenseRows, ...incomeRows])
    if (error) {
      console.error('Error inserting onboarding categories:', error)
      return { error: 'No se pudieron guardar las categorías. Intentá de nuevo.' }
    }

    revalidatePath('/categorias')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in saveOnboardingCategories:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}

// =============================================================================
// 3. GUARDAR MEDIOS DE PAGO (batch) + default
// =============================================================================
export async function saveOnboardingPaymentMethods(
  methods: OnboardingPaymentMethodInput[],
  defaultMethodName?: string | null
): Promise<ActionResponse<{ defaultMethodId: number | null }>> {
  try {
    if (!Array.isArray(methods) || methods.length === 0) {
      return { error: 'Necesito al menos un medio de pago' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    // Limpiar medios previos (idempotencia)
    await supabase
      .from('payment_methods')
      .delete()
      .eq('user_id', user.id)

    const rows = methods.map((m) => ({
      user_id: user.id,
      name: m.name.trim(),
      type: m.type,
      default_closing_day: m.type === 'credit' ? (m.default_closing_day ?? null) : null,
      default_payment_day: m.type === 'credit' ? (m.default_payment_day ?? null) : null,
      is_personal: false,
    }))

    const { data: inserted, error } = await supabase
      .from('payment_methods')
      .insert(rows)
      .select('id, name')

    if (error || !inserted) {
      console.error('Error inserting onboarding payment methods:', error)
      return { error: 'No se pudieron guardar los medios de pago. Intentá de nuevo.' }
    }

    // Marcar el default si se especificó (vía flag is_default en payment_methods)
    let defaultId: number | null = null
    if (defaultMethodName) {
      const match = inserted.find(
        (m) => m.name.toLowerCase() === defaultMethodName.trim().toLowerCase()
      )
      if (match) {
        defaultId = match.id
        // Reset todos a no-default, luego marcar el elegido
        await supabase
          .from('payment_methods')
          .update({ is_default: false } as Record<string, unknown>)
          .eq('user_id', user.id)
        await supabase
          .from('payment_methods')
          .update({ is_default: true } as Record<string, unknown>)
          .eq('id', match.id)
      }
    }

    revalidatePath('/medios-pago')
    return { success: true, data: { defaultMethodId: defaultId } }
  } catch (err) {
    console.error('Unexpected error in saveOnboardingPaymentMethods:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}

// =============================================================================
// 4. MARCAR ONBOARDING COMO COMPLETO
// =============================================================================
export async function completeOnboarding(): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { error } = await supabase
      .from('users')
      .update({ onboarding_completed: true })
      .eq('id', user.id)

    if (error) {
      console.error('Error completing onboarding:', error)
      return { error: 'No se pudo finalizar el setup' }
    }

    revalidatePath('/')
    return { success: true }
  } catch (err) {
    console.error('Unexpected error in completeOnboarding:', err)
    return { error: 'Ocurrió un error inesperado' }
  }
}

// =============================================================================
// 5. SUGERIR CATEGORÍAS CON IA (opcional, "Personalizar con IA")
// =============================================================================
// El usuario describe sus gastos en lenguaje natural y la IA propone categorías
// que reemplazan o complementan las default. El resultado se devuelve para que
// el cliente lo renderice como chips editables, NO para guardarlo automáticamente.
export async function suggestCategoriesFromDescription(
  description: string
): Promise<ActionResponse<{ categories: Array<{ emoji: string; name: string; description: string }> }>> {
  try {
    const trimmed = (description || '').trim()
    if (trimmed.length < 3) {
      return { error: 'Contame un poco más sobre tus gastos para poder sugerirte categorías' }
    }

    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      return { error: 'La IA no está configurada. Podés agregar categorías manualmente.' }
    }

    const ai = new GoogleGenAI({ apiKey })

    const systemPrompt = `Sos un asistente financiero argentino. El usuario describe sus gastos típicos en lenguaje natural. Generá una lista de 5 a 10 categorías personalizadas.

Devolvé EXCLUSIVAMENTE un JSON con esta estructura:
{
  "categories": [
    { "emoji": "🛒", "name": "Supermercado", "description": "Compras de alimentos, bebidas y artículos de limpieza." }
  ]
}

Reglas:
- Cada categoría: emoji representativo, nombre corto (1-2 palabras), descripción detallada (la usa una IA para clasificar gastos futuros).
- Si el usuario es vago, usá categorías genéricas argentinas: Supermercado, Transporte, Salidas, Hogar, Salud, Mensualidades, Entretenimiento.
- No agregues texto fuera del JSON.
- JSON válido siempre.`

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: trimmed }] }],
      config: {
        systemInstruction: { role: 'user', parts: [{ text: systemPrompt }] },
      },
    })

    const raw = result.text ?? ''
    const cleaned = raw.replace(/```json|```/g, '').trim()

    let parsed: { categories?: Array<{ emoji?: string; name?: string; description?: string }> }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('IA returned invalid JSON:', raw)
      return { error: 'No pude generar las categorías. Probá describiendo tus gastos de otra forma.' }
    }

    const cats = (parsed.categories || [])
      .filter((c) => c.name && c.emoji)
      .map((c) => ({
        emoji: c.emoji as string,
        name: c.name as string,
        description: (c.description || '').trim(),
      }))

    if (cats.length === 0) {
      return { error: 'No pude generar categorías. Intentá de nuevo describiendo más en detalle.' }
    }

    return { success: true, data: { categories: cats } }
  } catch (err) {
    console.error('Unexpected error in suggestCategoriesFromDescription:', err)
    return { error: 'Error al consultar la IA. Probá de nuevo o cargá las categorías manualmente.' }
  }
}
