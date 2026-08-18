# Layouts etapa 2 — Slice 0 (nav) + Piloto Objetivos · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nav mobile de 6→5 destinos con sheet "Más", housekeeping de docs, y la pantalla Objetivos reestructurada al layout del mock del 14-ago — el piloto que valida el método para las 3 pantallas restantes.

**Architecture:** Solo capa de presentación: se reescriben componentes de pantalla y presentacionales usando los getters existentes del store. Los mocks (`../claude-design/*.html`) mandan en estructura; los colores/tipos salen de los tokens del repo. Helpers de copy como funciones puras con TDD.

**Tech Stack:** Next.js App Router · Tailwind v4 con tokens `@theme` · Zustand (`useFinanceStore`) · Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-layouts-pantallas-design.md`

**Alcance de este plan**: Slice 0 + Slice 1 (Objetivos). El plan de Movimientos/Compromisos/Inversiones se escribe **después** de la aprobación visual del piloto, con el método ya validado.

## Global Constraints

- Prohibido tocar `lib/finance/`, los getters del store, actions y handlers del chat.
- Tokens semánticos siempre (`bg-bg`, `text-good`…); nunca hex ni escalas Tailwind (`slate-*`, `emerald-*`…).
- Bordes `border-[1.5px] border-border`. Números financieros con `tnum`. `font-display` nunca con `font-bold`.
- Una sola cifra con `--shadow-bandera` por pantalla (en Objetivos: ninguna — el mock no la usa).
- Baseline de verificación: `npm run lint` = 24 errores preexistentes (ni uno más) · `npx tsc --noEmit` limpio · `npm test` 359+ verdes (los nuevos suman) · `npm run build` OK.
- Sin base DEV: la verificación NO ejecuta escrituras (no borrar, no backfillear, no pagar).
- Mock de referencia del piloto: `../claude-design/Objetivos-render.html` (+ `ObjetivosNoche-render.html`), viewport 390px.

---

### Task 1: Rescate del spec huérfano + rama de trabajo

**Files:**
- Ninguno editado a mano (solo git).

**Interfaces:**
- Produces: `master` con el spec `docs/superpowers/specs/2026-08-14-design-system-identidad-v2-design.md` rescatado; rama `layout/nav-y-objetivos` creada desde `master`; rama `identidad-v2` eliminada.

- [ ] **Step 1: Verificar estado limpio y traer master**

```bash
git checkout master && git pull --ff-only && git status
```
Expected: working tree clean, master al día con origin.

- [ ] **Step 2: Cherry-pick del spec huérfano**

```bash
git cherry-pick 59e76ad
```
Expected: aplica limpio (es un solo archivo nuevo en `docs/superpowers/specs/`). Si hay conflicto, abortar y avisar — no resolver a mano.

- [ ] **Step 3: Verificar y pushear**

```bash
git log --oneline -2 && git push
```
Expected: el commit "spec: design system identidad v2 …" arriba de master.

- [ ] **Step 4: Borrar la rama vieja y crear la de trabajo**

```bash
git branch -D identidad-v2
git checkout -b layout/nav-y-objetivos
```
Expected: `identidad-v2` ya no existe (su único commit propio quedó rescatado); rama nueva activa.

---

### Task 2: Config de nav + helper `isMoreActive` (TDD)

**Files:**
- Create: `src/components/layout/nav-config.ts`
- Test: `src/components/layout/__tests__/nav-config.test.ts`

**Interfaces:**
- Produces: `MOBILE_ITEMS: { label: string; href: string }[]` (4 ítems, sin "Más") · `MORE_DESTINATIONS: { label: string; href: string }[]` (3 ítems) · `isActive(href: string, pathname: string): boolean` · `isMoreActive(pathname: string): boolean`. Task 3 los consume desde `main-nav.tsx`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/layout/__tests__/nav-config.test.ts
import { describe, it, expect } from 'vitest';
import { MOBILE_ITEMS, MORE_DESTINATIONS, isActive, isMoreActive } from '../nav-config';

describe('nav-config', () => {
  it('la barra mobile tiene 4 destinos directos, sin Inversiones', () => {
    expect(MOBILE_ITEMS.map(i => i.href)).toEqual(['/', '/movimientos', '/compromisos', '/objetivos']);
  });

  it('Más agrupa Inversiones, Medios de pago y Ajustes', () => {
    expect(MORE_DESTINATIONS.map(i => i.href)).toEqual(['/inversiones', '/medios-pago', '/ajustes']);
  });

  it('isActive: raíz solo exacta; el resto por prefijo de segmento', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/', '/movimientos')).toBe(false);
    expect(isActive('/movimientos', '/movimientos')).toBe(true);
    expect(isActive('/movimientos', '/movimientos/detalle')).toBe(true);
    expect(isActive('/movimientos', '/movimientos-x')).toBe(false);
  });

  it('isMoreActive: true en cualquier destino del sheet, incluidas subrutas', () => {
    expect(isMoreActive('/inversiones')).toBe(true);
    expect(isMoreActive('/medios-pago')).toBe(true);
    expect(isMoreActive('/ajustes')).toBe(true);
    expect(isMoreActive('/ajustes/medios')).toBe(true);
    expect(isMoreActive('/objetivos')).toBe(false);
    expect(isMoreActive('/')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/__tests__/nav-config.test.ts`
Expected: FAIL — módulo `../nav-config` inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/layout/nav-config.ts
// Destinos de la bottom nav mobile (5º = "Más", que abre un sheet — ver main-nav).
// Los íconos viven en main-nav.tsx: este módulo es puro para poder testearlo.

