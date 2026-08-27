# Chanchito – PWA de finanzas personales
Next.js App Router · Supabase (PostgreSQL + Auth) · Zustand · TypeScript

## Documentación por feature: `docs/features/`
Un doc por gran feature (arquitectura, archivos clave, tablas DB, invariantes y gotchas) pensado como contexto para iteraciones agénticas — **leer el de la feature que vayas a tocar**: `home-dashboard`, `movimientos`, `compromisos`, `objetivos`, `inversiones`, `medios-de-pago`, `categorias`, `asistente-ia`, `onboarding-auth`, `ajustes-perfil`, `transferencias-internas`, `pwa-plataforma`, `bolsillo`, `landing`. Los planes/specs históricos por fecha viven en `docs/superpowers/`.

## Comandos
```bash
npm run dev      # Desarrollo (Turbopack)
npm run build    # Producción (Webpack)
npm run lint     # ESLint
npm test         # Vitest (run) · npm run test:watch para watch
npm run seed:demo     # (Re)crea el usuario demo Emi en la base DEV (guard: producción prohibida por ref hardcodeado) — ver docs/features/usuario-demo.md
npm run capture:demo  # Capturas de la landing desde el demo (requiere build + next start -p 3100)
node scripts/generate-og.mjs  # Regenera la imagen OG de la landing
```
Tests en `src/**/__tests__/`. Los del store (`lib/store/__tests__/analysis-getters.test.ts`, `recurring-backfill-preview.test.ts`) siembran estado con `useFinanceStore.setState` y `vi.useFakeTimers`. La suite está **entera en verde**.

## Reglas Server / Client
- `app/` → Server Components por defecto.
- `'use client'` solo si se necesitan hooks o event listeners.
- Server Components: fetch con `utils/supabase/server.ts`.
- Client Components: NUNCA fetch directo → solo `useFinanceStore`.
- Prohibido: `useEffect` para fetching, SWR, React Query.
- **Tablas globales de mercado** (`market_prices`, `exchange_rates`, sin `user_id`): las **escrituras** van con `createAdminClient()` (`utils/supabase/admin.ts`, service_role, server-only), NUNCA con el cliente de sesión. Y como `market_prices` es global **por ticker**, lo que se escribe ahí lo ven todos: `data_source_url` (la URL por activo que elige el usuario) **sólo se fetchea si es la página de cotización de IOL del propio ticker** (`lib/investments/prices/fuente-permitida.ts`, validado en el schema Zod, en el dispatcher y en `fetchFromUrl`) — sin eso un usuario envenenaba el precio de cualquier ticker para los demás o usaba el server como proxy (auditoría 2026-08-26, H1). Si no, hay que dejar INSERT/UPDATE abiertos a `authenticated` y cualquier usuario logueado puede escribir con la anon key los precios que ven todos. Las lecturas siguen con el cliente de sesión. Requiere `SUPABASE_SERVICE_ROLE_KEY` en el entorno. **Segundo y último uso del admin client**: `auth.admin.deleteUser` al final de `deleteMyAccount` (`app/perfil/actions.ts`) — la purga de los datos NO va por ahí, la hace `delete_my_account()` (SECURITY DEFINER sobre `auth.uid()`, una transacción, 15 tablas + `users`) con el cliente de sesión.
- **Páginas públicas de contenido** (`/privacidad`): la lista es `RUTAS_PUBLICAS` en `lib/rutas-publicas.ts` y la consultan el middleware (sin sesión no manda al login; con sesión no aplica los gates de onboarding) y el `AppShell` (sin nav/chat/tour). Agregar una página pública = agregarla ahí, en ningún otro lado; un test estructural lo exige. `/` no está en esa lista: tiene su propio split por sesión.

## Store: `lib/store/financeStore.ts`
Única fuente de verdad cliente. **Leer antes de modificar componentes.**

