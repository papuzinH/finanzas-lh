-- ============================================================
-- MIGRACION: Transferencias internas de ahorro mensual
-- Fecha: 2026-05-30
-- Descripcion: Agrega trazabilidad de transferencias de sobrante
-- ============================================================

CREATE TABLE IF NOT EXISTS internal_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  period_date DATE NOT NULL,
  real_transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transfer_type TEXT NOT NULL DEFAULT 'end_of_month_surplus' CHECK (transfer_type IN ('end_of_month_surplus', 'manual')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, period_date, transfer_type)
);

CREATE INDEX IF NOT EXISTS idx_internal_transfers_user_period
  ON internal_transfers (user_id, period_date DESC);

ALTER TABLE internal_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal_transfers_owner" ON internal_transfers
  FOR ALL USING (auth.uid() = user_id);
