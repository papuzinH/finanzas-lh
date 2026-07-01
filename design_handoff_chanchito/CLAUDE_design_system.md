<!-- ============================================================
  Pegá este bloque dentro de tu CLAUDE.md existente,
  bajo un encabezado tipo "## Sistema de diseño (rediseño Chanchito)".
  ============================================================ -->

## Sistema de diseño — Chanchito (rediseño)

Estamos rediseñando la UI sobre el sistema "Chanchito": estética de **banca digital
argentina con aire vintage / papel impreso**. Cálido, con carácter, nunca corporativo-frío.
La fuente de verdad visual es `design_handoff_chanchito/` (tokens + prototipos HTML + UI Kit).

### Reglas no negociables
- **Color SOLO vía tokens.** Usá las CSS vars / clases Tailwind semánticas (`bg-surface`,
  `text-text`, `bg-accent`, `text-good/bad`). Nunca hardcodees hex nuevos. El acento por
  defecto es **celeste**; es conmutable reescribiendo `--accent*`.
- **Verde = ingreso/positivo, Rojo = gasto/negativo.** No usar para acento ni decoración.
- **Bordes de 1.5px** en todo el sistema (no 1px). `border-[1.5px] border-border`.
- **Números siempre `tabular-nums`** (clase `.tnum`) para que alineen en columnas.
- **Tipografía por rol:** `font-poster` (Alfa Slab One) para saldos/títulos/números display;
  `font-sans` (DM Sans) para toda la UI; `font-serifd` (Bodoni) solo frases editoriales;
  `font-script` (Yellowtail) solo el tagline. Nunca poster en texto de párrafo.
- **Botones:** pill (`rounded-full`) con sombra-offset sólida (`shadow-offset`) que se
  hunde al presionar (`active:translate-y-[2px]`). No sombras difusas en botones.
- **Cards:** `rounded-2xl bg-surface border-[1.5px] border-border shadow-card`.
  La tarjeta de saldo/portfolio es la excepción: fondo `bg-hero` (navy) con `shadow-float`.
- **Mobile-first**, canvas base 392px. Touch targets ≥ 44px. Margen lateral de pantalla 20px.
- **Sin AI-slop:** nada de gradientes random, ni cards con borde-acento a la izquierda,
  ni emojis fuera de los ya usados (categorías y microcopy puntual). Menos es más.

### Tono de copy (es-AR)
Cercano, rioplatense, sin solemnidad. "Tus mangos", "che", "vas piola", "la guita".
Microcopy corto. Montos con formato `$ 1.186.430` (es-AR, sin decimales salvo USD).
Bimonetario: ARS por defecto, USD con tag de cotización (MEP/CCL/blue) tomada al momento.

### Inventario de componentes (ver UI Kit para variantes)
**Primitivas** (en `design_handoff_chanchito/components/`):
`Icon`, `Button` (variant: accent|navy|soft|ghost · size: sm|md|lg), `Card`, `Chip`,
`Progress` (tone: accent|good|warn|bad), `Toggle`, `Tabs`, `Banner` (tone: warn|info|accent).

**Patrones de dominio** (recrear contra la API real, usando los prototipos como referencia visual):
- `BalanceCard` — saldo del mes, 3 layouts (hero / split / stat).
- `MovItem` — fila de transacción (ícono categoría + medio de pago + monto, tag USD opcional).
- `InstallmentCard` — plan de cuotas con progreso paid/count.
- `SubItem` — suscripción con toggle activa/pausada.
- `GoalCard` — meta de ahorro (ARS o USD, check al 100%).
- `BudgetRow` — presupuesto por categoría (estado en regla/atención/excedido).
- `AssetRow` — activo de inversión (P&L coloreado, valor en ARS/USD).
- `ChatPanel` + `ChatFab` — chat con IA (burbujas, typing, tarjeta de gasto confirmado).
- `BottomNav` (5 destinos), `ScreenHeader` (kicker + título poster + sub).

### Mapa pantalla → datos (usar los endpoints existentes)
- **/inicio** — saldo del mes, tendencia 6m, comparador de categorías, insights, últimos movimientos, presupuestos.
- **/movimientos** — `transactions` agrupadas por día, filtros por categoría y medio de pago.
- **/compromisos** — tabs: `installment_plans` (cuotas) y `recurring_plans` (suscripciones).
- **/objetivos** — tabs: `savings_goals` (metas) y `category_budgets` (presupuestos).
- **/inversiones** — tabs: resumen (donut por tipo) / `investment_assets` + `market_prices` / cargar. Bimonetario.

### Flujo de implementación sugerido
1. Importar `tokens.css` en `globals.css` y mergear `tailwind.tokens.ts` en la config (`darkMode: "class"`).
2. Sumar las 4 fuentes (ver `fonts.md`).
3. Llevar las primitivas de `components/` a tu carpeta de UI (ya son módulos Next, sin deps de datos).
4. Rediseñar pantalla por pantalla: tomar el componente de dominio del prototipo como referencia
   visual y cablearlo a los endpoints reales. NO portar el dataset demo (`data.jsx`).
5. Verificar contra el prototipo (`Chanchito App.html`) y el UI Kit (`Chanchito UI Kit.html`).
