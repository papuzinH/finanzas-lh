import { prepareTransactions, prepareRecurringPlans } from '@/lib/finance/prepare'
import type { DolarBlue, ProcessedTransaction } from '@/lib/finance/types'
import type { IncomeRhythm } from '@/lib/finance/pocket'
import type { CreditCardCycle } from '@/lib/finance/cycles'
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
  creditCardCycles: CreditCardCycle[]
  /** Ritmo de cobro declarado: define qué compromisos descuenta el disponible. */
  incomeRhythm: IncomeRhythm
  /** Serie mensual de IPC para deflactar a pesos de hoy. Vacía si la API falla. */
  inflacion: Array<{ month: string; rate: number }>
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
 * Serie de IPC (api.argentinadatos.com), MISMO endpoint y mismo shape
 * (`{fecha, valor}` → `{month, rate}`, últimos 24 meses) que `parseInflation`
 * en `financeStore.ts` (cliente): si el chat y el home parsearan distinto la
 * misma API, la paridad podría dar bien en un test con datos vacíos y romperse
 * recién en producción. Nunca lanza: sin IPC, `computeHistorico` deflacta con
 * factor 1 (montos nominales) en vez de romper el chat.
 */
export async function fetchInflacion(): Promise<Array<{ month: string; rate: number }>> {
  try {
    const res = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/inflacion', {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return []
    const raw = (await res.json()) as Array<{ fecha: string; valor: number }>
    return raw.map((r) => ({ month: r.fecha.slice(0, 7), rate: r.valor })).slice(-24)
  } catch {
    return [] // sin IPC, los montos quedan nominales; nunca rompe el chat
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
 *   `user_id` (FK a `public.users.id`, UUID string) → se filtra con `ctx.userId`.
 *   Coincide con `src/lib/ai/handlers.ts` (chat actual en producción, ej. líneas 74,
 *   180, 239, 300, 381), que usa el mismo `userId: string`.
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
 *
 * - `users`: la fila del usuario vive en `users.id` = UUID de auth (igual que
 *   `categories`) → se filtra con `ctx.authUserId`. Solo se lee `income_rhythm`.
 *
 * - `credit_card_cycles`: `user_id: string` (UUID) FK a `public.users(id)`, y
 *   `users.id` ES el UID de auth → mismo criterio que `transactions`, se filtra
 *   con `ctx.userId`. Ordenado por `closing_date` ascendente: las funciones puras
 *   de `lib/finance/cycles.ts` documentan esa precondición.
 */
async function loadFinanceDataUncached(ctx: AgentContext): Promise<FinanceData> {
  const { supabase, userId, authUserId } = ctx

  const [tx, pm, rp, it, cat, ip, er, usr, ccc, blue, inflacion] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', userId),
    supabase.from('payment_methods').select('*').eq('user_id', userId),
    supabase.from('recurring_plans').select('*').eq('user_id', userId),
    supabase.from('internal_transfers').select('*').eq('user_id', authUserId),
    supabase.from('categories').select('*').or(`user_id.eq.${authUserId},is_system.eq.true`),
    supabase.from('installment_plans').select('*').eq('user_id', userId),
    supabase.from('exchange_rates').select('*'),
    supabase.from('users').select('income_rhythm').eq('id', authUserId),
    supabase.from('credit_card_cycles').select('*').eq('user_id', userId).order('closing_date', { ascending: true }),
    fetchDolarBlue(), // legítimamente degrada a null (nunca trae `.error`): no se chequea acá.
    fetchInflacion(), // ídem: legítimamente degrada a [] (nunca trae `.error`).
  ])

  assertNoQueryError(tx, 'transactions')
  assertNoQueryError(pm, 'payment_methods')
  assertNoQueryError(rp, 'recurring_plans')
  assertNoQueryError(it, 'internal_transfers')
  assertNoQueryError(cat, 'categories')
  assertNoQueryError(ip, 'installment_plans')
  assertNoQueryError(er, 'exchange_rates')
  assertNoQueryError(usr, 'users')
  assertNoQueryError(ccc, 'credit_card_cycles')

  const methods = (pm.data ?? []) as PaymentMethod[]
  const rates = (er.data ?? []) as ExchangeRate[]

  return {
    transactions: prepareTransactions((tx.data ?? []) as Transaction[], methods, rates, blue),
    paymentMethods: methods,
    recurringPlans: prepareRecurringPlans((rp.data ?? []) as RecurringPlan[], rates, blue),
    internalTransfers: (it.data ?? []) as InternalTransfer[],
    categories: (cat.data ?? []) as Category[],
    installmentPlans: (ip.data ?? []) as InstallmentPlan[],
    creditCardCycles: (ccc.data ?? []) as CreditCardCycle[],
    incomeRhythm: ((usr.data ?? [])[0]?.income_rhythm as IncomeRhythm) ?? 'monthly',
    inflacion,
  }
}

/**
 * Memoiza el snapshot por request en `ctx._financeCache`: varias read tools dentro
 * del mismo loop de `runAgent` comparten UNA sola ronda de queries en vez de repetir
 * las 8 queries + fetch del dólar blue + fetch de inflación por cada llamada (hasta
 * 6 veces en un loop largo). Cachear la PROMESA (no el resultado ya resuelto) evita
 * también condiciones de carrera si dos tools la piden "al mismo tiempo" antes de
 * que la primera resuelva.
 * `runAgent` invalida el cache (`ctx._financeCache = undefined`) después de ejecutar
 * una write tool mutada, para que las lecturas siguientes no vean datos stale.
 */
export async function loadFinanceData(ctx: AgentContext): Promise<FinanceData> {
  if (!ctx._financeCache) {
    const promise = loadFinanceDataUncached(ctx)
    // Si la carga falla, NO dejar la promesa rechazada cacheada: las tools
    // siguientes del mismo loop deben poder reintentar en vez de re-consumir el
    // mismo error. Esta rama es solo un side-effect (el rechazo original igual
    // viaja al caller); el guard evita pisar un cache más nuevo.
    promise.catch(() => {
      if (ctx._financeCache === promise) ctx._financeCache = undefined
    })
    ctx._financeCache = promise
  }
  return ctx._financeCache
}
