# Movimientos UX Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los problemas de UX/UI críticos de la pantalla `/movimientos`: filtros siempre visibles, resumen de ingresos/gastos, header limpio, y textos legibles.

**Architecture:** Se modifica únicamente `src/app/movimientos/page.tsx` (restructura del header, chips siempre visibles, cards de resumen) y `src/components/shared/transaction-item.tsx` (tamaños de texto). No se crean nuevos componentes ni stores — toda la lógica de datos ya existe.

**Tech Stack:** Next.js App Router, Zustand (useFinanceStore), Tailwind + tokens semánticos, Framer Motion, Lucide React, componentes DS: `<Card>`, `<Chip>`, `<Button>`, `<ScreenHeader>`, `<AnimatedPlusButton>`

---

## Files

| Archivo | Cambio |
|---------|--------|
| `src/app/movimientos/page.tsx` | Header simplificado, cards ingresos/gastos, chips siempre visibles, refresh reubicado |
| `src/components/shared/transaction-item.tsx` | Tamaños de texto: fechas `10px→11px`, metadata `11.5px→12px` |

---

## Task 1: Simplificar el header sticky

**Problema:** El header actual tiene 4 capas apiladas (balance+refresh+plus, month selector, search, panel colapsable de filtros). Hay que dejarlo solo con título, month selector, plus button y search.

**Files:**
- Modify: `src/app/movimientos/page.tsx`

- [ ] **Step 1: Reemplazar el bloque `<header>` completo**

Ubicar el bloque `<header>` actual (líneas 241–440) y reemplazarlo con esta versión simplificada:

```tsx
{/* Header Sticky */}
<header className="sticky top-0 z-20 bg-bg-2/95 backdrop-blur-md border-b border-border">
  <div className="mx-auto max-w-[1440px]">
    {/* Row 1: Título + Month + Plus */}
    <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.22em] text-accent-deep mb-0.5">
          Tus mangos
        </p>
        <h1 className="font-poster text-text text-[26px] leading-none">Movimientos</h1>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <MonthSelector currentMonth={currentMonthStr} baseUrl="/movimientos" />
        <AnimatedPlusButton
          label="Crear transacción"
          onClick={() => setIsCreateOpen(true)}
          ariaLabel="Nueva transacción"
        />
      </div>
    </div>

    {/* Row 2: Search */}
    <div className="px-5 pb-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por descripción, categoría o monto..."
          className="w-full bg-surface border-[1.5px] border-border rounded-xl pl-9 pr-10 py-2.5 text-sm text-text placeholder:text-faint focus:outline-none focus:border-accent/40 transition-colors font-sans"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted hover:text-text transition-colors rounded-lg"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {debouncedQuery && (
        <p className="text-[11px] text-muted mt-1.5 px-1">
          {searchFilteredTransactions.length}{' '}
          movimiento{searchFilteredTransactions.length !== 1 ? 's' : ''} encontrado{searchFilteredTransactions.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  </div>
</header>
```

- [ ] **Step 2: Eliminar el state y refs que ya no son necesarios**

Buscar y eliminar del bloque de estados (líneas 27–33 aprox):
```tsx
// ELIMINAR estas líneas:
const [showFilters, setShowFilters] = useState(false);
const searchContainerRef = useRef<HTMLDivElement>(null);
```

Eliminar también el `useEffect` del clickOutside (líneas 64–72):
```tsx
// ELIMINAR este useEffect completo:
useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
      setShowFilters(false);
    }
  };
  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, []);
```

- [ ] **Step 3: Limpiar imports**

Del bloque de imports de lucide-react, eliminar `ChevronDown` y `ChevronRight` (ahora sin uso en page.tsx). Verificar que `Tag` esté disponible en lucide-react — se usará en Task 3.

```tsx
// Cambiar la línea de imports de lucide a:
import { Search, X, CreditCard, Wallet, RefreshCw, Receipt, Tag } from 'lucide-react';
```

- [ ] **Step 4: Verificar que compila sin errores**

```bash
rtk tsc --noEmit
```

Esperado: sin errores de tipo. Si hay errores por `showFilters` o `searchContainerRef` referenciados en JSX, son los usos restantes a limpiar en los Tasks siguientes.

---

## Task 2: Agregar cards de resumen ingresos/gastos

**Problema:** La pantalla no muestra ingresos y gastos por separado, solo el balance neto. El prototipo (`screen-movimientos.jsx`) tiene dos cards: "Ingresos" y "Gastos".

**Files:**
- Modify: `src/app/movimientos/page.tsx`

- [ ] **Step 1: Calcular income y expense del mes filtrado**

Agregar estas dos variables derivadas justo debajo de donde se define `monthlyBalance` (línea ~160):