> **Cómo se consume desde un componente (regla dura):** tomar el objeto entero y llamar los
> getters sobre él — `const store = useFinanceStore(); const x = store.getX()` —, NUNCA
> desestructurarlos ni sacarlos con selector (`useFinanceStore(s => s.getX)`). El proyecto
> compila con `reactCompiler: true` y los getters de Zustand son referencias **estables** que
> leen el estado por `get()`: si lo único de lo que depende el cálculo es la función, el
> compiler memoiza el resultado y lo **congela** hasta que el componente se desmonta — ni un
> refetch ni un cambio de moneda lo actualizan. El objeto del store, en cambio, cambia de
> referencia con cada `set`. Los campos de estado (`transactions`, `categories`…) sí se pueden
> desestructurar. Lo vigila `src/lib/store/__tests__/store-freshness.test.ts`, que compila cada
> componente con el mismo plugin que usa Next y falla si aparece un valor congelado.
Nada de lógica de negocio en componentes. Los getters de cálculo del store son **wrappers finos sobre las funciones puras de `lib/finance/`** (ver sección propia): cambios de lógica financiera van ahí, no en el cuerpo del getter.

Getters disponibles:
- `getPortfolioStatus()` – portafolio de inversiones
- `getMonthlyBurnRate()` – planes recurrentes activos
- `getInstallmentStatus(planId)` – progreso de cuotas
- `getPaymentMethodStatus(methodId)` – **Crédito**: "a pagar en el vencimiento" del ciclo. Un movimiento pertenece al ciclo si el mes/año de `t.date` (que en crédito ya es la fecha de vencimiento calculada por `calculateCreditPaymentDate`) coincide con `nextPaymentDate`; incluye cuotas + compras + mensualidades adheridas (deduplicadas). Devuelve `arsExpenses`/`usdExpenses` por separado (NO se convierte USD→ARS en el desglose). El ciclo vigente (`getCreditCycleDates`) **avanza al siguiente resumen recién cuando el vencimiento ya pasó** (comparación por día): el día exacto del vencimiento ese resumen sigue siendo el vigente (todavía lo debés). **Débito/efectivo**: saldo histórico `ingresos − gastos` (los pagos de tarjeta, ver abajo, lo reducen).
- `getExpensesByCategory(scope)` – desglose por categoría
- `getMonthlyBalance(monthStr, methodId)` – balance mensual
- `getAvailableToSpend()` – **el número central**: el disponible del bolsillo. `available = Σ saldo(cuentas con bucket 'pocket') − compromisos del período`. Expone `pocketTotal`, `reserveTotal`, `committed`, `committedNextPeriod`, `commitmentItems` y `accounts` (saldo y `anchored` por cuenta). Wrapper fino de `computeAvailableToSpend` (`lib/finance/pocket.ts`). El ritmo sale de `users.income_rhythm`. Invariantes: pagar una tarjeta o una mensualidad NO mueve `available` (tests E8/E9 en `lib/finance/__tests__/escenarios-disponible.test.ts`).
- `getGlobalBalance()` – **el cálculo viejo** (flujo acumulado desde el primer movimiento). NO es el disponible: se usa solo en `/puesta-a-punto` para explicar el cambio de número.
- `getDaysSinceLastRegistration()` – días desde el último registro (por `created_at`, no por `date`). Dispara el recordatorio de conciliación a los 2 días.
- `getPendingFixedExpenses()` – mensualidades activas sin transacción vinculada este mes (`{ total, items }`).
- `getRecurringBackfillPreview()` – meses de mensualidades sin registrar (`missingMonths`) y exceso a borrar (`excessMonths`), con piso en el mes del **primer ingreso** del usuario (una cuota/gasto anterior al primer sueldo NO fija el piso — evita meses fantasma).
- `getDefaultPaymentMethod()` – medio de pago marcado `is_default`.
- `formatDisplay(ars)` – monto en ARS → **texto** en la moneda de visualización del análisis
  (`displayCurrency`, el toggle ARS/USD del home): convierte y formatea junto, con `u$s` cuando
  corresponde. Usarlo en lugar de `formatCurrency(toDisplay(x))`, que mostraba dólares con el
  signo del peso. `getDisplaySymbol()` devuelve el símbolo suelto para ejes y tooltips
  (`formatCompact(v, símbolo)`). `CurrencyExposureCard` es la excepción consciente: sus montos
  son "en pesos" vs "dolarizado" por definición y no siguen el toggle.
- `getUnassignedTransactionsCount()` – transacciones con `payment_method_id == null`.
- `isCreditCardCyclePaid(methodId)` – true si existe un pago (`card_payment_for`) en el mes del vencimiento del ciclo vigente. (El viejo flag `paidCycles`/localStorage fue eliminado del store.)

