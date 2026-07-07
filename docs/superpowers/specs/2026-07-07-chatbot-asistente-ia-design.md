# Chatbot → Asistente IA: Fundación agéntica

**Fecha**: 2026-07-07
**Rama**: `feat/chatbot-asistente-ia`
**Estado**: Diseño aprobado, pendiente de plan de implementación

## Contexto y problema

El chatbot actual usa un pipeline one-shot: una llamada a Gemini 2.5 Flash con un
system prompt de 330 líneas (`chatPrompt.ts`) que clasifica el mensaje en **un**
JSON de intención → `intentParser.ts` lo tipa → `handlers.ts` (2.188 líneas) lo
ejecuta. El modelo solo clasifica: no puede consultar datos, razonar sobre ellos
y componer una respuesta.

Consecuencias:

- **No responde preguntas amplias** ("¿cómo vengo este mes comparado con el
  anterior?", "¿me conviene esta compra?") ni ejecuta escrituras compuestas
  ("cloná el alquiler del mes pasado +12%").
- **Lógica duplicada**: `handlers.ts` reimplementa en el servidor cálculos que ya
  viven en `financeStore.ts` (ciclos de tarjeta, balances) y ya divergen: el
  `medio_pago_cierre` del chat no aplica las mismas reglas que
  `getPaymentMethodStatus()`. El chat puede responder un número distinto al que
  muestra el home.
- **Bug preexistente**: las confirmaciones de borrado viven en un `Map` en
  memoria del servidor (`pendingActions`), que en Vercel llega vacío cuando la
  request siguiente cae en otra lambda.
- **No existe**: crear categorías/medios de pago desde el chat, explicar
  conceptos de la app, análisis compuestos.

Este sub-proyecto es la **fundación**: reemplaza el motor. Los módulos de
producto restantes (proactividad, contexto macro argentino, UI conversacional
híbrida) son sub-proyectos posteriores que se montan sobre esta base (ver
Roadmap al final).

## Decisiones tomadas

| Decisión | Elección |
|----------|----------|
| Primer sub-proyecto | Fundación agéntica (motor tool-use multi-paso) |
| Modelo/proveedor | Gemini 2.5 Flash (se mantiene; escala de modelo posible sin tocar arquitectura) |
| Tiers y costo | Agente para todos los usuarios; cupos actuales al inicio, recalibración con datos reales |
| Alcance | Reemplazo total: lecturas Y escrituras pasan por el agente |
| Enfoque | A: toolbox determinista + `lib/finance/` compartida (vs. snapshot en prompt o router híbrido, descartados) |

**Regla de oro del diseño**: todo número sale del código, nunca del LLM. El
modelo orquesta tools y redacta; las tools calculan.

## Arquitectura

El endpoint `POST /api/chat` se mantiene (misma auth, mismo `usageGuard`, mismo
contrato de respuesta hacia el cliente). Adentro, el pipeline se reemplaza:

```
POST /api/chat { message, history }
  │
  ├─ 1. Auth + cuota (igual que hoy)
  ├─ 2. AgentContext: userId, categorías, medios de pago (con IDs),
  │     fecha de hoy, tier, alertas de tarjeta
  │
  ├─ 3. Agent loop (lib/ai/agent.ts) — máx. 6 pasos:
  │     Gemini Flash + declaraciones de ~20 tools
  │       ↳ functionCall → ejecutar tool → functionResponse → siguiente paso
  │       ↳ texto → terminó, esa es la respuesta
  │
  └─ 4. Respuesta: { success, message, mutated }
       (mutated = alguna tool de escritura se ejecutó con éxito →
        el cliente refresca financeStore, igual que hoy)
```

Piezas nuevas:

- **`lib/ai/agent.ts`** — el loop: chat multi-turno con Gemini, ejecuta tools,
  corta a los 6 pasos (si se agota, fuerza una llamada final sin tools para que
  el modelo responda con lo que juntó y lo diga honestamente).
- **`lib/ai/tools/`** — registro de tools. Cada tool:
  `{ name, description, schema (Zod), execute(args, ctx) }`. El schema valida
  los argumentos del modelo antes de tocar la DB y se convierte a JSON Schema
  para las declaraciones de Gemini (`z.toJSONSchema`, nativo en Zod 4).
- **System prompt nuevo y corto** — personalidad de Chanchito, reglas ("nunca
  inventes números, usá tools"), contexto liviano (categorías/medios con IDs,
  fecha, alertas de tarjeta). Las estructuras JSON del prompt actual mueren:
  eso lo resuelven las declaraciones de tools.
- **SDK**: migrar de `@google/generative-ai` (0.24.1, deprecado por Google) a
  `@google/genai` como parte de este trabajo.

No cambia: `chatStore` y la UI del chat (salvo el indicador de carga, ver
Latencia), el chat de onboarding (`/api/chat/onboarding`), el contrato de
respuesta al cliente.

## Catálogo de tools

### Lecturas

| Tool | Responde a |
|------|-----------|
| `get_balance_snapshot()` | Disponible Real + saldo bruto + pendientes (mensualidades y tarjetas) |
| `get_payment_method_status(nombre?)` | Ciclo vigente de crédito (vencimiento, ARS/USD separados) o saldo de débito/efectivo |
| `get_monthly_summary(mes?)` | Ingresos, gastos y balance de cualquier mes |
| `get_expenses_by_category(mes?)` | Desglose de gastos por categoría, ordenado |
| `search_transactions(filtros)` | Texto, categoría, medio, rango de fechas, límite |
| `get_installments_status(búsqueda?)` | Cuotas activas, progreso, restante |
| `list_recurring_plans()` | Mensualidades activas + pendientes de pago este mes |
| `list_goals_and_budgets()` | Metas de ahorro y presupuestos con progreso |
| `get_portfolio_status()` | Inversiones |
| `get_app_help(tema)` | Diccionario estático de conceptos de la app (TS map, sin DB) |

### Escrituras (reutilizan los handlers actuales por dentro)

| Tool | Nota |
|------|------|
| `create_transaction` | Componible: "cloná el alquiler +12%" = search → calcular → create |
| `create_installment_plan` | Cuotas |
| `create_recurring_plan` | Mensualidades |
| `create_category(nombre, tipo, emoji)` | **Nueva capacidad** |
| `create_payment_method(nombre, tipo, días?)` | **Nueva capacidad** |
| `update_entity(entidad, búsqueda, cambios)` | Transacción/categoría/medio/cuota/meta/presupuesto |
| `delete_entity(entidad, búsqueda, confirmed)` | Patrón de confirmación stateless (abajo) |
| `set_card_dates` | Config de cierre/vencimiento |
| `create_goal`, `create_budget`, `contribute_to_goal` | Ya existen como handlers, se envuelven |

### Confirmación stateless de borrados

`delete_entity` sin `confirmed=true` no borra: devuelve el resumen de
dependencias ("la categoría Comida tiene 47 transacciones"). El agente pregunta
al usuario; en el mensaje siguiente, el historial conversacional le permite al
modelo llamar `delete_entity(..., confirmed=true)`. Cero estado en el servidor
→ arregla el bug del `Map` en memoria.

### Reglas transversales

- Toda escritura valida con Zod contra `lib/schemas/` antes de insertar.
- El modelo nunca arma SQL ni toca Supabase directo: solo elige tools y
  argumentos.
- Tipo de categoría coherente con tipo de movimiento (la regla del commit
  `8bd0ea6` se vuelve estructural en el schema de la tool).
- Ambigüedad → preguntar, no adivinar: sin medio de pago claro ni default, el
  agente pregunta.

## `lib/finance/` — fuente única de cálculos

Extraer los cálculos financieros a funciones puras, sin dependencia de Zustand
ni de Supabase. Reciben datos planos (arrays de transacciones, medios, planes)
y devuelven resultados:

```
lib/finance/
  creditCycle.ts    → ciclo vigente, pertenencia al ciclo, resumen a pagar
  balances.ts       → disponible real, saldo bruto, balance global
  pending.ts        → mensualidades pendientes, tarjetas pendientes
  analysis.ts       → gastos por categoría, resumen mensual
```

Consumidores:

- **`financeStore`**: sus getters se vuelven wrappers finos que pasan el estado
  del store a la función pura. La API pública del store no cambia; ningún
  componente se toca.
- **Tools del servidor**: fetchean las filas de Supabase y llaman la misma
  función. Garantía estructural de que el chat y el home dicen el mismo número.

**Alcance (YAGNI)**: se extrae solo lo que las tools de lectura necesitan
(ciclos de tarjeta, disponible real/pendientes, gastos por categoría, balance
mensual). Portfolio con cotizaciones, backfill preview, etc. quedan en el store
y se migran solo si hace falta.

**Red de seguridad**: los tests existentes del store
(`analysis-getters.test.ts`, `disponible-real.test.ts`) deben pasar sin
modificarse.

## Errores, límites, costos y latencia

**Cuota y presupuesto** (`usageGuard` se mantiene):

- 1 mensaje del usuario = 1 unidad de cuota diaria, sin importar los pasos
  internos del agente.
- `accumulateBudget` acumula los tokens de **todas** las llamadas del loop. El
  guard global (`budget_exceeded`) sigue siendo el freno de mano.
- Cupos actuales al inicio; recalibración con datos reales de consumo.

**Protecciones del loop**:

- Tope de 6 pasos; al agotarse, llamada final forzada sin tools.
- Anti-bucle: misma tool con mismos argumentos repetida → corte y respuesta
  forzada.
- `maxDuration = 60` en la route.

**Errores de tools**: una tool que falla devuelve `{ error: "..." }` como
functionResponse; el modelo reintenta con otros argumentos, prueba otra tool o
explica el problema. El try/catch global de la route queda como última red.

**Latencia**: un mensaje complejo puede tardar 4-15 s (2-6 llamadas). Sin
streaming (pertenece al sub-proyecto de UI híbrida). Único cambio de UI: el
indicador de carga pasa a frases rotativas del lado del cliente ("Revisando tus
cuentas… 🐷", "Haciendo números…"). Cero cambio de backend.

## Testing

Todo con Vitest, sin red:

- **`lib/finance/`**: tests unitarios directos (ciclos al límite: día exacto de
  vencimiento, cierre en fin de mes, USD/ARS). Los tests existentes del store
  pasan sin tocarse.
- **Tools**: cada `execute()` con Supabase mockeado — happy path + argumentos
  inválidos rechazados por Zod.
- **Agent loop**: cliente Gemini mockeado con secuencias guionadas de
  `functionCall` → orquestación multi-paso, tope de 6, anti-bucle, recuperación
  de errores. El loop se testea como máquina de estados.
- **QA manual**: checklist de frases canónicas contra Supabase DEV (ver
  Criterios de éxito).

## Migración

Orden de implementación; cada fase deja el repo verde:

1. Extraer `lib/finance/` + tests (refactor puro, comportamiento idéntico).
2. Registro de tools envolviendo los handlers actuales (aún nadie las llama).
3. Agent loop + prompt nuevo + migración del SDK a `@google/genai`.
4. Swap en la route. Se borran: `intentParser.ts`, `chatPrompt.ts`, el `Map` de
   `pendingActions`. De `handlers.ts` sobrevive solo lo que las tools
   reutilizan; los `handleQuery*` duplicados mueren a manos de `lib/finance/`.
5. UX de carga (frases rotativas) + recalibración de copy.

Swap directo en la rama, sin feature flag (app personal; `.env.local` apunta a
Supabase DEV; prod solo se toca al mergear a `master`). Sin cambios de schema
SQL → no aplica el checklist DEV→PROD.

## Criterios de éxito (QA manual)

El asistente responde correctamente (números idénticos a la UI) y ejecuta:

- "¿Cuánto me va a venir de la Visa?" → ciclo vigente con vencimiento y
  ARS/USD separados, igual que Compromisos.
- "¿Cuánta plata tengo disponible?" → Disponible Real, igual que el home.
- "¿En qué categoría gasto más este mes?" → desglose correcto.
- "¿Cuánto gasté en delivery en mayo?" → búsqueda filtrada.
- "Cloná el alquiler del mes pasado con 12% de aumento" → lee, calcula,
  inserta, y responde con el detalle.
- "Creá una categoría Mascotas" / "Agregá Lemon como medio de pago" → creación
  con confirmación en la respuesta.
- "Borrá la categoría X" → pide confirmación con dependencias; "sí, borrala" →
  ejecuta (a través de dos requests/lambdas distintas).
- "¿Qué significa Disponible Real?" → explicación desde `get_app_help`, fiel a
  la doc del proyecto.
- Mensaje ambiguo ("gasté 5 lucas") → pregunta en vez de adivinar.

## Roadmap (sub-proyectos posteriores, fuera de este spec)

1. **UI conversacional híbrida**: tarjetas interactivas Confirmar/Cancelar,
   gráficos embebidos en burbujas, streaming/SSE de progreso del agente.
2. **Proactividad y coaching**: alertas de desvío temprano, refuerzo positivo,
   cierre de mes storytelling. Requiere crons/notificaciones push.
3. **Contexto macro argentino**: inflación (API externa), calculador
   efecto-cuotas, dinero dormido, monitor vencimiento vs. liquidez.
4. **Módulo transaccional restante**: lo que el agente no cubra gratis
   (detección de suscripciones vampiro, simulador de viabilidad de compra —
   ambos son en gran parte prompting + tools ya existentes).