export const MOBILE_ITEMS = [
  { label: 'Inicio', href: '/' },
  { label: 'Movimientos', href: '/movimientos' },
  { label: 'Compromisos', href: '/compromisos' },
  { label: 'Objetivos', href: '/objetivos' },
];

export const MORE_DESTINATIONS = [
  { label: 'Inversiones', href: '/inversiones' },
  { label: 'Medios de pago', href: '/medios-pago' },
  { label: 'Ajustes', href: '/ajustes' },
];

export function isActive(href: string, pathname: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}

export function isMoreActive(pathname: string) {
  return MORE_DESTINATIONS.some((d) => isActive(d.href, pathname));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/__tests__/nav-config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/nav-config.ts src/components/layout/__tests__/nav-config.test.ts
git commit -m "feat(nav): config de destinos con Más agrupando Inversiones/Medios/Ajustes"
```

---

### Task 3: MainNav 6→5 con sheet "Más"

**Files:**
- Modify: `src/components/layout/main-nav.tsx` (completo — hoy define `mobileItems` de 6 con Inversiones y Más→/ajustes directo)

**Interfaces:**
- Consumes: `MOBILE_ITEMS`, `MORE_DESTINATIONS`, `isActive`, `isMoreActive` de `@/components/layout/nav-config` · `ActionSheet` de `@/components/ui/action-sheet` (API: `{ open, onOpenChange, title, actions: { label, icon?, onClick }[] }`).
- Produces: nav mobile de 5 posiciones; "Más" se pinta activo en `/inversiones`, `/medios-pago`, `/ajustes`. Desktop sidebar intacta.

- [ ] **Step 1: Reescribir `main-nav.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Home, ListOrdered, Layers, Target, TrendingUp, Settings, Wallet, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { ActionSheet } from '@/components/ui/action-sheet';
import { MOBILE_ITEMS, MORE_DESTINATIONS, isActive, isMoreActive } from './nav-config';

const ICONS: Record<string, LucideIcon> = {
  '/': Home,
  '/movimientos': ListOrdered,
  '/compromisos': Layers,
  '/objetivos': Target,
  '/inversiones': TrendingUp,
  '/medios-pago': Wallet,
  '/ajustes': Settings,
};

const desktopItems = [
  { label: 'Inicio', href: '/' },
  { label: 'Movimientos', href: '/movimientos' },
  { label: 'Compromisos', href: '/compromisos' },
  { label: 'Objetivos', href: '/objetivos' },
  { label: 'Inversiones', href: '/inversiones' },
  { label: 'Ajustes', href: '/ajustes' },
];

export function MainNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {/* ========== MOBILE BOTTOM NAV ========== */}
      <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden">
        <div
          className="bg-bg-2/95 backdrop-blur border-t-[1.5px] border-border"
          style={{ boxShadow: '0 -6px 20px -12px rgb(var(--navy-700-rgb) / 0.4)' }}
        >
          <div className="flex items-stretch justify-between px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
            {MOBILE_ITEMS.map(({ label, href }) => {
              const Icon = ICONS[href];
              const on = isActive(href, pathname);
              return (
                <Link key={href} href={href} className="flex-1">
                  <motion.div whileTap={{ scale: 0.88 }} className="flex flex-col items-center gap-1 py-1">
                    <span className={`grid place-items-center w-11 h-8 rounded-full transition-colors ${on ? 'bg-accent text-accent-ink' : 'text-muted'}`}>
                      <Icon size={20} strokeWidth={on ? 2.4 : 2} />
                    </span>
                    <span className={`text-[9.5px] font-bold tracking-tight transition-colors ${on ? 'text-text' : 'text-faint'}`}>
                      {label}
                    </span>
                  </motion.div>
                </Link>
              );
            })}
            <button type="button" onClick={() => setMoreOpen(true)} className="flex-1" aria-label="Más destinos">
              <motion.div whileTap={{ scale: 0.88 }} className="flex flex-col items-center gap-1 py-1">
                <span className={`grid place-items-center w-11 h-8 rounded-full transition-colors ${isMoreActive(pathname) ? 'bg-accent text-accent-ink' : 'text-muted'}`}>
                  <MoreHorizontal size={20} strokeWidth={isMoreActive(pathname) ? 2.4 : 2} />
                </span>
                <span className={`text-[9.5px] font-bold tracking-tight transition-colors ${isMoreActive(pathname) ? 'text-text' : 'text-faint'}`}>
                  Más
                </span>
              </motion.div>
            </button>
          </div>
          <div className="mx-auto h-1 w-32 rounded-full bg-text opacity-25 mb-1" />
        </div>
      </nav>

      <ActionSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        title="Más"
        actions={MORE_DESTINATIONS.map(({ label, href }) => {
          const Icon = ICONS[href];
          return {
            label,
            icon: <Icon size={18} strokeWidth={2} aria-hidden="true" />,
            onClick: () => router.push(href),
          };
        })}
      />

      {/* ========== DESKTOP SIDEBAR (sin cambios de destino) ========== */}
      <nav className="hidden fixed left-0 top-0 z-40 h-full w-64 border-r-[1.5px] border-border bg-bg-2 p-6 md:flex md:flex-col">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="relative h-10 w-10 overflow-hidden rounded-full border-[1.5px] border-border">
            <Image src="/icon.png" alt="Chanchito" fill className="object-cover" />
          </div>
          <h1 className="font-display text-text text-[20px]">Chanchito</h1>
        </div>
        <div className="flex flex-col gap-1">
          {desktopItems.map(({ label, href }) => {
            const Icon = ICONS[href];
            const on = isActive(href, pathname);
            return (
              <Link key={href} href={href}>
                <motion.div
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[13.5px] font-bold transition-colors ${
                    on ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text hover:bg-surface'
                  }`}
                >
                  <Icon size={18} strokeWidth={on ? 2.4 : 2} />
                  {label}
                </motion.div>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
```

- [ ] **Step 2: Verificar typecheck y suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpio; suite completa verde.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/main-nav.tsx
git commit -m "feat(nav): la barra mobile pasa a 5 destinos, Más abre sheet"
```

---

### Task 4: Docs — sección UI del CLAUDE.md + cierre del design-system-plan

**Files:**
- Modify: `CLAUDE.md` (secciones `## UI` y `## Prototipos de referencia`)
- Modify: `design-system-plan.md` (nota de cierre arriba del título)

**Interfaces:**
- Produces: documentación alineada al sistema vigente; ninguna otra task depende de esto, pero toda iteración agéntica futura sí.

- [ ] **Step 1: Reemplazar la sección `## UI` del CLAUDE.md**

Borrar la sección `## UI` completa (desde `## UI` hasta la línea anterior a `## Prototipos de referencia`) y escribir en su lugar:

```markdown
## UI
- **Temas**: crema de día / papel de estraza de noche. El usuario elige en `/ajustes` (ThemeToggle + `theme-script` anti-flash, clase en `<html>`). ⚠️ Las utilities `dark:` de Tailwind NO funcionan acá (resuelven por `prefers-color-scheme`, el tema es por clase): usar tokens, que ya cambian con el tema.
- **Fondo de app**: `bg-bg`. Cards: `bg-surface`.
- **Tokens semánticos SIEMPRE**: nunca hardcodees hex ni colores Tailwind para UI.
  - Layout: `bg-bg`, `bg-bg-2`, `bg-surface`, `bg-surface-2`, `text-text`, `text-muted`, `text-faint`, `border-border`
  - Acento: `bg-accent text-accent-ink border-accent-deep shadow-offset`
  - Financiero: `text-good` (ingreso/positivo), `text-bad` (gasto/negativo), `text-warn` (atención)
  - Marca: `--bandera` (celeste de la cinta, fijo — no cambia con el tema), `--shadow-bandera` (la firma: doble sombra tiza+celeste; UNA cifra por pantalla, con padding a la derecha/abajo para que `truncate`/`overflow` no la recorte), `--logo-slot` (ranuras del chancho), paleta `--estraza-*` (noche).
- **NO usar**: `emerald-*`, `rose-*`, `indigo-*`, `violet-*`, `slate-*` ni `dark:` para UI nueva.
- **Bordes**: siempre `border-[1.5px] border-border`. Nunca `border` (1px default).
- **Tipografía** (por rol — identidad 2026-08-13):
  - `font-display` (Fugaz One): cifras, títulos de pantalla y de sección. Un solo peso — nunca sumarle `font-bold`. Cifras con `--leading-display`.
  - `font-sans` (Asap): TODA la UI de texto (labels, descripciones, botones)
  - `font-serif` (Bitter): sello, cintas y usos editoriales de marca
  - `tnum`: TODOS los números financieros (alineación en columna)
- **Marca**: el chancho es `<Chancho>` de `@/components/brand/chancho` — NUNCA `<img>` (se recolorea por tema; pasarle `slot` con el color del fondo cuando se apoya sobre superficie de color). Assets en `public/brand/*.svg`. Emoji: los del usuario en sus categorías se respetan como dato; la UI de marca no agrega emoji propios.
- **Botones**: `<Button>` de `@/components/ui/button` → pill + `border-[1.5px] shadow-offset active:translate-y-[2px]`. Variants: `accent`, `navy`, `soft`, `ghost`.
- **Cards**: `<Card>` de `@/components/ui/card` → `rounded-2xl bg-surface border-[1.5px] border-border shadow-card`.
- **Tabs**: `<TabsDS>` de `@/components/ui/tabs-ds`. **Toggles**: `<ToggleDS>`. **Chips**: `<Chip>`. **Banners**: `<BannerDS>`. **Progress bars**: `<ProgressBar>` con `tone="accent|good|warn|bad"`.
- **Íconos**: `lucide-react` directo (importar específicos) O `<Icon name="..." />` de `@/components/ui/icon`.
- **ScreenHeader**: `<ScreenHeader title="..." right={...} />` de `@/components/shared/screen-header`; variante `compact` (título 22px, sin kicker) para las pantallas alineadas a los mocks de layouts.
- **Nav**: bottom nav mobile de **5 destinos** (Inicio, Movimientos, Compromisos, Objetivos, Más); "Más" abre un ActionSheet con Inversiones, Medios de pago y Ajustes (`nav-config.ts`). Desktop sidebar: 6 ítems directos.
- **Mobile-first**: canvas base 390px (el de los mocks). Margen lateral `px-5`. Touch targets ≥44px. `pb-28` para clearear BottomNav.
```

- [ ] **Step 2: Reemplazar la sección `## Prototipos de referencia`**

```markdown
## Diseño de referencia
Los mocks finales (identidad 2026-08-13, snapshot 2026-08-14) viven en `../claude-design/` — carpeta hermana del repo, fuera de git: `{Pantalla}-render.html` + variantes `{Pantalla}Noche-render.html`. Abrirlos en el navegador a 390px. El spec de layouts: `docs/superpowers/specs/2026-08-18-layouts-pantallas-design.md`.
⚠️ `design_handoff_chanchito/` es el handoff viejo (pre-identidad, tipografías Alfa Slab/DM Sans): NO usarlo como referencia visual. Igual que el proyecto "Design System" de claude.ai, que quedó en la fase descartada.
```

- [ ] **Step 3: Verificar que los tokens citados existen**

Run: `grep -c "shadow-bandera\|logo-slot\|estraza-800\|font-display" src/app/globals.css`
Expected: > 0 (todos los nombres citados aparecen en globals.css).

- [ ] **Step 4: Nota de cierre en `design-system-plan.md`**

Insertar inmediatamente después de la línea 1 (`# Plan de Design System atómico — Chanchito`):

```markdown
> ✅ **CERRADO 2026-08-18.** El sistema descrito acá se completó y fue reemplazado por la identidad definitiva del 13-ago (Fugaz One/Asap/Bitter, chancho, sello S·C Fiscal, tema Noche estraza), implementada en producción el 18-ago. Este documento queda como registro histórico; la fuente de verdad es `src/app/globals.css` + `docs/superpowers/specs/2026-08-14-design-system-identidad-v2-design.md`. La etapa 2 (layouts) vive en `docs/superpowers/specs/2026-08-18-layouts-pantallas-design.md`.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md design-system-plan.md
git commit -m "docs: seccion UI al sistema vigente + cierre del design-system-plan"
```

---

### Task 5: ScreenHeader variante `compact`

**Files:**
- Modify: `src/components/shared/screen-header.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: prop `compact?: boolean` — título `font-display` 22px, sin kicker ni sub, padding `pt-[18px] pb-3`, `right` centrado verticalmente. Task 8 lo usa; el plan siguiente (3 pantallas) también.

- [ ] **Step 1: Implementar**

Reemplazar el componente completo por:

```tsx
import { cn } from "@/lib/utils";
import type React from "react";

export function ScreenHeader({
  kicker,
  title,
  sub,
  icon,
  right,
  compact,
  className,
}: {
  kicker?: string;
  title: string;
  sub?: string;
  /** Marca a la izquierda del título. Se usa en Inicio, con el chancho. */
  icon?: React.ReactNode;
  right?: React.ReactNode;
  /** Header del sistema de layouts (mocks 2026-08-14): título 22px, sin kicker ni sub. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(compact ? "px-5 pt-[18px] pb-3" : "px-5 pt-3 pb-4", className)}>
      <div className={cn("flex justify-between gap-3", compact ? "items-center" : "items-start")}>
        {icon && <div className={cn("shrink-0", !compact && "pt-0.5")}>{icon}</div>}
        <div className="min-w-0 flex-1">
          {!compact && kicker && (
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.22em] text-accent-deep mb-1">
              {kicker}
            </p>
          )}
          <h1 className={cn("font-display text-text leading-none", compact ? "text-[22px]" : "text-[28px]")}>
            {title}
          </h1>
          {!compact && sub && (
            <p className="font-sans text-[12.5px] text-muted mt-1.5">{sub}</p>
          )}
        </div>
        {right && (
          <div className={cn("shrink-0 flex items-center gap-2", !compact && "mt-1")}>{right}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: limpio (la prop es opcional: los consumidores actuales no cambian).

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/screen-header.tsx
git commit -m "feat(ui): variante compact de ScreenHeader para los layouts nuevos"
```

---

### Task 6: Helpers de copy de Objetivos (TDD)

**Files:**
- Create: `src/lib/utils/objetivos-copy.ts`
- Test: `src/lib/utils/__tests__/objetivos-copy.test.ts`

**Interfaces:**
- Consumes: `formatCurrency` de `@/lib/utils` (devuelve `$ 1.240.000,00` estilo es-AR) · `parseLocalDate` de `@/lib/utils/dates`.
- Produces (Tasks 7 y 8 los consumen):
  - `goalSubtitle(goal: { currency: 'ARS' | 'USD'; type: 'one_time' | 'monthly'; target_date: string | null; created_at: string }, now?: Date): string`
  - `budgetStatusLine(i: { percent: number; spent: number; limit: number; currency: 'ARS' | 'USD'; status: 'ok' | 'warning' | 'exceeded'; daysLeft: number }): { text: string; tone: 'muted' | 'warn' | 'bad' }`
  - `daysLeftInMonth(now?: Date): number` (incluye el día de hoy)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/utils/__tests__/objetivos-copy.test.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency } from '@/lib/utils';
import { goalSubtitle, budgetStatusLine, daysLeftInMonth } from '../objetivos-copy';

const NOW = new Date(2026, 7, 18); // 18-ago-2026

describe('goalSubtitle', () => {
  it('meta única en USD con fecha objetivo: "en verdes · meta para enero 2027"', () => {
    expect(goalSubtitle({ currency: 'USD', type: 'one_time', target_date: '2027-01-15', created_at: '2026-03-02T10:00:00Z' }, NOW))
      .toBe('en verdes · meta para enero 2027');
  });

  it('meta única en ARS sin fecha: "empezó en marzo" (mismo año, sin año)', () => {
    expect(goalSubtitle({ currency: 'ARS', type: 'one_time', target_date: null, created_at: '2026-03-02T10:00:00Z' }, NOW))
      .toBe('empezó en marzo');
  });

  it('meta única en USD sin fecha de otro año: "en verdes · empezó en marzo 2025"', () => {
    expect(goalSubtitle({ currency: 'USD', type: 'one_time', target_date: null, created_at: '2025-03-02T10:00:00Z' }, NOW))
      .toBe('en verdes · empezó en marzo 2025');
  });

  it('meta mensual: "se renueva cada mes"', () => {
    expect(goalSubtitle({ currency: 'ARS', type: 'monthly', target_date: null, created_at: '2026-08-01T10:00:00Z' }, NOW))
      .toBe('se renueva cada mes');
  });
});

describe('budgetStatusLine', () => {
  it('superado: "Te pasaste $X · frená un toque" en bad', () => {
    const r = budgetStatusLine({ percent: 108, spent: 86300, limit: 80000, currency: 'ARS', status: 'exceeded', daysLeft: 17 });
    expect(r.text).toBe(`Te pasaste ${formatCurrency(6300)} · frená un toque`);
    expect(r.tone).toBe('bad');
  });

  it('uso alto (≥70%): "74% usado · quedan $X para 17 días"', () => {
    const r = budgetStatusLine({ percent: 74.2, spent: 118700, limit: 160000, currency: 'ARS', status: 'ok', daysLeft: 17 });
    expect(r.text).toBe(`74% usado · quedan ${formatCurrency(41300)} para 17 días`);
    expect(r.tone).toBe('muted');
  });

  it('warning pinta warn y singulariza el día', () => {
    const r = budgetStatusLine({ percent: 90, spent: 90000, limit: 100000, currency: 'ARS', status: 'warning', daysLeft: 1 });
    expect(r.text).toBe(`90% usado · quedan ${formatCurrency(10000)} para 1 día`);
    expect(r.tone).toBe('warn');
  });

  it('uso bajo: "56% usado · venís bien"', () => {
    const r = budgetStatusLine({ percent: 56, spent: 22400, limit: 40000, currency: 'ARS', status: 'ok', daysLeft: 17 });
    expect(r.text).toBe('56% usado · venís bien');
    expect(r.tone).toBe('muted');
  });

  it('USD lleva el prefijo en los montos', () => {
    const r = budgetStatusLine({ percent: 110, spent: 110, limit: 100, currency: 'USD', status: 'exceeded', daysLeft: 5 });
    expect(r.text).toBe(`Te pasaste USD ${formatCurrency(10)} · frená un toque`);
  });
});

describe('daysLeftInMonth', () => {
  it('cuenta los días restantes incluyendo hoy', () => {
    expect(daysLeftInMonth(new Date(2026, 7, 18))).toBe(14); // ago tiene 31: 31-18+1
    expect(daysLeftInMonth(new Date(2026, 7, 31))).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/utils/__tests__/objetivos-copy.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implement**

```ts
// src/lib/utils/objetivos-copy.ts
// Copy rioplatense de la pantalla Objetivos (mock 2026-08-14). Funciones puras.
import { formatCurrency } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';

const mesDe = (d: Date) => new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(d);

export function goalSubtitle(
  goal: { currency: 'ARS' | 'USD'; type: 'one_time' | 'monthly'; target_date: string | null; created_at: string },
  now: Date = new Date(),
): string {
  const parts: string[] = [];
  if (goal.currency === 'USD') parts.push('en verdes');
  if (goal.type === 'monthly') {
    parts.push('se renueva cada mes');
  } else if (goal.target_date) {
    const d = parseLocalDate(goal.target_date);
    parts.push(`meta para ${mesDe(d)} ${d.getFullYear()}`);
  } else {
    const d = new Date(goal.created_at);
    const año = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
    parts.push(`empezó en ${mesDe(d)}${año}`);
  }
  return parts.join(' · ');
}

export function budgetStatusLine(i: {
  percent: number;
  spent: number;
  limit: number;
  currency: 'ARS' | 'USD';
  status: 'ok' | 'warning' | 'exceeded';
  daysLeft: number;
}): { text: string; tone: 'muted' | 'warn' | 'bad' } {
  const fmt = (n: number) => `${i.currency === 'USD' ? 'USD ' : ''}${formatCurrency(n)}`;
  if (i.status === 'exceeded') {
    return { text: `Te pasaste ${fmt(i.spent - i.limit)} · frená un toque`, tone: 'bad' };
  }
  const pct = Math.round(i.percent);
  if (pct >= 70) {
    const dias = `${i.daysLeft} día${i.daysLeft === 1 ? '' : 's'}`;
    return {
      text: `${pct}% usado · quedan ${fmt(Math.max(i.limit - i.spent, 0))} para ${dias}`,
      tone: i.status === 'warning' ? 'warn' : 'muted',
    };
  }
  return { text: `${pct}% usado · venís bien`, tone: 'muted' };
}

export function daysLeftInMonth(now: Date = new Date()): number {
  const ultimo = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return ultimo - now.getDate() + 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/utils/__tests__/objetivos-copy.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/objetivos-copy.ts src/lib/utils/__tests__/objetivos-copy.test.ts
git commit -m "feat(objetivos): helpers de copy del mock — subtitulo de meta y estado de presupuesto"
```

---

### Task 7: SavingsGoalCard al layout del mock

**Files:**
- Modify: `src/components/goals/savings-goal-card.tsx` (completo)

**Interfaces:**
- Consumes: `goalSubtitle` de `@/lib/utils/objetivos-copy` · `Chancho` de `@/components/brand/chancho` (props `className`, `slot`) · `ProgressBar` (`value`, `tone`, `height`) · diálogos existentes `AddContributionDialog`, `EditSavingsGoalDialog` · `getSavingsGoalProgress` del store (devuelve `{ percent, totalContributed, currentMonthContributed, remaining, daysLeft, status }`).
- Produces: card según mock — slot 38px con el chancho, nombre + subtítulo, % display a la derecha, barra 8px, pie "X de Y · faltan Z". Conserva: aportes, editar, borrar, historial, confetti.

- [ ] **Step 1: Reescribir el componente**

Mantener imports, estado, `useConfetti`/`useEffect` de celebración, `goalContributions` y `handleDelete` EXACTAMENTE como están hoy (líneas 21–64). Reemplazar solo el JSX del `return` por:

```tsx
  return (
    <div className="rounded-[18px] border-[1.5px] border-border bg-surface shadow-card p-3.5 grid gap-2.5">
      {/* Fila principal: slot + nombre/sub + % */}
      <div className="flex items-center gap-2.5">
        <span className="w-[38px] h-[38px] flex-none grid place-items-center bg-surface-2 border-[1.5px] border-border rounded-xl text-accent-deep">
          <Chancho className="w-[21px]" slot="var(--surface-2)" />
        </span>
        <div className="min-w-0 grid gap-px">
          <span className="font-sans font-bold text-[13.5px] text-text truncate">{goal.name}</span>
          <span className="text-[11.5px] text-muted truncate">{goalSubtitle(goal)}</span>
        </div>
        <span className={`ml-auto font-display tnum text-[15px] ${status === 'completed' ? 'text-good' : 'text-accent-deep'}`}>
          {Math.round(percent)}%
        </span>
      </div>

      {/* Barra */}
      <ProgressBar value={percent} tone={status === 'completed' ? 'good' : 'accent'} height={8} />

      {/* Pie de montos */}
      <div className="flex justify-between text-[12px] text-muted tnum">
        <span>
          <b className="text-text">{goal.currency === 'USD' ? 'USD ' : ''}{formatCurrency(effectiveContributed)}</b>
          {' '}de {goal.currency === 'USD' ? 'USD ' : ''}{formatCurrency(goal.target_amount)}
        </span>
        {status === 'completed' ? (
          <span className="text-good font-bold">¡Lograda!{showCelebration ? ' 🎉' : ''}</span>
        ) : (
          <span>faltan {goal.currency === 'USD' ? 'USD ' : ''}{formatCurrency(remaining)}</span>
        )}
      </div>

      {/* Acciones — el mock no las dibuja; se conservan compactas */}
      <div className="flex items-center justify-between border-t border-border pt-2.5">
        <AddContributionDialog goal={goal} />
        <div className="flex items-center gap-0.5">
          {goalContributions.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-[11px] text-muted hover:text-text flex items-center gap-1 transition-colors px-2 py-1.5"
            >
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {goalContributions.length} aportes
            </button>
          )}
          <EditSavingsGoalDialog goal={goal} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Eliminar meta"
            className="h-9 w-9 text-muted hover:text-bad hover:bg-bad/10"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Historial de aportes (se conserva) */}
      {showHistory && goalContributions.length > 0 && (
        <div className="border-t border-border pt-2.5 space-y-2">
          {goalContributions.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs">
              <div>
                <span className="text-muted">{c.date}</span>
                {c.note && <span className="text-faint ml-2 italic">{c.note}</span>}
              </div>
              <span className="text-good font-display tnum">
                +{c.currency === 'USD' ? 'USD ' : ''}{formatCurrency(c.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
```

Ajustar imports: sumar `Chancho` y `goalSubtitle`; quitar los que quedaron sin uso (`motion`, `Calendar`, `RefreshCw`, `CheckCircle2` si ya no se usan — verificar con lint). Las variables `daysLeft` y `currentMonthContributed` del progress siguen usadas vía `effectiveContributed`; si `daysLeft` queda sin uso, quitarla del destructuring.

- [ ] **Step 2: Verificar**

Run: `npm run lint && npx tsc --noEmit`
Expected: tsc limpio; lint sin errores NUEVOS sobre los 24 del baseline (imports sin uso serían nuevos — limpiarlos).

- [ ] **Step 3: Commit**

```bash
git add src/components/goals/savings-goal-card.tsx
git commit -m "feat(objetivos): SavingsGoalCard al layout del mock, con el chancho en el slot"
```

---

### Task 8: CategoryBudgetCard al layout del mock

**Files:**
- Modify: `src/components/goals/category-budget-card.tsx` (completo)

**Interfaces:**
- Consumes: `budgetStatusLine` y `daysLeftInMonth` de `@/lib/utils/objetivos-copy` · `getCategoryBudgetStatus` (devuelve `{ categoryName, categoryEmoji, spent, limit, percent, status }`) · `getBudgetProjection` · `EditBudgetDialog`.
- Produces: card compacta según mock — emoji + nombre + "gastado / límite", barra 7px, línea de estado con el copy del helper. Conserva: proyección (marcador punteado), editar, borrar, confetti de fin de mes.

- [ ] **Step 1: Reescribir el JSX del return**

Mantener imports, estado, effects y `handleDelete` como están (líneas 21–79). Reemplazar el JSX por:

```tsx
  const linea = budgetStatusLine({
    percent,
    spent,
    limit,
    currency: budget.currency,
    status,
    daysLeft: daysLeftInMonth(),
  })
  const lineaClase =
    linea.tone === 'bad' ? 'text-bad font-bold' : linea.tone === 'warn' ? 'text-warn font-bold' : 'text-muted'

  return (
    <div className="rounded-2xl border-[1.5px] border-border bg-surface p-3 px-3.5 grid gap-2">
      {/* Fila principal: emoji + nombre + montos + acciones */}
      <div className="flex items-center gap-2">
        {categoryEmoji && <span className="text-[15px]">{categoryEmoji}</span>}
        <span className="font-sans font-bold text-[13px] text-text truncate">{categoryName}</span>
        {showEndOfMonthBadge && (
          <span className="text-[10px] font-bold text-good" aria-label="Dentro del presupuesto">✓</span>
        )}
        <span className="ml-auto text-[12px] text-muted tnum whitespace-nowrap">
          <b className={status === 'exceeded' ? 'text-bad' : 'text-text'}>
            {budget.currency === 'USD' ? 'USD ' : ''}{formatCurrency(spent)}
          </b>
          {' '}/ {budget.currency === 'USD' ? 'USD ' : ''}{formatCurrency(limit)}
        </span>
        <div className="flex items-center shrink-0 -mr-1">
          <EditBudgetDialog budget={budget} categoryName={categoryName} categoryEmoji={categoryEmoji} />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Eliminar presupuesto de ${categoryName}`}
            className="h-9 w-9 text-muted hover:text-bad hover:bg-bad/10"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Barra + marcador de proyección (se conserva) */}
      <div>
        <ProgressBar
          value={Math.min(percent, 100)}
          tone={status === 'exceeded' ? 'bad' : status === 'warning' ? 'warn' : 'good'}
          height={7}
        />
        {projection && (
          <div
            className="relative h-0 pointer-events-none"
            style={{
              marginTop: -11,
              marginLeft: `${Math.min(projection.limit > 0 ? (projection.projected / projection.limit) * 100 : 0, 100)}%`,
              borderLeft: `2px dashed ${projection.isOverBudget ? 'var(--bad)' : 'var(--good)'}`,
              height: 7,
            }}
          />
        )}
      </div>

      {/* Línea de estado — copy del mock */}
      <span className={`text-[11px] ${lineaClase}`}>{linea.text}</span>
    </div>
  )
```

Ajustar imports: sumar `budgetStatusLine`, `daysLeftInMonth`; quitar los sin uso (`motion`, `AlertTriangle`, `CheckCircle2`, `XCircle` si quedan huérfanos).

- [ ] **Step 2: Verificar**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`
Expected: sin errores nuevos; suite verde.

- [ ] **Step 3: Commit**

```bash
git add src/components/goals/category-budget-card.tsx
git commit -m "feat(objetivos): CategoryBudgetCard compacta con el copy de estado del mock"
```

---

### Task 9: ObjetivosClient sin hero ni tabs — secciones apiladas

**Files:**
- Modify: `src/app/objetivos/objetivos-client.tsx` (completo)
- Modify: `src/app/objetivos/page.tsx` (simplificar: muere `initialTab`)

**Interfaces:**
- Consumes: `ScreenHeader` con `compact` (Task 5) · cards de Tasks 7–8 · diálogos y empty states existentes.
- Produces: la pantalla del mock — header compacto con `+`, sección "Metas de ahorro" y sección "Presupuestos mensuales" apiladas.

- [ ] **Step 1: Simplificar `page.tsx`**

```tsx
import { ObjetivosClient } from './objetivos-client';

export default function ObjetivosPage() {
  return <ObjetivosClient />;
}
```

(Nadie linkea `/objetivos?tab=` — verificado con grep en `src/`.)

- [ ] **Step 2: Reescribir `objetivos-client.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useFinanceStore } from '@/lib/store/financeStore';
import { SavingsGoalCard } from '@/components/goals/savings-goal-card';
import { CategoryBudgetCard } from '@/components/goals/category-budget-card';
import { CreateSavingsGoalDialog } from '@/components/goals/create-savings-goal-dialog';
import { CreateBudgetDialog } from '@/components/goals/create-budget-dialog';
import { StaggeredList, StaggeredItem } from '@/components/shared/staggered-list';
import { AnimatedPlusButton } from '@/components/shared/animated-plus-button';
import { ScreenHeader } from '@/components/shared/screen-header';
import { Wallet, PiggyBank, Plus } from 'lucide-react';

export function ObjetivosClient() {
  const [isCreateMetaOpen, setIsCreateMetaOpen] = useState(false);
  const [isCreateBudgetOpen, setIsCreateBudgetOpen] = useState(false);

  const {
    isInitialized,
    fetchAllData,
    savingsGoals,
    categoryBudgets,
    categories,
  } = useFinanceStore();

  useEffect(() => {
    if (!isInitialized) fetchAllData();
  }, [isInitialized, fetchAllData]);

  const activeGoals = savingsGoals.filter(g => g.is_active);
  const completedGoals = savingsGoals.filter(g => !g.is_active);
  const activeBudgets = categoryBudgets.filter(b => b.is_active);

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-28 md:pb-8">
      <ScreenHeader
        compact
        title="Objetivos"
        right={
          <AnimatedPlusButton
            label="Crear nueva meta"
            onClick={() => setIsCreateMetaOpen(true)}
            ariaLabel="Nueva meta de ahorro"
          />
        }
      />

      <main className="mx-auto max-w-[1440px] px-5 pb-4">

        {/* ── Metas de ahorro ── */}
        {/* data-tour="tabs-list": ancla del tour de onboarding (onboardingStore.ts:42) — las tabs
            murieron pero el paso del tour ahora señala esta sección; NO renombrar. */}
        <div className="flex items-baseline justify-between" data-tour="tabs-list">
          <h2 className="font-display text-text text-[18px]">Metas de ahorro</h2>
          <span className="text-[12px] text-muted">Ponele un objetivo a tu ahorro</span>
        </div>

        {activeGoals.length === 0 ? (
          <div className="mt-3 rounded-2xl border-[1.5px] border-dashed border-border bg-surface py-16 text-center flex flex-col items-center">
            <PiggyBank className="h-14 w-14 text-faint mx-auto mb-4" />
            <h3 className="font-sans font-bold text-text text-lg mb-2">Ponele un objetivo a tu ahorro</h3>
            <p className="text-muted text-sm max-w-xs mx-auto mb-6">
              Definí metas concretas — un viaje, un fondo de emergencia, lo que sea — y seguí tu progreso mes a mes.
            </p>
            <AnimatedPlusButton
              label="Crear meta"
              onClick={() => setIsCreateMetaOpen(true)}
              ariaLabel="Nueva meta de ahorro"
            />
          </div>
        ) : (
          <StaggeredList className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeGoals.map(goal => (
              <StaggeredItem key={goal.id}>
                <SavingsGoalCard goal={goal} />
              </StaggeredItem>
            ))}
          </StaggeredList>
        )}

        {completedGoals.length > 0 && (
          <details className="group mt-3">
            <summary className="cursor-pointer text-xs text-muted hover:text-text transition-colors select-none">
              {completedGoals.length} meta{completedGoals.length > 1 ? 's' : ''} inactiva{completedGoals.length > 1 ? 's' : ''} →
            </summary>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 opacity-60">
              {completedGoals.map(goal => <SavingsGoalCard key={goal.id} goal={goal} />)}
            </div>
          </details>
        )}

        {/* ── Presupuestos mensuales ── */}
        <div className="flex items-baseline justify-between mt-6">
          <h2 className="font-display text-text text-[18px]">Presupuestos mensuales</h2>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted">Controlá en qué gastás</span>
            {activeBudgets.length > 0 && (
              <button
                type="button"
                onClick={() => setIsCreateBudgetOpen(true)}
                aria-label="Nuevo presupuesto"
                className="grid place-items-center w-7 h-7 rounded-full bg-surface border-[1.5px] border-border text-text hover:bg-surface-2 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.6} />
              </button>
            )}
          </div>
        </div>

        {activeBudgets.length === 0 ? (
          <div className="mt-3 rounded-2xl border-[1.5px] border-dashed border-border bg-surface py-16 text-center flex flex-col items-center">
            <Wallet className="h-14 w-14 text-faint mx-auto mb-4" />
            <h3 className="font-sans font-bold text-text text-lg mb-2">Controlá en qué gastás tu plata</h3>
            <p className="text-muted text-sm max-w-xs mx-auto mb-6">
              Establecé límites de gasto mensual por categoría y recibí alertas antes de pasarte del presupuesto.
            </p>
            <AnimatedPlusButton
              label="Crear presupuesto"
              onClick={() => setIsCreateBudgetOpen(true)}
              ariaLabel="Nuevo presupuesto"
            />
          </div>
        ) : (
          <StaggeredList className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {activeBudgets.map(budget => (
              <StaggeredItem key={budget.id}>
                <CategoryBudgetCard budget={budget} />
              </StaggeredItem>
            ))}
          </StaggeredList>
        )}

      </main>

      <CreateSavingsGoalDialog
        open={isCreateMetaOpen}
        onOpenChange={setIsCreateMetaOpen}
      />
      <CreateBudgetDialog
        categories={categories.filter((c) => c.type === 'expense')}
        open={isCreateBudgetOpen}
        onOpenChange={setIsCreateBudgetOpen}
      />
    </div>
  );
}
```

Notas: mueren `TabsDS` y el hero (`totalMetasARS`, `getSavingsGoalProgress`, `getAllBudgetStatuses`, `fmtCurrency`, contadores `exceededCount`/`warningCount`). El atributo `data-tour="tabs-list"` se **conserva** sobre el header de la sección Metas: el tour de onboarding lo referencia (`onboardingStore.ts:42`, paso "Establece tus metas de ahorro…") y el test `onboarding-tour-targets.test.ts` valida que los targets existan.

- [ ] **Step 3: Verificar**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Expected: sin errores nuevos, suite verde, build OK.

- [ ] **Step 4: Commit**

```bash
git add src/app/objetivos/objetivos-client.tsx src/app/objetivos/page.tsx
git commit -m "feat(objetivos): layout del mock — secciones apiladas, sin hero ni tabs"
```

---

### Task 10: Verificación del slice + gate visual + merge

**Files:**
- Ninguno (verificación y git).

- [ ] **Step 1: Verificación completa**

Run: `npm run lint ; npx tsc --noEmit ; npx vitest run ; npm run build`
Expected: lint = 24 errores preexistentes exactos · tsc limpio · suite completa verde (369+: 359 + los nuevos) · build OK.

- [ ] **Step 2: Push de la rama**

```bash
git push -u origin layout/nav-y-objetivos
```

- [ ] **Step 3: GATE — revisión visual de Lauti (bloqueante)**

Levantar `npm run dev` y que Lauti compare a 390px, con el mock al lado (`../claude-design/Objetivos-render.html` y `ObjetivosNoche-render.html` en el navegador):
- `/objetivos` día y noche (toggle en `/ajustes`).
- La nav: 5 destinos, "Más" abre el sheet, "Más" activo en `/inversiones`, `/medios-pago` y `/ajustes`.
- NO ejecutar escrituras (crear/borrar) durante la revisión — es la base de producción.

Si pide ajustes: iterarlos en esta rama y repetir el gate. **No seguir al Step 4 sin su OK explícito.**

- [ ] **Step 4: Merge y deploy**

```bash
git checkout master && git pull --ff-only && git merge --ff-only layout/nav-y-objetivos && git push
git branch -d layout/nav-y-objetivos && git push origin --delete layout/nav-y-objetivos
```
Expected: ff limpio; Vercel despliega `master` automáticamente. Verificar que el deploy quede READY.
