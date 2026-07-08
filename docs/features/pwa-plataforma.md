# PWA y plataforma (infraestructura transversal)

## Propósito
Todo lo que sostiene a Chanchito por debajo de las features: PWA instalable con service worker, middleware de auth/onboarding sobre Supabase SSR, clientes Supabase server/browser, pipeline de deploy (master → Vercel PROD con Supabase PROD; `.env.local` → Supabase DEV), migraciones SQL versionadas, APIs externas de cotizaciones y el design system de tokens semánticos.

## Rutas / entry points
- `src/middleware.ts` → corre en TODAS las rutas (salvo estáticos por matcher) y delega en `updateSession` de `src/utils/supabase/middleware.ts`.
- `src/app/manifest.ts` → genera `/manifest.webmanifest` (name "Chanchito", `display: standalone`, `theme_color #020617`, íconos `/icon.png` 192/512 any+maskable).
- Service worker: generado por `@ducanh2912/next-pwa` en build a `public/sw.js` (**gitignoreado**, ver `.gitignore:44-45`); `public/swe-worker-*.js` sí está commiteado. **Deshabilitado en dev** (`disable: NODE_ENV === 'development'`).

## Archivos clave
| Archivo | Rol |
|---|---|
| `next.config.ts` | `withPWAInit`: `dest: "public"`, `cacheOnFrontEndNav` + `aggressiveFrontEndNavCaching`, `reloadOnOnline`, workbox sin dev logs. Además `reactCompiler: true` e `images.remotePatterns` para avatares de Google |
| `src/utils/supabase/server.ts` | `createClient()` server-side (`@supabase/ssr` + `cookies()` **await**, Next 15); escrituras de cookies en Server Components se tragan el error a propósito |
| `src/utils/supabase/client.ts` | `createBrowserClient` (valida env vars y lanza si faltan) |
| `src/utils/supabase/middleware.ts` | `updateSession`: refresh de sesión + protección de rutas + gate de onboarding |
| `src/middleware.ts` | Wrapper + `config.matcher` (excluye `_next/*`, favicon y archivos con extensión) |
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

> **Verificado contra la DB real (2026-07-08, SQL directo)**: `users.id` es un **UUID que ES el `auth.uid()`** (FK directa a `auth.users(id)`); la columna `users.auth_user_id` está **NULL en todos los usuarios** (el backfill manual nunca corrió) y toda query/política que filtre por ella matchea 0 filas. `types/database.ts` (`users.id: number`) está desactualizado. En la práctica los valores de Grupo A y B coinciden hoy, pero la convención por tabla se mantiene porque las FKs difieren.
>
> **Deuda de seguridad RLS (pendiente, NO tocar sin plan)**: `transactions`/`payment_methods`/`recurring_plans`/`installment_plans`/`investments` y las tablas `legacy_*` tienen políticas permisivas `ALL/qual=true/public` que anulan el aislamiento por usuario; las políticas `*_owner` correctas existen pero (a) quedan neutralizadas por el OR de políticas permisivas y (b) dependen de `auth_user_id` (NULL) → **la app hoy funciona GRACIAS a las políticas abiertas**. Remediación segura: backfillear `auth_user_id = id` (o reescribir los helpers a `id = auth.uid()`), verificar las políticas owner con un JWT real, y recién entonces dropear las `qual=true`. `market_prices` además permite `ALL` a `public` (cualquiera puede pisar precios).

## Flujos principales
1. **Request autenticado**: middleware → excluye `/auth`, `/login`, `/signup`, `/_next`, `/api` y paths con `.` → `supabase.auth.getUser()` → sin usuario redirige a `/login` → con usuario y fuera de `/onboarding`, consulta `users.onboarding_completed`; si no completó, redirige a `/onboarding` **copiando las cookies** de sesión al redirect (evita loops de sesión).
2. **Datos externos (non-blocking)**: `fetchAllData()` del store (`lib/store/financeStore.ts`) hace `Promise.all` de ~16 queries y luego fetchea **dólar blue** (`dolarapi.com/v1/dolares/blue`, timeout 5 s) e **inflación IPC** (`api.argentinadatos.com`, últimos 24 meses) — ambos opcionales: si fallan, la app sigue (los cálculos caen a `exchange_rates`/snapshots vía `resolveRate`). El server del chat tiene su propio `fetchDolarBlue` (timeout 2 s) en `lib/ai/tools/dataLoader.ts`.
3. **Migración de schema** (skill `migrar-schema`): escribir SQL → aplicar en **DEV** (el de `.env.local`) → regenerar `types/database.ts` → actualizar schemas Zod → aplicar en **PROD** → recién ahí mergear a `master` (Vercel despliega automático). Si el deploy llega antes que la migración, PROD se rompe.
4. **PWA**: en producción el SW cachea navegación front-end agresivamente y recarga al volver online; en dev no hay SW (evita cache fantasma). El manifest se sirve desde `src/app/manifest.ts` (hay también un `public/site.webmanifest` legacy de los favicons).

## Invariantes y gotchas
- **`master` = PROD**: no hay staging; los previews de Vercel por PR apuntan a Supabase DEV si las env vars de "Preview" están configuradas así.
- **SQL primero, merge después** — regla de oro repetida en `CLAUDE.md`, la skill y `REGLAS_PARA_DEPLOY.md`.
- `public/sw.js`/`sw.js.map` están gitignoreados: no buscarlos en el repo; se generan en `npm run build` (Webpack; dev usa Turbopack).
- El matcher del middleware excluye `/api/*` (la exclusión vive en `updateSession`, los route handlers hacen su propio `auth.getUser()`); las rutas de API devuelven 401 propio.
- Cambiar UI: **solo tokens semánticos** (`bg-bg`, `bg-surface`, `text-good/bad/warn`, `border-[1.5px] border-border`, `shadow-offset`…) — nunca hex ni escalas Tailwind (`emerald-*`, `slate-*`, etc.). El mapeo vive en `globals.css` bajo `@theme inline`.
- El `theme_color` del manifest (`#020617`, slate-950) predata el design system crema — si se toca, revisar consistencia con `--bg`.
- Pull-to-refresh: implementación propia con `touchmove` **no pasivo** (`preventDefault`); solo se activa con `window.scrollY === 0`. No usar librerías de PTR.
- `.env.local` requiere `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (el client browser lanza si faltan). El chat suma `GEMINI_API_KEY` (ver `lib/ai/`).
- `REGLAS_PARA_DEPLOY.md` menciona flujos n8n/Telegram: es la capa histórica del bot; el asistente actual es `/api/chat` (no confundir).

## Tests
- No hay tests de middleware/PWA. Los tests unitarios (`npm test`, Vitest) cubren `lib/finance`, store y chat; `src/lib/store/__tests__/resolveRate.test.ts` cubre el fallback de cotizaciones.
- Verificación de PWA: `npm run build && npm start` (el SW no existe en dev) + Lighthouse/instalación desde el navegador.
- Verificación visual del design system: abrir `design_handoff_chanchito/prototypes/Chanchito App.html`.

## Docs relacionados
- `CLAUDE.md` — secciones Deploy, UI (tokens/tipografía/componentes DS) y Reglas Server/Client.
- `.claude/skills/migrar-schema/SKILL.md` (checklist completo) y `.claude/skills/nueva-feature/`.
- `REGLAS_PARA_DEPLOY.md`, `design-system-plan.md`.
- `supabase/migrations/20260323_enable_rls_core_tables.sql` — mapa definitivo de `user_id` por tabla + RLS.
