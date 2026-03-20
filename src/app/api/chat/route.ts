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
import { buildChatPrompt } from '@/lib/ai/chatPrompt'
import { parseGeminiResponse } from '@/lib/ai/intentParser'
import { handleIntent } from '@/lib/ai/handlers'

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
    const { message } = await req.json()

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

    // 5. Construir prompt y llamar a Gemini
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '')
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const systemPrompt = buildChatPrompt(userCategories)

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

    // 8. Retornar respuesta
    return NextResponse.json(response)
  } catch (error) {
    console.error('Unexpected error in chat API:', error)
    return NextResponse.json(
      { error: 'Error inesperado al procesar el mensaje' },
      { status: 500 }
    )
  }
}