`fetchAllData()` → Promise.all desde Supabase + API dólar blue (non-blocking).

**Las mensualidades de crédito se postean solas.** Una mensualidad facturada en tarjeta no se paga: se debita cuando cierra el resumen. `syncAutomaticRecurringCharges()` (`src/app/compromisos/actions.ts`, disparada desde `fetchAllData()` **una vez por carga**) crea la transacción fechada al vencimiento del resumen, con la misma `calculateCreditPaymentDate` de cuotas y compras. Lógica pura en `lib/finance/recurring.ts`; el día de cobro sale de `recurring_plans.billing_day` (1-31, `?? 1`). Sólo aplica a planes **mensuales** sobre tarjetas con ciclo cargado — el resto sigue con el toggle manual de abajo. Borrar una generada NO alcanza para que no vuelva: hay que desactivar el plan.

**Mensualidades = transacciones reales.** Marcar una mensualidad como pagada (o "Regularizar/Corregir historial") crea/borra transacciones con `recurring_plan_id` vía `src/app/compromisos/actions.ts` (`markRecurringPlanPaid`, `unmarkRecurringPlanPaid`, `backfillRecurringPlansHistory`). Usar `original_currency`/`original_amount` (NO `currency`, que no existe en `transactions`). El backfill nunca genera antes del mes del primer ingreso del usuario (piso) y limpia el exceso previo.

## Lógica financiera compartida: `lib/finance/`
Funciones PURAS (sin Zustand ni Supabase) — **fuente única de cálculos** para el store (cliente) y el chatbot (servidor). Garantía estructural de que el chat y el home dicen el mismo número:
- `creditCycle.ts` — `getCreditCycleDates`, `isExpenseInCurrentMonthScope`, `sameMonthYear`
- `prepare.ts` — `resolveRate`, `prepareTransactions` (periodDate + USD→ARS), `prepareRecurringPlans`
- `balances.ts` — `computeGlobalBalance`, `computePaymentMethodStatus`, `computePendingCreditCards`, `hasCardPaymentInCycle`
- `pending.ts` — `computePendingFixedExpenses` · `analysis.ts` — `computeExpensesByCategory`, `computeMonthlyBalance`
- Tipos compartidos (`ProcessedTransaction`, `CreditCardCycleSummary`, `DolarBlue`) en `types.ts`.
**Cambios de lógica financiera van acá**, nunca duplicados en tools/handlers/componentes. Tests directos en `lib/finance/__tests__/`.

## Modelo de bolsillo (`lib/finance/pocket.ts`)

El disponible sale **solo del bolsillo**: `payment_methods.bucket` decide si una cuenta cuenta (`'pocket'`) o no (`'reserve'`). Es ortogonal a `type`: una reserva puede ser una caja de ahorro, un broker o un plazo fijo.

