/**
 * Handlers para procesar intenciones del chat y guardar en la base de datos.
 */

import { createClient } from '@/utils/supabase/server'
import { addMonths } from 'date-fns'
import { formatLocalDate, parseLocalDate, getCreditCardPeriod } from '@/lib/utils/dates'
import type {
  ChatIntent,
  TransactionData,
  InstallmentData,
  SubscriptionData,
  CardConfigData,
  EditData,
  DeleteData,
  ConfirmActionData,
  QueryType,
  QueryFilters,
  CreateGoalData,
  CreateBudgetData,
  GoalQueryData,
  GoalEditData,
  GoalDeleteData,
  GoalContributionData,
} from './intentParser'

export interface ChatResponse {
  success: boolean
  message: string
  data?: any
}

/**
 * Estado de acciones pendientes de confirmación (en memoria del servidor).
 * Se limpia después de 5 minutos de inactividad.
 * Clave: userId numérico
 */
interface PendingAction {
  type: 'delete_with_deps'
  entity: 'medio_pago' | 'categoria' | 'cuota'
  entityId: number
  entityName: string
  dependencyCount: number
  dependencyType: string // 'transacciones', 'planes', etc.
  timestamp: number
}

const pendingActions = new Map<number, PendingAction>()

/**
 * Interfaz para representar un payment method resuelto con todos sus detalles.
 */
interface ResolvedPaymentMethod {
  id: number
  name: string
  type: 'credit' | 'debit' | 'cash'
  closingDay: number | null
  paymentDay: number | null
}

/**
 * Resuelve un payment method por nombre, retornando todos sus detalles.
 * Si no se proporciona nombre y exactMatch es true, busca el default.
 */
async function resolvePaymentMethod(
  supabase: any,
  userId: number,
  paymentMethodName: string | null,
  exactMatch = false
): Promise<ResolvedPaymentMethod | null> {
  let query = supabase
    .from('payment_methods')
    .select('id, name, type, default_closing_day, default_payment_day')
    .eq('user_id', userId)

  if (paymentMethodName) {
    query = query.ilike('name', `%${paymentMethodName}%`)
  } else if (exactMatch) {
    query = query.eq('is_default', true)
  } else {
    return null
  }

  const { data: method } = await query.limit(1).single()

  if (!method) return null

  return {
    id: method.id,
    name: method.name,
    type: method.type,
    closingDay: method.default_closing_day,
    paymentDay: method.default_payment_day,
  }
}

/**
 * Calcula la fecha real de pago para una transacción en tarjeta de crédito.
 * Para débito/efectivo, retorna la misma fecha de compra.
 *
 * Lógica n8n:
 * - Si compra DESPUÉS del día de cierre → salta al próximo resumen
 * - Si vencimiento < cierre → pago cae un mes después
 * - Fijar día exacto de pago
 */
function calculateRealPaymentDate(
  purchaseDate: string,
  paymentMethod: ResolvedPaymentMethod | null
): string {
  // Si no hay payment method o no es crédito, devolver la misma fecha
  if (!paymentMethod || paymentMethod.type !== 'credit') {
    return purchaseDate
  }

  // Si falta cierre o vencimiento, no se puede calcular
  if (paymentMethod.closingDay === null || paymentMethod.paymentDay === null) {
    return purchaseDate
  }

  const fecha = parseLocalDate(purchaseDate)
  let fechaPago = new Date(fecha)
  const diaCompra = fecha.getDate()

  // Si compra DESPUÉS del día de cierre → salta al próximo resumen
  if (diaCompra > paymentMethod.closingDay) {
    fechaPago.setMonth(fechaPago.getMonth() + 1)
  }

  // Si vencimiento < cierre → pago cae un mes después
  if (paymentMethod.paymentDay < paymentMethod.closingDay) {
    fechaPago.setMonth(fechaPago.getMonth() + 1)
  }

  // Fijar día exacto de pago
  fechaPago.setDate(paymentMethod.paymentDay)

  return formatLocalDate(fechaPago)
}

/**
 * Ejecuta la acción correspondiente a la intención del usuario.
 */
export async function handleIntent(intent: ChatIntent, userId: number): Promise<ChatResponse> {
  switch (intent.type) {
    case 'transaction':
      return handleTransaction(intent.data, userId)
    case 'installment':
      return handleInstallment(intent.data, userId)
    case 'subscription':
      return handleSubscription(intent.data, userId)
    case 'card_config':
      return handleCardConfig(intent.data, userId)
    case 'query':
      return handleQuery(intent.queryType, intent.filters, userId)
    case 'edit':
      return handleEdit(intent.data, userId)
    case 'delete':
      return handleDelete(intent.data, userId)
    case 'confirm_action':
      return handleConfirmAction(intent.data, userId)
    case 'create_goal':
      return handleCreateGoal(intent.data)
    case 'create_budget':
      return handleCreateBudget(intent.data)
    case 'query_goal':
      return handleQueryGoal(intent.data)
    case 'edit_goal':
      return handleEditGoal(intent.data)
    case 'delete_goal':
      return handleDeleteGoal(intent.data)
    case 'goal_contribution':
      return handleGoalContribution(intent.data)
    case 'conversation':
      return { success: true, message: intent.reply }
    case 'error':
      return { success: false, message: intent.message }
  }
}

/**
 * Consulta Supabase y retorna un mensaje de alerta si la categoría está
 * cerca (≥75%) o superó su presupuesto mensual.
 * Retorna null si no hay presupuesto activo o el gasto está bajo el umbral.
 */
async function checkBudgetAlert(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: number,
  categoryId: string | null
): Promise<string | null> {
  if (!categoryId) return null

  const { data: budget } = await supabase
    .from('category_budgets')
    .select('amount, currency, categories(name, emoji)')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .single()

  if (!budget) return null

  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

  const { data: txs } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .eq('type', 'expense')
    .gte('date', firstDay)
    .lte('date', lastDay)

  const spent = (txs ?? []).reduce((sum: number, t: { amount: number }) => sum + Number(t.amount), 0)
  const limit = Number(budget.amount)
  const percent = limit > 0 ? (spent / limit) * 100 : 0

  const catRaw = budget.categories as unknown as { name: string; emoji: string | null } | { name: string; emoji: string | null }[] | null
  const cat = Array.isArray(catRaw) ? (catRaw[0] ?? null) : catRaw
  const label = cat ? `${cat.emoji ?? ''} ${cat.name}`.trim() : 'la categoría'

  if (percent >= 100) {
    return `\n\n🔴 *Atención:* superaste el presupuesto de **${label}** (${Math.round(percent)}% usado de $${limit.toLocaleString('es-AR')}).`
  }
  if (percent >= 75) {
    return `\n\n⚠️ *Aviso:* estás cerca del límite de **${label}** (${Math.round(percent)}% usado de $${limit.toLocaleString('es-AR')}).`
  }
  return null
}

/**
 * Maneja una transacción simple (gasto o ingreso)
 */
async function handleTransaction(data: TransactionData, userId: number): Promise<ChatResponse> {
  try {
    const supabase = await createClient()

    // Resolver payment method completo (con ciclo de tarjeta si aplica)
    const paymentMethod = await resolvePaymentMethod(supabase, userId, data.paymentMethodName)

    // Calcular fecha real de pago (aplica lógica de tarjeta de crédito si corresponde)
    const realPaymentDate = calculateRealPaymentDate(data.date, paymentMethod)

    // Insertar la transacción
    const { error } = await supabase.from('transactions').insert({
      user_id: userId,
      description: data.description,
      amount: data.amount,
      date: realPaymentDate,
      type: data.type,
      category_id: data.categoryId,
      payment_method_id: paymentMethod?.id || null,
    })

    if (error) {
      console.error('Error creating transaction:', error)
      return {
        success: false,
        message: 'Error al guardar la transacción',
      }
    }

    const typeLabel = data.type === 'expense' ? 'Gasto' : 'Ingreso'
    const methodLabel = paymentMethod ? ` con ${paymentMethod.name}` : ''

    const budgetAlert =
      data.type === 'expense'
        ? await checkBudgetAlert(supabase, userId, data.categoryId ?? null)
        : null

    return {
      success: true,
      message: `✅ ${typeLabel} registrado: ${data.description} - $${data.amount}${methodLabel}${budgetAlert ?? ''}`,
    }
  } catch (error) {
    console.error('Unexpected error in handleTransaction:', error)
    return {
      success: false,
      message: 'Error inesperado al procesar la transacción',
    }
  }
}

/**
 * Maneja una compra en cuotas
 */
