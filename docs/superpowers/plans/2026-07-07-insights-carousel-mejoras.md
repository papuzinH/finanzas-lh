# Mejoras al carrusel de insights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar el carrusel de insights del dashboard con 3 datos nuevos, voz de Chanchito en los 8 mensajes, animación derecha→izquierda, swipe táctil, sin dots y accesibilidad completa.

**Architecture:** Toda la lógica de negocio (qué insights existen y su copy) vive en `getInsights()` del store (`financeStore.ts`). El componente `insights-carousel.tsx` solo renderiza y maneja la interacción (auto-rotado, swipe, teclado, animación). Se reutilizan getters ya existentes (`getRegistrationStreak`, `getSavingsGoalsOverview`, `getPortfolioStatus`) sin crear nuevos.

**Tech Stack:** Next.js (App Router, Client Component), Zustand, framer-motion, lucide-react, Tailwind (tokens semánticos), Vitest (entorno `node`, solo store).

## Global Constraints

- **Tono de copy:** Chanchito = copado, argentino, sin exagerar. Aplica a los 8 mensajes.
- **Tokens semánticos SIEMPRE:** `bg-good/8 border-good/25 text-good`, `bg-warn/8 border-warn/25 text-warn`, `bg-accent/8 border-accent/25 text-accent`, `text-text`. Nunca hex ni `emerald/rose/indigo/...`.
- **Bordes:** el componente ya usa `border` + color/opacidad token; se mantiene el patrón existente (no migrar a `border-[1.5px]` en este componente para no romper el look actual del insight).
- **Fechas:** cualquier lógica de fecha usa `parseLocalDate()` (no aplica en este plan: se reutilizan getters que ya la usan).
- **Tests del store:** entorno `node`, patrón `useFinanceStore.setState(... as never)` para sembrar/stubear. NO hay testing-library: el componente se verifica manualmente.
- **Umbrales:** racha `days >= 3`; objetivo activo `percent >= 50`; portafolio `totalInvested > 0 && |totalPLPercent| >= 3`. Tope global de **6** insights.
- **Comandos con `rtk`:** prefijar comandos (git, npm, tsc) con `rtk` por preferencia global del usuario.

---

## File Structure

- `src/lib/store/financeStore.ts` — `getInsights()`: 3 generadores nuevos, reescritura de copy, tope de 6. (Modificar ~líneas 2776–2873.)
- `src/components/dashboard/insights-carousel.tsx` — reescritura completa: animación X, swipe, sin dots, a11y, pausa, reduced-motion, `Flame` en `ICON_MAP`, `STYLE_MAP` sin `dot`/`dotInactive`.
- `src/lib/store/__tests__/insights.test.ts` — nuevo test del getter.

---

## Task 1: `getInsights()` — nuevos insights, copy de Chanchito y tope

**Files:**
- Modify: `src/lib/store/financeStore.ts` (getter `getInsights`, ~líneas 2776–2873)
- Test: `src/lib/store/__tests__/insights.test.ts` (crear)

**Interfaces:**
- Consumes (getters ya existentes, leídos vía `get()`):
  - `getMonthlyComparison(): { currentMonthExpenses: number; previousMonthExpenses: number; percentageChange: number }`
  - `getCategoryComparison(): Array<{ category: string; emoji: string | null; current: number; previous: number }>`
  - `getCurrentMonthInstallments(): unknown[]` · `getCurrentMonthInstallmentsTotal(): number`
  - `getAllBudgetStatuses(): Array<{ categoryName: string; categoryEmoji: string | null; percent: number }>`
  - `getRegistrationStreak(): { days: number; isActiveToday: boolean }`
  - `getSavingsGoalsOverview(): { goals: Array<{ id: string; name: string; percent: number; currency: 'ARS' | 'USD'; status: 'active' | 'completed' }> }`
  - `getPortfolioStatus(): { totalInvested: number; totalPLPercent: number }` (usa solo esos dos campos)
  - `paymentMethods: PaymentMethod[]`
- Produces: `getInsights(): Array<{ type: 'positive' | 'warning' | 'info'; message: string; icon: string }>` (firma sin cambios; máx 6 elementos).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/store/__tests__/insights.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore } from '@/lib/store/financeStore';

