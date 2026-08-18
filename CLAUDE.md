# Chanchito – PWA de finanzas personales
Next.js App Router · Supabase (PostgreSQL + Auth) · Zustand · TypeScript

## Documentación por feature: `docs/features/`
Un doc por gran feature (arquitectura, archivos clave, tablas DB, invariantes y gotchas) pensado como contexto para iteraciones agénticas — **leer el de la feature que vayas a tocar**: `home-dashboard`, `movimientos`, `compromisos`, `objetivos`, `inversiones`, `medios-de-pago`, `categorias`, `asistente-ia`, `onboarding-auth`, `ajustes-perfil`, `transferencias-internas`, `pwa-plataforma`. Los planes/specs históricos por fecha viven en `docs/superpowers/`.

## Comandos
```bash
npm run dev      # Desarrollo (Turbopack)
npm run build    # Producción (Webpack)
npm run lint     # ESLint
npm test         # Vitest (run) · npm run test:watch para watch
```
Tests en `src/**/__tests__/`. Los del store (`lib/store/__tests__/analysis-getters.test.ts`, `disponible-real.test.ts`) siembran estado con `useFinanceStore.setState` y `vi.useFakeTimers`. La suite está **entera en verde** (354/354 al 2026-08-03).

## Reglas Server / Client
- `app/` → Server Components por defecto.
- `'use client'` solo si se necesitan hooks o event listeners.
- Server Components: fetch con `utils/supabase/server.ts`.
- Client Components: NUNCA fetch directo → solo `useFinanceStore`.
- Prohibido: `useEffect` para fetching, SWR, React Query.
- **Tablas globales de mercado** (`market_prices`, `exchange_rates`, sin `user_id`): las **escrituras** van con `createAdminClient()` (`utils/supabase/admin.ts`, service_role, server-only), NUNCA con el cliente de sesión. Si no, hay que dejar INSERT/UPDATE abiertos a `authenticated` y cualquier usuario logueado puede escribir con la anon key los precios que ven todos. Las lecturas siguen con el cliente de sesión. Requiere `SUPABASE_SERVICE_ROLE_KEY` en el entorno.

## Store: `lib/store/financeStore.ts`
Única fuente de verdad cliente. **Leer antes de modificar componentes.**
Nada de lógica de negocio en componentes. Los getters de cálculo del store son **wrappers finos sobre las funciones puras de `lib/finance/`** (ver sección propia): cambios de lógica financiera van ahí, no en el cuerpo del getter.

