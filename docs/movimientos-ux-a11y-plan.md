# Plan de mejora UX / Accesibilidad — Pantalla Movimientos (mobile)

> **Objetivo:** relevamiento de accesibilidad, UX y usabilidad de la pantalla **Movimientos** y todos los componentes que intervienen (lista, creación, edición, filtros, búsqueda). Este documento es para **ejecutar en una sesión distinta**: contiene hallazgos priorizados con evidencia (`archivo:línea`), la regla violada y la corrección propuesta, más un plan por fases con checklists y criterios de verificación.
>
> **Metodología:** heurísticas del skill `ui-ux-pro-max` (prioridades 1→10: Accesibilidad → Touch → Performance → …) + WCAG 2.1 AA. Los ratios de contraste se calcularon sobre los tokens de `src/app/globals.css` / `design_handoff_chanchito/tokens.css`.
>
> **Regla del proyecto a respetar en todos los fixes:** tokens semánticos SIEMPRE (`text-muted`, `text-faint`, `bg-surface`, `border-border`, `text-good/bad/warn`), botones/cards del design system, `parseLocalDate`, lógica de negocio en el store, mobile-first (canvas 392px, touch ≥44px). Ver `CLAUDE.md`.

---

## 0. Decisiones confirmadas (validadas con producto)

Estas decisiones ya están tomadas; ejecutar sin volver a preguntar:

| # | Decisión | Qué implica |
|---|---|---|
| **Editar/borrar mobile** | **Tap en la fila → action sheet** (Editar / Eliminar). El swipe se mantiene como atajo. | Hace la fila `tappable`; reutilizar un bottom sheet (el `DialogContent` ya es sheet en mobile) o crear un action sheet accesible. Acciones con nombre accesible. |
| **Filtros mobile** | **Botón "Filtros" visible con badge** de filtros activos. | El botón despliega los chips (mantener la animación grid-rows). Badge = cantidad de filtros activos. Reemplaza el "revelar al enfocar el buscador". |
| **Montos rápidos** | **Basados en el historial** del usuario (por tipo). | Requiere un **nuevo getter en el store** (ver `store-getter` skill). Reutilizar la lógica de `getFrequentTransactions`/`getFrequentCategories` (ya calculan `avgAmount`). |
| **Extras** | **Se incluyen los 3:** Neto en mobile · Deshacer al eliminar · Alinear Select a tokens. | Todos pasan a alcance confirmado (ya no son opcionales). |

---

## 1. Inventario de componentes relevados

| Componente | Archivo | Rol en el flujo |
|---|---|---|
| Pantalla Movimientos | `src/app/movimientos/page.tsx` | Header sticky, buscador, resumen del mes, filtros, lista agrupada por día, proyección futura |
| Item de transacción | `src/components/shared/transaction-item.tsx` | Fila de la lista + swipe (mobile) + dropdown (desktop) + borrar |
| Diálogo crear | `src/components/transactions/create-transaction-dialog.tsx` | Alta de movimiento |
| Diálogo editar | `src/components/transactions/edit-transaction-dialog.tsx` | Edición de movimiento |
| Campos del formulario | `src/components/transactions/transaction-form-fields.tsx` | Monto, moneda, tipo, descripción, categoría, medio de pago, fecha |
| Chip de filtro | `src/components/ui/chip.tsx` | Filtros por medio/categoría |
| Selector de mes | `src/components/dashboard/month-selector.tsx` | Navegación de mes (swipe/botones) |
| Botón + animado | `src/components/shared/animated-plus-button.tsx` | CTA crear |
| Modal de confirmación | `src/components/shared/confirmation-modal.tsx` | Confirmación de borrado |
| Dialog / Input / Select base | `src/components/ui/{dialog,input,select}.tsx` | Primitivos UI |
| Quick add | `src/components/transactions/quick-add.tsx` | Alta rápida por frecuentes |

---

## 2. Hallazgos priorizados

