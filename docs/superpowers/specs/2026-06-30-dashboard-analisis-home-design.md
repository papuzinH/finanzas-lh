# Dashboard de Análisis en la Home — Diseño

**Fecha:** 2026-06-30
**Estado:** Aprobado (brainstorming) — pendiente de plan de implementación

## Problema

La sección "Análisis" de la home tiene gráficos que se sienten **estáticos y poco útiles**. El diagnóstico del código muestra que el problema **no es la librería**: los tres bloques principales (`Gastos Globales`, `Gastos este Mes`, `Variación por Categoría`) no usan Recharts — son `<div>`s con barras de progreso hechas a mano. Recharts ya está instalado y bien themeado (`TrendChart`, sparklines de `MetricRow`), solo está sub-utilizado. Además, para un usuario que maneja finanzas en **Argentina**, comparar pesos nominales entre meses miente (inflación), y el dashboard no aprovecha la infraestructura de dólar que ya existe en el store.

## Objetivo

Rediseñar la sección de análisis de la home como un **módulo de análisis real**, moderno y con buenas animaciones, adaptado al contexto financiero argentino, que responda cuatro preguntas de un vistazo y se vea bien en mobile (canvas base 392px).

## Alcance

**Incluye:**
- Reorganizar la sección "Análisis" de la home en un contenedor con **tabs internos** (control segmentado) + **toggle global ARS/USD**.
- Tres tabs, cada uno respondiendo una pregunta, con gráficos interactivos (tap → drill-down usando el `Modal` existente).
- Cuatro adaptaciones argentinas: lente USD, ajuste por inflación (IPC), costo real de cuotas, exposición ARS/USD.
- Capa de movimiento premium (Framer Motion) como **requisito**, no como extra.
- Nueva lógica de negocio en el store (getters), respetando la regla del proyecto: toda suma/cálculo va en el store, nunca en componentes.

**No incluye:**
- Nueva ruta ni cambios en la navegación (la nav mobile ya tiene 6 ítems; todo vive en la home).
- Sumar librerías de charting nuevas (Nivo/Tremor). Se usa **Recharts + Framer Motion + CSS**.
- Rediseñar `BalanceCard`, `MetricRow`, `InsightsCarousel`, `BudgetOverviewStrip` (se mantienen).

## Decisiones tomadas

| Decisión | Elección |
|---|---|
| Dónde vive | Home enriquecida con tabs internos (sin tocar nav) |
| Librería | Recharts + Framer Motion + CSS (nada nuevo) |
| Distribución del gasto | **Treemap** (área proporcional) |
| "Términos reales" | **Ambos**: toggle USD + ajuste explícito por IPC |
| Gráfico "cómo voy" | **Línea de ritmo + proyección** a fin de mes |
| Frecuencia histórica | **Heatmap** (CSS) de cantidad de gastos por categoría/mes |

## Arquitectura

### Estructura de la sección (3 tabs)

Un contenedor `AnalysisSection` reemplaza la actual "SECCIÓN B: ANÁLISIS VISUAL" de `src/app/page.tsx`. Usa `TabsDS` (ya existe) para el control segmentado y expone un toggle ARS/USD en su header. Cada tab es un componente aislado.

**Tab 1 · "Este mes"** → *¿Cómo voy?*
- **Ritmo de gasto** (héroe): línea de gasto acumulado por día del mes + proyección punteada a fin de mes + línea de referencia (ingreso del mes). `LineChart` + `ReferenceLine`.
- **Costo real de cuotas** (tarjeta AR): monto restante en cuotas, su valor en USD hoy, y cuánto licuó la inflación desde la compra. Reencuadra la deuda en cuotas como estrategia.

**Tab 2 · "Tendencia"** → *¿Estoy mejorando o empeorando?*
- **Ingreso vs Gasto 6 meses** (héroe): `AreaChart` (evoluciona el `TrendChart` existente), sensible al toggle ARS/USD.
- **Tasa de ahorro mensual**: `BarChart`, derivado de `net/income` por mes.
- **Ajuste real por IPC**: chip/indicador "tus gastos +X% vs IPC +Y% = ±Z% real" y línea "gasto real deflactado". Se apoya en la nueva serie de inflación.

