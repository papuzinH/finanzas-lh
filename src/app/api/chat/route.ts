/**
 * POST /api/chat
 *
 * Endpoint del asistente Chanchito. Motor agéntico (Task 14): el modelo resuelve
 * transacciones, cuotas, mensualidades, configuraciones, objetivos/presupuestos y
 * consultas llamando a las tools de `lib/ai/tools/registry.ts` vía function calling
 * (`runAgent`), en vez del viejo pipeline one-shot de intención → JSON estructurado.
 *
 * Body:
 *   {
 *     "message": "Compré un celular en 6 cuotas de 5000 con Visa",
 *     "history": [{ "role": "user" | "chanchito", "content": "..." }]
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "message": "✅ Compra en 6 cuotas registrada...",
 *     "mutated": true
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { runAgent, createGeminiModel, type AgentHistoryMessage } from '@/lib/ai/agent'
import { buildAgentPrompt } from '@/lib/ai/agentPrompt'
import type { AgentContext } from '@/lib/ai/tools/types'
import { checkAndIncrementUsage, accumulateBudget, type UsageCheckResult } from '@/lib/chat/usageGuard'
import { todayString } from '@/lib/utils/dates'

export const maxDuration = 60

/**
 * Trunca el historial de conversación a los últimos N mensajes
 * y máximo maxChars caracteres totales (para no exceder ventana de contexto).
 */
function truncateHistory(
  history: Array<{ role: 'user' | 'chanchito'; content: string }>,
  maxMessages: number,
  maxChars: number
): AgentHistoryMessage[] {
  // Tomar los últimos N mensajes
  const recent = history.slice(-maxMessages)

  // Truncar por caracteres totales (de más reciente a más antiguo)
  let totalChars = 0
  const result: AgentHistoryMessage[] = []

  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i]
    const charCount = msg.content.length + (msg.role === 'user' ? 9 : 12) // "USUARIO: " o "ASISTENTE: "
    if (totalChars + charCount > maxChars) break
    totalChars += charCount
    result.unshift({ role: msg.role, content: msg.content })
  }

  return result
}

export async function POST(req: NextRequest) {
  try {
    // 1. Autenticar usuario con Supabase Auth
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
    const { message, history } = body as {
      message: string
      history?: Array<{ role: 'user' | 'chanchito'; content: string }>
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
    }

    // 3. Obtener user_id numérico de la tabla users (Auth devuelve UUID)
    // IMPORTANTE: Necesitamos el user_id numérico para las inserciones
    const { data: dbUser, error: userFetchError } = await supabase
      .from('users')
      .select('id, chat_tier, first_name')
      .limit(1)
      .single()

    if (userFetchError || !dbUser) {
      console.error('Error fetching user:', userFetchError)
      return NextResponse.json({ error: 'Usuario no encontrado en base de datos' }, { status: 404 })
    }

    const userId = dbUser.id
    const tier = (dbUser.chat_tier === 'pro' ? 'pro' : 'free') as 'free' | 'pro'

    // Verificar cuota antes de llamar a Gemini
    let usageStatus: UsageCheckResult
    try {
      usageStatus = await checkAndIncrementUsage(supabase, userId, tier)
    } catch (err) {
      console.error('Error checking chat usage:', err)
      // Si el guard falla, dejamos pasar (fail open) para no romper UX
      usageStatus = 'ok' as UsageCheckResult
    }

    if (usageStatus === 'budget_exceeded') {
      return NextResponse.json(
        { success: false, message: 'El asistente está descansando un rato, probá más tarde 🐷' },
        { status: 429 }
      )
    }

    if (usageStatus === 'user_limit_exceeded') {
      return NextResponse.json(
        { success: false, message: 'Llegaste a tu límite diario de mensajes. Mañana se renueva, o pasate a Pro para más 🚀' },
        { status: 429 }
      )
    }

    // 4. Categorías y medios de pago para el prompt del agente.
    // categories.user_id es UUID (Task 7 Step 0): mismo criterio `.or(...)` que usaba
    // el viejo goalContext y que usa `loadFinanceData` (tools/dataLoader.ts), para
    // traer también las categorías del sistema. payment_methods.user_id es numérico.
    const [{ data: categories }, { data: methods }] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name, emoji, type')
        .or(`user_id.eq.${user.id},is_system.eq.true`),
      supabase.from('payment_methods').select('name, type, is_default').eq('user_id', userId),
    ])

    // 5. Detectar tarjetas que necesitan actualización de fechas
    let cardAlerts: string[] = []
    try {
      const { data: creditCards } = await supabase
        .from('payment_methods')
        .select('name, default_payment_day')
        .eq('user_id', userId)
        .eq('type', 'credit')

      const now = new Date()
      const todayDay = now.getDate()

      const cardsNeedingUpdate = (creditCards || []).filter((m: { name: string; default_payment_day: number | null }) => {
        if (!m.default_payment_day) return false
        const paymentDay = m.default_payment_day
        if (todayDay === paymentDay + 1) return true
        if (todayDay === 1) {
          const lastDayOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
          return paymentDay >= lastDayOfPrevMonth
        }
        return false
      })

      cardAlerts = cardsNeedingUpdate.map((m: { name: string; default_payment_day: number }) =>
        `La tarjeta "${m.name}" venció ayer (día ${m.default_payment_day}). Recordale al usuario que debe actualizar las fechas de cierre y vencimiento para el próximo ciclo.`
      )
    } catch {
      // Non-blocking
    }

    // 6. Construir contexto del agente y correr el loop de function calling
    const ctx: AgentContext = { supabase, userId, authUserId: user.id, today: todayString() }
    const systemInstruction = buildAgentPrompt({
      categories: (categories ?? []).map((c: { id: string; name: string; emoji: string | null; type: 'income' | 'expense' }) => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        type: c.type,
      })),
      paymentMethods: (methods ?? []).map((m: { name: string; type: string; is_default: boolean }) => ({
        name: m.name,
        type: m.type,
        isDefault: m.is_default,
      })),
      today: ctx.today,
      cardAlerts,
      userName: dbUser.first_name ?? null,
    })
    const model = createGeminiModel(process.env.GOOGLE_API_KEY || '')

    const result = await runAgent({
      message,
      history: truncateHistory(history || [], 10, 2000),
      ctx,
      model,
      systemInstruction,
    })

    // 7. Acumular presupuesto de tokens (input + output de TODO el loop de tools)
    try {
      await accumulateBudget(supabase, result.inputTokens, result.outputTokens)
    } catch (err) {
      console.error('accumulateBudget failed:', err)
    }

    // 8. Retornar respuesta
    return NextResponse.json({ success: true, message: result.message, mutated: result.mutated })
  } catch (error) {
    console.error('Unexpected error in chat API:', error)
    return NextResponse.json(
      { error: 'Error inesperado al procesar el mensaje' },
      { status: 500 }
    )
  }
}
