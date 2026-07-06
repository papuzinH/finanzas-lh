# Categorías con tipo (Ingreso / Gasto)

**Fecha:** 2026-07-06
**Estado:** Aprobado (diseño)
**Área:** Categorías / Movimientos / Presupuestos / IA

## Problema

`categories` es hoy una lista plana sin ningún campo que distinga si una categoría
corresponde a un ingreso o a un gasto. El tipo (`'income' | 'expense'`) vive únicamente
en `transactions.type`, totalmente desacoplado de la categoría. Esto genera:

- El `CategoryPicker` de movimientos, cuotas, mensualidades y su lista de "frecuentes"
  (`getFrequentCategories`) muestran **todas** las categorías sin filtrar, aunque el
  usuario ya eligió "Ingreso" o "Gasto" en el `TypeToggle`. Al cargar un ingreso aparecen
  categorías de gasto (Comida, Transporte) mezcladas.
- La página `/categorias` es una grilla única sin separar ingreso/gasto, y sus stats
  (`getCategoryBreakdown`) solo calculan gasto — las categorías de ingreso ahí siempre
  mostrarían "Sin gastos este mes".
- Los presupuestos (`category_budgets`) pueden apuntar a cualquier categoría sin
  restricción, aunque conceptualmente un "límite mensual de gasto" no aplica a ingresos.
- El prompt de la IA (`chatPrompt.ts`) resuelve esto hoy con un hack de nombre: asume que
  existe una categoría llamada literalmente **"Ingresos"** para clasificar cobros
  (`chatPrompt.ts` línea ~298), sin ninguna garantía de que exista.

## Objetivo

Modelar el tipo de categoría como un campo explícito y usarlo para filtrar en todos los
puntos donde hoy se muestra la lista completa sin distinción, evitando romper el flujo de
usuarios existentes.

## Decisiones (de brainstorming)

- El campo es **estricto**: `'income' | 'expense'`, sin variante "both".
- Backfill de categorías existentes: automático, por historial de transacciones (mayoría
  de `income` → `income`; sin historial o mayoría `expense` → `expense`).
- El tipo de una categoría **se puede editar** mientras no tenga movimientos/planes
  asociados; si ya tiene, el campo queda bloqueado en el diálogo de edición.
- Se siembran categorías de ingreso por defecto (onboarding nuevo y backfill de usuarios
  existentes sin ninguna) para que el selector de "Ingreso" nunca quede vacío.

## Diseño

### 1. Modelo de datos

Nueva migración `supabase/migrations/20260706_add_type_to_categories.sql`:

```sql
-- 1. Columna nullable
ALTER TABLE categories ADD COLUMN IF NOT EXISTS type TEXT;

-- 2. Backfill por historial de transacciones: income si la mayoría de sus
--    transacciones son income, expense en cualquier otro caso (incluido sin historial).
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

-- 3. Sembrar 2 categorías de ingreso por defecto para usuarios que quedaron sin ninguna
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

-- 4. Constraint final
ALTER TABLE categories ALTER COLUMN type SET NOT NULL;
ALTER TABLE categories ADD CONSTRAINT categories_type_check CHECK (type IN ('income', 'expense'));
```

- Se actualiza `src/types/database.ts`: `categories.Row/Insert/Update` gana `type: 'income' | 'expense'`.
- `src/lib/schemas/category.ts`: `categorySchema` gana `type: z.enum(['income', 'expense'])`.
- Aplicar en DEV primero, validar, y aplicar a PROD **antes** de mergear (regla del proyecto).

### 2. Crear / editar categoría

- `CreateCategoryDialog` (`src/components/categories/create-category-dialog.tsx`): agrega
  un toggle "Gasto / Ingreso" arriba del campo nombre, mismo patrón visual que `TypeToggle`
  de `transaction-form-fields.tsx`. Default `'expense'`. Se guarda vía `createCategory`.
