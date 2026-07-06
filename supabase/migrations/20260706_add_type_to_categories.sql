-- ============================================================
-- MIGRACION: Tipo de categoria (ingreso / gasto)
-- Fecha: 2026-07-06
-- Descripcion: Agrega categories.type ('income' | 'expense') para separar
-- categorias de ingreso y gasto. Backfillea las categorias existentes por
-- su historial de transacciones (mayoria income -> income, si no, expense)
-- y siembra 2 categorias de ingreso por defecto para usuarios que queden
-- sin ninguna, para que el selector de "Ingreso" nunca este vacio.
-- ============================================================

-- 1. Columna nullable
ALTER TABLE categories ADD COLUMN IF NOT EXISTS type TEXT;

-- 2. Backfill por historial de transacciones
UPDATE categories c SET type = sub.inferred_type
FROM (
  SELECT
    category_id,
    CASE WHEN SUM(CASE WHEN type = 'income' THEN 1 ELSE 0 END)
            > SUM(CASE WHEN type = 'expense' THEN 1 ELSE 0 END)
         THEN 'income' ELSE 'expense' END AS inferred_type
  FROM transactions
  WHERE category_id IS NOT NULL
  GROUP BY category_id
) sub
WHERE c.id = sub.category_id;

UPDATE categories SET type = 'expense' WHERE type IS NULL;

-- 3. Sembrar 2 categorías de ingreso por defecto para usuarios sin ninguna
INSERT INTO categories (user_id, name, emoji, description, is_system, type)
SELECT u.id, v.name, v.emoji, v.description, false, 'income'
FROM users u
CROSS JOIN (VALUES
  ('Sueldo', '💰', 'Sueldo, honorarios, pagos fijos de trabajo en relación de dependencia o autónomo.'),
  ('Freelance / Otros ingresos', '📈', 'Trabajos independientes, ventas, regalos en dinero y cualquier otro ingreso no fijo.')
) AS v(name, emoji, description)
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.type = 'income'
);

-- 4. Constraint final. DEFAULT 'expense' es red de seguridad: cualquier
-- insert que por algun motivo no especifique type (codigo desplegado antes
-- de esta migracion durante la ventana de deploy, o un insert que se nos
-- haya escapado) cae en el caso mas comun en vez de romper por NOT NULL.
ALTER TABLE categories ALTER COLUMN type SET DEFAULT 'expense';
ALTER TABLE categories ALTER COLUMN type SET NOT NULL;
ALTER TABLE categories ADD CONSTRAINT categories_type_check CHECK (type IN ('income', 'expense'));
