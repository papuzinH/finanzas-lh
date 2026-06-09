# Chatbot: Escalado a Bajo Costo — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar cuota diaria por usuario, techo duro global mensual en Supabase, y reordenar el prompt de Gemini para activar caching implícito, preparando el chatbot para el lanzamiento público.

**Architecture:** Dos RPCs Postgres atómicas (`check_and_increment_chat_usage`, `accumulate_chat_budget`) corren dentro del API route antes y después de cada llamada a Gemini. La tabla `chat_budget` acumula costo real con tokens de `usageMetadata`. La tabla `chat_usage` rastrea requests por usuario/día con PK compuesta. Las env vars controlan los límites sin re-deploy.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + RLS + RPCs SECURITY DEFINER), `@google/generative-ai` SDK, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-chatbot-escalado-bajo-costo-design.md`

---

## Mapa de archivos

| Acción | Archivo | Responsabilidad |
|---|---|---|
| Crear | `supabase/migrations/20260531_add_chat_usage_tables.sql` | Tablas + RPCs + RLS |
| Crear | `src/lib/chat/usageGuard.ts` | Wrapper de RPCs + helper puro `getDailyLimit` |
| Crear | `src/lib/chat/__tests__/usageGuard.test.ts` | Tests del helper puro |
| Modificar | `src/app/api/chat/route.ts` | Integrar guard antes/después de Gemini |
| Modificar | `src/lib/ai/chatPrompt.ts` | Reordenar prompt para caching implícito |

---

## Task 1: Variables de entorno

**Files:**
- Modify: `.env.local` (no se commitea — solo documentar)
- Modify: Vercel dashboard (entorno de producción)

- [ ] **Step 1: Agregar vars a `.env.local`**

Abrir `.env.local` y agregar al final:
```
CHAT_DAILY_LIMIT_FREE=30
CHAT_DAILY_LIMIT_PRO=300
CHAT_MONTHLY_BUDGET_USD=50
GEMINI_INPUT_PRICE_PER_1M=0.30
GEMINI_OUTPUT_PRICE_PER_1M=2.50
```

- [ ] **Step 2: Agregar las mismas vars en Vercel**

Ir a Vercel → proyecto Chanchito → Settings → Environment Variables.
Agregar cada una de las 5 variables con los mismos valores para el entorno `Production`.

> Nota: `CHAT_MONTHLY_BUDGET_USD` es el techo duro real. Si se cambia en Vercel, entra en vigencia en el próximo deploy. Si se quiere cambio instantáneo sin deploy, migrar a tabla `app_config` en una iteración futura.

---

## Task 2: Migración SQL

**Files:**
- Create: `supabase/migrations/20260531_add_chat_usage_tables.sql`

- [ ] **Step 1: Crear el archivo de migración**

Crear `supabase/migrations/20260531_add_chat_usage_tables.sql` con el siguiente contenido:

```sql
-- ============================================================
-- MIGRACIÓN: Chat usage tracking + rate limiting
-- Fecha: 2026-05-31
-- Descripción: Tablas y RPCs para cuota por usuario y techo
--   global de costo mensual del chatbot.
-- ============================================================

-- ============================================================
-- 1. Columna chat_tier en users (gancho de monetización)
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD CONSTRAINT chat_tier_values CHECK (chat_tier IN ('free', 'pro'));