```tsx
const monthlyIncome = filteredTransactions
  .filter(t => t.type === 'income')
  .reduce((sum, t) => sum + t.amount, 0);

const monthlyExpense = filteredTransactions
  .filter(t => t.type === 'expense')
  .reduce((sum, t) => sum + t.amount, 0);
```

- [ ] **Step 2: Renderizar las cards dentro de `<main>` antes de los filtros**

En el bloque `<main>` (línea ~444), agregar el siguiente bloque como primer hijo, antes del condicional de `filteredTransactions.length === 0`:

```tsx
{/* Resumen del mes */}
<div className="grid grid-cols-2 gap-2.5 mb-4">
  <Card className="p-3.5">
    <div className="flex items-center gap-1.5 text-good text-[10.5px] font-bold uppercase tracking-wider mb-1">
      <span>↓</span> Ingresos
    </div>
    <p className="font-poster text-text text-[20px] tnum leading-none">
      {formatCurrency(monthlyIncome)}
    </p>
  </Card>
  <Card className="p-3.5">
    <div className="flex items-center gap-1.5 text-bad text-[10.5px] font-bold uppercase tracking-wider mb-1">
      <span>↑</span> Gastos
    </div>
    <p className="font-poster text-text text-[20px] tnum leading-none">
      {formatCurrency(monthlyExpense)}
    </p>
  </Card>
</div>

{/* Botón de actualizar cotización */}
<div className="flex justify-end mb-3">
  <Button
    type="button"
    variant="ghost"
    size="sm"
    onClick={handleRefreshRates}
    disabled={isRefreshingRates}
    className="text-muted hover:text-text gap-1.5 h-8 text-xs"
    aria-label="Actualizar cotización del dólar"
  >
    <RefreshCw className={cn('h-3.5 w-3.5', isRefreshingRates && 'animate-spin')} />
    Actualizar cotización
  </Button>
</div>
```

- [ ] **Step 3: Verificar que compila sin errores**

```bash
rtk tsc --noEmit
```

---

## Task 3: Chips de filtro siempre visibles

**Problema:** Los filtros están escondidos dentro del input de búsqueda. El prototipo los muestra siempre en dos filas de chips (medios de pago y categorías).

**Files:**
- Modify: `src/app/movimientos/page.tsx`

- [ ] **Step 1: Agregar los chips de filtro en `<main>` después de las summary cards**

Agregar este bloque entre las summary cards (Task 2) y el condicional de lista vacía. El bloque va después del botón de cotización:

```tsx
{/* Filtros siempre visibles */}
<div className="mb-5 space-y-2">
  {/* Medios de pago */}
  <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
    <Chip
      active={selectedPaymentMethodId === 'all'}
      onClick={() => handleFilterChange('paymentMethod', 'all')}
      icon="wallet"
    >
      Todos
    </Chip>
    {paymentMethods.map((pm) => (
      <Chip
        key={pm.id}
        active={selectedPaymentMethodId === pm.id.toString()}
        onClick={() => handleFilterChange('paymentMethod', pm.id.toString())}
        icon={pm.type === 'credit' ? 'credit-card' : 'wallet'}
      >
        {pm.name}
      </Chip>
    ))}
  </div>

  {/* Categorías */}
  <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
    <Chip
      active={selectedCategoryId === 'all'}
      onClick={() => handleFilterChange('category', 'all')}
      icon="tag"
    >
      Todas
    </Chip>
    {categories.map((cat) => (
      <Chip
        key={cat.id}
        active={selectedCategoryId === cat.id}
        onClick={() => handleFilterChange('category', cat.id)}
      >
        {cat.emoji} {cat.name}
      </Chip>
    ))}
  </div>

  {/* Limpiar filtros activos */}
  {(selectedPaymentMethodId !== 'all' || selectedCategoryId !== 'all') && (
    <div className="flex justify-end">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          const params = new URLSearchParams(searchParams);
          params.delete('paymentMethod');
          params.delete('category');
          router.replace(`${pathname}?${params.toString()}`);
        }}
        className="h-7 text-[11px] uppercase font-bold text-accent hover:text-accent-deep px-2"
      >
        Limpiar filtros
      </Button>
    </div>
  )}
</div>
```

- [ ] **Step 2: Agregar import de `Chip`**

Al inicio del archivo, agregar el import:
```tsx
import { Chip } from '@/components/ui/chip';
```

- [ ] **Step 3: Limpiar el panel de filtros colapsable del antiguo header**

El panel colapsable (`AnimatePresence` con `motion.div` de filtros) ya fue eliminado al reemplazar el header en Task 1. Verificar que no quedan referencias a `showFilters` en el JSX. Si quedan, eliminarlas.

- [ ] **Step 4: Verificar que compila sin errores**

```bash
rtk tsc --noEmit
```

---

## Task 4: Corregir tamaños de texto en `transaction-item.tsx`

**Problema:** Varios textos están por debajo del mínimo legible en mobile. `text-[10px]` para fechas y badges, `text-[11.5px]` para metadata.

