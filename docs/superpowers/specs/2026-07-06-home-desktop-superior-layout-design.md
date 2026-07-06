# Spec: rediseño desktop de la zona superior del inicio + baja de "Guardar sobrante"

> Fecha: 2026-07-06 · Branch base: `feat/home-presupuestos-metas-visual`
> Objetivo: aprovechar el ancho en desktop reorganizando toda la parte superior
> del inicio (todo lo previo a "Presupuestos y metas") en un layout de 2 columnas,
> y eliminar por completo la feature "Guardar sobrante".

## Contexto y problema

La zona superior del inicio (`src/app/page.tsx`, dentro de `<main max-w-[1440px]>`)
hoy es un grid `lg:grid-cols-4` donde **casi todo hace `col-span-4` (ancho completo,
apilado verticalmente)**:

1. `BalanceCard` — hero "tu plata libre" (número 38px, expandible) → full width
2. `NextMonthCardExposureCard` — "consumo tarjeta próximo mes" (condicional) → full width
3. `EndOfMonthSavingsBanner` — CTA "guardar sobrante" (colapsable) → full width
4. `InsightsCarousel` — carrusel de mensajes rotativos (condicional) → full width
5. Las 4 KPIs (Ingresos, Variables, Cuotas, Fijos) → dos `MetricRow` que **sí**
   arman una fila de 4 en desktop

**Problema:** en una pantalla de ~1400px, los bloques 1-4 son tiras full-width
apiladas que se ven vacías (un hero con número de 38px estirado a todo el ancho)
y generan scroll innecesario. No se aprovecha el ancho.

## Decisiones tomadas (brainstorming)

- **Dirección:** densidad / menos scroll. El hero deja de ser full-width y comparte
  fila. Feel más "dashboard".
- **Layout elegido:** *Principal + rail derecho* (2/3 + 1/3).
- **"Guardar sobrante":** el usuario no le ve sentido → se elimina por completo de
  la UI, incluyendo el nudge proactivo del chatbot. Se mantiene la infraestructura
  compartida (savings, internal_transfers, transferencias manuales).

---

## Diseño 1 — Layout desktop de la zona superior

### Estructura visual (lg ≥ 1024px)

Con "Guardar sobrante" fuera, el rail queda con 2 cards:

```
main (max-w-1440, px-5)
┌─────────────────────────────────────────────────────────┐
│ IncompleteCreditCardsBanner  (full width, condicional)   │
├──────────────────────────────────┬──────────────────────┤
│          BALANCE (hero)          │  Consumo tarjeta      │
│          tu plata libre          │  próximo mes          │
├──────┬──────┬──────┬─────────────┼──────────────────────┤
│Ingr. │Var.  │Cuotas│ Fijos       │  Insights  ↻          │
└──────┴──────┴──────┴─────────────┴──────────────────────┘
   ←— PRINCIPAL: hero + 4 KPIs (2/3) —→   ←— RAIL (1/3) —→
```

- **Columna principal (2/3):** hero de Balance arriba + las 4 KPIs en **una sola
  fila de 4** debajo.
- **Rail (1/3):** `NextMonthCardExposureCard` + `InsightsCarousel`, apilados.
- El `IncompleteCreditCardsBanner` se mantiene **full-width arriba del grid** (es un
  alert; corresponde que ocupe todo el ancho).

### Técnica CSS (grid único, sin romper mobile)

Un solo grid; el layout de 2 columnas aplica **solo en `lg:`**. En mobile/tablet es
un stack de 1 columna que respeta el **orden del DOM**. Ese orden del DOM se elige
para que coincida con el orden mobile deseado.

```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 lg:grid-flow-row-dense gap-4">
  {/* 1. Hero — principal, fila 1 (cols 1-2) */}
  <div data-tour="balance-card" className="lg:col-span-2">
    <BalanceCard />
  </div>

  {/* 2. Consumo tarjeta — rail (col 3). Render directo (sin wrapper) para que el
        null-return colapse la celda. */}
  <NextMonthCardExposureCard className="lg:col-start-3" />

  {/* 3. Insights — rail (col 3). Idem. */}
  <InsightsCarousel className="lg:col-start-3" />

  {/* 4. Las 4 KPIs — principal, fila 2 (cols 1-2) */}
  <MetricGrid className="lg:col-span-2" items={[income, variable, installments, fixed]} />
</div>
```