Prioridad: **P0** bloqueante (accesibilidad grave / bug) · **P1** alto (AA / usabilidad) · **P2** medio (pulido) · **P3** menor.

### P0 — Bloqueantes

#### P0-1 · Editar y eliminar en mobile dependen solo del swipe (sin alternativa visible)
- **Evidencia:** `transaction-item.tsx:91` (`canSwipe = isMobile && !installment_plan_id`), el menú de acciones (kebab) se renderiza **solo** cuando `!canSwipe` → `transaction-item.tsx:222-259`. La fila (`cardInner`) **no tiene `onClick`**, así que tocarla no hace nada. No hay pista visual de que se puede deslizar.
- **Reglas violadas:** `gesture-alternative` (nunca depender de gestos para acciones críticas), `swipe-clarity` (el swipe debe tener affordance/hint), `touch-target`/`keyboard-nav` (usuarios de teclado o lector de pantalla en mobile web quedan sin forma de editar/eliminar).
- **Impacto:** un usuario que no descubre el swipe no puede editar ni borrar; lector de pantalla no tiene ninguna acción.
- **Corrección (decisión confirmada — tap → action sheet):**
  1. Hacer la fila `tappable`: al tocarla abre un **action sheet** con "Editar" y "Eliminar" (botones ≥44px, con nombre accesible).
  2. Reutilizar el patrón de bottom sheet existente (`DialogContent` ya se comporta como sheet en mobile) o un componente de action sheet dedicado; foco atrapado + Escape + restauración.
  3. Mantener el **swipe como atajo** (no como único método). Agregar hint sutil de swipe.
  4. Cuidado: no romper el caso `installment_plan_id` (esas filas hoy no editan; mantener el mensaje "Gestionar en Cuotas").

#### P0-2 · El toggle "Proyección Futura" es un `<div onClick>` no accesible por teclado
- **Evidencia:** `page.tsx:308-320` — cabecera colapsable con `onClick={onToggle}` sobre un `<div>`, sin `role`, sin `tabindex`, sin `aria-expanded`, sin handler de teclado.
- **Reglas violadas:** `keyboard-nav`, `focus-states`, `aria-labels`.
- **Corrección:** convertir la cabecera colapsable en `<button type="button">` con `aria-expanded={isOpen}` y `aria-controls` apuntando al contenedor de la sección. Mantener el estilo visual actual.

#### P0-3 · Bug al editar transacciones en USD: se pierde moneda/cotización y se muestra el monto en ARS
- **Evidencia:** `edit-transaction-dialog.tsx:88-100`. El `form.reset(...)` que corre al abrir (`open`) **omite** `currency`, `rate_pair`, `exchange_rate` y setea `amount: Math.abs(transaction.amount)` (el valor convertido a ARS), a diferencia de los `defaultValues` del `useForm` que sí computan el original USD (`edit-transaction-dialog.tsx:61-76`). Con `reset` parcial, React Hook Form deja los campos omitidos en `undefined`.
- **Impacto:** al editar un movimiento en USD, el diálogo abre con el monto en pesos y sin la moneda seleccionada; al guardar puede degradarse a ARS. Para movimientos en ARS, el toggle de moneda queda sin resaltar.
- **Corrección:** el objeto del `reset` debe replicar exactamente la lógica de `defaultValues` (incluyendo `amount` original si `original_currency === 'USD'`, `currency`, `rate_pair`, `exchange_rate`). **Verificar end-to-end** editando una tx USD y una ARS.

---

### P1 — Alto (WCAG AA / usabilidad importante)

#### P1-1 · Contraste insuficiente en texto pequeño con `text-faint` y `text-warn`
- **Cálculo (light mode, sobre `--surface #FFFFFF`):**
  - `--faint: rgba(28,42,71,0.50)` ≈ **3.0:1** → **falla** AA (4.5:1) para texto normal.
  - `--warn: #E3A938` ≈ **2.1:1** → **falla** severo como color de texto.
