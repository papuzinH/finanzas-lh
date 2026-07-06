# Plan: adaptar la Home al design system

> Fecha: 2026-07-06 · Branch base sugerido: `feat/design-system-handoff`
> Objetivo: eliminar las infracciones al design system en la Home y recuperar
> los patrones del prototipo que quedaron afuera.

## Contexto

La Home (`src/app/page.tsx`) está mayormente alineada con el prototipo de
referencia (`design_handoff_chanchito/prototypes/app/screen-inicio.jsx`). Las
infracciones al design system están concentradas en pocos archivos. Este plan
las resuelve en 4 tareas ordenadas por impacto, más limpieza de código muerto.

**Reglas de UI relevantes** (de `CLAUDE.md`):
- Tokens semánticos SIEMPRE. Nunca `emerald-*`, `rose-*`, `indigo-*`, `violet-*`,
  `slate-*` para UI.
- Bordes: `border-[1.5px] border-border`.
- Números financieros: `tnum`. Montos display: `font-poster`.

**Componentes/tokens disponibles como reemplazo:**
- `<Card>` de `@/components/ui/card` → `rounded-2xl bg-surface border-[1.5px] border-border shadow-card`
- `<ProgressBar>` de `@/components/ui/progress-bar` con `tone="accent|good|warn|bad"`
- `<Chip>`, `<Button>`
- Tokens: `bg-surface`, `bg-surface-2`, `border-border`, `text-text`, `text-muted`,
  `text-faint`, `text-good`, `text-warn`, `text-bad`, `text-accent`, `text-accent-deep`,
  `shadow-card`, `tnum`, `font-poster`.

---

## Tarea 1 — Migrar `BudgetOverviewStrip` (prioridad máxima)

**Archivo:** `src/components/goals/budget-overview-strip.tsx`

**Motivo:** único componente activo de la Home fuera del sistema. Usa
`bg-[var(--surface-raised)]/30`, y `--surface-raised` **no existe** en
`src/app/globals.css` → hoy se renderiza con **fondo transparente** (bug visual
real, no solo inconsistencia). Contraste: las cards de `/objetivos`
(`category-budget-card.tsx`, `savings-goal-card.tsx`) ya están migradas; esta
strip quedó atrás.

**Referencia de diseño:** `BudgetOverview` del prototipo
(`screen-inicio.jsx`, función `BudgetOverview`, ~líneas 232-253).

**Cambios exactos (solo capa visual):**

| Actual (prohibido) | Reemplazo (token) |
|---|---|
| `<div className="rounded-2xl border border-slate-800 bg-[var(--surface-raised)]/30 p-4 ...">` | `<Card className="p-4 space-y-3">` (importar `Card` de `@/components/ui/card`) |
| `text-slate-200` (título "Presupuestos del mes") | `text-text font-poster text-[15px]` |
| `text-slate-300` / `text-slate-400` | `text-text` / `text-muted` |
| `text-rose-400` + `<XCircle>` (superados) | `text-bad` |
| `text-amber-400` + `<AlertTriangle>` (alerta) | `text-warn` |
| `text-emerald-400` + `<CheckCircle2>` (en orden) | `text-good` |
| `text-indigo-400 hover:text-indigo-300` (link "Ver todos") | `text-accent hover:text-accent-deep` |
| barra manual: track `bg-slate-800` + fill `bg-rose-500/amber-500/emerald-500` | `<ProgressBar value={Math.min(percent,100)} tone={status==='exceeded'?'bad':status==='warning'?'warn':'good'} height={7} />` |
| `font-mono` en `%` y montos | `tnum` |
| indicador "va a exceder" `bg-rose-400/bg-rose-500` (animate-ping) | `bg-bad` (mantener el `animate-ping`) |

**No tocar:** lógica de `getAllBudgetStatuses`, `getBudgetProjection`, el conteo
`exceeded/warning`, el `slice(0, 6)`. Al usar `<ProgressBar>` se elimina el
`role/aria-valuenow` manual (el componente ya los aporta).

**Verificación:** fondo `bg-surface` sólido (no transparente), bordes
`border-border 1.5px`, barras con los mismos colores semánticos que las cards de
`/objetivos`.

---

## Tarea 2 — Eliminar código muerto

Ambos huérfanos (0 imports) y concentran infracciones de tokens:

- **Borrar** `src/components/dashboard/transaction-list.tsx` — 9 clases
  `slate/emerald/rose` + `surface-raised`.
