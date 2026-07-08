# Categorías

## Propósito
Etiquetas de clasificación de movimientos, cuotas y mensualidades, con **tipo** explícito `income | expense` (tabs separadas en la UI, filtrado de pickers por tipo) y **descripción asistida por IA** que alimenta la clasificación automática del chatbot. Incluye los flujos de borrado seguro (reasignar / desvincular) y la categoría de sistema "Pagos de tarjeta".

## Rutas / entry points
- `/ajustes/categorias` — `src/app/ajustes/categorias/page.tsx` (Server Component: fetchea `categories` con `utils/supabase/server` filtrando por el usuario de auth y renderiza `CategoriesWithStats` + `CreateCategoryDialog`).
- **La ruta legacy `/categorias` fue eliminada**: en `src/app/categorias/` NO hay `page.tsx`, pero quedan `actions.ts` y `_components/categories-with-stats.tsx`, que **sí se usan** (los importan la página de ajustes y `category-card-actions.tsx`). No borrarlos por "parecer huérfanos".
- Coexiste un segundo módulo de actions: `src/app/dashboard/categories/actions.ts` (su `createCategory` es el que usa `create-category-dialog.tsx`). Ambos revalidan `/ajustes/categorias` y `/dashboard/categories`.

## Archivos clave
| Archivo | Rol |
|---|---|
| `src/app/ajustes/categorias/page.tsx` | Entry server de la pantalla |
| `src/app/categorias/_components/categories-with-stats.tsx` | Tabs Gasto/Ingreso + stats (`getCategoryBreakdown(scope, type)` del store) |
| `src/app/categorias/actions.ts` | `createCategory`, `updateCategory` (guard de cambio de tipo), `getCategoryDependencies`, `deleteCategoryReassign`, `deleteCategoryUnlink`, `deleteCategory` |
| `src/app/dashboard/categories/actions.ts` | `createCategory` usado por el diálogo de alta |
| `src/components/categories/create-category-dialog.tsx` | Alta (toggle Gasto/Ingreso, default `expense`, botón IA) |
| `src/components/categories/category-card-actions.tsx` | Edición + borrado (reasignar/desvincular) + regenerar descripción IA |
| `src/app/actions/ai.ts` | `generateCategoryDescription(name)` — Gemini 2.5 Flash vía `@google/genai` (`GOOGLE_API_KEY`), devuelve descripción ≤250 chars |
| `src/lib/schemas/category.ts` | Zod `categorySchema`: `name` ≤50, `emoji`, `description` ≤300 opcional, `type: 'income'|'expense'` |
| `supabase/migrations/20260706_add_type_to_categories.sql` | Migración del campo `type` |
| `src/app/compromisos/actions.ts` (`payCreditCardCycle`) | Get-or-create de la categoría "Pagos de tarjeta" |

## Tablas DB
| Tabla | Filtro de usuario |
|---|---|
| `categories` | `user_id` = **UUID de auth** (`id` de la categoría también es UUID/string) |
| `transactions` / `installment_plans` / `recurring_plans` | `user_id` = **id interno** (`users.id`) — se tocan al contar dependencias, reasignar o desvincular |

Gotcha crítico (CLAUDE.md): `categories` filtra por el **UUID de auth**, mientras que las tablas de movimientos filtran por el **id interno** de `public.users`. Por eso `getCategoryDependencies`/`deleteCategoryReassign`/`deleteCategoryUnlink` resuelven primero `dbUser` desde la tabla `users` antes de tocar `transactions`/planes. En la capa IA: `ctx.authUserId` para categorías, `ctx.userId` para el resto — confundirlos da queries que nunca matchean, sin error.