- **Evidencia de uso:** fechas y meta de la fila `transaction-item.tsx:216` (`text-faint`, 11px) y fecha futura `transaction-item.tsx:212` (`text-warn`, 11px); cabecera "Proyección Futura" `page.tsx:527` (`text-warn`); placeholder del buscador `page.tsx:405` (`placeholder:text-faint`); separadores/labels varios.
- **Reglas violadas:** `color-contrast`, `color-accessible-pairs`, `contrast-readability`.
- **Corrección:**
  - Fechas/meta: usar `text-muted` (≈5:1) en lugar de `text-faint` para texto informativo.
  - Estado "futuro": no usar `text-warn` como color de texto chico sobre crema; usar `text-muted`/`text-text` + un badge/ícono `warn` (color solo como refuerzo, no como portador único de significado → también cumple `color-not-only`).
  - Revisar `text-faint` en labels pequeños del formulario; reservarlo para elementos decorativos, no para contenido.

#### P1-2 · Estado "seleccionado" no anunciado a lectores de pantalla en toggles y chips
- **Evidencia:** segmented controls y chips construidos con `<button>` sin `aria-pressed` / `role="radiogroup"`:
  - `TypeToggle` (Gasto/Ingreso) `transaction-form-fields.tsx:170-188`
  - `CurrencyField` (ARS/USD + pills de cotización) `transaction-form-fields.tsx:831-874`
  - Quick amounts `transaction-form-fields.tsx:122-143`
  - `CategoryPicker` (frecuentes + grid) `transaction-form-fields.tsx:264-339`
  - `Chip` de filtros `chip.tsx:16-32`
- **Reglas violadas:** `aria-labels`, `voiceover-sr`, `color-not-only` (la selección se comunica sobre todo por color de fondo).
- **Corrección:** agregar `aria-pressed={active}` a los chips/toggles binarios, o `role="radiogroup"` + `role="radio" aria-checked` cuando corresponda (tipo, moneda, cotización). Añadir `aria-label` donde el contenido no sea texto claro.

#### P1-3 · Los cambios de filtro y el resultado de búsqueda no se anuncian
- **Evidencia:** el contador "N movimientos encontrados" es un `<p>` sin `aria-live` → `page.tsx:425-430`. Al filtrar/buscar, un lector de pantalla no percibe que la lista cambió.
- **Reglas violadas:** `voiceover-sr`, `toast-accessibility` (patrón de región viva).
- **Corrección:** envolver el contador (o una región asociada a la lista) con `aria-live="polite"`. Considerar anunciar también "sin resultados".

#### P1-4 · Descubribilidad de filtros en mobile
- **Evidencia:** en mobile los filtros están **ocultos** y solo se revelan al enfocar el buscador (`page.tsx:181-194` `handleSearchFocus`/`handleSearchBlur`, y bloque `page.tsx:470-486`). No hay botón/label "Filtros" ni indicación persistente de que existen o de que hay filtros activos cuando el panel está colapsado.
- **Reglas violadas:** `progressive-disclosure` (mal aplicada: esconde una función principal detrás de un gesto no obvio), `content-priority`, `empty-nav-state`.
- **Corrección (decisión confirmada — botón "Filtros" con badge):** agregar un botón visible "Filtros" junto al buscador, con `aria-expanded`/`aria-controls` y un **badge** con la cantidad de filtros activos. El tap despliega/colapsa el panel de chips (mantener la animación grid-rows, no genera CLS). Reemplaza el reveal por foco del buscador (`handleSearchFocus`/`handleSearchBlur` en `page.tsx:181-194` — se puede eliminar). Mantener "Limpiar filtros".

#### P1-5 · Touch targets por debajo de 44px en chips y pills
- **Evidencia:** `Chip` = `px-3.5 py-2 text-[12.5px]` ≈ **~34px** de alto (`chip.tsx:20-21`); pills de cotización `py-1.5` ≈ **~30px** (`transaction-form-fields.tsx:864-871`); chips de quick-add `py-2` (`quick-add.tsx:39`).
- **Reglas violadas:** `touch-target-size` (mín 44×44), `no-precision-required`.
- **Corrección:** subir a `min-h-11` (44px) los chips de filtro y las pills de cotización, o ampliar el hit area con padding/`hitSlop` equivalente sin romper el layout horizontal.

