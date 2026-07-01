# Plan de Design System atómico — Chanchito

> Documento de seguimiento multi-sesión. Marcá los `[ ]` a medida que avances.
> **Fuente de verdad de tokens: `src/app/globals.css`** (a mano, Tailwind v4 `@theme inline`).

## Decisiones (congeladas)
- **Arquitectura**: 3 capas → **primitivos → semánticos → componente**.
- **Fuente de verdad**: `src/app/globals.css`. Se archiva `design_handoff_chanchito/tokens.css` (diverge del proyecto).
- **Alcance**: sistema completo + **migración total** (39 archivos, ~535 usos de escala Tailwind + ~68 hex).
- **Cobertura**: dark mode + acentos alternos (gold/rojo), escalas no-color, componentización faltante, texturas paper-grain.

## Principio rector — regla de las 3 capas
```
CAPA 1 · Primitivos   →  --celeste-500: #5E98BC          (paleta cruda, NUNCA en UI)
CAPA 2 · Semánticos   →  --accent: var(--celeste-500)    (rol; lo que usa el 95% de la UI)
CAPA 3 · Componente   →  --btn-accent-bg: var(--accent)  (solo cuando un componente necesita desacople)
```
- Cada capa **solo** referencia la de arriba.
- Los componentes JSX consumen **capa 2** vía clases Tailwind (`bg-accent`, `text-good`).
- La **capa 3** existe solo para componentes con necesidades propias (hero, banner, FAB).

## Diagnóstico inicial (2026-06-30)
- Tokens ya en `globals.css` con Tailwind v4 `@theme inline`, pero **capa plana** (hex crudos sobre vars semánticas, sin capa primitiva ni de componente).
- **Divergencia**: `--hero` es `#292E3A` en el proyecto vs `#1C2A47` en el handoff → gana el proyecto (`#292E3A`).
- 8 primitivas DS existen (`button`, `card`, `chip`, `icon`, `progress-bar`, `tabs-ds`, `toggle-ds`, `banner-ds`) pero con fugas: `banner-ds` usa hex (`#F7E4B6`, `#CBE2EE`), `button destructive` usa `border-red-900`, varios usan `text-navy` literal.
- Deuda de aplicación: **535 usos** de escalas Tailwind hardcodeadas en **39 archivos** + **68 hex** en 9 archivos. Bordes `border` de 1px: 0.

---

## Fase 0 — Auditoría y congelamiento de inventario ✅
- [x] Diff exacto `globals.css` ↔ `handoff/tokens.css`; documentar qué valor gana. → `--hero` gana el proyecto (`#292E3A`).
- [x] Inventariar todos los hex/escala usados en `src/` → paleta primitiva completa (sin inventar colores nuevos). Ver Apéndice B.
- [x] Tabla de reemplazo escala Tailwind → token semántico. Ver Apéndice A (con conteos reales).

## Fase 1 — Fundación de tokens (capa 1 + reestructura capa 2) ✅
- [x] Reescribir `globals.css` con 3 capas separadas y comentadas.
  - [x] **Primitivos**: paleta numerada (celeste/cream/navy/gold/rojo/green/slate) + escalas no-color (spacing 4px, radios, z-index, duration/ease motion, grain).
  - [x] **Semánticos**: vars actuales repuntados a primitivos, **sin cambiar valores efectivos** (cero regresión).
  - [x] **Componente**: `--hero`, `--hero-text`, banner tones, botón destructivo, sombras tokenizados.
- [x] Dark mode + acentos alternos (gold/rojo) como overrides de capa semántica → primitivos.
- [x] Extender `@theme inline` (agregado `border-strong`, `hero-text`; radios/sombras via var).
- [x] `paper-grain` con intensidad por token (`--grain-opacity`).
- [x] `npm run build` verde, sin regresión visual.

> Nota Fase 1: alpha vía canales RGB (`--navy-700-rgb`, `--cream-100-rgb`, `--celeste-300-rgb`) con `rgb(var(...) / a)` para `faint`/`border`/sombras. z-index y motion quedaron como primitivos CSS (aún NO expuestos como utilities Tailwind — pendiente si se necesitan).