async function handleInstallment(data: InstallmentData, userId: number): Promise<ChatResponse> {
  try {
    const supabase = await createClient()

    // Resolver payment method completo
    const paymentMethod = await resolvePaymentMethod(supabase, userId, data.paymentMethodName)

    // Calcular fecha real de pago base (aplica lógica de tarjeta de crédito si corresponde)
    const realPaymentDateBase = calculateRealPaymentDate(data.date, paymentMethod)

    // 1. Crear el plan de cuotas
    const { data: plan, error: planError } = await supabase
      .from('installment_plans')
      .insert({
        user_id: userId,
        description: data.description,
        total_amount: data.totalAmount,
        installments_count: data.installmentsCount,
        purchase_date: data.date,
        category_id: data.categoryId,
        payment_method_id: paymentMethod?.id || null,
      })
      .select('id')
      .single()

    if (planError || !plan) {
      console.error('Error creating installment plan:', planError)
      return {
        success: false,
        message: 'Error al crear el plan de cuotas',
      }
    }

    // 2. Crear las transacciones asociadas (una por cuota)
    // Las cuotas se generan a partir de la fecha de pago real calculada
    const baseDateForInstallments = parseLocalDate(realPaymentDateBase)
    const transactions = Array.from({ length: data.installmentsCount }, (_, i) => {
      const installmentDate = addMonths(baseDateForInstallments, i)
      return {
        user_id: userId,
        description: `${data.description} (${i + 1}/${data.installmentsCount})`,
        amount: data.amount,
        date: formatLocalDate(installmentDate),
        type: 'expense' as const,
        category_id: data.categoryId,
        installment_plan_id: plan.id,
        payment_method_id: paymentMethod?.id || null,
      }
    })

    const { error: txError } = await supabase.from('transactions').insert(transactions)

    if (txError) {
      console.error('Error creating installment transactions:', txError)
      // Rollback: eliminar el plan creado
      await supabase.from('installment_plans').delete().eq('id', plan.id)
      return {
        success: false,
        message: 'Error al crear las cuotas',
      }
    }

    const methodLabel = paymentMethod ? ` con ${paymentMethod.name}` : ''

    return {
      success: true,
      message: `✅ Compra en ${data.installmentsCount} cuotas registrada: ${data.description} - $${data.totalAmount} total${methodLabel}`,
      data: { planId: plan.id },
    }
  } catch (error) {
    console.error('Unexpected error in handleInstallment:', error)
    return {
      success: false,
      message: 'Error inesperado al procesar las cuotas',
    }
  }
}

/**
 * Maneja una suscripción o gasto fijo
 */
async function handleSubscription(data: SubscriptionData, userId: number): Promise<ChatResponse> {
  try {
    const supabase = await createClient()

    // Resolver payment method por nombre, o buscar el default si no se proporcionó
    const paymentMethod = await resolvePaymentMethod(
      supabase,
      userId,
      data.paymentMethodName,
      !data.paymentMethodName // exactMatch = true si no hay nombre
    )

    // Insertar la suscripción
    const { error } = await supabase.from('recurring_plans').insert({
      user_id: userId,
      description: data.description,
      amount: data.amount,
      currency: data.currency,
      frequency: data.frequency,
      category_id: data.categoryId,
      payment_method_id: paymentMethod?.id || null,
      is_active: true,
    })

    if (error) {
      console.error('Error creating subscription:', error)
      return {
        success: false,
        message: 'Error al guardar la suscripción',
      }
    }

    const methodLabel = paymentMethod ? ` con ${paymentMethod.name}` : ''

    return {
      success: true,
      message: `✅ Suscripción registrada: ${data.description} - $${data.amount} ${data.currency} ${data.frequency}${methodLabel}`,
    }
  } catch (error) {
    console.error('Unexpected error in handleSubscription:', error)
    return {
      success: false,
      message: 'Error inesperado al procesar la suscripción',
    }
  }
}

/**
 * Maneja la configuración de tarjeta de crédito
 */
async function handleCardConfig(data: CardConfigData, userId: number): Promise<ChatResponse> {
  try {
    const supabase = await createClient()

    // Buscar la tarjeta por nombre similar
    const { data: method } = await supabase
      .from('payment_methods')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', `%${data.paymentMethodName}%`)
      .limit(1)
      .single()

    if (!method) {
      return {
        success: false,
        message: `No se encontró una tarjeta con el nombre "${data.paymentMethodName}"`,
      }
    }

    // Actualizar los días de cierre y vencimiento
    const { error } = await supabase
      .from('payment_methods')
      .update({
        default_closing_day: data.closingDay,
        default_payment_day: data.paymentDay,
      })
      .eq('id', method.id)
      .eq('user_id', userId)

    if (error) {
      console.error('Error updating payment method:', error)
      return {
        success: false,
        message: 'Error al actualizar la tarjeta',
      }
    }

    // GAP 2: Actualizar transacciones futuras (>20 días desde hoy)
    try {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 20)
      const futureDateStr = formatLocalDate(futureDate)

      // Obtener transacciones futuras de esta tarjeta
      const { data: futureTxns, error: fetchError } = await supabase
        .from('transactions')
        .select('id, date')
        .eq('payment_method_id', method.id)
        .eq('user_id', userId)
        .eq('type', 'expense')
        .gt('date', futureDateStr)

      if (fetchError) {
        console.warn('Warning: could not fetch future transactions:', fetchError)
      } else if (futureTxns && futureTxns.length > 0) {
        // Actualizar cada transacción futura ajustando el día al nuevo día de vencimiento
        for (const txn of futureTxns) {
          const oldDate = parseLocalDate(txn.date)
          oldDate.setDate(data.paymentDay)
          const newDateStr = formatLocalDate(oldDate)

          await supabase
            .from('transactions')
            .update({ date: newDateStr })
            .eq('id', txn.id)
        }
      }
    } catch (updateError) {
      console.warn('Warning: error updating future transactions:', updateError)
      // No retornar error aquí, solo avisar
    }

    return {
      success: true,
      message: `✅ Tarjeta ${method.name} actualizada:\n- Cierre: día ${data.closingDay}\n- Vencimiento: día ${data.paymentDay}`,
    }
  } catch (error) {
    console.error('Unexpected error in handleCardConfig:', error)
    return {
      success: false,
      message: 'Error inesperado al procesar la configuración',
    }
  }
}

// ============================================
// Helpers para consultas
// ============================================

function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start: formatLocalDate(start),
    end: formatLocalDate(end),
  }
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount)
}

function getCurrentMonthName(): string {
  return new Date().toLocaleString('es-AR', { month: 'long' })
}

/**
 * Maneja consultas sobre finanzas del usuario.
 */
async function handleQuery(queryType: QueryType, filters: QueryFilters, userId: number): Promise<ChatResponse> {
  try {
    const supabase = await createClient()

    switch (queryType) {
      case 'balance_global':
        return await handleBalanceGlobal(supabase, userId)
      case 'gasto_mes':
        return await handleGastoMes(supabase, userId)
      case 'ingreso_mes':
        return await handleIngresoMes(supabase, userId)
      case 'resumen_mes':
        return await handleResumenMes(supabase, userId)
      case 'categoria_mes':
        return await handleCategoriaMes(supabase, userId, filters)
      case 'mayor_gasto':
        return await handleMayorGasto(supabase, userId)
      case 'medio_pago_consumo':
        return await handleMedioPagoConsumo(supabase, userId, filters)
      case 'medio_pago_cierre':
        return await handleMedioPagoCierre(supabase, userId, filters)
      case 'cuotas_mes':
        return await handleCuotasMes(supabase, userId)
      case 'cuota_especifica':
        return await handleCuotaEspecifica(supabase, userId, filters)
      case 'suscripciones_lista':
        return await handleSuscripcionesLista(supabase, userId)
      case 'suscripciones_total':
        return await handleSuscripcionesTotal(supabase, userId)
      case 'portfolio':
        return await handlePortfolio(supabase, userId)
      case 'busqueda':
        return await handleBusqueda(supabase, userId, filters)
      case 'ultimos_movimientos':
        return await handleUltimosMovimientos(supabase, userId, filters)
      case 'proyeccion_mes':
        return await handleProyeccionMes(supabase, userId)
      default:
        return { success: false, message: 'Tipo de consulta no reconocido.' }
    }
  } catch (error) {
    console.error('Error in handleQuery:', error)
    return { success: false, message: 'No pude obtener esa información.' }
  }
}

// ============================================
// Sub-handlers de consulta
// ============================================

async function handleBalanceGlobal(supabase: any, userId: number): Promise<ChatResponse> {
  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount')
    .eq('user_id', userId)

  if (error) return { success: false, message: 'No pude obtener esa información.' }
  if (!data || data.length === 0) return { success: true, message: '💰 Aún no tenés movimientos registrados.' }

  const income = data.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0)
  const expenses = data.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0)
  const balance = income - expenses

  return {
    success: true,
    message: `💰 Tu balance total es ${formatMoney(balance)}\n📈 Ingresos totales: ${formatMoney(income)}\n📉 Gastos totales: ${formatMoney(expenses)}`,
  }
}

