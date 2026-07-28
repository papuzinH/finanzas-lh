-- ============================================================
-- MIGRACIÓN: Endurecer los RPC del guard de cuotas del chatbot
-- Fecha: 2026-07-28
--
-- Problema (detectado por el linter de seguridad de Supabase):
--   check_and_increment_chat_usage y accumulate_chat_budget son
--   SECURITY DEFINER y están expuestas vía /rest/v1/rpc/ a los roles
--   anon y authenticated. Recibían la POLÍTICA como parámetros del
--   llamador (p_user_id, p_daily_limit, p_monthly_budget_usd y los
--   precios por 1M de tokens). Con la anon key —que viaja en el bundle
--   del browser— cualquiera podía:
--     * pasar p_daily_limit alto y saltarse su cuota diaria,
--     * pasar el p_user_id de otro y quemarle el límite,
--     * inflar los precios/tokens en accumulate_chat_budget hasta
--       disparar el corte duro del presupuesto global y dejar el chat
--       caído para todos.
--
-- Solución: la política deja de viajar por la red. El usuario sale de
-- auth.uid(), el tier de public.users y los límites/precios de la nueva
-- tabla public.chat_config. Los únicos datos que siguen viniendo del
-- llamador son los tokens consumidos, y van clampeados a un techo.
--
-- Compatibilidad: se CONSERVAN las firmas viejas como wrappers que
-- IGNORAN sus parámetros y delegan en las nuevas. Producción corre el
-- código anterior (que todavía manda los parámetros) y el guard es
-- fail-open: si acá rompiéramos la firma, el chat quedaría sin cuota
-- hasta el próximo deploy. Los wrappers se pueden dropear una vez
-- desplegado el usageGuard.ts nuevo (ver el final del archivo).
-- ============================================================

