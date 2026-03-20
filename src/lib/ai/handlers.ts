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
  QueryType,
  QueryFilters,
} from './intentParser'

export interface ChatResponse {
  success: boolean
  message: string
  data?: any
}

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
    case 'conversation':
      return { success: true, message: intent.reply }
    case 'error':
      return { success: false, message: intent.message }
  }
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

    return {
      success: true,
      message: `✅ ${typeLabel} registrado: ${data.description} - $${data.amount}${methodLabel}`,
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
