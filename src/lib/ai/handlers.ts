/**
 * Handlers para procesar intenciones del chat y guardar en la base de datos.
 */

import { createClient } from '@/utils/supabase/server'
import { addMonths } from 'date-fns'
import { formatLocalDate, parseLocalDate, calculateCreditPaymentDate } from '@/lib/utils/dates'
import type {
  TransactionData,
  InstallmentData,
  SubscriptionData,
  CardConfigData,
  EditData,
  DeleteData,
  CreateGoalData,
  CreateBudgetData,
  GoalEditData,
  GoalDeleteData,
  GoalContributionData,
} from './handlerTypes'

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
 * Delega la lógica de cálculo a calculateCreditPaymentDate de dates.ts (función canónica compartida).
 */
function calculateRealPaymentDate(
  purchaseDate: string,
  paymentMethod: ResolvedPaymentMethod | null
): string {
  if (!paymentMethod || paymentMethod.type !== 'credit') return purchaseDate
  if (paymentMethod.closingDay === null || paymentMethod.paymentDay === null) return purchaseDate
  return calculateCreditPaymentDate(purchaseDate, paymentMethod.closingDay, paymentMethod.paymentDay)
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

  // Bug fix: category_budgets.user_id es el UUID de auth (no el id numérico interno
  // que usan transactions/payment_methods), por eso el filtro con `userId` nunca
  // matcheaba y las alertas de presupuesto no disparaban nunca. Usamos
  // getAuthUserId() para obtener el UUID correcto (mismo fix que los casos
  // 'categoria' de handleEdit/handleDelete).
  const authId = await getAuthUserId()
  if (!authId) return null

  const { data: budget } = await supabase
    .from('category_budgets')
    .select('amount, currency, categories(name, emoji)')
    .eq('user_id', authId)
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .single()

  if (!budget) return null

  const now = new Date()
  // NOTA: se compara contra `date` (string YYYY-MM-DD) con formatLocalDate en vez de
  // toISOString() para evitar el corrimiento de día por UTC (regla del proyecto);
  // la comparación sigue siendo por fecha calendario cruda, sin componente de hora.
  const firstDay = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1))
  const lastDay = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))

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
export async function handleTransaction(data: TransactionData, userId: number): Promise<ChatResponse> {
  try {
    const supabase = await createClient()

    // Resolver payment method completo (con ciclo de tarjeta si aplica).
    // Si el usuario no menciona medio, se usa su predeterminado (is_default).
    const paymentMethod = await resolvePaymentMethod(
      supabase,
      userId,
      data.paymentMethodName,
      !data.paymentMethodName
    )

    // Calcular fecha real de pago (aplica lógica de tarjeta de crédito si corresponde)
    const realPaymentDate = calculateRealPaymentDate(data.date, paymentMethod)

    // Validación defensiva: si el modelo eligió una categoría de un tipo
    // distinto al detectado (ej. categoría de gasto para un ingreso), se
    // descarta en vez de guardar una combinación inconsistente.
    let categoryId = data.categoryId
    if (categoryId) {
      const { data: categoryRow } = await supabase
        .from('categories')
        .select('type')
        .eq('id', categoryId)
        .single()
      if (categoryRow && categoryRow.type !== data.type) {
        categoryId = null
      }
    }

    // Insertar la transacción
    const { error } = await supabase.from('transactions').insert({
      user_id: userId,
      description: data.description,
      amount: data.amount,
      date: realPaymentDate,
      type: data.type,
      category_id: categoryId,
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
        ? await checkBudgetAlert(supabase, userId, categoryId ?? null)
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
export async function handleInstallment(data: InstallmentData, userId: number): Promise<ChatResponse> {
  try {
    const supabase = await createClient()

    // Resolver payment method completo.
    // Si el usuario no menciona medio, se usa su predeterminado (is_default).
    const paymentMethod = await resolvePaymentMethod(
      supabase,
      userId,
      data.paymentMethodName,
      !data.paymentMethodName
    )

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
export async function handleSubscription(data: SubscriptionData, userId: number): Promise<ChatResponse> {
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
export async function handleCardConfig(data: CardConfigData, userId: number): Promise<ChatResponse> {
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

    // Actualizar transacciones futuras (>20 días desde hoy) al nuevo ciclo de la tarjeta
    try {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 20)
      const futureDateStr = formatLocalDate(futureDate)

      // Obtener transacciones futuras de esta tarjeta, incluyendo installment_plan_id para distinguir cuotas
      const { data: futureTxns, error: fetchError } = await supabase
        .from('transactions')
        .select('id, date, installment_plan_id, description')
        .eq('payment_method_id', method.id)
        .eq('user_id', userId)
        .eq('type', 'expense')
        .gt('date', futureDateStr)

      if (fetchError) {
        console.warn('Warning: could not fetch future transactions:', fetchError)
      } else if (futureTxns && futureTxns.length > 0) {
        // Separar cuotas de transacciones simples
        const installmentTxns = futureTxns.filter((t: { installment_plan_id: number | null }) => t.installment_plan_id !== null)
        const simpleTxns = futureTxns.filter((t: { installment_plan_id: number | null }) => t.installment_plan_id === null)

        // Para cuotas: recalcular desde purchase_date del plan usando la nueva configuración
        if (installmentTxns.length > 0) {
          const planIds = [...new Set(installmentTxns.map((t: { installment_plan_id: number }) => t.installment_plan_id))]
          const { data: plans } = await supabase
            .from('installment_plans')
            .select('id, purchase_date, installments_count')
            .in('id', planIds)
            .eq('user_id', userId)

          if (plans) {
            for (const plan of plans) {
              const firstDate = calculateCreditPaymentDate(plan.purchase_date, data.closingDay, data.paymentDay)
              const planTxns = installmentTxns.filter((t: { installment_plan_id: number }) => t.installment_plan_id === plan.id)

              for (const txn of planTxns) {
                // Extraer el índice de cuota desde la descripción "(X/Y)"
                const match = txn.description.match(/\((\d+)\/\d+\)$/)
                const installmentIndex = match ? parseInt(match[1], 10) - 1 : 0
                const newDate = formatLocalDate(addMonths(parseLocalDate(firstDate), installmentIndex))
                await supabase.from('transactions').update({ date: newDate }).eq('id', txn.id)
              }
            }
          }
        }

        // Para transacciones simples: ajustar solo el día de vencimiento dentro del mismo mes.
        // No es posible recalcular exactamente sin conocer la fecha de compra original.
        for (const txn of simpleTxns) {
          const oldDate = parseLocalDate(txn.date)
          oldDate.setDate(data.paymentDay)
          await supabase.from('transactions').update({ date: formatLocalDate(oldDate) }).eq('id', txn.id)
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

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount)
}

export async function handlePortfolio(supabase: any, userId: number): Promise<ChatResponse> {
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

// ============================================
// Handlers de edición y eliminación
// ============================================

/**
 * Maneja la edición de entidades existentes.
 */
export async function handleEdit(data: EditData, userId: number): Promise<ChatResponse> {
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

        // Resolver categoría por nombre si se proporcionó.
        // Bug fix: categories.user_id es el UUID de auth (no el id numérico interno
        // que usan transactions/payment_methods), por eso el filtro con `userId`
        // nunca matcheaba y el cambio de categoría se ignoraba en silencio. Usamos
        // getAuthUserId() + el mismo patrón `.or(...)` que dataLoader.ts para incluir
        // también las categorías del sistema (mismo fix que el case 'categoria').
        if (data.changes.category) {
          const authId = await getAuthUserId()
          if (authId) {
            const { data: cats } = await supabase
              .from('categories')
              .select('id, name')
              .or(`user_id.eq.${authId},is_system.eq.true`)
              .ilike('name', `%${data.changes.category}%`)
              .limit(1)

            if (cats && cats.length > 0) {
              updates.category_id = cats[0].id
            }
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
        // Bug fix: categories.user_id es el UUID de auth (no el id numérico interno
        // que usan transactions/payment_methods), por eso el filtro con `userId`
        // nunca matcheaba. Usamos getAuthUserId() para obtener el UUID correcto
        // (mismo fix que Task 12 aplicó a handleDelete).
        const authId = await getAuthUserId()
        if (!authId) return { success: false, message: 'No autorizado' }

        const { data: cats, error } = await supabase
          .from('categories')
          .select('id, name, emoji')
          .eq('user_id', authId)
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
          .eq('user_id', authId)

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
 *
 * Stateless: reemplaza al viejo flujo `pendingActions` (Map en memoria del módulo),
 * que se rompía en Vercel porque cada request puede caer en una lambda distinta y
 * el Map llega vacío. Ahora `data.confirmed`/`data.reassignTo` viajan en el propio
 * intent (el cliente/LLM reenvía el intent completo al confirmar), así que no hay
 * estado compartido entre requests.
 *
 * Para las entidades con dependencias (medio_pago, categoria, cuota):
 * - `confirmed` ausente/false → devuelve el mensaje ⚠️ de confirmación, no borra nada.
 * - `confirmed: true` + `reassignTo` → reasigna las dependencias a la entidad indicada
 *   y después borra la original (lógica que antes vivía en `handleConfirmAction`).
 * - `confirmed: true` sin `reassignTo` → borra directo (para `cuota`, incluye sus
 *   transacciones/cuotas futuras).
 */
export async function handleDelete(
  data: DeleteData & { confirmed?: boolean; reassignTo?: string | null },
  userId: number
): Promise<ChatResponse> {
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

        // Verificar dependencias: Mensualidades
        const { count: subCount } = await supabase
          .from('recurring_plans')
          .select('id', { count: 'exact' })
          .eq('payment_method_id', method.id)
          .eq('user_id', userId)

        const totalDeps = (txCount ?? 0) + (planCount ?? 0) + (subCount ?? 0)

        if (totalDeps > 0) {
          if (!data.confirmed) {
            const details: string[] = []
            if (txCount && txCount > 0) details.push(`${txCount} transacciones`)
            if (planCount && planCount > 0) details.push(`${planCount} planes de cuotas`)
            if (subCount && subCount > 0) details.push(`${subCount} Mensualidades`)

            return {
              success: true,
              message: `⚠️ El medio de pago "${method.name}" tiene ${details.join(', ')} asociadas. ¿Querés reasignarlas a otro medio de pago, o cancelar la eliminación?`,
            }
          }

          if (data.reassignTo) {
            // Buscar el nuevo medio de pago
            const newMethod = await resolvePaymentMethod(supabase, userId, data.reassignTo)
            if (!newMethod) {
              return { success: false, message: `No encontré un medio de pago que coincida con "${data.reassignTo}".` }
            }

            // Reasignar transacciones
            await supabase
              .from('transactions')
              .update({ payment_method_id: newMethod.id })
              .eq('payment_method_id', method.id)
              .eq('user_id', userId)

            // Reasignar planes de cuotas
            await supabase
              .from('installment_plans')
              .update({ payment_method_id: newMethod.id })
              .eq('payment_method_id', method.id)
              .eq('user_id', userId)

            // Reasignar Mensualidades
            await supabase
              .from('recurring_plans')
              .update({ payment_method_id: newMethod.id })
              .eq('payment_method_id', method.id)
              .eq('user_id', userId)

            // Eliminar el medio de pago original
            await supabase
              .from('payment_methods')
              .delete()
              .eq('id', method.id)
              .eq('user_id', userId)

            return {
              success: true,
              message: `✅ ${totalDeps} entidades reasignadas a "${newMethod.name}". Medio de pago "${method.name}" eliminado.`,
            }
          }

          // confirmed sin reassignTo: cae al borrado directo de abajo
        }

        // Sin dependencias (o confirmado sin reasignación): eliminar directamente
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
        // Bug fix: categories.user_id es el UUID de auth (no el id numérico interno
        // que usan transactions/payment_methods), por eso el filtro con `userId` nunca
        // matcheaba. Usamos getAuthUserId() para obtener el UUID correcto.
        const authId = await getAuthUserId()
        if (!authId) return { success: false, message: 'No autorizado' }

        const { data: cats, error } = await supabase
          .from('categories')
          .select('id, name, emoji')
          .eq('user_id', authId)
          .ilike('name', `%${data.search}%`)
          .limit(1)

        if (error || !cats || cats.length === 0) {
          return { success: false, message: `No encontré una categoría que coincida con "${data.search}".` }
        }

        const cat = cats[0]

        // Verificar dependencias (transactions.user_id sí es numérico)
        const { count: txCount } = await supabase
          .from('transactions')
          .select('id', { count: 'exact' })
          .eq('category_id', cat.id)
          .eq('user_id', userId)

        if (txCount && txCount > 0) {
          if (!data.confirmed) {
            return {
              success: true,
              message: `⚠️ La categoría "${cat.emoji || ''} ${cat.name}" tiene ${txCount} transacciones asociadas. ¿Querés reasignarlas a otra categoría, o cancelar?`,
            }
          }

          if (data.reassignTo) {
            // Buscar la nueva categoría
            const { data: newCats } = await supabase
              .from('categories')
              .select('id, name, emoji')
              .eq('user_id', authId)
              .ilike('name', `%${data.reassignTo}%`)
              .limit(1)

            if (!newCats || newCats.length === 0) {
              return { success: false, message: `No encontré una categoría que coincida con "${data.reassignTo}".` }
            }

            const newCat = newCats[0]

            // Reasignar transacciones
            await supabase
              .from('transactions')
              .update({ category_id: newCat.id })
              .eq('category_id', cat.id)
              .eq('user_id', userId)

            // Eliminar la categoría original
            await supabase
              .from('categories')
              .delete()
              .eq('id', cat.id)
              .eq('user_id', authId)

            return {
              success: true,
              message: `✅ ${txCount} transacciones reasignadas a "${newCat.emoji || ''} ${newCat.name}". Categoría "${cat.name}" eliminada.`,
            }
          }

          // confirmed sin reassignTo: cae al borrado directo de abajo
        }

        const { error: deleteError } = await supabase
          .from('categories')
          .delete()
          .eq('id', cat.id)
          .eq('user_id', authId)

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

        // Mensualidades se desactivan, no se eliminan hard
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
          if (!data.confirmed) {
            return {
              success: true,
              message: `⚠️ El plan "${plan.description}" tiene ${futureCount} cuotas futuras. ¿Confirmo eliminar el plan y sus cuotas pendientes, o cancelar?`,
            }
          }

          // Cuota no soporta reasignación: si piden reasignar, rechazar sin borrar
          // (mismo comportamiento que el viejo handleConfirmAction).
          if (data.reassignTo) {
            return { success: false, message: 'Reasignación no soportada para este tipo de entidad.' }
          }

          // Confirmado: eliminar cuotas futuras + plan
          await supabase
            .from('transactions')
            .delete()
            .eq('installment_plan_id', plan.id)
            .eq('user_id', userId)
            .gte('date', today)

          await supabase
            .from('installment_plans')
            .delete()
            .eq('id', plan.id)
            .eq('user_id', userId)

          return {
            success: true,
            message: `🗑️ Plan "${plan.description}" eliminado junto con sus ${futureCount} cuotas futuras.`,
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

export async function handleCreateGoal(data: CreateGoalData): Promise<ChatResponse> {
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

export async function handleCreateBudget(data: CreateBudgetData): Promise<ChatResponse> {
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

export async function handleEditGoal(data: GoalEditData): Promise<ChatResponse> {
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

export async function handleDeleteGoal(data: GoalDeleteData): Promise<ChatResponse> {
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

export async function handleGoalContribution(data: GoalContributionData): Promise<ChatResponse> {
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
