# Spec: Presupuestos y Metas gráficos en el Inicio

> Fecha: 2026-07-06 · Estado: aprobado, listo para planificar/implementar
> Modelo de referencia: la sección **Análisis** del home (`src/components/dashboard/analysis/`).

## Objetivo

Reemplazar la visualización básica de presupuestos del inicio y **traer las metas de
ahorro al inicio** (hoy solo viven en `/objetivos`), con dos cards modernas y gráficas,
alineadas al lenguaje visual de las cards de "Análisis". Limpiar el componente viejo.

Contexto de uso: **Argentina** — presupuestos y metas pueden estar en ARS o USD; la app
ya convierte a ARS vía dólar blue. **Mobile-first**: canvas base 392px; ambas cards deben
verse bien en pantalla angosta.

## Decisiones tomadas (brainstorming)

| Tema | Decisión |
|---|---|
| Presupuestos | Card **"Medidor de ritmo + proyección"** (gauge semicircular, % protagonista) |
| Metas | Card **"Anillos de progreso"** (activity rings, % al centro) |
| Estado vacío | Cada card devuelve `null` si no hay datos (se oculta) |
| Ubicación | Juntas, antes de Análisis: bento → **Presupuestos** → **Metas** → Análisis → Movimientos |
| Gráficos | SVG a mano (radiales); recharts se reserva para barras/líneas de Análisis |
| Título | Lo aporta `<SectionTitle>`; las cards **no** repiten su título interno |

---

## 1. Componente `BudgetGaugeCard`

**Archivo:** `src/components/dashboard/budget-gauge-card.tsx` (nuevo).
**Reemplaza a:** `src/components/goals/budget-overview-strip.tsx` (se borra, ver §5).

**Estructura visual (una columna, mobile-first):**

1. **Gauge semicircular (SVG ~220×128):**
   - Track de fondo (`stroke` = `var(--surface-2)` o `#FBF7EC`), grosor ~16px, `stroke-linecap="round"`.
   - Arco de valor: `stroke-dasharray` proporcional al **% agregado gastado** del mes; color por
     tono (`var(--good)` < 75%, `var(--warn)` 75–99%, `var(--bad)` ≥ 100%).
   - **Punto de proyección**: `<circle>` posicionado sobre el arco en el ángulo correspondiente
     a `projectedPercent` (clamp a 100 para la posición), relleno `var(--bad)` si va a exceder,
     `var(--good)` si no, con borde blanco.
   - Centro: `%` grande en `font-poster tnum` (`text-text`) + caption `usado del mes` (`text-muted`).
2. **Pill de estado** (centrada, debajo del gauge): texto según proyección —
   `Proyectás terminar en {projectedPercent}% · te alcanza` (tono `good`) /
   `· te pasás` (tono `bad`) / mensaje intermedio (tono `warn`). Fondo `bg-<tono>/10`, `text-<tono>`.
3. **Mini-filas** (top 2 categorías más al límite, de `getAllBudgetStatuses().slice(0, 2)`):
   emoji + nombre (truncado) a la izquierda; `%` a la derecha (`tnum`, color por tono);
   `<ProgressBar tone height={7}>` debajo.
4. **`InfoHint`** (`@/components/ui/info-hint`) junto a un microcopy que explique la proyección,
   como en `tab-este-mes.tsx`.

**Contenedor:** `<Card className="p-4 space-y-3">` (de `@/components/ui/card`) →
`rounded-2xl bg-surface border-[1.5px] border-border`.

**Datos:** `getBudgetsOverview()` (nuevo, §3) para el agregado + `getAllBudgetStatuses().slice(0,2)`
para las mini-filas. **Estado vacío:** si `getBudgetsOverview()` es `null` (sin presupuestos
activos) → `return null`.

**Colores de arco/punto:** usar `var(--good|warn|bad)` en `stroke`/`fill` del SVG (no clases
Tailwind; el SVG toma CSS vars directas, patrón ya usado en `savings-rate-bars.tsx`).

---

## 2. Componente `SavingsGoalsRingsCard`

**Archivo:** `src/components/dashboard/savings-goals-rings-card.tsx` (nuevo). Sin precedente en el home.