Getters disponibles:
- `getPortfolioStatus()` – portafolio de inversiones
- `getGlobalBalance()` – balance total. **Resta mensualidades históricas** (tx con `recurring_plan_id`) + las pendientes del mes en curso (`getPendingFixedExpenses`), NO solo el burn rate del mes.
- `getMonthlyBurnRate()` – planes recurrentes activos
- `getInstallmentStatus(planId)` – progreso de cuotas
- `getPaymentMethodStatus(methodId)` – **Crédito**: "a pagar en el vencimiento" del ciclo. Un movimiento pertenece al ciclo si el mes/año de `t.date` (que en crédito ya es la fecha de vencimiento calculada por `calculateCreditPaymentDate`) coincide con `nextPaymentDate`; incluye cuotas + compras + mensualidades adheridas (deduplicadas). Devuelve `arsExpenses`/`usdExpenses` por separado (NO se convierte USD→ARS en el desglose). El ciclo vigente (`getCreditCycleDates`) **avanza al siguiente resumen recién cuando el vencimiento ya pasó** (comparación por día): el día exacto del vencimiento ese resumen sigue siendo el vigente (todavía lo debés). **Débito/efectivo**: saldo histórico `ingresos − gastos` (los pagos de tarjeta, ver abajo, lo reducen).
- `getExpensesByCategory(scope)` – desglose por categoría
- `getMonthlyBalance(monthStr, methodId)` – balance mensual
- `getRealAvailableBalance()` – **Disponible Real** (número central del home). `disponibleReal = getGlobalBalance()`; expone también `saldoBruto`, `pendingFixedExpenses`, `pendingCardTotal` y `pendingCardItems` (`CreditCardCycleSummary[]` filtrado a `isPending`) para el desglose. El desglose de "Tu plata libre para hoy" (`BalanceCard`) lista debajo de "Tarjeta de este mes" una sub-línea por tarjeta pendiente con su **vencimiento vigente** (`nextPaymentDate`, la fecha real del ciclo en curso), su **estado** (`isCycleClosed`: "cerrado" = resumen ya cerrado a pagar / "en curso" = ciclo aún acumulando) y su monto en ARS (los `total` suman exacto `pendingCardTotal`). El estado explica por qué una tarjeta muestra consumo de un período anterior (cerrado) y otra el del período vigente (en curso). Invariante: pagar una mensualidad o tarjeta NO mueve `disponibleReal` **global** (sí baja el saldo del medio que financia el pago, ver "Medios de pago").
- `getPendingFixedExpenses()` – mensualidades activas sin transacción vinculada este mes (`{ total, items }`).
- `getRecurringBackfillPreview()` – meses de mensualidades sin registrar (`missingMonths`) y exceso a borrar (`excessMonths`), con piso en el mes del **primer ingreso** del usuario (una cuota/gasto anterior al primer sueldo NO fija el piso — evita meses fantasma).
- `getDefaultPaymentMethod()` – medio de pago marcado `is_default`.
- `getUnassignedTransactionsCount()` – transacciones con `payment_method_id == null`.
- `isCreditCardCyclePaid(methodId)` – true si existe un pago (`card_payment_for`) en el mes del vencimiento del ciclo vigente. (El viejo flag `paidCycles`/localStorage fue eliminado del store.)

`fetchAllData()` → Promise.all desde Supabase + API dólar blue (non-blocking).

**Mensualidades = transacciones reales.** Marcar una mensualidad como pagada (o "Regularizar/Corregir historial") crea/borra transacciones con `recurring_plan_id` vía `src/app/compromisos/actions.ts` (`markRecurringPlanPaid`, `unmarkRecurringPlanPaid`, `backfillRecurringPlansHistory`). Usar `original_currency`/`original_amount` (NO `currency`, que no existe en `transactions`). El backfill nunca genera antes del mes del primer ingreso del usuario (piso) y limpia el exceso previo.

## Lógica financiera compartida: `lib/finance/`
Funciones PURAS (sin Zustand ni Supabase) — **fuente única de cálculos** para el store (cliente) y el chatbot (servidor). Garantía estructural de que el chat y el home dicen el mismo número:
- `creditCycle.ts` — `getCreditCycleDates`, `isExpenseInCurrentMonthScope`, `sameMonthYear`
- `prepare.ts` — `resolveRate`, `prepareTransactions` (periodDate + USD→ARS), `prepareRecurringPlans`
- `balances.ts` — `computeGlobalBalance`, `computePaymentMethodStatus`, `computePendingCreditCards`, `hasCardPaymentInCycle`
- `pending.ts` — `computePendingFixedExpenses` · `analysis.ts` — `computeExpensesByCategory`, `computeMonthlyBalance`
- Tipos compartidos (`ProcessedTransaction`, `CreditCardCycleSummary`, `DolarBlue`) en `types.ts`.
**Cambios de lógica financiera van acá**, nunca duplicados en tools/handlers/componentes. Tests directos en `lib/finance/__tests__/`.

