# Asistente IA (Chanchito, chat agéntico)

## Propósito
Chat conversacional dentro de la app que registra movimientos, cuotas, mensualidades, metas y presupuestos, y responde consultas financieras ("¿cuánta plata tengo?") en español rioplatense. Es un **agente con function calling**: Gemini 2.5 Flash elige tools tipadas en pasos sucesivos hasta responder. **Regla de oro: ningún número lo genera el LLM** — todo dato financiero sale de las funciones puras de `lib/finance/`, las mismas que usa el store del cliente, garantizando que el chat y el home dicen el mismo número.

> El viejo pipeline one-shot (intención → JSON) y el SDK `@google/generative-ai` **ya no existen** (no reintroducirlos). El chat de onboarding conversacional (`/api/chat/onboarding`, `lib/ai/onboarding*`) fue **eliminado** por completo (commit `8120687`); hoy `src/app/api/` solo tiene `chat/` e `investments/`.

## Rutas / entry points
- **`POST /api/chat`** — `src/app/api/chat/route.ts` (`maxDuration = 60`). Body: `{ message, history?: [{role: 'user'|'chanchito', content}] }`. Response: `{ success, message, mutated }`.
- **Cliente**: FAB flotante (`data-tour="fab"`) → `src/components/chat/ChatWidget.tsx`, montado globalmente por `ChatWidgetWrapper` en `src/components/layout/app-shell.tsx`. `useChatStore.sendMessage()` hace el fetch (única excepción al patrón "solo financeStore fetchea": es un POST de acción, no data-fetching).

## Archivos clave
| Archivo | Rol |
|---|---|
| `src/app/api/chat/route.ts` | Auth, cuota (`usageGuard`), contexto (categorías/medios/alertas de tarjeta), arma prompt y corre `runAgent`; acumula tokens al final |
| `src/lib/ai/agent.ts` | `runAgent` (loop), constantes `MAX_STEPS=6`, `TOKEN_CEILING=50_000`, `MAX_EMPTY_RETRIES=2`, anti-bucle; `createGeminiModel` (adapter `@google/genai`, modelo `gemini-2.5-flash`, `THINKING_BUDGET=512`) |
| `src/lib/ai/agentPrompt.ts` | `buildAgentPrompt`: identidad + 4 reglas duras + diccionario categorías (nombre→UUID) + medios + fecha + `cardAlerts` + nombre del usuario |
| `src/lib/ai/tools/registry.ts` | `allTools` (24), `getFunctionDeclarations`, `executeToolWith` (valida Zod, **nunca lanza**) |
| `src/lib/ai/tools/readTools.ts` | 11 tools de lectura (números vía `lib/finance/`), incluye `get_historial_categoria`/`get_que_se_movio` sobre `lib/finance/historico.ts` |
| `src/lib/ai/tools/writeTools.ts` | 12 tools de escritura (envuelven handlers) |
| `src/lib/ai/tools/appHelp.ts` | `get_app_help`: diccionario estático de conceptos (mantener fiel a CLAUDE.md) |
| `src/lib/ai/tools/dataLoader.ts` | `loadFinanceData` + `fetchDolarBlue` + memoización por request |
| `src/lib/ai/tools/schema.ts` | `zodToGeminiSchema` (z.toJSONSchema + limpieza de `$schema`/`additionalProperties`) |
| `src/lib/ai/tools/types.ts` | `AgentContext` (`supabase`, `userId`, `authUserId`, `today`, `_financeCache`), `ToolResult`, `ToolDef` |
| `src/lib/ai/handlers.ts` | Handlers de escritura (`handleTransaction`, `handleInstallment`, `handleEdit`, `handleDelete`, …), `resolvePaymentMethod`, `getAuthUserId`, `checkBudgetAlert` |
| `src/lib/ai/handlerTypes.ts` | Tipos de input de los handlers |
| `src/lib/chat/usageGuard.ts` | Cuota diaria + presupuesto global (RPCs Postgres) |
| `src/lib/store/chatStore.ts` | Zustand del chat: mensajes, `sendMessage`, refresh del financeStore si `mutated` |
| `src/components/chat/*` | `ChatWidget`, `ChatBubble`, `ChatInput` (voz vía `useSpeechRecognition`), `QuickActions`, `TypingIndicator` |
| `supabase/migrations/20260531_add_chat_usage_tables.sql` | Tablas `chat_usage`/`chat_budget` + RPCs + `users.chat_tier` |

## Tablas DB (gotcha crítico de `user_id`)
| Tabla | Filtro correcto |
|---|---|
| `transactions`, `payment_methods`, `recurring_plans`, `installment_plans` | **id interno** `users.id` → `ctx.userId` |
| `categories`, `internal_transfers`, `savings_goals`, `category_budgets`, `investment_assets`, `investment_transactions` | **UUID de auth** → `ctx.authUserId` (en handlers: `getAuthUserId()`) |