**Estructura visual (mobile-first):**

1. **Fila de anillos** (`flex flex-wrap justify-around gap`), hasta **4 metas activas**:
   - SVG donut ~80–86px: track `var(--surface-2)`; arco relleno según `percent`
     (`stroke-dasharray`, `transform="rotate(-90 ...)"` para arrancar arriba, `stroke-linecap="round"`).
   - Tono del anillo: `var(--good)` si `status === 'completed'`, si no `var(--accent)`.
   - **Centro: `%`** (`tnum`, `text-text`) — *no* emoji (la tabla `savings_goals` no tiene ícono).
   - Debajo del anillo: nombre truncado (`text-[11px] font-bold`) + **badge `USD`** si `currency === 'USD'`
     (`bg-surface-2 text-muted` pill chica).
2. **Pie** con divisor (`border-t border-border`): label `Total ahorrado` (`text-muted`) +
   monto en **ARS-equivalente** (`font-poster tnum text-text`).

**Overflow:** si hay > 4 metas activas, mostrar 4 (las de `getSavingsGoalsOverview().goals`, ya
priorizadas) y delegar el resto al link "Ver todas" del `SectionTitle`.

**Contenedor:** `<Card className="p-4 space-y-3">`.

**Datos:** `getSavingsGoalsOverview()` (nuevo, §3). **Estado vacío:** si `activeCount === 0` → `return null`.

**Mobile:** con `px-5` (home) + `p-4` (card) el ancho interno útil ≈ 320px; 3 anillos de 86px entran
en fila, 4 ajustan a ~72px vía `flex-wrap`. Verificar a 392px.

---

## 3. Getters nuevos en `lib/store/financeStore.ts`

Toda la lógica de negocio va en el store (regla del proyecto). Declarar el tipo en la interfaz
del store y agregar tests.

### `getBudgetsOverview()`

Devuelve el agregado para el gauge, o `null` si no hay presupuestos activos.

```ts
getBudgetsOverview: () => {
  percent: number;            // gastado / tope agregado, en % (0..∞)
  projectedPercent: number;   // proyección a fin de mes, en %
  status: 'ok' | 'warning' | 'exceeded';
  willExceed: boolean;        // projectedPercent > 100
  exceededCount: number;
  warningCount: number;
  totalSpentARS: number;
  totalLimitARS: number;
} | null
```

**Normalización de moneda (clave):** `t.amount` (y por ende `getExpensesByCategory`) está
**siempre en ARS**. Los topes (`budget.amount`) están en la moneda del presupuesto. Para un
agregado honesto, normalizar **todo a ARS**:

- `spentARS` = `spent` de `getCategoryBudgetStatus` (ya ARS).
- `limitARS` = `budget.currency === 'USD' && blue ? limit * blue : limit`, donde
  `blue = dolarBlue?.venta > 0 ? dolarBlue.venta : null`.
- `percent = totalLimitARS > 0 ? totalSpentARS / totalLimitARS * 100 : 0`.
- Proyección: sumar `getBudgetProjection(b.id).projected` por presupuesto, normalizado a ARS igual
  que el tope; `projectedPercent = projectedTotalARS / totalLimitARS * 100`.
- `status`: `exceeded` si `percent >= 100`, `warning` si `>= 75`, si no `ok`.
- `exceededCount` / `warningCount`: contar sobre `getAllBudgetStatuses()` (reusar).

### `getSavingsGoalsOverview()`

```ts
getSavingsGoalsOverview: () => {
  goals: Array<{
    id: string;
    name: string;
    percent: number;             // de getSavingsGoalProgress
    currency: 'ARS' | 'USD';
    status: 'active' | 'completed';
  }>;                            // solo metas activas, priorizadas (ver orden)
  totalSavedARS: number;
  activeCount: number;
}
```

- Iterar `savingsGoals.filter(g => g.is_active)`, mapear con `getSavingsGoalProgress(g.id)`.
- **Orden de prioridad** para la fila (los 4 primeros se muestran): sugerido — primero las
  cercanas a completarse/próximas a vencer; el implementador puede ordenar por `daysLeft` asc y
  luego `percent` desc. Documentar el criterio elegido.
