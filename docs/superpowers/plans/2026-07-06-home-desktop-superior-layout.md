# Home: layout desktop 2 columnas + baja de "Guardar sobrante" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar la zona superior del inicio (`src/app/page.tsx`) en un layout desktop de 2 columnas (principal 2/3 = hero + 4 KPIs, rail 1/3 = consumo tarjeta + insights) y eliminar por completo la feature "Guardar sobrante", preservando toda la infraestructura compartida (`internalTransfers`, tabla `savings`, `getMonthlyExpensesBreakdown`).

**Architecture:** Un solo grid `lg:grid-cols-3 lg:grid-flow-row-dense` reemplaza el actual `lg:grid-cols-4`. `NextMonthCardExposureCard` e `InsightsCarousel` pasan a ser hijos directos del grid (sin `<div>` wrapper) aceptando una prop `className` opcional, de modo que cuando retornan `null` la celda colapsa sin dejar huecos. `MetricRow` se reemplaza por `MetricGrid` (un solo grid de 4 KPIs en vez de dos grids de 2). La feature "Guardar sobrante" se borra de raíz: componente, server action, getter muerto del store y nudge del chatbot.

**Tech Stack:** Next.js App Router (Server/Client Components), Zustand (`useFinanceStore`), Tailwind CSS v4 (tokens semánticos del design system), Vitest.

## Global Constraints

- Tokens semánticos SIEMPRE: `bg-surface`, `bg-bg`, `border-border`, `text-text/muted/faint`, `text-good/warn/bad`, `text-accent`. Nunca hex ni clases `slate-*`/`emerald-*`/`rose-*`/`indigo-*`/`violet-*` de Tailwind.
- Bordes: siempre `border-[1.5px] border-border` (nunca `border` a secas) en componentes nuevos o reescritos.
- Montos: `font-poster` + `tnum`.
- `MetricCard` (dentro de `metric-row.tsx` / futuro `metric-grid.tsx`) se mantiene **visualmente idéntico** — no se le agregan ni quitan estilos.
- El layout de 2 columnas arranca en `lg:` (1024px). Debajo de `lg`, stack de 1 columna sin cambios de layout.
- No se toca: `getMonthlyExpensesBreakdown` (store), slice `internalTransfers` + tabla `internal_transfers`, tabla `savings`, enum `end_of_month_surplus` en `types/database.ts` y en la migración SQL existente.
- No se tocan: sección "Presupuestos y metas" (`BudgetGaugeCard` + `SavingsGoalsRingsCard`) ni nada debajo de ella (Análisis, Últimos movimientos). Tampoco el comportamiento expandible del hero, ni cambios de schema SQL.
- Comandos de verificación del proyecto: `npm run build`, `npm run lint`, `npm test` (Vitest; no hay `@testing-library/react` en el repo — no existen tests de render de componentes, solo de lógica del store).

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `src/components/dashboard/metric-grid.tsx` | **Crear** (reemplaza a metric-row.tsx) |
| `src/components/dashboard/metric-row.tsx` | **Borrar** |
| `src/components/dashboard/next-month-card-exposure-card.tsx` | Modificar (prop `className`) |
| `src/components/dashboard/insights-carousel.tsx` | Modificar (prop `className`) |
| `src/components/dashboard/end-of-month-savings-banner.tsx` | **Borrar** |
| `src/app/dashboard/actions.ts` | **Borrar** (único export, único consumidor era el banner) |
| `src/lib/store/financeStore.ts` | Modificar (borrar `getEndOfMonthSurplusSuggestion`) |
| `src/components/chat/ChatWidget.tsx` | Modificar (borrar nudge proactivo + imports huérfanos) |
| `src/app/page.tsx` | Modificar (grid 2 columnas, sin banner) |
| `src/components/dashboard/balance-card.tsx` | Modificar (polish tipográfico desktop) |
| `src/components/ui/skeletons.tsx` | Modificar (`DashboardSkeleton` refleja el nuevo grid) |

---

### Task 1: Refactor `MetricRow` → `MetricGrid`

Reemplaza los dos `MetricRow` (2 items cada uno) por un único `MetricGrid` (4 items, `grid-cols-2 lg:grid-cols-4`). Es un refactor puro: el resultado visual no cambia todavía (se mantiene el wrapper `col-span-2 lg:col-span-4` del grid actual). El layout de 2 columnas real llega en el Task 6.

**Files:**
- Create: `src/components/dashboard/metric-grid.tsx`
- Delete: `src/components/dashboard/metric-row.tsx`
- Modify: `src/app/page.tsx:25` (import), `src/app/page.tsx:153-199` (uso)

**Interfaces:**
- Produces: `MetricGrid({ items, className }: { items: MetricItemProps[]; className?: string })` — JSX exportado de `metric-grid.tsx`. `MetricItemProps` y `MetricCard` (no exportado) viven en el mismo archivo, idénticos a los actuales de `metric-row.tsx`.

