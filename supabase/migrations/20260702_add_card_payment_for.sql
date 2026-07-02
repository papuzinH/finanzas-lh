-- ============================================================
-- MIGRACION: Marcador de pago de tarjeta en transactions
-- Fecha: 2026-07-02
-- Descripcion: Agrega card_payment_for para modelar el pago de un
-- resumen de tarjeta como una salida real del medio que la financia.
-- La transaccion marcada baja el saldo del medio financiador pero es
-- neutra para el Disponible Real global y las analiticas de consumo
-- (las compras ya estan itemizadas).
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS card_payment_for UUID
  REFERENCES payment_methods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_card_payment_for
  ON transactions (card_payment_for);
