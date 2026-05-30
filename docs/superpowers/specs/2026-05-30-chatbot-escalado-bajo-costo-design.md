# Escalado del chatbot a bajo costo — Diseño

**Fecha:** 2026-05-30
**Estado:** Aprobado, listo para plan de implementación

## Contexto y problema

Chanchito se prepara para un lanzamiento público. El uso del chatbot es impredecible:
arranca chico, pero un pico viral no se puede controlar. El miedo principal **no es el
costo en estado estable** (es casi nulo), sino el **pico inesperado**: una factura
sorpresa o un endpoint abusado.

### Hallazgo clave: el chatbot NO usa OpenAI

A pesar de lo que sugiere `AI_BACKEND_README.md` (desactualizado), el código real usa
**Google Gemini 2.5 Flash** vía `@google/generative-ai` (`src/app/api/chat/route.ts:217`).
La voz usa Web Speech API del navegador (gratis, en el cliente). No hay un solo import de
OpenAI en el repo.

Gemini 2.5 Flash es de los modelos capaces más baratos del mercado, así que ya estamos
cerca del óptimo de costo de modelo. El trabajo no es "buscar un modelo más barato", sino
**protegerse del pico y optimizar lo que ya hay**.

### Costo actual (estimado)

Cada mensaje = 1 llamada al modelo. Tamaño aproximado del prompt:

| Componente | Tokens |
|---|---|
| System prompt estático (casos A-N + reglas) | ~3.000 |
| Categorías + diccionario de IDs | ~400 |
| Contexto de metas/presupuestos | 0–500 |
| Historial (truncado a ~2.000 chars) | ~500 |
| Mensaje del usuario | ~30 |
| Output (JSON) | ~200 |

≈ **4.200 input + 200 output por mensaje ≈ $0.0018/mensaje** con precios de Gemini 2.5
Flash (~$0.30/1M input, ~$2.50/1M output).

| Usuarios activos (5 msg/día) | Mensajes/mes | Costo Flash |
|---|---|---|
| 100 | 15.000 | ~$27/mes |
| 1.000 | 150.000 | ~$270/mes |
| 10.000 | 1.5M | ~$2.700/mes |

### Los límites reales al escalar (no es el costo del modelo)

1. **Rate limits del free tier de Google.** Sin billing activado, ~10 req/min y ~250
   req/día. No aguanta tráfico público.
2. **No hay caching.** Se reenvían ~3.000 tokens estáticos en cada request.
3. **No hay rate limiting propio.** Cualquier usuario autenticado puede spammear
   `/api/chat`.

### Aclaración crítica: Google NO da un techo duro real

Ni Google AI Studio ni Google Cloud tienen un "cortá todo al llegar a $X":
- **AI Studio:** solo rate limits por minuto/día, sin budget cap.
- **Cloud / Vertex AI:** tiene *budget alerts*, pero por defecto **solo mandan un mail**,
  no frenan nada. Para que corte de verdad hay que armar una Cloud Function que desactive
  el billing del proyecto (frágil y apaga todo el proyecto).

→ **El techo duro confiable se enforcea en nuestra app (Supabase).** Las alertas de Google
quedan como segunda línea.

## Objetivo

Diseñar un sistema que:
- Frene el **abuso individual** (cuota diaria por usuario).
- Amortigüe el **pico colectivo**.
- Tenga un **techo duro mensual real** controlado por la app.
- Optimice el **costo por mensaje** (caching).
- Deje el **gancho de monetización** (tier free/pro) listo para enchufar pagos después,
  **sin construir pagos ahora**.

## Decisión de arquitectura

**El contador (cuota + gasto global) vive en Supabase**, no en Redis. Razones: ya tenemos
el stack montado, es transaccional, gratis, y nos da el costo real (vía `usageMetadata` de
Gemini). Redis/Upstash sería optimización prematura para "probablemente no se viraliza"; se
puede swappear sin tocar el resto si algún día hace falta.

## Diseño

### 1. Modelo de datos (Supabase)

**Columna nueva:**
- `users.chat_tier` — `text NOT NULL DEFAULT 'free'`. Valores: `'free' | 'pro'`. Gancho de
  monetización. Hoy todos en `free`.

**Tabla `chat_usage`** — cuota por usuario/día:
- `user_id` (FK a `users.id`)
- `usage_date` (`date`)
- `request_count` (`int NOT NULL DEFAULT 0`)
- PK compuesta `(user_id, usage_date)`
- RLS: cada usuario lee solo lo suyo.

**Tabla `chat_budget`** — red de seguridad global:
- `period` (`text` PK, formato `'YYYY-MM'`)
- `request_count` (`bigint DEFAULT 0`)
- `input_tokens` (`bigint DEFAULT 0`)
- `output_tokens` (`bigint DEFAULT 0`)
- `estimated_cost_usd` (`numeric DEFAULT 0`)
- `is_killed` (`boolean DEFAULT false`) — kill-switch manual.
- RLS: sin acceso desde el cliente (solo service role / API route).

### 2. Configuración (env vars)

```
CHAT_DAILY_LIMIT_FREE   = 30     # cuota diaria tier free
CHAT_DAILY_LIMIT_PRO    = 300    # cuota diaria tier pro
CHAT_MONTHLY_BUDGET_USD = 50     # techo duro global mensual
GEMINI_INPUT_PRICE_PER_1M  = 0.30
GEMINI_OUTPUT_PRICE_PER_1M = 2.50
```

En env vars para cambio rápido sin migración. Migrar a tabla `app_config` solo si se
necesita cambiarlas sin redeploy.

### 3. Flujo del request (`src/app/api/chat/route.ts`)

