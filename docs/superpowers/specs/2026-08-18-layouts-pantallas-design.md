# Layouts de pantallas — identidad v2, segunda etapa

**Fecha**: 2026-08-18 · **Estado**: aprobado en diseño, pendiente de plan
**Etapa previa**: `2026-08-14-design-system-identidad-v2-design.md` (el sistema — tokens, fuentes, marca, PWA — implementado en los 11 commits del 18-ago).

## Objetivo

La app habla el idioma del diseño pero todavía no ES el diseño: la estructura de pantalla de **Movimientos, Compromisos, Objetivos e Inversiones** sigue siendo la del repo viejo. Esta etapa lleva los layouts de los mocks al código. Dashboard, Chat, Login y Ajustes ya quedaron alineados en la etapa 1.

## Fuente de verdad

- **Layouts**: los HTML de `../claude-design/` (carpeta hermana del repo, snapshot 2026-08-14 con la identidad final): `Movimientos-render.html`, `Compromisos-render.html`, `Objetivos-render.html`, `Inversiones-render.html` + variantes `*Noche`. Día y noche comparten estructura; los colores en el código salen de los tokens ya implementados, nunca copiados del mock.
- **Tokens y componentes**: los del repo (`globals.css`, `src/components/ui/*`). El mock usa primitivos inline (`--celeste-700`); la implementación usa los semánticos del sistema.
- ⚠️ El proyecto "Design System" de claude.ai (`561f1c38…`) quedó **obsoleto** (snapshot pre-identidad final del 13-ago: Alfa Slab, sello viejo, filete, sin tema Noche). **No usarlo como referencia.** Las 12 estampillas que contiene quedan explícitamente fuera de alcance (los mocks finales no las usan).

## Reglas duras

1. **Solo capa de presentación**: componentes de pantalla y presentacionales. Prohibido tocar `lib/finance/`, los getters del store, las actions y los handlers del chat. Los números no cambian; cambia cómo se muestran.
2. **Mock manda en estructura** (orden, secciones, tabs, cards, jerarquía); **ninguna funcionalidad existente se pierde**: lo que el mock no dibuja (diálogos de crear/editar/borrar, banners de estado, selectores) se conserva re-estilado según el sistema y ubicado donde el layout nuevo lo permita.
3. Tokens semánticos siempre; tipografía por rol (`--font-display` cifras y títulos, `--font-sans` UI, `--font-serif` sello/cintas); `tnum` en todo número financiero; bordes `1.5px`; una sola cifra con `--shadow-bandera` por pantalla.
4. Sin base DEV: el dev local opera sobre producción. Este laburo no ejecuta acciones de escritura al verificar.

## Cambio transversal: la nav pasa de 6 a 5 destinos

Los mocks muestran la bottom nav con **Inicio · Movimientos · Compromisos · Objetivos · Más** — Inversiones deja la barra y pasa a vivir bajo "Más" (en el mock de Inversiones, el destino activo es "Más").

- `mobileItems` de `main-nav.tsx` queda en 5; **"Más" abre un sheet** (el mock no lo dibuja — decisión propia siguiendo el sistema) con: Inversiones, Medios de pago, Ajustes.
- "Más" se pinta activo cuando el pathname es cualquiera de esos destinos.
- **Desktop sidebar sin cambios** (los mocks son mobile; la sidebar de 6 ítems sigue).

## Por pantalla

Cada pantalla abandona el `ScreenHeader` con kicker por el **header compacto del mock**: `h1` en display 22px + acción a la derecha. Se implementa como variante compacta de `ScreenHeader` (o header por pantalla si la variante fuerza la API), y el FAB del chancho ya existente se mantiene.

### Objetivos (piloto)

- Header: "Objetivos" + botón `+` redondo accent (nueva meta).
- **Desaparecen el hero y las tabs Metas/Presupuestos**: las dos secciones van apiladas — "Metas de ahorro" (sub: "Ponele un objetivo a tu ahorro") y "Presupuestos mensuales" (sub: "Controlá en qué gastás").
- Card de meta: slot de icono 38px (emoji del usuario; chancho para metas de ahorro sin emoji), nombre + subtítulo contextual (moneda / fecha de inicio o meta), **% en display celeste** a la derecha, barra 8px, pie "$X de $Y · faltan $Z".
- Card de presupuesto (compacta, radio 16): emoji + nombre + "usado / tope", barra 7px en `good`/`bad`, línea de estado con copy rioplatense ("74% usado · quedan $41.300 para 17 días" / "Te pasaste $6.300 · frená un toque" / "venís bien").
- Conservar: crear/editar/borrar metas y presupuestos, metas completadas (sub-sección), aportes a metas.