**Tab 3 · "Categorías"** → *¿En qué se me va la plata?*
- **Distribución del gasto** (héroe): `Treemap` de Recharts, con % y monto por bloque, tap → detalle de categoría.
- **Frecuencia por categoría** (histórico): heatmap en CSS (grilla de celdas) que muestra *cuántas veces* se gastó en cada categoría por mes.
- **Exposición ARS/USD**: barra split que muestra qué parte del gasto está dolarizada. Sensible al toggle.

### Toggle global ARS/USD

Se agrega un slice al store: `displayCurrency: 'ARS' | 'USD'` + acción `setDisplayCurrency`. Los getters que devuelven montos para estos gráficos aceptan/leen ese estado y convierten usando la lógica de tasas ya existente (`resolveRate` / `getExchangeRate`, dólar blue/MEP). Default `'ARS'`. El toggle vive en el header de `AnalysisSection`.

### Componentes nuevos

Todos client components (`'use client'`), leen del store, cero fetch directo.

```
src/components/dashboard/analysis/
  analysis-section.tsx          # orquestador: TabsDS + toggle ARS/USD
  tab-este-mes.tsx
  tab-tendencia.tsx
  tab-categorias.tsx
  charts/
    spending-pace-chart.tsx     # LineChart + ReferenceLine + proyección
    category-treemap.tsx        # Recharts Treemap
    frequency-heatmap.tsx       # grilla CSS
    savings-rate-bars.tsx       # BarChart
  cards/
    installments-real-cost-card.tsx
    currency-exposure-card.tsx
```

Se **reutiliza/potencia** `trend-chart.tsx` (ya usa `AreaChart`). Se **elimina** `src/components/dashboard/expenses-chart.tsx` (huérfano, colores viejos `slate-*`, no importado en ningún lado).

### Store: getters nuevos / modificados

Siguiendo la regla del proyecto (lógica en el store). Reutilizar lo existente donde se pueda:

- **`displayCurrency` + `setDisplayCurrency`** — slice de estado del toggle.
- **`getMonthlySpendingPace()`** — gasto acumulado por día del mes + proyección a fin de mes + ingreso de referencia. Reutiliza la lógica de `projectedTotal`/`currentConsumption` ya presente en `getPaymentMethodStatus`.
- **`getCategoryFrequency(months?)`** — matriz categoría × mes con el *conteo* de transacciones (no el monto). Nuevo.
- **`getInstallmentsRealCost()`** — restante nominal en cuotas, valor USD hoy, y estimación de licuación por inflación/dólar desde la compra. Nuevo; usa fecha de compra de los planes de cuotas + serie de dólar/IPC.
- **`getSavingsRateSeries(months?)`** — tasa de ahorro por mes. Derivable de `getMonthlyTrend` (`net/income`); puede ser un wrapper.
- **`getCurrencyExposure(scope)`** — split ARS vs USD del gasto. Se apoya en `usdExpenses` (ya calculado en `getPaymentMethodStatus`) y `getMonthlyLiquidityBreakdown`.
- **Conversión display-aware** — los getters de treemap/tendencia deben poder devolver montos convertidos según `displayCurrency`. Exponer un helper reutilizando `resolveRate`.

Getters existentes reutilizados tal cual: `getMonthlyTrend`, `getCategoryBreakdown`, `getCategoryComparison`, `getMonthlyIncome`, `getCurrentMonthInstallmentsTotal`, `getExchangeRate`.

### Inflación (IPC) — nueva fuente externa

