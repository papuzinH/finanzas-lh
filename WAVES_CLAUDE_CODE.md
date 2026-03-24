# Guía de Prompts para Claude Code — Waves UX/UI Chanchito

> Cada Wave tiene prompts numerados para ejecutar en orden.
> Hacé un commit después de cada prompt exitoso.
> Usá `npm run build` después de cada cambio para validar.

---

## Antes de empezar

Asegurate de que el `CLAUDE.md` esté actualizado. Claude Code lo lee automáticamente.

---

## WAVE 1 — Foundation: Jerarquía Visual y Glanceability

### Prompt 1.1 — Rediseñar BalanceCard como Hero

```
Rediseñá el componente `src/components/dashboard/balance-card.tsx` para convertirlo en un Hero Card más prominente:

1. Agregar un anillo de progreso SVG circular que muestre el porcentaje de gasto vs ingreso del mes (si gastó 60% del ingreso, el anillo se llena 60%). Color emerald hasta 70%, amber 70-90%, rose >90%.

2. Mostrar una flecha de tendencia comparando el gasto del mes actual vs el anterior. Para esto necesitás crear un nuevo getter `getMonthlyComparison()` en `src/lib/store/financeStore.ts` que retorne `{ currentMonthExpenses, previousMonthExpenses, percentageChange }`.

3. El balance principal debe ser text-4xl font-bold (actualmente es text-3xl). El badge de "este mes" debe ser más grande y legible.

4. Mantené la funcionalidad expandible con AnimatePresence que ya existe.

5. Agregá un count-up animado al balance cuando se monta el componente (usar requestAnimationFrame, NO librerías externas).

Reglas: usar solo el store para datos (NUNCA fetch en componentes), mantener dark mode (bg-slate-900, border-slate-800), usar Framer Motion para animaciones con spring damping 25-30.
```

### Prompt 1.2 — MetricCards con Sparklines

```
Rediseñá `src/components/dashboard/metric-row.tsx` para agregar mini-sparklines a cada MetricCard:

1. Agregar un nuevo getter `getWeeklySnapshot(type)` en `financeStore.ts` que reciba 'income' | 'variable' | 'installments' | 'fixed' y retorne un array de 7 valores numéricos (últimos 7 días o últimas 7 semanas según el tipo).

2. En el MetricCard, debajo del valor, renderizar un Recharts `<LineChart>` mínimo de 60x24px:
   - Sin ejes, sin grid, sin labels, sin tooltip
   - Solo la línea con el color del metric (colorMap existente)
   - strokeWidth 1.5, dot: false
   - El área debajo con fill del mismo color al 10% de opacidad

3. Mantener el layout actual de 2 columnas grid. El sparkline va entre el valor y el sublabel.

4. Si no hay datos suficientes para el sparkline, mostrar una línea horizontal gris.

Reglas: Recharts ya está instalado y se usa en la app. Toda lógica de cálculo en el store, no en componentes.
```

### Prompt 1.3 — Progressive Disclosure en Dashboard

```
Reestructurá `src/app/page.tsx` (dashboard) para implementar progressive disclosure:

1. ABOVE THE FOLD (lo primero que ve el usuario):
   - BalanceCard hero (ya modificado)
   - MetricRow x2 con sparklines (ya modificado)
   - BudgetOverviewStrip (ya existe, moverlo aquí)

2. BELOW THE FOLD (aparece al scrollear):
   - Sección "Análisis" con los 2 pie charts existentes
   - Sección "Últimos movimientos" con las transacciones recientes

3. Agregar headers de sección entre los bloques:
   ```tsx
   <div className="flex items-center gap-2 mt-8 mb-4">
     <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Análisis</h2>
     <div className="flex-1 h-px bg-slate-800" />
   </div>
   ```

4. NO eliminar nada. Solo reordenar y agregar separadores visuales.

Reglas: mantener PullToRefresh wrapper, mantener todos los modales existentes, no romper ninguna funcionalidad.
```

### Prompt 1.4 — Month Selector swipeable

```
Rediseñá `src/components/dashboard/month-selector.tsx` para convertirlo en una barra temporal deslizable:

1. Mostrar el mes actual centrado con flechas laterales (ChevronLeft, ChevronRight de lucide-react).
2. El nombre del mes en formato "Marzo 2026" con text-sm font-semibold.
3. Debajo del nombre del mes, mostrar un badge comparativo: si el gasto del mes actual es mayor que el anterior, mostrar "↑ 12% vs Feb" en rose. Si es menor, "↓ 8% vs Feb" en emerald.
4. Agregar soporte para swipe horizontal en mobile usando Framer Motion `drag="x"` con dragConstraints y onDragEnd para cambiar de mes.
5. Animar el cambio de mes con un fade + slide lateral (el nuevo mes entra desde la dirección del swipe).

Usar el getter `getMonthlyComparison()` que ya creamos en 1.1 para los datos comparativos.
```