## Asistente IA (chat agéntico)
`POST /api/chat` (`src/app/api/chat/route.ts`) corre un **agent loop** (`lib/ai/agent.ts`): Gemini 2.5 Flash vía `@google/genai` elige tools tipadas en pasos sucesivos (máx. 6, techo 50k tokens por mensaje, anti-bucle) hasta responder. El SDK viejo `@google/generative-ai` fue desinstalado — NO reintroducirlo.
- **Tools** (`lib/ai/tools/`): registro en `registry.ts` (22 tools). Cada tool = `{ name, description (es, orientada al modelo), kind, schema Zod, execute(args, ctx) }`; `executeToolWith` valida con Zod antes de ejecutar y nunca lanza. Lecturas: JSON compacto, máx. 20 filas, números SIEMPRE de `lib/finance` (**regla de oro: ningún número lo genera el LLM**). Escrituras: envuelven los handlers de `lib/ai/handlers.ts` (tipos en `lib/ai/handlerTypes.ts`); `mutated: true` en la respuesta hace que el cliente refresque el store.
- **Datos**: `tools/dataLoader.ts` → `loadFinanceData(ctx)` fetchea filas crudas y las procesa con el MISMO pipeline de `lib/finance/prepare.ts` que usa el cliente. Snapshot memoizado por request en `ctx._financeCache` (se invalida tras una escritura exitosa).
- **Prompt**: `lib/ai/agentPrompt.ts` (identidad Chanchito + reglas duras + diccionario de categorías con UUIDs + medios). "¿Qué significa X?" sale del diccionario estático de `tools/appHelp.ts` — mantenerlo fiel a este CLAUDE.md.
- **Confirmaciones de borrado**: dos pasos SIN estado en servidor (serverless-safe): `delete_entity` con `confirmed=false` devuelve las dependencias; el modelo pregunta al usuario y recién en el mensaje siguiente llama con `confirmed=true` (+ `reasignar_a` opcional).
- **Costos**: `usageGuard` (cuota diaria por usuario + presupuesto global con corte duro) acumula los tokens de TODO el loop; `maxDuration = 60` en la route.
- **Identidad: TODO es UUID.** `users.id` = UID de auth (`dbUser.id` == `ctx.authUserId` == `getAuthUserId()`: mismo valor por distintas vías). Los types ya fueron regenerados desde el schema real (`c182662`, 2026-07-08), así que `types/database.ts` es confiable; ante una duda puntual, igual conviene verificar contra la DB. `users.auth_user_id` existe y desde 2026-07-08 está backfilleada (= `id`), pero es **vestigial**: filtrar por `users.id`, no por ella.
- **Cuotas del chat: la política vive en la DB, no en el código.** `check_and_increment_chat_usage()` y `accumulate_chat_budget(tokens)` son `SECURITY DEFINER` expuestas al rol `authenticated` (o sea: invocables desde el browser con la anon key). Por eso **no reciben usuario, tier, límite, presupuesto ni precios como parámetros** — los resuelven de `auth.uid()`, `users.chat_tier` y la tabla `chat_config`. Para cambiar límites/precios se hace `UPDATE chat_config`, ya no se tocan env vars (`CHAT_DAILY_LIMIT_*`, `CHAT_MONTHLY_BUDGET_USD`, `GEMINI_*_PRICE_PER_1M` quedaron sin uso). NO volver a pasar parámetros de política desde `usageGuard.ts`: hay tests que lo impiden.
- El chat de onboarding (`/api/chat/onboarding`, `lib/ai/onboarding*`) es un flujo aparte: no usa el agente.
- Diseño y decisiones: spec en `docs/superpowers/specs/2026-07-07-chatbot-asistente-ia-design.md` (incluye roadmap: UI híbrida, proactividad, contexto macro).

## Medios de pago
- **Predeterminado** (`payment_methods.is_default`): un solo default por usuario (las actions de `src/app/medios-pago/actions.ts` resetean el resto al marcar uno). Se configura con el toggle "Predeterminado" en crear/editar medio (oculto para `is_personal`).
- **Chatbot**: si el usuario no aclara el medio, `resolvePaymentMethod(..., exactMatch=true)` usa el `is_default`. Aplica en `handleTransaction`/`handleInstallment`/`handleSubscription` (`src/lib/ai/handlers.ts`), hoy envueltos como tools del agente (ver «Asistente IA»).
- **Editar el medio** de una transacción: `payment_method_id` está en `transactionSchema` y en `updateTransaction`; el diálogo de edición usa `PaymentMethodField`. Al cambiar a crédito se recalcula la fecha SOLO si el medio cambió.
- **Arreglo masivo**: `assignDefaultToUnassignedTransactions()` (`src/app/dashboard/transactions/actions.ts`) asigna el default a las transacciones sin medio (banner en `/ajustes/medios`).

