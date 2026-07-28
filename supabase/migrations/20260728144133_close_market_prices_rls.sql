-- ============================================================
-- Cierra la escritura de las tablas de referencia globales del
-- mercado: market_prices y exchange_rates.
--
-- CONTEXTO
-- La migración 20260708000000_fix_rls_open_policies.sql abrió
-- INSERT/UPDATE a `authenticated` WITH CHECK (true) a propósito:
-- los upserts de precios iban con el cliente de SESIÓN, así que
-- restringirlos a service_role los hacía fallar en silencio.
-- El costo era que cualquier usuario logueado podía escribir, con
-- la anon key del bundle, los precios que ven TODOS los usuarios
-- (ambas tablas son globales, sin user_id).
--
-- PRECONDICIÓN (debe estar YA DESPLEGADO al aplicar esta migración)
-- Los 4 puntos de escritura usan `createAdminClient()`
-- (src/utils/supabase/admin.ts, service_role, server-only):
--   - lib/investments/update-prices-core.ts (precios + cotizaciones)
--   - app/movimientos/actions.ts            (updateExchangeRates)
--   - app/inversiones/actions.ts            (precio inicial x2)
-- La lectura de los activos sigue con el cliente de sesión, que
-- respeta RLS por user_id.
--
-- NOTA: service_role tiene BYPASSRLS, así que no necesita policies
-- propias. Las exchange_rates_insert/update para service_role que
-- vienen de 20260331 quedan como documentación de intención.
-- ============================================================

-- 1. market_prices: escritura solo service_role.
DROP POLICY IF EXISTS market_prices_insert_authenticated ON public.market_prices;
DROP POLICY IF EXISTS market_prices_update_authenticated ON public.market_prices;

-- 2. exchange_rates: escritura solo service_role.
DROP POLICY IF EXISTS exchange_rates_insert_authenticated ON public.exchange_rates;
DROP POLICY IF EXISTS exchange_rates_update_authenticated ON public.exchange_rates;

-- 3. market_prices: la SELECT "Read all" era TO public (incluye anon).
--    Se acota a authenticated, igual que exchange_rates_select.
DROP POLICY IF EXISTS "Read all" ON public.market_prices;
CREATE POLICY market_prices_select_authenticated ON public.market_prices
  FOR SELECT TO authenticated USING (true);