---

## WAVE 2 — Data Storytelling: Visualizaciones

### Prompt 2.1 — Getter de tendencias en el Store

```
Agregá estos getters nuevos a `src/lib/store/financeStore.ts`:

1. `getMonthlyTrend(months: number = 6)`: Retorna un array de objetos `{ month: string, income: number, expenses: number, net: number }` para los últimos N meses. Debe iterar las transacciones y agrupar por mes usando `periodDate || date`. Formatear el mes como "Ene", "Feb", etc.

2. `getCategoryComparison()`: Compara los gastos por categoría del mes actual vs el mes anterior. Retorna `{ category: string, emoji: string, current: number, previous: number, change: number }[]` ordenado por mayor cambio absoluto.

3. `getBudgetProjection(budgetId: string)`: Dado un presupuesto activo, calcula cuánto gastará el usuario al final del mes basándose en el ritmo diario actual (gasto actual / días transcurridos * días totales del mes). Retorna `{ spent: number, projected: number, limit: number, isOverBudget: boolean }`.

Reglas: toda lógica de negocio va en el store. Usar parseLocalDate de lib/utils/dates.ts para parsear fechas. Usar date-fns para manipulación de fechas (ya instalado).
```

### Prompt 2.2 — Trend Chart (Line/Area)

```
Creá un nuevo componente `src/components/dashboard/trend-chart.tsx`:

1. Usar Recharts AreaChart que muestre ingreso vs gasto de los últimos 6 meses.
2. Dos áreas: emerald (#10B981) para ingresos con fillOpacity 0.1, rose (#EF4444) para gastos con fillOpacity 0.1.
3. Eje X: nombres de mes cortos ("Ene", "Feb"). Eje Y: oculto.
4. Grid horizontal sutil con stroke="#1e293b".
5. Tooltip dark: bg-slate-900 border-slate-800 rounded-xl, mostrando ambos valores formateados con formatCurrency.
6. ResponsiveContainer con height 200px.
7. Los datos vienen de `useFinanceStore().getMonthlyTrend(6)`.

Luego integrá este componente en `src/app/page.tsx` en la sección "Análisis", ANTES de los pie charts existentes, ocupando el ancho completo (col-span-full).

Reglas: estilo dark mode consistente con los charts existentes, usar las mismas constantes de color COLORS del dashboard.
```

### Prompt 2.3 — Comparación mensual por categoría

```
Creá un nuevo componente `src/components/dashboard/category-comparison.tsx`:

1. Usar Recharts BarChart horizontal que muestre las top 5 categorías con mayor cambio de gasto entre el mes actual y el anterior.
2. Cada categoría muestra dos barras: una para el mes anterior (slate-600) y una para el actual (el color depende: rose si subió, emerald si bajó).
3. El emoji de la categoría como label del eje Y.
4. Tooltip con los valores de ambos meses y el porcentaje de cambio.
5. Si no hay datos del mes anterior, mostrar un empty state sutil: "Necesitás al menos 2 meses de datos".

Integrá este componente en la sección "Análisis" del dashboard, en la segunda fila debajo del trend chart, ocupando la mitad del ancho (col-span-1 en un grid de 2 columnas junto al pie chart del mes).

Datos: usar `getCategoryComparison()` del store.
```

### Prompt 2.4 — Progress bars con proyección en presupuestos

```
Modificá `src/components/goals/category-budget-card.tsx` para agregar proyección visual:

1. Además de la barra de progreso actual (que muestra % gastado vs límite), agregar una línea punteada vertical superpuesta sobre la barra que indique la proyección al fin de mes.
2. La proyección se calcula con `getBudgetProjection(budgetId)` del store.
3. Si la proyección excede el límite, la línea punteada es rose y se muestra un badge "Proyección: $X (excede por $Y)" en text-rose-400.
4. Si la proyección está dentro del límite, la línea es emerald con badge "Proyección: $X".
5. La línea punteada usa CSS: border-left: 2px dashed, posición absoluta dentro del contenedor de la barra.

También modificá `src/components/goals/budget-overview-strip.tsx` para que los mini-presupuestos del dashboard muestren un indicador sutil si alguno va a exceder (un puntito rose pulsante).

Reglas: no modificar la lógica del store existente para presupuestos, solo agregar el getter de proyección.
```