**Files:**
- Modify: `src/components/shared/transaction-item.tsx`

- [ ] **Step 1: Fecha de transacción `text-[10px]` → `text-[11px]`**

En `transaction-item.tsx`, buscar el bloque de fecha (líneas ~208–218):

```tsx
// ANTES:
isFutureDate ? (
  <div className="flex items-center gap-1">
    <span className="text-[10px] text-warn font-medium">{formatDate(transaction.date)}</span>
    <span className="inline-block w-1.5 h-1.5 rounded-full bg-warn animate-pulse" />
  </div>
) : (
  <span className="text-[10px] text-faint">{formatDate(transaction.date)}</span>
)

// DESPUÉS:
isFutureDate ? (
  <div className="flex items-center gap-1">
    <span className="text-[11px] text-warn font-medium">{formatDate(transaction.date)}</span>
    <span className="inline-block w-1.5 h-1.5 rounded-full bg-warn animate-pulse" />
  </div>
) : (
  <span className="text-[11px] text-faint">{formatDate(transaction.date)}</span>
)
```

- [ ] **Step 2: Conversión USD `text-[10px]` → `text-[11px]`**

Buscar el badge de conversión USD (línea ~204):

```tsx
// ANTES:
<span className="text-[10px] text-muted tnum">
  ≈ {formatCurrency(Math.abs(transaction.amount))}{rateLabel ? ` · ${rateLabel}` : ''}
</span>

// DESPUÉS:
<span className="text-[11px] text-muted tnum">
  ≈ {formatCurrency(Math.abs(transaction.amount))}{rateLabel ? ` · ${rateLabel}` : ''}
</span>
```

- [ ] **Step 3: Metadata de método/categoría `text-[11.5px]` → `text-[12px]`**

Buscar la línea del div de metadata (línea ~177):

```tsx
// ANTES:
<div className="flex items-center gap-1 text-[11.5px] text-muted truncate mt-0.5">

// DESPUÉS:
<div className="flex items-center gap-1 text-[12px] text-muted truncate mt-0.5">
```

- [ ] **Step 4: Badge de cuotas `text-[10px]` → `text-[11px]`**

Buscar el span de cuotas (línea ~172):

```tsx
// ANTES:
<span className="shrink-0 text-[10px] font-bold text-muted border-[1.5px] border-border px-1.5 py-0.5 rounded-full leading-none">

// DESPUÉS:
<span className="shrink-0 text-[11px] font-bold text-muted border-[1.5px] border-border px-1.5 py-0.5 rounded-full leading-none">
```

- [ ] **Step 5: Verificar que compila**

```bash
rtk tsc --noEmit
```

---

## Task 5: Limpiar imports y verificación final

**Files:**
- Modify: `src/app/movimientos/page.tsx`

- [ ] **Step 1: Verificar imports limpios en `page.tsx`**

Asegurarse de que los imports de lucide en `page.tsx` no incluyan `ChevronDown` ni `ChevronRight` (eliminados al quitar el panel colapsable). La línea debe quedar así:

```tsx
import { Search, X, CreditCard, Wallet, RefreshCw, Receipt, Tag } from 'lucide-react';
```

Verificar que `motion` y `AnimatePresence` de `framer-motion` no sean necesarios en page.tsx. Si los filtros colapsables fueron eliminados por completo, estos imports también pueden eliminarse.

- [ ] **Step 2: Verificar que el estado `isFutureOpen` sigue siendo necesario**

El estado `isFutureOpen` se usa en `renderSection('Proyección Futura', ...)` — debe mantenerse.

- [ ] **Step 3: Build completo**

```bash
rtk next build
```

Esperado: build exitoso sin errores. Warnings de `<img>` o accesibilidad son aceptables.

- [ ] **Step 4: Verificar visualmente en dev server**

```bash
npm run dev
```

Abrir `http://localhost:3000/movimientos` y verificar:
- [ ] Header sticky muestra: kicker + título + MonthSelector + plus button + search
- [ ] Las cards de ingresos/gastos aparecen al inicio del scroll
- [ ] Los chips de métodos de pago son visibles sin tocar el search
- [ ] Los chips de categorías son visibles sin tocar el search
- [ ] Seleccionar un chip filtra la lista correctamente
- [ ] "Limpiar filtros" aparece cuando hay filtros activos
- [ ] El botón de cotización está debajo de las summary cards
- [ ] Textos de fecha en items de transacción son legibles
- [ ] El swipe left/right en mobile sigue funcionando (solo visual — no hay forma de testearlo directamente en browser desktop)

- [ ] **Step 5: Commit**

```bash
rtk git add src/app/movimientos/page.tsx src/components/shared/transaction-item.tsx
rtk git commit -m "fix(movimientos): restructurar UX — filtros visibles, resumen ingresos/gastos, textos legibles"
```