- **Saldo anclado**: `initial_balance` + `initial_balance_at`. Sin fecha, la cuenta está "sin anclar" y suma desde el primer movimiento (el modelo viejo). Con fecha, se computan solo los movimientos entre el ancla y **hoy** — una cuota que vence en febrero todavía no salió de la cuenta.
- **`amount` se guarda SIEMPRE positivo**: el signo lo lleva `type`. Nunca asumir montos con signo.
- **Convertir un saldo declarado en ancla**: `anchorValueForDeclaredBalance()`. Guardar el declarado tal cual restaría dos veces lo ya registrado hoy.
- **Compromisos del período** (`computeCommitments`): las **tarjetas** se descuentan si su resumen vence dentro del período (si no, van a `committedNextPeriod`, que se muestra pero no baja el disponible); los **fijos** (mensualidades) se descuentan si sale del bolsillo, siempre en base al mes calendario (`computePendingFixedExpenses`, sin fecha de vencimiento propia) — no respetan el recorte de un período más corto como `weekly`/`biweekly`, es la lectura conservadora dado que el modelo no sabe cuándo vence cada mensualidad. Los fijos de **crédito NO se descuentan** aparte: ya viajan dentro del resumen de su tarjeta.
- **Ritmo de cobro** (`users.income_rhythm`): se declara el ritmo, no la fecha. `irregular` = sin período: se descuenta todo lo comprometido, que es la lectura conservadora cuando no hay próximo cobro que asumir.
- **Conciliación** (`lib/finance/reconcile.ts` + `src/app/bolsillo/actions.ts`): primero se recupera el dato (recordatorio de anotar a los 2 días), y solo si el usuario afirma que ya anotó todo se ofrece el ajuste. Un ajuste es una transacción con `is_balance_adjustment = true`: queda visible en el historial, **nunca** reescribe el pasado, y se excluye de las analíticas de consumo igual que `card_payment_for`.
- **Limitación conocida**: el pago parcial de tarjeta queda fuera de alcance. `isCreditCardCyclePaid` da el ciclo por saldado con cualquier pago en el mes del vencimiento; quien paga el mínimo queda con deuda viva e intereses y la app le dice que está al día.
- **Limitación conocida**: `payment_methods` no tiene columna de moneda, así que `initial_balance` es un número sin unidad — mientras que `prepareTransactions` convierte los movimientos en USD a ARS antes de tocar el saldo. Una reserva pensada en dólares (ej. "Mis dólares" con `initial_balance: 2800`) mezcla ese ancla en USD con gastos ya convertidos a ARS: un gasto de USD 100 le resta ~$130.000 al saldo de la cuenta, no 100. El disponible no se ve afectado (las reservas no lo alimentan), pero la cifra que se muestra bajo "Guardado en reservas" y en `/ajustes/medios` para esa cuenta queda sin sentido. No hay fix de código previsto: hace falta una columna de moneda por cuenta.
- Spec: `docs/superpowers/specs/2026-08-20-disponible-real-anclado-design.md`.

## Asistente IA (chat agéntico)
`POST /api/chat` (`src/app/api/chat/route.ts`) corre un **agent loop** (`lib/ai/agent.ts`): Gemini 2.5 Flash vía `@google/genai` elige tools tipadas en pasos sucesivos (máx. 6, techo 50k tokens por mensaje, anti-bucle) hasta responder. El SDK viejo `@google/generative-ai` fue desinstalado — NO reintroducirlo.
- **Tools** (`lib/ai/tools/`): registro en `registry.ts` (22 tools). Cada tool = `{ name, description (es, orientada al modelo), kind, schema Zod, execute(args, ctx) }`; `executeToolWith` valida con Zod antes de ejecutar y nunca lanza. Lecturas: JSON compacto, máx. 20 filas, números SIEMPRE de `lib/finance` (**regla de oro: ningún número lo genera el LLM**). Escrituras: envuelven los handlers de `lib/ai/handlers.ts` (tipos en `lib/ai/handlerTypes.ts`); `mutated: true` en la respuesta hace que el cliente refresque el store.
- **Datos**: `tools/dataLoader.ts` → `loadFinanceData(ctx)` fetchea filas crudas y las procesa con el MISMO pipeline de `lib/finance/prepare.ts` que usa el cliente. Snapshot memoizado por request en `ctx._financeCache` (se invalida tras una escritura exitosa).
- **Prompt**: `lib/ai/agentPrompt.ts` (identidad Chanchito + reglas duras + diccionario de categorías con UUIDs + medios). "¿Qué significa X?" sale del diccionario estático de `tools/appHelp.ts` — mantenerlo fiel a este CLAUDE.md.
- **Confirmaciones de borrado**: dos pasos SIN estado en servidor (serverless-safe): `delete_entity` con `confirmed=false` devuelve las dependencias; el modelo pregunta al usuario y recién en el mensaje siguiente llama con `confirmed=true` (+ `reasignar_a` opcional).
- **Costos**: `usageGuard` (cuota diaria por usuario + presupuesto global con corte duro) acumula los tokens de TODO el loop; `maxDuration = 60` en la route.
- **El thinking va con techo, no dinámico** (`THINKING_BUDGET = 512` en `createGeminiModel`). Con el presupuesto dinámico —el default de `gemini-2.5-flash`— la API devuelve cada tanto un candidato **vacío** (`finishReason: STOP`, sin parts, 0 tokens de salida, HTTP 200) y el loop lo tomaba por respuesta final: el chat contestaba «No pude generar una respuesta» a **toda** consulta que necesitara una tool. Medido contra DEV el 2026-08-27 con el prompt real de un usuario con datos: dinámico 9/10 vacíos, 1024 → 1/10, 512 → 0/10, 0 → 0/20. `runAgent` además reintenta hasta `MAX_EMPTY_RETRIES` (2) ante un turno vacío, sumando los tokens de cada intento. No mover el 512 sin volver a medir.
- **Identidad: TODO es UUID.** `users.id` = UID de auth (`dbUser.id` == `ctx.authUserId` == `getAuthUserId()`: mismo valor por distintas vías). Los types ya fueron regenerados desde el schema real (`c182662`, 2026-07-08), así que `types/database.ts` es confiable; ante una duda puntual, igual conviene verificar contra la DB. `users.auth_user_id` existe y desde 2026-07-08 está backfilleada (= `id`), pero es **vestigial**: filtrar por `users.id`, no por ella.
- **Cuotas del chat: la política vive en la DB, no en el código.** `check_and_increment_chat_usage()` es `SECURITY DEFINER` expuesta al rol `authenticated` (invocable desde el browser con la anon key): por eso **no recibe usuario, tier, límite ni presupuesto como parámetros** — los resuelve de `auth.uid()`, `users.chat_tier` y la tabla `chat_config`. `accumulate_chat_budget(tokens)` **sólo es ejecutable por `service_role`** desde la auditoría del 2026-08-26 (H3): la route la llama con `createAdminClient()`, porque expuesta a `authenticated` cualquier usuario podía "gastar" el presupuesto global desde el browser y apagar el chat para todos. `users.chat_tier` lo protege un trigger (`users_proteger_chat_tier`): sólo service_role lo cambia. Para cambiar límites/precios se hace `UPDATE chat_config`, ya no se tocan env vars (`CHAT_DAILY_LIMIT_*`, `CHAT_MONTHLY_BUDGET_USD`, `GEMINI_*_PRICE_PER_1M` quedaron sin uso). NO volver a pasar parámetros de política desde `usageGuard.ts`: hay tests que lo impiden. La route es **fail-closed** (503 si el guard falla) y topea el mensaje a `MAX_MESSAGE_CHARS` (2.000); `src/app/api/chat/__tests__/route.test.ts` lo vigila.
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
- Los **ajustes de saldo** (`is_balance_adjustment`) quedan fuera de las analíticas de consumo, igual que los pagos de tarjeta: `isExpenseInCurrentMonthScope`, `computeExpensesByCategory`, `getGlobalEffectiveExpenses` y `getMonthlyIncome` los excluyen. **Sí** se ven en `/movimientos`: el spec pide que el ajuste sea visible.

