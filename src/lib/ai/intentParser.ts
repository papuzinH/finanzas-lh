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
  | 'Mensualidades_lista'
  | 'Mensualidades_total'
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

export type EntityType = 'transaccion' | 'medio_pago' | 'categoria' | 'suscripcion' | 'cuota' | 'objetivo' | 'presupuesto'

export interface EditData {
  entity: EntityType
  search: string
  changes: Record<string, unknown>
}

export interface DeleteData {
  entity: EntityType
  search: string
}

export interface ConfirmActionData {
  action: 'reassign' | 'confirm_delete' | 'cancel'
  reassignTo?: string // nombre de la entidad destino para reasignación
}

export interface CreateGoalData {
  name: string
  type: 'one_time' | 'monthly'
  targetAmount: number
  currency: 'ARS' | 'USD'
  targetDate: string | null
}

export interface CreateBudgetData {
  categoryName: string
  categoryId: string
  limitAmount: number
  currency: 'ARS' | 'USD'
}

export type GoalQueryType = 'lista_metas' | 'meta_especifica' | 'lista_presupuestos' | 'presupuesto_especifico' | 'resumen_objetivos'

export interface GoalQueryData {
  queryType: GoalQueryType
  search: string | null
}

export interface GoalEditData {
  entity: 'objetivo' | 'presupuesto'
  search: string
  changes: Record<string, unknown>
}

export interface GoalDeleteData {
  entity: 'objetivo' | 'presupuesto'
  search: string
}

export interface GoalContributionData {
  search: string
  amount: number
  currency: 'ARS' | 'USD'
  note: string | null
  date: string
}

export type ChatIntent =
  | { type: 'transaction'; data: TransactionData }
  | { type: 'installment'; data: InstallmentData }
  | { type: 'subscription'; data: SubscriptionData }
  | { type: 'card_config'; data: CardConfigData }
  | { type: 'query'; queryType: QueryType; filters: QueryFilters }
  | { type: 'edit'; data: EditData }
  | { type: 'delete'; data: DeleteData }
  | { type: 'confirm_action'; data: ConfirmActionData }
  | { type: 'create_goal'; data: CreateGoalData }
  | { type: 'create_budget'; data: CreateBudgetData }
  | { type: 'query_goal'; data: GoalQueryData }
  | { type: 'edit_goal'; data: GoalEditData }
  | { type: 'delete_goal'; data: GoalDeleteData }
  | { type: 'goal_contribution'; data: GoalContributionData }
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

interface GeminiEditResponse {
  intencion: 'editar'
  entidad: EntityType
  busqueda: string
  cambios: Record<string, unknown>
}

interface GeminiDeleteResponse {
  intencion: 'eliminar'
  entidad: EntityType
  busqueda: string
}

interface GeminiConfirmActionResponse {
  intencion: 'confirmar_accion'
  accion: 'reasignar' | 'confirmar' | 'cancelar'
  reasignar_a?: string
}

interface GeminiCreateGoalResponse {
  intencion: 'crear_objetivo_ahorro'
  nombre: string
  tipo: 'one_time' | 'monthly'
  monto_objetivo: number
  moneda: 'ARS' | 'USD'
  fecha_objetivo: string | null
}

interface GeminiCreateBudgetResponse {
  intencion: 'crear_presupuesto'
  categoria: string
  category_id: string
  monto_limite: number
  moneda: 'ARS' | 'USD'
}

interface GeminiQueryGoalResponse {
  intencion: 'consultar_objetivo'
  tipo_consulta: GoalQueryType
  busqueda: string | null
}

interface GeminiEditGoalResponse {
  intencion: 'editar_objetivo'
  entidad: 'objetivo' | 'presupuesto'
  busqueda: string
  cambios: Record<string, unknown>
}

interface GeminiDeleteGoalResponse {
  intencion: 'eliminar_objetivo'
  entidad: 'objetivo' | 'presupuesto'
  busqueda: string
}