Confundirlos produce **queries que nunca matchean, sin error** (fuente de 5 bugs silenciosos ya corregidos, ej. `handlers.ts:654`, `:912`). `categories` además usa `.or('user_id.eq.<uuid>,is_system.eq.true')` para incluir las del sistema.

> **Verificado contra la DB real (2026-07-08)**: `users.id` es un **UUID que coincide con `auth.uid()`** (FK directa a `auth.users(id)`), y TODOS los ids de las tablas de la app son UUID (`types/database.ts` fue regenerado desde el schema real; los numéricos son solo `legacy_*`). En runtime `ctx.userId` === `ctx.authUserId`, pero la convención por tabla se mantiene (las FKs difieren); lo que NUNCA funciona es filtrar por `users.auth_user_id` (vestigial; la migración `20260708_fix_rls_open_policies.sql` la backfillea igual por robustez).

- `chat_usage`: PK `(user_id, usage_date)`, `request_count`. `user_id` = `users.id` (UUID interno); la route le pasa `dbUser.id` y funciona (24 filas reales de uso — la cuota está operativa, no hay fail-open). Solo se escribe vía RPC `SECURITY DEFINER`.
- `chat_budget`: PK `period` (`YYYY-MM`), acumula `input_tokens`/`output_tokens`/`estimated_cost_usd`, kill switch `is_killed`. Sin políticas de cliente.
- `users.chat_tier`: `'free' | 'pro'`.

## Flujos principales
1. **Request**: route autentica (`supabase.auth.getUser()`), resuelve el `users.id` interno (`.select('id, chat_tier, first_name').limit(1).single()`, solo RLS), chequea cuota (`checkAndIncrementUsage`; si el guard falla, **fail-closed** → 503, desde la auditoría del 2026-08-26), arma `cardAlerts` (tarjetas cuyo `default_payment_day` venció ayer), construye el prompt y corre el loop con historial truncado (últimos 10 mensajes, máx 2000 chars).
2. **Agent loop** (`runAgent`): hasta 6 pasos. En cada paso el modelo responde con texto (fin) o un `functionCall`; se ejecuta la tool y su resultado vuelve como `functionResponse`. Si `inputTokens+outputTokens > 50k`, el siguiente llamado va `withTools:false`. **Anti-bucle**: misma tool con mismos args dos veces → corta sin re-ejecutar y fuerza cierre final sin tools (`FORCED_FINAL_MESSAGE`).
   - ⚠️ **Turnos vacíos** (2026-08-27): Gemini devuelve cada tanto un candidato sin parts — `finishReason: STOP`, 0 tokens de salida, HTTP 200 — que no es una respuesta sino una falla transitoria. El loop lo leía como "terminó sin pedir tools" y contestaba el fallback, así que **toda consulta que necesitara una tool moría ahí**. La causa es el `thinkingBudget` **dinámico** (el default): medido contra DEV con el prompt real de un usuario con datos, 10 llamadas por fila → dinámico **9/10 vacíos**, 1024 → 1/10, **512 → 0/10**, 0 → 0/20. Por eso `createGeminiModel` fija `thinkingConfig.thinkingBudget = THINKING_BUDGET` (512: sin vacíos y con razonamiento suficiente para elegir tool y armar args), y `generateConReintento` reintenta hasta `MAX_EMPTY_RETRIES` veces ante un turno vacío, sumando los tokens de cada intento (se facturaron igual). Si el síntoma vuelve, **medir antes de mover el número**.