## UI
- **Temas**: crema de día / papel de estraza de noche. El usuario elige en `/ajustes` (ThemeToggle + `theme-script` anti-flash, clase en `<html>`). Las utilities `dark:` de Tailwind SÍ funcionan acá (`@custom-variant dark` en `globals.css` las resuelve por clase, no por `prefers-color-scheme` — commit `59818ed`), pero los tokens siguen siendo la opción por defecto porque ya cambian solos con el tema. Reservá `dark:` para lo que un token no puede expresar, como swapear un asset entero (el ribbon día/noche de `/login` usa `dark:hidden`/`dark:block`).
- **Fondo de app**: `bg-bg`. Cards: `bg-surface`.
- **Tokens semánticos SIEMPRE**: nunca hardcodees hex ni colores Tailwind para UI.
  - Layout: `bg-bg`, `bg-bg-2`, `bg-surface`, `bg-surface-2`, `text-text`, `text-muted`, `text-faint`, `border-border`
  - Acento: `bg-accent text-accent-ink border-accent-deep`
  - Financiero: `text-good` (ingreso/positivo), `text-bad` (gasto/negativo), `text-warn` (atención)
  - Marca: `--bandera` (celeste de la cinta, fijo — no cambia con el tema), `--shadow-bandera` (la firma: doble sombra tiza+celeste; UNA cifra por pantalla, con padding a la derecha/abajo para que `truncate`/`overflow` no la recorte), `--logo-slot` (ranuras del chancho), paleta `--estraza-*` (noche).
