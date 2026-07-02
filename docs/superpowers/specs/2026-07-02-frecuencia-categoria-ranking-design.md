# Rediseño: Card "Frecuencia por categoría" → Ranking de frecuencia

**Fecha:** 2026-07-02
**Estado:** Aprobado (diseño)
**Área:** Dashboard / Análisis → tab Categorías

## Problema

La card "Frecuencia por categoría" (`src/components/dashboard/analysis/charts/frequency-heatmap.tsx`)
tiene problemas de visibilidad y accesibilidad:

- **Caja negra para lectores de pantalla:** todo el heatmap es un único `role="img"`
  con un `aria-label` genérico. El usuario con lector de pantalla no puede acceder a los
  datos reales (categorías, cuántas veces, qué meses).
- **Tipografía ilegible:** `text-[10px]` en labels y `text-[8px]` en las celdas.
- **Tooltips inaccesibles:** la info por celda vive en `title=""`, que no funciona con
  teclado ni en touch (mobile).
- **Encoding solo por color:** la intensidad se comunica por opacidad del verde (WCAG 1.4.1).
- **Colores hardcodeados:** `rgba(46,125,91,...)` viola la regla de tokens del proyecto.
- **No comunica insight:** es una grilla de datos crudos; no responde de un vistazo
  "¿en qué gasto más seguido?".

## Objetivo

Un usuario debe entender **de un vistazo dónde gasta más seguido** (hábitos: café,
delivery, transporte), con foco en la *frecuencia de movimientos*, no en el monto.

## Diseño

### 1. Store: nuevo getter `getCategoryFrequencyRanking`

Reemplaza a `getCategoryFrequency` (cuyo único consumidor es el heatmap que se elimina).

```ts
getCategoryFrequencyRanking: (scope: 'global' | 'current_month') => Array<{
  category: string;   // nombre de categoría
  emoji: string;
  count: number;      // nº de movimientos (transactions de tipo expense)
  total: number;      // suma gastada en ARS (Math.abs del amount)
  avg: number;        // total / count
}>;
```

- Ordenado por `count` descendente.
- Filtro de scope **idéntico** a `getExpensesByCategory`:
  - `current_month` → `isExpenseInCurrentMonthScope(t, paymentMethods, now)`
  - `global` → todos los `expense`.
- Categoría sin nombre → `'Otros'` (mismo fallback que `getExpensesByCategory`).
- Emoji resuelto desde `categories` por `category_id`.

La lógica de negocio (conteo, suma, promedio) vive en el store, no en el componente
(regla del proyecto).

### 2. Componente `CategoryFrequencyRanking`

Reemplaza `frequency-heatmap.tsx`. Nuevo archivo:
`src/components/dashboard/analysis/charts/category-frequency-ranking.tsx`.

Props:

```ts
{
  scope: 'global' | 'current_month';
  onSelect: (category: string) => void;
}
```

Estructura:

- Lista semántica `<ul>` con top 6 filas (`<li>`).
- Cada fila es un `<button type="button">` (accesible por teclado y touch):
  - Layout: `emoji + nombre` (izquierda) · barra proporcional · `{count}x` (derecha).
  - Barra: ancho = `count / maxCount * 100%`, color token `bg-accent`, riel `bg-surface-2`.
  - Número `{count}x` en `font-sans` `tnum` bold, `text-sm` (legible; adiós `text-[8px]`).
  - `onClick={() => onSelect(category)}`.
  - `aria-label={`${category}, ${count} movimientos, ver detalle`}`.
  - `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50`.
  - Touch target ≥44px de alto (fila con `py` suficiente).
- Estado vacío: mensaje "Sin datos de frecuencia" (`text-muted` `text-xs` italic), como hoy.

Sin leyenda de color: la longitud de la barra **y** el número explícito comunican el dato
(no depende del color → cumple WCAG 1.4.1).

### 3. Modal de detalle

Reusa el `<Modal>` existente en `tab-categorias.tsx` (mismo patrón que el treemap).
Al tocar una categoría del ranking, muestra:

- Título: `{emoji} {category}`.
- `count` movimientos.
- Total gastado: `formatCurrency(toDisplay(total))`.
- Promedio por movimiento: `formatCurrency(toDisplay(avg))`.
- Label de scope: "Frecuencia del mes" / "Frecuencia histórica".

El ranking (con `count`, `total`, `avg`) se lee desde `getCategoryFrequencyRanking(freqScope)`
en `tab-categorias.tsx`, y el item seleccionado se busca por `category`.

### 4. Toggle Mes / Histórico

En el header de la card Frecuencia, réplica exacta del toggle de la card "Distribución del
gasto". Estado propio e independiente (`freqScope`), de modo que cada card es autocontenida.

- Reusa el patrón de botón existente (pill, `border-[1.5px]`, `Mes · Histórico`).
- `aria-label="Cambiar entre mes actual e histórico"`.

### 5. Limpieza

- Eliminar `src/components/dashboard/analysis/charts/frequency-heatmap.tsx`.
- Eliminar el getter `getCategoryFrequency` del store y su tipo en la interfaz
  (verificado: sin otros consumidores).

## Fuera de alcance (YAGNI)

- Sparklines / tendencia mes a mes por categoría (se descartó en brainstorming).
- Cambios en la card "Distribución del gasto" o en "Currency exposure".
- Nuevos tokens de color.

## Criterios de aceptación

1. El ranking muestra las top 6 categorías por nº de movimientos, ordenadas desc.
2. El toggle Mes/Histórico recalcula el ranking según el scope, con la misma semántica
   que la card de Distribución.
3. Cada fila es alcanzable y operable por teclado (Tab + Enter/Space) y por touch, y abre
   el modal con count, total y promedio.
4. Un lector de pantalla anuncia por fila la categoría y el nº de movimientos.
5. No hay tamaños de fuente por debajo de `text-xs`; ningún color hardcodeado.
6. `npm run lint` y `npm run build` pasan; `frequency-heatmap.tsx` y `getCategoryFrequency`
   ya no existen.
