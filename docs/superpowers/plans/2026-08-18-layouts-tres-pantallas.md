# Layouts etapa 2 — Movimientos, Compromisos e Inversiones · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las 3 pantallas restantes reestructuradas al layout de los mocks del 14-ago, en 3 slices independientes que mergean por separado tras verificación + gate visual.

**Architecture:** Solo capa de presentación (getters del store intactos). Cada slice = una rama (`layout/movimientos`, `layout/compromisos`, `layout/inversiones`) que nace de `master` al momento de arrancar. Helpers de copy/fechas como funciones puras con TDD. Los componentes ricos existentes (TransactionItem con swipe, CreditCardCycleCard con pago, PortfolioList con baja de activos) se re-estilan conservando TODA su funcionalidad.

**Tech Stack:** Next.js App Router · Tailwind v4 tokens · Zustand · Vitest · date-fns.

**Spec:** `docs/superpowers/specs/2026-08-18-layouts-pantallas-design.md` · Método validado por el piloto: `docs/superpowers/plans/2026-08-18-layouts-nav-y-objetivos.md`.

## Global Constraints

- Prohibido tocar `lib/finance/`, los getters del store, actions y handlers del chat. (Los helpers nuevos van en `src/lib/utils/`, son presentacionales.)
- Mock manda en estructura; **ninguna funcionalidad existente se pierde** (diálogos, swipe, dropdowns, pagos, filtros, empty states, skeletons, auto-refresh).
- Tokens semánticos siempre; bordes `border-[1.5px] border-border`; `tnum` en TODO número financiero; `font-display` nunca con `font-bold`; una sola cifra con `--shadow-bandera` por pantalla (Movimientos y Compromisos: ninguna; Inversiones: la del hero).
- Anclas del tour que DEBEN sobrevivir (test `onboarding-tour-targets.test.ts`): `data-tour="month-selector"` (vive dentro de MonthSelector), `data-tour="search-input"` (Movimientos), `data-tour="compromisos-tabs"` (Compromisos).
- Baseline por slice: `npm run lint` = 24 errores / 11 warnings exactos · `npx tsc --noEmit` limpio · `npx vitest run` verde (380 + los nuevos) · `npm run build` OK.
- Sin base DEV: la verificación NO ejecuta escrituras.
- Mocks de referencia: `../claude-design/{Movimientos,Compromisos,Inversiones}-render.html` + variantes `*Noche`, viewport 390px.

## Desvíos del mock, decididos acá (el gate visual los confirma)

1. **Compromisos sin selector de mes**: los getters (`getCurrentMonthInstallmentsTotal`, `getPendingFixedExpenses`) están anclados al mes real; un selector exigiría lógica nueva (prohibido). El header no muestra pill de mes.
2. **Mensualidades sin "vence el 15 ago"**: `recurring_plans` no tiene día de vencimiento en el modelo. La sub-línea muestra categoría/"Gasto fijo". (Posible iteración de producto futura, fuera de este laburo.)
3. **Ciclo de tarjeta sin "3 compras en cuotas incluidas"**: ese conteo no existe como dato; la sub-línea muestra solo los días del ciclo.
4. **Inversiones: toggle de 4 monedas** (ARS/MEP/CCL/USDT, el existente) en lugar del US$/$ de 2 del mock — funcionalidad > mock.
5. **Inversiones pierde "Mejor/Peor activo" y "Resumen de posiciones"**: cada fila de Activos muestra su % (derivable a ojo); el resumen duplicaba la lista. "Invertido", "Ahorros" y la ganancia realizada pasan a líneas faint del hero.

---

## SLICE M — Movimientos (rama `layout/movimientos`)

### Task M1: Rama + helper `dayGroupLabel` (TDD)

**Files:**
- Create: `src/lib/utils/movimientos-copy.ts`
- Test: `src/lib/utils/__tests__/movimientos-copy.test.ts`

**Interfaces:**
- Consumes: `parseLocalDate` de `@/lib/utils/dates`.
- Produces: `dayGroupLabel(dateKey: string, now?: Date): string` — Task M3 la usa para los headers de día.

- [ ] **Step 1: Crear la rama**

```bash
git checkout master && git pull --ff-only && git checkout -b layout/movimientos
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/utils/__tests__/movimientos-copy.test.ts
import { describe, it, expect } from 'vitest';
import { dayGroupLabel } from '../movimientos-copy';

const NOW = new Date(2026, 7, 18); // mar 18-ago-2026

describe('dayGroupLabel', () => {
  it('hoy: "Hoy · mar 18"', () => {
    expect(dayGroupLabel('2026-08-18', NOW)).toBe('Hoy · mar 18');
  });

  it('ayer: "Ayer · lun 17"', () => {
    expect(dayGroupLabel('2026-08-17', NOW)).toBe('Ayer · lun 17');
  });

  it('otro día del mismo mes: "vie 14"', () => {
    expect(dayGroupLabel('2026-08-14', NOW)).toBe('vie 14');
  });

  it('día de otro mes: agrega el mes — "mié 8 jul"', () => {
    expect(dayGroupLabel('2026-07-08', NOW)).toBe('mié 8 jul');
  });

  it('día de otro año: agrega mes y año — "lun 8 dic 2025"', () => {
    expect(dayGroupLabel('2025-12-08', NOW)).toBe('lun 8 dic 2025');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/utils/__tests__/movimientos-copy.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 4: Implement**

```ts
// src/lib/utils/movimientos-copy.ts
// Headers de grupo por día de la lista de Movimientos (mock 2026-08-14). Puro.
import { parseLocalDate } from '@/lib/utils/dates';

const dow = (d: Date) => new Intl.DateTimeFormat('es-AR', { weekday: 'short' }).format(d).replace('.', '');
const mes = (d: Date) => new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(d).replace('.', '');

