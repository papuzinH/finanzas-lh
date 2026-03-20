/**
 * Handlers para ejecutar operaciones de base de datos durante el onboarding.
 * Cada handler corresponde a un paso del flujo conversacional.
 */

import { createClient } from '@/utils/supabase/server'
import type {
  OnboardingStep,
  OnboardingResponse,
  ProposedCategory,
  SavedPaymentMethod,
  OnboardingContext,
} from './onboardingTypes'
import { buildOnboardingPrompt } from './onboardingPrompt'
import { GoogleGenerativeAI } from '@google/generative-ai'

// --- Helpers ---

function parseGeminiJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json|```/g, '').trim()
  return JSON.parse(cleaned)
}

async function callGemini(systemPrompt: string, userMessage: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '')
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    systemInstruction: { role: 'user', parts: [{ text: systemPrompt }] },
  })

  return result.response.text()
}

// --- Main dispatcher ---

export async function handleOnboardingStep(
  step: OnboardingStep,
  message: string,
  userId: number,
  authUserId: string,
  context?: OnboardingContext
): Promise<OnboardingResponse> {
  switch (step) {
    case 'name':
      return handleName(message, userId)
    case 'categories':
      return handleCategories(message)
    case 'confirm_categories':
      return handleConfirmCategories(message, userId, authUserId, context)
    case 'payment_methods':
      return handlePaymentMethods(message, userId)
    case 'default_payment':
      return handleDefaultPayment(message, userId, context)
  }
}

// --- Step handlers ---

async function handleName(message: string, userId: number): Promise<OnboardingResponse> {
  try {
    const prompt = buildOnboardingPrompt('name')
    const geminiText = await callGemini(prompt, message)
    const parsed = parseGeminiJson(geminiText) as { name: string }

    const name = parsed.name?.trim()
    if (!name) {
      return {
        success: false,
        message: 'No pude entender tu nombre. ¿Podés decirme cómo te llamás?',
        step: 'name',
      }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('users')
      .update({ first_name: name })
      .eq('id', userId)

    if (error) {
      console.error('Error saving name:', error)
      return { success: false, message: 'Error al guardar tu nombre. Intentá de nuevo.', step: 'name' }
    }

    return {
      success: true,
      message: `¡Un gusto, ${name}! 🐷\n\nAhora necesito saber qué categorías de gastos querés usar. Describime tus gastos típicos en tus palabras.\n\nPor ejemplo: *"Comida para delivery y super, nafta, salidas, ropa, gimnasio, streaming"*`,
      step: 'name',
      nextStep: 'categories',
    }
  } catch (error) {
    console.error('Error in handleName:', error)
    return { success: false, message: 'Error al procesar tu nombre. Intentá de nuevo.', step: 'name' }
  }
}

async function handleCategories(
  message: string,
): Promise<OnboardingResponse> {
  try {
    const prompt = buildOnboardingPrompt('categories')
    const geminiText = await callGemini(prompt, message)
    const parsed = parseGeminiJson(geminiText) as { categories: ProposedCategory[] }

    const categories = parsed.categories
    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return {
        success: false,
        message: 'No pude generar categorías con eso. Contame más sobre tus gastos típicos.',
        step: 'categories',
      }
    }

    const categoryList = categories
      .map(c => `${c.emoji} **${c.name}**: ${c.description}`)
      .join('\n')

    return {
      success: true,
      message: `Te propongo estas categorías:\n\n${categoryList}\n\n¿Te parecen bien? Decime **sí** o contame qué querés cambiar.`,
      step: 'categories',
      nextStep: 'confirm_categories',
      data: { categories },
    }
  } catch (error) {
    console.error('Error in handleCategories:', error)
    return {
      success: false,
      message: 'Error al procesar las categorías. Intentá describir tus gastos de otra forma.',
      step: 'categories',
    }
  }
}

async function handleConfirmCategories(
  message: string,
  userId: number,
  authUserId: string,
  context?: OnboardingContext
): Promise<OnboardingResponse> {
  try {
    const categories = context?.proposedCategories
    if (!categories || categories.length === 0) {
      return {
        success: false,
        message: 'No tengo categorías para confirmar. Describime tus gastos típicos.',
        step: 'categories',
      }
    }

    const prompt = buildOnboardingPrompt('confirm_categories', { proposedCategories: categories })
    const geminiText = await callGemini(prompt, message)
    const parsed = parseGeminiJson(geminiText) as { confirmed: boolean; adjustments?: string }

    if (!parsed.confirmed) {
      // Re-generate with adjustments
      const adjustmentMessage = `El usuario tenía estas categorías: ${categories.map(c => c.name).join(', ')}. Pidió estos cambios: ${parsed.adjustments || message}. Generá la lista actualizada.`
      return handleCategories(adjustmentMessage)
    }

    // Save categories to DB
    const supabase = await createClient()

    // Delete previous custom categories
    await supabase
      .from('categories')
      .delete()
      .eq('user_id', authUserId)
      .eq('is_system', false)

    // Insert new categories
    const categoriesToInsert = categories.map(c => ({
      user_id: authUserId,
      name: c.name,
      emoji: c.emoji,
      description: c.description,
      is_system: false,
    }))

    const { error: insertError } = await supabase
      .from('categories')
      .insert(categoriesToInsert)

    if (insertError) {
      console.error('Error inserting categories:', insertError)
      return { success: false, message: 'Error al guardar las categorías. Intentá de nuevo.', step: 'confirm_categories' }
    }

    return {
      success: true,
      message: `¡Categorías guardadas! 💾\n\nAhora necesito saber con qué medios pagás. Decime uno por uno:\n\n💳 *"Visa crédito cierra el 24 y vence el 5"*\n🏧 *"Mercado Pago débito"*\n💵 *"Efectivo"*\n\nCuando termines, decí **"Listo"**.`,
      step: 'confirm_categories',
      nextStep: 'payment_methods',
    }
  } catch (error) {
    console.error('Error in handleConfirmCategories:', error)
    return { success: false, message: 'Error al procesar tu respuesta. ¿Confirmás las categorías?', step: 'confirm_categories' }
  }
}

async function handlePaymentMethods(
  message: string,
  userId: number,
): Promise<OnboardingResponse> {
  try {
    const prompt = buildOnboardingPrompt('payment_methods')
    const geminiText = await callGemini(prompt, message)
    const parsed = parseGeminiJson(geminiText) as {
      intention: 'create' | 'finish'
      name?: string
      type?: 'credit' | 'debit' | 'cash'
      closing_day?: number | null
      payment_day?: number | null
    }

    if (parsed.intention === 'finish') {
      // User is done — fetch all payment methods and ask for default
      const supabase = await createClient()
      const { data: methods } = await supabase
        .from('payment_methods')
        .select('id, name, type, default_closing_day, default_payment_day')
        .eq('user_id', userId)

      if (!methods || methods.length === 0) {
        return {
          success: false,
          message: 'Todavía no tenés ningún medio de pago cargado. Decime al menos uno, por ejemplo: *"Efectivo"*',
          step: 'payment_methods',
        }
      }

      const allMethods: SavedPaymentMethod[] = methods.map(m => ({
        id: m.id,
        name: m.name,
        type: m.type as 'credit' | 'debit' | 'cash',
        closingDay: m.default_closing_day,
        paymentDay: m.default_payment_day,
      }))

      const methodList = allMethods.map(m => {
        const icon = m.type === 'credit' ? '💳' : m.type === 'debit' ? '🏧' : '💵'
        let text = `${icon} **${m.name}**`
        if (m.type === 'credit' && m.closingDay && m.paymentDay) {
          text += ` (Cierra: ${m.closingDay}, Vence: ${m.paymentDay})`
        }
        return text
      }).join('\n')

      return {
        success: true,
        message: `¡Perfecto! Tus medios de pago:\n\n${methodList}\n\n¿Cuál es el que más usás? Escribí su nombre.`,
        step: 'payment_methods',
        nextStep: 'default_payment',
        data: { allPaymentMethods: allMethods },
      }
    }

    // Create payment method
    if (!parsed.name || !parsed.type) {
      return {
        success: false,
        message: 'No pude entender el medio de pago. Probá con algo como: *"Visa crédito cierra el 24 y vence el 5"* o *"Efectivo"*',
        step: 'payment_methods',
      }
    }

    // Validate credit card has dates
    if (parsed.type === 'credit' && (!parsed.closing_day || !parsed.payment_day)) {
      return {
        success: false,
        message: `Para tarjetas de crédito necesito el día de cierre y vencimiento.\nProbá: *"${parsed.name} crédito cierra el XX y vence el YY"*`,
        step: 'payment_methods',
      }
    }

    const supabase = await createClient()
    const { data: newMethod, error: insertError } = await supabase
      .from('payment_methods')
      .insert({
        user_id: userId,
        name: parsed.name,
        type: parsed.type,
        default_closing_day: parsed.closing_day ?? null,
        default_payment_day: parsed.payment_day ?? null,
      })
      .select('id, name, type, default_closing_day, default_payment_day')
      .single()

    if (insertError || !newMethod) {
      console.error('Error inserting payment method:', insertError)
      return { success: false, message: 'Error al guardar el medio de pago. Intentá de nuevo.', step: 'payment_methods' }
    }

    const icon = parsed.type === 'credit' ? '💳' : parsed.type === 'debit' ? '🏧' : '💵'
    const typeLabel = parsed.type === 'credit' ? 'Crédito' : parsed.type === 'debit' ? 'Débito' : 'Efectivo'

    const savedMethod: SavedPaymentMethod = {
      id: newMethod.id,
      name: newMethod.name,
      type: newMethod.type as 'credit' | 'debit' | 'cash',
      closingDay: newMethod.default_closing_day,
      paymentDay: newMethod.default_payment_day,
    }

    return {
      success: true,
      message: `${icon} **${parsed.name}** (${typeLabel}) guardado. ¿Tenés otro? Si no, decí **"Listo"**.`,
      step: 'payment_methods',
      data: { paymentMethod: savedMethod },
    }
  } catch (error) {
    console.error('Error in handlePaymentMethods:', error)
    return { success: false, message: 'Error al procesar el medio de pago. Intentá de nuevo.', step: 'payment_methods' }
  }
}

async function handleDefaultPayment(
  message: string,
  userId: number,
  context?: OnboardingContext
): Promise<OnboardingResponse> {
  try {
    const methods = context?.savedPaymentMethods
    if (!methods || methods.length === 0) {
      return { success: false, message: 'No encontré medios de pago guardados.', step: 'default_payment' }
    }

    const prompt = buildOnboardingPrompt('default_payment', { savedPaymentMethods: methods })
    const geminiText = await callGemini(prompt, message)
    const parsed = parseGeminiJson(geminiText) as { payment_method_name: string }

    const chosenName = parsed.payment_method_name
    if (!chosenName) {
      return { success: false, message: 'No entendí cuál elegiste. Escribí el nombre del medio de pago.', step: 'default_payment' }
    }

    // Find matching method
    const supabase = await createClient()
    const { data: matchedMethod } = await supabase
      .from('payment_methods')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', `%${chosenName}%`)
      .limit(1)
      .single()

    if (!matchedMethod) {
      const availableNames = methods.map(m => m.name).join(', ')
      return {
        success: false,
        message: `No encontré "${chosenName}". Tus medios son: ${availableNames}. ¿Cuál elegís?`,
        step: 'default_payment',
      }
    }

    // Reset all defaults, then set the chosen one
    await supabase
      .from('payment_methods')
      .update({ is_default: false } as Record<string, unknown>)
      .eq('user_id', userId)

    await supabase
      .from('payment_methods')
      .update({ is_default: true } as Record<string, unknown>)
      .eq('id', matchedMethod.id)

    // Mark onboarding as complete
    await supabase
      .from('users')
      .update({ onboarding_completed: true })
      .eq('id', userId)

    return {
      success: true,
      message: `¡Listo el pollo! 🍗 Tu medio de pago principal es **${matchedMethod.name}**.\n\n¡Ya podés empezar a usar Chanchito! 🚀`,
      step: 'default_payment',
      data: { onboardingComplete: true },
    }
  } catch (error) {
    console.error('Error in handleDefaultPayment:', error)
    return { success: false, message: 'Error al configurar el medio de pago principal. Intentá de nuevo.', step: 'default_payment' }
  }
}