- [ ] **Step 1: Crear `metric-grid.tsx` con `MetricGrid` (reemplaza `MetricRow`)**

Contenido completo de `src/components/dashboard/metric-grid.tsx`:

```tsx
"use client"

import { LucideIcon } from "lucide-react"
import { AreaChart, Area, ResponsiveContainer } from "recharts"
import { cn } from "@/lib/utils"
import { useFinanceStore } from "@/lib/store/financeStore"

type SparklineType = 'income' | 'variable' | 'installments' | 'fixed'

interface MetricItemProps {
  label: string
  value: string
  sublabel?: string
  color?: "emerald" | "rose" | "amber" | "indigo" | "blue"
  icon?: LucideIcon
  onClick?: () => void
  sparklineType?: SparklineType
}

export function MetricGrid({ items, className }: { items: MetricItemProps[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-3", className)}>
      {items.map((item, i) => (
        <MetricCard key={i} {...item} />
      ))}
    </div>
  )
}

const strokeColorMap: Record<string, string> = {
  emerald: "var(--good)",
  rose: "var(--bad)",
  amber: "var(--warn)",
  indigo: "var(--accent)",
  blue: "var(--accent)",
}

function MetricCard({ label, value, sublabel, color = "emerald", icon: Icon, onClick, sparklineType }: MetricItemProps) {
  const colorMap: Record<string, string> = {
    emerald: "text-good",
    rose: "text-bad",
    amber: "text-warn",
    indigo: "text-accent",
    blue: "text-accent",
  }

  const getWeeklySnapshot = useFinanceStore((s) => s.getWeeklySnapshot)
  const rawData = sparklineType ? getWeeklySnapshot(sparklineType) : []
  const hasData = rawData.some((v) => v > 0)
  const chartData = rawData.map((v) => ({ v }))
  const strokeColor = hasData ? strokeColorMap[color] : "var(--muted)"
  const fillColor = hasData ? strokeColorMap[color] : "var(--muted)"

  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={cn(
        "rounded-xl bg-surface border-[1.5px] border-border p-4 space-y-1.5 text-left w-full",
        onClick && "cursor-pointer hover:bg-surface-2/60 active:scale-[0.98] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{label}</span>
        {Icon && <Icon className={cn("h-4 w-4", colorMap[color])} aria-hidden />}
      </div>
      <p className={cn("font-poster tnum text-xl leading-tight truncate", colorMap[color])}>{value}</p>
      {sparklineType && (
        <div role="img" aria-label={`Gráfico de ${label}`} className="w-full">
          <ResponsiveContainer width="100%" height={24}>
            <AreaChart
              data={chartData}
              margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
            >
              <Area
                type="monotone"
                dataKey="v"
                stroke={strokeColor}
                strokeWidth={1.5}
                dot={false}
                fill={fillColor}
                fillOpacity={0.12}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {sublabel && <p className="text-xs text-muted">{sublabel}</p>}
    </Tag>
  )
}
```

- [ ] **Step 2: Borrar `src/components/dashboard/metric-row.tsx`**

```bash
rm src/components/dashboard/metric-row.tsx
```

- [ ] **Step 3: Actualizar el import en `src/app/page.tsx`**

En `src/app/page.tsx:25`, reemplazar:

```tsx
import { MetricRow } from '@/components/dashboard/metric-row';
```

por:

```tsx
import { MetricGrid } from '@/components/dashboard/metric-grid';
```

- [ ] **Step 4: Reemplazar los dos `MetricRow` por un `MetricGrid` en `src/app/page.tsx`**

Reemplazar el bloque (líneas ~153-199, los dos `<MetricRow ...>`):

```tsx
          {/* Metric Row 1: Ingresos y Gastos Variables */}
          <MetricRow
            items={[
              {
                label: "Ingresos mes",
                value: formatCurrency(monthlyIncome),
                sublabel: "Total percibido",
                color: "emerald",
                icon: DollarSign,
                sparklineType: "income",
                onClick: () => setIsIncomeModalOpen(true),
              },
              {
                label: "Variables mes",
                value: formatCurrency(monthlyVariableExpenses),
                sublabel: "Gastos del día a día",
                color: "rose",
                icon: ShoppingBag,
                sparklineType: "variable",
                onClick: () => setIsVariableExpensesModalOpen(true),
              },
            ]}
          />

          {/* Metric Row 2: Cuotas y Mensualidades */}
          <MetricRow
            items={[
              {
                label: "Cuotas mes",
                value: formatCurrency(currentMonthInstallments),
                sublabel: "Ciclo actual",
                color: "indigo",
                icon: CreditCard,
                onClick: () => setIsInstallmentsModalOpen(true),
                sparklineType: "installments",
              },
              {
                label: "Fijos mes",
                value: formatCurrency(monthlyBurnRate),
                sublabel: "Mensualidades",
                color: "amber",
                icon: CalendarClock,
                onClick: () => setIsFixedCostsModalOpen(true),
                sparklineType: "fixed",
              },
            ]}
          />
```

