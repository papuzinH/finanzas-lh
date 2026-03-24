-- ============================================================
-- MIGRACIÓN: Habilitar RLS en tablas core
-- Fecha: 2026-03-23
-- Descripción: Auditoría de seguridad multi-usuario.
--   Habilita Row Level Security en las 8 tablas que carecían de él.
--   Las 3 tablas de goals/budgets ya tienen RLS desde 20260322.
--
-- ARQUITECTURA DE USER_ID EN ESTE PROYECTO:
--
--   Grupo A — UUID (= auth.uid() directo):
--     categories, investments, savings
--     → RLS: auth.uid()::text = user_id
--
--   Grupo B — INTEGER (id numérico de tabla "users" interna):
--     transactions, payment_methods, installment_plans, recurring_plans
--     → RLS: necesita mapear auth.uid() → integer id
--
--   Tabla "users":
--     id es INTEGER (PK interna), sin columna auth_user_id explícita.
--     El código existente resuelve esto con .select('id').limit(1).single()
--     confiando en la sesión autenticada.
--     → Para que RLS funcione en tablas del grupo B, agregamos
--       la columna auth_user_id como referencia a auth.users.
-- ============================================================

-- ============================================================
-- PASO 1: Agregar columna auth_user_id a la tabla "users"
-- Esta columna es el puente entre auth.uid() (UUID) y users.id (INTEGER)
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id);

-- Índice para performance en las policies
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);

-- ============================================================
-- PASO 2: FUNCIÓN HELPER — resuelve integer user_id desde auth.uid()
-- Usada en las policies de tablas legacy (grupo B)
-- SECURITY DEFINER: corre con permisos elevados para leer la tabla users
-- ============================================================
CREATE OR REPLACE FUNCTION get_current_user_int_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- ============================================================
-- PASO 3: TRIGGER — rellena auth_user_id al crear/actualizar usuario
-- Asegura que los usuarios existentes y nuevos tengan el mapeo correcto
-- ============================================================

-- Función del trigger
CREATE OR REPLACE FUNCTION sync_auth_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nada que hacer en el trigger de users directamente,
  -- el auth_user_id se settea desde el server action de registro.
  RETURN NEW;
END;
$$;

-- ============================================================
-- PASO 4: Habilitar RLS en cada tabla
-- ============================================================

-- ----------------------------------------------------------------
-- 4a. USERS — cada usuario ve y modifica solo su propia fila
-- ----------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- INSERT se maneja por server actions con service_role o trigger de auth.
-- No se permite desde el cliente directamente.

-- ----------------------------------------------------------------
-- 4b. CATEGORIES — user_id es UUID (= auth.uid())
-- ----------------------------------------------------------------
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_owner" ON categories
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- ----------------------------------------------------------------
-- 4c. PAYMENT_METHODS — user_id es INTEGER (grupo B)
-- ----------------------------------------------------------------
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_methods_owner" ON payment_methods
  FOR ALL
  USING (user_id = get_current_user_int_id())
  WITH CHECK (user_id = get_current_user_int_id());

-- ----------------------------------------------------------------
-- 4d. TRANSACTIONS — user_id es INTEGER (grupo B)
-- ----------------------------------------------------------------
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_owner" ON transactions
  FOR ALL
  USING (user_id = get_current_user_int_id())
  WITH CHECK (user_id = get_current_user_int_id());

-- ----------------------------------------------------------------
-- 4e. INSTALLMENT_PLANS — user_id es INTEGER (grupo B)
-- ----------------------------------------------------------------
ALTER TABLE installment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "installment_plans_owner" ON installment_plans
  FOR ALL
  USING (user_id = get_current_user_int_id())
  WITH CHECK (user_id = get_current_user_int_id());

-- ----------------------------------------------------------------
-- 4f. RECURRING_PLANS — user_id es INTEGER (grupo B)
-- ----------------------------------------------------------------
ALTER TABLE recurring_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_plans_owner" ON recurring_plans
  FOR ALL
  USING (user_id = get_current_user_int_id())
  WITH CHECK (user_id = get_current_user_int_id());

-- ----------------------------------------------------------------
-- 4g. INVESTMENTS — user_id es UUID (= auth.uid())
-- ----------------------------------------------------------------
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "investments_owner" ON investments
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- ----------------------------------------------------------------
-- 4h. SAVINGS — user_id es UUID (= auth.uid())
-- ----------------------------------------------------------------
ALTER TABLE savings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "savings_owner" ON savings
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- ----------------------------------------------------------------
-- 4i. MARKET_PRICES — Tabla global sin user_id
-- Solo lectura para todos los usuarios autenticados.
-- Escritura solo via service_role (n8n / backend).
-- ----------------------------------------------------------------
ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_prices_public_read" ON market_prices
  FOR SELECT USING (true);

-- ============================================================
-- PASO 5: Backfill — actualizar filas existentes con auth_user_id
-- ============================================================
-- EJECUTAR MANUALMENTE en el SQL Editor después de este script,
-- con el UUID del usuario existente:
--
--   UPDATE users
--   SET auth_user_id = '<UUID-DE-AUTH>'
--   WHERE id = <INTEGER-ID>;
--
-- Para obtener el UUID del usuario en Supabase:
--   Dashboard > Authentication > Users > copiar el UUID
-- ============================================================

-- ============================================================
-- PASO 6 (requerido en el código): Actualizar server actions de registro
-- Al crear un nuevo usuario en auth/callback o en onboarding,
-- agregar el auth_user_id:
--
--   supabase.from('users').insert({
--     auth_user_id: user.id,   // ← AGREGAR ESTO
--     first_name: ...,
--     ...
--   })
-- ============================================================

-- ============================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- ============================================================
-- 1. Verificar RLS activo:
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public'
--   ORDER BY tablename;
--
-- 2. Verificar policies creadas:
--   SELECT schemaname, tablename, policyname, cmd, qual
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   ORDER BY tablename;
--
-- 3. Test de aislamiento (ejecutar como usuario autenticado):
--   SELECT count(*) FROM transactions;  -- debe devolver solo las del usuario actual
-- ============================================================

-- ============================================================
-- INSTRUCCIONES DE DESPLIEGUE
-- ============================================================
-- 1. Ejecutar este script en Supabase Dashboard > SQL Editor (PROD)
-- 2. Hacer backfill de auth_user_id para el/los usuarios existentes (Paso 5)
-- 3. Actualizar server actions de registro para incluir auth_user_id (Paso 6):
--    - src/app/auth/callback/route.ts (si crea la fila de users)
--    - src/app/api/chat/onboarding/route.ts (si crea la fila de users)
-- 4. Verificar que n8n usa SUPABASE_SERVICE_ROLE_KEY (bypasea RLS)
--    Si usa ANON_KEY, debe enviar el JWT del usuario en el header Authorization
-- 5. Ejecutar la verificación del Paso 6 con una cuenta de prueba
-- ============================================================