async function handleGastoMes(supabase: any, userId: number): Promise<ChatResponse> {
  const { start, end } = getCurrentMonthRange()
  const mes = getCurrentMonthName()

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, installment_plan_id, recurring_plan_id')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('date', start)
    .lte('date', end)

  if (error) return { success: false, message: 'No pude obtener esa información.' }
  if (!data || data.length === 0) return { success: true, message: `📊 No tenés gastos registrados en ${mes}.` }

  const variables = data.filter((t: any) => !t.installment_plan_id && !t.recurring_plan_id)
    .reduce((s: number, t: any) => s + t.amount, 0)
  const cuotas = data.filter((t: any) => t.installment_plan_id)
    .reduce((s: number, t: any) => s + t.amount, 0)
  const subs = data.filter((t: any) => t.recurring_plan_id)
    .reduce((s: number, t: any) => s + t.amount, 0)
  const total = variables + cuotas + subs

  return {
    success: true,
    message: `📊 Gastos de ${mes}:\n💳 Variables: ${formatMoney(variables)}\n📦 Cuotas: ${formatMoney(cuotas)}\n🔄 Suscripciones: ${formatMoney(subs)}\n📉 Total: ${formatMoney(total)}`,
  }
}

async function handleIngresoMes(supabase: any, userId: number): Promise<ChatResponse> {
  const { start, end } = getCurrentMonthRange()
  const mes = getCurrentMonthName()

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, description')
    .eq('user_id', userId)
    .eq('type', 'income')
    .gte('date', start)
    .lte('date', end)

  if (error) return { success: false, message: 'No pude obtener esa información.' }
  if (!data || data.length === 0) return { success: true, message: `📊 No tenés ingresos registrados en ${mes}.` }

  const total = data.reduce((s: number, t: any) => s + t.amount, 0)
  const detalle = data.map((t: any) => `• ${t.description}: ${formatMoney(t.amount)}`).join('\n')

  return {
    success: true,
    message: `💚 Ingresos de ${mes}:\n${detalle}\n\n💰 Total: ${formatMoney(total)}`,
  }
}

async function handleResumenMes(supabase: any, userId: number): Promise<ChatResponse> {
  const { start, end } = getCurrentMonthRange()
  const mes = getCurrentMonthName()

  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end)

  if (error) return { success: false, message: 'No pude obtener esa información.' }
  if (!data || data.length === 0) return { success: true, message: `📅 No tenés movimientos en ${mes}.` }

  const ingresos = data.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0)
  const gastos = data.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0)
  const balance = ingresos - gastos
  const signo = balance >= 0 ? 'positivo' : 'negativo'

  return {
    success: true,
    message: `📅 Resumen de ${mes}:\n💚 Ingresos: ${formatMoney(ingresos)}\n🔴 Gastos: ${formatMoney(gastos)}\n⚖️ Balance del mes: ${formatMoney(balance)} (${signo})`,
  }
}

async function handleCategoriaMes(supabase: any, userId: number, filters: QueryFilters): Promise<ChatResponse> {
  if (!filters.categoria) return { success: false, message: 'No especificaste una categoría.' }

  const { start, end } = getCurrentMonthRange()
  const mes = getCurrentMonthName()

  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, name, emoji')
    .eq('user_id', userId)
    .ilike('name', `%${filters.categoria}%`)

  if (catError || !categories || categories.length === 0) {
    return { success: true, message: `No encontré una categoría que coincida con "${filters.categoria}".` }
  }

  const categoryIds = categories.map((c: any) => c.id)
  const cat = categories[0]

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, description')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .in('category_id', categoryIds)
    .gte('date', start)
    .lte('date', end)

  if (error) return { success: false, message: 'No pude obtener esa información.' }
  if (!data || data.length === 0) {
    return { success: true, message: `${cat.emoji || '📁'} No tenés gastos en ${cat.name} este mes.` }
  }

  const total = data.reduce((s: number, t: any) => s + t.amount, 0)
  const detalle = data.map((t: any) => `• ${t.description}: ${formatMoney(t.amount)}`).join('\n')

  return {
    success: true,
    message: `${cat.emoji || '📁'} Gastos en ${cat.name} — ${mes}:\n${detalle}\n\n💰 Total: ${formatMoney(total)}`,
  }
}

async function handleMayorGasto(supabase: any, userId: number): Promise<ChatResponse> {
  const { start, end } = getCurrentMonthRange()
  const mes = getCurrentMonthName()

  const { data: txns, error: txError } = await supabase
    .from('transactions')
    .select('amount, category_id')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('date', start)
    .lte('date', end)

  if (txError) return { success: false, message: 'No pude obtener esa información.' }
  if (!txns || txns.length === 0) return { success: true, message: `📊 No tenés gastos en ${mes}.` }

  // Agrupar por categoría
  const grouped: Record<string, number> = {}
  for (const t of txns) {
    const catId = t.category_id || 'sin-categoria'
    grouped[catId] = (grouped[catId] || 0) + t.amount
  }

  const totalGastos = Object.values(grouped).reduce((s, v) => s + v, 0)

  // Obtener info de categorías
  const catIds = Object.keys(grouped).filter(id => id !== 'sin-categoria')
  const { data: cats } = await supabase
    .from('categories')
    .select('id, name, emoji')
    .in('id', catIds)

  const catMap: Record<string, { name: string; emoji: string }> = {}
  if (cats) {
    for (const c of cats) {
      catMap[c.id] = { name: c.name, emoji: c.emoji || '📁' }
    }
  }
  catMap['sin-categoria'] = { name: 'Sin categoría', emoji: '❓' }

  // Ordenar por monto descendente y tomar top 5
  const sorted = Object.entries(grouped)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  const lines = sorted.map(([catId, amount], i) => {
    const cat = catMap[catId] || { name: 'Desconocida', emoji: '❓' }
    const pct = totalGastos > 0 ? Math.round((amount / totalGastos) * 100) : 0
    return `${i + 1}. ${cat.emoji} ${cat.name}: ${formatMoney(amount)} (${pct}%)`
  })

  return {
    success: true,
    message: `🏆 Top gastos de ${mes}:\n${lines.join('\n')}`,
  }
}

async function handleMedioPagoConsumo(supabase: any, userId: number, filters: QueryFilters): Promise<ChatResponse> {
  if (!filters.medio_pago) return { success: false, message: 'No especificaste un medio de pago.' }

  const method = await resolvePaymentMethod(supabase, userId, filters.medio_pago)
  if (!method) return { success: true, message: `No encontré un medio de pago que coincida con "${filters.medio_pago}".` }

  // Para crédito con cierre configurado, usar el ciclo de la tarjeta
  if (method.type === 'credit' && method.closingDay !== null) {
    const { periodStart, periodEnd } = getCreditCardPeriod(method.closingDay, method.paymentDay ?? method.closingDay)
    const startStr = formatLocalDate(periodStart)
    const endStr = formatLocalDate(periodEnd)

    const { data, error } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .eq('payment_method_id', method.id)
      .gte('date', startStr)
      .lte('date', endStr)

    if (error) return { success: false, message: 'No pude obtener esa información.' }
    const total = data?.reduce((s: number, t: any) => s + t.amount, 0) ?? 0

    return {
      success: true,
      message: `💳 ${method.name} — consumo del ciclo actual: ${formatMoney(total)}\n(Cierra el día ${method.closingDay})`,
    }
  }

  // Para débito/efectivo, usar mes actual
  const { start, end } = getCurrentMonthRange()
  const mes = getCurrentMonthName()

  const { data, error } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .eq('payment_method_id', method.id)
    .gte('date', start)
    .lte('date', end)

  if (error) return { success: false, message: 'No pude obtener esa información.' }
  const total = data?.reduce((s: number, t: any) => s + t.amount, 0) ?? 0

  return {
    success: true,
    message: `💳 ${method.name} — gastos de ${mes}: ${formatMoney(total)}`,
  }
}