por:

```tsx
          {/* Metric Grid: Ingresos, Variables, Cuotas, Fijos */}
          <MetricGrid
            className="col-span-2 lg:col-span-4"
            items={[
              {
                label: "Ingresos mes",
                value: formatCurrency(monthlyIncome),
                sublabel: "Total percibido",
                color: "emerald",
                icon: DollarSign,
                sparklineType: "income",
                onClick: () => setIsIncomeModalOpen(true),
              },
              {
                label: "Variables mes",
                value: formatCurrency(monthlyVariableExpenses),
                sublabel: "Gastos del día a día",
                color: "rose",
                icon: ShoppingBag,
                sparklineType: "variable",
                onClick: () => setIsVariableExpensesModalOpen(true),
              },
              {
                label: "Cuotas mes",
                value: formatCurrency(currentMonthInstallments),
                sublabel: "Ciclo actual",
                color: "indigo",
                icon: CreditCard,
                onClick: () => setIsInstallmentsModalOpen(true),
                sparklineType: "installments",
              },
              {
                label: "Fijos mes",
                value: formatCurrency(monthlyBurnRate),
                sublabel: "Mensualidades",
                color: "amber",
                icon: CalendarClock,
                onClick: () => setIsFixedCostsModalOpen(true),
                sparklineType: "fixed",
              },
            ]}
          />
```

- [ ] **Step 5: Verificar que no queden referencias a `MetricRow` y que el build pase**

```bash
grep -rn "MetricRow" src
```
Expected: 0 resultados.

```bash
npm run build
```
Expected: build exitoso, sin errores de TypeScript (el `col-span-2 lg:col-span-4` en `MetricGrid` preserva el layout visual actual — 2×2 en mobile/tablet, 1×4 en desktop).

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/metric-grid.tsx src/app/page.tsx
git rm src/components/dashboard/metric-row.tsx
git commit -m "refactor(home): MetricRow -> MetricGrid (grid unico de 4 KPIs)"
```

---

### Task 2: Prop `className` en `NextMonthCardExposureCard` e `InsightsCarousel`

Prepara ambos componentes para ser hijos directos del grid del Task 6. Cambio inerte por ahora: `page.tsx` sigue envolviéndolos en un `<div>` hasta el Task 6, así que agregar la prop no cambia nada visualmente todavía.

**Files:**
- Modify: `src/components/dashboard/next-month-card-exposure-card.tsx`
- Modify: `src/components/dashboard/insights-carousel.tsx`

**Interfaces:**
- Produces: `NextMonthCardExposureCard({ className }: { className?: string })` y `InsightsCarousel({ className }: { className?: string })` — ambos mergean la prop con `cn()` en su nodo raíz. Consumidos por el Task 6.

- [ ] **Step 1: Agregar `className` a `NextMonthCardExposureCard`**

En `src/components/dashboard/next-month-card-exposure-card.tsx`, reemplazar:

```tsx
'use client';

import { CalendarClock } from 'lucide-react';
import { InfoHint } from '@/components/ui/info-hint';
import { useFinanceStore } from '@/lib/store/financeStore';
import { formatCurrency } from '@/lib/utils';