**Por qué funciona:**
- El **orden del DOM** es `hero → consumo tarjeta → insights → KPIs`, idéntico al
  orden mobile deseado (ver Diseño 1 · mobile). En `grid-cols-1` (mobile) se apilan
  en ese orden.
- En `lg:`, hero y KPIs se fijan a `col-span-2` (cols 1-2); las cards del rail se
  fijan a `col-start-3`. Con `grid-flow-row-dense` el algoritmo ubica:
  hero→(f1,c1-2), consumo→(f1,c3), insights→(f2,c3), KPIs→(f2,c1-2).

**Manejo de condicionales (clave):** `NextMonthCardExposureCard` retorna `null` si
`total ≤ 0`; `InsightsCarousel` retorna `null` si no hay insights. Al renderizarlos
**como hijos directos del grid** (sin `<div>` wrapper) y pasarles la clase de
posición vía prop `className`, cuando retornan `null` **no se crea ninguna celda** y
`grid-flow-row-dense` colapsa el hueco:
- Sin consumo tarjeta → Insights sube a (f1,c3), pegado al hero. Sin gap.
- Sin insights → el rail queda solo con Consumo tarjeta.
- Sin ninguno de los dos (usuario nuevo sin actividad ni insights) → el tercio
  derecho queda vacío y el principal ocupa 2/3. Caso raro y aceptable; no se maneja
  especialmente.

> Requisito de implementación: `NextMonthCardExposureCard` e `InsightsCarousel` deben
> aceptar una prop opcional `className` y mergearla en su nodo raíz (con `cn()`). El
> hero y `MetricGrid` reciben su clase de posición directamente (siempre se renderizan).

### Proporción y breakpoint

- Proporción **2:1** vía `lg:grid-cols-3` (principal `col-span-2`, rail `col-start-3`).
- El layout de 2 columnas arranca en `lg` (1024px). Debajo de `lg` (mobile + tablet)
  queda el stack de 1 columna actual.

### Diseño 1 · mobile / tablet (< lg) — sin cambios de layout

Stack de 1 columna, mismo orden actual **pero sin el banner de sobrante**:

```
hero → consumo tarjeta → insights → 4 KPIs (2×2)
```

Las 4 KPIs siguen en 2×2 en mobile/tablet (`grid-cols-2`), igual que hoy.

### Diseño 1 · polish del hero (opcional, incluido)

Como el hero ahora vive en 2/3 y no en todo el ancho, para que no se vea vacío se
escala levemente en desktop:
- Número: `text-[38px] lg:text-[46px]` (mantener `font-poster tnum leading` actuales).
- Padding del header: `p-5 lg:p-6`.

No cambia el comportamiento (sigue siendo expandible con click). Es solo escala
tipográfica/espaciado en `lg:`.

### Diseño 1 · refactor `MetricRow` → `MetricGrid`

`src/components/dashboard/metric-row.tsx` hoy exporta `MetricRow`, que renderiza 2
`MetricCard` dentro de `col-span-2 grid grid-cols-2` (asume un grid padre de ≥2 cols).
En el layout nuevo las 4 KPIs viven dentro de la columna principal, así que se
necesita **un solo grid de 4**:

- Reemplazar `MetricRow` por `MetricGrid({ items, className }: { items: MetricItemProps[]; className?: string })`
  que renderiza `grid grid-cols-2 lg:grid-cols-4 gap-3` mapeando sobre `MetricCard`
  (que se mantiene **idéntico**, sin cambios visuales).
- `page.tsx` pasa a usar **un solo** `<MetricGrid items={[income, variable, installments, fixed]} className="lg:col-span-2" />`
  en lugar de las dos `MetricRow`.
- `MetricRow` se elimina (único consumidor: `page.tsx`).
- Tablet (md, 768-1024): `grid-cols-2` → 2×2 (igual que hoy). Desktop (`lg`): 1×4.

### Diseño 1 · skeleton

`src/components/ui/skeletons.tsx` (`DashboardSkeleton`) referencia el layout de la
home. Se actualiza para reflejar el nuevo grid: en `lg`, hero + fila de 4 KPIs en el
principal y 2 placeholders en el rail; en mobile, el stack. Sin banner de sobrante.

---

## Diseño 2 — Baja completa de "Guardar sobrante"

La feature "guardar sobrante" (end-of-month surplus) vive en varias superficies.
Se elimina lo **exclusivo** de ella; se preserva lo **compartido**.

### Se elimina

