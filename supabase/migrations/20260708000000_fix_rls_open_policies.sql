-- ============================================================
-- MIGRACIÓN: Cerrar políticas RLS abiertas (qual=true) y sanear
--            la identidad users.id / auth_user_id
-- Fecha: 2026-07-08
-- ESTADO: ✅ APLICADA en producción (verificada el 2026-07-28 contra
--         pg_policies, pg_proc y users.auth_user_id: helper, trigger,
--         backfill, políticas abiertas dropeadas, legacy_* sin políticas
--         y staging_plans con RLS — todo coincide con este archivo).
--         Es idempotente salvo los CREATE POLICY: re-correrla entera
--         falla con "policy already exists".
--
-- Contexto (verificado por SQL directo contra la DB):
--  * users.id ES el UUID de auth (FK a auth.users(id); el trigger
--    handle_new_user inserta id = new.id). users.auth_user_id quedó
--    NULL en el 100% de las filas (el backfill de 20260323 nunca corrió).
--  * Las tablas core (transactions, payment_methods, recurring_plans,
--    installment_plans, investments) tenían DOS políticas permisivas:
--    la *_owner correcta y una "…access" con qual=true para public.
--    Como las políticas permisivas se combinan con OR, el aislamiento
--    por usuario estaba anulado. Peor: la app funcionaba GRACIAS a las
--    abiertas, porque get_current_user_int_id() filtraba por
--    auth_user_id (NULL) y las *_owner no matcheaban nada.
--
-- Orden importante: primero se arregla el helper y el backfill,
-- después se dropean las políticas abiertas.
-- ============================================================

-- ============================================================
-- 1. Helper de identidad: users.id ES auth.uid() — sin depender
--    de auth_user_id. (Mantiene nombre y firma: las políticas
--    *_owner existentes lo siguen usando sin recrearse.)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_current_user_int_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid()
$$;

-- ============================================================
-- 2. Backfill de auth_user_id (columna vestigial; se completa por
--    si queda código/política vieja que la consulte) y trigger de
--    alta actualizado para mantener el invariante en usuarios nuevos.
-- ============================================================
UPDATE public.users SET auth_user_id = id WHERE auth_user_id IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, auth_user_id, email, first_name, avatar_url, created_at)
  VALUES (
    new.id, -- El UUID que viene de Google/Auth
    new.id, -- auth_user_id = id (invariante; la columna es vestigial pero consistente)
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    now()
  );
  RETURN new;
END;
$$;

-- ============================================================
-- 3. users: dropear las políticas muertas por auth_user_id.
--    Queda vigente "Users access own data" (auth.uid() = id).
-- ============================================================
DROP POLICY IF EXISTS users_select_own ON public.users;
DROP POLICY IF EXISTS users_update_own ON public.users;

-- ============================================================
-- 4. chat_usage: lectura propia sin subquery por auth_user_id.
-- ============================================================
DROP POLICY IF EXISTS chat_usage_select_own ON public.chat_usage;
CREATE POLICY chat_usage_select_own ON public.chat_usage
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- 5. Tablas core: dropear las políticas abiertas. Quedan las
--    *_owner (user_id = get_current_user_int_id() = auth.uid()).
-- ============================================================
DROP POLICY IF EXISTS "Transactions access"       ON public.transactions;
DROP POLICY IF EXISTS "Payment methods access"    ON public.payment_methods;
DROP POLICY IF EXISTS "Recurring plans access"    ON public.recurring_plans;
DROP POLICY IF EXISTS "Installment plans access"  ON public.installment_plans;
DROP POLICY IF EXISTS "Investments access"        ON public.investments;

-- ============================================================
-- 6. Tablas legacy_*: sin acceso de clientes (RLS queda habilitado
--    sin políticas; solo service_role puede tocarlas).
-- ============================================================
DROP POLICY IF EXISTS "Enable all access for now" ON public.legacy_installment_plans;
DROP POLICY IF EXISTS "Enable all"                ON public.legacy_investments;
DROP POLICY IF EXISTS "Enable all"                ON public.legacy_payment_methods;
DROP POLICY IF EXISTS "Enable all access for now" ON public.legacy_public_users;
DROP POLICY IF EXISTS "Enable all access for now" ON public.legacy_recurring_plans;
DROP POLICY IF EXISTS "Enable all access for now" ON public.legacy_transactions;

-- ============================================================
-- 7. market_prices: lectura pública (queda "Read all"), escritura
--    solo para usuarios autenticados. OJO: /api/investments/update-prices
--    corre con el cliente de SESIÓN (no service_role) — por eso la
--    escritura debe permitir al rol authenticated, no solo service_role.
--    Se dropea la ALL/public ("Update all") y la SELECT duplicada.
-- ============================================================
DROP POLICY IF EXISTS "Update all"                ON public.market_prices;
DROP POLICY IF EXISTS market_prices_public_read   ON public.market_prices;
CREATE POLICY market_prices_insert_authenticated ON public.market_prices
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY market_prices_update_authenticated ON public.market_prices
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 8. exchange_rates: los upserts del mismo endpoint fallaban EN
--    SILENCIO (write era solo service_role). Se habilita escritura
--    para authenticated (misma lógica que market_prices: tabla de
--    referencia global que refresca cualquier usuario logueado).
-- ============================================================
CREATE POLICY exchange_rates_insert_authenticated ON public.exchange_rates
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY exchange_rates_update_authenticated ON public.exchange_rates
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 9. staging_plans: única tabla public con RLS deshabilitado.
--    Se habilita sin políticas (sin uso en el código de la app).
-- ============================================================
ALTER TABLE public.staging_plans ENABLE ROW LEVEL SECURITY;
