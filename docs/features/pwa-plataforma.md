# PWA y plataforma (infraestructura transversal)

## Propósito
Todo lo que sostiene a Chanchito por debajo de las features: PWA instalable con service worker, middleware de auth/onboarding sobre Supabase SSR, clientes Supabase server/browser, pipeline de deploy (master → Vercel PROD con Supabase PROD; `.env.local` → Supabase DEV), migraciones SQL versionadas, APIs externas de cotizaciones y el design system de tokens semánticos.

## Rutas / entry points
- `src/middleware.ts` → corre en TODAS las rutas (salvo estáticos por matcher) y delega en `updateSession` de `src/utils/supabase/middleware.ts`.
- `src/app/manifest.ts` → genera `/manifest.webmanifest` (name "Chanchito", `display: standalone`, `theme_color #F4EDDC` papel crema, íconos del chancho en 192/512, con archivos **distintos** para `any` y `maskable`).
- Service worker: generado por `@ducanh2912/next-pwa` en build a `public/sw.js` (**gitignoreado**, ver `.gitignore:44-45`); `public/swe-worker-*.js` sí está commiteado. **Deshabilitado en dev** (`disable: NODE_ENV === 'development'`).

## Archivos clave
| Archivo | Rol |
|---|---|
| `next.config.ts` | `withPWAInit`: `dest: "public"`, `cacheOnFrontEndNav` + `aggressiveFrontEndNavCaching`, `reloadOnOnline`, workbox sin dev logs. Además `reactCompiler: true` e `images.remotePatterns` para avatares de Google |
| `src/utils/supabase/server.ts` | `createClient()` server-side (`@supabase/ssr` + `cookies()` **await**, Next 15); escrituras de cookies en Server Components se tragan el error a propósito |
| `src/utils/supabase/client.ts` | `createBrowserClient` (valida env vars y lanza si faltan) |
| `src/utils/supabase/middleware.ts` | `updateSession`: refresh de sesión + protección de rutas + gate de onboarding |
| `src/middleware.ts` | Wrapper + `config.matcher` (excluye `_next/*`, favicon y archivos con extensión) |
| `src/lib/pwa/install.ts` | Decisión pura de qué ofrecer: `decidirVista` (3 señales → `oculto`/`boton`/`ios`) y `esIOS` (incluye el iPad que se hace pasar por Mac) |
| `src/lib/pwa/prompt-diferido.ts` | Captura del `beforeinstallprompt` **al cargar el módulo**, fuera de React: el evento puede llegar antes de la hidratación |
| `src/hooks/useInstallApp.ts` | Une las señales del navegador con la decisión pura vía `useSyncExternalStore` |
| `src/components/shared/install-app.tsx` | Contenedor: variante `login` / `ajustes` + modal con los pasos de iOS |
| `src/components/shared/install-app-view.tsx` | Presentación pura (`InstallAppView`, `PasosIOS`), verificable sin DOM |
| `src/components/ui/pull-to-refresh.tsx` | Pull-to-refresh táctil casero (touch events, umbral 80 px con resistencia); usado SOLO en el home (`src/app/page.tsx:347`) envolviendo el dashboard con `onRefresh={fetchAllData}` |
| `src/app/globals.css` | **Fuente de verdad de tokens** (Tailwind v4 `@theme inline`, 3 capas: primitivos → semánticos → componente; dark mode y acentos alternos gold/rojo vía overrides de `:root`) |
| `design-system-plan.md` (raíz) | Plan/decisiones del design system (documento de seguimiento) |
| `design_handoff_chanchito/prototypes/` | Prototipos JSX = fuente visual de verdad (`Chanchito App.html` para verificar en navegador) |
| `supabase/migrations/*.sql` | Migraciones versionadas (9 archivos, de `20260322_add_goals_tables` a `20260706_add_type_to_categories`) |
| `.claude/skills/migrar-schema/SKILL.md` | Checklist DEV → tipos → Zod → **PROD antes del merge** |
| `REGLAS_PARA_DEPLOY.md` (raíz) | Ciclo de vida de una feature: SQL en DEV → PROD, previews de Vercel por PR, checklist pre-merge (menciona n8n, capa histórica del bot de Telegram) |