async function handleMedioPagoCierre(supabase: any, userId: number, filters: QueryFilters): Promise<ChatResponse> {
  if (!filters.medio_pago) return { success: false, message: 'No especificaste un medio de pago.' }

  const method = await resolvePaymentMethod(supabase, userId, filters.medio_pago)
  if (!method) return { success: true, message: `No encontré un medio de pago que coincida con "${filters.medio_pago}".` }

  if (method.type !== 'credit' || method.closingDay === null || method.paymentDay === null) {
    return { success: true, message: `${method.name} no es una tarjeta de crédito con ciclo configurado.` }
  }

  const { periodEnd, paymentDate } = getCreditCardPeriod(method.closingDay, method.paymentDay)
  const now = new Date()
  const diasParaCierre = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const diasParaVencimiento = Math.ceil((paymentDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  return {
    success: true,
    message: `📅 ${method.name}:\n🔒 Próximo cierre: ${formatLocalDate(periodEnd)} (en ${diasParaCierre} días)\n💳 Próximo vencimiento: ${formatLocalDate(paymentDate)} (en ${diasParaVencimiento} días)`,
  }
}

async function handleCuotasMes(supabase: any, userId: number): Promise<ChatResponse> {
  const { start, end } = getCurrentMonthRange()
  const mes = getCurrentMonthName()

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, description, installment_plan_id')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .not('installment_plan_id', 'is', null)
    .gte('date', start)
    .lte('date', end)

  if (error) return { success: false, message: 'No pude obtener esa información.' }
  if (!data || data.length === 0) return { success: true, message: `📦 No tenés cuotas en ${mes}.` }

  const total = data.reduce((s: number, t: any) => s + t.amount, 0)
  const lines = data.map((t: any) => `• ${t.description}: ${formatMoney(t.amount)}`)

  return {
    success: true,
    message: `📦 Cuotas de ${mes}:\n${lines.join('\n')}\n\n💰 Total: ${formatMoney(total)}`,
  }
}

async function handleCuotaEspecifica(supabase: any, userId: number, filters: QueryFilters): Promise<ChatResponse> {
  if (!filters.descripcion) return { success: false, message: 'No especificaste qué cuota buscás.' }

  const { data: plans, error: planError } = await supabase
    .from('installment_plans')
    .select('id, description, total_amount, installments_count')
    .eq('user_id', userId)
    .ilike('description', `%${filters.descripcion}%`)
    .limit(1)

  if (planError || !plans || plans.length === 0) {
    return { success: true, message: `No encontré un plan de cuotas que coincida con "${filters.descripcion}".` }
  }

  const plan = plans[0]
  const montoPorCuota = plan.total_amount / plan.installments_count

  const { count, error: countError } = await supabase
    .from('transactions')
    .select('id', { count: 'exact' })
    .eq('installment_plan_id', plan.id)

  if (countError) return { success: false, message: 'No pude obtener esa información.' }

  const pagadas = count ?? 0
  const restantes = plan.installments_count - pagadas
  const totalPagado = montoPorCuota * pagadas
  const saldoRestante = plan.total_amount - totalPagado

  return {
    success: true,
    message: `📦 ${plan.description}:\n✅ Cuotas pagas: ${pagadas}/${plan.installments_count}\n⏳ Cuotas restantes: ${restantes}\n💰 Monto por cuota: ${formatMoney(montoPorCuota)}\n💵 Total pagado: ${formatMoney(totalPagado)}\n💳 Saldo restante: ${formatMoney(saldoRestante)}`,
  }
}

async function handleSuscripcionesLista(supabase: any, userId: number): Promise<ChatResponse> {
  const { data, error } = await supabase
    .from('recurring_plans')
    .select('description, amount, currency, frequency')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('amount', { ascending: false })

  if (error) return { success: false, message: 'No pude obtener esa información.' }
  if (!data || data.length === 0) return { success: true, message: '🔄 No tenés suscripciones activas.' }

  const freqLabel: Record<string, string> = { monthly: 'mes', yearly: 'año', weekly: 'semana' }
  const lines = data.map((p: any) => {
    const freq = freqLabel[p.frequency] || p.frequency
    const moneda = p.currency === 'USD' ? `USD $${p.amount}` : formatMoney(p.amount)
    return `• ${p.description}: ${moneda}/${freq}`
  })

  return {
    success: true,
    message: `🔄 Suscripciones activas:\n${lines.join('\n')}`,
  }
}

async function handleSuscripcionesTotal(supabase: any, userId: number): Promise<ChatResponse> {
  const { data, error } = await supabase
    .from('recurring_plans')
    .select('amount, currency')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error) return { success: false, message: 'No pude obtener esa información.' }
  if (!data || data.length === 0) return { success: true, message: '🔄 No tenés suscripciones activas.' }

  const totalARS = data.filter((p: any) => p.currency === 'ARS').reduce((s: number, p: any) => s + p.amount, 0)
  const totalUSD = data.filter((p: any) => p.currency === 'USD').reduce((s: number, p: any) => s + p.amount, 0)

  let msg = '🔄 Gasto mensual en suscripciones:'
  if (totalARS > 0) msg += `\n💲 ARS: ${formatMoney(totalARS)}/mes`
  if (totalUSD > 0) msg += `\n💵 USD: $${totalUSD}/mes`
  if (totalARS === 0 && totalUSD === 0) msg += '\nNo tenés suscripciones con monto.'

  return { success: true, message: msg }
}

async function handlePortfolio(supabase: any, userId: number): Promise<ChatResponse> {
  const { data: investments, error: invError } = await supabase
    .from('investments')
    .select('ticker, name, quantity, avg_buy_price, currency')
    .eq('user_id', userId)

  if (invError) return { success: false, message: 'No pude obtener esa información.' }
  if (!investments || investments.length === 0) return { success: true, message: '📈 No tenés inversiones registradas.' }

  const tickers = investments.map((i: any) => i.ticker)
  const { data: prices } = await supabase
    .from('market_prices')
    .select('ticker, last_price, last_update')
    .in('ticker', tickers)

  const priceMap: Record<string, number> = {}
  if (prices) {
    for (const p of prices) {
      priceMap[p.ticker] = p.last_price
    }
  }

  const lines = investments.map((inv: any) => {
    const currentPrice = priceMap[inv.ticker]
    const invested = inv.quantity * inv.avg_buy_price
    if (currentPrice) {
      const currentValue = inv.quantity * currentPrice
      const pctChange = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0
      const arrow = pctChange >= 0 ? '▲' : '▼'
      return `• ${inv.name || inv.ticker}: ${inv.quantity} × $${currentPrice} = $${Math.round(currentValue)} (${arrow}${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%)`
    }
    return `• ${inv.name || inv.ticker}: ${inv.quantity} acciones @ $${inv.avg_buy_price} (sin precio actual)`
  })

  return {
    success: true,
    message: `📈 Portfolio:\n${lines.join('\n')}`,
  }
}

async function handleBusqueda(supabase: any, userId: number, filters: QueryFilters): Promise<ChatResponse> {
  if (!filters.descripcion) return { success: false, message: 'No especificaste qué buscar.' }

  const { data, error } = await supabase
    .from('transactions')
    .select('description, amount, date, type')
    .eq('user_id', userId)
    .ilike('description', `%${filters.descripcion}%`)
    .order('date', { ascending: false })
    .limit(5)

  if (error) return { success: false, message: 'No pude obtener esa información.' }
  if (!data || data.length === 0) {
    return { success: true, message: `🔍 No encontré resultados para "${filters.descripcion}".` }
  }

  const lines = data.map((t: any) => {
    const signo = t.type === 'expense' ? '-' : '+'
    return `• ${t.date} ${t.description}: ${signo}${formatMoney(t.amount)}`
  })

  return {
    success: true,
    message: `🔍 Resultados para "${filters.descripcion}":\n${lines.join('\n')}`,
  }
}

async function handleUltimosMovimientos(supabase: any, userId: number, filters: QueryFilters): Promise<ChatResponse> {
  const limit = filters.limite ?? 5

  const { data, error } = await supabase
    .from('transactions')
    .select('description, amount, date, type, categories(name, emoji)')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit)

  if (error) return { success: false, message: 'No pude obtener esa información.' }
  if (!data || data.length === 0) return { success: true, message: '📋 No tenés movimientos registrados.' }

  const lines = data.map((t: any) => {
    const signo = t.type === 'expense' ? '-' : '+'
    const emoji = t.categories?.emoji || ''
    return `• ${t.date} ${emoji} ${t.description}: ${signo}${formatMoney(t.amount)}`
  })

  return {
    success: true,
    message: `📋 Últimos ${limit} movimientos:\n${lines.join('\n')}`,
  }
}

// ============================================
// Handlers de edición y eliminación
// ============================================

/**
 * Maneja la edición de entidades existentes.
 */