export function dayGroupLabel(dateKey: string, now: Date = new Date()): string {
  const d = parseLocalDate(dateKey);
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const esMismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const base = `${dow(d)} ${d.getDate()}`;
  if (esMismoDia(d, hoy)) return `Hoy · ${base}`;
  if (esMismoDia(d, ayer)) return `Ayer · ${base}`;
  if (d.getFullYear() !== now.getFullYear()) return `${base} ${mes(d)} ${d.getFullYear()}`;
  if (d.getMonth() !== now.getMonth()) return `${base} ${mes(d)}`;
  return base;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/utils/__tests__/movimientos-copy.test.ts`
Expected: PASS (5 tests). Si `Intl` devuelve el weekday con mayúscula o punto distinto al esperado, ajustar el TEST a la salida real de `es-AR` en Node (verificarla con `node -e "..."`) — la implementación no se retuerce.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/movimientos-copy.ts src/lib/utils/__tests__/movimientos-copy.test.ts
git commit -m "feat(movimientos): helper de labels de grupo por dia"
```

### Task M2: `MonthSelector` variante `pill` + `TransactionItem` radio 16

**Files:**
- Modify: `src/components/dashboard/month-selector.tsx` (prop aditiva)
- Modify: `src/components/shared/transaction-item.tsx` (solo clases del modo no-`grouped`)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `MonthSelector` acepta `variant?: 'default' | 'pill'`. En `pill` renderiza un botón-cápsula compacto (para el header de Movimientos) **con los mismos handlers** (tap → picker, drag → mes anterior/siguiente, teclado) y **sin** el `<h1 className="sr-only">` ni el texto de comparación (la pantalla ya tiene h1 propio). El wrapper `data-tour="month-selector"` se conserva en ambas variantes. Consumidores actuales (Inicio, Movimientos hoy) no pasan `variant` → cero cambios para ellos.

- [ ] **Step 1: Implementar la variante `pill` en MonthSelector**

Leer el archivo entero primero. Agregar la prop `variant` al tipo de props con default `'default'`. En el render, cuando `variant === 'pill'`, el contenido visible del `motion.div` (mismos props de drag/click/keydown/aria ya existentes) pasa a ser SOLO esta cápsula — el sr-only h1 y el texto de comparación no se renderizan en esta variante:

```tsx
<span className="flex items-center gap-1.5 bg-surface border-[1.5px] border-border rounded-full px-3 py-[7px] font-sans font-bold text-[12.5px] text-text">
  {format(date, 'MMMM yyyy', { locale: es })}
  <ChevronDown className="h-[13px] w-[13px]" strokeWidth={2.4} aria-hidden="true" />
</span>
```

(`ChevronDown` ya se importa de lucide o se suma al import existente.) La variante default queda idéntica byte a byte.

- [ ] **Step 2: TransactionItem — filas sueltas a radio 16**

En `src/components/shared/transaction-item.tsx`, el modo NO-`grouped` usa `rounded-xl` en tres lugares (el `cardInner` línea ~227, y los dos wrappers del swipe líneas ~359/362/372). Cambiar esos `rounded-xl` por `rounded-2xl` SOLO donde estén condicionados a `!grouped` (o dentro del ternario no-grouped). Nada más se toca.

- [ ] **Step 3: Verificar**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`
Expected: baseline exacto, suite verde (los consumidores actuales no cambian).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/month-selector.tsx src/components/shared/transaction-item.tsx
git commit -m "feat(ui): MonthSelector variante pill + filas de movimiento a radio 16"
```

### Task M3: Pantalla Movimientos al mock

**Files:**
- Modify: `src/app/movimientos/page.tsx`

**Interfaces:**
- Consumes: `dayGroupLabel` (M1) · `MonthSelector variant="pill"` (M2) · `ScreenHeader compact` · `Chip`, `AnimatedPlusButton`, `TransactionItem`, `CreateTransactionDialog`, diálogo de filtros — todos existentes.
- Produces: la pantalla final. Nada más la consume.

**Qué cambia y qué NO.** Se conservan sin tocar: todo el bloque de estado/filtros/búsqueda/URL params (líneas 36–217), `renderFilters()`, `ratesButton`, el Dialog de filtros, el empty state, el estado "sin resultados", la sección "Proyección Futura" colapsable, el rail desktop completo (`<aside>`), el skeleton. Cambian: el header, la fila search+filtros, se agrega la fila de chips inline, la card resumen mobile pasa a 2 columnas Entró/Salió, "Mensualidades pendientes" se re-estila como card "Fijos por pagar", y los grupos de día usan `dayGroupLabel` + filas sueltas.

- [ ] **Step 1: Header nuevo**

Reemplazar el `<header>` sticky completo (líneas 379–458) por: el header deja de ser sticky-con-borde y adopta el patrón compacto + una zona de search que sí queda sticky:

```tsx
      <ScreenHeader
        compact
        title="Movimientos"
        right={
          <div className="flex items-center gap-2">
            <MonthSelector currentMonth={currentMonthStr} baseUrl="/movimientos" variant="pill" />
            <AnimatedPlusButton
              label="Crear transacción"
              onClick={() => setIsCreateOpen(true)}
              ariaLabel="Nueva transacción"
            />
          </div>
        }
      />

      {/* Search + filtros + chips */}
      <div className="mx-auto max-w-[1160px] px-5">
        <div className="flex items-center gap-2">
          <div data-tour="search-input" className="relative flex-1 md:flex-none md:w-[420px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-faint pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar gasto, categoría, monto…"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-label="Buscar movimientos"
              className="w-full bg-surface border-[1.5px] border-border rounded-full pl-9 pr-10 py-[9px] text-[13px] text-text placeholder:text-faint focus:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors font-sans"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-muted hover:text-text transition-colors rounded-full"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label="Filtros"
            className="lg:hidden relative w-[38px] h-[38px] flex-none grid place-items-center rounded-full border-[1.5px] border-border bg-surface text-text transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-ink border border-accent-deep">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="hidden md:block">
            {/* En desktop el botón crear ya está en el header */}
          </div>
        </div>

        {/* Chips de medio inline (mobile/tablet): atajo del filtro principal */}
        <div className="lg:hidden flex gap-2 overflow-x-auto mt-2.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip
            active={selectedPaymentMethodId === 'all'}
            onClick={() => handleFilterChange('paymentMethod', 'all')}
          >
            Todos
          </Chip>
          {paymentMethods.map((pm) => (
            <Chip
              key={pm.id}
              active={selectedPaymentMethodId === pm.id.toString()}
              onClick={() => handleFilterChange('paymentMethod', pm.id.toString())}
            >
              {pm.name}
            </Chip>
          ))}
          <Chip active={selectedCategoryId !== 'all'} onClick={() => setFiltersOpen(true)}>
            Categorías
          </Chip>
        </div>

        {debouncedQuery && (
          <p role="status" aria-live="polite" className="text-[11px] text-muted mt-1.5 px-1">
            {searchFilteredTransactions.length}{' '}
            movimiento{searchFilteredTransactions.length !== 1 ? 's' : ''} encontrado{searchFilteredTransactions.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
```

El `<main>` que sigue baja su padding vertical a `py-4`.

- [ ] **Step 2: Card resumen mobile a 2 columnas Entró/Salió**

Reemplazar la card de resumen mobile (el bloque `lg:hidden` con Ingresos/Gastos/Neto, líneas ~482–529) por:

```tsx
            <div className="lg:hidden">
              <Card className="mb-3 overflow-hidden rounded-[18px] p-0">
                <div className="grid grid-cols-2">
                  <div className="grid gap-0.5 px-4 py-3 border-r-[1.5px] border-border">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Entró</span>
                    <span className={cn('font-display tnum text-good leading-none', amountFontClass(formatCurrency(monthlyIncome)))}>
                      + {formatCurrency(monthlyIncome)}
                    </span>
                  </div>
                  <div className="grid gap-0.5 px-4 py-3">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Salió</span>
                    <span className={cn('font-display tnum text-bad leading-none', amountFontClass(formatCurrency(displayedExpense)))}>
                      − {formatCurrency(displayedExpense)}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
```

(`netBalance` sigue usándose en el rail desktop — no borrar su cálculo.)

- [ ] **Step 3: "Fijos por pagar" (ex "Mensualidades pendientes", solo el bloque mobile)**

Reemplazar el bloque mobile `showPendingSection` (líneas ~534–582) por la card colapsable del mock — MISMO estado `isPendingOpen`, mismos datos `pendingFixed`, mismos `Link` a `/compromisos`:

```tsx
            {showPendingSection && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setIsPendingOpen((v) => !v)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsPendingOpen((v) => !v); } }}
                aria-expanded={isPendingOpen}
                aria-controls="movimientos-pendientes-panel"
                className="mb-4 bg-surface border-[1.5px] border-border rounded-[18px] overflow-hidden cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <div className="flex items-center gap-2.5 px-3.5 py-3">
                  <span className="w-8 h-8 flex-none grid place-items-center bg-warn/15 border-[1.5px] border-warn/40 rounded-[10px]">
                    <Clock className="h-[15px] w-[15px] text-warn" aria-hidden="true" />
                  </span>
                  <div className="grid gap-px">
                    <span className="font-sans font-bold text-[13.5px] text-text">Fijos por pagar</span>
                    <span className="text-[11.5px] text-muted">
                      {pendingFixed.items.length} pendiente{pendingFixed.items.length !== 1 ? 's' : ''} este mes
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="font-display tnum text-[14px] text-warn">− {formatCurrency(pendingFixed.total)}</span>
                    {isPendingOpen
                      ? <ChevronDown className="h-[15px] w-[15px] text-faint" aria-hidden="true" />
                      : <ChevronRight className="h-[15px] w-[15px] text-faint" aria-hidden="true" />}
                  </div>
                </div>
                {isPendingOpen && (
                  <div id="movimientos-pendientes-panel" className="border-t-[1.5px] border-border px-3.5 py-1" onClick={(e) => e.stopPropagation()}>
                    {pendingFixed.items.map((item, i) => (
                      <Link
                        key={item.id}
                        href="/compromisos"
                        className={cn(
                          'flex items-center justify-between gap-3 py-2 transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md',
                          i > 0 && 'border-t border-dashed border-border'
                        )}
                      >
                        <div className="grid gap-px min-w-0">
                          <span className="font-sans font-semibold text-[13px] text-text truncate">{item.name}</span>
                          <span className="text-[11px] text-muted">Pendiente este mes · ver en Compromisos</span>
                        </div>
                        <span className="font-display tnum text-[13px] text-text shrink-0">{formatCurrency(item.amount)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
```

(El bloque gemelo del rail desktop no se toca.)

- [ ] **Step 4: Grupos de día con labels del mock y filas sueltas**

En `renderSection` (líneas ~305–370): (a) el header de grupo pasa a estilo kicker del mock — clase del `<h3>`: `font-sans text-[11px] font-extrabold uppercase tracking-[0.16em]`, color `text-accent-deep` cuando el título empieza con `Hoy`, si no `text-faint`; el subtotal `dailyNet` queda como está; (b) las filas dejan la Card agrupada: el cuerpo pasa a

```tsx
        {(!collapsible || isOpen) && (
          <div id={collapsible ? collapsiblePanelId : undefined} className="grid gap-2.5">
            {items.map((t) => {
              const paymentMethod = paymentMethods.find(pm => pm.id === t.payment_method_id);
              return (
                <TransactionItem
                  key={t.id}
                  transaction={t}
                  paymentMethodName={paymentMethod?.name}
                  paymentMethodType={paymentMethod?.type}
                  showDate={showItemDate}
                  peekOnMount={t.id === firstSwipeableId}
                />
              );
            })}
          </div>
        )}
```

(sin `grouped` → cada fila es su propia card, ya con radio 16 por M2); y (c) donde se arma el título de los días pasados (líneas ~609–622), reemplazar el `Intl.DateTimeFormat`(`'14 de agosto'`) por `dayGroupLabel(dateKey)` — y el grupo "Hoy" pasa a llamarse con `dayGroupLabel(format(today, 'yyyy-MM-dd'))`. Importar `dayGroupLabel` de `@/lib/utils/movimientos-copy`. "Proyección Futura" mantiene su título tal cual.

- [ ] **Step 5: Verificación completa + commit**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Expected: baseline exacto, suite verde, build OK. Limpiar imports muertos (`ArrowDownLeft`/`ArrowUpRight`/`Receipt` siguen usándose en empty state — verificar con lint).

```bash
git add src/app/movimientos/page.tsx
git commit -m "feat(movimientos): layout del mock — header compacto, chips, fijos por pagar y dias sueltos"
```

### Task M4: Verificación del slice + gate visual + merge

- [ ] **Step 1**: `npm run lint ; npx tsc --noEmit ; npx vitest run ; npm run build` — todo en baseline/verde.
- [ ] **Step 2**: GATE (bloqueante): Lauti compara `/movimientos` (día y noche, 390px) contra `Movimientos-render.html` y `MovimientosNoche-render.html`. Verificar también: buscar, filtrar por chip, swipe de fila, editar/borrar (SIN confirmar el borrado — base de producción: cancelar en el modal), colapsar Fijos por pagar, cambiar de mes.
- [ ] **Step 3** (con OK explícito): `git checkout master && git pull --ff-only && git merge --ff-only layout/movimientos && git push && git branch -d layout/movimientos`. Verificar deploy READY.

---

## SLICE C — Compromisos (rama `layout/compromisos`)

### Task C1: Rama + helper `cicloSub` (TDD)

**Files:**
- Create: `src/lib/utils/compromisos-copy.ts`
- Test: `src/lib/utils/__tests__/compromisos-copy.test.ts`

**Interfaces:**
- Produces: `cicloSub(nextClosingDate: Date | undefined, nextPaymentDate: Date, now?: Date): { fechas: string; dias: string; pct: number }` — Task C3 la usa en la card de ciclo. `fechas` = "cierra el 22 ago · vence el 30 ago" (sin closing date: "vence el 30 ago"); `dias` = "18 días del ciclo transcurridos" (ciclo = mes móvil que termina en el cierre); `pct` = % del ciclo transcurrido, clampeado 0–100.

- [ ] **Step 1: Crear la rama**

```bash
git checkout master && git pull --ff-only && git checkout -b layout/compromisos
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/utils/__tests__/compromisos-copy.test.ts
import { describe, it, expect } from 'vitest';
import { cicloSub } from '../compromisos-copy';

describe('cicloSub', () => {
  const cierre = new Date(2026, 7, 22);      // 22-ago
  const vencimiento = new Date(2026, 7, 30); // 30-ago

  it('arma las dos fechas', () => {
    const r = cicloSub(cierre, vencimiento, new Date(2026, 7, 18));
    expect(r.fechas).toBe('cierra el 22 ago · vence el 30 ago');
  });

  it('cuenta los días transcurridos del ciclo (ciclo = 22-jul → 22-ago)', () => {
    const r = cicloSub(cierre, vencimiento, new Date(2026, 7, 18));
    expect(r.dias).toBe('27 días del ciclo transcurridos'); // 22-jul → 18-ago
    expect(r.pct).toBeGreaterThan(80);
    expect(r.pct).toBeLessThanOrEqual(100);
  });

  it('singulariza y clampa al arrancar el ciclo', () => {
    const r = cicloSub(cierre, vencimiento, new Date(2026, 6, 23)); // 23-jul
    expect(r.dias).toBe('1 día del ciclo transcurrido');
    expect(r.pct).toBeGreaterThanOrEqual(0);
  });

  it('sin fecha de cierre: solo vencimiento y pct 100', () => {
    const r = cicloSub(undefined, vencimiento, new Date(2026, 7, 18));
    expect(r.fechas).toBe('vence el 30 ago');
    expect(r.pct).toBe(100);
    expect(r.dias).toBe('');
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `npx vitest run src/lib/utils/__tests__/compromisos-copy.test.ts` → FAIL.

- [ ] **Step 4: Implement**

```ts
// src/lib/utils/compromisos-copy.ts
// Sub-líneas de la card de ciclo de tarjeta (mock 2026-08-14). Puro.

const fmtDia = (d: Date) =>
  `${d.getDate()} ${new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(d).replace('.', '')}`;

export function cicloSub(
  nextClosingDate: Date | undefined,
  nextPaymentDate: Date,
  now: Date = new Date(),
): { fechas: string; dias: string; pct: number } {
  const vence = `vence el ${fmtDia(nextPaymentDate)}`;
  if (!nextClosingDate) return { fechas: vence, dias: '', pct: 100 };

  const cierre = nextClosingDate;
  const inicio = new Date(cierre.getFullYear(), cierre.getMonth() - 1, cierre.getDate());
  const MS_DIA = 24 * 60 * 60 * 1000;
  const total = Math.max(1, Math.round((cierre.getTime() - inicio.getTime()) / MS_DIA));
  const transcurridos = Math.min(total, Math.max(0, Math.round((now.getTime() - inicio.getTime()) / MS_DIA)));
  const pct = Math.min(100, Math.max(0, (transcurridos / total) * 100));

  return {
    fechas: `cierra el ${fmtDia(cierre)} · ${vence}`,
    dias: `${transcurridos} día${transcurridos === 1 ? '' : 's'} del ciclo transcurrido${transcurridos === 1 ? '' : 's'}`,
    pct,
  };
}
```

- [ ] **Step 5: Run to verify it passes** — mismo comando → PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/compromisos-copy.ts src/lib/utils/__tests__/compromisos-copy.test.ts
git commit -m "feat(compromisos): helper de fechas y progreso del ciclo de tarjeta"
```

### Task C2: Cards de plan y de mensualidad al mock

**Files:**
- Modify: `src/app/compromisos/compromisos-client.tsx` — SOLO los componentes internos `InstallmentPlanCard` (líneas ~83–221) y `SubscriptionCard` (~226–405). El componente `CompromisosClient` se toca en C3.

**Interfaces:**
- Consumes: `ProgressBar`, dropdowns/diálogos/confirmaciones/`togglePaid` existentes en esos mismos componentes.
- Produces: mismas firmas (`InstallmentPlanCard({ plan: PlanWithStatus })`, `SubscriptionCard({ plan: RecurringPlanWithPayment })`).

- [ ] **Step 1: `InstallmentPlanCard` — JSX del mock**

Conservar TODO el estado, `confirmDelete`, `ConfirmationModal` y `EditInstallmentPlanDialog`. Reemplazar solo el `<div className="group rounded-2xl ...">` (el cuerpo visual) por:

```tsx
      <div className="rounded-2xl border-[1.5px] border-border bg-surface p-3.5 px-3.5 grid gap-2">
        {/* Fila 1: nombre + badge n/m + cuota mensual + menú */}
        <div className="flex items-center gap-2">
          <span className="font-sans font-bold text-[13.5px] text-text truncate">{plan.description}</span>
          <span className="flex-none text-[10.5px] font-bold text-muted border-[1.5px] border-border rounded-full px-[7px] py-0.5 leading-none">
            {plan.isFinished ? '✓' : `${plan.installmentsPaid + 1}/${plan.installments_count}`}
          </span>
          <span className="ml-auto font-display tnum text-[14px] text-bad whitespace-nowrap">
            − {formatCurrency(Number(plan.total_amount) / plan.installments_count)}
            <span className="font-sans font-semibold text-[11px] text-muted"> /mes</span>
          </span>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Opciones del plan" className="h-8 w-8 -mr-1 text-muted hover:text-text hover:bg-surface-2">
                <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-surface border-[1.5px] border-border text-text">
              <DropdownMenuItem onClick={() => setIsEditOpen(true)} className="focus:bg-surface-2 cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setIsDeleteOpen(true)}
                disabled={isDeleting}
                className="text-bad focus:bg-bad/10 focus:text-bad cursor-pointer"
              >
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Eliminar Plan
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Barra de progreso */}
        <ProgressBar
          value={plan.progress}
          tone={plan.isFinished ? 'good' : plan.progress >= 75 ? 'good' : 'warn'}
          height={7}
          label={`Progreso de cuotas: ${plan.installmentsPaid} de ${plan.installments_count} pagadas`}
        />

        {/* Pie: medio + faltan */}
        <div className="flex justify-between text-[11.5px] text-muted tnum">
          <span className="truncate">{plan.paymentMethodName ?? 'Sin medio asignado'}</span>
          <span>
            {plan.isFinished
              ? 'completado'
              : `faltan ${formatCurrency(plan.remaining)}${plan.remainingInstallments === 1 ? ' · última en curso' : ''}`}
          </span>
        </div>
      </div>
```

Los datos "Total del plan" y la categoría dejan la card (viven en el diálogo de edición); los imports que queden muertos (`Tag`, `Check`, `CreditCard` si ya nadie los usa) se limpian al final de C3 con lint.

- [ ] **Step 2: `SubscriptionCard` — fila del mock**

Conservar TODO el estado, `togglePaid`, `confirmDelete`, diálogos y `getServiceIcon`. Reemplazar el cuerpo visual por:

```tsx
      <div
        className={cn(
          'flex items-center gap-3 rounded-2xl border-[1.5px] border-border p-3',
          plan.is_active ? 'bg-surface' : 'bg-surface-2 opacity-70'
        )}
      >
        <div className="w-[38px] h-[38px] flex-none grid place-items-center bg-surface-2 border-[1.5px] border-border rounded-xl text-[17px]" aria-hidden="true">
          {category?.emoji ? <span>{category.emoji}</span> : getServiceIcon(plan.description, category?.name || null)}
        </div>

        <div className="min-w-0 grid gap-px">
          <span className="font-sans font-bold text-[13.5px] text-text truncate">{plan.description}</span>
          <span className="text-[12px] text-muted truncate">
            {category?.name ?? 'Gasto fijo'}{!plan.is_active && ' · inactiva'}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <div className="grid gap-0.5 justify-items-end">
            {plan.currency === 'USD' && plan.original_amount != null ? (
              <>
                <span className="font-display tnum text-[15px] text-text">
                  US$ {Number(plan.original_amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10.5px] text-muted tnum">≈ {formatCurrency(plan.amount)}</span>
              </>
            ) : (
              <span className="font-display tnum text-[15px] text-text">{formatCurrency(plan.amount)}</span>
            )}
            {plan.is_active && (
              <button
                type="button"
                onClick={togglePaid}
                disabled={isToggling}
                aria-label={isPaidThisMonth ? `Deshacer pago de ${plan.description}` : `Marcar ${plan.description} como pagada`}
                className={cn(
                  'text-[10.5px] font-extrabold uppercase tracking-[0.08em] leading-none rounded-md px-1 py-0.5 -mx-1 transition-colors cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  isPaidThisMonth ? 'text-good hover:bg-good/10' : 'text-warn hover:bg-warn/10'
                )}
              >
                {isToggling ? '…' : isPaidThisMonth ? 'pagada' : 'pendiente'}
              </button>
            )}
          </div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Opciones de suscripción" className="h-8 w-8 text-muted hover:text-text hover:bg-surface-2">
                <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-surface border-[1.5px] border-border text-text">
              <DropdownMenuItem onClick={() => setIsEditOpen(true)} className="focus:bg-surface-2 cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setIsDeleteOpen(true)}
                disabled={isDeleting}
                className="text-bad focus:bg-bad/10 focus:text-bad cursor-pointer"
              >
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
```

El badge pendiente/pagada del mock ES el toggle existente (mismo `togglePaid`); el pie con el medio de pago deja la card (vive en editar).

- [ ] **Step 3: Verificar + commit**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`

```bash
git add src/app/compromisos/compromisos-client.tsx
git commit -m "feat(compromisos): cards de plan y mensualidad al layout del mock"
```

### Task C3: Estructura de la pantalla + card de ciclo

**Files:**
- Modify: `src/app/compromisos/compromisos-client.tsx` (el componente `CompromisosClient`, líneas ~408–689)
- Modify: `src/components/compromisos/credit-card-cycle-card.tsx` (solo el layout del encabezado visible de la card)

**Interfaces:**
- Consumes: `cicloSub` (C1) · `ScreenHeader compact` · `TabsDS` (mismas tabs/ids) · cards de C2 · `CreditCardCycleCard`/`getPaymentMethodStatus` existentes.

- [ ] **Step 1: `CompromisosClient` — nueva estructura**

Conservar: estado, datos derivados (líneas 409–474 — `totalCompromisosMes` se borra junto al hero), diálogos de crear, skeleton, empty states, toggle "Ver finalizados", `data-tour="compromisos-tabs"`, `initialTab`. Nueva estructura del `return`:

1. `<ScreenHeader compact title="Compromisos" right={<AnimatedPlusButton …igual que hoy… />} />` (sin pill de mes — desvío 1).
2. **Muere el hero** (líneas ~499–520). `totalCompromisosMes` deja de calcularse.
3. Las tabs (`TabsDS`, `data-tour="compromisos-tabs"`) suben a primera posición del main.
4. **Tab Cuotas**: (a) card doble del mock —

```tsx
            <div className="grid grid-cols-2 rounded-[18px] bg-surface border-[1.5px] border-border shadow-card overflow-hidden">
              <div className="grid gap-0.5 px-4 py-3 border-r-[1.5px] border-border">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Pendiente este mes</span>
                <span className="font-display tnum text-[17px] text-warn">{formatCurrency(currentMonthCuotas)}</span>
              </div>
              <div className="grid gap-0.5 px-4 py-3">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Deuda futura</span>
                <span className="font-display tnum text-[17px] text-text">{formatCurrency(totalDebtFuturo)}</span>
              </div>
            </div>
```

(reemplaza a las dos cards "Deuda Futura"/"Cuotas activas"); (b) la sección **Tarjetas de crédito se muda adentro de esta tab**, debajo de la card doble, sin el header de sección de hoy (las cards de ciclo hablan solas); (c) sigue "Planes en curso" —

```tsx
            <div className="flex items-baseline justify-between mt-1">
              <h2 className="font-display text-text text-[18px]">Planes en curso</h2>
              <span className="text-[12.5px] font-bold text-muted">{activeCuotas.length} activo{activeCuotas.length !== 1 ? 's' : ''}</span>
            </div>
```

— y la grilla existente de `InstallmentPlanCard` + el toggle de finalizados, tal cual.
5. **Tab Mensualidades**: card doble —

```tsx
            <div className="grid grid-cols-2 rounded-[18px] bg-surface border-[1.5px] border-border shadow-card overflow-hidden">
              <div className="grid gap-0.5 px-4 py-3 border-r-[1.5px] border-border">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Total mensual</span>
                <span className="font-display tnum text-[17px] text-text">{formatCurrency(totalMonthlyCost)}</span>
              </div>
              <div className="grid gap-0.5 px-4 py-3">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Por pagar</span>
                <span className={cn('font-display tnum text-[17px]', pendingSubs.total > 0 ? 'text-warn' : 'text-good')}>{formatCurrency(pendingSubs.total)}</span>
              </div>
            </div>
```

— luego header "Activas" (mismo patrón display 18px + `${activeSubsCount} mensualidad${…}` a la derecha) y la lista de `SubscriptionCard` en `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5`.
6. Empty states de ambas tabs: se conservan tal cual.

- [ ] **Step 2: Card de ciclo — encabezado del mock**

En `credit-card-cycle-card.tsx`, localizar el componente exportado que renderiza la card por tarjeta (el archivo tiene `CreditCardCycleChip` y la card principal). SIN tocar el flujo de pago (select de medio financiador, AlertDialog, `payCreditCardCycle`/`undoCreditCardPayment`), la parte superior visible de la card adopta:

```tsx
      <div className="flex items-center gap-2.5">
        <span className="w-[34px] h-[34px] flex-none grid place-items-center bg-surface-2 border-[1.5px] border-border rounded-[11px]">
          <CreditCard className="h-4 w-4 text-accent-deep" aria-hidden="true" />
        </span>
        <div className="min-w-0 grid gap-px">
          <span className="font-sans font-bold text-[13.5px] text-text truncate">{card.name} · ciclo actual</span>
          <span className="text-[11.5px] text-muted">{ciclo.fechas}</span>
        </div>
        <span className="ml-auto font-display tnum text-[15px] text-text whitespace-nowrap">{formatCurrency(card.totalARS)}</span>
      </div>
      <ProgressBar value={ciclo.pct} height={8} tone="accent" label="Días transcurridos del ciclo" />
      {ciclo.dias && <span className="text-[11.5px] text-muted">{ciclo.dias}</span>}
```

donde `const ciclo = cicloSub(status.nextClosingDate, card.nextPaymentDate)` (el componente ya obtiene `status = getPaymentMethodStatus(card.methodId)`). Los elementos de acción existentes (chip/botón de pagar o deshacer, montos ARS/USD desglosados si los muestra) se reubican DEBAJO de esta cabecera, conservados. Importar `cicloSub` y `ProgressBar` si falta.

- [ ] **Step 3: Verificación completa + commit**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Imports muertos del client (`CreditCard` header de sección, `CalendarClock` si quedó sin uso, etc.): limpiar hasta baseline exacto.

```bash
git add src/app/compromisos/compromisos-client.tsx src/components/compromisos/credit-card-cycle-card.tsx
git commit -m "feat(compromisos): layout del mock — tabs primero, ciclo adentro de Cuotas, sin hero"
```

### Task C4: Gate visual + merge

- [ ] Igual que M4, sobre `/compromisos`: comparar con `Compromisos-render.html` (+Noche), probar ambas tabs, el toggle pagada/pendiente de una mensualidad (es reversible: deshacerlo), abrir el flujo de pago de tarjeta SIN confirmarlo, crear/editar SIN guardar. Con OK: merge ff de `layout/compromisos` a `master`, push, borrar rama, deploy READY.

---

## SLICE I — Inversiones (rama `layout/inversiones`)

### Task I1: Rama + Composición como barra apilada

**Files:**
- Modify: `src/components/inversiones/portfolio-distribution.tsx` (reemplazo completo del render; misma firma)

**Interfaces:**
- Consumes/Produces: mantiene la firma actual `PortfolioDistribution({ data })` con `data: { name: string; value: number }[]` (la que hoy recibe `pieData` — verificar la firma exacta en el archivo antes de reescribir y conservarla).

- [ ] **Step 1: Crear la rama**

```bash
git checkout master && git pull --ff-only && git checkout -b layout/inversiones
```

- [ ] **Step 2: Reescribir el componente como card "Composición"**

Leer el archivo actual (pie de recharts). Reemplazar el cuerpo por la barra apilada del mock, sin librerías:

```tsx
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;
  const CHART_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6', '--chart-7', '--chart-8', '--chart-9'];
  const items = data.map((d, i) => ({
    ...d,
    pct: (d.value / total) * 100,
    color: `var(${CHART_VARS[i % CHART_VARS.length]})`,
  }));

  return (
    <div className="rounded-[18px] bg-surface border-[1.5px] border-border p-3.5 grid gap-2.5">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Composición</span>
      <div className="flex h-3 rounded-full overflow-hidden border border-border" role="img" aria-label={`Composición del portfolio: ${items.map((i) => `${i.name} ${Math.round(i.pct)}%`).join(', ')}`}>
        {items.map((it, i) => (
          <div key={it.name} style={{ width: `${it.pct}%`, background: it.color, borderLeft: i > 0 ? '2px solid var(--surface)' : undefined }} />
        ))}
      </div>
      <div className="flex gap-3.5 flex-wrap">
        {items.map((it) => (
          <span key={it.name} className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className="w-2 h-2 rounded-[3px]" style={{ background: it.color }} aria-hidden="true" />
            {it.name} {Math.round(it.pct)}%
          </span>
        ))}
      </div>
    </div>
  );
```

Si recharts quedaba importado solo acá dentro de la pantalla, dejar la dependencia como está (otros charts del dashboard la usan) — solo se limpia el import del archivo.

- [ ] **Step 3: Verificar + commit**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`

```bash
git add src/components/inversiones/portfolio-distribution.tsx
git commit -m "feat(inversiones): la composicion pasa de pie a barra apilada con la escala chart"
```

### Task I2: Pantalla Inversiones al mock

**Files:**
- Modify: `src/app/inversiones/inversiones-client.tsx`
- Modify: `src/components/inversiones/portfolio-list.tsx` (solo el layout de la fila)

**Interfaces:**
- Consumes: `ScreenHeader compact` · `CurrencyToggle` (4 opciones, existente) · `PortfolioDistribution` (I1) · `PricesStatusBar`, `BannerDS`, `SavingsCard`, `QuickAddForm`, `FailedPricesDialog`, `AssetTypeBadge`, `ProfitBadge` — existentes · `Dialog` de `@/components/ui/dialog`.

- [ ] **Step 1: `InversionesClient` — estructura del mock, sin tabs**

Conservar: TODO el estado y los handlers (`handleRefresh`, auto-refresh effect, `handleDeleteAsset`, `lastRefreshResult`, `FailedPricesDialog`), `heroMoney`, `pieData`, el banner `valuationUnavailable`, `PricesStatusBar`, empty states. Mueren: `ActiveTab`/`activeTab`, las 3 `TabsDS`, la metric row (Ganancia/Mejor/Peor — `sortedByPL`/`best`/`worst` se borran), el bloque "Resumen de posiciones". Nuevo `return` (estructura):

```tsx
    <div className="min-h-screen bg-bg text-text font-sans pb-28 md:pb-8">
      <ScreenHeader
        compact
        title="Inversiones"
        right={<CurrencyToggle value={displayCurrency} onChange={setDisplayCurrency} />}
      />

      <main className="mx-auto max-w-[1440px] px-5 pb-4">
        <PricesStatusBar
          lastUpdate={portfolio.lastUpdate}
          isRefreshing={isRefreshing}
          lastResult={lastRefreshResult}
          onRefresh={handleRefresh}
          onOpenFailed={() => setFailedDialogOpen(true)}
        />

        {portfolio.valuationUnavailable && (
          <div className="mt-3">
            <BannerDS ... (idéntico al actual) ... />
          </div>
        )}

        {/* Hero: Tu cartera */}
        <div className="mt-3 rounded-[26px] bg-surface border-[1.5px] border-border shadow-card p-5">
          <p className="font-sans text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent-deep">Tu cartera</p>
          <p className="font-display tnum text-[clamp(1.65rem,8vw,2.375rem)] leading-[var(--leading-display)] mt-2.5 text-text [text-shadow:var(--shadow-bandera)] pr-1.5 pb-1 break-words">
            {heroMoney(portfolio.totalValue)}
          </p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {portfolio.totalInvested > 0 ? (
              <>
                <span className={cn('flex items-center gap-1 font-display tnum text-[14px]', portfolio.totalUnrealizedPL >= 0 ? 'text-good' : 'text-bad')}>
                  <TrendingUp className={cn('h-3.5 w-3.5', portfolio.totalUnrealizedPL < 0 && 'rotate-180 -scale-x-100')} aria-hidden="true" />
                  {portfolio.totalUnrealizedPL >= 0 ? '+ ' : '− '}{heroMoney(Math.abs(portfolio.totalUnrealizedPL))}
                </span>
                <span className="text-[12px] text-muted tnum">
                  {portfolio.totalPLPercent >= 0 ? '+' : ''}{portfolio.totalPLPercent.toFixed(1).replace('.', ',')}% desde el inicio
                </span>
              </>
            ) : (
              <span className="text-[12px] text-muted">Todavía sin posiciones valuadas</span>
            )}
          </div>
          <p className="text-[11px] text-faint mt-2 tnum break-words">
            Invertido: {heroMoney(portfolio.totalInvested)}
            {portfolio.totalRealizedPL !== 0 && <> · Realizadas: {fmtCurrency(portfolio.totalRealizedPL, currencyLabel)}</>}
            {portfolio.totalSavings > 0 && <> · Ahorros: {fmtCurrency(portfolio.totalSavings, currencyLabel)}</>}
          </p>
        </div>

        {/* Composición */}
        {pieData.length > 0 && <div className="mt-3"><PortfolioDistribution data={pieData} /></div>}

        {/* Activos */}
        <div className="flex items-baseline justify-between mt-5">
          <h2 className="font-display text-text text-[18px]">Activos</h2>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-bold text-muted">{portfolio.assets.length} activo{portfolio.assets.length !== 1 ? 's' : ''}</span>
            <button
              type="button"
              onClick={() => setIsCargarOpen(true)}
              aria-label="Nueva operación"
              className="grid place-items-center w-7 h-7 rounded-full bg-surface border-[1.5px] border-border text-text hover:bg-surface-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.6} />
            </button>
          </div>
        </div>

        {portfolio.assets.length === 0 ? (
          … (empty state actual del tab dashboard, con el botón abriendo setIsCargarOpen(true)) …
        ) : (
          <div className="mt-3">
            <PortfolioList
              assets={portfolio.assets}
              transactions={investmentTransactions}
              displayCurrency={displayCurrency}
              onDeleteAsset={handleDeleteAsset}
            />
          </div>
        )}

        <div className="mt-2.5"><SavingsCard displayCurrency={displayCurrency} /></div>
      </main>

      {/* Cargar: el form existente, ahora en diálogo */}
      <Dialog open={isCargarOpen} onOpenChange={setIsCargarOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto bg-surface border-border text-text">
          <DialogHeader>
            <DialogTitle className="text-text">Nueva operación</DialogTitle>
          </DialogHeader>
          <QuickAddForm />
        </DialogContent>
      </Dialog>

      <FailedPricesDialog … (idéntico al actual) … />
    </div>
```

con `const [isCargarOpen, setIsCargarOpen] = useState(false)` nuevo. Los `…` marcados "idéntico al actual" se copian tal cual del archivo vigente (banner, empty state, FailedPricesDialog — no se reescriben acá porque no cambian ni una línea).

- [ ] **Step 2: Fila de `PortfolioList` al mock**

Leer `src/components/inversiones/portfolio-list.tsx` entero. SIN tocar sus acciones (expandir/borrar/lo que tenga), la fila visible de cada activo adopta el layout del mock:

```tsx
      <div className="flex items-center gap-3 bg-surface border-[1.5px] border-border rounded-2xl p-3">
        <div className="w-[38px] h-[38px] flex-none grid place-items-center bg-surface-2 border-[1.5px] border-border rounded-xl font-display text-[11px] text-accent-deep uppercase">
          {asset.ticker.slice(0, 4)}
        </div>
        <div className="min-w-0 grid gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-sans font-bold text-[13.5px] text-text truncate">{asset.name || asset.ticker}</span>
            <AssetTypeBadge assetType={asset.asset_type} className="shrink-0" />
          </div>
          <span className="text-[12px] text-muted truncate tnum">
            {asset.quantity} nominales{asset.currentPrice ? ` · ${fmt(asset.currentPrice)} c/u` : ''}
          </span>
        </div>
        <div className="ml-auto grid gap-0.5 justify-items-end shrink-0">
          <span className="font-display tnum text-[14px] text-text">{fmt(asset.currentValue)}</span>
          <ProfitBadge percent={asset.plPercent} />
        </div>
      </div>
```

adaptando `fmt`/nombres de campos a los que la lista ya usa (leerlos del archivo — `quantity`/`currentPrice` pueden llamarse distinto; usar los reales). Las filas van en un contenedor `grid gap-2.5`. Si la lista hoy renderiza tabla o cards con más metadatos (fecha de compra, PPC), esos datos se conservan en el detalle expandible/acciones existentes, no en la fila.

- [ ] **Step 3: Verificación completa + commit**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Limpiar imports muertos (`TabsDS`, `Card`, `Clock`, `AssetTypeBadge` si quedó sin uso en el client, `getAssetTypeLabel` sigue usado por `pieData`).

```bash
git add src/app/inversiones/inversiones-client.tsx src/components/inversiones/portfolio-list.tsx
git commit -m "feat(inversiones): layout del mock — hero Tu cartera, composicion, activos sin tabs"
```

### Task I3: Gate visual + merge

- [ ] Igual que M4, sobre `/inversiones`: comparar con `Inversiones-render.html` (+Noche); verificar el toggle de moneda en el header, la barra de Composición, el banner de cotizaciones (si aplica), abrir "Nueva operación" SIN guardar, y que el refresh de precios siga andando (este SÍ se puede ejecutar: escribe precios de mercado, no datos del usuario). Con OK: merge ff de `layout/inversiones` a `master`, push, borrar rama, deploy READY.