- `totalSavedARS`: por meta, `contribuido en ARS-equivalente`. Para metas USD, convertir los
  aportes con `blue` (`aporteUSD * blue`); para ARS, tal cual. Reutilizar el criterio de "total"
  del hero de `/objetivos` pero **sumando también las USD convertidas** (hoy el hero suma solo ARS).
- `activeCount = goals.length`.

**Tests** (`src/lib/store/__tests__/`, patrón `useFinanceStore.setState` + `vi.useFakeTimers`):
- Presupuestos: solo ARS; mixto ARS/USD (verificar normalización); vacío → `null`; proyección.
- Metas: solo ARS; mixto ARS/USD (total convertido); vacío → `activeCount 0`; orden de prioridad.

---

## 4. Wiring en `src/app/page.tsx`

Reemplazar el bloque actual de Presupuestos y agregar el de Metas, en este orden (dentro del
`<main>`, entre el bento de métricas y la sección Análisis):

```tsx
{/* PRESUPUESTOS DEL MES */}
<SectionTitle action="Gestionar" href="/objetivos?tab=presupuestos">Presupuestos</SectionTitle>
<BudgetGaugeCard />

{/* METAS DE AHORRO */}
<SectionTitle action="Ver todas" href="/objetivos?tab=metas">Metas de ahorro</SectionTitle>
<SavingsGoalsRingsCard />
```

- Quitar el import y el uso de `BudgetOverviewStrip`; importar los dos componentes nuevos desde
  `@/components/dashboard/...`.
- Actualizar el `href` del `SectionTitle` de Presupuestos a `/objetivos?tab=presupuestos`
  (hoy es `/objetivos`). `/objetivos` ya acepta `?tab=metas|presupuestos`.

---

## 5. Limpieza

- **Borrar** `src/components/goals/budget-overview-strip.tsx` (único uso: el home, ya reemplazado).
  Verificar antes: `grep -rn "BudgetOverviewStrip" src` → 0 usos fuera del propio archivo.
- Revisar `src/components/ui/skeletons.tsx`: si hay un skeleton dedicado a la strip que quede
  huérfano, quitarlo. Si el `DashboardSkeleton` tiene un placeholder para esa sección, adaptarlo a
  las dos cards nuevas (opcional).
- **No tocar** `/objetivos` ni sus cards (`SavingsGoalCard`, `CategoryBudgetCard`,
  `category-budget-card.tsx`): siguen siendo la vista detallada.

---

## 6. Reglas de UI a respetar (de CLAUDE.md)

- Tokens semánticos **siempre**: `bg-surface`, `border-border`, `text-text/muted/faint`,
  `text-good/warn/bad`, `text-accent/accent-deep`. En SVG usar `var(--good|warn|bad|accent|surface-2)`.
- Prohibido `emerald-*`, `rose-*`, `indigo-*`, `violet-*`, `slate-*`.
- Bordes `border-[1.5px] border-border`. Montos display `font-poster`; números financieros `tnum`.
- Componentes base: `<Card>`, `<ProgressBar tone>`, `<SectionTitle>`, `<InfoHint>`.

## 7. Notas de alcance / no-goals

- **Imprecisión preexistente (no se arregla acá):** `getCategoryBudgetStatus` compara `spent` (ARS)
  contra `limit` en la moneda del presupuesto; para presupuestos en USD el `percent` per-card queda
  mal. Fuera de alcance de este spec. El getter nuevo del gauge **sí** normaliza a ARS para su
  agregado. Dejar señalado (ticket aparte).
- Emoji por meta: la tabla no lo tiene; **no** se infiere por keyword ahora (YAGNI). Los anillos
  muestran `%` al centro.
- No se agregan librerías de charts nuevas; los radiales son SVG propio.

## 8. Definition of Done

- `npm run build` y `npm run lint` pasan.
- Tests nuevos de `getBudgetsOverview` y `getSavingsGoalsOverview` en verde (`npm test`).
- Home renderiza Presupuestos (gauge) y Metas (anillos) en el orden acordado; cada card se oculta
  si no hay datos.
- Cero clases prohibidas en los componentes nuevos; validación visual a 392px.
- `BudgetOverviewStrip` eliminado y sin referencias.
