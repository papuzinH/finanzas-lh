/**
 * Tipos de datos para los handlers de mutación de `src/lib/ai/handlers.ts`.
 *
 * Movidos acá desde el viejo `intentParser.ts` (Task 14b: swap al motor agéntico).
 * El motor ya no usa `ChatIntent`/`parseGeminiResponse` — el modelo llama tools con
 * argumentos tipados por Zod (`tools/writeTools.ts`), que arman estos objetos y se
 * los pasan a los handlers para persistir en Supabase. Los tipos de sólo-consulta del
 * viejo pipeline (`QueryType`, `QueryFilters`, `ConfirmActionData`, `GoalQueryData`,
 * `ChatIntent`) no se migraron: ya no tienen consumidores (las consultas ahora son
 * tools de lectura, ver `tools/readTools.ts`).
 */

export type EntityType =
  | 'transaccion'
  | 'medio_pago'
  | 'categoria'
  | 'suscripcion'
  | 'cuota'
  | 'objetivo'
  | 'presupuesto'

export interface EditData {
  entity: EntityType
  search: string
  changes: Record<string, unknown>
}

export interface DeleteData {
  entity: EntityType
  search: string
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
