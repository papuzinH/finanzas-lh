import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Cliente con `service_role`: **bypassea RLS por completo**.
 *
 * Uso EXCLUSIVO en el servidor (route handlers y server actions), y solo para
 * dos cosas:
 *
 * 1. Escribir las tablas de referencia globales del mercado — `market_prices`
 *    y `exchange_rates` — que no tienen `user_id`: sus datos son del mercado,
 *    no del usuario. Antes esos upserts iban con el cliente de sesión, lo que
 *    obligaba a dejar INSERT/UPDATE abiertos a `authenticated`: cualquier
 *    usuario logueado podía escribir, con la anon key, los precios que ven
 *    todos los demás.
 * 2. Borrar la cuenta de acceso del usuario (`auth.admin.deleteUser`) al final
 *    de `deleteMyAccount` (`app/perfil/actions.ts`): `auth.users` solo lo toca
 *    service_role. La purga de los datos NO va por acá — la hace
 *    `delete_my_account()` (SECURITY DEFINER sobre `auth.uid()`) con el cliente
 *    de sesión, así que ni con este cliente se puede borrar a otro.
 *
 * Para cualquier dato del usuario usar `createClient()` de `./server`, que
 * respeta RLS. Nunca importar este módulo desde un Client Component.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_SUPABASE_URL): los precios de mercado se escriben con service_role.',
    )
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