| Archivo | Acción |
|---|---|
| `src/components/dashboard/end-of-month-savings-banner.tsx` | **Borrar archivo completo** |
| `src/app/page.tsx` | Quitar `import` (línea ~24) y uso (`<EndOfMonthSavingsBanner />`, ~145) |
| `src/app/dashboard/actions.ts` | Borrar `createEndOfMonthSurplusTransfer` (único consumidor: el banner). Verificar si el archivo queda sin otros exports/imports usados y limpiar en consecuencia. |
| `src/lib/store/financeStore.ts` | Borrar `getEndOfMonthSurplusSuggestion` — **declaración en la interface (`:299`) + implementación (`:1980`)**. Es código muerto (0 consumidores). |
| `src/components/chat/ChatWidget.tsx` | Borrar el `useEffect` del nudge proactivo de sobrante (líneas ~43-77) + el helper `getSurplusChatPromptKey` (y sus imports si quedan huérfanos: `formatCurrency`/`internalTransfers`/`getMonthlyExpensesBreakdown` **solo** si ya no se usan en el resto del componente — verificar antes de quitar). |

### NO se toca (compartido — romper esto rompe otras vistas)

- `getMonthlyExpensesBreakdown` (store) — lo usa `ChatWidget` y análisis.
- Slice `internalTransfers` + tabla `internal_transfers` — la usan inversiones
  (`inversiones-client.tsx`, `inversiones/actions.ts`), `disponible-real`, y las
  transferencias `transfer_type: 'manual'`.
- Tabla `savings` / chanchito — feature independiente que se muestra en inversiones.
  El banner era **una** de las formas de sumar ahorro; hay otras.
- Enum `end_of_month_surplus` en `types/database.ts` (`:583`, `:594`, `:605`) y en la
  migración `supabase/migrations/20260530_add_internal_transfers.sql` — describen
  filas que ya existen en la DB. Quitarlos rompería el tipado de datos históricos.

### Tests afectados

- `src/lib/store/__tests__/home-overview-getters.test.ts` y
  `src/lib/store/__tests__/disponible-real.test.ts` referencian `internalTransfers`.
  Como la infraestructura no se toca, no deberían romperse; **verificar que ninguno
  testee específicamente `getEndOfMonthSurplusSuggestion`** (el getter que se borra).
  Si lo hacen, actualizar/eliminar ese caso.

---

## Restricciones de design system (aplican a todo)

- Tokens semánticos SIEMPRE: `bg-surface`, `border-border`, `text-text/muted/faint`,
  `text-good/warn/bad`, `text-accent`. Nunca hex ni `slate/emerald/rose/indigo/violet`.
- Bordes: `border-[1.5px] border-border`.
- Montos: `font-poster` + `tnum`.
- El refactor de KPIs y el layout **no** introducen colores/estilos nuevos: reusan
  `MetricCard` y las cards existentes tal cual.

## Fuera de alcance

- La sección "Presupuestos y metas" (`BudgetGaugeCard` + `SavingsGoalsRingsCard`) y
  todo lo que está **debajo** de ella (Análisis, Últimos movimientos). No se tocan.
- Cambios de comportamiento del hero (sigue expandible con click).
- Cambios de schema SQL.

## Definition of Done

- [ ] En desktop (`≥1024px`), la zona superior se ve como 2 columnas: principal
      (hero + fila de 4 KPIs) 2/3 + rail (consumo tarjeta + insights) 1/3.
- [ ] Verificado visualmente en los 3 estados del rail: con ambas cards, sin consumo
      tarjeta (insights sube, sin gap), y sin insights.
- [ ] En mobile/tablet, el orden es `hero → consumo tarjeta → insights → 4 KPIs`
      (2×2), sin el banner de sobrante y sin otros cambios de layout.
- [ ] "Guardar sobrante" no aparece ni en el home ni como nudge del chatbot.
- [ ] `getEndOfMonthSurplusSuggestion` y `createEndOfMonthSurplusTransfer` eliminados;
      `getMonthlyExpensesBreakdown`, `internalTransfers`, `savings` intactos.
- [ ] `grep -rn "EndOfMonthSavingsBanner\|createEndOfMonthSurplusTransfer\|getEndOfMonthSurplusSuggestion\|getSurplusChatPromptKey" src` → 0 resultados.
- [ ] Cero clases `slate/emerald/rose/indigo/violet` introducidas.
- [ ] `npm run build`, `npm run lint` y `npm test` pasan.