async function handleEdit(data: EditData, userId: number): Promise<ChatResponse> {
  try {
    const supabase = await createClient()

    switch (data.entity) {
      case 'transaccion': {
        const { data: txns, error } = await supabase
          .from('transactions')
          .select('id, description, amount, type, date, category_id, payment_method_id')
          .eq('user_id', userId)
          .ilike('description', `%${data.search}%`)
          .order('date', { ascending: false })
          .limit(1)

        if (error || !txns || txns.length === 0) {
          return { success: false, message: `No encontré una transacción que coincida con "${data.search}".` }
        }

        const txn = txns[0]
        const updates: Record<string, unknown> = {}

        if (data.changes.description) updates.description = data.changes.description
        if (data.changes.amount) updates.amount = Number(data.changes.amount)
        if (data.changes.type) updates.type = data.changes.type

        // Resolver categoría por nombre si se proporcionó
        if (data.changes.category) {
          const { data: cats } = await supabase
            .from('categories')
            .select('id, name')
            .eq('user_id', userId)
            .ilike('name', `%${data.changes.category}%`)
            .limit(1)

          if (cats && cats.length > 0) {
            updates.category_id = cats[0].id
          }
        }

        // Resolver medio de pago por nombre
        if (data.changes.payment_method) {
          const pm = await resolvePaymentMethod(supabase, userId, String(data.changes.payment_method))
          if (pm) updates.payment_method_id = pm.id
        }

        if (Object.keys(updates).length === 0) {
          return { success: false, message: 'No se especificaron cambios válidos.' }
        }

        const { error: updateError } = await supabase
          .from('transactions')
          .update(updates)
          .eq('id', txn.id)
          .eq('user_id', userId)

        if (updateError) {
          return { success: false, message: 'Error al actualizar la transacción.' }
        }

        return {
          success: true,
          message: `✅ Transacción "${txn.description}" actualizada: ${Object.entries(updates).map(([k, v]) => `${k} → ${v}`).join(', ')}`,
        }
      }

      case 'medio_pago': {
        const { data: methods, error } = await supabase
          .from('payment_methods')
          .select('id, name, type')
          .eq('user_id', userId)
          .ilike('name', `%${data.search}%`)
          .limit(1)

        if (error || !methods || methods.length === 0) {
          return { success: false, message: `No encontré un medio de pago que coincida con "${data.search}".` }
        }

        const method = methods[0]
        const updates: Record<string, unknown> = {}

        if (data.changes.name) updates.name = data.changes.name
        if (data.changes.type) updates.type = data.changes.type
        if (data.changes.closing_day !== undefined) updates.default_closing_day = Number(data.changes.closing_day)
        if (data.changes.payment_day !== undefined) updates.default_payment_day = Number(data.changes.payment_day)

        if (Object.keys(updates).length === 0) {
          return { success: false, message: 'No se especificaron cambios válidos.' }
        }

        const { error: updateError } = await supabase
          .from('payment_methods')
          .update(updates)
          .eq('id', method.id)
          .eq('user_id', userId)

        if (updateError) {
          return { success: false, message: 'Error al actualizar el medio de pago.' }
        }

        return {
          success: true,
          message: `✅ Medio de pago "${method.name}" actualizado: ${Object.entries(updates).map(([k, v]) => `${k} → ${v}`).join(', ')}`,
        }
      }

      case 'categoria': {
        const { data: cats, error } = await supabase
          .from('categories')
          .select('id, name, emoji')
          .eq('user_id', userId)
          .ilike('name', `%${data.search}%`)
          .limit(1)

        if (error || !cats || cats.length === 0) {
          return { success: false, message: `No encontré una categoría que coincida con "${data.search}".` }
        }

        const cat = cats[0]
        const updates: Record<string, unknown> = {}

        if (data.changes.name) updates.name = data.changes.name
        if (data.changes.emoji) updates.emoji = data.changes.emoji

        if (Object.keys(updates).length === 0) {
          return { success: false, message: 'No se especificaron cambios válidos.' }
        }

        const { error: updateError } = await supabase
          .from('categories')
          .update(updates)
          .eq('id', cat.id)
          .eq('user_id', userId)

        if (updateError) {
          return { success: false, message: 'Error al actualizar la categoría.' }
        }

        return {
          success: true,
          message: `✅ Categoría "${cat.name}" actualizada: ${Object.entries(updates).map(([k, v]) => `${k} → ${v}`).join(', ')}`,
        }
      }

      case 'suscripcion': {
        const { data: subs, error } = await supabase
          .from('recurring_plans')
          .select('id, description, amount, currency')
          .eq('user_id', userId)
          .ilike('description', `%${data.search}%`)
          .limit(1)

        if (error || !subs || subs.length === 0) {
          return { success: false, message: `No encontré una suscripción que coincida con "${data.search}".` }
        }

        const sub = subs[0]
        const updates: Record<string, unknown> = {}

        if (data.changes.description) updates.description = data.changes.description
        if (data.changes.amount) updates.amount = Number(data.changes.amount)
        if (data.changes.currency) updates.currency = data.changes.currency
        if (data.changes.is_active !== undefined) updates.is_active = data.changes.is_active

        if (Object.keys(updates).length === 0) {
          return { success: false, message: 'No se especificaron cambios válidos.' }
        }

        const { error: updateError } = await supabase
          .from('recurring_plans')
          .update(updates)
          .eq('id', sub.id)
          .eq('user_id', userId)

        if (updateError) {
          return { success: false, message: 'Error al actualizar la suscripción.' }
        }

        return {
          success: true,
          message: `✅ Suscripción "${sub.description}" actualizada: ${Object.entries(updates).map(([k, v]) => `${k} → ${v}`).join(', ')}`,
        }
      }

      default:
        return { success: false, message: 'Tipo de entidad no soportada para edición.' }
    }
  } catch (error) {
    console.error('Error in handleEdit:', error)
    return { success: false, message: 'Error inesperado al editar.' }
  }
}

/**
 * Maneja la eliminación de entidades con validación de dependencias.
 */
async function handleDelete(data: DeleteData, userId: number): Promise<ChatResponse> {
  try {
    const supabase = await createClient()

    switch (data.entity) {
      case 'transaccion': {
        const { data: txns, error } = await supabase
          .from('transactions')
          .select('id, description, amount, date')
          .eq('user_id', userId)
          .ilike('description', `%${data.search}%`)
          .order('date', { ascending: false })
          .limit(1)

        if (error || !txns || txns.length === 0) {
          return { success: false, message: `No encontré una transacción que coincida con "${data.search}".` }
        }

        const txn = txns[0]
        const { error: deleteError } = await supabase
          .from('transactions')
          .delete()
          .eq('id', txn.id)
          .eq('user_id', userId)

        if (deleteError) {
          return { success: false, message: 'Error al eliminar la transacción.' }
        }

        return {
          success: true,
          message: `🗑️ Transacción eliminada: "${txn.description}" - ${formatMoney(txn.amount)} (${txn.date})`,
        }
      }

      case 'medio_pago': {
        const { data: methods, error } = await supabase
          .from('payment_methods')
          .select('id, name')
          .eq('user_id', userId)
          .ilike('name', `%${data.search}%`)
          .limit(1)

        if (error || !methods || methods.length === 0) {
          return { success: false, message: `No encontré un medio de pago que coincida con "${data.search}".` }
        }

        const method = methods[0]

        // Verificar dependencias: transacciones
        const { count: txCount } = await supabase
          .from('transactions')
          .select('id', { count: 'exact' })
          .eq('payment_method_id', method.id)
          .eq('user_id', userId)

        // Verificar dependencias: planes de cuotas
        const { count: planCount } = await supabase
          .from('installment_plans')
          .select('id', { count: 'exact' })
          .eq('payment_method_id', method.id)
          .eq('user_id', userId)

        // Verificar dependencias: suscripciones
        const { count: subCount } = await supabase
          .from('recurring_plans')
          .select('id', { count: 'exact' })
          .eq('payment_method_id', method.id)
          .eq('user_id', userId)

        const totalDeps = (txCount ?? 0) + (planCount ?? 0) + (subCount ?? 0)

        if (totalDeps > 0) {
          // Guardar acción pendiente de confirmación
          pendingActions.set(userId, {
            type: 'delete_with_deps',
            entity: 'medio_pago',
            entityId: method.id,
            entityName: method.name,
            dependencyCount: totalDeps,
            dependencyType: 'entidades',
            timestamp: Date.now(),
          })

          const details: string[] = []
          if (txCount && txCount > 0) details.push(`${txCount} transacciones`)
          if (planCount && planCount > 0) details.push(`${planCount} planes de cuotas`)
          if (subCount && subCount > 0) details.push(`${subCount} suscripciones`)

          return {
            success: true,
            message: `⚠️ El medio de pago "${method.name}" tiene ${details.join(', ')} asociadas. ¿Querés reasignarlas a otro medio de pago, o cancelar la eliminación?`,
          }
        }

        // Sin dependencias: eliminar directamente
        const { error: deleteError } = await supabase
          .from('payment_methods')
          .delete()
          .eq('id', method.id)
          .eq('user_id', userId)

        if (deleteError) {
          return { success: false, message: 'Error al eliminar el medio de pago.' }
        }

        return {
          success: true,
          message: `🗑️ Medio de pago "${method.name}" eliminado.`,
        }
      }

      case 'categoria': {
        const { data: cats, error } = await supabase
          .from('categories')
          .select('id, name, emoji')
          .eq('user_id', userId)
          .ilike('name', `%${data.search}%`)
          .limit(1)

        if (error || !cats || cats.length === 0) {
          return { success: false, message: `No encontré una categoría que coincida con "${data.search}".` }
        }

        const cat = cats[0]

        // Verificar dependencias
        const { count: txCount } = await supabase
          .from('transactions')
          .select('id', { count: 'exact' })
          .eq('category_id', cat.id)
          .eq('user_id', userId)

        if (txCount && txCount > 0) {
          pendingActions.set(userId, {
            type: 'delete_with_deps',
            entity: 'categoria',
            entityId: cat.id as unknown as number, // categories use UUID but same flow
            entityName: cat.name,
            dependencyCount: txCount,
            dependencyType: 'transacciones',
            timestamp: Date.now(),
          })

          return {
            success: true,
            message: `⚠️ La categoría "${cat.emoji || ''} ${cat.name}" tiene ${txCount} transacciones asociadas. ¿Querés reasignarlas a otra categoría, o cancelar?`,
          }
        }

        const { error: deleteError } = await supabase
          .from('categories')
          .delete()
          .eq('id', cat.id)
          .eq('user_id', userId)

        if (deleteError) {
          return { success: false, message: 'Error al eliminar la categoría.' }
        }

        return {
          success: true,
          message: `🗑️ Categoría "${cat.emoji || ''} ${cat.name}" eliminada.`,
        }
      }

      case 'suscripcion': {
        const { data: subs, error } = await supabase
          .from('recurring_plans')
          .select('id, description, amount, currency')
          .eq('user_id', userId)
          .ilike('description', `%${data.search}%`)
          .limit(1)

        if (error || !subs || subs.length === 0) {
          return { success: false, message: `No encontré una suscripción que coincida con "${data.search}".` }
        }

        const sub = subs[0]

        // Suscripciones se desactivan, no se eliminan hard
        const { error: updateError } = await supabase
          .from('recurring_plans')
          .update({ is_active: false })
          .eq('id', sub.id)
          .eq('user_id', userId)

        if (updateError) {
          return { success: false, message: 'Error al desactivar la suscripción.' }
        }

        return {
          success: true,
          message: `🗑️ Suscripción "${sub.description}" desactivada (${formatMoney(sub.amount)} ${sub.currency}/mes).`,
        }
      }

      case 'cuota': {
        const { data: plans, error } = await supabase
          .from('installment_plans')
          .select('id, description, total_amount, installments_count')
          .eq('user_id', userId)
          .ilike('description', `%${data.search}%`)
          .limit(1)

        if (error || !plans || plans.length === 0) {
          return { success: false, message: `No encontré un plan de cuotas que coincida con "${data.search}".` }
        }

        const plan = plans[0]

        // Contar cuotas futuras (no pagadas)
        const today = formatLocalDate(new Date())
        const { count: futureCount } = await supabase
          .from('transactions')
          .select('id', { count: 'exact' })
          .eq('installment_plan_id', plan.id)
          .eq('user_id', userId)
          .gte('date', today)

        if (futureCount && futureCount > 0) {
          pendingActions.set(userId, {
            type: 'delete_with_deps',
            entity: 'cuota',
            entityId: plan.id,
            entityName: plan.description,
            dependencyCount: futureCount,
            dependencyType: 'cuotas futuras',
            timestamp: Date.now(),
          })

          return {
            success: true,
            message: `⚠️ El plan "${plan.description}" tiene ${futureCount} cuotas futuras. ¿Confirmo eliminar el plan y sus cuotas pendientes, o cancelar?`,
          }
        }

        // Sin cuotas futuras, eliminar plan
        const { error: deleteError } = await supabase
          .from('installment_plans')
          .delete()
          .eq('id', plan.id)
          .eq('user_id', userId)

        if (deleteError) {
          return { success: false, message: 'Error al eliminar el plan de cuotas.' }
        }

        return {
          success: true,
          message: `🗑️ Plan de cuotas "${plan.description}" eliminado.`,
        }
      }

      default:
        return { success: false, message: 'Tipo de entidad no soportada para eliminación.' }
    }
  } catch (error) {
    console.error('Error in handleDelete:', error)
    return { success: false, message: 'Error inesperado al eliminar.' }
  }
}

