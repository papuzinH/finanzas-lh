import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente con `service_role`: **bypassea RLS por completo**.
 *
 * Uso EXCLUSIVO en el servidor (route handlers y server actions) y SOLO para
 * escribir las tablas de referencia globales del mercado — `market_prices` y
 * `exchange_rates` — que no tienen `user_id`: sus datos son del mercado, no del
 * usuario. Antes esos upserts iban con el cliente de sesión, lo que obligaba a
 * dejar INSERT/UPDATE abiertos a `authenticated`: cualquier usuario logueado
 * podía escribir, con la anon key, los precios que ven todos los demás.
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

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
