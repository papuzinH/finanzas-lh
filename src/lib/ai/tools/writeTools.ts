import { z } from 'zod'
import type { ToolDef } from './types'
import {
  handleTransaction,
  handleInstallment,
  handleSubscription,
  handleCardConfig,
} from '@/lib/ai/handlers'
import type { TransactionData, InstallmentData, SubscriptionData, CardConfigData } from '@/lib/ai/intentParser'

// Campos compartidos entre create_transaction y create_installment_plan: misma forma
// y misma descripción orientada al modelo (diccionario de categorías del prompt,
// medio predeterminado, fecha de hoy del contexto).
const categoriaIdField = z
  .string()
  .nullable()
  .describe('UUID del DICCIONARIO DE CATEGORÍAS del prompt; null si ninguna aplica')
const medioPagoField = z.string().nullable().describe('Nombre del medio; null usa el predeterminado')
const fechaField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('YYYY-MM-DD; si el usuario no dice, la fecha de hoy del contexto')

const createTransactionSchema = z.object({
  descripcion: z.string().min(1),
  monto: z.number().positive(),
  tipo: z.enum(['expense', 'income']),
  categoria_id: categoriaIdField,
  medio_pago: medioPagoField,
  fecha: fechaField,
})

const createInstallmentPlanSchema = z.object({
  descripcion: z.string().min(1),
  monto_total: z.number().positive().describe('Monto TOTAL de la compra (no el de cada cuota)'),
  cantidad_cuotas: z.number().int().min(2).max(60),
  categoria_id: categoriaIdField,
  medio_pago: medioPagoField,
  fecha: fechaField,
})

const createRecurringPlanSchema = z.object({
  descripcion: z.string().min(1),
  monto: z.number().positive(),
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
  categoria_id: categoriaIdField,
  medio_pago: medioPagoField,
})

const setCardDatesSchema = z.object({
  medio_pago: z.string().min(1).describe('Nombre (o parte del nombre) de la tarjeta a configurar'),
  dia_cierre: z.number().int().min(1).max(31),
  dia_vencimiento: z.number().int().min(1).max(31),
})

const createCategorySchema = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(['expense', 'income']),
  emoji: z.string().optional(),
})

const createPaymentMethodSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(['credit', 'debit', 'cash']),
  dia_cierre: z
    .number()
    .int()
    .min(1)
    .max(31)
    .optional()
    .describe('Día de cierre del resumen; solo aplica si tipo es "credit"'),
  dia_vencimiento: z
    .number()
    .int()
    .min(1)
    .max(31)
    .optional()
    .describe('Día de vencimiento del pago; solo aplica si tipo es "credit"'),
})

/**
 * Normaliza un nombre para el duplicate-check exacto case-insensitive de
 * create_category/create_payment_method: trim + lowercase. NO usar ilike para esto:
 * sin escapar, % y _ del input son wildcards LIKE vivos y convierten el chequeo en
 * substring match (fix post-review Task 11).
 */
function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