/**
 * Maneja confirmaciones de acciones pendientes (reasignar, confirmar delete, cancelar).
 */
async function handleConfirmAction(data: ConfirmActionData, userId: number): Promise<ChatResponse> {
  const pending = pendingActions.get(userId)

  if (!pending) {
    return { success: false, message: 'No hay ninguna acción pendiente de confirmación.' }
  }

  // Limpiar si pasaron más de 5 minutos
  if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
    pendingActions.delete(userId)
    return { success: false, message: 'La acción expiró. Si querés eliminar algo, pedímelo de nuevo.' }
  }

  try {
    const supabase = await createClient()

    if (data.action === 'cancel') {
      pendingActions.delete(userId)
      return { success: true, message: '❌ Operación cancelada.' }
    }

    if (data.action === 'confirm_delete') {
      // Confirmar eliminación sin reasignación
      if (pending.entity === 'cuota') {
        // Eliminar cuotas futuras + plan
        const today = formatLocalDate(new Date())
        await supabase
          .from('transactions')
          .delete()
          .eq('installment_plan_id', pending.entityId)
          .eq('user_id', userId)
          .gte('date', today)

        await supabase
          .from('installment_plans')
          .delete()
          .eq('id', pending.entityId)
          .eq('user_id', userId)

        pendingActions.delete(userId)
        return {
          success: true,
          message: `🗑️ Plan "${pending.entityName}" eliminado junto con sus ${pending.dependencyCount} cuotas futuras.`,
        }
      }

      pendingActions.delete(userId)
      return { success: false, message: 'Para esta entidad necesitás reasignar las dependencias antes de eliminar.' }
    }

    if (data.action === 'reassign') {
      if (!data.reassignTo) {
        return { success: false, message: '¿A qué entidad querés reasignar? Decime el nombre.' }
      }

      if (pending.entity === 'medio_pago') {
        // Buscar el nuevo medio de pago
        const newMethod = await resolvePaymentMethod(supabase, userId, data.reassignTo)
        if (!newMethod) {
          return { success: false, message: `No encontré un medio de pago que coincida con "${data.reassignTo}".` }
        }

        // Reasignar transacciones
        await supabase
          .from('transactions')
          .update({ payment_method_id: newMethod.id })
          .eq('payment_method_id', pending.entityId)
          .eq('user_id', userId)

        // Reasignar planes de cuotas
        await supabase
          .from('installment_plans')
          .update({ payment_method_id: newMethod.id })
          .eq('payment_method_id', pending.entityId)
          .eq('user_id', userId)

        // Reasignar suscripciones
        await supabase
          .from('recurring_plans')
          .update({ payment_method_id: newMethod.id })
          .eq('payment_method_id', pending.entityId)
          .eq('user_id', userId)

        // Eliminar el medio de pago original
        await supabase
          .from('payment_methods')
          .delete()
          .eq('id', pending.entityId)
          .eq('user_id', userId)

        pendingActions.delete(userId)
        return {
          success: true,
          message: `✅ ${pending.dependencyCount} entidades reasignadas a "${newMethod.name}". Medio de pago "${pending.entityName}" eliminado.`,
        }
      }

      if (pending.entity === 'categoria') {
        // Buscar la nueva categoría
        const { data: cats } = await supabase
          .from('categories')
          .select('id, name, emoji')
          .eq('user_id', userId)
          .ilike('name', `%${data.reassignTo}%`)
          .limit(1)

        if (!cats || cats.length === 0) {
          return { success: false, message: `No encontré una categoría que coincida con "${data.reassignTo}".` }
        }

        const newCat = cats[0]

        // Reasignar transacciones
        await supabase
          .from('transactions')
          .update({ category_id: newCat.id })
          .eq('category_id', pending.entityId)
          .eq('user_id', userId)

        // Eliminar la categoría original
        await supabase
          .from('categories')
          .delete()
          .eq('id', pending.entityId)
          .eq('user_id', userId)

        pendingActions.delete(userId)
        return {
          success: true,
          message: `✅ ${pending.dependencyCount} transacciones reasignadas a "${newCat.emoji || ''} ${newCat.name}". Categoría "${pending.entityName}" eliminada.`,
        }
      }

      pendingActions.delete(userId)
      return { success: false, message: 'Reasignación no soportada para este tipo de entidad.' }
    }

    pendingActions.delete(userId)
    return { success: false, message: 'Acción no reconocida.' }
  } catch (error) {
    console.error('Error in handleConfirmAction:', error)
    pendingActions.delete(userId)
    return { success: false, message: 'Error inesperado al procesar la confirmación.' }
  }
}

// ============================================
// Sub-handlers de consulta
// ============================================

async function handleProyeccionMes(supabase: any, userId: number): Promise<ChatResponse> {
  const { start } = getCurrentMonthRange()
  const today = formatLocalDate(new Date())
  const mes = getCurrentMonthName()

  // Gastos hasta hoy
  const { data: gastosData, error: gastosError } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('date', start)
    .lte('date', today)

  if (gastosError) return { success: false, message: 'No pude obtener esa información.' }

  const gastadoHoy = gastosData?.reduce((s: number, t: any) => s + t.amount, 0) ?? 0

  // Suscripciones activas (burn rate mensual)
  const { data: subsData } = await supabase
    .from('recurring_plans')
    .select('amount, currency')
    .eq('user_id', userId)
    .eq('is_active', true)

  const burnRate = subsData?.filter((p: any) => p.currency === 'ARS')
    .reduce((s: number, p: any) => s + p.amount, 0) ?? 0

  // Ingresos del mes
  const { data: ingresosData } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('type', 'income')
    .gte('date', start)
    .lte('date', today)

  const ingresos = ingresosData?.reduce((s: number, t: any) => s + t.amount, 0) ?? 0

  const totalProyectado = gastadoHoy + burnRate
  const balanceProyectado = ingresos - totalProyectado

  return {
    success: true,
    message: `🔮 Proyección de ${mes}:\n💸 Gastado hasta hoy: ${formatMoney(gastadoHoy)}\n🔄 Fijos restantes: ${formatMoney(burnRate)}\n📉 Total proyectado: ${formatMoney(totalProyectado)}\n💚 Ingresos: ${formatMoney(ingresos)}\n⚖️ Balance proyectado: ${formatMoney(balanceProyectado)}`,
  }
}

