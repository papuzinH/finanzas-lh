/**
 * Parser de respuestas de Gemini a intenciones estructuradas.
 * Basado en la estructura JSON que Gemini retorna según el prompt.
 */

export type QueryType =
  | 'balance_global'
  | 'gasto_mes'
  | 'ingreso_mes'
  | 'resumen_mes'
  | 'categoria_mes'
  | 'mayor_gasto'
  | 'medio_pago_consumo'
  | 'medio_pago_cierre'
  | 'cuotas_mes'
  | 'cuota_especifica'
  | 'suscripciones_lista'
  | 'suscripciones_total'
  | 'portfolio'
  | 'busqueda'
  | 'ultimos_movimientos'
  | 'proyeccion_mes'

export interface QueryFilters {
  categoria: string | null
  medio_pago: string | null
  descripcion: string | null
  limite: number | null
}

export type ChatIntent =
  | { type: 'transaction'; data: TransactionData }
  | { type: 'installment'; data: InstallmentData }
  | { type: 'subscription'; data: SubscriptionData }
  | { type: 'card_config'; data: CardConfigData }
  | { type: 'query'; queryType: QueryType; filters: QueryFilters }
  | { type: 'conversation'; reply: string }
  | { type: 'error'; message: string }

export interface TransactionData {
  description: string
  amount: number
  type: 'expense' | 'income'
  categoryId: string | null
  categoryName: string | null
  paymentMethodName: string | null
  date: string // YYYY-MM-DD
  isReal: boolean // es_gasto_real
}

export interface InstallmentData {
  description: string
  amount: number // monto por cuota
  totalAmount: number
  installmentsCount: number
  type: 'expense' | 'income'
  categoryId: string | null
  categoryName: string | null
  paymentMethodName: string | null
  date: string // YYYY-MM-DD (fecha de compra)
  isReal: boolean
}

export interface SubscriptionData {
  description: string
  amount: number
  currency: string
  frequency: string
  categoryId: string | null
  categoryName: string | null
  paymentMethodName: string | null
}

export interface CardConfigData {
  paymentMethodName: string
  closingDay: number
  paymentDay: number
}

interface GeminiTransactionResponse {
  intencion: 'transaccion'
  compra: string
  categoria: string
  category_id: string
  valor: number
  tipo: 'expense' | 'income'
  medio_pago: string | null
  es_gasto_real: boolean
  cuotas: {
    es_cuota: boolean
    cantidad: number
    monto_total: number
  }
  fecha: string
}

interface GeminiCardConfigResponse {
  intencion: 'configuracion_tarjeta'
  tarjeta_match: string
  fecha_cierre: string
  fecha_vencimiento: string
}

interface GeminiConversationResponse {
  intencion: 'conversacion'
  respuesta: string
}

interface GeminiSubscriptionResponse {
  intencion: 'suscripcion'
  descripcion: string
  valor: number
  moneda: string
  categoria: string
  category_id: string
  frecuencia: string
  medio_pago: string | null
}

interface GeminiQueryResponse {
  intencion: 'consulta'
  tipo: QueryType
  filtros: QueryFilters
}

type GeminiResponse =
  | GeminiTransactionResponse
  | GeminiCardConfigResponse
  | GeminiSubscriptionResponse
  | GeminiQueryResponse
  | GeminiConversationResponse

/**
 * Parsea la respuesta JSON de Gemini y retorna una intención tipada.
 * Maneja errores de parsing gracefully.
 */
export function parseGeminiResponse(rawResponse: string): ChatIntent {
  try {
    // Limpiar markdown backticks si existen
    const cleaned = rawResponse
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const parsed = JSON.parse(cleaned) as GeminiResponse

    // Validar que tiene una intención
    if (!parsed.intencion) {
      return {
        type: 'error',
        message: 'No se pudo determinar la intención del mensaje',
      }
    }

    // CASO A: Transacción
    if (parsed.intencion === 'transaccion') {
      const txData = parsed as GeminiTransactionResponse

      // Si no es un gasto real, retornar error
      if (!txData.es_gasto_real) {
        return {
          type: 'error',
          message: 'Este mensaje no corresponde a un movimiento de dinero real',
        }
      }

      // Si es cuota
      if (txData.cuotas.es_cuota && txData.cuotas.cantidad > 1) {
        return {
          type: 'installment',
          data: {
            description: txData.compra,
            amount: txData.cuotas.monto_total / txData.cuotas.cantidad,
            totalAmount: txData.cuotas.monto_total,
            installmentsCount: txData.cuotas.cantidad,
            type: txData.tipo,
            categoryId: txData.category_id || null,
            categoryName: txData.categoria || null,
            paymentMethodName: txData.medio_pago,
            date: txData.fecha,
            isReal: txData.es_gasto_real,
          },
        }
      }

      // Si es transacción simple
      return {
        type: 'transaction',
        data: {
          description: txData.compra,
          amount: txData.valor,
          type: txData.tipo,
          categoryId: txData.category_id || null,
          categoryName: txData.categoria || null,
          paymentMethodName: txData.medio_pago,
          date: txData.fecha,
          isReal: txData.es_gasto_real,
        },
      }
    }

    // CASO B: Configuración de tarjeta
    if (parsed.intencion === 'configuracion_tarjeta') {
      const cardData = parsed as GeminiCardConfigResponse

      const closingDate = new Date(cardData.fecha_cierre)
      const paymentDate = new Date(cardData.fecha_vencimiento)

      return {
        type: 'card_config',
        data: {
          paymentMethodName: cardData.tarjeta_match,
          closingDay: closingDate.getUTCDate(),
          paymentDay: paymentDate.getUTCDate(),
        },
      }
    }

    // CASO C: Suscripción
    if (parsed.intencion === 'suscripcion') {
      const subData = parsed as GeminiSubscriptionResponse

      return {
        type: 'subscription',
        data: {
          description: subData.descripcion,
          amount: subData.valor,
          currency: subData.moneda,
          frequency: subData.frecuencia,
          categoryId: subData.category_id || null,
          categoryName: subData.categoria || null,
          paymentMethodName: subData.medio_pago,
        },
      }
    }

    // CASO D: Consulta
    if (parsed.intencion === 'consulta') {
      const qData = parsed as GeminiQueryResponse
      return {
        type: 'query',
        queryType: qData.tipo,
        filters: qData.filtros ?? { categoria: null, medio_pago: null, descripcion: null, limite: null },
      }
    }

    // CASO E: Conversación
    if (parsed.intencion === 'conversacion') {
      const convData = parsed as GeminiConversationResponse
      return {
        type: 'conversation',
        reply: convData.respuesta,
      }
    }

    return {
      type: 'error',
      message: 'Intención no reconocida',
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Error desconocido'
    return {
      type: 'error',
      message: `Error al parsear respuesta de IA: ${errorMsg}`,
    }
  }
}
