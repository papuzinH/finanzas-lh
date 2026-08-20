-- Modelo de bolsillo: ancla el disponible a saldos declarados y separa
-- la plata de gastar de la que el usuario decidio no gastar.
--
-- Spec: docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md
--
-- Todo aditivo: los defaults preservan el comportamiento actual, asi que
-- el deploy vigente sigue funcionando igual hasta que la UI exponga lo nuevo.

ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'pocket'
    CHECK (bucket IN ('pocket', 'reserve')),
  ADD COLUMN IF NOT EXISTS initial_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_balance_at date;

COMMENT ON COLUMN payment_methods.bucket IS
  'pocket = cuenta de la que se gasta y cuenta para el disponible; reserve = ahorro/inversion, no cuenta. Ortogonal a type.';
COMMENT ON COLUMN payment_methods.initial_balance_at IS
  'NULL = sin anclar: el saldo se suma desde el primer movimiento (comportamiento historico). Con fecha, solo se computan los movimientos posteriores a esa fecha inclusive.';

ALTER TABLE internal_transfers
  ADD COLUMN IF NOT EXISTS from_payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_payment_method_id   uuid REFERENCES payment_methods(id) ON DELETE SET NULL;

COMMENT ON COLUMN internal_transfers.from_payment_method_id IS
  'NULL en filas previas a esta migracion: se interpretan como salida del bolsillo hacia un ahorro sin destino identificado.';

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_balance_adjustment boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN transactions.is_balance_adjustment IS
  'Ajuste de conciliacion: corrige el saldo declarado sin reescribir el pasado. Se excluye de las analiticas de consumo, igual que card_payment_for.';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS income_rhythm text NOT NULL DEFAULT 'monthly'
    CHECK (income_rhythm IN ('monthly', 'biweekly', 'weekly', 'irregular'));

COMMENT ON COLUMN users.income_rhythm IS
  'Ritmo de cobro declarado. Define que compromisos se descuentan del disponible. irregular = sin proximo cobro que asumir, se descuenta todo.';