- **NO usar**: `emerald-*`, `rose-*`, `indigo-*`, `violet-*`, `slate-*`. `dark:` solo para swaps de asset (ver Temas arriba) — nunca para colorear UI nueva, eso lo resuelven los tokens.
- **Bordes**: siempre `border-[1.5px] border-border`. Nunca `border` (1px default).
- **Tipografía** (por rol — identidad 2026-08-13):
  - `font-display` (Fugaz One): cifras, títulos de pantalla y de sección. Un solo peso — nunca sumarle `font-bold`. Cifras con `--leading-display`.
  - `font-sans` (Asap): TODA la UI de texto (labels, descripciones, botones)
  - `font-serif` (Bitter): sello, cintas y usos editoriales de marca
  - `tnum`: TODOS los números financieros (alineación en columna)
- **Marca**: el chancho es `<Chancho>` de `@/components/brand/chancho` — NUNCA `<img>` (se recolorea por tema; pasarle `slot` con el color del fondo cuando se apoya sobre superficie de color). Assets en `public/brand/*.svg`. Emoji: los del usuario en sus categorías se respetan como dato; la UI de marca no agrega emoji propios.
- **Botones**: `<Button>` de `@/components/ui/button` → pill + `border-[1.5px] active:translate-y-[2px]`. Variants: `accent`, `navy`, `soft`, `ghost`. ⚠️ **Los botones NO llevan sombra** (2026-08-20): el token `--shadow-offset` fue eliminado del sistema — el peso visual lo da el borde de 1.5px, no una sombra dura. El `active:translate-y` se conserva como feedback táctil. Las sombras que siguen vivas son `shadow-card` (línea de apoyo), `shadow-fab` (única elevación real, el botón flotante) y `--shadow-bandera` (firma de la cifra).
- **Cards**: `<Card>` de `@/components/ui/card` → `rounded-2xl bg-surface border-[1.5px] border-border shadow-card`.
- **Tabs**: `<TabsDS>` de `@/components/ui/tabs-ds`. **Toggles**: `<ToggleDS>`. **Chips**: `<Chip>`. **Banners**: `<BannerDS>`. **Progress bars**: `<ProgressBar>` con `tone="accent|good|warn|bad"`.
- **Íconos**: `lucide-react` directo (importar específicos) O `<Icon name="..." />` de `@/components/ui/icon`.
- **ScreenHeader**: `<ScreenHeader title="..." right={...} />` de `@/components/shared/screen-header`; variante `compact` (título 22px, sin kicker) para las pantallas alineadas a los mocks de layouts. Sin `kicker` ni `sub` el header alinea al centro solo (el `icon` de marca queda a la altura del título).
- **Filas con acciones**: `<SwipeableRow>` de `@/components/shared/swipeable-row` — arrastrar a la derecha edita, a la izquierda elimina (fondos de color, haptics y guard del click sintético incluidos). Se activa con `enabled={isMobile}` (`useIsMobile` de `@/lib/hooks/useIsMobile`). **El gesto es un atajo, nunca la única vía**: en mobile la fila entera abre un `<ActionSheet>` al tocarla y en desktop se usa el menú kebab. Lo usan `TransactionItem` (/movimientos) y las cards de cuotas y mensualidades (/compromisos).
- **Nav**: bottom nav mobile de **5 destinos** (Inicio, Movimientos, Compromisos, Objetivos, Más); "Más" abre un ActionSheet con Inversiones, Medios de pago y Ajustes (`nav-config.ts`). Desktop sidebar: 6 ítems directos.
- **Legales**: `/privacidad` (`components/legal/politica-privacidad.tsx`) es la política de privacidad + condiciones de uso, escrita en rioplatense y **verificada contra lo que la app hace** (terceros: Supabase, Vercel, Google/Gemini — **plan pago de la API**, confirmado el 26-ago: sin entrenamiento con lo que escribe el usuario, y la política lo promete —, fuentes de cotizaciones, RackNerd — el VPS de las copias; sin analytics; borrado desde Ajustes; backup diario con retención de 14 días). Si entra un proveedor nuevo o cambia una promesa, se cambia el texto y la fecha — el test exige que cada tercero siga nombrado. Contacto: `MAIL_CONTACTO` de `lib/contacto.ts`.
- **Mobile-first**: canvas base 390px (el de los mocks). Margen lateral `px-5`. Touch targets ≥44px. `pb-28` para clearear BottomNav.

