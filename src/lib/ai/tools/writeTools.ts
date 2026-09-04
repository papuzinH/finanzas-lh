import { z } from 'zod'
import type { ToolDef } from './types'
import { necesitaDeclararMes, mesesCandidatos, resolverImputacion } from '@/lib/finance/imputacion-ingresos'
import {
  handleTransaction,
  handleInstallment,
  handleSubscription,
  handleCardConfig,
  handleEdit,
  handleDelete,
  handleCreateGoal,
  handleCreateBudget,
  handleEditGoal,
  handleDeleteGoal,
  handleGoalContribution,
} from '@/lib/ai/handlers'
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
} from '@/lib/ai/handlerTypes'

// Campos compartidos entre create_transaction y create_installment_plan: misma forma
// y misma descripción orientada al modelo (diccionario de categorías del prompt,
// medio predeterminado, fecha de hoy del contexto).
const categoriaIdField = z
  .string()
  .nullable()
  .optional()
  .describe('UUID del DICCIONARIO DE CATEGORÍAS del prompt; null si ninguna aplica')
const medioPagoField = z
  .string()
  .nullable()
  .optional()
  .describe('Nombre del medio; null usa el predeterminado')
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
  mes_del_cobro: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable()
    .optional()
    .describe(
      'YYYY-MM: a que mes cuenta el cobro. Solo para ingresos cobrados en los ultimos dias del mes; null en cualquier otro caso',
    ),
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

// --- Tools de Task 13 (Fase 2 cierre): edición/borrado genérico + objetivos y
// presupuestos. Los enums de `entidad` son subconjuntos de `EntityType` de handlerTypes:
// update_entity NO incluye 'cuota' (handleEdit no tiene case para editarla — caería al
// default "no soportada"), delete_entity sí (handleDelete la soporta).
const updatableEntityEnum = z.enum(['transaccion', 'medio_pago', 'categoria', 'suscripcion', 'objetivo', 'presupuesto'])
const deletableEntityEnum = z.enum(['transaccion', 'medio_pago', 'categoria', 'suscripcion', 'cuota'])
const goalOrBudgetEnum = z.enum(['objetivo', 'presupuesto'])

const updateEntitySchema = z.object({
  entidad: updatableEntityEnum,
  busqueda: z.string().min(1).describe('Texto para encontrar la entidad (nombre/descripción, coincidencia parcial)'),
  // z.record pierde su schema de valores al convertirse para Gemini (queda en
  // additionalProperties, que clean() de schema.ts borra): toda la guía de forma y
  // tipos tiene que viajar en este describe.
  cambios: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .describe(
      'Objeto PLANO campo→valor con los campos a modificar (sin objetos ni arrays anidados). Cada valor debe ser ' +
        'string, number o boolean. Campos válidos según `entidad` — transaccion: description (string), amount ' +
        '(number), type ("expense"|"income"), category (string, nombre de la categoría), payment_method (string, ' +
        'nombre del medio); medio_pago: name (string), type ("credit"|"debit"|"cash"), closing_day (number), ' +
        'payment_day (number); categoria: name (string), emoji (string); suscripcion: description (string), ' +
        'amount (number), currency ("ARS"|"USD"), is_active (boolean); objetivo: nombre (string), monto_objetivo ' +
        '(number), fecha_objetivo (string YYYY-MM-DD), moneda ("ARS"|"USD"); presupuesto: monto_limite (number), ' +
        'moneda ("ARS"|"USD").',
    ),
})

const deleteEntitySchema = z.object({
  entidad: deletableEntityEnum,
  busqueda: z.string().min(1).describe('Texto para encontrar la entidad a eliminar (coincidencia parcial)'),
  confirmed: z
    .boolean()
    .default(false)
    .describe('true SOLO si el usuario ya confirmó explícitamente en este hilo'),
  reasignar_a: z
    .string()
    .nullable()
    .optional()
    .describe('Nombre de la entidad destino para reasignar dependencias antes de borrar (solo si aplica)'),
})