---

## WAVE 3 — Flujo de Trabajo: Transacciones y Acciones Rápidas

### Prompt 3.1 — Floating Action Button Global

```
Creá un FAB (Floating Action Button) global en `src/components/layout/app-shell.tsx`:

1. Botón circular fijo en la esquina inferior derecha, sobre el bottom nav.
   - Mobile: `bottom-20 right-4` (encima del tab bar)
   - Desktop: `bottom-8 right-8`
2. Ícono Plus de lucide-react, bg-indigo-600 hover:bg-indigo-700, shadow-lg shadow-indigo-500/25.
3. Tamaño: h-14 w-14 en mobile, h-12 w-12 en desktop.
4. Animación: scale spring al aparecer, whileTap scale 0.9.
5. Al hacer click, abre el `CreateTransactionDialog` existente.
6. El FAB NO debe mostrarse en la página /movimientos (que ya tiene su propio botón "Nuevo").

Importá `CreateTransactionDialog` de `@/components/transactions/create-transaction-dialog` y manejá el estado open/close con useState en AppShell.

Reglas: el FAB es un client component (AppShell ya es 'use client'). No duplicar el dialog, usar el mismo componente existente.
```

### Prompt 3.2 — Búsqueda instantánea en transacciones

```
Agregá búsqueda instantánea en `src/app/movimientos/page.tsx`:

1. Agregar un input de búsqueda sticky debajo de los filtros existentes:
   - Ícono Search de lucide-react a la izquierda
   - Placeholder "Buscar por descripción, categoría o monto..."
   - bg-slate-900/50 border-slate-800 rounded-xl
   - Clear button (X) cuando hay texto

2. El filtrado es client-side sobre `filteredTransactions` (que ya están filtradas por mes/método/categoría):
   - Buscar en `transaction.description` (case insensitive)
   - Buscar en el nombre de la categoría asociada
   - Buscar en el monto formateado (para que el usuario pueda buscar "5000")

3. Debounce de 300ms usando un custom hook o setTimeout + clearTimeout.

4. Mostrar el contador de resultados: "12 movimientos encontrados" debajo del input.

5. Si la búsqueda no tiene resultados, mostrar un empty state diferente al de "sin movimientos en este filtro".

Reglas: NO usar useEffect para fetching. El filtrado es puramente sobre datos del store ya cargados.
```

### Prompt 3.3 — Swipe Actions en TransactionItem

```
Agregá swipe actions al componente `src/components/shared/transaction-item.tsx` para mobile:

1. Wrap el contenido actual del card en un contenedor con Framer Motion `drag="x"`.
2. Swipe izquierda (drag negativo > -80px): revela un fondo rojo con ícono Trash2 y texto "Eliminar". Al soltar, ejecuta handleDelete con el ConfirmationModal existente.
3. Swipe derecha (drag positivo > 80px): revela un fondo indigo con ícono Pencil y texto "Editar". Al soltar, abre setIsEditOpen(true).
4. Spring animation para volver a posición original si el swipe no supera el umbral.
5. Haptic feedback: `navigator.vibrate?.(10)` al superar el umbral.
6. Solo en mobile: detectar con un custom hook `useIsMobile()` que chequee `window.innerWidth < 768` (con debounce en resize). En desktop, las acciones siguen siendo el DropdownMenu existente.
7. El contenido que se revela usa position absolute detrás del card.

Reglas: mantener el DropdownMenu existente para desktop, no romper el flow actual. Framer Motion ya está instalado.
```

### Prompt 3.4 — Quick-add Templates

```
Creá `src/components/transactions/quick-add.tsx`:

1. Nuevo getter en el store `getFrequentTransactions(n: number = 5)`: agrupa transacciones por `description` (lowercase, trimmed), cuenta frecuencia, y retorna las N más frecuentes con su última categoría y monto promedio.

2. El componente muestra una fila horizontal scrolleable de "chips" con las transacciones frecuentes:
   - Cada chip: `emoji + nombre truncado + monto` (ej: "☕ Café $2.500")
   - bg-slate-900/50 border-slate-800 rounded-full px-3 py-2
   - Al hacer tap, abre CreateTransactionDialog con los campos pre-llenados (description, category_id, amount, type='expense')

3. Para pre-llenar el dialog, necesitás extender las props de `CreateTransactionDialog` para aceptar `defaultValues?: { description, category_id, amount, type }`.

4. Integrá el componente en `src/app/movimientos/page.tsx` debajo de los filtros y encima de la lista de transacciones.

5. Si no hay transacciones frecuentes (usuario nuevo), no mostrar nada.

Reglas: el getter va en financeStore.ts. Lógica de agrupación y conteo en el store, NO en el componente.
```