3. **Tools**: `executeToolWith` valida args con Zod (`safeParse`) antes de `execute` y atrapa cualquier throw → siempre devuelve `{ ok, data?, error?, mutated? }`. Lecturas: JSON compacto, máx. 20 filas, montos redondeados de `lib/finance` (`computeGlobalBalance`, `computePendingCreditCards`, etc.). Escrituras: envuelven `lib/ai/handlers.ts`; `mutated: true` en la respuesta final del endpoint hace que `chatStore` llame `useFinanceStore.getState().fetchAllData()`.
4. **Snapshot de datos**: `loadFinanceData(ctx)` = 7 queries (`assertNoQueryError` en cada una: un error de PostgREST lanza y se convierte en `{ok:false}` visible al usuario, nunca snapshot truncado en silencio) + dólar blue (`dolarapi.com`, timeout 2s, degrada a `null` → `resolveRate` cae al `exchange_rate` de cada fila). Se procesa con el MISMO pipeline `prepareTransactions`/`prepareRecurringPlans` de `lib/finance/prepare.ts` que usa el cliente. **Memoizado como PROMESA** en `ctx._financeCache` (evita carreras); `runAgent` lo invalida tras una escritura `mutated` (`agent.ts:104`); si la promesa rechaza NO queda cacheada (bug ya corregido, `dataLoader.ts:137`).
5. **Borrados en dos pasos, stateless** (serverless-safe): `delete_entity` con `confirmed=false` devuelve las dependencias encontradas; el modelo pregunta al usuario; recién en el **mensaje siguiente** vuelve a llamar con `confirmed=true` (+ `reasignar_a` opcional). No hay estado en servidor: la regla vive en el prompt (regla dura 4) + schema.
6. **Costos**: cuota diaria por usuario (30 free / 300 pro) y presupuesto mensual global con corte duro (50 USD). Desde `20260728_harden_chat_usage_rpcs.sql` **la configuración vive en la tabla `chat_config`**, no en env vars: los RPC están expuestos al rol `authenticated` (invocables desde el browser con la anon key), así que recibir el `user_id`/límite/presupuesto/precios como parámetros permitía saltarse la cuota, quemarle el límite a otro usuario o inflar el costo hasta disparar el kill switch. Ahora `check_and_increment_chat_usage()` no toma argumentos (usuario de `auth.uid()`, tier de `users.chat_tier`, límites de `chat_config`) y `accumulate_chat_budget(input, output)` solo recibe tokens, clampeados a `chat_config.max_tokens_per_call`. `accumulateBudget` suma los tokens de **TODO el loop** al final. 429 con mensajes amigables si se excede.
   - Para cambiar límites o precios: `UPDATE public.chat_config SET ...` (efecto inmediato, sin deploy). Las env vars `CHAT_DAILY_LIMIT_*`, `CHAT_MONTHLY_BUDGET_USD` y `GEMINI_*_PRICE_PER_1M` quedaron sin uso.
   - Quedan wrappers con las firmas viejas para no romper el deploy vigente; dropearlos después de desplegar (ver el pie de esa migración).

## Catálogo de tools (24)
- **Lectura (12)**: `get_balance_snapshot`, `get_payment_method_status`, `get_monthly_summary`, `get_expenses_by_category`, `search_transactions`, `get_installments_status`, `list_recurring_plans`, `list_goals_and_budgets`, `get_portfolio_status`, `get_app_help`, `get_historial_categoria`, `get_que_se_movio`.
- **Escritura (12)**: `create_transaction`, `create_installment_plan`, `create_recurring_plan`, `set_card_dates`, `create_category`, `create_payment_method`, `update_entity`, `delete_entity`, `delete_goal_or_budget`, `create_goal`, `create_budget`, `contribute_to_goal`.

## Invariantes y gotchas
- **Ningún número del LLM**: si agregás lógica financiera, va en `lib/finance/`, nunca en la tool.
- El prompt presenta al **usuario** por su `first_name`; "Chanchito" es el asistente (sin la aclaración, el modelo llamaba "Chanchito" al usuario — fix `624f449`).
- `zodToGeminiSchema` borra `additionalProperties`: un `z.record(...)` pierde el tipo de sus valores → documentar la forma en el `.describe()` (ej. `cambios` de `update_entity`).
- `update_entity` NO acepta `cuota` (no hay case en `handleEdit`); `delete_entity` sí.
- `create_category`/`create_payment_method` hacen duplicate-check con `normalizeName` (trim+lowercase), **no** `ilike` (los `%`/`_` del input serían wildcards).
- Si no se aclara medio de pago, `resolvePaymentMethod(..., exactMatch=true)` usa el `is_default`.
- `checkBudgetAlert` (handlers) agrega aviso de presupuesto excedido tras crear una transacción de gasto.
- Los mensajes por voz (`isVoice`) marcan `needsConfirmation` en el `chatStore`.

## Tests
- `src/lib/ai/__tests__/` (5 archivos Vitest): `agent.test.ts` (loop, límites, anti-bucle, con modelo guionado sin red), `agentPrompt.test.ts`, `checkBudgetAlert.test.ts`, `handleDelete.test.ts`, `handleEdit.test.ts`.
- `src/lib/ai/tools/__tests__/` (7): registry, schema-fidelidad de tools, readTools (A/B), writeTools (A/B), dataLoader, appHelp.
- `src/lib/chat/__tests__/usageGuard.test.ts`.
- La lógica de cálculo se testea directo en `src/lib/finance/__tests__/`.

## Docs relacionados
- Spec principal (arquitectura, catálogo de tools, criterios de QA y **roadmap**: UI híbrida, proactividad/coaching, contexto macro argentino, módulo transaccional): `docs/superpowers/specs/2026-07-07-chatbot-asistente-ia-design.md` + plan `docs/superpowers/plans/2026-07-07-chatbot-asistente-ia.md`.
- Costos/cuotas: `docs/superpowers/specs/2026-05-30-chatbot-escalado-bajo-costo-design.md` + plan homónimo.
- Sección «Asistente IA» y «Lógica financiera compartida» de `CLAUDE.md`.