// Stubea todos los getters que consume getInsights con salidas neutras
// (ningún insight dispara). Cada test sobreescribe solo lo relevante.
function seedNeutral() {
  useFinanceStore.setState({
    paymentMethods: [],
    getMonthlyComparison: () => ({
      currentMonthExpenses: 0,
      previousMonthExpenses: 0,
      percentageChange: 0,
    }),
    getCategoryComparison: () => [],
    getCurrentMonthInstallments: () => [],
    getCurrentMonthInstallmentsTotal: () => 0,
    getAllBudgetStatuses: () => [],
    getRegistrationStreak: () => ({ days: 0, isActiveToday: false }),
    getSavingsGoalsOverview: () => ({
      goals: [],
      totalSavedARS: 0,
      totalsByCurrency: { ARS: null, USD: null },
      activeCount: 0,
    }),
    getPortfolioStatus: () => ({ totalInvested: 0, totalPLPercent: 0 }),
  } as never);
}

beforeEach(() => {
  seedNeutral();
});

describe('getInsights - racha de registro', () => {
  it('muestra la racha con >= 3 días', () => {
    useFinanceStore.setState({ getRegistrationStreak: () => ({ days: 5, isActiveToday: true }) } as never);
    const insights = useFinanceStore.getState().getInsights();
    const racha = insights.find((i) => i.icon === 'Flame');
    expect(racha).toBeDefined();
    expect(racha!.type).toBe('positive');
    expect(racha!.message).toContain('5 días seguidos');
  });

  it('no muestra la racha con menos de 3 días', () => {
    useFinanceStore.setState({ getRegistrationStreak: () => ({ days: 2, isActiveToday: true }) } as never);
    const insights = useFinanceStore.getState().getInsights();
    expect(insights.find((i) => i.icon === 'Flame')).toBeUndefined();
  });
});

describe('getInsights - progreso de objetivo', () => {
  const goal = (percent: number, status: 'active' | 'completed') => ({
    getSavingsGoalsOverview: () => ({
      goals: [{ id: 'g1', name: 'Vacaciones', percent, currency: 'ARS' as const, status }],
      totalSavedARS: 0,
      totalsByCurrency: { ARS: null, USD: null },
      activeCount: 1,
    }),
  });

  it('muestra el objetivo activo con percent >= 50', () => {
    useFinanceStore.setState(goal(60, 'active') as never);
    const insights = useFinanceStore.getState().getInsights();
    const obj = insights.find((i) => i.message.includes('Vacaciones'));
    expect(obj).toBeDefined();
    expect(obj!.message).toContain('60% de Vacaciones');
  });

  it('no muestra el objetivo con percent < 50', () => {
    useFinanceStore.setState(goal(40, 'active') as never);
    const insights = useFinanceStore.getState().getInsights();
    expect(insights.find((i) => i.message.includes('Vacaciones'))).toBeUndefined();
  });

  it('ignora objetivos ya completados', () => {
    useFinanceStore.setState(goal(100, 'completed') as never);
    const insights = useFinanceStore.getState().getInsights();
    expect(insights.find((i) => i.message.includes('Vacaciones'))).toBeUndefined();
  });
});

describe('getInsights - rendimiento del portafolio', () => {
  it('muestra ganancia con PL positivo >= 3%', () => {
    useFinanceStore.setState({ getPortfolioStatus: () => ({ totalInvested: 1000, totalPLPercent: 8 }) } as never);
    const insights = useFinanceStore.getState().getInsights();
    const pf = insights.find((i) => i.message.includes('portafolio'));
    expect(pf).toBeDefined();
    expect(pf!.type).toBe('positive');
    expect(pf!.message).toContain('+8%');
  });

  it('muestra caída con PL negativo <= -3%', () => {
    useFinanceStore.setState({ getPortfolioStatus: () => ({ totalInvested: 1000, totalPLPercent: -8 }) } as never);
    const insights = useFinanceStore.getState().getInsights();
    const pf = insights.find((i) => i.message.includes('portafolio'));
    expect(pf).toBeDefined();
    expect(pf!.type).toBe('warning');
    expect(pf!.message).toContain('8%');
  });

  it('no muestra nada si el movimiento es menor al 3%', () => {
    useFinanceStore.setState({ getPortfolioStatus: () => ({ totalInvested: 1000, totalPLPercent: 1 }) } as never);
    expect(useFinanceStore.getState().getInsights().find((i) => i.message.includes('portafolio'))).toBeUndefined();
  });

  it('no muestra nada sin inversiones', () => {
    useFinanceStore.setState({ getPortfolioStatus: () => ({ totalInvested: 0, totalPLPercent: 20 }) } as never);
    expect(useFinanceStore.getState().getInsights().find((i) => i.message.includes('portafolio'))).toBeUndefined();
  });
});

