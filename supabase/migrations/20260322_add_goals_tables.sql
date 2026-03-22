-- ============================================================
-- MIGRACIÓN: Funcionalidad de Objetivos (Goals)
-- Fecha: 2026-03-22
-- Descripción: Agrega tablas para metas de ahorro y presupuestos por categoría
-- ============================================================

-- ============================================================
-- 1. METAS DE AHORRO (savings_goals)
-- ============================================================
-- Tipos:
--   'one_time'  → Meta con monto objetivo y fecha límite (ej: "Vacaciones: $500.000 para diciembre")
--   'monthly'   → Meta mensual recurrente (ej: "Ahorrar $50.000 por mes")
-- ============================================================
CREATE TABLE IF NOT EXISTS savings_goals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('one_time', 'monthly')),
  target_amount NUMERIC(12, 2) NOT NULL CHECK (target_amount > 0),
  currency    TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  target_date DATE,   -- Solo requerido para type = 'one_time'
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Solo el dueño puede ver y modificar sus metas
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "savings_goals_owner" ON savings_goals
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 2. APORTES A METAS (savings_goal_contributions)
-- ============================================================
-- Registros manuales de cuánto se depositó hacia una meta.
-- Sirve para AMBOS tipos (one_time y monthly).
-- Para monthly: los aportes del mes actual = progreso mensual.
-- Para one_time: suma total de aportes = progreso total.
-- ============================================================
CREATE TABLE IF NOT EXISTS savings_goal_contributions (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id   UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL,
  amount    NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency  TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  note      TEXT,
  date      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE savings_goal_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "savings_goal_contributions_owner" ON savings_goal_contributions
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 3. PRESUPUESTOS POR CATEGORÍA (category_budgets)
-- ============================================================
-- Límite mensual de gasto por categoría.
-- Restricción: una sola fila activa por (user_id, category_id).
-- El progreso se calcula dinámicamente comparando contra
-- los gastos reales del mes en esa categoría (getExpensesByCategory).
-- ============================================================
CREATE TABLE IF NOT EXISTS category_budgets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency    TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, category_id)
);

-- RLS
ALTER TABLE category_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "category_budgets_owner" ON category_budgets
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- INSTRUCCIONES DE DESPLIEGUE
-- ============================================================
-- Aplicar en Supabase Dashboard > SQL Editor:
--   1. Copiar y ejecutar este script en la DB de PROD antes de hacer merge
--   2. Verificar que las 3 tablas fueron creadas: savings_goals, savings_goal_contributions, category_budgets
--   3. Verificar que RLS está activo en las 3 tablas
-- ============================================================