### Prompt 3.5 — Chips de filtro visuales

```
Reemplazá los dropdowns de filtro en `src/app/movimientos/page.tsx` por chips horizontales scrolleables:

1. Reemplazar los Select de medio de pago y categoría por una fila de chips horizontales con scroll:
   - Container: `flex gap-2 overflow-x-auto pb-2 scrollbar-hide`
   - Cada chip: botón con `emoji/ícono + nombre`, rounded-full, px-3 py-1.5, text-xs
   - Chip inactivo: bg-slate-900/50 border-slate-800 text-slate-400
   - Chip activo: bg-indigo-500/20 border-indigo-500/30 text-indigo-300

2. Primera fila: medios de pago (con ícono CreditCard o Wallet según el tipo).
3. Segunda fila: categorías (con el emoji de cada categoría).
4. Chip "Todos" al inicio de cada fila como reset.
5. Mantener la sincronización con URL search params existente.
6. Agregar animación de scale al activar un chip con Framer Motion whileTap.
7. Mantener el botón "Limpiar Filtros" existente.

Reglas: los datos de medios de pago y categorías vienen del store. Mantener la misma lógica de filtrado URL que ya existe.
```

---

## WAVE 4 — Engagement: Feedback Emocional

### Prompt 4.1 — Celebraciones con confetti

```
Creá `src/components/shared/confetti.tsx`:

1. Instalá `canvas-confetti` (npm install canvas-confetti @types/canvas-confetti).
2. Creá un hook `useConfetti()` que exponga una función `celebrate()`.
3. La función dispara confetti con estos params: particleCount 100, spread 70, origin { y: 0.6 }, colors emerald (#10B981), indigo (#6366F1), amber (#F59E0B).

Luego integrá la celebración en `src/components/goals/savings-goal-card.tsx`:
- Cuando el progreso de un savings goal llega a 100%, disparar confetti automáticamente (useEffect que detecta el cambio a 100%).
- Mostrar un badge animado "¡Meta cumplida! 🎉" con animación de bounce usando Framer Motion.

Y en `src/components/goals/category-budget-card.tsx`:
- Si el mes termina y el usuario gastó menos que el presupuesto, mostrar un badge "¡Dentro del presupuesto!" con un confetti más sutil (particleCount 50).

Reglas: el confetti se dispara una vez (guardar en localStorage si ya se mostró para ese goal/mes). No bloquear la UI.
```

### Prompt 4.2 — Insights Proactivos

```
Creá `src/components/dashboard/insights-carousel.tsx`:

1. Nuevo getter `getInsights()` en financeStore.ts que genere un array de insights basados en los datos:
   - "Ahorraste un X% más que el mes pasado" (si el gasto bajó)
   - "Tu gasto en [categoría] subió un X%" (si alguna categoría subió >20%)
   - "Tenés X cuotas que vencen este mes por $Y"
   - "Vas al X% de tu presupuesto de [categoría] con Y días restantes"
   - Cada insight tiene: type ('positive' | 'warning' | 'info'), message, icon

2. El componente muestra UN insight a la vez con rotación automática (cada 5 segundos).
3. Animación de entrada/salida: fade + slide vertical con AnimatePresence.
4. Dots indicadores debajo para mostrar cuántos insights hay y cuál se está mostrando.
5. Estilo del card:
   - positive: bg-emerald-500/5 border-emerald-500/20
   - warning: bg-amber-500/5 border-amber-500/20
   - info: bg-indigo-500/5 border-indigo-500/20
6. Integrá entre el BalanceCard y los MetricRows en el dashboard.

Reglas: la lógica de generación de insights va 100% en el store. El componente solo consume y renderiza.
```

### Prompt 4.3 — Streak de registro