export const writeTools: ToolDef[] = [
  {
    name: 'create_transaction',
    description:
      'Registra un gasto o ingreso nuevo (no en cuotas, no recurrente). Usar cuando el usuario cuenta que compró algo, pagó algo, o recibió plata (sueldo, transferencia, etc.). Devuelve un mensaje de confirmación.',
    kind: 'write',
    schema: createTransactionSchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof createTransactionSchema>
      const data: TransactionData = {
        description: args.descripcion,
        amount: args.monto,
        type: args.tipo,
        categoryId: args.categoria_id,
        categoryName: null,
        paymentMethodName: args.medio_pago,
        date: args.fecha,
        isReal: true,
      }
      const res = await handleTransaction(data, ctx.userId)
      return { ok: res.success, data: { mensaje: res.message }, mutated: res.success }
    },
  },
  {
    name: 'create_installment_plan',
    description:
      'Registra una compra en cuotas: crea el plan y todas las transacciones futuras (una por cuota). Usar cuando el usuario dice que compró algo "en cuotas" o financiado. `monto_total` es el total de la compra, no el de cada cuota. Devuelve confirmación con el total y la cantidad de cuotas.',
    kind: 'write',
    schema: createInstallmentPlanSchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof createInstallmentPlanSchema>
      const data: InstallmentData = {
        description: args.descripcion,
        amount: args.monto_total / args.cantidad_cuotas,
        totalAmount: args.monto_total,
        installmentsCount: args.cantidad_cuotas,
        type: 'expense',
        categoryId: args.categoria_id,
        categoryName: null,
        paymentMethodName: args.medio_pago,
        date: args.fecha,
        isReal: true,
      }
      const res = await handleInstallment(data, ctx.userId)
      return { ok: res.success, data: { mensaje: res.message }, mutated: res.success }
    },
  },
  {
    name: 'create_recurring_plan',
    description:
      'Crea una mensualidad (suscripción o gasto fijo recurrente, ej. Netflix, alquiler, gimnasio). Usar cuando el usuario quiere registrar un gasto que se repite todos los meses. Devuelve confirmación.',
    kind: 'write',
    schema: createRecurringPlanSchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof createRecurringPlanSchema>
      const data: SubscriptionData = {
        description: args.descripcion,
        amount: args.monto,
        currency: args.moneda,
        frequency: 'monthly',
        categoryId: args.categoria_id,
        categoryName: null,
        paymentMethodName: args.medio_pago,
      }
      const res = await handleSubscription(data, ctx.userId)
      return { ok: res.success, data: { mensaje: res.message }, mutated: res.success }
    },
  },
  {
    name: 'set_card_dates',
    description:
      'Configura o actualiza el día de cierre y de vencimiento de una tarjeta de crédito existente. Usar cuando el usuario dice cuándo cierra o vence su tarjeta. Recalcula automáticamente las fechas de las transacciones futuras de esa tarjeta.',
    kind: 'write',
    schema: setCardDatesSchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof setCardDatesSchema>
      const data: CardConfigData = {
        paymentMethodName: args.medio_pago,
        closingDay: args.dia_cierre,
        paymentDay: args.dia_vencimiento,
      }
      const res = await handleCardConfig(data, ctx.userId)
      return { ok: res.success, data: { mensaje: res.message }, mutated: res.success }
    },
  },
  {
    name: 'create_category',
    description:
      'Crea una categoría nueva (de gasto o ingreso) cuando ninguna de las existentes en el diccionario de categorías del prompt aplica. Rechaza duplicados por nombre (case-insensitive) sin crear nada.',
    kind: 'write',
    schema: createCategorySchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof createCategorySchema>
      const { supabase, authUserId } = ctx

      // Duplicado: comparación EXACTA case-insensitive client-side sobre las
      // categorías del usuario — categories.user_id es UUID (Task 7 Step 0), NO el
      // userId numérico. No se usa ilike: sin escapar, % y _ en el nombre son
      // wildcards LIKE vivos (ej. "Compras 20%" matchearía "Compras..." por substring
      // y bloquearía creaciones legítimas).
      const { data: existing, error: findError } = await supabase
        .from('categories')
        .select('name')
        .eq('user_id', authUserId)

      if (findError) {
        console.error('Error checking category duplicates:', findError)
        return { ok: false, error: 'No pude verificar si la categoría ya existía.', mutated: false }
      }

      const nombreNorm = normalizeName(args.nombre)
      const rows = (existing ?? []) as { name: string }[]
      if (rows.some((row) => normalizeName(row.name) === nombreNorm)) {
        return { ok: false, error: `Ya existe una categoría llamada "${args.nombre}".`, mutated: false }
      }

      const { error: insertError } = await supabase.from('categories').insert({
        user_id: authUserId,
        name: args.nombre,
        type: args.tipo,
        emoji: args.emoji ?? null,
      })

      if (insertError) {
        console.error('Error creating category:', insertError)
        return { ok: false, error: 'No pude crear la categoría.', mutated: false }
      }

      const label = args.emoji ? `${args.emoji} ${args.nombre}` : args.nombre
      return { ok: true, data: { mensaje: `✅ Categoría "${label}" creada.` }, mutated: true }
    },
  },
  {
    name: 'create_payment_method',
    description:
      'Crea un medio de pago nuevo (tarjeta de crédito, débito o efectivo). Para crédito, opcionalmente configura el día de cierre y vencimiento (también se puede hacer después con set_card_dates). Rechaza duplicados por nombre (case-insensitive) sin crear nada.',
    kind: 'write',
    schema: createPaymentMethodSchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof createPaymentMethodSchema>
      const { supabase, userId } = ctx

      // Duplicado: comparación EXACTA case-insensitive client-side sobre los medios
      // del usuario — payment_methods.user_id es numérico (Task 7 Step 0), NO el UUID
      // de auth. Sin ilike, por el mismo motivo que create_category (% y _ son
      // wildcards LIKE vivos).
      const { data: existing, error: findError } = await supabase
        .from('payment_methods')
        .select('name')
        .eq('user_id', userId)

      if (findError) {
        console.error('Error checking payment method duplicates:', findError)
        return { ok: false, error: 'No pude verificar si el medio de pago ya existía.', mutated: false }
      }

      const nombreNorm = normalizeName(args.nombre)
      const rows = (existing ?? []) as { name: string }[]
      if (rows.some((row) => normalizeName(row.name) === nombreNorm)) {
        return { ok: false, error: `Ya existe un medio de pago llamado "${args.nombre}".`, mutated: false }
      }

      const { error: insertError } = await supabase.from('payment_methods').insert({
        user_id: userId,
        name: args.nombre,
        type: args.tipo,
        // Los días de cierre/vencimiento solo tienen sentido para crédito: se
        // ignoran (ni siquiera se setean) si el modelo los manda para débito/efectivo.
        ...(args.tipo === 'credit'
          ? { default_closing_day: args.dia_cierre ?? null, default_payment_day: args.dia_vencimiento ?? null }
          : {}),
      })

      if (insertError) {
        console.error('Error creating payment method:', insertError)
        return { ok: false, error: 'No pude crear el medio de pago.', mutated: false }
      }

      return { ok: true, data: { mensaje: `✅ Medio de pago "${args.nombre}" creado.` }, mutated: true }
    },
  },
]