- **Borrar** `src/components/dashboard/quick-actions.tsx` — 2 clases prohibidas.
  (El `QuickActions` que **sí** se usa es `src/components/chat/QuickActions.tsx`,
  otro archivo — NO tocar.)

**Verificación antes de borrar:** `grep -rn "TransactionList\|dashboard/quick-actions" src`
debe dar 0 usos. Correr `npm run build` después.

---

## Tarea 3 — Eliminar `CategoryComparison`

**Decisión tomada:** eliminar (no montar en la Home).

- **Borrar** `src/components/dashboard/category-comparison.tsx`. Corresponde al
  bloque "Categorías · mes vs mes anterior" del prototipo, pero está huérfano
  (0 imports).
- **Antes de borrar:** correr `grep -rn "CategoryComparison" src` y revisar si hay
  un getter dedicado en `src/lib/store/financeStore.ts` (ej. `getCategoryComparison`)
  que quede sin uso; si es exclusivo de este componente, eliminarlo también.
  **NO** borrar getters compartidos con otras vistas.
- Confirmar que no quede referencia en `src/components/ui/skeletons.tsx`
  (apareció en la búsqueda; validar si es un skeleton propio a limpiar).

---

## Tarea 4 — Crear componente `SectionTitle` unificado

**Motivo:** el prototipo define `SectionTitle` como pieza base
(`ui.jsx`, ~líneas 138-149) — título `font-poster text-[15px]` + acción "Ver todo"
con chevron. **No existe** en el código. La Home usa en su lugar separadores
ad-hoc (línea + label `uppercase text-[10px]`, `page.tsx` ~líneas 207-210 y
216-220), un lenguaje visual distinto al del diseño.

**Crear:** `src/components/shared/section-title.tsx`

API objetivo:
```tsx
<SectionTitle action="Ver todos" href="/movimientos">Últimos movimientos</SectionTitle>
```
- `flex items-center justify-between`
- título: `font-poster text-text text-[15px] tracking-tight`
- acción opcional: `text-accent-deep font-bold text-[12px]` + `<ChevronRight>` de `lucide-react`
- soportar `href` (Link de next) o `onClick`

**Reemplazar en `src/app/page.tsx`:**
- Separador "Análisis" (~207-210) → `<SectionTitle>Análisis</SectionTitle>`
- Separador "Últimos movimientos" (~216-220) →
  `<SectionTitle action="Ver todos" href="/movimientos">Últimos movimientos</SectionTitle>`
- Agregar `<SectionTitle action="Gestionar" href="/objetivos">Presupuestos</SectionTitle>`
  **encima** de `<BudgetOverviewStrip />` (~202), como en el prototipo.

**Alcance opcional (segundo paso):** reutilizar el mismo `<SectionTitle>` en
movimientos y objetivos para consistencia global.

---

## Divergencia intencional (no requiere acción)

**BalanceCard** (`src/components/dashboard/balance-card.tsx`) respeta tokens pero
cambió el contenido respecto al prototipo: implementa el modelo "plata libre"
expandible en vez del badge de tendencia + mini-stats del hero
(`screen-inicio.jsx` ~57-72). Es una decisión de producto válida y visualmente
correcta. NO se toca salvo pedido explícito de recuperar el badge de tendencia.

---

## Resumen ejecutable

| # | Acción | Archivo | Riesgo |
|---|---|---|---|
| 1 | Migrar a tokens + `Card` + `ProgressBar` | `goals/budget-overview-strip.tsx` | Bajo (solo capa visual) |
| 2 | Borrar (código muerto) | `dashboard/transaction-list.tsx`, `dashboard/quick-actions.tsx` | Nulo |
| 3 | Borrar + limpiar getter/skeleton residual | `dashboard/category-comparison.tsx` | Bajo |
| 4 | Crear `SectionTitle` + aplicar en Home | `shared/section-title.tsx`, `app/page.tsx` | Bajo |

## Cierre / Definition of Done

- `npm run build` y `npm run lint` pasan.
- Cero clases `slate/emerald/rose/indigo/violet` en componentes **activos** de la Home:
  `grep -rnE "(slate|emerald|rose|indigo|violet)-[0-9]{2,3}" src/components/goals src/components/dashboard` sin resultados en archivos en uso.
- Cero referencias a `--surface-raised` en `src`.
- Secciones de la Home usando el `<SectionTitle>` del diseño.
- Validación visual contra `design_handoff_chanchito/prototypes/Chanchito App.html`.
