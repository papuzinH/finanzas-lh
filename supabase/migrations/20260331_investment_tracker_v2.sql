-- Investment Tracker v2
-- Nuevas tablas: investment_assets, investment_transactions, exchange_rates
-- Alteración de market_prices para soportar cotizaciones bimonetarias

-- ============================================================
-- 1. CREAR TABLAS NUEVAS
-- ============================================================

CREATE TABLE investment_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker        VARCHAR(20) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  asset_type    TEXT NOT NULL CHECK (asset_type IN (
                  'stock','cedear','bond','on','bopreal','lecap','boncap',
                  'plazo_fijo','money_market','crypto','stablecoin','fci','etf'
                )),
  currency      VARCHAR(3) DEFAULT 'ARS',
  data_source_url TEXT,
  metadata      JSONB DEFAULT '{}',
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE investment_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        UUID NOT NULL REFERENCES investment_assets(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('buy','sell','dividend','coupon','interest')),
  quantity        NUMERIC NOT NULL,
  price_per_unit  NUMERIC NOT NULL,
  total_amount    NUMERIC NOT NULL,
  fees            NUMERIC DEFAULT 0,
  currency        VARCHAR(3) NOT NULL,
  date            DATE NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE exchange_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair        VARCHAR(20) NOT NULL UNIQUE,
  rate        NUMERIC NOT NULL,
  source      VARCHAR(30),
  last_update TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. ALTERAR market_prices
-- ============================================================

ALTER TABLE market_prices
  ADD COLUMN IF NOT EXISTS currency          VARCHAR(3) DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS price_usd         NUMERIC,
  ADD COLUMN IF NOT EXISTS ccl_implicit      NUMERIC,
  ADD COLUMN IF NOT EXISTS tir               NUMERIC,
  ADD COLUMN IF NOT EXISTS next_coupon_date  DATE,
  ADD COLUMN IF NOT EXISTS next_coupon_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS tna               NUMERIC,
  ADD COLUMN IF NOT EXISTS source            VARCHAR(20);

-- ============================================================
-- 3. MIGRACIÓN DE DATOS DESDE investments
-- ============================================================

-- Copiar activos existentes a investment_assets
INSERT INTO investment_assets (
  id,
  user_id,
  ticker,
  name,
  asset_type,
  currency,
  data_source_url,
  metadata,
  is_active,
  created_at,
  updated_at
)
SELECT
  id,
  user_id::UUID,
  ticker,
  name,
  -- Mapear tipos antiguos a los nuevos (los que ya matchean pasan directo)
  CASE
    WHEN type IN ('stock','cedear','bond','on','crypto','fci') THEN type
    ELSE 'stock' -- fallback para tipos no reconocidos
  END AS asset_type,
  COALESCE(currency, 'ARS'),
  data_source_url,
  '{}',
  true,
  created_at,
  created_at
FROM investments;

-- Crear una transacción 'buy' inicial por cada inversión existente
INSERT INTO investment_transactions (
  asset_id,
  user_id,
  type,
  quantity,
  price_per_unit,
  total_amount,
  fees,
  currency,
  date,
  notes,
  created_at
)
SELECT
  id AS asset_id,
  user_id::UUID,
  'buy' AS type,
  quantity,
  COALESCE(avg_buy_price, 0) AS price_per_unit,
  quantity * COALESCE(avg_buy_price, 0) AS total_amount,
  0 AS fees,
  COALESCE(currency, 'ARS'),
  created_at::DATE AS date,
  'Migración automática desde tabla investments' AS notes,
  created_at
FROM investments;

-- ============================================================
-- 4. ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_investment_assets_user_id
  ON investment_assets(user_id);

CREATE INDEX IF NOT EXISTS idx_investment_transactions_asset_id
  ON investment_transactions(asset_id);

CREATE INDEX IF NOT EXISTS idx_investment_transactions_user_date
  ON investment_transactions(user_id, date);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair
  ON exchange_rates(pair);

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE investment_assets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates           ENABLE ROW LEVEL SECURITY;

-- investment_assets: CRUD solo para el propio usuario
CREATE POLICY "investment_assets_select" ON investment_assets
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "investment_assets_insert" ON investment_assets
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "investment_assets_update" ON investment_assets
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "investment_assets_delete" ON investment_assets
  FOR DELETE USING (user_id = auth.uid());

-- investment_transactions: CRUD solo para el propio usuario
CREATE POLICY "investment_transactions_select" ON investment_transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "investment_transactions_insert" ON investment_transactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "investment_transactions_update" ON investment_transactions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "investment_transactions_delete" ON investment_transactions
  FOR DELETE USING (user_id = auth.uid());

-- exchange_rates: todos los authenticated pueden leer, solo service_role escribe
CREATE POLICY "exchange_rates_select" ON exchange_rates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "exchange_rates_insert" ON exchange_rates
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "exchange_rates_update" ON exchange_rates
  FOR UPDATE TO service_role USING (true);
