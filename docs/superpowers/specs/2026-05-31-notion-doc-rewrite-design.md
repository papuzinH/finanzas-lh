---
name: notion-doc-rewrite
description: Diseño para la reescritura completa de la documentación interna de Chanchito en Notion, con estado actualizado del proyecto y exploración del modelo de negocio
metadata:
  type: project
---

# Reescritura de Documentación Interna — Chanchito

## Contexto

La documentación actual en Notion (https://www.notion.so/CHANCHITO-329088646eee8173ad01e5ad8e28cf2c) está desactualizada. Le faltan funcionalidades implementadas, tablas de la DB, y no tiene una sección de modelo de negocio explorada.

**Objetivo:** Documentación de referencia interna para el propio desarrollador. Que permita ponerse al día rápidamente después de semanas sin tocar el proyecto. No es para inversores ni público externo.

---

## Estructura — Enfoque "Producto + Técnica + Negocio"

Tres bloques bien separados, cada uno con propósito claro.

---

## Bloque 1: Producto

### Qué es Chanchito

App web de finanzas personales (PWA) orientada al mercado argentino. Permite registrar gastos e ingresos, gestionar cuotas y Mensualidades, hacer seguimiento de inversiones y metas de ahorro — todo desde una interfaz mobile-first. Incluye un chatbot con IA (Gemini) para registrar y consultar datos por lenguaje natural y voz.

**Estilo visual:** en proceso de redefinición (branding en desarrollo).

---

### Pantallas implementadas

| Pantalla | Descripción |
|---|---|
| **Dashboard** (`/`) | Balance global, ingresos/gastos del mes, burn rate, gráfico de tendencia mensual, comparador de categorías, carrusel de insights, banner de tarjeta incompleta, banner de ahorro de fin de mes, últimos movimientos, overview de presupuestos |
| **Movimientos** (`/movimientos`) | CRUD completo de transacciones con filtros por mes, medio de pago y categoría. Soporte ARS y USD con snapshot del tipo de cambio al momento del gasto |
| **Compromisos** (`/compromisos`) | Cuotas y mensualidades unificadas en una pantalla con tabs. Gestión de planes de cuotas (progreso, cuotas pagadas/restantes) y Mensualidades recurrentes (toggle activo/inactivo, burn rate, íconos de servicio) |
| **Categorías** (`/categorias`) | Sistema de categorías predefinidas + personalizadas con emoji y descripción |
| **Medios de pago** (`/medios-pago`) | Tarjetas de crédito (con ciclos de cierre y vencimiento), débito y efectivo. Tracking de consumo por ciclo |
| **Inversiones** (`/inversiones`) | Portfolio bimonetario (ARS/USD) con tabs: dashboard de métricas, lista de activos y carga rápida. Precios en tiempo real, ganancia/pérdida, distribución por tipo de activo, barra de estado de precios, card de ahorro |
| **Objetivos** (`/objetivos`) | Metas de ahorro one-time y mensuales con contribuciones y barra de progreso. Presupuestos por categoría con alertas visuales (ok / warning 75% / excedido 100%) |
| **Ajustes** (`/ajustes`) | Configuración centralizada: medios de pago y categorías |
| **Perfil** (`/ajustes/perfil`) | Info de usuario, avatar, sign out |
| **Onboarding** (`/onboarding`) | Wizard con slides + chat conversacional con IA para configurar nombre, categorías y medios de pago |

---

### Chatbot integrado

FAB flotante (fullscreen mobile, panel lateral desktop). Input por texto y voz (Web Speech API, es-AR). Modelo: **Gemini 2.5 Flash**.

**Intents soportados:**

| Categoría | Intents |
|---|---|
| Registro | Gasto, ingreso, cuota, suscripción |
| Consulta | Balance global, gastos del mes, ingresos, resumen, mayor gasto, consumo por medio de pago, cuotas del mes, cuota específica, Mensualidades, portfolio, últimos movimientos, proyección del mes, búsqueda |
| CRUD | Editar y eliminar transacciones, medios de pago, categorías, Mensualidades |
| Objetivos | Crear objetivo, contribuir, consultar progreso, crear presupuesto, consultar presupuesto |
| Confirmaciones | Reasignación o eliminación de entidades con dependencias |

**Sistema de cuotas (freemium ya implementado):**
- Free: 30 mensajes/día
- Pro: 300 mensajes/día
- Tracking de costo por usuario (`chat_usage`) + techo global mensual (`chat_budget`)

---

### PWA & Extras

- Instalable como app standalone
- Tour guiado sincronizado con Supabase (`tour_completed` en users)
- Pull-to-refresh, skeleton loaders, confirmaciones visuales de operaciones
- Onboarding conversacional con IA

---

## Bloque 2: Técnica

### Tech Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Server Components) |
| Lenguaje | TypeScript 5 |
| Runtime | React 19 |
| UI | Tailwind CSS 4 + shadcn/ui + Radix UI + Lucide React |
| State | Zustand 5 |
| Base de datos | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (Google OAuth) |
| Charts | Recharts 3 |
| Tablas | TanStack Table |
| IA | Google Gemini 2.5 Flash |
| Forms | React Hook Form + Zod 4 |
| Animación | Framer Motion |
| PWA | @ducanh2912/next-pwa |

---

### Arquitectura

- `app/` → Server Components por defecto. `'use client'` solo si se necesitan hooks o event listeners.
- Server Components: fetch con `utils/supabase/server.ts`.
- Client Components: NUNCA fetch directo — solo `useFinanceStore`.
- Prohibido: `useEffect` para fetching, SWR, React Query.
- `fetchAllData()` → Promise.all desde Supabase + API dólar blue (non-blocking).
- Lógica de negocio (sumas, cálculos, porcentajes) va en el store, NO en componentes.

---

### Store — Getters (`lib/store/financeStore.ts`)

| Getter | Descripción |
|---|---|
| `getPortfolioStatus(currency?)` | Portfolio de inversiones (ARS/USD_MEP/USD_CCL/USDT) |
| `getPortfolioDistribution()` | Distribución por tipo de activo |
| `getGlobalBalance()` | Balance total disponible |
| `getGlobalIncome()` | Ingresos totales |
| `getGlobalEffectiveExpenses()` | Gastos efectivos totales |
| `getExchangeRate(pair)` | Cotización de un par (USD_MEP, USD_CCL, etc.) |
| `getMonthlyBurnRate()` | Suma de Mensualidades activas |
| `getMonthlyIncome()` | Ingresos del mes actual |
| `getMonthlyVariableExpenses()` | Gastos variables del mes |
| `getMonthlyExpensesBreakdown()` | Desglose: variables + cuotas + burn rate |
| `getMonthlyComparison(monthStr?)` | Comparación mes actual vs anterior |
| `getMonthlyTrend(months?)` | Tendencia de N meses (para gráficos) |
| `getInstallmentStatus(planId)` | Progreso de un plan de cuotas |
| `getPaymentMethodStatus(methodId)` | Ciclo tarjeta crédito vs débito/efectivo |
| `getExpensesByCategory(scope)` | Desglose por categoría (global o mes actual) |
| `getMonthlyBalance(monthStr, methodId)` | Balance mensual por medio de pago |
| `getPaymentMethodTransactionsForCurrentMonth(methodId)` | Transacciones del mes para un medio |

---

### Modelo de Datos

| Tabla | Campos principales | Relaciones |
|---|---|---|
| `users` | id (UUID), auth_user_id, first_name, onboarding_completed, tour_completed | — |
| `categories` | name, emoji, description, is_system | → users |
| `payment_methods` | name, type (credit/debit/cash), closing_day, payment_day, is_personal | → users |
| `transactions` | description, amount, date, type (expense/income), currency, usd_amount, ars_at_time | → categories, payment_methods, installment_plans, recurring_plans |
| `installment_plans` | description, total_amount, installments_count, purchase_date | → payment_methods, categories |
| `recurring_plans` | description, amount, frequency, is_active, currency, usd_amount, ars_at_time | → payment_methods, categories |
| `investments` | (legacy) ticker, name, type, quantity, avg_buy_price, currency | → users |
| `investment_assets` | ticker, name, asset_type (stock/cedear/bond/crypto/fci/etc.), currency | → auth.users |
| `investment_transactions` | type (buy/sell/dividend/coupon/interest), quantity, price_per_unit, total_amount, fees, currency, date | → investment_assets, auth.users |
| `exchange_rates` | pair (USD_MEP/USD_CCL/USDT/etc.), rate, source, last_update | — |
| `market_prices` | ticker, last_price, last_update (bimonetario) | — |
| `savings` | amount, currency, date | → users |
| `internal_transfers` | (surplus mensual entre meses) | → users |
| `savings_goals` | name, type (one_time/monthly), target_amount, currency, target_date, is_active | → users |
| `savings_goal_contributions` | goal_id, amount, currency, note, date | → savings_goals, users |
| `category_budgets` | category_id, amount, currency, is_active | → categories, users |
| `chat_usage` | user_id, usage_date, request_count | → users |
| `chat_budget` | period (YYYY-MM), request_count, input_tokens, output_tokens, estimated_cost_usd | — |

---

### Fórmula del Balance Global

```
Balance = Total Ingresos
        - Gastos Variables (sin cuotas ni Mensualidades)
        - Cuotas del Mes (respeta ciclo de tarjeta)
        - Burn Rate (Mensualidades activas del mes)
```

Centralizada en `financeStore.ts → getGlobalBalance()`.

---

### Fechas y ciclos de tarjeta

- `periodDate` → fecha visual para agrupación mensual (puede diferir de la real)
- `realPaymentDate` → fecha real de transacción
- `isExpenseInCurrentMonthScope()` → determina pertenencia al mes según ciclo cierre/pago
- Siempre usar `parseLocalDate()` de `lib/utils/dates.ts` (evita bugs UTC)

---

### Comandos

```bash
npm run dev      # Desarrollo (Turbopack)
npm run build    # Producción (Webpack)
npm run lint     # ESLint
```

Deploy: `master` → producción automática en Vercel (Supabase PROD). Cambios de schema SQL: aplicar a PROD antes del merge.

---

## Bloque 3: Negocio

### Modelo Freemium — Opciones a explorar

El sistema de tiers (free/pro) ya está implementado a nivel de infraestructura. Lo que está pendiente es decidir exactamente qué diferencia ambos tiers.

---

**Opción 1 — Chatbot como puerta de entrada Pro**

El chat con IA es el feature más diferencial. Free accede a todo pero con límite diario de mensajes; Pro tiene un límite mucho más alto.

| | Free | Pro |
|---|---|---|
| Todas las pantallas | ✅ | ✅ |
| Chat con IA | 30 msgs/día | 300 msgs/día |
| Precio | $0 | A definir |

✅ Ya implementado técnicamente.
✅ El diferencial es el feature más visible y valioso.
⚠️ Usuarios que no usan el chat nunca tienen incentivo para pagar.

---

**Opción 2 — Volumen de datos**

Modelo SaaS clásico: Free tiene límites de uso (transacciones, medios de pago); Pro es ilimitado y además incluye chatbot sin límite.

| | Free | Pro |
|---|---|---|
| Transacciones/mes | Hasta 50 | Ilimitadas |
| Medios de pago | Hasta 2 | Ilimitados |
| Chat con IA | Limitado | Sin límite |
| Precio | $0 | A definir |

✅ Modelo predecible y familiar.
⚠️ Fricción desde el día 1 para usuarios casuales.
⚠️ Requiere implementar gates de límite en la UI.

---

**Opción 3 — Features premium por módulo**

Los módulos más avanzados son Pro. Muchas features del roadmap encajan naturalmente como Pro (exportación, reportes, notificaciones, GPS).

| | Free | Pro |
|---|---|---|
| Dashboard + Movimientos + Categorías | ✅ | ✅ |
| Compromisos (cuotas + Mensualidades) | ✅ | ✅ |
| Inversiones | ❌ | ✅ |
| Objetivos & Presupuestos | ❌ | ✅ |
| Exportación CSV/PDF | ❌ | ✅ |
| Notificaciones push | ❌ | ✅ |
| Reportes de tendencias | ❌ | ✅ |
| Chat con IA | Limitado | Sin límite |
| Precio | $0 | A definir |

✅ Hay muchas features Pro naturales en el roadmap.
✅ Usuarios Free tienen valor real desde el día 1.
⚠️ Hay que decidir el corte antes del lanzamiento.
⚠️ Más trabajo de implementación de gates.

---

### Ideas de pricing (referencia)

- ~$ARS 3.000–6.000/mes o ~USD 3–5/mes para el plan Pro
- Descuento anual (2 meses gratis) para reducir churn
- Trial de 14 días Pro gratis en el registro

---

### Roadmap por Fases

#### Fase 3.0 — Estabilización (inmediato, ~1-2 semanas)
| Tarea | Detalle |
|---|---|
| Correcciones en Inversiones | Bugs y mejoras pendientes del módulo |
| Chatbot más inteligente | Ampliar consultas financieras, mejor contexto |
| Ajustes de UX | Fixes menores de interfaz y flujos |
| RLS en producción | Ejecutar migración pendiente + backfill auth_user_id |

#### Fase 3.1 — Diferencial "Chanchito no olvida" (~4-6 semanas)
El diferenciador de mercado antes de ir a Play Store.

| Orden | Feature | Complejidad | Impacto |
|---|---|---|---|
| 1 | Foto de ticket (Gemini Vision) | Baja | Alto |
| 2 | Detección de gastos por mail (Gmail OAuth) | Media | Muy alto |
| 3 | Notificaciones push inteligentes | Baja | Alto |
| 4 | Importación resumen tarjeta PDF | Media | Alto |

Motor de deduplicación centralizado para todos los canales.

#### Fase 3.2 — Play Store (~2-3 semanas, depende de 3.1)
TWA / Capacitor, assets de tienda, Privacy Policy + ToS, beta cerrada (10-20 usuarios).

#### Fase 3.3 — Features Avanzadas (post Play Store)
Exportación CSV/PDF, reportes de tendencias, GPS/lugares, detección de patrones, multi-usuario.

---

### Bugs conocidos

| Severidad | Bug |
|---|---|
| ⚠️ Medio | Sin manejo de errores granular en n8n (sin retry si falla Postgres) |
| ⚠️ Medio | Portfolio no avisa si datos de mercado tienen >24hs |
| ⚠️ Medio | Sin check de duplicados en categorías |
| ⚠️ Medio | Borrar plan de cuotas elimina todo el historial sin undo |
| ⚠️ Medio | Dólar blue falla silenciosamente sin red |

---

### Ideas futuras (sin desarrollar)

- GPS / detección de lugares visitados — registrar dónde se gastó
- Detección automática de patrones de gasto (requiere ≥30 días de historial)
- Multi-usuario — compartir finanzas entre parejas o grupos
- Light mode — toggle de tema claro
- Compartir gastos — split básico entre personas
- Landing page pública con CTA de registro
- Tests e2e (Cypress o Playwright)
- Análisis de tendencias con proyecciones a futuro
- Integración con bancos argentinos (scraping / open banking si existe)
- Widget iOS/Android con balance del día