// ============================================================
// HANDLERS DE OBJETIVOS Y PRESUPUESTOS
// ============================================================

/**
 * Obtiene el auth UUID del usuario actual desde Supabase.
 * Los handlers de objetivos necesitan el UUID (no el id numérico)
 * porque las tablas goals/budgets usan auth.uid() como user_id.
 */
async function getAuthUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function handleCreateGoal(data: CreateGoalData): Promise<ChatResponse> {
  try {
    const supabase = await createClient()
    const authId = await getAuthUserId()
    if (!authId) return { success: false, message: 'No autorizado' }

    const { error } = await supabase.from('savings_goals').insert({
      user_id: authId,
      name: data.name,
      type: data.type,
      target_amount: data.targetAmount,
      currency: data.currency,
      target_date: data.targetDate,
    })

    if (error) return { success: false, message: `Error al crear la meta: ${error.message}` }

    const typeLabel = data.type === 'one_time' ? 'meta única' : 'meta mensual'
    const dateLabel = data.targetDate ? ` para el ${data.targetDate}` : ''
    return {
      success: true,
      message: `🎯 ¡Meta de ahorro creada!\n**"${data.name}"** (${typeLabel})\nObjetivo: ${data.currency} ${data.targetAmount.toLocaleString()}${dateLabel}\n\nPodés registrar aportes desde la sección Objetivos o diciéndome "Aporté $X a mi meta de ${data.name}".`,
    }
  } catch {
    return { success: false, message: 'Error inesperado al crear la meta' }
  }
}

async function handleCreateBudget(data: CreateBudgetData): Promise<ChatResponse> {
  try {
    const supabase = await createClient()
    const authId = await getAuthUserId()
    if (!authId) return { success: false, message: 'No autorizado' }

    const { error } = await supabase.from('category_budgets').upsert(
      {
        user_id: authId,
        category_id: data.categoryId,
        amount: data.limitAmount,
        currency: data.currency,
        is_active: true,
      },
      { onConflict: 'user_id,category_id' }
    )

    if (error) return { success: false, message: `Error al crear el presupuesto: ${error.message}` }

    return {
      success: true,
      message: `💰 ¡Presupuesto configurado!\n**${data.categoryName}**: límite mensual de ${data.currency} ${data.limitAmount.toLocaleString()}\n\nTe avisaré cuando estés cerca del límite al registrar gastos en esa categoría.`,
    }
  } catch {
    return { success: false, message: 'Error inesperado al crear el presupuesto' }
  }
}

async function handleQueryGoal(data: GoalQueryData): Promise<ChatResponse> {
  try {
    const supabase = await createClient()
    const authId = await getAuthUserId()
    if (!authId) return { success: false, message: 'No autorizado' }

    const { queryType, search } = data
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    if (queryType === 'lista_metas' || queryType === 'resumen_objetivos') {
      const { data: goals } = await supabase
        .from('savings_goals')
        .select('*, savings_goal_contributions(*)')
        .eq('user_id', authId)
        .eq('is_active', true)

      if (!goals || goals.length === 0) {
        return { success: true, message: '🎯 No tenés metas de ahorro activas. Podés crear una diciéndome "Quiero ahorrar $X para Y".' }
      }

      const lines = goals.map((g: any) => {
        const contributions: any[] = g.savings_goal_contributions || []
        const total = contributions.reduce((s: number, c: any) => s + Number(c.amount), 0)
        const monthTotal = contributions
          .filter((c: any) => c.date.startsWith(currentMonth))
          .reduce((s: number, c: any) => s + Number(c.amount), 0)
        const effective = g.type === 'monthly' ? monthTotal : total
        const pct = g.target_amount > 0 ? ((effective / g.target_amount) * 100).toFixed(1) : '0'
        const typeLabel = g.type === 'monthly' ? '(mensual)' : g.target_date ? `(hasta ${g.target_date})` : ''
        return `• **${g.name}** ${typeLabel}: ${g.currency} ${effective.toLocaleString()} / ${Number(g.target_amount).toLocaleString()} (${pct}%)`
      })

      if (queryType === 'resumen_objetivos') {
        // Also include budgets
        const { data: budgets } = await supabase
          .from('category_budgets')
          .select('*, categories(name, emoji)')
          .eq('user_id', authId)
          .eq('is_active', true)

        if (budgets && budgets.length > 0) {
          const today = now.toISOString().split('T')[0]
          const start = `${currentMonth}-01`
          const { data: expenses } = await supabase
            .from('transactions')
            .select('amount, category_id')
            .eq('user_id', authId)
            .eq('type', 'expense')
            .gte('date', start)
            .lte('date', today)

          const spentByCategory: Record<string, number> = {}
          expenses?.forEach((t: any) => {
            spentByCategory[t.category_id] = (spentByCategory[t.category_id] || 0) + Math.abs(Number(t.amount))
          })

          const budgetLines = budgets.map((b: any) => {
            const cat = b.categories
            const spent = spentByCategory[b.category_id] || 0
            const pct = b.amount > 0 ? ((spent / b.amount) * 100).toFixed(1) : '0'
            const statusEmoji = Number(pct) >= 100 ? '🔴' : Number(pct) >= 80 ? '🟡' : '🟢'
            return `• ${statusEmoji} **${cat?.emoji || ''} ${cat?.name || b.category_id}**: ${spent.toLocaleString()} / ${Number(b.amount).toLocaleString()} ${b.currency} (${pct}%)`
          })

          return {
            success: true,
            message: `📊 **Resumen de Objetivos**\n\n🎯 **Metas de ahorro:**\n${lines.join('\n')}\n\n💰 **Presupuestos mensuales:**\n${budgetLines.join('\n')}`,
          }
        }
      }

      return { success: true, message: `🎯 **Tus metas de ahorro:**\n${lines.join('\n')}` }
    }

    if (queryType === 'meta_especifica' && search) {
      const { data: goals } = await supabase
        .from('savings_goals')
        .select('*, savings_goal_contributions(*)')
        .eq('user_id', authId)
        .ilike('name', `%${search}%`)
        .limit(1)

      if (!goals || goals.length === 0) {
        return { success: true, message: `No encontré ninguna meta con "${search}". Revisá la sección Objetivos para ver todas tus metas.` }
      }

      const g = goals[0]
      const contributions: any[] = g.savings_goal_contributions || []
      const total = contributions.reduce((s: number, c: any) => s + Number(c.amount), 0)
      const monthTotal = contributions
        .filter((c: any) => c.date.startsWith(currentMonth))
        .reduce((s: number, c: any) => s + Number(c.amount), 0)
      const effective = g.type === 'monthly' ? monthTotal : total
      const remaining = Math.max(Number(g.target_amount) - effective, 0)
      const pct = g.target_amount > 0 ? ((effective / g.target_amount) * 100).toFixed(1) : '0'

      let dateInfo = ''
      if (g.type === 'one_time' && g.target_date) {
        const targetDate = new Date(g.target_date)
        const daysLeft = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        dateInfo = daysLeft > 0 ? `\n⏳ ${daysLeft} días restantes` : '\n⚠️ Fecha objetivo vencida'
      }

      return {
        success: true,
        message: `🎯 **${g.name}** (${g.type === 'monthly' ? 'mensual' : 'meta única'})\n💰 ${g.currency} ${effective.toLocaleString()} / ${Number(g.target_amount).toLocaleString()} (${pct}%)\n📉 Te faltan: ${g.currency} ${remaining.toLocaleString()}${dateInfo}`,
      }
    }

    if (queryType === 'lista_presupuestos') {
      const { data: budgets } = await supabase
        .from('category_budgets')
        .select('*, categories(name, emoji)')
        .eq('user_id', authId)
        .eq('is_active', true)

      if (!budgets || budgets.length === 0) {
        return { success: true, message: '💰 No tenés presupuestos configurados. Podés crear uno diciéndome "Poneme un presupuesto de $X en Comida".' }
      }

      const today = now.toISOString().split('T')[0]
      const start = `${currentMonth}-01`
      const { data: expenses } = await supabase
        .from('transactions')
        .select('amount, category_id')
        .eq('user_id', authId)
        .eq('type', 'expense')
        .gte('date', start)
        .lte('date', today)

      const spentByCategory: Record<string, number> = {}
      expenses?.forEach((t: any) => {
        spentByCategory[t.category_id] = (spentByCategory[t.category_id] || 0) + Math.abs(Number(t.amount))
      })

      const lines = budgets.map((b: any) => {
        const cat = b.categories
        const spent = spentByCategory[b.category_id] || 0
        const pct = b.amount > 0 ? ((spent / b.amount) * 100).toFixed(1) : '0'
        const statusEmoji = Number(pct) >= 100 ? '🔴' : Number(pct) >= 80 ? '🟡' : '🟢'
        return `• ${statusEmoji} **${cat?.emoji || ''} ${cat?.name}**: ${spent.toLocaleString()} / ${Number(b.amount).toLocaleString()} ${b.currency} (${pct}%)`
      })

      return { success: true, message: `💰 **Presupuestos del mes:**\n${lines.join('\n')}` }
    }

    if (queryType === 'presupuesto_especifico' && search) {
      const { data: budgets } = await supabase
        .from('category_budgets')
        .select('*, categories(name, emoji)')
        .eq('user_id', authId)
        .eq('is_active', true)

      if (!budgets) return { success: true, message: 'No encontré presupuestos.' }

      const budget = budgets.find((b: any) =>
        b.categories?.name?.toLowerCase().includes(search.toLowerCase())
      )

      if (!budget) {
        return { success: true, message: `No encontré presupuesto para "${search}".` }
      }

      const today = now.toISOString().split('T')[0]
      const start = `${currentMonth}-01`
      const { data: expenses } = await supabase
        .from('transactions')
        .select('amount')
        .eq('user_id', authId)
        .eq('type', 'expense')
        .eq('category_id', budget.category_id)
        .gte('date', start)
        .lte('date', today)

      const spent = expenses?.reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0) ?? 0
      const limit = Number(budget.amount)
      const remaining = Math.max(limit - spent, 0)
      const pct = limit > 0 ? ((spent / limit) * 100).toFixed(1) : '0'
      const cat = budget.categories
      const statusEmoji = Number(pct) >= 100 ? '🔴 Superado' : Number(pct) >= 80 ? '🟡 Cuidado' : '🟢 OK'

      return {
        success: true,
        message: `💰 **Presupuesto ${cat?.emoji || ''} ${cat?.name}** — ${statusEmoji}\nGastaste: ${budget.currency} ${spent.toLocaleString()} / ${limit.toLocaleString()} (${pct}%)\nDisponible: ${budget.currency} ${remaining.toLocaleString()}`,
      }
    }

    return { success: true, message: 'No pude procesar la consulta sobre objetivos. Intentá ser más específico.' }
  } catch {
    return { success: false, message: 'Error al consultar objetivos' }
  }
}

