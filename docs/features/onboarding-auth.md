# Onboarding y Autenticación

## Propósito
Alta y acceso de usuarios: login con **Google OAuth (único proveedor)** vía Supabase Auth, protección de rutas por middleware, onboarding inicial de configuración (nombre, categorías, medios de pago) con **slides manuales**, y un tour guiado multi-ruta post-registro.

> El chat conversacional de onboarding (`/api/chat/onboarding`, `lib/ai/onboarding*`) fue **ELIMINADO** (stubs borrados en commit `8120687`, rama `chore/limpieza-proyecto`). El único uso de IA que queda en onboarding es `suggestCategoriesFromDescription` (sugerir categorías, opcional). Referencias a `/api/chat/onboarding` en comentarios de migraciones viejas son históricas.

## Rutas / entry points
- `/login` — `src/app/login/page.tsx` (Server) → `login-form.tsx` (Client, botón Google + errores por query param `?error=`).
- `/auth/callback` — `src/app/auth/callback/route.ts` (GET): `exchangeCodeForSession(code)` → redirect al `next` **saneado** (default `/`) o `/login?error=auth_callback_failed`. El `next` pasa por `destinoSeguro` (`lib/security/destino-redirect.ts`): sólo rutas internas, porque `@evil.com` convertía `${origin}${next}` en una URL cuyo host es otro (auditoría 2026-08-26, L1).
- `/onboarding` — `src/app/onboarding/page.tsx` (Server: redirige a `/login` sin user y a `/` si `onboarding_completed`) → `onboarding-flow.tsx` (Client).
- **Middleware global**: `src/middleware.ts` → `updateSession` de `src/utils/supabase/middleware.ts`. Sin sesión deja pasar solo `/` (la landing) y las `RUTAS_PUBLICAS` de `src/lib/rutas-publicas.ts` (hoy `/privacidad`), que tampoco pasan por los gates de onboarding/puesta a punto: la política se tiene que poder leer con la cuenta a medio configurar.
- `/privacidad` — política de privacidad y condiciones de uso, pública. Ver `docs/features/ajustes-perfil.md`.
- **Borrar la cuenta** — `/ajustes/perfil` → `deleteMyAccount()` (`src/app/perfil/actions.ts`): purga por RPC `delete_my_account()` + `auth.admin.deleteUser`. Ver `docs/features/ajustes-perfil.md`.

## Archivos clave
| Archivo | Rol |
|---|---|
| `src/app/login/actions.ts` | `signInWithGoogle`: `signInWithOAuth({ provider: 'google', redirectTo: <origin>/auth/callback })`; origin desde headers `host`/`x-forwarded-proto` |
| `src/app/login/login-form.tsx` | UI de login, muestra `auth_callback_failed` |
| `src/app/auth/callback/route.ts` | Intercambio code→session con `createServerClient` (cookies) |
| `src/utils/supabase/middleware.ts` | `updateSession`: sesión + gate de login + gate de onboarding |
| `src/app/onboarding/onboarding-flow.tsx` | Máquina de slides: `welcome → features → name → categories → payment → complete` |
| `src/app/onboarding/slides/*.tsx` | `name-slide`, `categories-slide`, `payment-methods-slide` |
| `src/app/onboarding/actions.ts` | Server actions del onboarding (ver flujos) |
| `src/app/onboarding/constants.ts` | Constantes del flujo |
| `src/components/onboarding/onboarding-tour.tsx` | Tour: overlay que apunta a elementos `[data-tour="..."]` |
| `src/lib/store/onboardingStore.ts` | Zustand persistido (`chanchito-tour`): estado del tour, `TOUR_ROUTE_ORDER`, sync con `users.tour_completed` |
| `src/components/layout/app-shell.tsx` | Monta `OnboardingTour` (dynamic, ssr:false) y llama `syncTourFromSupabase(user.id)` una vez |

## Tablas DB — identidad de `users` (gotcha crítico, VERIFICADO contra la DB real 2026-07-08)
Realidad de la DB (consultada por SQL directo):
- `users.id`: **UUID que ES el `auth.uid()`** — FK directa `users.id → auth.users(id)`, y los 6 usuarios existentes matchean. (`types/database.ts` fue regenerado desde el schema real; el comentario "INTEGER PK interna" de la migración `20260323_enable_rls_core_tables.sql` quedó como registro histórico equivocado.)
- `users.auth_user_id`: columna **vestigial, NULL en el 100% de los usuarios** (el backfill manual de la migración nunca corrió). Cualquier query o política RLS que filtre por `auth_user_id` matchea **0 filas, sin error**. La migración `20260708_fix_rls_open_policies.sql` la backfillea (`auth_user_id = id`) y actualiza `handle_new_user` para mantener el invariante, pero la regla sigue: **no filtrar por ella**.

RLS efectiva de `users`: funciona por la política `"Users access own data"` (`auth.uid() = id`). Las políticas `users_select_own`/`users_update_own` (`auth_user_id = auth.uid()`) están **muertas** (NULL).

