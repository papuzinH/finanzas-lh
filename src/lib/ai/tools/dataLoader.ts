import { prepareTransactions, prepareRecurringPlans } from '@/lib/finance/prepare'
import type { DolarBlue, ProcessedTransaction } from '@/lib/finance/types'
import type {
  Transaction,
  PaymentMethod,
  RecurringPlan,
  ExchangeRate,
  InternalTransfer,
  Category,
  InstallmentPlan,
} from '@/types/database'
import type { AgentContext } from './types'

/** Snapshot financiero server-side, ya procesado por el MISMO pipeline que usa el store del cliente. */
export interface FinanceData {
  transactions: ProcessedTransaction[]
  paymentMethods: PaymentMethod[]
  recurringPlans: RecurringPlan[]
  internalTransfers: InternalTransfer[]
  categories: Category[]
  installmentPlans: InstallmentPlan[]
}

/**
 * Cotización dólar blue (dolarapi.com). Nunca lanza: cualquier error de red, timeout
 * (2s) o respuesta no-OK devuelve `null`, y `resolveRate()` (lib/finance/prepare.ts)
 * cae al snapshot `exchange_rate` guardado en cada fila.
 */
export async function fetchDolarBlue(): Promise<DolarBlue | null> {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/blue', {
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return null
    return (await res.json()) as DolarBlue
  } catch {
    return null // resolveRate cae al snapshot exchange_rate de cada fila
  }
}

/**
 * Carga el snapshot financiero completo del usuario autenticado y lo procesa con el
 * MISMO pipeline (`prepareTransactions`/`prepareRecurringPlans` de lib/finance/prepare.ts)
 * que usa `financeStore.fetchAllData()` en el cliente, para que el chat calcule sobre
 * datos idénticos a los del home.
 *
 * --- Step 0: criterio de `user_id` por tabla ---
 * Verificado contra `src/types/database.ts` (tipo `Database['public']['Tables'][...]['Row']`)
 * y el uso real en el codebase (no solo el tipo, por si estuviera desactualizado):
 *
 * - `transactions`, `payment_methods`, `recurring_plans`, `installment_plans`:
 *   `user_id: number` (FK a `public.users.id`) → se filtra con `ctx.userId`.
 *   Coincide con `src/lib/ai/handlers.ts` (chat actual en producción, ej. líneas 74,
 *   180, 239, 300, 381), que usa el mismo `userId: number`.
 *
 * - `internal_transfers`: `user_id: string` (UUID) en `types/database.ts` → se filtra
 *   con `ctx.authUserId`. ¡OJO! El único otro lugar del codebase que consulta esta
 *   tabla (`financeStore.fetchAllData`, `src/lib/store/financeStore.ts:538-541`)
 *   también filtra con el UUID de auth (`authUser.id`), NO con el id numérico —
 *   confirma el criterio.
 *
 * - `categories`: `user_id: string` (UUID) en `types/database.ts` → se filtra con
 *   `ctx.authUserId`, replicando el patrón `.or('user_id.eq.<uuid>,is_system.eq.true')`
 *   que usan tanto `src/app/api/chat/route.ts:152` como `financeStore.fetchAllData`
 *   (`financeStore.ts:522-526`) para traer también las categorías del sistema.
 *   BUG preexistente: `src/lib/ai/handlers.ts` (casos `categoria` en editar/borrar,
 *   líneas ~1188, 1210, 1390) filtra `categories` con el `userId` NUMÉRICO en vez del
 *   UUID — criterio equivocado que queda fuera del alcance de este task (se corrige
 *   al envolver `handlers.ts`, Task 13). El dataLoader NO reproduce ese bug.
 */
export async function loadFinanceData(ctx: AgentContext): Promise<FinanceData> {
  const { supabase, userId, authUserId } = ctx

  const [tx, pm, rp, it, cat, ip, er, blue] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', userId),
    supabase.from('payment_methods').select('*').eq('user_id', userId),
    supabase.from('recurring_plans').select('*').eq('user_id', userId),
    supabase.from('internal_transfers').select('*').eq('user_id', authUserId),
    supabase.from('categories').select('*').or(`user_id.eq.${authUserId},is_system.eq.true`),
    supabase.from('installment_plans').select('*').eq('user_id', userId),
    supabase.from('exchange_rates').select('*'),
    fetchDolarBlue(),
  ])

  const methods = (pm.data ?? []) as PaymentMethod[]
  const rates = (er.data ?? []) as ExchangeRate[]

  return {
    transactions: prepareTransactions((tx.data ?? []) as Transaction[], methods, rates, blue),
    paymentMethods: methods,
    recurringPlans: prepareRecurringPlans((rp.data ?? []) as RecurringPlan[], rates, blue),
    internalTransfers: (it.data ?? []) as InternalTransfer[],
    categories: (cat.data ?? []) as Category[],
    installmentPlans: (ip.data ?? []) as InstallmentPlan[],
  }
}