#### P1-6 · Cobertura de `prefers-reduced-motion`
- **Evidencia:** hay varias animaciones que no consultan reduced-motion: swipe con framer-motion (`transaction-item.tsx`), slide del selector de mes (`month-selector.tsx:77-104`), `animate-pulse` del punto de fecha futura (`transaction-item.tsx:213`), `animate-in slide-in-*` de secciones (`page.tsx:307`), y la secuencia por timers del `AnimatedPlusButton` (`animated-plus-button.tsx:27-51`). Solo el panel de filtros usa `motion-reduce:transition-none` (`page.tsx:477`).
- **Reglas violadas:** `reduced-motion`, `animation-optional`.
- **Corrección:** gate global por `prefers-reduced-motion` (desactivar/atenuar). Para framer-motion, usar `useReducedMotion()`. Para `AnimatedPlusButton`, saltar la secuencia de auto-expandir/colapsar cuando reduced-motion esté activo.

---

### P2 — Medio (pulido / robustez)

#### P2-1 · `useIsMobile` con estado inicial `false` → flash y posible mismatch de hidratación
- **Evidencia:** `transaction-item.tsx:31-52`. En el primer render `isMobile=false` → se pinta la variante desktop (dropdown, `pr-10`) y luego cambia a swipe. En una lista larga esto es un salto visible.
- **Reglas violadas:** `content-jumping`/`reduce-reflows`.
- **Corrección:** resolver la variante con CSS (`md:` breakpoints) siempre que sea posible, o inicializar con `matchMedia` de forma consistente (evitar branch de render que altere el DOM). Idealmente el swipe/dropdown no debería cambiar el markup base.

#### P2-2 · `AmountField`: doble tab-stop y semántica confusa; falta autofocus
- **Evidencia:** `transaction-form-fields.tsx:87-115`. Hay un `<button>` que muestra el monto (tab-stop) **y** un `<input type=number>` `sr-only` (otro tab-stop). El botón no tiene `aria-label` (lee "$ 0.00 button").
- **Reglas violadas:** `keyboard-nav`, `aria-labels`, `input-type-keyboard`.
- **Corrección:** sacar el botón del orden de tabulación (`tabIndex={-1}` + `aria-hidden`) dejando el input como único control, o unificar en un solo elemento. Considerar `autofocus` del monto al abrir el diálogo de creación (entrada rápida).

#### P2-3 · Quick amounts fijos poco útiles para pesos y no se adaptan a moneda
- **Evidencia:** `QUICK_AMOUNTS = [100, 500, 1000]` (`transaction-form-fields.tsx:25`), etiquetados `$100/$500/$1000` aun en modo USD.
- **Corrección (decisión confirmada — basados en historial):** reemplazar `QUICK_AMOUNTS` fijos por montos sugeridos del historial del usuario, por `type`. Crear un **getter en el store** (seguir el skill `store-getter`), reutilizando la lógica ya existente de `getFrequentTransactions`/`getFrequentCategories` (calculan `avgAmount`). Fallback razonable si el usuario no tiene historial suficiente.

#### P2-4 · Falta el "Neto" en el resumen mobile
- **Evidencia:** mobile muestra solo Ingresos/Gastos (`page.tsx:444-463`); el "Neto" existe únicamente en el rail desktop (`page.tsx:559-569`).
- **Corrección (confirmada):** mostrar el neto también en mobile. Mantener `tnum` y `text-good/bad` con signo.

#### P2-5 · Sin "deshacer" tras eliminar
- **Evidencia:** `transaction-item.tsx:109-124` borra directo; el modal advierte "no se puede deshacer" (`transaction-item.tsx:269`).
- **Regla:** `undo-support`.
- **Corrección (confirmada):** toast con acción "Deshacer" tras eliminar. Definir mecanismo en la ejecución: (a) demorar el borrado real en el server unos segundos con opción de cancelar, o (b) borrar y permitir recrear la transacción desde el payload. Preferir (a) para no cambiar el `id`. Sonner soporta `toast(..., { action })`.