## Diseño de referencia
Los mocks finales (identidad 2026-08-13, snapshot 2026-08-14) viven en `../claude-design/` — carpeta hermana del repo, fuera de git: `{Pantalla}-render.html` + variantes `{Pantalla}Noche-render.html`. Abrirlos en el navegador a 390px. El spec de layouts: `docs/superpowers/specs/2026-08-18-layouts-pantallas-design.md`.
⚠️ `design_handoff_chanchito/` es el handoff viejo (pre-identidad, tipografías Alfa Slab/DM Sans): NO usarlo como referencia visual. Igual que el proyecto "Design System" de claude.ai, que quedó en la fase descartada.

## TypeScript
- Tipos de `types/database.ts`. Nunca `any`.
- Imports absolutos: `@/components/...`, `@/lib/...`
- Schemas Zod en `lib/schemas/` + React Hook Form + `@hookform/resolvers`.

## Deploy
- ⚠️ **El repo `papuzinH/finanzas-lh` es PÚBLICO en GitHub** (verificado 2026-08-26). Nada sensible entra a git: `.env*` está ignorado, `SECURITY_AUDIT.md` (auditoría con hallazgos abiertos) también. Refs de Supabase, hosts del pooler y rutas del VPS que aparecen en docs son visibles para cualquiera — el password de la base es lo único que separa eso de los datos.
- `master` → producción automática en Vercel.
- **Dos bases desde 2026-08-26.** PRODUCCIÓN = `LHStudio` (ref `mkkgdjxaotgimqwhyesx`, cuenta A); DEV = `Chanchito DEV` (ref `hgxuxoqyrooaariimqmg`, **cuenta B**, org STUDIO — el cupo Free de la cuenta A estaba lleno). `.env.local` apunta a **DEV**: desarrollar en local ya no toca datos reales. Todo lo de producción vive con sufijo `_PROD` en `.env.local` y se usa **a propósito** (migraciones a prod, scripts admin). En DEV el login es email/password (Google no está configurado ahí); en prod, **solo Google** — el provider email se apagó el 26-ago. Ojo: Free pausa DEV tras ~1 semana sin uso; se despierta desde el dashboard (cuenta B).
- **Backup diario de la base** (desde 2026-08-26): `pg_dump` corre por cron en el VPS a las 04:00 AR, retiene los últimos 14 dumps verificados. Script versionado en `infra/vps/chanchito-backup.sh` (deploy por scp), restore y detalles en `infra/vps/README.md`. El vigía de Panchito avisa si el último dump pasa las 26 h. ⚠️ Rotar `SUPABASE_DB_PASSWORD` toca tres consumidores: `.env.local`, la credencial de n8n **y** `/opt/chanchito-backup/.env` del VPS.
- Cambios de schema SQL: aplicar **antes** del merge (van a producción en el acto, por lo de arriba). Si el cambio rompe la firma de algo que el deploy vigente ya usa, hacerlo compatible hacia atrás (ej. wrappers) para no abrir una ventana de fallas hasta el próximo deploy.

## Migraciones (leer antes de escribir SQL)

El proyecto está **linkeado al CLI de Supabase** desde el 2026-07-28 (`supabase/config.toml`). Antes no lo estaba: las migraciones se aplicaban a mano desde el SQL Editor y nada garantizaba que un archivo del repo estuviera realmente aplicado. Eso produjo el caso de la RLS —"PENDIENTE de aplicar" durante 18 días cuando ya estaba aplicada— y dejó 7 de 12 migraciones sin registrar. Saneado y verificado: repo y `supabase_migrations.schema_migrations` coinciden 1:1 (19 versiones al 2026-08-26, en las dos bases).

**Desde 2026-08-26 el link apunta a DEV** (`hgxuxoqyrooaariimqmg`): `db push --linked` pega en DEV y **producción es un paso explícito** por `--db-url`. Equivocarse por default deja de tocar datos reales. DEV nació restaurando el backup de prod del 26-ago (schema + registro de migraciones), así que las dos bases tienen el mismo historial.

**Flujo obligatorio:**

```bash
set -a; . ./.env.local; set +a   # carga las credenciales del CLI (ver abajo)

supabase migration new <nombre>   # crea el archivo con timestamp de 14 dígitos
# escribir el SQL
supabase db push --linked         # aplica Y registra en DEV
supabase migration list --linked  # DEV: Local y Remote deben coincidir
# verificar la app contra DEV; y ANTES del merge, producción, a propósito:
supabase db push --db-url "postgresql://postgres.mkkgdjxaotgimqwhyesx:${SUPABASE_DB_PASSWORD_PROD}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
```

