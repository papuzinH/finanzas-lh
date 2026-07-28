-- ============================================================
-- MIGRACION: Soporte de moneda (USD) en movimientos y Mensualidades
-- Fecha: 2026-05-31
-- Descripcion: Permite cargar transactions y recurring_plans en USD,
--   guardando el monto original, el par de cotizacion y el rate del momento.
--   La columna amount conserva el equivalente ARS del momento de carga.
-- ============================================================

-- transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS original_currency TEXT NOT NULL DEFAULT 'ARS'
    CHECK (original_currency IN ('ARS', 'USD')),
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS rate_pair TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14, 4);

-- Backfill: filas existentes son ARS, original_amount = amount
UPDATE transactions
  SET original_amount = amount
  WHERE original_amount IS NULL;

-- recurring_plans (ya tiene columna currency)
ALTER TABLE recurring_plans
  ALTER COLUMN currency SET DEFAULT 'ARS';

ALTER TABLE recurring_plans
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS rate_pair TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14, 4);

UPDATE recurring_plans
  SET currency = 'ARS'
  WHERE currency IS NULL;

UPDATE recurring_plans
  SET original_amount = amount
  WHERE original_amount IS NULL;