**Pago de tarjeta = salida real del medio que la financia.** Pagar un resumen crea una transacción `expense` en el medio financiador (ej. Mercado Pago) marcada con `transactions.card_payment_for = <id tarjeta>` (`payCreditCardCycle`/`undoCreditCardPayment` en `src/app/compromisos/actions.ts`). Esa transacción:
- **baja el saldo del medio financiador** (`getPaymentMethodStatus` débito la cuenta),
- es **neutra para el Disponible Real global y las analíticas de consumo**: `isExpenseInCurrentMonthScope` y los totales de `getGlobalBalance`/`getGlobalEffectiveExpenses`/`getExpensesByCategory` excluyen `card_payment_for` (las compras ya están itemizadas → no doble-contar),
- usa una categoría get-or-create "Pagos de tarjeta" (`category_id` es NOT NULL).
UI: selector de medio en el chip de Compromisos (`credit-card-cycle-card.tsx`) + diálogo "Registrar pago" para meses anteriores (`register-card-payment-dialog.tsx`). El viejo `markCreditCardCyclePaid`/`paidCycles` (localStorage) fue **eliminado** del store.

## Fechas y ciclos de tarjeta
- `periodDate` → fecha visual para agrupación mensual (puede diferir de la real)
- `realPaymentDate` → fecha real de transacción
- `isExpenseInCurrentMonthScope()` → determina pertenencia al mes según ciclo cierre/pago
- **Siempre** usar `parseLocalDate()` de `lib/utils/dates.ts` (evita bugs UTC)

## UI
- **Temas**: crema de día / papel de estraza de noche. El usuario elige en `/ajustes` (ThemeToggle + `theme-script` anti-flash, clase en `<html>`). ⚠️ Las utilities `dark:` de Tailwind NO funcionan acá (resuelven por `prefers-color-scheme`, el tema es por clase): usar tokens, que ya cambian con el tema.
- **Fondo de app**: `bg-bg`. Cards: `bg-surface`.
- **Tokens semánticos SIEMPRE**: nunca hardcodees hex ni colores Tailwind para UI.
  - Layout: `bg-bg`, `bg-bg-2`, `bg-surface`, `bg-surface-2`, `text-text`, `text-muted`, `text-faint`, `border-border`
  - Acento: `bg-accent text-accent-ink border-accent-deep shadow-offset`
  - Financiero: `text-good` (ingreso/positivo), `text-bad` (gasto/negativo), `text-warn` (atención)
  - Marca: `--bandera` (celeste de la cinta, fijo — no cambia con el tema), `--shadow-bandera` (la firma: doble sombra tiza+celeste; UNA cifra por pantalla, con padding a la derecha/abajo para que `truncate`/`overflow` no la recorte), `--logo-slot` (ranuras del chancho), paleta `--estraza-*` (noche).
- **NO usar**: `emerald-*`, `rose-*`, `indigo-*`, `violet-*`, `slate-*` ni `dark:` para UI nueva.
- **Bordes**: siempre `border-[1.5px] border-border`. Nunca `border` (1px default).
- **Tipografía** (por rol — identidad 2026-08-13):
  - `font-display` (Fugaz One): cifras, títulos de pantalla y de sección. Un solo peso — nunca sumarle `font-bold`. Cifras con `--leading-display`.
  - `font-sans` (Asap): TODA la UI de texto (labels, descripciones, botones)
  - `font-serif` (Bitter): sello, cintas y usos editoriales de marca
  - `tnum`: TODOS los números financieros (alineación en columna)