## Tablas DB (¿qué `user_id` usa cada tabla?)
Esta feature no posee tablas propias, pero el middleware y los clientes tocan el corazón del **gotcha crítico** (documentado en `supabase/migrations/20260323_enable_rls_core_tables.sql`):
- **Grupo A — UUID de auth (`auth.uid()`)**: `categories`, `investments`, `savings`, `internal_transfers`, `savings_goals`, `savings_goal_contributions`, `category_budgets`, `investment_assets`, `investment_transactions`.
- **Grupo B — id interno de `public.users` (`users.id`)**: `transactions`, `payment_methods`, `installment_plans`, `recurring_plans`.
- Filtrar con el id equivocado produce queries que **nunca matchean sin error** (fuente de 5 bugs del chat ya corregidos).

> **Verificado contra la DB real (2026-07-08, SQL directo)**: `users.id` es un **UUID que ES el `auth.uid()`** (FK directa a `auth.users(id)`); la columna `users.auth_user_id` era vestigial (NULL en todos los usuarios) y toda query/política que filtre por ella matcheaba 0 filas. TODOS los ids de las tablas de la app son UUID — `types/database.ts` fue **regenerado desde el schema real** (los numéricos son solo `legacy_*`). Los valores de Grupo A y B coinciden en runtime, pero la convención por tabla se mantiene porque las FKs difieren.
>
> **Seguridad RLS — migración `supabase/migrations/20260708_fix_rls_open_policies.sql`**: las tablas core (`transactions`/`payment_methods`/`recurring_plans`/`installment_plans`/`investments`) y las `legacy_*` tenían políticas permisivas `ALL/qual=true/public` que anulaban el aislamiento por usuario, y la app dependía de ellas porque `get_current_user_int_id()` filtraba por `auth_user_id` (NULL). La migración redefine el helper a `auth.uid()`, backfillea `auth_user_id`, dropea las políticas abiertas, arregla la lectura de `chat_usage`, habilita escritura `authenticated` en `market_prices`/`exchange_rates` (los upserts a `exchange_rates` desde `/api/investments/update-prices` fallaban EN SILENCIO: eran solo `service_role` y el endpoint usa el cliente de sesión) y enciende RLS en `staging_plans`. **Verificar su aplicación en la DB antes de asumir el aislamiento** (el checklist de verificación está en el mensaje de commit y abajo): simular el JWT de un usuario con `set_config('request.jwt.claims', …)` + `SET LOCAL ROLE authenticated` y confirmar que solo ve sus filas.

## Flujos principales
1. **Request autenticado**: middleware → excluye `/auth`, `/login`, `/signup`, `/_next`, `/api` y paths con `.` → `supabase.auth.getUser()` → sin usuario redirige a `/login` → con usuario y fuera de `/onboarding`, consulta `users.onboarding_completed`; si no completó, redirige a `/onboarding` **copiando las cookies** de sesión al redirect (evita loops de sesión).
2. **Datos externos (non-blocking)**: `fetchAllData()` del store (`lib/store/financeStore.ts`) hace `Promise.all` de ~16 queries y luego fetchea **dólar blue** (`dolarapi.com/v1/dolares/blue`, timeout 5 s) e **inflación IPC** (`api.argentinadatos.com`, últimos 24 meses) — ambos opcionales: si fallan, la app sigue (los cálculos caen a `exchange_rates`/snapshots vía `resolveRate`). El server del chat tiene su propio `fetchDolarBlue` (timeout 2 s) en `lib/ai/tools/dataLoader.ts`.
3. **Migración de schema** (skill `migrar-schema`): escribir SQL → aplicar en **DEV** (el de `.env.local`) → regenerar `types/database.ts` → actualizar schemas Zod → aplicar en **PROD** → recién ahí mergear a `master` (Vercel despliega automático). Si el deploy llega antes que la migración, PROD se rompe.
4. **PWA**: en producción el SW cachea navegación front-end agresivamente y recarga al volver online; en dev no hay SW (evita cache fantasma). El manifest se sirve desde `src/app/manifest.ts`, que es la única fuente (el `public/site.webmanifest` legacy se borró el 2026-08-22 junto con los íconos viejos).
5. **Invitación a instalar** (2026-08-22): la app era instalable desde el primer día pero nada lo decía. Ahora la ofrece el **login** (segundo camino bajo el botón de Google) y **Ajustes** (para quien ya entró sin instalarla y, si no, tendría que cerrar sesión para volver a verla). Se retira sola dentro de la app instalada, tras usar el prompt y al recibir `appinstalled`. En iOS no hay evento: se muestra el paso a paso de Safari.