interface GeminiGoalContributionResponse {
  intencion: 'aportar_meta'
  busqueda: string
  monto: number
  moneda: 'ARS' | 'USD'
  nota: string | null
  fecha: string
}

type GeminiResponse =
  | GeminiTransactionResponse
  | GeminiCardConfigResponse
  | GeminiSubscriptionResponse
  | GeminiQueryResponse
  | GeminiEditResponse
  | GeminiDeleteResponse
  | GeminiConfirmActionResponse
  | GeminiConversationResponse
  | GeminiCreateGoalResponse
  | GeminiCreateBudgetResponse
  | GeminiQueryGoalResponse
  | GeminiEditGoalResponse
  | GeminiDeleteGoalResponse
  | GeminiGoalContributionResponse

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

    // CASO F: Editar entidad
    if (parsed.intencion === 'editar') {
      const editData = parsed as GeminiEditResponse
      return {
        type: 'edit',
        data: {
          entity: editData.entidad,
          search: editData.busqueda,
          changes: editData.cambios || {},
        },
      }
    }

    // CASO G: Eliminar entidad
    if (parsed.intencion === 'eliminar') {
      const deleteData = parsed as GeminiDeleteResponse
      return {
        type: 'delete',
        data: {
          entity: deleteData.entidad,
          search: deleteData.busqueda,
        },
      }
    }

    // CASO H: Confirmar acción pendiente (reasignar, confirmar delete, cancelar)
    if (parsed.intencion === 'confirmar_accion') {
      const confirmData = parsed as GeminiConfirmActionResponse
      return {
        type: 'confirm_action',
        data: {
          action: confirmData.accion === 'reasignar'
            ? 'reassign'
            : confirmData.accion === 'confirmar'
              ? 'confirm_delete'
              : 'cancel',
          reassignTo: confirmData.reasignar_a,
        },
      }
    }

    // CASO I: Crear meta de ahorro
    if (parsed.intencion === 'crear_objetivo_ahorro') {
      const d = parsed as GeminiCreateGoalResponse
      return {
        type: 'create_goal',
        data: {
          name: d.nombre,
          type: d.tipo,
          targetAmount: d.monto_objetivo,
          currency: d.moneda ?? 'ARS',
          targetDate: d.fecha_objetivo ?? null,
        },
      }
    }

    // CASO J: Crear presupuesto
    if (parsed.intencion === 'crear_presupuesto') {
      const d = parsed as GeminiCreateBudgetResponse
      return {
        type: 'create_budget',
        data: {
          categoryName: d.categoria,
          categoryId: d.category_id,
          limitAmount: d.monto_limite,
          currency: d.moneda ?? 'ARS',
        },
      }
    }

    // CASO K: Consultar objetivos
    if (parsed.intencion === 'consultar_objetivo') {
      const d = parsed as GeminiQueryGoalResponse
      return {
        type: 'query_goal',
        data: {
          queryType: d.tipo_consulta,
          search: d.busqueda ?? null,
        },
      }
    }

    // CASO L: Editar objetivo o presupuesto
    if (parsed.intencion === 'editar_objetivo') {
      const d = parsed as GeminiEditGoalResponse
      return {
        type: 'edit_goal',
        data: {
          entity: d.entidad,
          search: d.busqueda,
          changes: d.cambios || {},
        },
      }
    }

    // CASO M: Eliminar objetivo o presupuesto
    if (parsed.intencion === 'eliminar_objetivo') {
      const d = parsed as GeminiDeleteGoalResponse
      return {
        type: 'delete_goal',
        data: {
          entity: d.entidad,
          search: d.busqueda,
        },
      }
    }

    // CASO N: Aportar a meta
    if (parsed.intencion === 'aportar_meta') {
      const d = parsed as GeminiGoalContributionResponse
      return {
        type: 'goal_contribution',
        data: {
          search: d.busqueda,
          amount: d.monto,
          currency: d.moneda ?? 'ARS',
          note: d.nota ?? null,
          date: d.fecha,
        },
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