export function NextMonthCardExposureCard() {
  const getNextMonthCardExposure = useFinanceStore((s) => s.getNextMonthCardExposure);
  const { nextCyclePurchases, futureInstallments, total } = getNextMonthCardExposure();

  if (total <= 0) return null;

  return (
    <div className="rounded-2xl bg-surface border-[1.5px] border-border p-4">
```

por:

```tsx
'use client';

import { CalendarClock } from 'lucide-react';
import { InfoHint } from '@/components/ui/info-hint';
import { useFinanceStore } from '@/lib/store/financeStore';
import { cn, formatCurrency } from '@/lib/utils';

export function NextMonthCardExposureCard({ className }: { className?: string }) {
  const getNextMonthCardExposure = useFinanceStore((s) => s.getNextMonthCardExposure);
  const { nextCyclePurchases, futureInstallments, total } = getNextMonthCardExposure();

  if (total <= 0) return null;

  return (
    <div className={cn("rounded-2xl bg-surface border-[1.5px] border-border p-4", className)}>
```

(El resto del archivo, desde `<div className="flex items-center justify-between mb-3">` en adelante, no cambia.)

- [ ] **Step 2: Agregar `className` a `InsightsCarousel`**

En `src/components/dashboard/insights-carousel.tsx`, reemplazar el import y la firma:

```tsx
import { useFinanceStore } from '@/lib/store/financeStore';
```

por:

```tsx
import { useFinanceStore } from '@/lib/store/financeStore';
import { cn } from '@/lib/utils';
```

y reemplazar:

```tsx
export function InsightsCarousel() {
```

por:

```tsx
export function InsightsCarousel({ className }: { className?: string }) {
```

y reemplazar:

```tsx
  return (
    <div className="flex flex-col gap-2">
```

por:

```tsx
  return (
    <div className={cn("flex flex-col gap-2", className)}>
```

(El resto del archivo no cambia.)

- [ ] **Step 3: Verificar build**

```bash
npm run build
```
Expected: build exitoso. Ningún caller pasa `className` todavía (`page.tsx` sigue llamando `<NextMonthCardExposureCard />` e `<InsightsCarousel />` sin props), así que no hay cambio visual.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/next-month-card-exposure-card.tsx src/components/dashboard/insights-carousel.tsx
git commit -m "feat(home): aceptar className en NextMonthCardExposureCard e InsightsCarousel"
```

---

### Task 3: Borrar la superficie de "Guardar sobrante" (banner + server action)

**Files:**
- Delete: `src/components/dashboard/end-of-month-savings-banner.tsx`
- Delete: `src/app/dashboard/actions.ts` (único export `createEndOfMonthSurplusTransfer`, único consumidor era el banner — confirmado por `grep -rn "dashboard/actions" src`)
- Modify: `src/app/page.tsx` (quitar import y uso)

- [ ] **Step 1: Borrar los dos archivos**

```bash
rm src/components/dashboard/end-of-month-savings-banner.tsx
rm src/app/dashboard/actions.ts
```

- [ ] **Step 2: Quitar el import en `src/app/page.tsx`**

Borrar la línea (24):

```tsx
import { EndOfMonthSavingsBanner } from '@/components/dashboard/end-of-month-savings-banner';
```

- [ ] **Step 3: Quitar el uso en `src/app/page.tsx`**

Borrar el bloque:

```tsx
          {/* CTA ahorro: debajo de la card principal de balance */}
          <div className="col-span-2 lg:col-span-4">
            <EndOfMonthSavingsBanner />
          </div>

```

- [ ] **Step 4: Verificar que no queden referencias y que el build pase**

```bash
grep -rn "EndOfMonthSavingsBanner\|createEndOfMonthSurplusTransfer" src
```
Expected: 0 resultados.

```bash
npm run build
```
Expected: build exitoso (nada más importaba `src/app/dashboard/actions.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git rm src/components/dashboard/end-of-month-savings-banner.tsx src/app/dashboard/actions.ts
git commit -m "feat(home): borrar banner y server action de Guardar sobrante"
```

---

### Task 4: Borrar `getEndOfMonthSurplusSuggestion` del store (código muerto)

Este getter no tiene consumidores tras el Task 3 (el banner era el único). No se toca `getMonthlyExpensesBreakdown` ni `internalTransfers`, que siguen usados por otras partes del store y por `ChatWidget` (hasta el Task 5).

**Files:**
- Modify: `src/lib/store/financeStore.ts`

- [ ] **Step 1: Borrar la declaración en la interface**

En `src/lib/store/financeStore.ts`, borrar (líneas ~299-304):

```ts
  getEndOfMonthSurplusSuggestion: () => {
    suggestedAmount: number;
    isEndOfMonth: boolean;
    alreadyTransferred: boolean;
    periodMonth: string;
  };
```

Dejando el bloque anterior (`getMonthlyLiquidityBreakdown`) seguido directamente por lo que venía después de este bloque en la interface.

- [ ] **Step 2: Borrar la implementación**

En el mismo archivo, borrar (líneas ~1980-1999, incluida la línea en blanco final del bloque):

```ts
  getEndOfMonthSurplusSuggestion: () => {
    const { getMonthlyExpensesBreakdown, internalTransfers } = get();
    const now = new Date();
    const lastDay = endOfMonth(now).getDate();
    const isEndOfMonth = now.getDate() >= Math.max(lastDay - 4, 1);
    const periodMonth = format(now, 'yyyy-MM');
    const suggestedAmount = Math.max(getMonthlyExpensesBreakdown().netBalance, 0);

    const alreadyTransferred = internalTransfers.some((transfer) => {
      const transferMonth = transfer.period_date?.slice(0, 7);
      return transfer.transfer_type === 'end_of_month_surplus' && transferMonth === periodMonth;
    });

    return {
      suggestedAmount,
      isEndOfMonth,
      alreadyTransferred,
      periodMonth,
    };
  },

```

No borrar el import de `endOfMonth` ni `format` de `date-fns`: ambos se siguen usando en otros getters del mismo archivo (`endOfMonth` en las líneas ~1436, ~2371, ~2395; `format` en otros getters de fechas).

- [ ] **Step 3: Verificar que no queden referencias y correr tests + build**

```bash
grep -rn "getEndOfMonthSurplusSuggestion" src
```
Expected: 0 resultados.

```bash
npm test
```
Expected: PASS (ningún test en `src/lib/store/__tests__/home-overview-getters.test.ts` ni `disponible-real.test.ts` referencia este getter — solo usan `internalTransfers`, que no se toca).

```bash
npm run build
```
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add src/lib/store/financeStore.ts
git commit -m "refactor(store): borrar getEndOfMonthSurplusSuggestion (codigo muerto)"
```

---

### Task 5: Borrar el nudge proactivo de "Guardar sobrante" en `ChatWidget`

**Files:**
- Modify: `src/components/chat/ChatWidget.tsx`

**Contexto:** tras borrar el `useEffect` del nudge y el helper `getSurplusChatPromptKey`, los imports `useFinanceStore` (de `@/lib/store/financeStore`) y `formatCurrency` (de `@/lib/utils`) quedan sin ningún otro uso en el archivo — se verificó que no aparecen en ningún otro punto de `ChatWidget.tsx` (Ctrl+F / grep confirmaron un único uso de cada uno, ambos dentro del código a borrar). Se borran junto con el resto.

- [ ] **Step 1: Quitar imports que quedan huérfanos**

Reemplazar:

```tsx
"use client"

import { useEffect, useRef } from 'react'
import { useChatStore } from '@/lib/store/chatStore'
import { useFinanceStore } from '@/lib/store/financeStore'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Sparkles, X } from 'lucide-react'
import { ChatBubble } from './ChatBubble'
import { TypingIndicator } from './TypingIndicator'
import { ChatInput } from './ChatInput'
import { QuickActions } from './QuickActions'
import { formatCurrency } from '@/lib/utils'

function getSurplusChatPromptKey(periodMonth: string): string {
  return `chanchito.surplusPrompt.sent.${periodMonth}`
}

function WelcomeMessage() {
```

por:

```tsx
"use client"

import { useEffect, useRef } from 'react'
import { useChatStore } from '@/lib/store/chatStore'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Sparkles, X } from 'lucide-react'
import { ChatBubble } from './ChatBubble'
import { TypingIndicator } from './TypingIndicator'
import { ChatInput } from './ChatInput'
import { QuickActions } from './QuickActions'

function WelcomeMessage() {
```

- [ ] **Step 2: Quitar los valores del store y el `useEffect` del nudge dentro de `ChatWidget()`**

Reemplazar:

```tsx
export function ChatWidget() {
  const { isOpen, toggleChat, messages, isLoading, isListening, addMessage } = useChatStore()
  const getMonthlyExpensesBreakdown = useFinanceStore((s) => s.getMonthlyExpensesBreakdown)
  const internalTransfers = useFinanceStore((s) => s.internalTransfers)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll al último mensaje (scroll interno, no de la página)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages, isLoading])

  // Prompt proactivo temporal: solo fin de mes con sobrante positivo
  useEffect(() => {
    if (!isOpen) return

    const hasAnyChanchitoMessage = messages.some((m) => m.role === 'chanchito')
    if (hasAnyChanchitoMessage) return

    const now = new Date()
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const isEndOfMonth = now.getDate() >= Math.max(lastDay - 4, 1)
    if (!isEndOfMonth) return

    const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const alreadyPrompted = typeof window !== 'undefined' && localStorage.getItem(getSurplusChatPromptKey(periodMonth)) === '1'
    if (alreadyPrompted) return

    const netBalance = getMonthlyExpensesBreakdown().netBalance
    const suggestedAmount = Math.max(netBalance, 0)
    if (suggestedAmount <= 0) return

    const alreadyTransferred = internalTransfers.some((transfer) => {
      const transferMonth = transfer.period_date?.slice(0, 7)
      return transfer.transfer_type === 'end_of_month_surplus' && transferMonth === periodMonth
    })
    if (alreadyTransferred) return

    addMessage({
      role: 'chanchito',
      content: `Estas cerrando el mes con ${formatCurrency(suggestedAmount)} de sobrante. ¿Querés guardarlo en tu chanchito?`,
    })

    if (typeof window !== 'undefined') {
      localStorage.setItem(getSurplusChatPromptKey(periodMonth), '1')
    }
  }, [isOpen, messages, addMessage, getMonthlyExpensesBreakdown, internalTransfers])

  return (
```

por:

```tsx
export function ChatWidget() {
  const { isOpen, toggleChat, messages, isLoading, isListening } = useChatStore()
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll al último mensaje (scroll interno, no de la página)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages, isLoading])

  return (
```

Nota: `addMessage` se quita de la destructuración de `useChatStore()` porque, tras borrar el nudge, no se usa en ningún otro lugar del archivo (verificar con `grep -n "addMessage" src/components/chat/ChatWidget.tsx` antes de guardar — debe dar 0 resultados; si el linter/build señala que sigue en uso en otra parte del componente, mantenerlo en la destructuración).

- [ ] **Step 3: Verificar que no queden referencias y correr build + lint + tests**

```bash
grep -rn "getSurplusChatPromptKey" src
```
Expected: 0 resultados.

```bash
npm run build
```
Expected: build exitoso, sin warnings de imports no usados.

```bash
npm run lint
```
Expected: sin errores (confirma que `useFinanceStore`, `formatCurrency` y `addMessage` no quedaron declarados sin uso).

```bash
npm test
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/ChatWidget.tsx
git commit -m "feat(chat): quitar nudge proactivo de Guardar sobrante"
```

---

### Task 6: Layout desktop de 2 columnas en `src/app/page.tsx`

Este es el cambio visual central del spec. Reemplaza el grid `grid-cols-2 lg:grid-cols-4` por `grid-cols-1 lg:grid-cols-3 lg:grid-flow-row-dense`, con `NextMonthCardExposureCard` e `InsightsCarousel` como hijos directos (sin wrapper) para que el colapso de celda funcione cuando retornan `null`.

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `MetricGrid({ items, className })` (Task 1), `NextMonthCardExposureCard({ className })` e `InsightsCarousel({ className })` (Task 2).

- [ ] **Step 1: Reemplazar el bloque "SECCIÓN A" en `src/app/page.tsx`**

Tras los Tasks 1-3, el bloque actual es:

```tsx
        {/* SECCIÓN A: ESTADO PATRIMONIAL (Bento Grid) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Expandible Balance Card */}
          <div data-tour="balance-card" className="col-span-2 lg:col-span-4">
            <BalanceCard />
          </div>

          {/* Nivel 3: Fondo de Ojo — consumo de tarjeta del proximo mes */}
          <div className="col-span-2 lg:col-span-4">
            <NextMonthCardExposureCard />
          </div>

          {/* Insights Carousel */}
          <div className="col-span-2 lg:col-span-4">
            <InsightsCarousel />
          </div>

          {/* Metric Grid: Ingresos, Variables, Cuotas, Fijos */}
          <MetricGrid
            className="col-span-2 lg:col-span-4"
            items={[
              {
                label: "Ingresos mes",
                value: formatCurrency(monthlyIncome),
                sublabel: "Total percibido",
                color: "emerald",
                icon: DollarSign,
                sparklineType: "income",
                onClick: () => setIsIncomeModalOpen(true),
              },
              {
                label: "Variables mes",
                value: formatCurrency(monthlyVariableExpenses),
                sublabel: "Gastos del día a día",
                color: "rose",
                icon: ShoppingBag,
                sparklineType: "variable",
                onClick: () => setIsVariableExpensesModalOpen(true),
              },
              {
                label: "Cuotas mes",
                value: formatCurrency(currentMonthInstallments),
                sublabel: "Ciclo actual",
                color: "indigo",
                icon: CreditCard,
                onClick: () => setIsInstallmentsModalOpen(true),
                sparklineType: "installments",
              },
              {
                label: "Fijos mes",
                value: formatCurrency(monthlyBurnRate),
                sublabel: "Mensualidades",
                color: "amber",
                icon: CalendarClock,
                onClick: () => setIsFixedCostsModalOpen(true),
                sparklineType: "fixed",
              },
            ]}
          />
        </div>
```

Reemplazarlo por:

```tsx
        {/* SECCIÓN A: ESTADO PATRIMONIAL — principal (hero + 4 KPIs) 2/3 + rail (consumo tarjeta + insights) 1/3 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 lg:grid-flow-row-dense gap-4">

          {/* Hero — principal, fila 1 (cols 1-2) */}
          <div data-tour="balance-card" className="lg:col-span-2">
            <BalanceCard />
          </div>

          {/* Consumo tarjeta próximo mes — rail (col 3). Hijo directo: si retorna null, la celda colapsa. */}
          <NextMonthCardExposureCard className="lg:col-start-3" />

          {/* Insights — rail (col 3). Idem. */}
          <InsightsCarousel className="lg:col-start-3" />

          {/* Las 4 KPIs — principal, fila 2 (cols 1-2) */}
          <MetricGrid
            className="lg:col-span-2"
            items={[
              {
                label: "Ingresos mes",
                value: formatCurrency(monthlyIncome),
                sublabel: "Total percibido",
                color: "emerald",
                icon: DollarSign,
                sparklineType: "income",
                onClick: () => setIsIncomeModalOpen(true),
              },
              {
                label: "Variables mes",
                value: formatCurrency(monthlyVariableExpenses),
                sublabel: "Gastos del día a día",
                color: "rose",
                icon: ShoppingBag,
                sparklineType: "variable",
                onClick: () => setIsVariableExpensesModalOpen(true),
              },
              {
                label: "Cuotas mes",
                value: formatCurrency(currentMonthInstallments),
                sublabel: "Ciclo actual",
                color: "indigo",
                icon: CreditCard,
                onClick: () => setIsInstallmentsModalOpen(true),
                sparklineType: "installments",
              },
              {
                label: "Fijos mes",
                value: formatCurrency(monthlyBurnRate),
                sublabel: "Mensualidades",
                color: "amber",
                icon: CalendarClock,
                onClick: () => setIsFixedCostsModalOpen(true),
                sparklineType: "fixed",
              },
            ]}
          />
        </div>
```

Notar que en mobile/tablet (`grid-cols-1`, sin `lg:`) las clases `lg:col-span-2`/`lg:col-start-3` no aplican: los 4 elementos se apilan en el orden del DOM — `hero → consumo tarjeta → insights → KPIs` — igual que el mobile actual, solo que ya sin el banner de sobrante (borrado en el Task 3).

- [ ] **Step 2: Verificar build**

```bash
npm run build
```
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): layout desktop 2 columnas (principal 2/3 + rail 1/3)"
```

---

### Task 7: Polish tipográfico del hero en desktop

El hero ahora vive en 2/3 del ancho (no full-width), así que se escala levemente en `lg:` para no verse chico. No cambia el comportamiento (sigue expandible con click).

**Files:**
- Modify: `src/components/dashboard/balance-card.tsx`

- [ ] **Step 1: Escalar el padding del header**

En `src/components/dashboard/balance-card.tsx`, reemplazar:

```tsx
        {/* Header siempre visible */}
        <div className="p-5">
```

por:

```tsx
        {/* Header siempre visible */}
        <div className="p-5 lg:p-6">
```

- [ ] **Step 2: Escalar el tamaño del número principal**

Reemplazar:

```tsx
            <span className="font-poster tnum text-[38px] leading-[0.95] text-cream-light min-w-0 truncate">
```

por:

```tsx
            <span className="font-poster tnum text-[38px] lg:text-[46px] leading-[0.95] text-cream-light min-w-0 truncate">
```

- [ ] **Step 3: Verificar build**

```bash
npm run build
```
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/balance-card.tsx
git commit -m "feat(home): escalar tipografia del hero en desktop (lg:)"
```

---

### Task 8: Actualizar `DashboardSkeleton` al nuevo grid

**Files:**
- Modify: `src/components/ui/skeletons.tsx`

**Interfaces:**
- Produces (nuevo, no exportado): `NextMonthCardExposureCardSkeleton()` — placeholder del segundo card del rail.

- [ ] **Step 1: Quitar las clases de posicionamiento de `BalanceCardSkeleton`**

En `src/components/ui/skeletons.tsx`, reemplazar:

```tsx
function BalanceCardSkeleton() {
  return (
    <div className="col-span-2 lg:col-span-4 rounded-2xl bg-surface border border-border p-6">
```

por:

```tsx
function BalanceCardSkeleton() {
  return (
    <div className="rounded-2xl bg-surface border border-border p-6">
```

(El resto de `BalanceCardSkeleton` no cambia.)

- [ ] **Step 2: Quitar las clases de posicionamiento de `InsightsCarouselSkeleton`**

Reemplazar:

```tsx
function InsightsCarouselSkeleton() {
  return (
    <div className="col-span-2 lg:col-span-4 flex flex-col gap-2">
```

por:

```tsx
function InsightsCarouselSkeleton() {
  return (
    <div className="flex flex-col gap-2">
```

(El resto de `InsightsCarouselSkeleton` no cambia.)

- [ ] **Step 3: Agregar `NextMonthCardExposureCardSkeleton`**

Justo antes de `function MetricCardSkeleton() {` en `src/components/ui/skeletons.tsx`, agregar:

```tsx
function NextMonthCardExposureCardSkeleton() {
  return (
    <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
      <Skeleton className="h-4 w-48" />
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-28" />
      </div>
      <Skeleton className="h-3 w-40" />
    </div>
  )
}

```

- [ ] **Step 4: Reescribir la sección "SECCION A" de `DashboardSkeleton`**

Reemplazar:

```tsx
      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 space-y-6">
        {/* SECCION A: Bento Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <BalanceCardSkeleton />
          <InsightsCarouselSkeleton />
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
        </div>
```

por:

```tsx
      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 space-y-6">
        {/* SECCION A: hero + 4 KPIs (principal 2/3) + rail (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <BalanceCardSkeleton />
          </div>
          <div className="lg:col-start-3 space-y-3">
            <NextMonthCardExposureCardSkeleton />
            <InsightsCarouselSkeleton />
          </div>
          <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
        </div>
```

(El resto de `DashboardSkeleton` — sección de charts y de transacciones — no cambia; está fuera de alcance del spec.)

- [ ] **Step 5: Verificar build**

```bash
npm run build
```
Expected: build exitoso.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/skeletons.tsx
git commit -m "feat(home): actualizar DashboardSkeleton al grid de 2 columnas"
```

---

### Task 9: Verificación final (Definition of Done)

Recorre el checklist completo del spec: grep de residuales, ausencia de colores no semánticos, los 3 comandos de verificación del proyecto, y el chequeo visual manual de los 3 estados del rail + el orden mobile.

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Grep de residuales de "Guardar sobrante"**

```bash
grep -rn "EndOfMonthSavingsBanner\|createEndOfMonthSurplusTransfer\|getEndOfMonthSurplusSuggestion\|getSurplusChatPromptKey" src
```
Expected: 0 resultados.

- [ ] **Step 2: Grep de colores no semánticos introducidos**

```bash
grep -rn "slate-\|emerald-\|rose-\|indigo-\|violet-" src/app/page.tsx src/components/dashboard/metric-grid.tsx src/components/dashboard/next-month-card-exposure-card.tsx src/components/dashboard/insights-carousel.tsx src/components/dashboard/balance-card.tsx src/components/ui/skeletons.tsx
```
Expected: 0 resultados (las claves de color `"emerald" | "rose" | "amber" | "indigo" | "blue"` en `MetricItemProps` son identificadores internos que mapean a tokens `text-good/bad/warn/accent` — no son clases Tailwind literales, y ya existían antes de este plan).

- [ ] **Step 3: Build, lint y tests**

```bash
npm run build
```
Expected: 0 errores.

```bash
npm run lint
```
Expected: 0 errores.

```bash
npm test
```
Expected: todos los tests pasan (salvo las fallas preexistentes y ajenas de `dates.test.ts`, documentadas en `CLAUDE.md`).

- [ ] **Step 4: Chequeo visual manual — desktop, 3 estados del rail**

```bash
npm run dev
```

Abrir `http://localhost:3000` en el navegador con la ventana en ≥1024px de ancho (o modo responsive del devtools) y confirmar con el usuario logueado real:

1. **Ambas cards en el rail** (hay consumo de tarjeta del próximo mes Y hay insights): el rail muestra "Consumo tarjeta próximo mes" arriba e "Insights" abajo, sin gap raro, alineados con el hero + fila de KPIs a la izquierda.
2. **Sin consumo tarjeta** (`getNextMonthCardExposure().total <= 0` — usuario sin cuotas/compras de tarjeta para el próximo ciclo): Insights sube y queda pegado al hero, sin hueco en el medio. Se puede forzar temporalmente comentando el `return null` en una copia local no commiteada de `next-month-card-exposure-card.tsx` para verificar, o revisar con una cuenta de prueba sin tarjetas de crédito.
3. **Sin insights** (`getInsights()` vacío): el rail queda solo con la card de consumo de tarjeta, sin hueco debajo.

- [ ] **Step 5: Chequeo visual manual — mobile/tablet**

Con devtools en modo responsive (<1024px), confirmar que el orden es `hero → consumo tarjeta → insights → 4 KPIs (2×2)`, sin el banner de sobrante, y sin otros cambios respecto al layout mobile actual.

- [ ] **Step 6: Confirmar que "Guardar sobrante" no aparece en ningún lado**

En la sesión de chat (ícono flotante del chatbot), verificar que no aparece ningún mensaje proactivo de "sobrante" al abrir el chat, sin importar el día del mes.

- [ ] **Step 7: Commit final (si algún ajuste menor surgió de la verificación visual)**

Si el Step 4/5/6 no requirió cambios de código, no hay nada que commitear en este task — el plan queda cerrado en el commit del Task 8. Si surgió algún ajuste, commitear con:

```bash
git add -A
git commit -m "fix(home): ajustes post-verificacion visual del layout 2 columnas"
```

---

## Self-Review

**Cobertura del spec:**
- Layout 2 columnas (principal 2/3 + rail 1/3), técnica de grid único con `grid-flow-row-dense`, colapso de huecos vía `className` + hijos directos → Tasks 2, 6.
- Refactor `MetricRow` → `MetricGrid` → Task 1.
- Polish tipográfico del hero → Task 7.
- Skeleton actualizado → Task 8.
- Baja completa de "Guardar sobrante" (banner, action, getter, nudge del chat) preservando infraestructura compartida → Tasks 3, 4, 5.
- Definition of Done completa (grep ×2, build, lint, test, verificación visual 3 estados + mobile) → Task 9.

**Placeholders:** ninguno — cada step tiene código completo o comandos exactos con output esperado.

**Consistencia de tipos:** `MetricItemProps`/`MetricGrid` (Task 1) se usa igual en Task 6. `NextMonthCardExposureCard({ className })` e `InsightsCarousel({ className })` (Task 2) se consumen igual en Task 6. Nombres consistentes en todos los tasks.