- En `fetchAllData`, agregar un fetch **non-blocking** a la API pública de ArgentinaDatos (IPC mensual), con el mismo patrón que el fetch de dólar blue (try/catch, opcional, no rompe el `Promise.all`).
- Nuevo estado `inflationSeries` en el store + getter `getInflationSeries()`.
- Getter `getRealAdjustedTrend(months?)` que deflacta la serie nominal usando el IPC acumulado, para la comparación "real vs nominal" del tab Tendencia.
- **Degradación elegante**: si la API de IPC falla o no hay datos, el tab Tendencia oculta el chip "real (IPC)" y cae a la lente USD (que ya neutraliza inflación de forma implícita). El toggle ARS/USD nunca depende del IPC.

## Flujo de datos

```
Server Component (page.tsx server boundary)
   └─ (client) DashboardPage
        └─ fetchAllData()  →  Supabase + dólar blue + IPC (non-blocking)
             └─ store (getters puros)
                  └─ AnalysisSection (lee displayCurrency + getters)
                       ├─ TabEsteMes     → getMonthlySpendingPace, getInstallmentsRealCost
                       ├─ TabTendencia   → getMonthlyTrend, getSavingsRateSeries, getRealAdjustedTrend
                       └─ TabCategorias  → getCategoryBreakdown, getCategoryFrequency, getCurrencyExposure
```

Cada gráfico interactivo abre un `Modal` (patrón ya usado en la home) con el detalle. El toggle ARS/USD actualiza `displayCurrency` en el store y todos los gráficos re-renderizan.

## Capa de movimiento (requisito)

Con Framer Motion (ya dependencia) + animaciones nativas de Recharts + CSS:
- Entrada escalonada (stagger) de las cards del tab activo.
- Count-up de montos y porcentajes clave.
- Treemap que aparece bloque por bloque.
- Barras que crecen desde 0; líneas que se dibujan (stroke-dashoffset / animación Recharts).
- Cross-fade en el cambio de tab.
- Feedback al tocar (scale), consistente con el resto de la app.
- Respetar `prefers-reduced-motion`.

## UI / tokens

- Tokens semánticos siempre: `bg-surface`, `border-border`, `text-text/muted`, `text-good/bad/warn`, acento. Nada de `emerald-*`, `slate-*`, etc.
- Cards `rounded-2xl bg-surface border-[1.5px] border-border shadow-card`; `<Card>`, `<TabsDS>`, `<Chip>`, `<ProgressBar>` del design system.
- `font-poster` + `tnum` para montos; `font-sans` para labels.
- Mobile-first: `px-5`, touch targets ≥44px, `pb-28` para clearear BottomNav. Charts con `ResponsiveContainer`.

## Manejo de errores / estados vacíos

- **Sin datos suficientes** (<2 meses para tendencia/comparación, sin cuotas, sin gasto USD): estados vacíos con copy claro (patrón ya usado en `CategoryComparison`/`TrendChart`).
- **Falla dólar**: fallback a nominal ARS; el toggle USD queda deshabilitado con hint.
- **Falla IPC**: se oculta el ajuste "real" y se usa la lente USD; sin romper la vista.
- **Fetch no bloqueante**: IPC e dólar nunca frenan la carga principal (`Promise.all` tolerante).

## Testing / verificación

El proyecto no tiene tests configurados. Los getters nuevos se diseñan como funciones puras y testeables (entrada → salida) por si se agregan tests luego. Verificación manual con el flujo `/run` sobre `npm run dev`, revisando cada tab en viewport mobile (392px) y el toggle ARS/USD. `npm run lint` y `npm run build` deben pasar.

## Riesgos / notas

- **Sobrecarga de UI**: "Ambos" (USD + IPC) suma densidad. Mitigación: el IPC vive solo en el tab Tendencia como chip/indicador secundario, no compite con el héroe.
- **Dependencia externa IPC**: mitigada por degradación elegante a lente USD.
- **Precisión de licuación de cuotas**: es una estimación (depende de fecha de compra y proxy dólar/IPC); comunicar como aproximación, no como cifra exacta.
- **Schema**: si `getInstallmentsRealCost` necesita fecha de compra y no está disponible, evaluar si requiere cambio de schema (aplicar a PROD antes del merge, según CLAUDE.md).
```