## Fase 2 — Cierre de la capa de componentes DS ✅
- [x] Sanear primitivas (sin hex ni escalas crudas): `banner-ds` (→ tokens de componente), `button` (destructive → `--btn-destructive-border`), `toggle-ds` (knob), `sheet` (botón cerrar).
- [x] Tokenizar shadcn crudo vía **alias de compatibilidad en `globals.css`** (`background/foreground/primary/popover/input/ring/destructive/muted-foreground/accent-foreground/...` → tokens semánticos). Arregla diálogos/sheets/selects que renderizaban con fondo transparente por tokens indefinidos.
- [x] `border-color` por defecto = `--border` (compat Tailwind v4, `@layer base`).
- [x] Remapear legacy dark: `skeletons.tsx` y `pull-to-refresh.tsx` (`slate/emerald/indigo/surface-raised` → tokens).
- [x] **Bug arreglado**: `.skeleton-shimmer` no estaba definido en ningún CSS (skeletons invisibles) → agregado tokenizado en `globals.css`.
- [x] `npm run build` verde. Grep de control: 0 fugas en `src/components/ui`.
- [x] Eliminar `design_handoff_chanchito/components/*` (0 imports en todo el repo → **borrado**).
- [x] Neutralizar duplicados divergentes de tokens: banner de DEPRECADO en `design_handoff_chanchito/tokens.css` y `tailwind.tokens.ts` (SoT = `globals.css`). No borrados (los referencia el README; se limpian en Fase 4).

> Nota Fase 2: `muted` queda conflaciado (shadcn `bg-muted` usa nuestro `--muted` de texto). `bg-muted` en `table`/`alert-dialog-media` puede verse gris fuerte; baja prioridad (table casi sin uso en mobile). Para fondos sutiles usar `surface-2`.

## Fase 3 — Migración de aplicación (39 archivos, por lotes)
> ⛔ **BLOQUEO (2026-07-01):** el usuario está rearmando la home. NO tocar el Lote A
> (`/inicio` + `components/dashboard/*`) hasta que avise que terminó. Migrarlo recién ahí.
- [ ] **Lote A** — Dashboard (`/inicio`, `components/dashboard/*`, `balance-card`, `trend-chart`, `expenses-chart`, **+ `components/goals/budget-overview-strip.tsx`** diferido del Lote D). ⛔ EN PAUSA (rediseño de home en curso).
- [x] **Lote B** — Movimientos y transacciones ✅ (3 archivos: `transactions/edit-transaction-dialog`, `transactions/quick-add`, `shared/transaction-item`). Build verde, 0 fugas. `movimientos/page`, `transaction-form-fields` y `create-transaction-dialog` ya estaban limpios. `text-white` del swipe "Eliminar" (sobre `bg-bad`) → `text-accent-ink`.
- [x] **Lote C** — Compromisos / cuotas / suscripciones / medios de pago ✅ (7 archivos: `installments/edit-plan-dialog`, `subscriptions/edit-subscription-dialog`, `medios-pago/{personal-debt-card,delete,edit,detail-modal,institutional-card}`). Build verde, 0 fugas. Tokens indefinidos `surface-raised`/`surface-overlay` reemplazados por `surface`/`surface-2`. **A confirmar:** tipo de tarjeta (crédito=violeta / débito=azul) colapsó a `accent` único; distinción queda por ícono+label. ¿Querés esquema de dos tonos con tokens?.
- [~] **Lote D** — Objetivos / presupuestos / metas. Migrados 3 diálogos (`edit-budget-dialog`, `edit-savings-goal-dialog`, `add-contribution-dialog`); build verde, 0 fugas. **`budget-overview-strip.tsx` DIFERIDO al Lote A** (se renderiza en `page.tsx`/home y está en el spec de rediseño del dashboard). Emerald mapeado role-aware: CTA/foco/toggle → `accent` (confirmado en prototipo `variant="accent"`), éxito/celebración → `good`.
- [x] **Lote E** — Inversiones ✅ (3 archivos: `portfolio-distribution`, `risk-analysis`, `payment-calendar`). Build verde, 0 fugas. **Se agregó escala de datos categórica** `--chart-1..9` + `--chart-ars`/`--chart-usd` en `globals.css` (derivada de primitivos). Charts recharts consumen `var(--chart-N)` en `fill` y `var(--surface/border/text/muted)` en tooltips/legend. Categorías payment-calendar: cupón→accent, dividendo→good, vencimiento→warn. ⚠️ **Verificar visualmente**: `var()` en `fill` de recharts `<Cell>` (patrón shadcn; debería resolver en navegadores modernos).
- [x] **Lote F** — Onboarding, ajustes, login, perfil, categorías, shared genéricos ✅ (16 archivos). Build verde, 0 fugas. Chat ya estaba limpio. **Diferidos a otros lotes:** `transactions/*` + `shared/transaction-item` → Lote B; `page.tsx` + `dashboard/*` + `budget-overview-strip` → Lote A. Decisiones: indigo/violet/blue → `accent`; emerald → `good` (acá NO es CTA); onboarding-tour tooltip = superficie `accent` (texto `accent-ink`); `confetti` lee primitivos en runtime (canvas no usa CSS vars); íconos decorativos de features/tipos colapsaron a `accent`. **Nota:** los wrappers de página usan `bg-surface` (blanco) en vez de `bg-bg` (crema) — es token válido, no fuga; corregir a `bg-bg` es decisión de diseño aparte.
- Por lote: aplicar tabla de reemplazo → `npm run lint` + `npm run build` → verificación visual contra prototipo.