- `CategoryCardActions` (`src/components/categories/category-card-actions.tsx`, diálogo
  Editar): mismo toggle. Se deshabilita (con texto explicativo debajo, ej. *"No se puede
  cambiar el tipo: esta categoría tiene 12 movimientos asociados"*) cuando
  `getCategoryDependencies(category.id).total > 0` (función ya existente, reusada tal cual).
  Si `total === 0`, el toggle queda editable.
- Reasignación al eliminar (`deleteCategoryReassign`, en el diálogo de conflicto de
  borrado): `otherCategories` se filtra a `c.type === category.type` — no tiene sentido
  reasignar gastos a una categoría de ingreso ni viceversa.

### 3. Formularios de movimientos

- `create-transaction-dialog.tsx` / `edit-transaction-dialog.tsx`: antes de pasarle
  `categories` al `CategoryPicker`, se filtra por el `type` observado en el `TypeToggle`
  (`categories.filter(c => c.type === watchedType)`).
- `getFrequentCategories` (`financeStore.ts`) gana un segundo parámetro opcional:
  `getFrequentCategories(n?: number, type?: 'income' | 'expense')`. Si se pasa `type`,
  filtra tanto el conteo de transacciones como el fallback de categorías nuevas a ese tipo.
  Los 6 call-sites actuales (create/edit de transactions, installments y subscriptions) le
  pasan el `type` que corresponda; installments/subscriptions siempre `'expense'`.
- `create-plan-dialog.tsx` / `edit-plan-dialog.tsx` (cuotas) y
  `create-subscription-dialog.tsx` / `edit-subscription-dialog.tsx` (mensualidades):
  filtran `categories` a `type === 'expense'` siempre, sin mostrar ningún toggle (no existe
  el concepto de cuota o mensualidad de ingreso en `installment_plans`/`recurring_plans`,
  que no tienen columna `type`).

### 4. Página `/categorias`

- `CategoriesWithStats` (`src/app/categorias/_components/categories-with-stats.tsx`) suma
  un `<TabsDS>` con "Gastos" / "Ingresos" arriba de la grilla (mismo patrón que
  Compromisos). La tab activa filtra `categories` por `type` antes de renderizar la grilla.
- Se generaliza el getter existente:
  `getExpensesByCategory: (scope: 'global' | 'current_month', type: 'income' | 'expense' = 'expense')`.
  Cambia el filtro interno de `t.type !== 'expense'` a `t.type !== type`. Todos los
  call-sites actuales (budgets, category breakdown, IA) no pasan el segundo argumento y
  siguen funcionando igual por el default.
- `getCategoryBreakdown` gana el mismo parámetro opcional `type` y lo reenvía a
  `getExpensesByCategory`, para reusarlo en el resumen de la tab Ingresos (mismas 3 stat
  cards que hoy: total del mes, mayor ingreso del mes, total histórico).

### 5. Presupuestos (`category_budgets`)

- El componente padre que renderiza `/objetivos` filtra `categories` a
  `type === 'expense'` antes de pasarlas a `create-budget-dialog.tsx` (un límite mensual de
  gasto no aplica a categorías de ingreso). `edit-budget-dialog.tsx` no necesita cambios:
  edita una categoría ya asignada, no permite reasignar la categoría del presupuesto.

### 6. IA / Chatbot

- `chatPrompt.ts`: el `Category` local (`id`, `name`, `emoji`) suma `type: 'income' | 'expense'`.
  `categoriesPrompt` pasa a construirse en dos bloques separados con encabezado
  ("CATEGORÍAS DE GASTO" / "CATEGORÍAS DE INGRESO"), y se elimina la regla hardcodeada de
  la línea ~298 que fuerza `"categoria": "Ingresos"` — se reemplaza por una instrucción
  genérica de elegir la categoría de ingreso más adecuada del bloque correspondiente según
  el `tipo` detectado.
- `buildChatPrompt` recibe las categorías completas (`Category[]` con `type`) desde donde
  ya se cargan hoy (`api/chat/route.ts` / `handlers.ts`); no cambia la fuente de datos, solo
  el shape que se le pasa.
- `handleTransaction` (`src/lib/ai/handlers.ts`): validación defensiva antes del `insert` —
  si `data.categoryId` resuelve a una categoría cuyo `type` no coincide con `data.type`, se
  descarta el `category_id` (se guarda `null`) en vez de persistir una combinación
  inconsistente. Protege contra una elección equivocada del modelo.

### 7. Onboarding

- `DEFAULT_ONBOARDING_CATEGORIES` (`src/app/onboarding/constants.ts`) son todas de gasto
  hoy; `saveOnboardingCategories` (`src/app/onboarding/actions.ts`) las persiste con
  `type: 'expense'` explícito.
- Al finalizar el onboarding, se siembran automáticamente (sin UI nueva en el slide) las
  mismas dos categorías de ingreso por defecto que la migración: `💰 Sueldo` y
  `📈 Freelance / Otros ingresos`. El usuario puede editarlas o borrarlas después desde
  `/categorias`.

## Fuera de alcance (YAGNI)

- No se agrega la variante `'both'` para categorías mixtas (descartado en brainstorming).
- No se toca el modelo de `installment_plans` / `recurring_plans` — siguen sin `type`,
  son inherentemente gasto.
- No se rediseña el prompt de la IA más allá de lo necesario para pasar el `type` por
  categoría (no se tocan las demás reglas/casos del prompt).

## Criterios de aceptación

1. `categories.type` existe, es `NOT NULL`, con `CHECK IN ('income','expense')`, y todas
   las categorías existentes en DEV/PROD quedaron backfilleadas sin nulos.
2. Ningún usuario (nuevo ni existente post-migración) tiene cero categorías de tipo
   `income`.
3. Al crear/editar un movimiento, cuota o mensualidad, el selector de categoría solo
   muestra categorías del `type` correspondiente (gasto siempre para cuotas/mensualidades;
   según el `TypeToggle` para movimientos).
4. Editar el tipo de una categoría con movimientos/planes asociados está bloqueado en la UI,
   con mensaje explicativo; sin asociados, es editable.
5. Al borrar una categoría con dependencias, el selector de "reasignar a" solo ofrece
   categorías del mismo tipo.
6. `/categorias` muestra tabs "Gastos"/"Ingresos" y cada una lista solo las categorías de
   su tipo, con stats coherentes (gasto o ingreso del mes/histórico según la tab).
7. El selector de categoría de presupuestos (`/objetivos`) solo ofrece categorías de gasto.
8. El prompt de la IA distingue categorías de ingreso y gasto por bloques; ya no depende
   del nombre literal "Ingresos".
9. `npm run lint`, `npm test` y `npm run build` pasan.