#### P2-6 · `Select` base usa tokens shadcn ajenos al design system
- **Evidencia:** `select.tsx` usa `bg-popover`, `text-popover-foreground`, `border-input`, `text-muted-foreground`. En `PaymentMethodField` se sobreescriben, pero es frágil para dark mode/consistencia.
- **Regla:** `token-driven theming`, regla del proyecto "tokens semánticos SIEMPRE".
- **Corrección:** alinear el `Select` base a `bg-surface`, `text-text`, `border-border`, `text-muted`.

---

### P3 — Menores / nice-to-have

- **P3-1 · Tipografías muy pequeñas:** labels de categoría a `text-[9px]`/`text-[10px]` (`transaction-form-fields.tsx:335`) y varios `[10px]/[11px]` de meta. Revisar legibilidad (`readable-font-size`). Subir mínimos donde sea contenido.
- **P3-2 · Búsqueda por monto** usa `t.amount` (ARS convertido), no el `original_amount` en USD (`page.tsx:99-104`). Coherencia de búsqueda.
- **P3-3 · Scroll horizontal de chips sin affordance:** `overflow-x-auto scrollbar-hide` (`page.tsx:205`) no indica que hay más chips. Considerar fade/edge hint.
- **P3-4 · `scroll-margin`/foco:** al enfocar campos bajo el header sticky (`page.tsx:358`), verificar que no queden tapados; agregar `scroll-margin-top` si aplica.

---

## 3. Plan de ejecución (para la próxima sesión)

Ejecutar por fases; cada fase termina con verificación real (no solo typecheck). Sugerido: rama `feat/movimientos-a11y-ux`.

### Fase 0 — Setup
- [ ] Crear rama desde `master`.
- [ ] Confirmar que `npm run dev`, `npm run lint`, `npm test` corren OK como baseline.

### Fase 1 — P0 (bloqueantes)
- [ ] **P0-3 (EJECUTAR PRIMERO — riesgo de datos)** Corregir el `reset` del diálogo de edición (`edit-transaction-dialog.tsx:88-100`) para replicar los `defaultValues` del `useForm`: `amount` original si `original_currency === 'USD'`, `currency`, `rate_pair`, `exchange_rate`. **Probar editando una tx USD y una ARS** antes de seguir. Es un quick-win aislado y verificable.
- [ ] **P0-1** Fila `tappable` → **action sheet** (Editar/Eliminar, ≥44px, accesible) + swipe como atajo. Respetar el caso cuotas.
- [ ] **P0-2** Convertir cabecera colapsable "Proyección Futura" en `<button>` con `aria-expanded`/`aria-controls`.
- [ ] Verificación Fase 1 → ver §4.

### Fase 2 — P1 (accesibilidad AA / usabilidad)
- [ ] **P1-1** Reemplazar `text-faint`/`text-warn` en textos pequeños por tokens con contraste ≥4.5:1; estado "futuro" con ícono/badge + color de refuerzo.
- [ ] **P1-2** `aria-pressed`/`role=radiogroup` en toggles y chips (tipo, moneda, cotización, categorías, filtros).
- [ ] **P1-3** `aria-live="polite"` en contador de resultados / región de lista.
- [ ] **P1-4** Botón "Filtros" con badge de activos en mobile (`aria-expanded`); quitar el reveal por foco del buscador.
- [ ] **P1-5** Touch targets ≥44px en `Chip` y pills de cotización.
- [ ] **P1-6** Cobertura `prefers-reduced-motion` (framer `useReducedMotion`, pulse, slides, AnimatedPlusButton).
- [ ] Verificación Fase 2 → ver §4.