```
Implementá un streak de registro diario:

1. Nuevo getter `getRegistrationStreak()` en financeStore.ts:
   - Analizar las transacciones ordenadas por fecha
   - Contar días consecutivos hacia atrás desde hoy donde haya al menos 1 transacción registrada
   - Retornar `{ days: number, isActiveToday: boolean }`

2. Mostrar el streak en el header del dashboard (`src/app/page.tsx`):
   - Al lado del saludo "Hola, [nombre]", agregar un badge pequeño
   - Si hay streak > 0: ícono Flame de lucide-react + "X días" en amber
   - Si isActiveToday es true: ícono lleno, si no: ícono con opacidad 50% y tooltip "Registrá un gasto para mantener tu racha"
   - Animación sutil de pulse en el ícono Flame si el streak es > 7

3. El badge no debe ocupar mucho espacio. Debe ser discreto pero visible.

Reglas: no usar useEffect para fetching, solo leer del store. El cálculo va en el store.
```

### Prompt 4.4 — Empty States Educativos

```
Rediseñá todos los empty states de la aplicación:

Buscá todos los empty states en estos archivos:
- src/app/movimientos/page.tsx (sin movimientos)
- src/app/cuotas/page.tsx (sin planes de cuotas)
- src/app/mensualidades/page.tsx (sin suscripciones)
- src/app/objetivos/page.tsx (sin metas / sin presupuestos)
- src/app/inversiones/page.tsx (sin inversiones)
- src/app/categorias/page.tsx (sin categorías)

Para cada uno:
1. Ícono grande (h-16 w-16) del contexto de la página, con color sutil (text-slate-700).
2. Título motivacional (no genérico). Ej: en cuotas → "Organizá tus pagos en cuotas", en objetivos → "Ponele un objetivo a tu ahorro".
3. Descripción de 1-2 líneas explicando el valor: "Registrá tus planes de cuotas para saber exactamente cuánto pagás cada mes."
4. Botón CTA primario (bg-indigo-600) que abre el dialog de creación correspondiente.
5. Estilo: rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 py-16 text-center.

Reglas: cada empty state debe tener un CTA que abra el dialog de creación de la entidad. Reutilizar los dialogs existentes.
```

### Prompt 4.5 — Animaciones staggered en listas

```
Agregá animaciones staggered a todas las listas de cards en la app:

1. Creá un componente wrapper `src/components/shared/staggered-list.tsx`:
   ```tsx
   // Wrapper que anima children con delay progresivo
   // Props: children, staggerDelay (default 0.05), className
   // Usa Framer Motion <motion.div> con variants:
   //   container: { show: { transition: { staggerChildren: staggerDelay } } }
   //   item: { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }
   ```

2. Aplicá el StaggeredList en:
   - Dashboard: grid de transacciones recientes
   - Movimientos: grid de transacciones por día
   - Cuotas: grid de planes
   - Mensualidades: grid de suscripciones
   - Inversiones: grid de activos

3. Cada child item debe estar envuelto en `<motion.div variants={item}>`.

4. La animación solo debe ejecutarse en el mount inicial, no en re-renders.

Reglas: usar Framer Motion con spring, no duration. Mantener los layouts grid existentes. No romper la responsividad.
```

---

## WAVE 5 — Polish: Consistencia y Detalles Premium

### Prompt 5.1 — Refinar Dark Mode y sistema de elevación

```
Refiná el sistema de colores y elevación en `src/app/globals.css`:

1. Cambiar el background base:
   - Body: de bg-slate-950 a un color custom `--bg-base: #0c1222` (entre slate-950 y slate-900, no pure black).
   - Definir variables CSS custom en :root/.dark para 3 niveles de elevación:
     - `--surface: #0c1222` (fondo base)
     - `--surface-raised: #111827` (cards, contenedores)
     - `--surface-overlay: #1e293b` (modals, sheets, dropdowns)

2. Actualizar todos los componentes que usan bg-slate-950 para usar `bg-[var(--surface)]`.
3. Actualizar cards que usan bg-slate-900 para usar `bg-[var(--surface-raised)]`.
4. Actualizar modals/sheets que usan bg-slate-900 para usar `bg-[var(--surface-overlay)]`.

5. Agregar bordes sutiles con gradiente en los cards principales:
   ```css
   .card-elevated {
     border: 1px solid rgba(148, 163, 184, 0.08);
     box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
   }
   ```

Reglas: hacer un find & replace cuidadoso. Asegurar que TODOS los usos se actualicen consistentemente. Verificar con `npm run build`.
```

### Prompt 5.2 — Accesibilidad WCAG AA

```
Realizá una auditoría de accesibilidad y corregí los problemas:

