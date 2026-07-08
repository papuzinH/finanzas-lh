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
 * Lanza si el resultado de una query de PostgREST vino con `.error`. Sin este check,
 * el `?? []` de más abajo tragaba errores en silencio (permisos, columna inexistente,
 * timeout de red) y las tools calculaban sobre un snapshot truncado sin avisar.
 * `executeToolWith` (registry.ts) atrapa este throw y lo convierte en
 * `{ ok:false, error }`, que el prompt obliga al modelo a comunicarle al usuario.
 */
function assertNoQueryError<T extends { error: { message: string } | null }>(result: T, table: string): T {
  if (result.error) {
    throw new Error(`No pude leer tus datos (${table}): ${result.error.message}`)
  }
  return result
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
 *   Nota histórica: `src/lib/ai/handlers.ts` filtraba `categories` con el `userId`
 *   NUMÉRICO en los casos `categoria` de editar/borrar (bug: la columna es UUID,
 *   nunca matcheaba). Ya está corregido: tanto `handleDelete` (Task 12) como
 *   `handleEdit` (Task 13) filtran por el UUID vía `getAuthUserId()`. El dataLoader
 *   usa el mismo criterio.
 */
async function loadFinanceDataUncached(ctx: AgentContext): Promise<FinanceData> {
  const { supabase, userId, authUserId } = ctx

  const [tx, pm, rp, it, cat, ip, er, blue] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', userId),
    supabase.from('payment_methods').select('*').eq('user_id', userId),
    supabase.from('recurring_plans').select('*').eq('user_id', userId),
    supabase.from('internal_transfers').select('*').eq('user_id', authUserId),
    supabase.from('categories').select('*').or(`user_id.eq.${authUserId},is_system.eq.true`),
    supabase.from('installment_plans').select('*').eq('user_id', userId),
    supabase.from('exchange_rates').select('*'),
    fetchDolarBlue(), // legítimamente degrada a null (nunca trae `.error`): no se chequea acá.
  ])

  assertNoQueryError(tx, 'transactions')
  assertNoQueryError(pm, 'payment_methods')
  assertNoQueryError(rp, 'recurring_plans')
  assertNoQueryError(it, 'internal_transfers')
  assertNoQueryError(cat, 'categories')
  assertNoQueryError(ip, 'installment_plans')
  assertNoQueryError(er, 'exchange_rates')

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

/**
 * Memoiza el snapshot por request en `ctx._financeCache`: varias read tools dentro
 * del mismo loop de `runAgent` comparten UNA sola ronda de queries en vez de repetir
 * las 7 queries + fetch del dólar blue por cada llamada (hasta 6 veces en un loop
 * largo). Cachear la PROMESA (no el resultado ya resuelto) evita también condiciones
 * de carrera si dos tools la piden "al mismo tiempo" antes de que la primera resuelva.
 * `runAgent` invalida el cache (`ctx._financeCache = undefined`) después de ejecutar
 * una write tool mutada, para que las lecturas siguientes no vean datos stale.
 */
export async function loadFinanceData(ctx: AgentContext): Promise<FinanceData> {
  if (!ctx._financeCache) {
    ctx._financeCache = loadFinanceDataUncached(ctx)
  }
  return ctx._financeCache
}