async function handleEditGoal(data: GoalEditData): Promise<ChatResponse> {
  try {
    const supabase = await createClient()
    const authId = await getAuthUserId()
    if (!authId) return { success: false, message: 'No autorizado' }

    if (data.entity === 'objetivo') {
      const { data: goals } = await supabase
        .from('savings_goals')
        .select('id, name')
        .eq('user_id', authId)
        .ilike('name', `%${data.search}%`)
        .limit(1)

      if (!goals || goals.length === 0) {
        return { success: false, message: `No encontré ninguna meta con "${data.search}".` }
      }

      const goal = goals[0]
      const updates: Record<string, unknown> = {}
      if (data.changes.nombre) updates.name = data.changes.nombre
      if (data.changes.monto_objetivo) updates.target_amount = data.changes.monto_objetivo
      if (data.changes.fecha_objetivo) updates.target_date = data.changes.fecha_objetivo
      if (data.changes.moneda) updates.currency = data.changes.moneda

      const { error } = await supabase.from('savings_goals').update(updates).eq('id', goal.id)
      if (error) return { success: false, message: `Error al editar: ${error.message}` }

      return { success: true, message: `✅ Meta **"${goal.name}"** actualizada correctamente.` }
    }

    if (data.entity === 'presupuesto') {
      const { data: budgets } = await supabase
        .from('category_budgets')
        .select('id, categories(name)')
        .eq('user_id', authId)
        .eq('is_active', true)

      if (!budgets) return { success: false, message: 'Error al buscar presupuestos.' }

      const budget = budgets.find((b: any) =>
        b.categories?.name?.toLowerCase().includes(data.search.toLowerCase())
      )

      if (!budget) {
        return { success: false, message: `No encontré presupuesto para "${data.search}".` }
      }

      const updates: Record<string, unknown> = {}
      if (data.changes.monto_limite) updates.amount = data.changes.monto_limite
      if (data.changes.moneda) updates.currency = data.changes.moneda

      const { error } = await supabase.from('category_budgets').update(updates).eq('id', budget.id)
      if (error) return { success: false, message: `Error al editar: ${error.message}` }

      const catName = (budget as any).categories?.name || data.search
      return { success: true, message: `✅ Presupuesto de **${catName}** actualizado.` }
    }

    return { success: false, message: 'Entidad no reconocida para editar.' }
  } catch {
    return { success: false, message: 'Error inesperado al editar objetivo' }
  }
}

async function handleDeleteGoal(data: GoalDeleteData): Promise<ChatResponse> {
  try {
    const supabase = await createClient()
    const authId = await getAuthUserId()
    if (!authId) return { success: false, message: 'No autorizado' }

    if (data.entity === 'objetivo') {
      const { data: goals } = await supabase
        .from('savings_goals')
        .select('id, name')
        .eq('user_id', authId)
        .ilike('name', `%${data.search}%`)
        .limit(1)

      if (!goals || goals.length === 0) {
        return { success: false, message: `No encontré ninguna meta con "${data.search}".` }
      }

      const goal = goals[0]
      const { error } = await supabase.from('savings_goals').delete().eq('id', goal.id)
      if (error) return { success: false, message: `Error al eliminar: ${error.message}` }

      return { success: true, message: `🗑️ Meta **"${goal.name}"** eliminada (incluyendo todos sus aportes).` }
    }

    if (data.entity === 'presupuesto') {
      const { data: budgets } = await supabase
        .from('category_budgets')
        .select('id, categories(name)')
        .eq('user_id', authId)
        .eq('is_active', true)

      if (!budgets) return { success: false, message: 'Error al buscar presupuestos.' }

      const budget = budgets.find((b: any) =>
        b.categories?.name?.toLowerCase().includes(data.search.toLowerCase())
      )

      if (!budget) {
        return { success: false, message: `No encontré presupuesto para "${data.search}".` }
      }

      const { error } = await supabase.from('category_budgets').delete().eq('id', budget.id)
      if (error) return { success: false, message: `Error al eliminar: ${error.message}` }

      const catName = (budget as any).categories?.name || data.search
      return { success: true, message: `🗑️ Presupuesto de **${catName}** eliminado.` }
    }

    return { success: false, message: 'Entidad no reconocida para eliminar.' }
  } catch {
    return { success: false, message: 'Error inesperado al eliminar objetivo' }
  }
}

async function handleGoalContribution(data: GoalContributionData): Promise<ChatResponse> {
  try {
    const supabase = await createClient()
    const authId = await getAuthUserId()
    if (!authId) return { success: false, message: 'No autorizado' }

    const { data: goals } = await supabase
      .from('savings_goals')
      .select('id, name, target_amount, currency, type')
      .eq('user_id', authId)
      .ilike('name', `%${data.search}%`)
      .limit(1)

    if (!goals || goals.length === 0) {
      return { success: false, message: `No encontré ninguna meta con "${data.search}". Revisá la sección Objetivos.` }
    }

    const goal = goals[0]

    const { error } = await supabase.from('savings_goal_contributions').insert({
      goal_id: goal.id,
      user_id: authId,
      amount: data.amount,
      currency: data.currency,
      note: data.note,
      date: data.date,
    })

    if (error) return { success: false, message: `Error al registrar el aporte: ${error.message}` }

    // Calculate new total
    const { data: contributions } = await supabase
      .from('savings_goal_contributions')
      .select('amount, date')
      .eq('goal_id', goal.id)

    const total = contributions?.reduce((s: number, c: any) => s + Number(c.amount), 0) ?? data.amount

    // Para metas mensuales el progreso se mide por el mes actual
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthTotal = contributions
      ?.filter((c: any) => c.date.startsWith(currentMonth))
      .reduce((s: number, c: any) => s + Number(c.amount), 0) ?? data.amount

    const effectiveTotal = goal.type === 'monthly' ? monthTotal : total
    const targetAmount = Number(goal.target_amount)
    const pct = targetAmount > 0 ? Math.min((effectiveTotal / targetAmount) * 100, 100).toFixed(1) : '0'

    const isCompleted = targetAmount > 0 && effectiveTotal >= targetAmount

    if (isCompleted) {
      return {
        success: true,
        message: `🎉 ¡Aporte registrado!\n+${data.currency} ${data.amount.toLocaleString()} a **"${goal.name}"**\n\n🏆 **¡Meta completada!** Llegaste a ${goal.currency} ${effectiveTotal.toLocaleString()} / ${targetAmount.toLocaleString()} (100%). ¡Felicitaciones! Podés archivar la meta desde la sección Objetivos.`,
      }
    }

    return {
      success: true,
      message: `🐷 ¡Aporte registrado!\n+${data.currency} ${data.amount.toLocaleString()} a **"${goal.name}"**\n\nProgreso total: ${goal.currency} ${effectiveTotal.toLocaleString()} / ${targetAmount.toLocaleString()} (${pct}%)`,
    }
  } catch {
    return { success: false, message: 'Error inesperado al registrar el aporte' }
  }
}