1. Contraste de colores:
   - text-slate-500 sobre backgrounds oscuros NO cumple WCAG AA (ratio < 4.5:1). Cambiar labels/sublabels a text-slate-400 mínimo.
   - text-slate-600 es ilegible. Cambiar a text-slate-500 o superior.
   - Verificar que todos los colores de acento (emerald, rose, amber, indigo) tengan ratio >= 4.5:1 sobre el fondo.

2. Aria labels:
   - Todos los botones de ícono (MoreVertical, ChevronDown, Plus, Filter, X) necesitan aria-label descriptivo.
   - Los pie charts necesitan role="img" y aria-label con el resumen de datos.
   - Los progress bars necesitan role="progressbar", aria-valuenow, aria-valuemin, aria-valuemax.

3. Focus states:
   - Todos los elementos interactivos necesitan `focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950`.
   - Asegurar que Tab navigation funcione en orden lógico.

4. Tap targets:
   - Verificar que todos los botones tengan mínimo 44x44px de área tappable (usar padding si el ícono es más chico).

Reglas: hacer los cambios de forma sistemática, archivo por archivo. Empezar por los componentes shared (transaction-item, modal, page-header) ya que se reutilizan en toda la app.
```

### Prompt 5.3 — Skeleton Loading refinado

```
Mejorá `src/components/ui/skeletons.tsx` para que los skeletons coincidan con el layout real:

1. Crear skeletons específicos para cada página que coincidan EXACTAMENTE con el layout final:
   - `DashboardSkeleton`: BalanceCard skeleton (rectángulo grande) + 4 metric cards + 2 chart areas
   - `TransactionListSkeleton`: header bar + 6 transaction items con la forma exacta del TransactionItem
   - `InstallmentsSkeleton`: 2 summary cards + grid de plan cards
   - `SubscriptionsSkeleton`: hero card + grid de service cards

2. Cada skeleton debe tener animación shimmer:
   ```css
   @keyframes shimmer {
     0% { background-position: -200% 0; }
     100% { background-position: 200% 0; }
   }
   .skeleton-shimmer {
     background: linear-gradient(90deg, var(--surface-raised) 25%, var(--surface-overlay) 50%, var(--surface-raised) 75%);
     background-size: 200% 100%;
     animation: shimmer 1.5s infinite;
   }
   ```

3. Reemplazar los skeletons genéricos actuales por estos específicos en cada página.

Reglas: los skeletons deben tener las mismas dimensiones y posiciones que el contenido real para evitar layout shift (CLS).
```

### Prompt 5.4 — Onboarding interactivo

```
Creá un tour de onboarding post-registro en `src/components/onboarding/onboarding-tour.tsx`:

1. El tour se activa cuando el usuario no tiene transacciones (isNewUser = transactions.length === 0).
2. Usar el `onboardingStore.ts` existente para trackear el progreso.
3. Steps del tour (tooltip con flecha apuntando al elemento):
   - Step 1: Apunta al FAB → "Empezá registrando tu primer gasto tocando el botón +"
   - Step 2: Apunta al BalanceCard → "Acá vas a ver tu balance general y el resumen del mes"
   - Step 3: Apunta al nav "Billetera" → "Configurá tus medios de pago: tarjetas, cuentas, efectivo"
   - Step 4: Apunta al nav "Objetivos" → "Ponele metas a tu ahorro y presupuestos por categoría"

4. Cada tooltip:
   - bg-indigo-600 text-white rounded-xl p-4 shadow-2xl
   - Flecha CSS apuntando al elemento target
   - Botón "Siguiente" / "Entendido" (último step)
   - Indicador de progreso: "2 de 4"
   - Botón "Saltar tour" en text-xs

5. Overlay oscuro semitransparente sobre toda la pantalla excepto el elemento highlighted.
6. Guardar en onboardingStore si el tour se completó o se salteó, para no mostrarlo de nuevo.

Reglas: usar Framer Motion para las transiciones entre steps. El posicionamiento de los tooltips debe ser dinámico (usar getBoundingClientRect del elemento target).
```

---

## Consejos para la ejecución

1. **Un prompt a la vez.** Esperá a que termine y verificá con `npm run build` antes de continuar.
2. **Hacé commit después de cada prompt exitoso** con un mensaje descriptivo.
3. **Si un prompt falla**, pedile a Claude Code que corrija los errores antes de avanzar al siguiente.
4. **Las Waves 2 y 3 son independientes** — podés hacer una u otra primero.
5. **Wave 5 depende de todas las anteriores** — dejala para el final.
6. **Testear en mobile** después de cada Wave (Chrome DevTools → responsive mode).