- **Marca**: el chancho es `<Chancho>` de `@/components/brand/chancho` — NUNCA `<img>` (se recolorea por tema; pasarle `slot` con el color del fondo cuando se apoya sobre superficie de color). Assets en `public/brand/*.svg`. Emoji: los del usuario en sus categorías se respetan como dato; la UI de marca no agrega emoji propios.
- **Botones**: `<Button>` de `@/components/ui/button` → pill + `border-[1.5px] shadow-offset active:translate-y-[2px]`. Variants: `accent`, `navy`, `soft`, `ghost`.
- **Cards**: `<Card>` de `@/components/ui/card` → `rounded-2xl bg-surface border-[1.5px] border-border shadow-card`.
- **Tabs**: `<TabsDS>` de `@/components/ui/tabs-ds`. **Toggles**: `<ToggleDS>`. **Chips**: `<Chip>`. **Banners**: `<BannerDS>`. **Progress bars**: `<ProgressBar>` con `tone="accent|good|warn|bad"`.
- **Íconos**: `lucide-react` directo (importar específicos) O `<Icon name="..." />` de `@/components/ui/icon`.
- **ScreenHeader**: `<ScreenHeader title="..." right={...} />` de `@/components/shared/screen-header`; variante `compact` (título 22px, sin kicker) para las pantallas alineadas a los mocks de layouts.
- **Nav**: bottom nav mobile de **5 destinos** (Inicio, Movimientos, Compromisos, Objetivos, Más); "Más" abre un ActionSheet con Inversiones, Medios de pago y Ajustes (`nav-config.ts`). Desktop sidebar: 6 ítems directos.
- **Mobile-first**: canvas base 390px (el de los mocks). Margen lateral `px-5`. Touch targets ≥44px. `pb-28` para clearear BottomNav.

## Diseño de referencia
Los mocks finales (identidad 2026-08-13, snapshot 2026-08-14) viven en `../claude-design/` — carpeta hermana del repo, fuera de git: `{Pantalla}-render.html` + variantes `{Pantalla}Noche-render.html`. Abrirlos en el navegador a 390px. El spec de layouts: `docs/superpowers/specs/2026-08-18-layouts-pantallas-design.md`.
⚠️ `design_handoff_chanchito/` es el handoff viejo (pre-identidad, tipografías Alfa Slab/DM Sans): NO usarlo como referencia visual. Igual que el proyecto "Design System" de claude.ai, que quedó en la fase descartada.

## TypeScript
- Tipos de `types/database.ts`. Nunca `any`.
- Imports absolutos: `@/components/...`, `@/lib/...`
- Schemas Zod en `lib/schemas/` + React Hook Form + `@hookform/resolvers`.

## Deploy
- `master` → producción automática en Vercel.
- ⚠️ **NO existe base DEV: hay una sola instancia Supabase** (proyecto `LHStudio`, ref `mkkgdjxaotgimqwhyesx`) y `.env.local` apunta a ella. Desarrollar en local es operar sobre los datos reales de producción — cuidado con borrados, backfills y migraciones destructivas.
- Cambios de schema SQL: aplicar **antes** del merge (van a producción en el acto, por lo de arriba). Si el cambio rompe la firma de algo que el deploy vigente ya usa, hacerlo compatible hacia atrás (ej. wrappers) para no abrir una ventana de fallas hasta el próximo deploy.

## Migraciones (leer antes de escribir SQL)

El proyecto está **linkeado al CLI de Supabase** desde el 2026-07-28 (`supabase/config.toml`). Antes no lo estaba: las migraciones se aplicaban a mano desde el SQL Editor y nada garantizaba que un archivo del repo estuviera realmente aplicado. Eso produjo el caso de la RLS —"PENDIENTE de aplicar" durante 18 días cuando ya estaba aplicada— y dejó 7 de 12 migraciones sin registrar. Saneado y verificado: repo y `supabase_migrations.schema_migrations` coinciden 1:1 (15 versiones al 2026-08-03).

**Flujo obligatorio:**