### Movimientos

- Header: "Movimientos" + pill del mes (`month-selector` actual re-estilado) + botón `+` (diálogo de nueva transacción).
- Buscador pill + botón de filtros (la búsqueda/filtros existentes, con esta piel).
- Fila de chips scrolleable: "Todos" + un chip por medio de pago + "Categorías".
- Card **Entró / Salió** (2 columnas, sin "Neto" — hoy son 3 métricas).
- Card colapsable **"Fijos por pagar"** (N pendientes, total en `gold`, expande la lista con vencimientos) — datos de `getPendingFixedExpenses`, reemplaza el panel dashed actual.
- Lista agrupada **por día** con header "Hoy · jue 14" + subtotal del día; filas con slot de icono, "medio · categoría", badge de cuota `3/12`, USD con "≈ $ … · Blue".
- Conservar: editar/borrar desde la fila, asignación de medio, todos los filtros existentes.

### Compromisos

- Header: "Compromisos" + pill del mes.
- **Tabs pill de 2**: "Cuotas" y "Mensualidades" — las suscripciones se fusionan dentro de Mensualidades (en el mock, Netflix aparece en la lista "Activas" como "Suscripción · debita el 8").
- Tab Cuotas: card doble **"Pendiente este mes" / "Deuda futura"** → card de **ciclo por tarjeta** ("cierra el X · vence el Y", barra de días transcurridos, "N compras en cuotas incluidas") → sección **"Planes en curso"** (N activos) con cards de plan (badge `n/m`, cuota mensual en `bad`, barra, "faltan $" y medio).
- Tab Mensualidades: card doble **"Total mensual" / "Por pagar"** → lista **"Activas"** con badge de estado `pendiente`/`pagada`.
- Conservar: pagar resumen de tarjeta (selector de medio + diálogo de meses anteriores), marcar/desmarcar mensualidad, regularizar historial, crear plan/suscripción, eliminar con confirmación de dependencias.

### Inversiones

- Header: "Inversiones" + **toggle pill US$/$** (el `displayCurrency` existente sube al header; conversión de toda la pantalla).
- Hero **"Tu cartera"**: cifra 38px con `--shadow-bandera` (la única de la pantalla) + P&L con flecha en `good` + "% desde el inicio".
- Card **"Composición"**: barra apilada por tipo de activo + leyenda con % — reemplaza la distribución actual y **sale de los hex hardcodeados** usando `--chart-*`/semánticos (cierra ese bug conocido de `getPortfolioDistribution` en la capa visual).
- Sección **"Activos"** con "actualizado hace N min" real (`lastUpdate`): cards por activo (slot ticker en display, badge de tipo, "nominales · precio unitario", valor en la moneda elegida + % de rendimiento) y **"Verdes guardados"** (el `SavingsCard` actual) como última fila de la misma lista.
- Conservar: banner de `valuationUnavailable`/`missingRates` (arriba del hero), aviso de datos viejos (`isStale`), refresh de precios, las métricas actuales que el mock no dibuja se condensan en el hero o su entorno sin perder el dato.
- Fuera de alcance: `getUpcomingPayments`, `getBenchmarkComparison` (stubs conocidos, siguen como pendiente aparte).

## Orden e integración

1. **Slice 0 — nav + housekeeping**: nav 6→5 con sheet "Más" · sección UI del `CLAUDE.md` reescrita al sistema vigente (hoy describe Alfa Slab/Bodoni/Yellowtail) · `design-system-plan.md` marcado como cerrado · cherry-pick del spec huérfano `59e76ad` de `identidad-v2` a `master` y borrado de esa rama.
2. **Objetivos** (piloto — valida el método y el header compacto).
3. **Movimientos** · 4. **Compromisos** · 5. **Inversiones**.

Cada slice va en su rama (`layout/<nombre>`) y **mergea a `master` al pasar la verificación** — deploy incremental, nunca una rama grande colgada.

## Verificación (por slice)

- `npm run lint && npx tsc --noEmit` sin errores nuevos sobre el baseline (24 preexistentes) · suite Vitest completa en verde (359) · `npm run build` OK.
- **Revisión visual de Lauti**: mock al lado de la app (día y noche), en viewport 390px. El dashboard pide sesión, así que esa mirada es suya; nada se da por verificado "por código".

## Fuera de alcance

Estampillas · 24 errores de lint preexistentes · lógica financiera y stubs de Inversiones · re-sincronizar el proyecto Design System de claude.ai · desktop sidebar · Dashboard/Chat/Login/Ajustes (cerradas en etapa 1).