**Call-sites, releídos con esa realidad:**
- Filtran `users` con `.eq('id', user.id)` pasando el UUID de auth (`src/utils/supabase/middleware.ts:62`, `src/app/onboarding/page.tsx:17`, `src/app/onboarding/actions.ts:42/201`, `src/lib/store/financeStore.ts:517`, `src/app/categorias/actions.ts:87`): **CORRECTOS** — `id` es el auth uid.
- `onboardingStore.skipTour/completeTour/resetTour`: filtraban por `.eq('auth_user_id', <uuid>)` → actualizaban 0 filas y `tour_completed` nunca persistía en Supabase (el tour reaparecía en cada dispositivo). **Corregido** (commit `92c003f`): ahora filtran por `id`, igual que `syncTourFromSupabase`.
- No filtran (solo RLS + `.single()`): `src/app/api/chat/route.ts:86-90` — funciona vía la política `auth.uid() = id`.

Columnas de estado: `users.onboarding_completed` (gate del middleware), `users.tour_completed`, `users.first_name`.
Tablas escritas por el onboarding: `categories` y `payment_methods` — ambas insertan `user_id: user.id` (auth UUID), correcto en la DB real.

## Flujos principales
1. **Login**: `/login` → `signInWithGoogle()` (server action) → Google → `/auth/callback?code=...` → `exchangeCodeForSession` → cookies de sesión → redirect `/`.
2. **Middleware** (todas las rutas salvo `/login`, `/auth/*`, `/api/*`, `/_next/*` — `debeSaltearElGate` en `lib/security/alcance-middleware.ts` — y los archivos con extensión, que filtra el `matcher`): sin user → redirect `/login`; con user y fuera de `/onboarding`, consulta `users.onboarding_completed` y si no es `true` → redirect `/onboarding` (copiando cookies al redirect). Errores de DB (salvo `PGRST116`) dejan pasar.
3. **Onboarding (slides)**:
   - `saveOnboardingName(name)`: valida (no vacío, ≤50 chars) y actualiza `users.first_name`.
   - `saveOnboardingCategories(categories)`: **idempotente** — borra las categorías custom previas (`is_system=false`) e inserta las elegidas como `type:'expense'` + 2 categorías de ingreso por defecto ("Sueldo", "Freelance / Otros ingresos") para que el selector de Ingreso nunca quede vacío.
   - `suggestCategoriesFromDescription(texto)` (opcional, "Personalizar con IA"): Gemini 2.5 Flash (`@google/genai`) devuelve JSON de 5-10 categorías; se renderizan como chips editables, **no se guardan automáticamente**.
   - `saveOnboardingPaymentMethods(methods, defaultName?)`: idempotente (delete + insert), setea días de cierre/vencimiento solo para `credit`, y marca `is_default` (reset de todos + marca el elegido).
   - `completeOnboarding()`: `users.onboarding_completed = true` → el middleware deja de redirigir; el flow hace `router.push('/')`.
4. **Tour post-registro**: `AppShell` monta `OnboardingTour` en toda ruta autenticada. Recorre `TOUR_ROUTE_ORDER` (`/`, `/movimientos`, `/compromisos`, `/objetivos`, `/ajustes`, `/`) con pasos por ruta (`TOUR_STEPS_BY_ROUTE`) que apuntan a `data-tour="..."` (ej. `balance-card`, `fab`, `section-medios`). `advanceTour()` devuelve la próxima ruta a navegar o `null`. Completar/saltear persiste `tour_completed=true` en Supabase y en localStorage; `syncTourFromSupabase(user.id)` lo baja al iniciar. Se puede reiniciar desde `/ajustes/perfil` (`resetTour`).

## Invariantes y gotchas
- El middleware excluye `/api/*`: los endpoints hacen su propia auth (ej. `/api/chat`).
- `AppShell` no renderiza nav/chat/tour en `PUBLIC_ROUTES` (`/login`, `/auth`) ni `ONBOARDING_ROUTES` (`/onboarding`).
- Las actions de onboarding son **idempotentes por borrado previo**: re-correr el onboarding pisa categorías custom y medios de pago existentes — no reutilizarlas fuera de ese contexto.
- El onboarding solo crea categorías de gasto desde el slide; las de ingreso default se agregan siempre.
- `onboardingStore` conserva SOLO el tour (la parte de chat conversacional fue removida; ver nota en el header del archivo).
- El estado del tour persiste en localStorage (`chanchito-tour`): probar en incógnito o con `resetTour` al debuggear.

## Tests
No hay tests dedicados de login/onboarding/tour (no existen `__tests__` bajo `src/app/login`, `src/app/onboarding` ni para `onboardingStore`). Los tests de stores viven en `src/lib/store/__tests__/` pero cubren finanzas, no el tour.

## Docs relacionados
- `supabase/migrations/20260323_enable_rls_core_tables.sql` — la explicación más completa de la doble identidad `users.id` / `auth_user_id` y las políticas RLS por grupo (UUID vs INTEGER).
- `supabase/migrations/20260326_add_tour_completed_to_users.sql` — columna del tour.
- `CLAUDE.md` (reglas Server/Client, store) y `docs/features/asistente-ia.md` (el gotcha `user_id` aplica igual acá).