## Flujos principales
1. **Alta**: `createCategory` valida con Zod e inserta con `is_system: false`. El diálogo defaultea `type: 'expense'` y ofrece el botón "IA" que llama `generateCategoryDescription` para autocompletar la descripción (crucial: esa descripción entrena la clasificación automática del asistente).
2. **Edición** (`updateCategory` en `src/app/categorias/actions.ts`): si el `type` cambia, hay **guard de servidor**: consulta `getCategoryDependencies(id)` (conteo de `transactions` + `installment_plans` + `recurring_plans`) y rechaza el cambio si `total > 0`. El deshabilitado del toggle en el cliente es solo UX; la validación real es esta.
3. **Borrado**: tres variantes — `deleteCategoryReassign(id, newCategoryId)` (reapunta las 3 tablas dependientes y borra), `deleteCategoryUnlink(id)` (setea `category_id = null` y borra) y `deleteCategory(id)` directo, que traduce el error FK `23503` a un mensaje pidiendo reasignar/desvincular.
4. **Tabs por tipo**: `CategoriesWithStats` filtra `categories` por `type` y muestra stats del mes y globales con `getCategoryBreakdown('current_month' | 'global', type)`.
5. **"Pagos de tarjeta"** (get-or-create en `payCreditCardCycle`): categoría de sistema (`emoji 💳`, `is_system: true`, `type: 'expense'`) que existe porque `transactions.category_id` es NOT NULL. Sus transacciones quedan igualmente **fuera de las analíticas de consumo**, pero por el marcador `card_payment_for`, no por la categoría.

## Invariantes y gotchas
- **`type` es NOT NULL con CHECK `('income','expense')` y DEFAULT `'expense'`** (migración `20260706_add_type_to_categories.sql`). La migración backfilleó por historial de transacciones (mayoría income → income) y sembró 2 categorías de ingreso ("Sueldo", "Freelance / Otros ingresos") para usuarios sin ninguna, para que el selector de Ingreso nunca quede vacío.
- **No cambiar el tipo de una categoría con dependencias** — dejaría transacciones/planes apuntando a una categoría de tipo incompatible. El guard vive en `updateCategory`; replicarlo en cualquier nueva vía de edición (p. ej. tools del agente).
- Los IDs de categoría son **UUID (string)**, a diferencia de medios/planes/transacciones (numéricos). El diccionario del prompt del agente (`src/lib/ai/agentPrompt.ts`) lista categorías con sus UUIDs.
- Hay **dos `createCategory`** (en `src/app/categorias/actions.ts` y `src/app/dashboard/categories/actions.ts`) con lógica equivalente; si se toca la semántica de alta, mantener ambos o unificar conscientemente.
- `generateCategoryDescription` usa el SDK `@google/genai` (el viejo `@google/generative-ai` fue desinstalado — no reintroducirlo) y requiere `GOOGLE_API_KEY`; falla con mensaje amigable si falta.
- Cambios de schema SQL (como agregar campos a `categories`) se aplican a PROD **antes** del merge a `master` (ver skill `migrar-schema`).
- UI: la pantalla usa tokens semánticos (`bg-bg`, `text-muted`, etc.), `TabsDS`, `Card` y `ScreenHeader` — nunca colores Tailwind crudos.

## Tests
- `src/lib/store/__tests__/category-type-getters.test.ts` — getters que filtran por tipo de categoría.
- `src/lib/store/__tests__/analysis-getters.test.ts` — `getExpensesByCategory`/breakdowns (siembran estado con `useFinanceStore.setState`).
- `src/lib/finance/__tests__/analysis.test.ts` — `computeExpensesByCategory` puro (excluye `card_payment_for`).
- Correr con `npm test`.

## Docs relacionados
- `docs/superpowers/specs/2026-07-06-categorias-tipo-ingreso-gasto-design.md` — diseño completo del campo `type` (problema, backfill, filtrado de pickers, presupuestos, IA).
- `CLAUDE.md` — gotcha `user_id` (id interno vs UUID de auth) y regla de pago de tarjeta / categoría "Pagos de tarjeta".
- `docs/features/compromisos.md` — dónde y por qué se crea "Pagos de tarjeta".
- `docs/superpowers/specs/2026-07-07-chatbot-asistente-ia-design.md` — uso del diccionario de categorías por el agente.