const deleteGoalOrBudgetSchema = z.object({
  entidad: goalOrBudgetEnum,
  busqueda: z.string().min(1).describe('Nombre de la meta o categoría del presupuesto a eliminar'),
})

const createGoalSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(['one_time', 'monthly']).describe('one_time: meta puntual con fecha límite; monthly: meta que se reinicia cada mes'),
  monto_objetivo: z.number().positive(),
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
  fecha_objetivo: z
    .string()
    .nullable()
    .optional()
    .describe('YYYY-MM-DD; null si no aplica (ej. metas mensuales)'),
})

const createBudgetSchema = z.object({
  categoria_id: z.string().min(1).describe('UUID del DICCIONARIO DE CATEGORÍAS del prompt (obligatoria, un presupuesto es siempre por categoría)'),
  monto_limite: z.number().positive(),
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
})

const contributeToGoalSchema = z.object({
  busqueda: z.string().min(1).describe('Nombre de la meta a la que se aporta (coincidencia parcial)'),
  monto: z.number().positive(),
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
  nota: z
    .string()
    .nullable()
    .optional()
    .describe('Comentario libre del aporte; null si el usuario no dijo nada'),
  fecha: fechaField,
})

export const writeTools: ToolDef[] = [
  {
    name: 'create_transaction',
    description:
      'Registra un gasto o ingreso nuevo (no en cuotas, no recurrente). Usar cuando el usuario cuenta que compró algo, pagó algo, o recibió plata (sueldo, transferencia, etc.). Devuelve un mensaje de confirmación.',
    kind: 'write',
    schema: createTransactionSchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof createTransactionSchema>

      // El cobro del 29 de agosto puede ser de agosto trabajado o de septiembre por
      // adelantado, y no hay forma de saberlo sin preguntar. Se devuelve el pedido al
      // MODELO -- el mismo patron de dos pasos sin estado que usa delete_entity -- en
      // vez de imputarlo por una regla que va a acertar la mitad de las veces.
      //
      // A DIFERENCIA de los dialogos y del banner del home, aca la pregunta se hace
      // TAMBIEN si el medio es una tarjeta: `args.medio_pago` es un nombre suelto y
      // saber su `type` exige un lookup extra que esta tool no hace hoy. Queda dicho
      // en vez de por omision: si alguna vez se resuelve el medio antes de este punto,
      // la condicion tiene que sumar `!medioEsCredito`, igual que imputacionAlGuardar.
      // El costo de no hacerlo es una pregunta de mas por chat, no un numero movido:
      // el ciclo le gana a income_period en prepare.ts, salvo tarjeta sin dias por
      // defecto.
      if (args.tipo === 'income' && necesitaDeclararMes(args.fecha) && !args.mes_del_cobro) {
        const [esteMes, mesSiguiente] = mesesCandidatos(args.fecha)
        return {
          ok: false,
          error:
            `Ese cobro cae en los últimos días del mes. Preguntale al usuario a qué mes cuenta esa plata ` +
            `(${esteMes.label} o ${mesSiguiente.label}) y volvé a llamar a la tool con mes_del_cobro.`,
        }
      }

      // `resolverImputacion` es quien decide, no el modelo: `mes_del_cobro` llega de un
      // LLM y puede alucinar un mes que no es ninguno de los dos candidatos reales de
      // `fecha` (otro año, un typo). Si eso pasa, se descarta y cae al default -- acá
      // sin preferencia de usuario (`null`): el chat no trae hoy `income_counts_next_month`
      // en su contexto (Task 8, ver CLAUDE.md/dataLoader.ts) y sumarlo solo para cubrir
      // esta rama defensiva (el modelo YA mandó un mes válido en el camino normal) no se
      // justifica. Sin preferencia, `mesPorDefecto` cae al mes de la propia fecha --
      // mismo default que ve el formulario antes de que el usuario toque el selector.
      const incomePeriod =
        args.tipo === 'income'
          ? resolverImputacion(args.fecha, args.mes_del_cobro ? `${args.mes_del_cobro}-01` : null, null)
          : null

      const data: TransactionData = {
        description: args.descripcion,
        amount: args.monto,
        type: args.tipo,
        categoryId: args.categoria_id ?? null,
        categoryName: null,
        paymentMethodName: args.medio_pago ?? null,
        date: args.fecha,
        isReal: true,
        incomePeriod,
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
        categoryId: args.categoria_id ?? null,
        categoryName: null,
        paymentMethodName: args.medio_pago ?? null,
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
        categoryId: args.categoria_id ?? null,
        categoryName: null,
        paymentMethodName: args.medio_pago ?? null,
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
  {
    name: 'update_entity',
    description:
      'Edita una entidad existente: transacción, medio de pago, categoría, suscripción, objetivo (meta de ' +
      'ahorro) o presupuesto. Usar cuando el usuario pide corregir o cambiar algo ya registrado (ej. "cambiale el ' +
      'monto a la compra del supermercado", "la meta del viaje ahora es de $800.000"). `busqueda` matchea por ' +
      'nombre/descripción (coincidencia parcial); si hay varias coincidencias, se edita la más reciente/relevante. ' +
      '`cambios` solo debe incluir los campos que el usuario efectivamente quiere modificar.',
    kind: 'write',
    schema: updateEntitySchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof updateEntitySchema>

      // objetivo/presupuesto viven en tablas propias (savings_goals/category_budgets,
      // filtradas por el UUID de auth) y su handler no toma userId; el resto pasa por
      // handleEdit (mismo patrón que delete_entity/delete_goal_or_budget más abajo).
      if (args.entidad === 'objetivo' || args.entidad === 'presupuesto') {
        const data: GoalEditData = { entity: args.entidad, search: args.busqueda, changes: args.cambios }
        const res = await handleEditGoal(data)
        return { ok: res.success, data: { mensaje: res.message }, mutated: res.success }
      }

      const data: EditData = { entity: args.entidad, search: args.busqueda, changes: args.cambios }
      const res = await handleEdit(data, ctx.userId)
      return { ok: res.success, data: { mensaje: res.message }, mutated: res.success }
    },
  },
  {
    name: 'delete_entity',
    description:
      'Elimina una transacción, medio de pago, categoría, suscripción o cuota. Para metas de ahorro o presupuestos ' +
      'usar delete_goal_or_budget en su lugar. IMPORTANTE — flujo de confirmación en dos pasos: la PRIMERA llamada ' +
      'para una eliminación siempre debe ir con `confirmed=false`. Si la respuesta trae un mensaje que empieza con ' +
      '⚠️ (la entidad tiene otras cosas asociadas), NO vuelvas a llamar la tool en el mismo turno: preguntale al ' +
      'usuario si quiere reasignar esas dependencias a otra entidad (usando `reasignar_a`) o cancelar, y recién en ' +
      'el PRÓXIMO mensaje del usuario, con su confirmación explícita, volvé a llamar esta tool con `confirmed=true`.',
    kind: 'write',
    schema: deleteEntitySchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof deleteEntitySchema>
      const data: DeleteData & { confirmed?: boolean; reassignTo?: string | null } = {
        entity: args.entidad,
        search: args.busqueda,
        confirmed: args.confirmed,
        reassignTo: args.reasignar_a ?? null,
      }
      const res = await handleDelete(data, ctx.userId)
      // El mensaje ⚠️ es una PREGUNTA de confirmación, no un borrado real: no mutó nada
      // aunque success sea true (mismo criterio que Task 12 documentó en handleDelete).
      const mutated = res.success && !res.message.startsWith('⚠️')
      return { ok: res.success, data: { mensaje: res.message }, mutated }
    },
  },
  {
    name: 'delete_goal_or_budget',
    description:
      'Elimina una meta de ahorro o un presupuesto por categoría. A diferencia de delete_entity, esta eliminación ' +
      'es directa (no tiene dependencias que reasignar), así que confirmá con el usuario en la conversación ANTES ' +
      'de llamar esta tool — la acción no se puede deshacer (borra la meta con todos sus aportes).',
    kind: 'write',
    schema: deleteGoalOrBudgetSchema,
    execute: async (rawArgs, _ctx) => {
      const args = rawArgs as z.infer<typeof deleteGoalOrBudgetSchema>
      const data: GoalDeleteData = { entity: args.entidad, search: args.busqueda }
      const res = await handleDeleteGoal(data)
      return { ok: res.success, data: { mensaje: res.message }, mutated: res.success }
    },
  },
  {
    name: 'create_goal',
    description:
      'Crea una meta de ahorro nueva. Usar cuando el usuario dice que quiere ahorrar para algo (ej. "quiero ' +
      'ahorrar $500.000 para un viaje", "quiero juntar $50.000 por mes"). `tipo` es "one_time" para una meta ' +
      'puntual con fecha límite, o "monthly" si se reinicia cada mes (sin fecha límite). Después se le pueden ' +
      'registrar aportes con contribute_to_goal.',
    kind: 'write',
    schema: createGoalSchema,
    execute: async (rawArgs, _ctx) => {
      const args = rawArgs as z.infer<typeof createGoalSchema>
      const data: CreateGoalData = {
        name: args.nombre,
        type: args.tipo,
        targetAmount: args.monto_objetivo,
        currency: args.moneda,
        targetDate: args.fecha_objetivo ?? null,
      }
      const res = await handleCreateGoal(data)
      return { ok: res.success, data: { mensaje: res.message }, mutated: res.success }
    },
  },
  {
    name: 'create_budget',
    description:
      'Configura un presupuesto mensual para una categoría de gasto. Usar cuando el usuario quiere ponerse un ' +
      'límite de gasto por categoría (ej. "poneme un presupuesto de $100.000 en Comida"). Si ya existe un ' +
      'presupuesto para esa categoría, lo reemplaza. Chanchito avisará cuando el usuario se acerque al límite.',
    kind: 'write',
    schema: createBudgetSchema,
    execute: async (rawArgs, ctx) => {
      const args = rawArgs as z.infer<typeof createBudgetSchema>
      const { supabase, authUserId } = ctx

      // handleCreateBudget usa `categoryName` solo para armar el mensaje de
      // confirmación (no se persiste): se resuelve acá con una query directa a
      // `categories` filtrada por `authUserId` (columna UUID — mismo criterio
      // documentado en dataLoader.ts Step 0), en vez de reusar loadFinanceData
      // completo (trae transacciones/tasas/etc.) solo para este lookup. Si no se
      // encuentra, cae al id crudo como fallback (mismo patrón que
      // list_goals_and_budgets: `cat?.name ?? b.category_id`).
      const { data: cat } = await supabase
        .from('categories')
        .select('name, emoji')
        .eq('id', args.categoria_id)
        .eq('user_id', authUserId)
        .maybeSingle()

      const found = cat as { name: string; emoji: string | null } | null
      const categoryName = found ? [found.emoji, found.name].filter(Boolean).join(' ') : args.categoria_id

      const data: CreateBudgetData = {
        categoryName,
        categoryId: args.categoria_id,
        limitAmount: args.monto_limite,
        currency: args.moneda,
      }
      const res = await handleCreateBudget(data)
      return { ok: res.success, data: { mensaje: res.message }, mutated: res.success }
    },
  },
  {
    name: 'contribute_to_goal',
    description:
      'Registra un aporte a una meta de ahorro existente. Usar cuando el usuario dice que ahorró o puso plata en ' +
      'una meta (ej. "aporté $10.000 a mi meta del viaje"). `busqueda` matchea por nombre de la meta (coincidencia ' +
      'parcial). Devuelve el progreso actualizado y avisa si la meta se completó.',
    kind: 'write',
    schema: contributeToGoalSchema,
    execute: async (rawArgs, _ctx) => {
      const args = rawArgs as z.infer<typeof contributeToGoalSchema>
      const data: GoalContributionData = {
        search: args.busqueda,
        amount: args.monto,
        currency: args.moneda,
        note: args.nota ?? null,
        date: args.fecha,
      }
      const res = await handleGoalContribution(data)
      return { ok: res.success, data: { mensaje: res.message }, mutated: res.success }
    },
  },
]