-- ============================================================
-- 1. Configuración del chat en la DB (antes en env vars).
--    Fila única forzada por el PK booleano con CHECK.
--    RLS habilitado y SIN políticas: solo la alcanzan las funciones
--    SECURITY DEFINER (que bypasean RLS) y service_role.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_config (
  id                  BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  daily_limit_free    INTEGER NOT NULL DEFAULT 30,
  daily_limit_pro     INTEGER NOT NULL DEFAULT 300,
  monthly_budget_usd  NUMERIC NOT NULL DEFAULT 50,
  input_price_per_1m  NUMERIC NOT NULL DEFAULT 0.30,
  output_price_per_1m NUMERIC NOT NULL DEFAULT 2.50,
  max_tokens_per_call INTEGER NOT NULL DEFAULT 200000,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.chat_config ENABLE ROW LEVEL SECURITY;

-- Semilla con los valores que hoy viven en las env vars.
INSERT INTO public.chat_config (id) VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. check_and_increment_chat_usage() — sin parámetros.
--    Usuario de auth.uid(), tier de users, límites de chat_config.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_and_increment_chat_usage()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period        TEXT := to_char(NOW(), 'YYYY-MM');
  v_user_id       UUID := auth.uid();
  v_tier          TEXT;
  v_daily_limit   INTEGER;
  v_monthly_budget NUMERIC;
  v_budget_killed BOOLEAN;
  v_budget_cost   NUMERIC;
  v_new_count     INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'check_and_increment_chat_usage: sin sesión (auth.uid() es NULL)';
  END IF;

  -- Tier real del usuario: ya no lo decide el llamador.
  SELECT chat_tier INTO v_tier FROM users WHERE id = v_user_id;
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'check_and_increment_chat_usage: usuario % inexistente', v_user_id;
  END IF;

  SELECT CASE WHEN v_tier = 'pro' THEN daily_limit_pro ELSE daily_limit_free END,
         monthly_budget_usd
  INTO v_daily_limit, v_monthly_budget
  FROM chat_config WHERE id = TRUE;

  -- Asegurar que existe la fila del mes actual
  INSERT INTO chat_budget (period) VALUES (v_period)
  ON CONFLICT (period) DO NOTHING;

  -- Bloquear la fila del presupuesto para evitar race conditions
  SELECT is_killed, estimated_cost_usd
  INTO v_budget_killed, v_budget_cost
  FROM chat_budget WHERE period = v_period FOR UPDATE;

  -- Verificar kill switch y techo de costo
  IF v_budget_killed OR v_budget_cost >= v_monthly_budget THEN
    RETURN 'budget_exceeded';
  END IF;

  -- Incrementar contador del usuario (siempre cuenta el intento)
  INSERT INTO chat_usage (user_id, usage_date, request_count)
  VALUES (v_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, usage_date) DO UPDATE
    SET request_count = chat_usage.request_count + 1
  RETURNING request_count INTO v_new_count;

  -- Verificar cuota diaria
  IF v_new_count > v_daily_limit THEN
    RETURN 'user_limit_exceeded';
  END IF;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- 3. accumulate_chat_budget(tokens) — precios de chat_config y
--    tokens clampeados (el techo por mensaje del agente es 50k;
--    200k deja margen y acota el daño de un llamador malicioso).
-- ============================================================
CREATE OR REPLACE FUNCTION public.accumulate_chat_budget(
  p_input_tokens integer,
  p_output_tokens integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period    TEXT := to_char(NOW(), 'YYYY-MM');
  v_in_price  NUMERIC;
  v_out_price NUMERIC;
  v_max       INTEGER;
  v_in        INTEGER;
  v_out       INTEGER;
  v_cost      NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'accumulate_chat_budget: sin sesión (auth.uid() es NULL)';
  END IF;

  SELECT input_price_per_1m, output_price_per_1m, max_tokens_per_call
  INTO v_in_price, v_out_price, v_max
  FROM chat_config WHERE id = TRUE;

  -- Los tokens vienen del llamador: clampear a [0, max_tokens_per_call].
  v_in  := LEAST(GREATEST(COALESCE(p_input_tokens, 0), 0), v_max);
  v_out := LEAST(GREATEST(COALESCE(p_output_tokens, 0), 0), v_max);

  v_cost := (v_in::NUMERIC  / 1000000 * v_in_price)
          + (v_out::NUMERIC / 1000000 * v_out_price);

  INSERT INTO chat_budget (period, request_count, input_tokens, output_tokens, estimated_cost_usd, updated_at)
  VALUES (v_period, 1, v_in, v_out, v_cost, NOW())
  ON CONFLICT (period) DO UPDATE SET
    request_count      = chat_budget.request_count      + 1,
    input_tokens       = chat_budget.input_tokens       + v_in,
    output_tokens      = chat_budget.output_tokens      + v_out,
    estimated_cost_usd = chat_budget.estimated_cost_usd + v_cost,
    updated_at         = NOW();
END;
$$;

-- ============================================================
-- 4. Wrappers de compatibilidad: mantienen las firmas viejas para
--    que el deploy actual de Vercel siga funcionando, pero DESCARTAN
--    los parámetros de política que mandaba el cliente.
--    Dropear después de desplegar el usageGuard.ts nuevo.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_and_increment_chat_usage(
  p_user_id uuid,
  p_daily_limit integer,
  p_monthly_budget_usd numeric
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- p_user_id / p_daily_limit / p_monthly_budget_usd se IGNORAN a propósito.
  SELECT public.check_and_increment_chat_usage()
$$;

CREATE OR REPLACE FUNCTION public.accumulate_chat_budget(
  p_input_tokens integer,
  p_output_tokens integer,
  p_input_price_per_1m numeric,
  p_output_price_per_1m numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Los precios se IGNORAN a propósito: salen de chat_config.
  SELECT public.accumulate_chat_budget(p_input_tokens, p_output_tokens)
$$;

-- ============================================================
-- 5. Cerrar el acceso anónimo. La app siempre autentica antes de
--    llamar a estos RPC, así que anon no los necesita.
--    (authenticated los conserva: la route los invoca con el cliente
--     de sesión, y ahora son seguros aunque los llame el browser.)
--
--    OJO: Postgres concede EXECUTE a PUBLIC por defecto, así que
--    revocar solo FROM anon NO surte efecto — hay que revocar de
--    PUBLIC y volver a otorgar explícitamente a quien sí debe poder.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.check_and_increment_chat_usage()                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_and_increment_chat_usage(uuid, integer, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accumulate_chat_budget(integer, integer)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accumulate_chat_budget(integer, integer, numeric, numeric) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.check_and_increment_chat_usage()                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_and_increment_chat_usage(uuid, integer, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accumulate_chat_budget(integer, integer)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accumulate_chat_budget(integer, integer, numeric, numeric) TO authenticated, service_role;

-- handle_new_user solo corre como trigger: nadie la necesita por RPC.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- NOTA: get_current_user_int_id() se deja accesible a anon a propósito.
-- La usan las políticas RLS de transactions/payment_methods/
-- recurring_plans/installment_plans; si se revoca, un SELECT anónimo a
-- esas tablas devuelve error 42501 en vez de un resultado vacío. Es
-- inofensiva: retorna el propio auth.uid() del llamador, nada ajeno.

-- ============================================================
-- 6. handle_new_user: fijar search_path (WARN del linter
--    "function_search_path_mutable"). Cuerpo idéntico al vigente.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
-- 7. sync_auth_user_id: función trigger vacía (solo RETURN NEW), sin
--    ningún trigger asociado y sin referencias en el código — quedó de
--    20260323_enable_rls_core_tables.sql. Era SECURITY DEFINER
--    invocable por anon: superficie de ataque sin contrapartida.
-- ============================================================
DROP FUNCTION IF EXISTS public.sync_auth_user_id();

-- ============================================================
-- PENDIENTE post-deploy (no ejecutar ahora): una vez que Vercel
-- corra el usageGuard.ts sin parámetros de política, dropear los
-- wrappers para que no quede firma vieja viva:
--
--   DROP FUNCTION public.check_and_increment_chat_usage(uuid, integer, numeric);
--   DROP FUNCTION public.accumulate_chat_budget(integer, integer, numeric, numeric);
-- ============================================================
