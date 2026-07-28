-- ============================================================
-- MIGRACIÓN: transactions.source + tabla pending_detections
-- Versión: 20260502203432
--
-- ⚠️ RECONSTRUIDA A POSTERIORI (2026-07-28).
--
-- Esta migración estaba REGISTRADA como aplicada en
-- supabase_migrations.schema_migrations pero no tenía archivo en el
-- repo: se aplicó en su momento sin versionar el SQL. El contenido de
-- abajo NO es el original —es una reconstrucción fiel del estado real
-- de la base, leído de information_schema/pg_catalog el 2026-07-28— y
-- se escribe para que el historial de migraciones del repo coincida
-- 1:1 con el registro remoto.
--
-- Es idempotente (IF NOT EXISTS): correrla contra una base que ya la
-- tiene aplicada no hace nada. NO re-ejecutar a mano en producción.
-- ============================================================

-- 1. Origen de la transacción: de dónde salió el registro.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- 2. Detecciones pendientes de confirmación (la antesala de
--    "Chanchito no olvida": mail, GPS, importación, foto de ticket).
CREATE TABLE IF NOT EXISTS public.pending_detections (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source                 TEXT NOT NULL CHECK (source IN ('mail', 'gps', 'import', 'ticket')),
  raw_data               JSONB,
  suggested_amount       NUMERIC,
  suggested_category_id  UUID REFERENCES public.categories(id),
  suggested_description  TEXT,
  suggested_date         DATE,
  matched_transaction_id UUID REFERENCES public.transactions(id),
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'confirmed', 'rejected', 'auto_matched')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_detections_user_status
  ON public.pending_detections (user_id, status);

-- 3. RLS: cada usuario ve solo lo suyo.
ALTER TABLE public.pending_detections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only see their own pending detections"
  ON public.pending_detections;

CREATE POLICY "Users can only see their own pending detections"
  ON public.pending_detections
  FOR ALL
  USING (user_id = auth.uid());