**Antes de llamar a Gemini** — una sola RPC de Postgres atómica
(`check_and_increment_chat_usage`) que dentro de una transacción:

1. Lee/crea la fila `chat_budget` del mes actual. Si `is_killed = true` **o**
   `estimated_cost_usd >= CHAT_MONTHLY_BUDGET_USD` → devuelve estado `budget_exceeded`.
2. Si el techo global está OK: incrementa `chat_usage(user_id, hoy).request_count` y lo
   compara con el límite del `tier` del usuario. Si supera → devuelve estado
   `user_limit_exceeded`.
3. Si todo OK → devuelve estado `ok`.

La atomicidad (row locks de Postgres) evita que dos requests concurrentes pasen ambos el
límite.

El API route mapea el estado a la respuesta:
- `budget_exceeded` → HTTP 429, mensaje: *"El asistente está descansando un rato, probá más
  tarde 🐷"*.
- `user_limit_exceeded` → HTTP 429, mensaje: *"Llegaste a tu límite diario de mensajes.
  Mañana se renueva, o pasate a Pro para más."*
- `ok` → sigue con la llamada a Gemini.

**Después de la respuesta de Gemini** — leer `result.response.usageMetadata`
(`promptTokenCount`, `candidatesTokenCount`) y llamar una RPC `accumulate_chat_budget` que
suma tokens reales y costo calculado a la fila `chat_budget` del mes.

**Conteo de intentos, no de éxitos:** el incremento ocurre *antes* de llamar a Gemini. Un
abusador que spammea un endpoint que falla igual se frena. Sobre-contar en errores es
aceptable; la protección es el objetivo.

### 4. Optimización de costo

**Reordenar el prompt para activar caching implícito** (`src/lib/ai/chatPrompt.ts`):
hoy el template pone lo dinámico (`cardAlertsSection`, `goalsSection`, `historySection`)
**antes** del bloque estático de instrucciones (~3.000 tokens) en la línea 93. Gemini
cachea por **prefijo común**: con lo dinámico adelante, el prefijo cambia en cada request y
nunca cachea. **Solución:** mover el bloque estático de instrucciones al **principio** del
prompt y las secciones dinámicas al **final**. Gemini 2.5 Flash activa caching implícito
automáticamente → descuento sobre esos ~3.000 tokens en requests repetidos. Cero código
nuevo, solo reordenar el template (y verificar que las referencias a `${now}` dentro del
bloque estático sigan resolviendo bien).

**Modelo:** seguir con **Gemini 2.5 Flash**. Los 14 casos de intención son complejos y
Flash-Lite podría perder precisión. Queda como palanca futura: con volumen, A/B testear
Flash-Lite midiendo precisión. Cambiar de modelo es una línea.

### 5. Configuración en Google Cloud (segunda línea de defensa)

Estos pasos son **manuales**, los hace el dueño del proyecto en la consola de Google. Son
el backstop por si el contador propio fallara — no la protección principal.

**A. Activar billing / pasar a Tier 1 (obligatorio para ir público)**
1. Entrar a [Google AI Studio](https://aistudio.google.com/) → menú **Get API key**.
2. Ubicar el proyecto de Google Cloud asociado a la `GOOGLE_API_KEY` actual (figura junto a
   la key). Anotar el **Project ID**.
3. Ir a [Google Cloud Console](https://console.cloud.google.com/) y seleccionar ese
   proyecto (selector de proyecto arriba a la izquierda).
4. **Billing** (menú ☰ → *Billing*) → **Link a billing account**. Crear/asociar una cuenta
   de facturación con tarjeta.
5. Verificar en AI Studio que el proyecto figura como **paid tier / Tier 1** (los rate
   limits suben de ~10 RPM a ~1.000+ RPM).

**B. Crear un budget alert (avisa, no corta)**
1. En Cloud Console → **Billing** → **Budgets & alerts** → **Create budget**.
2. *Scope:* seleccionar el proyecto del chatbot (o "All projects" si está aislado).
3. *Amount:* monto target mensual (ej: **USD 50**, alineado con `CHAT_MONTHLY_BUDGET_USD`).
4. *Thresholds:* dejar alertas al **50%, 90% y 100%**.
5. *Notifications:* tildar el envío de email a los administradores de billing. Confirmar que
   el mail llega a una casilla que se revisa.
6. Guardar. Esto **solo manda mail**; el corte real lo hace la app vía `chat_budget`.

**C. (Opcional, avanzado — fuera del alcance de esta entrega)**
Para un corte automático a nivel Google se puede armar una Cloud Function suscrita al topic
de Pub/Sub del budget que llame a la API de Billing y desactive el billing del proyecto. Es
frágil y apaga **todo** el proyecto, por eso lo cubrimos del lado app y dejamos esto solo
documentado.

### 6. Observabilidad (mínima)

Arrancar consultando la tabla `chat_budget` directo en el SQL editor de Supabase
(`request_count`, `estimated_cost_usd`, tokens del mes). Sin dashboard por ahora.

## Fuera de alcance (explícito)

- **Integración de pagos** (Stripe / Mercado Pago) → spec aparte cuando se monetice. Esta
  entrega solo deja el campo `chat_tier`.
- **Redis / Upstash** → solo si se llega a escala masiva.
- **Cloud Function que apaga el billing** → el hard cap app-side ya lo cubre; queda
  documentado en la sección 5.C.
- **Dashboard de observabilidad** → consulta directa a Supabase por ahora.

## Resultado esperado

Abuso individual frenado por la cuota diaria, pico colectivo amortiguado, techo duro real
mensual controlado por la app, costo por mensaje optimizado con caching implícito, y el
gancho de Pro listo para enchufar pagos en una iteración futura.
