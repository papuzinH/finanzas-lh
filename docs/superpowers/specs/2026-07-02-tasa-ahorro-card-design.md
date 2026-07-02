# Card "Tasa de ahorro mensual" — Diseño

**Fecha:** 2026-07-02
**Estado:** Aprobado (brainstorming) — pendiente de plan de implementación

## Problema

La card "Tasa de ahorro mensual" (tab "Tendencia" de `AnalysisSection`, `src/components/dashboard/analysis/tab-tendencia.tsx:34-37`) muestra un `BarChart` de 6 meses (`SavingsRateBars`) sin ningún número visible, sin interacción y sin referencia de qué es "bueno" o "malo". El usuario la describe como "no me dice nada": las barras solo tienen color (verde/rojo según signo) pero no comunican una lectura clara ni permiten explorar el detalle de cada mes.

## Objetivo

Que la card comunique de un vistazo cómo viene el usuario este mes, permita explorar meses anteriores tocando las barras, y dé una referencia de calidad (bueno/ajustado/rojo) sin caer en un mensaje explícito tipo "tu meta es ahorrar 20%" — la referencia debe sentirse implícita en el color y el label, no en un número impuesto.

## Alcance

**Incluye:**
- Headline numérico (% + $ neto) del mes activo, con label/tag cualitativo por tono.
- Barras interactivas (tap → selecciona mes, actualiza headline).
- Bandas cualitativas de 3 tonos (`good`/`warn`/`bad`) en vez de las 2 actuales (`good`/`bad`).
- Extensión del getter `getSavingsRateSeries` en el store para exponer el tono calculado.

**No incluye:**
- Meta de ahorro configurable por el usuario (no existe ese concepto hoy; "Objetivos" es algo distinto — metas de monto, no de tasa mensual).
- Comparación contra el promedio histórico del propio usuario (evaluado, descartado por complejidad y cold-start con pocos meses de datos).
- Cambios a `TrendChart` ni a otras cards del tab.

## Decisiones tomadas

| Decisión | Elección |
|---|---|
| Fuente de la referencia | Bandas cualitativas fijas (no meta configurable, no promedio histórico) |
| Umbral "sólido" | `rate >= 15` → tono `good` |
| Umbral "ajustado" | `0 <= rate < 15` → tono `warn` |
| Umbral "rojo" | `rate < 0` → tono `bad` |
| Interacción | Tap en barra (mismo patrón que `category-treemap.tsx`), sin modal — headline inline se actualiza |
| Selección default | Mes actual (última entrada de la serie) |
| Dónde vive el cálculo de tono | Store (`getSavingsRateSeries`), regla del proyecto: cálculo de negocio no va en componentes |

## Arquitectura

### Store: `getSavingsRateSeries` (modificado)

`src/lib/store/financeStore.ts:2072`. Se agrega `tone` a cada entrada de la serie, calculado a partir de `rate` con los umbrales de la tabla anterior:

```ts
getSavingsRateSeries: (months?: number) => Array<{
  month: string;
  net: number;
  rate: number;
  tone: 'good' | 'warn' | 'bad';
}>
```

Sin cambios en la firma ni en los consumidores existentes de `net`/`rate` — solo se agrega el campo.

### Componente: `SavingsRateBars` (modificado)

`src/components/dashboard/analysis/charts/savings-rate-bars.tsx`.

- Agrega estado local `selectedMonth: string | null` (default `null` = mes actual, última entrada de la serie).
- `Bar` recibe `onClick` que setea `selectedMonth` al mes clickeado (mismo patrón que `onClick` del `Treemap` en `category-treemap.tsx:97`).
- `Cell` de cada barra usa `tone` → color (`var(--good)` / `var(--warn)` / `var(--bad)`), con opacidad reducida en las barras no-activas para destacar la seleccionada (mismo patrón visual que `activeIndex` en `category-treemap.tsx`).
- Ya no usa `role="img"` en el contenedor (deja de ser una imagen estática; las barras son interactivas). Se mantiene un `aria-label` descriptivo en el contenedor y, si es viable con Recharts, en cada `Cell`/`Bar` individual.

### Componente: `TabTendencia` (modificado)

`src/components/dashboard/analysis/tab-tendencia.tsx:34-37`.

Se agrega headline arriba del gráfico dentro de la misma card:

- Número grande (`font-poster tnum`): `{rate}%` del mes activo (seleccionado o actual).
- Tag/`Chip` de color según `tone`, con copy corto:
  - `good` → "Sólido"
  - `warn` → "Ajustado"
  - `bad` → "Números rojos"
- Línea secundaria pequeña (`text-muted`): monto neto (`net`) del mes activo, formateado con `formatCurrency`.
- El mes activo (nombre del mes) se muestra junto al headline para dejar claro qué mes se está leyendo cuando no es el actual.

El estado `selectedMonth` vive en `SavingsRateBars` pero el headline necesita ese valor — se sube el estado a `TabTendencia` (o se expone vía callback `onSelectMonth` desde `SavingsRateBars`, mismo patrón que `onSelect` en `CategoryTreemap`) para que el padre pueda renderizar el headline sincronizado con la barra activa.

## Flujo de datos

```
TabTendencia
  ├─ getSavingsRateSeries(6)  → serie con tone por mes
  ├─ selectedMonth (estado, default: mes actual)
  ├─ Headline (usa entrada activa: selectedMonth ?? último mes)
  └─ SavingsRateBars(data, selectedMonth, onSelectMonth=setSelectedMonth)
       └─ tap en barra → onSelectMonth(month) → headline se actualiza
```

## UI / tokens

- Headline: `font-poster tnum` para el número, `Chip` del design system para el tag de tono (`tone="good"|"warn"|"bad"`, ya soportado por `ProgressBar`/`Chip` según CLAUDE.md).
- Colores: `text-good`/`text-warn`/`text-bad` y sus variantes `var(--good)`/`var(--warn)`/`var(--bad)` en el chart — nada de `emerald-*`/`rose-*`.
- Mantiene `rounded-2xl bg-surface border-[1.5px] border-border p-4` de la card existente.

## Manejo de errores / estados vacíos

- Sin cambios al estado vacío actual: `hasData` (algún mes con `net !== 0`) sigue mostrando "Sin datos de ahorro" y en ese caso no se renderiza headline ni interacción.
- Si `selectedMonth` no existe en la serie actual (caso borde: cambio de rango de meses), se hace fallback al mes actual.

## Testing / verificación

Sin tests configurados en el proyecto (por CLAUDE.md). Verificación manual con `/run` sobre `npm run dev`: tap en distintas barras confirma que headline y tag cambian, estado vacío se mantiene igual, `npm run lint` y `npm run build` pasan.

## Riesgos / notas

- Los umbrales (15% / 0%) son una elección editorial fija, no derivada de datos del usuario — se documentan acá para poder ajustarlos fácilmente si en uso real se sienten mal calibrados.
- Subir el estado `selectedMonth` de `SavingsRateBars` a `TabTendencia` es el único cambio de arquitectura de componentes; el resto es aditivo.