`--db-url` conecta directo a Postgres: no necesita PAT. `--dry-run` sirve para ver qué aplicaría sin tocar nada. Checklist completo en el skill `migrar-schema`.

### Credenciales del CLI

⚠️ **El CLI necesita env vars de `.env.local`** (gitignoreado). No alcanza con `supabase login`. Las dos bases viven en **cuentas Supabase distintas** (el cupo Free de la cuenta A estaba lleno con LHStudio + FernetApp):

| var | base | para qué | de dónde sale |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | DEV (default) | API de la plataforma para el proyecto linkeado | PAT de la **cuenta B** (org STUDIO `lmvuwrhwzsuthjsmzoci`, dueña de Chanchito DEV) |
| `SUPABASE_DB_PASSWORD` | DEV (default) | Postgres de DEV | generado el 26-ago al crear el proyecto |
| `SUPABASE_ACCESS_TOKEN_PROD` | PROD | API de la plataforma para prod (`migration list`, api-keys…) | PAT de la **cuenta A** (org `qqhxxhfibtbwdlevrmxy`) |
| `SUPABASE_DB_PASSWORD_PROD` | PROD | el `db push --db-url` a producción | Project Settings → Database de LHStudio. Se resetea sin romper producción (la app habla por PostgREST), pero **toca tres consumidores**: este archivo, n8n y el backup del VPS |

Para operar prod por la API de la plataforma con el CLI (p. ej. `supabase projects api-keys --project-ref mkkgdjxaotgimqwhyesx`): `SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN_PROD supabase …`. Para `migration list`/`db push` contra prod alcanza `--db-url` (sin PAT). Las keys de la app de prod (`NEXT_PUBLIC_*_PROD`, `SUPABASE_SERVICE_ROLE_KEY_PROD`) también están ahí, con sufijo.

**Por qué un PAT y no `supabase login`**: el CLI guarda **un solo access token global**, y un `supabase login` pisa el anterior — pasó entre el 28-jul y el 03-ago, y el 26-ago el token global apareció cambiado de cuenta otra vez. `SUPABASE_ACCESS_TOKEN` tiene prioridad sobre el token global, así que el PAT por repo resuelve el choque de raíz y ya no importa con qué cuenta esté logueado el CLI.

**Síntomas y diagnóstico** (los dos errores se confunden fácil):

- `unexpected login role status 403 — your account does not have the necessary privileges` → **falta el PAT o es de la cuenta equivocada**. NO tiene nada que ver con `SUPABASE_DB_PASSWORD` (este archivo lo afirmó por error entre el 28-jul y el 03-ago). Chequeo: `supabase projects list` debe mostrar `hgxuxoqyrooaariimqmg` (Chanchito DEV) con `"linked": true`; si en la lista aparecen LHStudio/FCG en vez de Brava/Chanchito DEV, el token es de la cuenta A.
- `FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found` en el pooler → **host de pooler equivocado**: DEV vive en `aws-0-sa-east-1.pooler.supabase.com`, prod en `aws-1-sa-east-1`. Un proyecto nuevo puede caer en otro cluster aunque sea la misma región; el host real sale de `GET /v1/projects/<ref>/config/database/pooler`.
- `PgClient: Failed to connect`, sin más detalle → **password incorrecto**. El CLI se come el error real de Postgres; para verlo hay que conectar con `pg` y mirar el código (`28P01` = password mal). Tras un reset el pooler tarda un momento en propagar: si el puerto 5432 rechaza pero el 6543 acepta, esperá y reintentá.

**Red**: `db.<ref>.supabase.co` es **IPv6-only** y ni esta máquina ni el VPS tienen IPv6. No es un problema para el CLI, que resuelve el pooler IPv4 por la API (por eso el PAT es condición previa). Si conectás a mano (psql, `pg`, un cliente gráfico), apuntá al pooler en modo session (5432): prod `aws-1-sa-east-1.pooler.supabase.com`, user `postgres.mkkgdjxaotgimqwhyesx`; DEV `aws-0-sa-east-1.pooler.supabase.com`, user `postgres.hgxuxoqyrooaariimqmg`.

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
