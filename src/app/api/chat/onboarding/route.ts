/**
 * POST /api/chat/onboarding
 *
 * Endpoint para procesar mensajes del chat de onboarding.
 * Cada mensaje se procesa según el paso actual del flujo.
 *
 * Body:
 *   {
 *     "message": "Juan",
 *     "step": "name",
 *     "context": { "proposedCategories": [...], "savedPaymentMethods": [...] }
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "message": "¡Un gusto, Juan! ...",
 *     "step": "name",
 *     "nextStep": "categories",
 *     "data": { ... }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { handleOnboardingStep } from '@/lib/ai/onboardingHandlers'
import type { OnboardingStep, OnboardingContext } from '@/lib/ai/onboardingTypes'

const VALID_STEPS: OnboardingStep[] = [
  'name',
  'categories',
  'confirm_categories',
  'payment_methods',
  'default_payment',
]

export async function POST(req: NextRequest) {
  try {
    // 1. Autenticar
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // 2. Parsear body
    const body = await req.json()
    const { message, step, context } = body as {
      message: string
      step: OnboardingStep
      context?: OnboardingContext
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
    }

    if (!step || !VALID_STEPS.includes(step)) {
      return NextResponse.json({ error: 'Paso de onboarding inválido' }, { status: 400 })
    }

    // 3. Obtener user_id numérico
    const { data: dbUser, error: userFetchError } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .single()

    if (userFetchError || !dbUser) {
      console.error('Error fetching user:', userFetchError)
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // 4. Procesar paso de onboarding
    const response = await handleOnboardingStep(
      step,
      message.trim(),
      dbUser.id,
      user.id,
      context
    )

    return NextResponse.json(response)
  } catch (error) {
    console.error('Unexpected error in onboarding chat API:', error)
    return NextResponse.json(
      { error: 'Error inesperado al procesar el mensaje' },
      { status: 500 }
    )
  }
}
