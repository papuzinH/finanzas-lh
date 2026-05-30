-- ============================================================
-- MIGRACIÓN: Chat usage tracking + rate limiting
-- Fecha: 2026-05-31
-- Descripción: Tablas y RPCs para cuota por usuario y techo
--   global de costo mensual del chatbot.
-- ============================================================

-- ============================================================
-- 1. Columna chat_tier en users (gancho de monetización)
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD CONSTRAINT chat_tier_values CHECK (chat_tier IN ('free', 'pro'));

-- ============================================================
-- 2. Tabla chat_usage — cuota por usuario/día
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_usage (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE chat_usage ENABLE ROW LEVEL SECURITY;

-- Los usuarios pueden leer solo sus propias filas
-- (escritura solo vía RPC SECURITY DEFINER)
CREATE POLICY "chat_usage_select_own" ON chat_usage
  FOR SELECT
  USING (
    user_id = (
      SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
    )
  );

-- ============================================================
-- 3. Tabla chat_budget — red de seguridad global mensual
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_budget (
  period              TEXT PRIMARY KEY,  -- formato 'YYYY-MM'
  request_count       BIGINT NOT NULL DEFAULT 0,
  input_tokens        BIGINT NOT NULL DEFAULT 0,
  output_tokens       BIGINT NOT NULL DEFAULT 0,
  estimated_cost_usd  NUMERIC(12, 6) NOT NULL DEFAULT 0,
  is_killed           BOOLEAN NOT NULL DEFAULT false,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_budget ENABLE ROW LEVEL SECURITY;
-- Sin políticas de cliente: solo accesible vía RPCs SECURITY DEFINER

-- ============================================================
-- 4. RPC: check_and_increment_chat_usage
--    Chequea techo global y cuota de usuario en una transacción atómica.
--    Retorna: 'ok' | 'budget_exceeded' | 'user_limit_exceeded'
-- ============================================================
CREATE OR REPLACE FUNCTION check_and_increment_chat_usage(
  p_user_id             INTEGER,
  p_daily_limit         INTEGER,
  p_monthly_budget_usd  NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period        TEXT    := to_char(NOW(), 'YYYY-MM');
  v_budget_killed BOOLEAN;
  v_budget_cost   NUMERIC;
  v_new_count     INTEGER;
BEGIN
  -- Asegurar que existe la fila del mes actual
  INSERT INTO chat_budget (period) VALUES (v_period)
  ON CONFLICT (period) DO NOTHING;

  -- Bloquear la fila del presupuesto para evitar race conditions
  SELECT is_killed, estimated_cost_usd
  INTO v_budget_killed, v_budget_cost
  FROM chat_budget WHERE period = v_period FOR UPDATE;

  -- Verificar kill switch y techo de costo
  IF v_budget_killed OR v_budget_cost >= p_monthly_budget_usd THEN
    RETURN 'budget_exceeded';
  END IF;

  -- Incrementar contador del usuario (siempre cuenta el intento)
  INSERT INTO chat_usage (user_id, usage_date, request_count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, usage_date) DO UPDATE
    SET request_count = chat_usage.request_count + 1
  RETURNING request_count INTO v_new_count;

  -- Verificar cuota diaria
  IF v_new_count > p_daily_limit THEN
    RETURN 'user_limit_exceeded';
  END IF;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- 5. RPC: accumulate_chat_budget
--    Acumula tokens reales y costo calculado al presupuesto mensual.
-- ============================================================
CREATE OR REPLACE FUNCTION accumulate_chat_budget(
  p_input_tokens          INTEGER,
  p_output_tokens         INTEGER,
  p_input_price_per_1m    NUMERIC,
  p_output_price_per_1m   NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period TEXT   := to_char(NOW(), 'YYYY-MM');
  v_cost   NUMERIC;
BEGIN
  v_cost := (p_input_tokens::NUMERIC  / 1000000 * p_input_price_per_1m)
          + (p_output_tokens::NUMERIC / 1000000 * p_output_price_per_1m);

  INSERT INTO chat_budget (period, request_count, input_tokens, output_tokens, estimated_cost_usd, updated_at)
  VALUES (v_period, 1, p_input_tokens, p_output_tokens, v_cost, NOW())
  ON CONFLICT (period) DO UPDATE SET
    request_count      = chat_budget.request_count      + 1,
    input_tokens       = chat_budget.input_tokens       + p_input_tokens,
    output_tokens      = chat_budget.output_tokens      + p_output_tokens,
    estimated_cost_usd = chat_budget.estimated_cost_usd + v_cost,
    updated_at         = NOW();
END;
$$;