describe('getInsights - tope de 6', () => {
  it('nunca devuelve más de 6 insights', () => {
    useFinanceStore.setState({
      getMonthlyComparison: () => ({ currentMonthExpenses: 100, previousMonthExpenses: 200, percentageChange: -50 }),
      getCategoryComparison: () => [{ category: 'Comida', emoji: '🍔', current: 200, previous: 100 }],
      getCurrentMonthInstallments: () => [{}],
      getCurrentMonthInstallmentsTotal: () => 5000,
      getAllBudgetStatuses: () => [{ categoryName: 'Ocio', categoryEmoji: null, percent: 80 }],
      getRegistrationStreak: () => ({ days: 5, isActiveToday: true }),
      getSavingsGoalsOverview: () => ({
        goals: [{ id: 'g1', name: 'Meta', percent: 70, currency: 'ARS', status: 'active' }],
        totalSavedARS: 0, totalsByCurrency: { ARS: null, USD: null }, activeCount: 1,
      }),
      getPortfolioStatus: () => ({ totalInvested: 1000, totalPLPercent: 8 }),
    } as never);
    // 7 generadores disparan → slice a 6
    expect(useFinanceStore.getState().getInsights().length).toBe(6);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `rtk npx vitest run src/lib/store/__tests__/insights.test.ts`
Expected: FALLA — los mensajes actuales no contienen la copy nueva (`5 días seguidos`, `60% de Vacaciones`, `+8%`, etc.) y no existe el tope; racha/objetivo/portafolio aún no se generan.

- [ ] **Step 3: Actualizar la destructuración de getters en `getInsights`**

En `src/lib/store/financeStore.ts`, dentro de `getInsights: () => {`, ampliar el objeto destructurado de `get()` para incluir los tres getters nuevos:

```ts
    const {
      getMonthlyComparison,
      getCategoryComparison,
      getCurrentMonthInstallments,
      getCurrentMonthInstallmentsTotal,
      getAllBudgetStatuses,
      paymentMethods,
      getSavingsGoalsOverview,
      getRegistrationStreak,
      getPortfolioStatus,
    } = get();
```

- [ ] **Step 4: Reescribir la copy de los 5 insights existentes (voz de Chanchito)**

Reemplazar los `message` existentes por estos (mantener toda la lógica de condiciones e íconos):

```ts
    // 1. Comparación de gasto vs mes anterior
    if (percentageChange < 0) {
      const saved = Math.abs(percentageChange).toFixed(0);
      insights.push({
        type: 'positive',
        message: `Gastaste un ${saved}% menos que el mes pasado. ¡Bien ahí! 🎉`,
        icon: 'TrendingDown',
      });
    } else if (percentageChange > 15) {
      const increase = percentageChange.toFixed(0);
      insights.push({
        type: 'warning',
        message: `Ojo que tu gasto subió un ${increase}% contra el mes pasado 👀`,
        icon: 'TrendingUp',
      });
    }

    // 2. Categoría con mayor suba (>20%)
    // ... (dentro del if (biggestRise))
      message: `Ojo con ${emoji}${biggestRise.category}: subió un ${pct}% este mes 👀`,

    // 3. Cuotas que vencen este mes
    // ... (dentro del if (installments.length > 0))
      message: `Este mes se vienen ${installments.length} cuota${installments.length > 1 ? 's' : ''} por ${totalFormatted} 💳`,

    // 4. Presupuesto más cercano al límite
    // ... (dentro del if (criticalBudget))
      message: `Ya vas al ${pct}% del presupuesto de ${emoji}${criticalBudget.categoryName}, con ${daysRemaining} días por delante`,

    // 5. Tarjetas que necesitan actualización de fechas
    // ... (dentro del for (const card of creditCardsNeedingUpdate))
      message: `Che, actualizá el cierre y vencimiento de ${card.name} para el nuevo ciclo 📅`,
```

- [ ] **Step 5: Agregar los 3 generadores nuevos antes del `return`**

Justo antes de `return insights;` (que se cambia en el paso 6), insertar:

```ts
    // 6. Progreso de objetivo de ahorro (activo con mayor avance, >= 50%)
    const { goals } = getSavingsGoalsOverview();
    const topGoal = goals
      .filter((g) => g.status === 'active')
      .sort((a, b) => b.percent - a.percent)[0];
    if (topGoal && topGoal.percent >= 50) {
      insights.push({
        type: 'info',
        message: `Ya llevás ${Math.round(topGoal.percent)}% de ${topGoal.name}. ¡Se viene! 🎯`,
        icon: 'Target',
      });
    }

    // 7. Racha de registro
    const { days } = getRegistrationStreak();
    if (days >= 3) {
      insights.push({
        type: 'positive',
        message: `Venís ${days} días seguidos anotando todo. ¡Así se hace! 🔥`,
        icon: 'Flame',
      });
    }

    // 8. Rendimiento del portafolio
    const { totalInvested, totalPLPercent } = getPortfolioStatus();
    if (totalInvested > 0 && Math.abs(totalPLPercent) >= 3) {
      const pct = Math.abs(totalPLPercent).toFixed(0);
      if (totalPLPercent > 0) {
        insights.push({
          type: 'positive',
          message: `Tu portafolio viene +${pct}% arriba. ¡Joya! 📈`,
          icon: 'TrendingUp',
        });
      } else {
        insights.push({
          type: 'warning',
          message: `Tu portafolio cayó ${pct}%. Tranqui, es parte del juego 📉`,
          icon: 'TrendingDown',
        });
      }
    }
```

- [ ] **Step 6: Aplicar el tope de 6 en el `return`**

Cambiar `return insights;` por:

```ts
    return insights.slice(0, 6);
```

Actualizar también el bloque JSDoc arriba del getter para listar los insights 6/7/8 y el tope (agregar líneas al comentario existente que enumera "Insights generados").

- [ ] **Step 7: Correr el test y verificar que pasa**

Run: `rtk npx vitest run src/lib/store/__tests__/insights.test.ts`
Expected: PASS (todos los `describe`).

- [ ] **Step 8: Typecheck y lint**

Run: `rtk npx tsc --noEmit` y `rtk npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 9: Commit**

```bash
rtk git add src/lib/store/financeStore.ts src/lib/store/__tests__/insights.test.ts
rtk git commit -m "$(cat <<'EOF'
feat(dashboard): nuevos insights y voz de Chanchito en el carrusel

Agrega racha de registro, progreso de objetivo y rendimiento de
portafolio a getInsights(), reescribe los 8 mensajes con tono argentino
y aplica un tope de 6 insights.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `insights-carousel.tsx` — animación horizontal, swipe, sin dots, a11y

**Files:**
- Modify (reescritura completa): `src/components/dashboard/insights-carousel.tsx`

**Interfaces:**
- Consumes: `useFinanceStore(s => s.getInsights)` → `Array<{ type; message; icon }>` (de Task 1).
- Produces: componente `<InsightsCarousel className?: string />` (firma sin cambios; se sigue usando en `src/app/page.tsx:141`).

**Nota de verificación:** el proyecto no tiene testing-library (Vitest corre en entorno `node`). Este componente se verifica con typecheck + lint + prueba manual en `npm run dev`. No se escribe test automatizado del drag/animación.

- [ ] **Step 1: Reescribir el componente completo**

Reemplazar TODO el contenido de `src/components/dashboard/insights-carousel.tsx` por:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'framer-motion';
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CreditCard,
  AlertCircle,
  Target,
  Lightbulb,
  Flame,
} from 'lucide-react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CreditCard,
  AlertCircle,
  Target,
  Lightbulb,
  Flame,
};

const STYLE_MAP = {
  positive: { card: 'bg-good/8 border-good/25', icon: 'text-good' },
  warning: { card: 'bg-warn/8 border-warn/25', icon: 'text-warn' },
  info: { card: 'bg-accent/8 border-accent/25', icon: 'text-accent' },
};

const ROTATION_INTERVAL = 5000;
const SWIPE_OFFSET_THRESHOLD = 60;
const SWIPE_VELOCITY_THRESHOLD = 300;

export function InsightsCarousel({ className }: { className?: string }) {
  const getInsights = useFinanceStore((s) => s.getInsights);
  const insights = getInsights();
  const reduceMotion = useReducedMotion();

  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);

  const count = insights.length;

  // Mantener el índice en rango si cambia la cantidad de insights.
  useEffect(() => {
    if (current > count - 1) setCurrent(0);
  }, [count, current]);

  const goRelative = (delta: number) => {
    if (count <= 1) return;
    setDirection(delta);
    setCurrent((prev) => (prev + delta + count) % count);
  };

  // Auto-rotado derecha→izquierda. Se reinicia con `current` (nav manual),
  // se pausa on hover/focus/drag y se desactiva con reduced-motion.
  useEffect(() => {
    if (count <= 1 || paused || reduceMotion) return;
    const timer = setTimeout(() => goRelative(1), ROTATION_INTERVAL);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, count, paused, reduceMotion]);

  if (count === 0) return null;

  const insight = insights[Math.min(current, count - 1)];
  const styles = STYLE_MAP[insight.type];
  const IconComponent = ICON_MAP[insight.icon] ?? Lightbulb;

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_OFFSET_THRESHOLD || info.velocity.x < -SWIPE_VELOCITY_THRESHOLD) {
      goRelative(1);
    } else if (info.offset.x > SWIPE_OFFSET_THRESHOLD || info.velocity.x > SWIPE_VELOCITY_THRESHOLD) {
      goRelative(-1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goRelative(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goRelative(-1);
    }
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        styles.card,
        className
      )}
      role="group"
      aria-roledescription="carrusel"
      aria-label="Novedades de tus finanzas"
      tabIndex={count > 1 ? 0 : -1}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={current}
          custom={direction}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -40 }}
          transition={{ duration: 0.28, ease: 'easeInOut' }}
          drag={count > 1 ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragStart={() => setPaused(true)}
          onDragEnd={handleDragEnd}
          style={{ touchAction: 'pan-y' }}
          className={cn('flex items-center gap-3', count > 1 && 'cursor-grab active:cursor-grabbing')}
        >
          <div className={cn('flex-shrink-0', styles.icon)}>
            <IconComponent className="w-4 h-4" />
          </div>
          <p className="text-sm text-text leading-snug">{insight.message}</p>
        </motion.div>
      </AnimatePresence>

      {/* Región viva estable para lectores de pantalla (fuera de AnimatePresence). */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {insight.message}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck y lint**

Run: `rtk npx tsc --noEmit` y `rtk npm run lint`
Expected: sin errores. (Verifica que `PanInfo` y `useReducedMotion` existan en la versión de framer-motion instalada; si el import de tipo falla, usar `import { type PanInfo }` desde `framer-motion` — ya está así.)

- [ ] **Step 3: Verificación manual en la app**

Run: `rtk npm run dev` y abrir el dashboard.
Checklist (idealmente con >1 insight; sembrar datos si hace falta):
  - [ ] Los mensajes auto-avanzan cada ~5s y el nuevo **entra desde la derecha**, el viejo **sale por la izquierda**.
  - [ ] **No hay dots** debajo de la tarjeta.
  - [ ] **Swipe** con el mouse/dedo hacia la izquierda avanza; hacia la derecha retrocede.
  - [ ] Al pasar el mouse por encima (o enfocar con Tab), el auto-avance **se pausa**; al salir, se reanuda.
  - [ ] Con foco en la tarjeta, `←`/`→` navegan.
  - [ ] En mobile, un **swipe vertical sigue scrolleando** la página (no lo secuestra el drag horizontal).
  - [ ] Con "reduce motion" activo en el SO, no hay deslizamiento horizontal ni auto-avance (solo fade al navegar manualmente).
  - [ ] Los colores de la tarjeta cambian según el tipo (good/warn/accent) usando tokens.

- [ ] **Step 4: Commit**

```bash
rtk git add src/components/dashboard/insights-carousel.tsx
rtk git commit -m "$(cat <<'EOF'
feat(dashboard): carrusel de insights con swipe y sin dots

Animación horizontal (derecha→izquierda), swipe táctil con framer-motion,
navegación por teclado, pausa on hover/focus, soporte de reduced-motion y
eliminación de los dots indicadores.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**
- Nuevos insights (racha, objetivo, portafolio) → Task 1, steps 5. ✅
- Reescritura de tono de los 8 mensajes → Task 1, steps 4–5. ✅
- Tope de 6 → Task 1, step 6 + test. ✅
- `Flame` en ICON_MAP → Task 2, step 1. ✅
- Animación derecha→izquierda → Task 2, step 1 (eje `x`). ✅
- Swipe → Task 2, step 1 (`drag="x"` + `handleDragEnd`). ✅
- Sin dots → Task 2, step 1 (no se renderiza el bloque de dots; `STYLE_MAP` sin `dot`). ✅
- A11y (aria-live, teclado, pausa, reduced-motion) → Task 2, step 1. ✅
- Test del getter → Task 1, step 1. ✅
- Riesgo drag vs scroll → Task 2, step 1 (`touchAction: 'pan-y'`) + step 3 (checklist). ✅

**2. Placeholder scan:** Sin TBD/TODO. Todo el código de steps es completo. ✅

**3. Type consistency:** `getInsights` mantiene su firma `Array<{ type; message; icon }>`. `goRelative(delta)`, `handleDragEnd(_e, info: PanInfo)`, `handleKeyDown(e)` consistentes. Los stubs del test respetan los shapes reales de los getters. ✅