```bash
set -a; . ./.env.local; set +a   # carga las credenciales del CLI (ver abajo)

supabase migration new <nombre>   # crea el archivo con timestamp de 14 dígitos
# escribir el SQL
supabase db push --linked         # aplica Y registra, en un solo paso
supabase migration list --linked  # Local y Remote deben coincidir
```

### Credenciales del CLI

⚠️ **El CLI necesita DOS env vars de `.env.local`** (gitignoreado). No alcanza con `supabase login`:

| var | para qué | de dónde sale |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | autenticar contra la API de la plataforma | PAT de https://supabase.com/dashboard/account/tokens, generado **desde la cuenta dueña del proyecto** (org `qqhxxhfibtbwdlevrmxy`) |
| `SUPABASE_DB_PASSWORD` | conectar a Postgres | Project Settings → Database. Si no lo tenés, se resetea sin romper producción: la app habla por PostgREST con anon/service key, no por conexión directa |

**Por qué un PAT y no `supabase login`**: el CLI guarda **un solo access token global**, y Chanchito vive en una cuenta Supabase distinta de la de Brava (org `lmvuwrhwzsuthjsmzoci`). Loguearte para un proyecto pisa el del otro — fue exactamente lo que pasó entre el 28-jul y el 03-ago. `SUPABASE_ACCESS_TOKEN` tiene prioridad sobre el token global, así que el PAT por repo resuelve el choque de raíz.

**Síntomas y diagnóstico** (los dos errores se confunden fácil):

- `unexpected login role status 403 — your account does not have the necessary privileges` → **falta el PAT o es de la cuenta equivocada**. NO tiene nada que ver con `SUPABASE_DB_PASSWORD` (este archivo lo afirmó por error entre el 28-jul y el 03-ago). Chequeo: `supabase projects list` debe mostrar `mkkgdjxaotgimqwhyesx` con `"linked": true`; si el proyecto no aparece en la lista, el token es de otra cuenta.
- `PgClient: Failed to connect`, sin más detalle → **password incorrecto**. El CLI se come el error real de Postgres; para verlo hay que conectar con `pg` y mirar el código (`28P01` = password mal). Tras un reset el pooler tarda un momento en propagar: si el puerto 5432 rechaza pero el 6543 acepta, esperá y reintentá.

**Red**: `db.<ref>.supabase.co` es **IPv6-only** y esta máquina no tiene IPv6. No es un problema para el CLI, que resuelve el pooler IPv4 por la API (por eso el PAT es condición previa). Si conectás a mano (psql, `pg`, un cliente gráfico), apuntá al pooler: `aws-1-sa-east-1.pooler.supabase.com:5432`, user `postgres.mkkgdjxaotgimqwhyesx`.

Reglas:
- **Nunca** aplicar SQL a mano sin que quede el renglón en `schema_migrations`. Si por algún motivo hay que hacerlo, registrar la versión a mano en la misma sesión — no "después".
- **Fallback si el CLI no está disponible**: aplicar por la API de Supabase (`apply_migration`), que ejecuta el DDL **y** registra la versión. Ojo: la API asigna su **propio timestamp**, distinto del que puso `migration new` → hay que renombrar el archivo local a la versión que quedó registrada, o queda drift. Es lo que pasó con `20260728150241_close_market_prices_rls.sql`. Con el CLI andando este camino ya no hace falta.
- Los archivos van con timestamp de **14 dígitos** (`YYYYMMDDHHMMSS_nombre.sql`). Con 8 el CLI los ignora.
- El estado de la DB se verifica **contra la DB** (`pg_policies`, `pg_proc`, `information_schema`), nunca contra lo que diga un comentario del commit o el Status.
- `20260502154154_create_shipping_zones.sql` es un **no-op** a propósito: esa versión es de NatArt, que compartió esta instancia antes de migrar a PocketBase. Ver el encabezado del archivo.

## Panchito Kit
- nivel: lite
- status: 40-PROYECTOS/Chanchito/Chanchito - Status & Roadmap.md
- fuente_producto: vault
- verificacion: npm run lint && npx tsc --noEmit
- branch_base: master