## Invariantes y gotchas
- **`master` = PROD**: no hay staging; los previews de Vercel por PR apuntan a Supabase DEV si las env vars de "Preview" están configuradas así.
- **SQL primero, merge después** — regla de oro repetida en `CLAUDE.md`, la skill y `REGLAS_PARA_DEPLOY.md`.
- `public/sw.js`/`sw.js.map` están gitignoreados: no buscarlos en el repo; se generan en `npm run build` (Webpack; dev usa Turbopack).
- El matcher del middleware excluye `/api/*` (la exclusión vive en `updateSession`, los route handlers hacen su propio `auth.getUser()`); las rutas de API devuelven 401 propio.
- Cambiar UI: **solo tokens semánticos** (`bg-bg`, `bg-surface`, `text-good/bad/warn`, `border-[1.5px] border-border`, `shadow-card`…) — nunca hex ni escalas Tailwind (`emerald-*`, `slate-*`, etc.). El mapeo vive en `globals.css` bajo `@theme inline`.
- **Íconos de la app** (2026-08-22): todos salen del chancho de la identidad (`design/brand/chancho.svg`), tinta navy sobre papel crema. Viven en `public/`: `favicon.svg`, `favicon-96x96.png`, `apple-touch-icon.png` (180), `icon-192.png`/`icon-512.png` (`any`) y `icon-192-maskable.png`/`icon-512-maskable.png`. El `.ico` va en `src/app/favicon.ico` (convención de Next: se sirve en `/favicon.ico` y NO debe duplicarse en `public/`), con 16/32/48 adentro.
  - Los `maskable` son **otro archivo**, no el mismo con otro `purpose`: Android recorta hasta un círculo, así que su chancho va al 56% del lado para entrar en la safe zone del 80%; los `any` van al 74%.
  - En 16-32px el chancho ocupa casi todo el cuadro (96%/94%): con el margen de los tamaños grandes se lee como una manchita en la pestaña.
  - Cómo regenerarlos, en `design/brand/README.md`.
- **El prompt de instalación se quema al usarlo**: Chrome no vuelve a emitir `beforeinstallprompt` en esa carga de página, ni siquiera si el usuario cancela el diálogo. Por eso la invitación desaparece después del click en lugar de quedar como un botón muerto.
- **El sello del login ocupa la esquina inferior derecha** (`bottom-8`, rotado, ~190×190 px de caja): cualquier cosa que se agregue al `main` del login compite con él. La invitación obligó a subir su `pb` a `13rem` — medido en el navegador en 390×844 y 375×667, las cajas no se tocan por ~7 px. Si crece el copy, se vuelve a medir.
- Pull-to-refresh: implementación propia con `touchmove` **no pasivo** (`preventDefault`); solo se activa con `window.scrollY === 0`. No usar librerías de PTR.
- `.env.local` requiere `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (el client browser lanza si faltan). El chat suma `GEMINI_API_KEY` (ver `lib/ai/`).
- `REGLAS_PARA_DEPLOY.md` menciona flujos n8n/Telegram: es la capa histórica del bot; el asistente actual es `/api/chat` (no confundir).

## Tests
- La decisión de instalación sí está cubierta: `src/lib/pwa/__tests__/install.test.ts` (11) y `prompt-diferido.test.ts` (10, con un `EventTarget` inyectado) + `src/components/shared/__tests__/install-app-view.test.tsx` (15). No hay tests de middleware ni del service worker. Los tests unitarios (`npm test`, Vitest) cubren `lib/finance`, store y chat; `src/lib/store/__tests__/resolveRate.test.ts` cubre el fallback de cotizaciones.
- Verificación de PWA: `npm run build && npm start` (el SW no existe en dev) + Lighthouse/instalación desde el navegador.
- Verificación visual del design system: abrir `design_handoff_chanchito/prototypes/Chanchito App.html`.

## Docs relacionados
- `CLAUDE.md` — secciones Deploy, UI (tokens/tipografía/componentes DS) y Reglas Server/Client.
- `.claude/skills/migrar-schema/SKILL.md` (checklist completo) y `.claude/skills/nueva-feature/`.
- `REGLAS_PARA_DEPLOY.md`, `design-system-plan.md`.
- `supabase/migrations/20260323_enable_rls_core_tables.sql` — mapa definitivo de `user_id` por tabla + RLS.