-- ============================================================
-- 2. Tabla chat_usage — cuota por usuario/día
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_usage (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE chat_usage ENABLE ROW LEVEL SECURITY;

-- Los usuarios pueden leer solo sus propias filas
-- (escritura solo vía RPC SECURITY DEFINER)
CREATE POLICY "chat_usage_select_own" ON chat_usage
  FOR SELECT
  USING (
    user_id = (
      SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
    )
  );

-- ============================================================
-- 3. Tabla chat_budget — red de seguridad global mensual
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_budget (
  period              TEXT PRIMARY KEY,  -- formato 'YYYY-MM'
  request_count       BIGINT NOT NULL DEFAULT 0,
  input_tokens        BIGINT NOT NULL DEFAULT 0,
  output_tokens       BIGINT NOT NULL DEFAULT 0,
  estimated_cost_usd  NUMERIC(12, 6) NOT NULL DEFAULT 0,
  is_killed           BOOLEAN NOT NULL DEFAULT false,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_budget ENABLE ROW LEVEL SECURITY;
-- Sin políticas de cliente: solo accesible vía RPCs SECURITY DEFINER

-- ============================================================
-- 4. RPC: check_and_increment_chat_usage
--    Chequea techo global y cuota de usuario en una transacción atómica.
--    Retorna: 'ok' | 'budget_exceeded' | 'user_limit_exceeded'
-- ============================================================
CREATE OR REPLACE FUNCTION check_and_increment_chat_usage(
  p_user_id             INTEGER,
  p_daily_limit         INTEGER,
  p_monthly_budget_usd  NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period        TEXT    := to_char(NOW(), 'YYYY-MM');
  v_budget_killed BOOLEAN;
  v_budget_cost   NUMERIC;
  v_new_count     INTEGER;
BEGIN
  -- Asegurar que existe la fila del mes actual
  INSERT INTO chat_budget (period) VALUES (v_period)
  ON CONFLICT (period) DO NOTHING;

  -- Bloquear la fila del presupuesto para evitar race conditions
  SELECT is_killed, estimated_cost_usd
  INTO v_budget_killed, v_budget_cost
  FROM chat_budget WHERE period = v_period FOR UPDATE;

  -- Verificar kill switch y techo de costo
  IF v_budget_killed OR v_budget_cost >= p_monthly_budget_usd THEN
    RETURN 'budget_exceeded';
  END IF;

  -- Incrementar contador del usuario (siempre cuenta el intento)
  INSERT INTO chat_usage (user_id, usage_date, request_count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, usage_date) DO UPDATE
    SET request_count = chat_usage.request_count + 1
  RETURNING request_count INTO v_new_count;

  -- Verificar cuota diaria
  IF v_new_count > p_daily_limit THEN
    RETURN 'user_limit_exceeded';
  END IF;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- 5. RPC: accumulate_chat_budget
--    Acumula tokens reales y costo calculado al presupuesto mensual.
-- ============================================================
CREATE OR REPLACE FUNCTION accumulate_chat_budget(
  p_input_tokens          INTEGER,
  p_output_tokens         INTEGER,
  p_input_price_per_1m    NUMERIC,
  p_output_price_per_1m   NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period TEXT   := to_char(NOW(), 'YYYY-MM');
  v_cost   NUMERIC;
BEGIN
  v_cost := (p_input_tokens::NUMERIC  / 1000000 * p_input_price_per_1m)
          + (p_output_tokens::NUMERIC / 1000000 * p_output_price_per_1m);

  INSERT INTO chat_budget (period, request_count, input_tokens, output_tokens, estimated_cost_usd, updated_at)
  VALUES (v_period, 1, p_input_tokens, p_output_tokens, v_cost, NOW())
  ON CONFLICT (period) DO UPDATE SET
    request_count      = chat_budget.request_count      + 1,
    input_tokens       = chat_budget.input_tokens       + p_input_tokens,
    output_tokens      = chat_budget.output_tokens      + p_output_tokens,
    estimated_cost_usd = chat_budget.estimated_cost_usd + v_cost,
    updated_at         = NOW();
END;
$$;
```

- [ ] **Step 2: Aplicar la migración en Supabase PROD**

> ⚠️ Esta migración debe aplicarse a producción ANTES de hacer merge del código que la usa.

Ir a Supabase dashboard → proyecto PROD → SQL Editor.
Copiar el contenido del archivo y ejecutarlo.

Verificar en Table Editor que existen:
- Columna `users.chat_tier` (texto, default `'free'`)
- Tabla `chat_usage` con columnas `user_id`, `usage_date`, `request_count`
- Tabla `chat_budget` con columnas `period`, `request_count`, `input_tokens`, `output_tokens`, `estimated_cost_usd`, `is_killed`

Verificar que las RPCs existen: en el SQL Editor correr:
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('check_and_increment_chat_usage', 'accumulate_chat_budget');
```
Debe devolver 2 filas.

- [ ] **Step 3: Commit de la migración**

```bash
git add supabase/migrations/20260531_add_chat_usage_tables.sql
git commit -m "feat(db): tablas y RPCs para cuota y techo de costo del chatbot"
```

---

## Task 3: Módulo usageGuard

**Files:**
- Create: `src/lib/chat/usageGuard.ts`
- Create: `src/lib/chat/__tests__/usageGuard.test.ts`

- [ ] **Step 1: Crear `src/lib/chat/usageGuard.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export type UsageCheckResult = 'ok' | 'budget_exceeded' | 'user_limit_exceeded'

export function getDailyLimit(tier: 'free' | 'pro'): number {
  if (tier === 'pro') return Number(process.env.CHAT_DAILY_LIMIT_PRO ?? 300)
  return Number(process.env.CHAT_DAILY_LIMIT_FREE ?? 30)
}

export async function checkAndIncrementUsage(
  supabase: SupabaseClient,
  userId: number,
  tier: 'free' | 'pro'
): Promise<UsageCheckResult> {
  const { data, error } = await supabase.rpc('check_and_increment_chat_usage', {
    p_user_id: userId,
    p_daily_limit: getDailyLimit(tier),
    p_monthly_budget_usd: Number(process.env.CHAT_MONTHLY_BUDGET_USD ?? 50),
  })
  if (error) throw error
  return data as UsageCheckResult
}

export async function accumulateBudget(
  supabase: SupabaseClient,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const { error } = await supabase.rpc('accumulate_chat_budget', {
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_input_price_per_1m: Number(process.env.GEMINI_INPUT_PRICE_PER_1M ?? 0.30),
    p_output_price_per_1m: Number(process.env.GEMINI_OUTPUT_PRICE_PER_1M ?? 2.50),
  })
  if (error) console.error('accumulate_chat_budget failed:', error)
}
```

- [ ] **Step 2: Crear `src/lib/chat/__tests__/usageGuard.test.ts`**

```typescript
import { getDailyLimit } from '../usageGuard'

let passed = 0
let failed = 0

function test(desc: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✅ ${desc}`)
    passed++
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ❌ ${desc}: ${msg}`)
    failed++
  }
}

function expect(val: unknown) {
  return {
    toBe: (expected: unknown) => {
      if (val !== expected) throw new Error(`expected ${expected}, got ${val}`)
    },
  }
}

console.log('\n=== Tests: usageGuard.ts ===\n')

const originalEnv = { ...process.env }

function restoreEnv() {
  process.env.CHAT_DAILY_LIMIT_FREE = originalEnv.CHAT_DAILY_LIMIT_FREE
  process.env.CHAT_DAILY_LIMIT_PRO = originalEnv.CHAT_DAILY_LIMIT_PRO
}

test('free tier retorna 30 por defecto', () => {
  delete process.env.CHAT_DAILY_LIMIT_FREE
  expect(getDailyLimit('free')).toBe(30)
  restoreEnv()
})

test('pro tier retorna 300 por defecto', () => {
  delete process.env.CHAT_DAILY_LIMIT_PRO
  expect(getDailyLimit('pro')).toBe(300)
  restoreEnv()
})

test('free tier respeta CHAT_DAILY_LIMIT_FREE', () => {
  process.env.CHAT_DAILY_LIMIT_FREE = '50'
  expect(getDailyLimit('free')).toBe(50)
  restoreEnv()
})

test('pro tier respeta CHAT_DAILY_LIMIT_PRO', () => {
  process.env.CHAT_DAILY_LIMIT_PRO = '500'
  expect(getDailyLimit('pro')).toBe(500)
  restoreEnv()
})

test('free y pro retornan valores distintos', () => {
  delete process.env.CHAT_DAILY_LIMIT_FREE
  delete process.env.CHAT_DAILY_LIMIT_PRO
  const freeLim = getDailyLimit('free')
  const proLim = getDailyLimit('pro')
  if (freeLim >= proLim) throw new Error(`free (${freeLim}) debe ser menor que pro (${proLim})`)
  restoreEnv()
})

console.log(`\n=== Resultados ===`)
console.log(`✅ Pasaron: ${passed}`)
console.log(`❌ Fallaron: ${failed}`)
console.log(`📊 Total: ${passed + failed}`)

if (failed > 0) process.exit(1)
```

- [ ] **Step 3: Correr los tests**

```bash
npm run test
```

Resultado esperado: todos los tests del archivo nuevo pasan. Los tests existentes de `chatPrompt.test.ts` e `intentParser.test.ts` también deben seguir pasando.

- [ ] **Step 4: Commit**

```bash
git add src/lib/chat/usageGuard.ts src/lib/chat/__tests__/usageGuard.test.ts
git commit -m "feat(chat): módulo usageGuard con RPCs de cuota y techo global"
```

---

## Task 4: Integrar usageGuard en el API route

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Agregar el import de usageGuard**

En `src/app/api/chat/route.ts`, después de la última línea de imports existente (línea ~7), agregar:

```typescript
import { checkAndIncrementUsage, accumulateBudget } from '@/lib/chat/usageGuard'
```

- [ ] **Step 2: Seleccionar chat_tier junto con id en la query de users**

Ubicar la query de users (línea ~81). Cambiar:

```typescript
// antes
const { data: dbUser, error: userFetchError } = await supabase
  .from('users')
  .select('id')
  .limit(1)
  .single()
```

Por:

```typescript
// después
const { data: dbUser, error: userFetchError } = await supabase
  .from('users')
  .select('id, chat_tier')
  .limit(1)
  .single()
```

- [ ] **Step 3: Agregar la verificación de cuota antes de llamar a Gemini**

Después del bloque que lee `userFetchError` (justo antes del bloque que obtiene categorías), agregar:

```typescript
const userId = dbUser.id
const tier = (dbUser.chat_tier === 'pro' ? 'pro' : 'free') as 'free' | 'pro'

// Verificar cuota antes de llamar a Gemini
let usageStatus: string
try {
  usageStatus = await checkAndIncrementUsage(supabase, userId, tier)
} catch (err) {
  console.error('Error checking chat usage:', err)
  // Si el guard falla, dejamos pasar (fail open) para no romper UX
  usageStatus = 'ok'
}

if (usageStatus === 'budget_exceeded') {
  return NextResponse.json(
    { success: false, message: 'El asistente está descansando un rato, probá más tarde 🐷' },
    { status: 429 }
  )
}

if (usageStatus === 'user_limit_exceeded') {
  return NextResponse.json(
    { success: false, message: 'Llegaste a tu límite diario de mensajes. Mañana se renueva, o pasate a Pro para más 🚀' },
    { status: 429 }
  )
}
```

> Nota: `userId` ya estaba declarado más abajo en el archivo original (línea ~92). Hay que eliminar esa declaración duplicada ya que ahora se declara aquí. Buscar `const userId = dbUser.id` en el resto del archivo y quitarlo.

- [ ] **Step 4: Acumular tokens después de la respuesta de Gemini**

Después de `geminiText = result.response.text()` (dentro del try block de Gemini), agregar:

```typescript
geminiText = result.response.text()

// Acumular uso real (fire-and-forget — no bloquea la respuesta al usuario)
const usage = result.response.usageMetadata
accumulateBudget(
  supabase,
  usage?.promptTokenCount ?? 0,
  usage?.candidatesTokenCount ?? 0
).catch(err => console.error('accumulateBudget failed:', err))
```

- [ ] **Step 5: Verificar que el archivo compila sin errores TypeScript**

```bash
npx tsc --noEmit
```

Resultado esperado: sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(chat): verificación de cuota y acumulación de costo en /api/chat"
```

---

## Task 5: Reordenar el prompt para caching implícito de Gemini

**Files:**
- Modify: `src/lib/ai/chatPrompt.ts`

**Contexto:** Gemini cachea el prefijo del `systemInstruction`. El bloque estático (CASOs A-N + REGLAS CRÍTICAS, ~3.000 tokens) debe ir **primero**, y el contenido dinámico (categorías, metas, alertas, historial) debe ir **al final**. Hoy es al revés: las secciones dinámicas están en la línea 93, antes del bloque estático. Con el reorden, el prefijo estático se mantiene igual entre requests del mismo día → Gemini activa caching automático.

> Nota: el caching implícito requiere ≥4096 tokens de prefijo. Con ~3.000 tokens estáticos estamos cerca del umbral; con categorías en el prefijo superaríamos ese límite. El beneficio es marginal hasta tener volumen, pero la arquitectura queda correcta desde ahora.

- [ ] **Step 1: Reordenar el return statement de `buildChatPrompt`**

Abrir `src/lib/ai/chatPrompt.ts`. Buscar la función `buildChatPrompt`. El `return` actual (línea ~91) empieza con:

```typescript
  return `Actúa como un asistente financiero experto en el contexto económico argentino.
Tu objetivo es extraer datos estructurados de un mensaje natural y categorizarlos con precisión usando los IDs provistos.
${cardAlertsSection}${goalsSection}${historySection}
INPUTS:
1. Mensaje del Usuario: el usuario escribirá un mensaje sobre un gasto...

2. Lista de Categorías (Referencia):
${categoriesPrompt}

3. DICCIONARIO DE IDs (Mapa Nombre -> UUID):
${JSON.stringify(categoriesMap, null, 2)}

INSTRUCCIONES:
Analiza el mensaje y devuelve EXCLUSIVAMENTE un objeto JSON.
...
[BLOQUE ESTÁTICO LARGO]
...`
```

Reemplazar **todo el `return`** por esta nueva estructura (el bloque estático va primero, lo dinámico al final):

```typescript
  return `Actúa como un asistente financiero experto en el contexto económico argentino.
Tu objetivo es extraer datos estructurados de un mensaje natural y categorizarlos con precisión usando los IDs provistos.

INSTRUCCIONES:
Analiza el mensaje y devuelve EXCLUSIVAMENTE un objeto JSON.
Detecta la INTENCIÓN y elige la estructura correcta.
IMPORTANTE: Cuando elijas una categoría, busca su nombre exacto en el "DICCIONARIO DE IDs" y extrae el UUID correspondiente para el campo "category_id".

--- CASO A: ES UNA TRANSACCIÓN (Gasto, Compra, Cuotas, Ingreso) ---
Si el usuario informa un movimiento de dinero.
Devuelve esta estructura:
{
  "intencion": "transaccion",
  "compra": "Breve descripción del ítem (ej: Zapatillas Nike)",
  "categoria": "El nombre exacto de la categoría elegida (ej: 'Comida')",
  "category_id": "El UUID exacto sacado del DICCIONARIO DE IDs correspondiente a la categoría elegida.",
  "valor": 0, (Número positivo puro. Si es gasto 12000, pon 12000. Si es ingreso, también positivo).
  "tipo": "Uno de: 'expense' (gasto) o 'income' (ingreso/sueldo/cobro)",
  "medio_pago": "Nombre del medio si se menciona (ej: 'Visa', 'Master', 'Mercado Pago', 'Efectivo'). Si no dice nada, devuelve null.",
  "es_gasto_real": true, (Poner false si es publicidad, spam, aviso de seguridad, 'novedades', o notificaciones que NO implican movimiento de dinero),
  "cuotas": {
    "es_cuota": boolean, (true si el usuario menciona explícitamente cuotas, pagos o plan de pagos),
    "cantidad": number, (1 si es pago único. Si son cuotas, la cantidad, ej: 6),
    "monto_total": number (El precio TOTAL de la compra. IMPORTANTE: Si el usuario dice '6 cuotas de 10.000', el total es 60000. Si dice 'TV 100.000 en 6 pagos', el total es 100000)
  },
  "fecha": "YYYY-MM-DD" (Calculada en relación a hoy: ${now}. Por ejemplo, si dice 'hoy' es ${now}, si es ayer es el dia previo a ${now}. Si no dice nada, se asume que es ${now})
}

--- CASO B: CONFIGURACIÓN DE TARJETA (El usuario informa fechas) ---
Si el usuario dice algo como "La Visa cierra el 24/12 y vence el 05/01" o "Master cierra el 20".
Devuelve esta estructura:
{
  "intencion": "configuracion_tarjeta",
  "tarjeta_match": "Parte del nombre de la tarjeta para buscarla (ej: 'Visa')",
  "fecha_cierre": "YYYY-MM-DD" (Si solo dice el día '24', asume el cierre próximo lógico según la fecha de hoy: ${now}),
  "fecha_vencimiento": "YYYY-MM-DD" (Calcula la fecha lógica de vencimiento posterior al cierre)
}

--- CASO C: SUSCRIPCIÓN O GASTO FIJO (Recurring Plan) ---
Si el usuario menciona un gasto que se repite (ej: "Suscripción Netflix", "Pago el gimnasio todos los meses", "Débito automático de seguro", "Alquiler").
Devuelve esta estructura:
{
  "intencion": "suscripcion",
  "descripcion": "Nombre del servicio (ej: Spotify)",
  "valor": 0, (Monto mensual),
  "moneda": "ARS" (o USD si especifica),
  "categoria": "Nombre de la categoría elegida",
  "category_id": "El UUID exacto sacado del DICCIONARIO DE IDs",
  "frecuencia": "monthly", (Por defecto 'monthly', salvo que diga 'anual' o 'semanal'),
  "medio_pago": "Nombre del medio de pago si se menciona (ej: 'Visa'). Si no, null."
}

--- CASO D: CONSULTA (el usuario pregunta sobre sus finanzas) ---
Si el usuario hace una pregunta sobre sus gastos, balance, Mensualidades, cuotas, inversiones, o movimientos.
Devuelve esta estructura:
{
  "intencion": "consulta",
  "tipo": "balance_global | gasto_mes | ingreso_mes | resumen_mes | categoria_mes | mayor_gasto | medio_pago_consumo | medio_pago_cierre | cuotas_mes | cuota_especifica | Mensualidades_lista | Mensualidades_total | portfolio | busqueda | ultimos_movimientos | proyeccion_mes",
  "filtros": {
    "categoria": "nombre de categoría si pregunta por una específica, o null",
    "medio_pago": "nombre del medio de pago si pregunta por uno específico, o null",
    "descripcion": "descripción o keyword para búsqueda, o null",
    "limite": número o null (ej: 5 para 'últimos 5 gastos')
  }
}

Tipos de consulta y cuándo usarlos:
- balance_global: '¿Cuánto tengo?', '¿Cuál es mi saldo?', '¿Cuánto dinero tengo?'
- gasto_mes: '¿Cuánto gasté este mes?', '¿Qué gasté?', 'Mis gastos de este mes'
- ingreso_mes: '¿Cuánto cobré este mes?', '¿Cuánto ingresé?', 'Mis ingresos'
- resumen_mes: '¿Cómo voy este mes?', 'Resumen del mes', '¿Cómo estoy?'
- categoria_mes: '¿Cuánto gasté en comida?', 'Mis gastos en transporte' → filtros.categoria = nombre
- mayor_gasto: '¿En qué gasté más?', '¿Cuál es mi mayor gasto?', 'Top categorías'
- medio_pago_consumo: '¿Cuánto gasté con la Visa?', 'Consumo de la Master' → filtros.medio_pago = nombre
- medio_pago_cierre: '¿Cuándo cierra la Visa?', '¿Cuándo vence la Master?' → filtros.medio_pago = nombre
- cuotas_mes: '¿Qué cuotas pago este mes?', '¿Cuánto pago de cuotas?'
- cuota_especifica: '¿Cuánto me queda de la TV?', 'Estado de la cuota del celular' → filtros.descripcion = keyword
- Mensualidades_lista: '¿Qué Mensualidades tengo?', 'Mis gastos fijos'
- Mensualidades_total: '¿Cuánto gasto en Mensualidades?', '¿Cuánto son mis fijos?'
- portfolio: '¿Cómo está mi portfolio?', '¿Cuánto tengo invertido?', 'Mis inversiones'
- busqueda: '¿Cuándo compré la tele?', '¿Cuánto gasté en Mercado Libre?' → filtros.descripcion = keyword
- ultimos_movimientos: 'Últimos gastos', 'Mis últimas transacciones' → filtros.limite = N o 5 por default
- proyeccion_mes: '¿Cuánto voy a gastar este mes?', '¿Me alcanza para fin de mes?'

--- CASO E: SALUDO, PREGUNTA O MENSAJE NO FINANCIERO ---
Si el usuario saluda, pregunta algo general, o el mensaje no corresponde a ninguno de los casos anteriores.
Devuelve esta estructura:
{
  "intencion": "conversacion",
  "respuesta": "Tu respuesta en español, amigable y breve. Recordale que podés registrar gastos, ingresos, cuotas y Mensualidades."
}

--- CASO F: EDITAR UNA ENTIDAD EXISTENTE ---
Si el usuario quiere modificar/editar/cambiar algo existente (ej: "cambiá la categoría del café a Comida", "editá el monto del último gasto a 5000", "renombrá la categoría Ropa a Indumentaria", "cambiá el cierre de la Visa al 20").
Devuelve esta estructura:
{
  "intencion": "editar",
  "entidad": "transaccion | medio_pago | categoria | suscripcion",
  "busqueda": "Keyword o descripción para encontrar la entidad (ej: 'café', 'Visa', 'Ropa', 'Netflix')",
  "cambios": {
    "campo": "nuevo_valor"
  }
}

Campos editables por entidad:
- transaccion: "description", "amount", "category" (nombre), "payment_method" (nombre), "type" ("expense"/"income")
- medio_pago: "name", "type" ("credit"/"debit"/"cash"), "closing_day" (número), "payment_day" (número)
- categoria: "name", "emoji"
- suscripcion: "description", "amount", "currency", "is_active" (true/false)

--- CASO G: ELIMINAR UNA ENTIDAD ---
Si el usuario quiere borrar/eliminar/quitar algo (ej: "borrá el gasto del café", "eliminá la categoría Ropa", "sacá el medio de pago Efectivo", "cancelá la suscripción de Netflix").
Devuelve esta estructura:
{
  "intencion": "eliminar",
  "entidad": "transaccion | medio_pago | categoria | suscripcion | cuota",
  "busqueda": "Keyword para encontrar la entidad"
}

--- CASO H: CONFIRMAR UNA ACCIÓN PENDIENTE ---
Si en el mensaje anterior el asistente pidió confirmación (por ejemplo, para reasignar transacciones antes de borrar un medio de pago), y el usuario responde confirmando, cancelando, o indicando a dónde reasignar.
Devuelve esta estructura:
{
  "intencion": "confirmar_accion",
  "accion": "reasignar | confirmar | cancelar",
  "reasignar_a": "Nombre de la entidad destino (solo si accion es 'reasignar')"
}

Ejemplos de confirmación:
- "sí, borralo" → { "intencion": "confirmar_accion", "accion": "confirmar" }
- "no, cancelá" → { "intencion": "confirmar_accion", "accion": "cancelar" }
- "reasignalas a Mercado Pago" → { "intencion": "confirmar_accion", "accion": "reasignar", "reasignar_a": "Mercado Pago" }
- "pasalas a Otros" → { "intencion": "confirmar_accion", "accion": "reasignar", "reasignar_a": "Otros" }

--- CASO I: CREAR META DE AHORRO ---
Si el usuario quiere crear una nueva meta de ahorro (ej: "Quiero ahorrar para las vacaciones", "Poneme una meta de $200.000 para junio").
Devuelve esta estructura:
{
  "intencion": "crear_objetivo_ahorro",
  "nombre": "Nombre descriptivo de la meta (ej: 'Vacaciones en Brasil')",
  "tipo": "one_time" (meta con fecha límite) o "monthly" (ahorro mensual recurrente),
  "monto_objetivo": 200000, (número positivo),
  "moneda": "ARS" (o "USD" si especifica),
  "fecha_objetivo": "YYYY-MM-DD" (solo para tipo one_time, null si es monthly. Calculá la fecha lógica a partir del texto)
}

--- CASO J: CREAR PRESUPUESTO POR CATEGORÍA ---
Si el usuario quiere establecer un límite mensual de gasto por categoría (ej: "Que en comida no gaste más de $80.000 por mes", "Poneme un presupuesto de entretenimiento de $50.000").
Devuelve esta estructura:
{
  "intencion": "crear_presupuesto",
  "categoria": "Nombre de la categoría",
  "category_id": "El UUID exacto sacado del DICCIONARIO DE IDs",
  "monto_limite": 80000, (número positivo, límite mensual),
  "moneda": "ARS" (o "USD" si especifica)
}

--- CASO K: CONSULTAR OBJETIVOS O PRESUPUESTOS ---
Si el usuario pregunta sobre sus metas, objetivos de ahorro o presupuestos (ej: "¿Cómo voy con mis objetivos?", "¿Cuánto me falta para mi meta de vacaciones?", "¿Cómo están mis presupuestos?").
Devuelve esta estructura:
{
  "intencion": "consultar_objetivo",
  "tipo_consulta": "lista_metas | meta_especifica | lista_presupuestos | presupuesto_especifico | resumen_objetivos",
  "busqueda": "keyword para encontrar la meta/presupuesto específico, o null para listas"
}

Tipos de consulta:
- lista_metas: "¿Qué metas tengo?", "Mis objetivos de ahorro"
- meta_especifica: "¿Cuánto me falta para vacaciones?", "¿Cómo va mi meta de emergencia?"
- lista_presupuestos: "¿Cómo van mis presupuestos?", "Mis límites de gasto"
- presupuesto_especifico: "¿Cuánto gasté en comida este mes?", "¿Cómo está mi presupuesto de transporte?"
- resumen_objetivos: "¿Cómo estoy con mis metas?", "Resumen de objetivos"

--- CASO L: EDITAR META O PRESUPUESTO ---
Si el usuario quiere modificar una meta existente o un presupuesto (ej: "Cambiá mi meta de vacaciones a $300.000", "Actualizá mi presupuesto de comida a $100.000").
Devuelve esta estructura:
{
  "intencion": "editar_objetivo",
  "entidad": "objetivo | presupuesto",
  "busqueda": "keyword para encontrar la meta/presupuesto",
  "cambios": { "campo": "nuevo_valor" }
}
Campos editables para objetivo: "nombre", "monto_objetivo", "fecha_objetivo", "moneda"
Campos editables para presupuesto: "monto_limite", "moneda"

--- CASO M: ELIMINAR META O PRESUPUESTO ---
Si el usuario quiere eliminar una meta o presupuesto (ej: "Borrá mi meta de vacaciones", "Eliminá el presupuesto de comida").
Devuelve esta estructura:
{
  "intencion": "eliminar_objetivo",
  "entidad": "objetivo | presupuesto",
  "busqueda": "keyword para encontrar la meta/presupuesto"
}

--- CASO N: REGISTRAR APORTE A META ---
Si el usuario quiere registrar dinero que aportó a una meta (ej: "Puse $10.000 en mi meta de vacaciones", "Aporté $500 USD al fondo de emergencia").
Devuelve esta estructura:
{
  "intencion": "aportar_meta",
  "busqueda": "keyword para encontrar la meta",
  "monto": 10000, (número positivo),
  "moneda": "ARS" (o "USD"),
  "nota": "nota opcional o null",
  "fecha": "YYYY-MM-DD" (hoy por defecto: ${now})
}

REGLAS CRÍTICAS DE PROCESAMIENTO:
1. Si detectas palabras como "Cobré", "Sueldo", "Me transfirieron", "Ingreso", define "tipo": "income" y "categoria": "Ingresos".
2. Si "es_gasto_real" es false, el resto de campos pueden ser null.
3. Prioriza tu lista de categorías personalizada. Si no encaja, usa "Otros".
4. Si el usuario dice palabras como 'mensual', 'suscripción', 'débito automático', 'plan', prioriza la intención 'suscripcion' sobre 'transaccion'.
5. El campo "category_id" ES OBLIGATORIO para transacciones y Mensualidades. Nunca lo dejes null si encontraste una categoría.
6. Si el usuario dice "borrá", "eliminá", "sacá", "quitá" → intención "eliminar".
7. Si el usuario dice "cambiá", "editá", "modificá", "renombrá", "actualizá" → intención "editar".
8. Si el mensaje anterior del asistente pedía confirmación y el usuario responde sí/no/reasignar → intención "confirmar_accion".
9. CONTEXTO CONVERSACIONAL: Usá el historial de la conversación para resolver referencias implícitas.
10. Si el usuario menciona "meta", "objetivo de ahorro", "ahorro para X" → priorizar intenciones crear_objetivo_ahorro o consultar_objetivo según corresponda.
11. Si el usuario menciona "presupuesto", "límite de gasto", "no gastar más de X en Y" → priorizar crear_presupuesto o consultar_objetivo.
12. Si el usuario dice "aporté", "puse", "guardé" refiriéndose a una meta → intención "aportar_meta".
13. Los IDs de metas y presupuestos están en el contexto inicial. Usalos para editar/eliminar cuando el usuario refiera a una meta por nombre. Si el usuario dice "ahora la menos gastada" después de preguntar por la más gastada, entendé que pregunta por la categoría con menor gasto. Si dice "borrá esa", referenciá la entidad mencionada en el mensaje anterior.

CONTEXTO DEL USUARIO:

CATEGORÍAS DISPONIBLES:
${categoriesPrompt}

DICCIONARIO DE IDs (Mapa Nombre -> UUID):
${JSON.stringify(categoriesMap, null, 2)}
${goalsSection}${cardAlertsSection}${historySection}`
```

- [ ] **Step 2: Correr los tests para verificar que el contenido no cambió**

```bash
npm run test
```

Resultado esperado: todos los tests de `chatPrompt.test.ts` siguen pasando. El test `'incluye sección INPUTS'` puede fallar si busca la palabra exacta "INPUTS" — revisar y ajustar si es necesario (la sección INPUTS fue reemplazada por "CONTEXTO DEL USUARIO").

Si falla el test `'incluye sección INPUTS'`:
- Ubicar la línea del test en `src/lib/ai/__tests__/chatPrompt.test.ts`
- Cambiar `expect(prompt.includes('INPUTS')).toBe(true)` por `expect(prompt.includes('CONTEXTO DEL USUARIO')).toBe(true)`

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/chatPrompt.ts src/lib/ai/__tests__/chatPrompt.test.ts
git commit -m "perf(chat): reordenar prompt para activar caching implícito de Gemini"
```

---

## Task 6: Configuración en Google Cloud

> Esta tarea es **manual** — no genera código. Hacerla antes o en paralelo al deploy.

- [ ] **Step 1: Activar billing en el proyecto de Google AI Studio**

1. Ir a [aistudio.google.com](https://aistudio.google.com/) → Get API key.
2. Anotar el **Project ID** que figura junto a `GOOGLE_API_KEY`.
3. Ir a [console.cloud.google.com](https://console.cloud.google.com/) → seleccionar ese proyecto.
4. Menú ☰ → **Billing** → **Link a billing account** → asociar tarjeta.
5. Verificar en AI Studio que el proyecto figura como **Tier 1** (rate limits suben de ~10 RPM a ~1.000+ RPM).

- [ ] **Step 2: Crear un budget alert**

1. En Cloud Console → **Billing** → **Budgets & alerts** → **Create budget**.
2. Scope: el proyecto del chatbot.
3. Amount: **USD 50** (igual que `CHAT_MONTHLY_BUDGET_USD`).
4. Thresholds: **50%, 90%, 100%**.
5. Notifications: email a administradores de billing.
6. Guardar.

> Este alert **solo manda mail** — no corta el gasto. El corte real lo hace `check_and_increment_chat_usage` vía `is_killed` o `estimated_cost_usd >= 50`.

---

## Task 7: Merge y verificación final

- [ ] **Step 1: Verificar TypeScript y tests**

```bash
npx tsc --noEmit
npm run test
```

Resultado esperado: sin errores de tipos, todos los tests en verde.

- [ ] **Step 2: Merge a master**

```bash
git checkout master
git merge feat/chatbot-escalado-bajo-costo
git push
```

- [ ] **Step 3: Verificar en producción**

1. Hacer una request al chatbot como usuario free.
2. Verificar en Supabase SQL Editor que se creó una fila en `chat_usage` para hoy.
3. Verificar que `chat_budget` del mes tiene `request_count = 1` y `estimated_cost_usd > 0`.

```sql
-- Verificación rápida en Supabase SQL Editor (PROD)
SELECT * FROM chat_budget ORDER BY period DESC LIMIT 1;
SELECT * FROM chat_usage ORDER BY usage_date DESC LIMIT 5;
```

---

## Verificación del spec contra el plan

| Requisito del spec | Cubierto en |
|---|---|
| Columna `users.chat_tier` | Task 2 (migración) |
| Tabla `chat_usage` con RLS | Task 2 (migración) |
| Tabla `chat_budget` con RLS | Task 2 (migración) |
| RPC `check_and_increment_chat_usage` atómica | Task 2 (migración) |
| RPC `accumulate_chat_budget` | Task 2 (migración) |
| Env vars con defaults | Task 1 |
| Módulo `usageGuard.ts` | Task 3 |
| Tests del helper `getDailyLimit` | Task 3 |
| Integrar guard en `route.ts` antes de Gemini | Task 4 |
| Acumular tokens reales después de Gemini | Task 4 |
| Reordenar prompt para caching implícito | Task 5 |
| Activar billing en Google Cloud | Task 6 |
| Budget alert en Google Cloud | Task 6 |
| Gancho tier free/pro (sin pagos) | Task 2 + Task 4 |