## Fase 4 — Guardarraíles y documentación
- [ ] Regla ESLint / script grep en CI que falle ante `emerald-*|rose-*|slate-*|#hex` para UI en `src/`.
- [ ] Actualizar `CLAUDE.md` con sección de 3 capas + tabla token→uso.
- [ ] Actualizar/archivar `design_handoff_chanchito/` (README → `globals.css` como SoT).
- [ ] (Opcional) Página `/dev/tokens` living styleguide.

## Pendientes sueltos (fixes fuera de los lotes)
- [x] **Toasts (sonner)** ✅ — `theme="dark"` hardcodeado → `light`; `--popover`/`--radius` (indefinidos) → `--surface`/`--text`/`--border`/`--radius-lg`; el layout usa `richColors`, así que se definieron `--success/error/warning/info-*` como tintes suaves (`color-mix`) de `good/bad/warn/accent` con texto legible + íconos coloreados. Build verde.
- [x] **Fondos de página → `bg-bg` (crema)** ✅ — `ajustes/perfil`, `ajustes/categorias`, `ajustes/medios`, `perfil`, `login` usaban `bg-surface`/`bg-[var(--surface)]` (blanco) → `bg-bg`.
- [x] **Login: fallback de Suspense** ✅ — `<div>Cargando...</div>` pelado → `<Loader size="lg" centered text />`.
- [x] **MainNav** ✅ — sombra `rgba(28,42,71,.4)` hardcodeada → `rgb(var(--navy-700-rgb)/.4)`. Nav/app-shell ya estaban 100% tokenizados.
- [x] **Loadings revisados** ✅ — `loading.tsx` global, `FullPageLoader`, `Loader`, skeletons: todos tokenizados. Único ad-hoc era el fallback del login (arreglado).
- [x] **Modales / transiciones (bug de raíz)** ✅ — `tw-animate-css` estaba instalado pero **nunca importado** en `globals.css` → TODAS las animaciones Radix (dialog/sheet/dropdown/popover/select) eran no-op ("sin transición de nada"). Se agregó `@import "tw-animate-css";`. Además, rediseño DS de modales: `DialogContent`/`AlertDialogContent` → `bg-surface text-text border-[1.5px] border-border shadow-float rounded-2xl`, transición desktop más ágil (`sm:duration-200 ease-out` zoom+fade); overlays unificados a `bg-text/40 backdrop-blur-sm`; espaciado header/footer y tipografía de título/descr. afinados; `Sheet` a `shadow-float` + bordes 1.5px. Build verde.
- [ ] Confirmar esquema de color crédito/débito (Lote C): hoy ambos = `accent`.

---

