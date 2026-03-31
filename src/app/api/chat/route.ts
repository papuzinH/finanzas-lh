/**
 * POST /api/chat
 *
 * Endpoint para procesar mensajes de chat usando Gemini AI.
 * Interpreta intenciones (transacciones, cuotas, suscripciones, configuraciones)
 * y guarda los datos en Supabase.
 *
 * Body:
 *   {
 *     "message": "Compré un celular en 6 cuotas de 5000 con Visa"
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "message": "✅ Compra en 6 cuotas registrada...",
 *     "data": {...}
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { buildChatPrompt, type ConversationMessage, type GoalContext } from '@/lib/ai/chatPrompt'
import { parseGeminiResponse } from '@/lib/ai/intentParser'
import { handleIntent } from '@/lib/ai/handlers'

/**
 * Trunca el historial de conversación a los últimos N mensajes
 * y máximo maxChars caracteres totales (para no exceder ventana de contexto).
 */
function truncateHistory(
  history: Array<{ role: 'user' | 'chanchito'; content: string }>,
  maxMessages: number,
  maxChars: number
): ConversationMessage[] {
  // Tomar los últimos N mensajes
  const recent = history.slice(-maxMessages)

  // Truncar por caracteres totales (de más reciente a más antiguo)
  let totalChars = 0
  const result: ConversationMessage[] = []

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
      .select('id')
      .limit(1)
      .single()

    if (userFetchError || !dbUser) {
      console.error('Error fetching user:', userFetchError)
      return NextResponse.json({ error: 'Usuario no encontrado en base de datos' }, { status: 404 })
    }

    const userId = dbUser.id

    // 4. Obtener categorías del usuario para construir el prompt
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('id, name, emoji')
      .eq('user_id', user.id)

    if (categoriesError) {
      console.error('Error fetching categories:', categoriesError)
      return NextResponse.json({ error: 'Error al cargar categorías' }, { status: 500 })
    }

    const userCategories = categories || []

    // 5b. Obtener contexto de objetivos para el prompt (non-blocking on error)
    let goalContext: GoalContext | undefined
    try {
      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const monthStart = `${currentMonth}-01`
      const today = now.toISOString().split('T')[0]

      const [
        { data: savingsGoalsData },
        { data: contributionsData },
        { data: budgetsData },
        { data: expensesData },
        { data: categoriesForBudget },
      ] = await Promise.all([
        supabase.from('savings_goals').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('savings_goal_contributions').select('*').eq('user_id', user.id),
        supabase.from('category_budgets').select('*, categories(name, emoji)').eq('user_id', user.id).eq('is_active', true),
        supabase.from('transactions').select('amount, category_id').eq('user_id', user.id).eq('type', 'expense').gte('date', monthStart).lte('date', today),
        supabase.from('categories').select('id, name, emoji').or(`user_id.eq.${user.id},is_system.eq.true`),
      ])

      const spentByCategory: Record<string, number> = {}
      expensesData?.forEach((t: any) => {
        spentByCategory[t.category_id] = (spentByCategory[t.category_id] || 0) + Math.abs(Number(t.amount))
      })

      const catMap: Record<string, { name: string; emoji: string | null }> = {}
      categoriesForBudget?.forEach((c: any) => { catMap[c.id] = { name: c.name, emoji: c.emoji } })

      goalContext = {
        savingsGoals: (savingsGoalsData || []).map((g: any) => {
          const contributions = (contributionsData || []).filter((c: any) => c.goal_id === g.id)
          const total = contributions.reduce((s: number, c: any) => s + Number(c.amount), 0)
          const monthTotal = contributions
            .filter((c: any) => c.date.startsWith(currentMonth))
            .reduce((s: number, c: any) => s + Number(c.amount), 0)
          const effective = g.type === 'monthly' ? monthTotal : total
          const percent = g.target_amount > 0 ? (effective / g.target_amount) * 100 : 0
          let daysLeft: number | null = null
          if (g.type === 'one_time' && g.target_date) {
            daysLeft = Math.ceil((new Date(g.target_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          }
          return {
            id: g.id,
            name: g.name,
            type: g.type,
            targetAmount: Number(g.target_amount),
            currency: g.currency,
            targetDate: g.target_date,
            totalContributed: total,
            currentMonthContributed: monthTotal,
            percent,
            daysLeft,
            status: effective >= Number(g.target_amount) ? 'completed' : 'active',
          }
        }),
        categoryBudgets: (budgetsData || []).map((b: any) => {
          const cat = b.categories || catMap[b.category_id] || { name: b.category_id, emoji: null }
          const spent = spentByCategory[b.category_id] || 0
          const limit = Number(b.amount)
          const percent = limit > 0 ? (spent / limit) * 100 : 0
          return {
            id: b.id,
            categoryName: cat.name,
            categoryEmoji: cat.emoji,
            limit,
            currency: b.currency,
            spent,
            percent,
            status: percent >= 100 ? 'exceeded' : percent >= 80 ? 'warning' : 'ok',
          }
        }),
      }
    } catch {
      // Goals context is optional, don't fail the chat
    }

    // 5c. Detectar tarjetas que necesitan actualización de fechas
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

    // 5. Construir prompt con historial conversacional y llamar a Gemini
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '')
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    // Truncar historial a últimos 10 mensajes y ~2000 chars para no exceder contexto
    const truncatedHistory = truncateHistory(history || [], 10, 2000)

    const systemPrompt = buildChatPrompt(userCategories, truncatedHistory, goalContext, cardAlerts)

    let geminiText: string
    try {
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: message }],
          },
        ],
        systemInstruction: {
          role: 'user',
          parts: [{ text: systemPrompt }],
        },
      })

      geminiText = result.response.text()
    } catch (geminiError) {
      console.error('Error calling Gemini:', geminiError)
      return NextResponse.json(
        { error: 'Error al procesar el mensaje con IA' },
        { status: 500 }
      )
    }

    // 6. Parsear intención de la respuesta de Gemini
    const intent = parseGeminiResponse(geminiText)

    // 7. Ejecutar acción según la intención
    const response = await handleIntent(intent, userId)

    // 8. Determinar si el intent mutó datos (para que el cliente refresque el store)
    const mutatingIntents = new Set([
      'transaction', 'installment', 'subscription', 'card_config',
      'edit', 'delete', 'confirm_action',
      'create_goal', 'create_budget', 'edit_goal', 'delete_goal', 'goal_contribution',
    ])
    const mutated = response.success && mutatingIntents.has(intent.type)

    // 9. Retornar respuesta
    return NextResponse.json({ ...response, mutated })
  } catch (error) {
    console.error('Unexpected error in chat API:', error)
    return NextResponse.json(
      { error: 'Error inesperado al procesar el mensaje' },
      { status: 500 }
    )
  }
}