### Fase 3 — P2 (pulido, alcance confirmado)
- [ ] **P2-1** Estabilizar variante mobile/desktop de la fila (CSS `md:` en vez de flash JS).
- [ ] **P2-2** `AmountField`: un solo tab-stop + `aria-label`; evaluar autofocus.
- [ ] **P2-3** Quick amounts basados en historial → **nuevo getter en el store** (`store-getter`).
- [ ] **P2-4** Neto en resumen mobile.
- [ ] **P2-5** Undo tras eliminar (toast con acción; preferir demorar el borrado server).
- [ ] **P2-6** Alinear `Select` base a tokens del proyecto (revisar dark mode).

### Fase 4 — P3 (si hay tiempo)
- [ ] P3-1…P3-4 según capacidad.

---

## 4. Criterios de verificación / QA

**Funcional (obligatorio, en la app real — no solo tests):**
- [ ] Crear un movimiento ARS y uno USD; verificar montos, moneda y cotización correctos.
- [ ] **Editar** un movimiento USD: abre con monto en USD y moneda seleccionada; guarda sin degradar a ARS.
- [ ] Editar/eliminar accesible en mobile **sin** usar swipe (kebab/action sheet).
- [ ] Colapsar/expandir "Proyección Futura" con teclado (Enter/Espacio) y con lector de pantalla anunciando estado.

**Accesibilidad:**
- [ ] Recorrido solo con teclado (Tab/Shift+Tab/Enter/Escape) en lista, filtros y ambos diálogos; foco visible siempre; foco atrapado y restaurado en diálogos.
- [ ] Lector de pantalla (VoiceOver/NVDA o TalkBack): toggles/chips anuncian estado seleccionado; el contador de resultados se anuncia al filtrar.
- [ ] Contraste: verificar con herramienta que ningún texto informativo quede <4.5:1 (revisar fechas, estado futuro, placeholder).
- [ ] `prefers-reduced-motion` activo: sin animaciones molestas (pulse, slides, auto-expand del +).
- [ ] Zoom del sistema / Dynamic Type grande: sin truncados que rompan el layout.

**Responsive / touch:**
- [ ] Probar en 375px y 392px, y en landscape.
- [ ] Todos los targets táctiles ≥44px (chips, pills, kebab, botones).
- [ ] Sin scroll horizontal de la página; sin CLS al cargar la lista.
- [ ] Contenido no tapado por header sticky ni por BottomNav (`pb-28`).

**Regresión:**
- [ ] `npm run lint` sin nuevos errores.
- [ ] `npm test` (recordar: `dates.test.ts` tiene fallas preexistentes ajenas).
- [ ] Dark mode revisado (contraste y estados en ambos temas).

---

## 5. Fuera de alcance / notas de implementación
- **Todas las decisiones de producto quedaron cerradas** (ver §0): tap→action sheet, botón Filtros con badge, quick amounts por historial, y los 3 extras (Neto, Undo, Select).
- **Nuevo getter en el store** para quick amounts por historial: seguir el skill `store-getter`; incluir su test siguiendo el patrón de `lib/store/__tests__/`.
- **Undo (P2-5):** definir en ejecución el mecanismo (preferido: demorar el borrado real en el server para no cambiar el `id`).
- No se toca la lógica de negocio del store salvo: (a) el getter nuevo de P2-3, y (b) lo mínimo para P0-3 (que es de UI/form, no de store).

---

## 6. Resumen ejecutivo
- **3 bloqueantes (P0):** acciones editar/eliminar inaccesibles en mobile (solo swipe), toggle colapsable no accesible por teclado, y **bug al editar transacciones en USD**.
- **6 de alto impacto (P1):** contraste AA (`text-faint`/`text-warn`), estados no anunciados en toggles/chips, cambios de filtro/búsqueda sin `aria-live`, descubribilidad de filtros en mobile, touch targets <44px, y cobertura de reduced-motion.
- **6 de pulido (P2)** + **4 menores (P3)**.

El mayor riesgo real de datos es **P0-3** (edición USD): priorizarlo y verificarlo end-to-end.