## Registro de sesiones
| Fecha | Fase | Qué se hizo | Próximo paso |
|---|---|---|---|
| 2026-06-30 | — | Plan creado y documentado. Decisiones congeladas. | Ejecutar Fase 1 |
| 2026-06-30 | 0 + 1 | Auditoría cerrada (Apéndices A/B). `globals.css` reescrito en 3 capas sin regresión; build verde. | Fase 2: sanear primitivas DS |
| 2026-07-01 | 2 | Alias shadcn en `globals.css`; primitivas y legacy dark saneados; `.skeleton-shimmer` agregado; build verde. | Fase 3 Lote A (Dashboard) |
| 2026-07-01 | 3-C | Duplicados del handoff resueltos (components borrado, tokens deprecados). Lote C migrado (7 archivos) a tokens; build verde, 0 fugas. | Lote D u otro (A sigue en pausa) |
| 2026-07-01 | 3-D | Lote D: 3 diálogos de objetivos migrados (emerald role-aware accent/good); build verde, 0 fugas. `budget-overview-strip` diferido al Lote A (vive en home). | Lote E o F (A en pausa) |
| 2026-07-01 | 3-E | Lote E: inversiones (3 archivos). Escala de datos `--chart-*` agregada a globals.css; charts a tokens; build verde, 0 fugas. Falta verificar visualmente var() en fill. | Lote F (A en pausa) |
| 2026-07-01 | 3-F | Lote F: 16 archivos (onboarding, ajustes, login, perfil, categorías, shared). Build verde, 0 fugas. Quedan Lote A (home, en pausa) y Lote B (movimientos/transactions). | Lote B, o Lote A cuando termine la home |
| 2026-07-01 | 3-B | Lote B: movimientos/transacciones (3 archivos). Build verde, 0 fugas. Único lote pendiente: A (home, en pausa). | Lote A cuando termine la home; luego Fase 4 |
| 2026-07-01 | pend | Fix toasts (sonner) → tema claro + tokens reales + richColors on-brand con color-mix. Build verde. | Más pendientes sueltos o Lote A |
| 2026-07-01 | pend | Fondos de página → bg-bg (5 pantallas); login fallback → Loader; sombra MainNav tokenizada; loadings revisados. Build verde. | Lote A cuando termine la home; luego Fase 4 |
| 2026-07-01 | pend | **Fix raíz: `@import "tw-animate-css"` faltante** (animaciones Radix no funcionaban). Rediseño DS de modales (dialog/alert/sheet): superficie/borde/shadow-float/rounded-2xl, transición desktop, overlays con blur, espaciado. Build verde. | Verificar visualmente; Lote A cuando termine la home |

---

## Apéndice A — Tabla de reemplazo (Fase 0, conteos reales en `src/**/*.tsx`)
| Uso hardcodeado (usos) | Token semántico | Notas |
|---|---|---|
| `slate-*` (519) | `text` / `muted` / `faint` / `border` / `surface`/`surface-2` | mapear por rol: 800/900→text, 500/600→muted, 400→faint, 200/border→border, 50/100→surface(-2) |
| `indigo-*`(80) `violet-*`(24) `purple-*`(17) `blue-*`(10) | `accent` (`accent-deep`/`accent-soft` según tono) | acento celeste |
| `emerald-*`(70) `green-*` | `good` | ingresos/positivo |
| `amber-*`(46) `yellow-*` | `warn` | atención |
| `rose-*`(28) `red-*`(13) | `bad` | gastos/negativo |

Hex sueltos a migrar (Fase 2/3): charts/donut en `portfolio-distribution`, `trend-chart`, `risk-analysis`, `expenses-chart` (paletas de series → usar primitivos de marca o una escala de datos dedicada); `confetti`/`page.tsx` (decorativos); `banner-ds` (→ tokens de componente, Fase 2). Nota: los charts pueden necesitar una **escala de datos categórica** propia (definir en Fase 2 si hace falta > tokens de marca disponibles).

## Apéndice B — Paleta primitiva (Fase 1, valores existentes, sin inventar)
| Grupo | Tokens |
|---|---|
| Celeste | 100 `#E4F0F6` · 200 `#CBE2EE` · 300 `#A9CFE0` · 500 `#5E98BC` · 700 `#3C708F` |
| Cream | 50 `#FBF7EC` · 100 `#F4EDDC` · 200 `#EAE0C6` |
| Navy | 400 `#34466A` · 500 `#22315A` · 700 `#1C2A47` · 800 `#292E3A` (hero) · 900 `#14203A` |
| Gold | 100 `#F7E4B6` · 300 `#F2CB6E` · 500 `#E3A938` · 700 `#B97E16` |
| Rojo | 200 `#E7A9A4` · 500 `#C2403A` · 700 `#9B2F2A` |
| Verde | 400 `#5FBE8C` · 600 `#2E7D5B` |
| Neutro | slate-500 `#5B6577` · white · black |
| RGB (alpha) | navy-700 `28 42 71` · cream-100 `244 237 220` · celeste-300 `169 207 224` |
