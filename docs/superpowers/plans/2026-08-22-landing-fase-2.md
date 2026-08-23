# Landing de michanchito.net — Plan de implementación (Fase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `michanchito.net` recibe al que llega sin sesión con una landing de producto (estructura B: teléfono protagonista) y sigue sirviendo el dashboard al que ya entró.

**Architecture:** `/` pasa a Server Component que decide por sesión (landing vs dashboard actual movido a `dashboard-client.tsx`); el middleware deja pasar `/` anónimo. La landing vive en `src/components/landing/` — un componente por sección, client solo donde hay Framer Motion o `useInstallApp`. Las capturas de la Fase 1 (`public/landing/captura-*.png`) son los insumos.

**Tech Stack:** Next.js App Router · Framer Motion (ya en el repo) · `useInstallApp`/`PasosIOS`/`Modal` (feature de instalación del 2026-08-22) · tokens del design system (`globals.css`).

**Spec:** `docs/superpowers/specs/2026-08-22-landing-michanchito-design.md`

## Global Constraints

- **Solo tokens semánticos** (`bg-bg`, `bg-surface`, `text-text/muted/faint`, `border-[1.5px] border-border`, `text-accent-deep`, `bg-accent-soft/30`, `shadow-card`, `font-display/sans/serif`, `.tnum`, `paper-grain`) — nunca hex ni escalas Tailwind (`slate-*`, `emerald-*`…). Regla dura del repo.
- Tokens de movimiento como base: `--duration-fast/base/slow`, `--ease-standard/out/in`.
- **`prefers-reduced-motion` apaga todo el teatro**: JS-driven vía `useReducedMotion()` de framer-motion (contador estático, sin parallax, chat sin typewriter, crossfade instantáneo); CSS vía variante `motion-reduce:`.
- Copy **rioplatense**, voz de la marca (la del login y Objetivos). Voseo, sin "usted", sin anglicismos de marketing.
- `DISPONIBLE_DEMO = 1581702` — el número del contador **debe coincidir con el de `captura-home.png`**; si se regeneran las capturas, se actualiza junto (está comentado en el código y documentado).
- El dashboard no cambia de comportamiento: `dashboard-client.tsx` es un move de `page.tsx`, no una edición.
- Los gates de onboarding y `/puesta-a-punto` del middleware quedan **intactos** para usuarios logueados.
- Verificación final: markup tests (`environment: 'node'`, `renderToStaticMarkup`, como los existentes) + medición en navegador (sin overflow horizontal ni solapes en 390×844 y 375×667, build de producción) + **gate visual de Lauti antes del merge**.
- Suite de referencia: 543 tests en verde y `tsc` limpio al arrancar; lint con baseline conocido de 24 errores / 11 warnings que no es de esta rama.

---

### Task 1: Ruteo — `/` decide por sesión

**Files:**
- Create: `src/app/dashboard-client.tsx` (move del contenido actual de `page.tsx`)
- Create: `src/components/landing/landing.tsx` (shell, crece en tasks siguientes)
- Modify: `src/app/page.tsx` (queda como Server Component chico)
- Modify: `src/utils/supabase/middleware.ts` (raíz pública para anónimos)
- Test: `src/components/landing/__tests__/routing-shape.test.ts`

**Interfaces:**
- Produces: `Landing` (named export de `components/landing/landing.tsx`) — las tasks 2-5 le agregan secciones. `DashboardClient` (default export de `app/dashboard-client.tsx`).

- [ ] **Step 1: Test estructural que falla**

```ts
// src/components/landing/__tests__/routing-shape.test.ts
/**
 * `/` sirve dos mundos: la landing al anónimo y el dashboard al logueado.
 * Estos tests fijan la forma del split — page.tsx tiene que ser Server
 * Component (sin 'use client') y delegar en los dos lados — porque el bug
 * más fácil acá es que alguien vuelva a poner lógica de cliente en page.tsx
 * y rompa la decisión por sesión en el server.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/app/page.tsx', 'utf8')
const dashboard = readFileSync('src/app/dashboard-client.tsx', 'utf8')

describe('el split de /', () => {
  it('page.tsx es Server Component: decide por sesión, no renderiza UI propia', () => {
    expect(page).not.toMatch(/^'use client'/)
    expect(page).toContain("from '@/utils/supabase/server'")
  })
  it('page.tsx conecta los dos mundos', () => {
    expect(page).toContain('DashboardClient')
    expect(page).toContain('Landing')
  })
  it('el dashboard se movió entero, no se reescribió: sigue siendo client', () => {
    expect(dashboard).toMatch(/^'use client'/)
    expect(dashboard).toContain('useFinanceStore')
    expect(dashboard).toContain('PullToRefresh')
  })
})
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `npx vitest run src/components/landing/__tests__/routing-shape.test.ts`
Esperado: FAIL (no existe `dashboard-client.tsx`).

- [ ] **Step 3: Mover el dashboard**

`git mv src/app/page.tsx src/app/dashboard-client.tsx` y en ese archivo renombrar SOLO el export: `export default function Home()` → `export default function DashboardClient()`. Ningún otro cambio.

- [ ] **Step 4: Shell de la landing**

```tsx
// src/components/landing/landing.tsx
/**
 * La landing de michanchito.net — lo que ve quien llega sin sesión.
 * Estructura B del spec: teléfono protagonista. Cada sección es un
 * componente propio; este archivo solo las ordena.
 */
export function Landing() {
  return (
    <main className="paper-grain min-h-screen overflow-x-clip bg-bg text-text">
      {/* Las secciones se suman acá a medida que existen (tasks 2-5). */}
    </main>
  )
}
```

- [ ] **Step 5: El nuevo `page.tsx`**

```tsx
// src/app/page.tsx
import { createClient } from '@/utils/supabase/server'
import DashboardClient from './dashboard-client'
import { Landing } from '@/components/landing/landing'

// La raíz sirve dos mundos: la landing al que llega sin sesión, el dashboard
// al que ya entró. La decisión es del server — el middleware deja pasar `/`
// anónimo justamente para que esta página pueda elegir.
export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) return <DashboardClient />
  return <Landing />
}
```

- [ ] **Step 6: Middleware — la raíz es pública para anónimos**

En `src/utils/supabase/middleware.ts`, el bloque `if (!user)` pasa de redirigir siempre a:

```ts
  // 3. Protección de rutas: sin usuario, al login — salvo la raíz, que desde
  // 2026-08-22 sirve la landing pública y decide en el server qué renderizar.
  if (!user) {
    if (pathname === '/') {
      return supabaseResponse
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
```

(Los gates de onboarding/puesta-a-punto para usuarios logueados no se tocan.)

- [ ] **Step 7: Verde + suite entera**

Run: `npx vitest run` → 543 + 3 nuevos en verde. `npx tsc --noEmit` limpio.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx src/app/dashboard-client.tsx src/components/landing/ src/utils/supabase/middleware.ts
git commit -m "feat(landing): / decide por sesion — landing al anonimo, dashboard intacto al logueado"
```

---

### Task 2: Marco de teléfono + Hero

**Files:**
- Create: `src/components/landing/phone-frame.tsx`
- Create: `src/components/landing/constantes.ts`
- Create: `src/components/landing/cta-instalar.tsx`
- Create: `src/components/landing/hero.tsx`
- Modify: `src/components/landing/landing.tsx` (monta `<Hero />`)
- Test: `src/components/landing/__tests__/hero.test.tsx`

**Interfaces:**
- Consumes: `useInstallApp` (`@/hooks/useInstallApp`, devuelve `{ vista: 'oculto'|'boton'|'ios', instalar: () => Promise<void> }`), `PasosIOS` (`@/components/shared/install-app-view`), `Modal` (`@/components/shared/modal`, props `isOpen/onClose/title/children`).
- Produces: `PhoneFrame` (`{ captura: string; alt: string; className?: string; priority?: boolean; children?: ReactNode }`) y `CtaInstalar` (`{ grande?: boolean }`) — los reusan las tasks 3 y 5. `DISPONIBLE_DEMO` en `constantes.ts`.

- [ ] **Step 1: Tests que fallan**

```tsx
// src/components/landing/__tests__/hero.test.tsx
/**
 * El hero es la promesa de la página: el claim, los dos caminos (instalar /
 * navegador) y el teléfono con el número. Sin DOM no se prueba la animación
 * (eso es navegador), pero sí lo que decide el markup.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Hero } from '../hero'
import { PhoneFrame } from '../phone-frame'
import { DISPONIBLE_DEMO } from '../constantes'

const html = () => renderToStaticMarkup(<Hero />)

describe('Hero', () => {
  it('abre con el claim en la voz de la marca', () => {
    expect(html()).toContain('Tus gastos, en orden')
  })
  it('ofrece los dos caminos: entrar por el navegador siempre; instalar según el navegador', () => {
    const out = html()
    expect(out).toContain('href="/login"')
    expect(out).toContain('Usar en el navegador')
    // El botón de instalar arranca oculto en SSR (useInstallApp decide en cliente).
  })
  it('el teléfono muestra la captura del home del demo', () => {
    expect(html()).toContain('captura-home')
  })
  it('el contador cubre la zona del número con superficie propia', () => {
    // El overlay tapa el número quemado en la captura; si desaparece, se ven dos números.
    expect(html()).toContain('data-overlay-disponible')
  })
  it('el número demo está acoplado a la captura', () => {
    expect(DISPONIBLE_DEMO).toBe(1581702)
  })
})

describe('PhoneFrame', () => {
  it('recorta la captura con el marco y no deja overflow', () => {
    const out = renderToStaticMarkup(
      <PhoneFrame captura="/landing/captura-home.png" alt="El home de Chanchito" />,
    )
    expect(out).toContain('overflow-hidden')
    expect(out).toContain('/landing/captura-home.png')
  })
})
```

- [ ] **Step 2: Correr y ver el fallo** — `npx vitest run src/components/landing/__tests__/hero.test.tsx` → FAIL (módulos inexistentes).

- [ ] **Step 3: Constantes y marco**

```ts
// src/components/landing/constantes.ts
/**
 * El disponible que muestra el contador del hero. DEBE coincidir con el
 * número quemado en `public/landing/captura-home.png`: el overlay lo tapa y
 * lo redibuja animado. Si se regeneran las capturas (`npm run capture:demo`),
 * este valor se actualiza en el mismo commit.
 */
export const DISPONIBLE_DEMO = 1581702
```

```tsx
// src/components/landing/phone-frame.tsx
import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * El marco de teléfono de la landing. Las capturas son 780×1688 (390×844 @2x,
 * Fase 1); el marco las recorta con el radio y el borde del sistema. `children`
 * permite superponer elementos (el contador del hero) sobre la captura.
 */
export function PhoneFrame({
  captura,
  alt,
  className,
  priority = false,
  children,
}: {
  captura: string
  alt: string
  className?: string
  priority?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[2rem] border-[3px] border-text bg-surface shadow-card',
        className,
      )}
    >
      <Image src={captura} alt={alt} width={780} height={1688} priority={priority} className="block h-auto w-full" />
      {children}
    </div>
  )
}
```

- [ ] **Step 4: El CTA de instalación de la landing**

```tsx
// src/components/landing/cta-instalar.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowDownToLine } from 'lucide-react'
import { useInstallApp } from '@/hooks/useInstallApp'
import { PasosIOS } from '@/components/shared/install-app-view'
import { Modal } from '@/components/shared/modal'

/**
 * Los dos caminos de la landing: instalar (cuando el navegador puede — misma
 * lógica que el login y Ajustes, feature del 2026-08-22) o entrar por la web.
 * En SSR el botón de instalar no existe: `useInstallApp` arranca 'oculto' y
 * decide en el cliente.
 */
export function CtaInstalar({ grande = false }: { grande?: boolean }) {
  const { vista, instalar } = useInstallApp()
  const [mostrandoPasos, setMostrandoPasos] = useState(false)

  return (
    <div className={grande ? 'grid justify-items-center gap-3' : 'flex flex-wrap items-center gap-3'}>
      {vista !== 'oculto' && (
        <button
          type="button"
          onClick={() => {
            if (vista === 'ios') setMostrandoPasos(true)
            else void instalar()
          }}
          className={
            grande
              ? 'flex h-[54px] items-center gap-2.5 rounded-xl border-[1.5px] border-text bg-accent px-7 font-sans text-[15px] font-bold text-accent-contrast transition-transform duration-[120ms] hover:-translate-y-0.5 active:translate-y-0'
              : 'flex h-[48px] items-center gap-2 rounded-xl border-[1.5px] border-text bg-accent px-5 font-sans text-[14px] font-bold text-accent-contrast transition-transform duration-[120ms] hover:-translate-y-0.5 active:translate-y-0'
          }
        >
          <ArrowDownToLine className="h-[17px] w-[17px]" />
          Instalar la app
        </button>
      )}
      <Link
        href="/login"
        className={
          grande
            ? 'flex h-[54px] items-center rounded-xl border-[1.5px] border-border bg-surface px-7 font-sans text-[15px] font-bold text-text transition-colors duration-[120ms] hover:bg-surface-2'
            : 'flex h-[48px] items-center rounded-xl border-[1.5px] border-border bg-surface px-5 font-sans text-[14px] font-bold text-text transition-colors duration-[120ms] hover:bg-surface-2'
        }
      >
        Usar en el navegador
      </Link>
      <Modal isOpen={mostrandoPasos} onClose={() => setMostrandoPasos(false)} title="Tenelo a mano">
        <PasosIOS />
      </Modal>
    </div>
  )
}
```

**Nota para el implementer**: si `text-accent-contrast` o `bg-accent` no existen como tokens (verificar en `src/app/globals.css` con grep), usar el par que use el botón primario del login/`Crear transacción` del home — copiar sus clases exactas, jamás inventar un hex.

- [ ] **Step 5: El hero**

```tsx
// src/components/landing/hero.tsx
'use client'

import Image from 'next/image'
import { useEffect } from 'react'
import { motion, animate, useMotionValue, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { formatCurrency } from '@/lib/utils'
import { PhoneFrame } from './phone-frame'
import { CtaInstalar } from './cta-instalar'
import { DISPONIBLE_DEMO } from './constantes'

/**
 * Split hero: claim + caminos a la izquierda, el teléfono a la derecha.
 * El contador redibuja el disponible ANIMADO sobre la zona del número de la
 * captura (un PNG no se anima): el overlay lleva fondo `bg-surface` porque la
 * card del home es superficie, y tapa el número quemado.
 */
export function Hero() {
  const reducido = useReducedMotion()
  const mv = useMotionValue(reducido ? DISPONIBLE_DEMO : 0)
  const { scrollY } = useScroll()
  // Parallax suave: el teléfono se retrasa apenas respecto del scroll.
  const y = useTransform(scrollY, [0, 600], [0, reducido ? 0 : -36])

  useEffect(() => {
    if (reducido) return
    const control = animate(mv, DISPONIBLE_DEMO, { duration: 1.8, delay: 0.5, ease: [0, 0, 0.2, 1] })
    return () => control.stop()
  }, [mv, reducido])

  const texto = useTransform(mv, (v) => formatCurrency(Math.round(v)))

  const entrada = reducido
    ? {}
    : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } }

  return (
    <section className="relative mx-auto grid max-w-[1100px] items-center gap-10 px-6 pb-20 pt-14 md:grid-cols-[1.1fr_0.9fr] md:pt-20">
      <div className="grid justify-items-start gap-5">
        <motion.div {...entrada} transition={{ duration: 0.5, ease: 'easeOut' }}>
          <Image
            src="/brand/cinta-guita-clara.svg"
            alt="Guita clara"
            width={280}
            height={72}
            priority
            className="block w-[240px] max-w-full md:w-[280px]"
          />
        </motion.div>
        <motion.h1
          {...entrada}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
          className="font-display text-[44px] leading-[1.05] md:text-[58px]"
        >
          Tus gastos, en orden.
        </motion.h1>
        <motion.p
          {...entrada}
          transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
          className="max-w-[440px] text-[16px] leading-[1.55] text-muted"
        >
          Gastos, cuotas, suscripciones y verdes del día a día — para saber
          cuánta plata te queda de verdad. Hecha acá, para acá.
        </motion.p>
        <motion.div {...entrada} transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}>
          <CtaInstalar />
        </motion.div>
      </div>

      <motion.div style={{ y }} className="mx-auto w-[240px] sm:w-[270px] md:w-[290px]">
        <PhoneFrame captura="/landing/captura-home.png" alt="El home de Chanchito: tu plata libre para hoy" priority>
          {/* Tapa el número quemado en la captura y lo redibuja animado.
              Posición inicial medida sobre la captura 780×1688; se afina en la
              verificación en navegador (Task 6). */}
          <div
            data-overlay-disponible
            className="absolute left-[7%] right-[8%] top-[14.5%] flex h-[6%] items-center rounded-lg bg-surface"
          >
            <motion.span className="tnum font-display text-[clamp(20px,7.5cqw,30px)] leading-none text-text [container-type:inline-size]">
              {texto}
            </motion.span>
          </div>
        </PhoneFrame>
      </motion.div>
    </section>
  )
}
```

**Nota para el implementer**: el `clamp` con `cqw` requiere que el overlay sea container; si da problemas de tipos o render, reemplazar por `text-[24px] md:text-[28px]` y anotarlo en el reporte — el ajuste fino es de la Task 6 en navegador.

- [ ] **Step 6: Montar en el shell** — en `landing.tsx`, importar y renderizar `<Hero />` dentro de `<main>`.

- [ ] **Step 7: Verde** — `npx vitest run src/components/landing` → todo pasa. Suite entera + `tsc` limpios.

- [ ] **Step 8: Commit**

```bash
git add src/components/landing/
git commit -m "feat(landing): hero con telefono, contador del disponible y los dos caminos"
```

---

### Task 3: Bloques de valor — sticky phone ×3

**Files:**
- Create: `src/components/landing/bloques-valor.tsx`
- Modify: `src/components/landing/landing.tsx` (monta `<BloquesValor />` tras el hero)
- Test: `src/components/landing/__tests__/bloques-valor.test.tsx`
- Test: `src/components/landing/__tests__/capturas.test.ts`

**Interfaces:**
- Consumes: `PhoneFrame` de Task 2.

- [ ] **Step 1: Tests que fallan**

```tsx
// src/components/landing/__tests__/bloques-valor.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BloquesValor } from '../bloques-valor'

const html = () => renderToStaticMarkup(<BloquesValor />)

describe('BloquesValor', () => {
  it('cuenta las tres promesas, en orden', () => {
    const out = html()
    const posiciones = ['Un número que dice la verdad', 'Las cuotas se anotan solas', 'Pesos y verdes, sin mezclar']
      .map((t) => out.indexOf(t))
    expect(posiciones.every((p) => p >= 0)).toBe(true)
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones)
  })
  it('cada bloque tiene su captura', () => {
    const out = html()
    for (const c of ['captura-home', 'captura-compromisos', 'captura-inversiones']) {
      expect(out).toContain(c)
    }
  })
})
```

```ts
// src/components/landing/__tests__/capturas.test.ts
/**
 * La landing referencia capturas por path: si falta el archivo, la sección
 * renderiza un teléfono vacío y ningún test de markup lo ve. Y el peso tiene
 * presupuesto (spec: <150KB) porque estas imágenes cargan en la primera
 * visita de cualquiera que llegue al dominio.
 */
import { describe, it, expect } from 'vitest'
import { statSync } from 'node:fs'

const CAPTURAS = ['captura-home.png', 'captura-compromisos.png', 'captura-inversiones.png']

describe('las capturas de la landing', () => {
  for (const nombre of CAPTURAS) {
    it(`${nombre} existe y pesa menos de 150KB`, () => {
      const peso = statSync(`public/landing/${nombre}`).size
      expect(peso).toBeGreaterThan(0)
      expect(peso).toBeLessThan(150 * 1024)
    })
  }
})
```

- [ ] **Step 2: Ver el fallo** — `npx vitest run src/components/landing/__tests__` → FAIL por módulo inexistente (el de capturas ya pasa: los archivos existen de Fase 1).

- [ ] **Step 3: Implementar**

```tsx
// src/components/landing/bloques-valor.tsx
'use client'

import { useRef, useState, useEffect } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { PhoneFrame } from './phone-frame'

/**
 * El patrón central de la estructura B: en desktop el teléfono queda fijo
 * (sticky) y muta de pantalla según qué bloque de texto está a la vista; en
 * mobile el sticky marea, así que cada bloque apila su propia captura.
 */
const BLOQUES = [
  {
    captura: '/landing/captura-home.png',
    alt: 'El home: tu plata libre para hoy',
    kicker: 'Disponible real',
    titulo: 'Un número que dice la verdad',
    texto:
      'Anclás cada cuenta a lo que tenés hoy y Chanchito descuenta lo que ya tiene dueño: cuotas, suscripciones, el resumen que viene. Lo que queda es tuyo de verdad — no un acumulado que se despega de la realidad al primer olvido.',
  },
  {
    captura: '/landing/captura-compromisos.png',
    alt: 'Compromisos: cuotas y suscripciones',
    kicker: 'Compromisos',
    titulo: 'Las cuotas se anotan solas',
    texto:
      'Cargás la compra una vez y las doce cuotas nacen fechadas al vencimiento de tu tarjeta. Las mensualidades se debitan solas cuando cierra el resumen. Vos mirás; Chanchito se acuerda.',
  },
  {
    captura: '/landing/captura-inversiones.png',
    alt: 'Inversiones en pesos y dólares',
    kicker: 'Inversiones',
    titulo: 'Pesos y verdes, sin mezclar',
    texto:
      'Tu cartera en las dos monedas de acá, con cotizaciones reales. Y cuando una cotización falta, Chanchito muestra un guion — nunca un número inventado.',
  },
]

function Bloque({ indice, onVisible }: { indice: number; onVisible: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { margin: '-45% 0px -45% 0px' })
  const reducido = useReducedMotion()

  useEffect(() => {
    if (visible) onVisible(indice)
  }, [visible, indice, onVisible])

  const b = BLOQUES[indice]
  return (
    <motion.div
      ref={ref}
      initial={reducido ? false : { opacity: 0, y: 24 }}
      whileInView={reducido ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15% 0px' }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className="grid content-center gap-4 py-16 md:min-h-[70vh] md:py-0"
    >
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent-deep">{b.kicker}</p>
      <h2 className="font-display text-[30px] leading-[1.1] md:text-[38px]">{b.titulo}</h2>
      <p className="max-w-[420px] text-[15.5px] leading-[1.6] text-muted">{b.texto}</p>
      {/* En mobile cada bloque muestra su propia pantalla; en desktop la muestra
          la columna sticky. */}
      <PhoneFrame captura={b.captura} alt={b.alt} className="mt-4 w-[230px] md:hidden" />
    </motion.div>
  )
}

export function BloquesValor() {
  const [activo, setActivo] = useState(0)
  const reducido = useReducedMotion()

  return (
    <section className="mx-auto grid max-w-[1100px] gap-10 px-6 py-10 md:grid-cols-[1.1fr_0.9fr]">
      <div>
        {BLOQUES.map((_, i) => (
          <Bloque key={i} indice={i} onVisible={setActivo} />
        ))}
      </div>
      <div className="hidden md:block">
        <div className="sticky top-24 mx-auto w-[270px]">
          <div className="relative">
            {BLOQUES.map((b, i) => (
              <motion.div
                key={b.captura}
                animate={{ opacity: activo === i ? 1 : 0 }}
                transition={{ duration: reducido ? 0 : 0.35, ease: 'easeOut' }}
                className={i === 0 ? 'relative' : 'absolute inset-0'}
              >
                <PhoneFrame captura={b.captura} alt={b.alt} />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Montar** — `<BloquesValor />` en `landing.tsx` después del hero.
- [ ] **Step 5: Verde** — tests de landing + suite entera + `tsc`.
- [ ] **Step 6: Commit** — `git add src/components/landing/ && git commit -m "feat(landing): bloques de valor con sticky phone en desktop y apilado en mobile"`

---

### Task 4: El chat que se escribe solo

**Files:**
- Create: `src/components/landing/chat-teatro.tsx`
- Modify: `src/components/landing/landing.tsx`
- Test: `src/components/landing/__tests__/chat-teatro.test.tsx`

- [ ] **Step 1: Tests que fallan**

```tsx
// src/components/landing/__tests__/chat-teatro.test.tsx
/**
 * El chat de la landing es teatro: un guion fijo, cero API. Estos tests fijan
 * el guion y que el SSR ya traiga la conversación completa (el typewriter es
 * progresivo en cliente, pero sin JS la sección no puede quedar muda).
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChatTeatro } from '../chat-teatro'

const html = () => renderToStaticMarkup(<ChatTeatro />)

describe('ChatTeatro', () => {
  it('el guion está completo en el markup', () => {
    const out = html()
    expect(out).toContain('gasté 8 lucas en el chino')
    expect(out).toContain('Delivery de comida')
  })
  it('se presenta como lo que es: anotalo como lo dirías', () => {
    expect(html()).toContain('Anotalo como lo dirías')
  })
  it('no llama a ninguna API: es un guion', () => {
    const out = html()
    expect(out).not.toContain('/api/')
  })
})
```

- [ ] **Step 2: Ver el fallo.**

- [ ] **Step 3: Implementar**

```tsx
// src/components/landing/chat-teatro.tsx
'use client'

import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'

/**
 * Teatro puro: la conversación es un guion fijo que se anima al entrar en
 * viewport — ninguna llamada al chat real. El guion usa la categoría real de
 * los datos demo («chino» → Delivery de comida) para que lo que promete sea
 * lo que la app hace.
 */
const GUION = [
  { de: 'vos' as const, texto: 'gasté 8 lucas en el chino' },
  { de: 'chanchito' as const, texto: 'Listo: $ 8.000 en Delivery de comida 🍔, con Mercado Pago. ¿Algo más?' },
  { de: 'vos' as const, texto: 'no, gracias chanchito' },
  { de: 'chanchito' as const, texto: 'De nada. El que guarda, tiene 🐷' },
]

export function ChatTeatro() {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { once: true, margin: '-20% 0px' })
  const reducido = useReducedMotion()

  return (
    <section className="mx-auto max-w-[640px] px-6 py-20">
      <p className="text-center text-[12px] font-bold uppercase tracking-[0.14em] text-accent-deep">El chat</p>
      <h2 className="mt-3 text-center font-display text-[30px] leading-[1.1] md:text-[38px]">
        Anotalo como lo dirías
      </h2>
      <p className="mx-auto mt-3 max-w-[420px] text-center text-[15.5px] leading-[1.6] text-muted">
        Escribí — o decilo con la voz — y Chanchito lo categoriza, lo fecha y te
        deja el número al día.
      </p>
      <div ref={ref} className="mt-8 grid gap-3">
        {GUION.map((m, i) => (
          <motion.div
            key={i}
            initial={reducido ? false : { opacity: 0, y: 12 }}
            animate={visible || reducido ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.35, delay: reducido ? 0 : 0.5 + i * 0.9, ease: 'easeOut' }}
            className={
              m.de === 'vos'
                ? 'justify-self-end rounded-2xl rounded-br-md border-[1.5px] border-text bg-accent-soft/40 px-4 py-2.5 text-[14.5px]'
                : 'justify-self-start rounded-2xl rounded-bl-md border-[1.5px] border-border bg-surface px-4 py-2.5 text-[14.5px] shadow-card'
            }
          >
            {m.texto}
          </motion.div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Montar, verde, commit** — `git commit -m "feat(landing): el chat guionado — anotalo como lo dirias"`

---

### Task 5: «Hecha acá» + CTA final + pie

**Files:**
- Create: `src/components/landing/hecha-aca.tsx`
- Create: `src/components/landing/cta-final.tsx`
- Create: `src/components/landing/pie.tsx`
- Modify: `src/components/landing/landing.tsx` (orden final: Hero → BloquesValor → ChatTeatro → HechaAca → CtaFinal → Pie)
- Test: `src/components/landing/__tests__/cierre.test.tsx`

**Interfaces:**
- Consumes: `CtaInstalar` (Task 2, prop `grande`), `Chancho` (`@/components/brand/chancho`, props `className`/`slot`/`title`).

- [ ] **Step 1: Tests que fallan**

```tsx
// src/components/landing/__tests__/cierre.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HechaAca } from '../hecha-aca'
import { CtaFinal } from '../cta-final'
import { Pie } from '../pie'
import { Landing } from '../landing'

describe('HechaAca', () => {
  it('nombra lo argentino concreto, no genérico', () => {
    const out = renderToStaticMarkup(<HechaAca />)
    for (const t of ['cuotas', 'blue', 'fin de mes']) expect(out.toLowerCase()).toContain(t)
  })
})

describe('CtaFinal', () => {
  it('lleva el chancho y la línea de confianza', () => {
    const out = renderToStaticMarkup(<CtaFinal />)
    expect(out).toContain('Tenelo a mano')
    expect(out).toContain('Tus datos quedan tuyos')
    expect(out).toContain('<svg') // el Chancho es SVG inline
  })
})

describe('Pie', () => {
  it('firma y fuentes, discreto', () => {
    const out = renderToStaticMarkup(<Pie />)
    expect(out).toContain('LH Studio')
    expect(out).toContain('github.com')
  })
})

describe('Landing completa', () => {
  it('ordena las seis secciones', () => {
    const out = renderToStaticMarkup(<Landing />)
    const orden = ['Tus gastos, en orden', 'Un número que dice la verdad', 'Anotalo como lo dirías', 'Hecha acá', 'Tenelo a mano', 'LH Studio']
      .map((t) => out.indexOf(t))
    expect(orden.every((p) => p >= 0)).toBe(true)
    expect([...orden].sort((a, b) => a - b)).toEqual(orden)
  })
  it('todo el markup respeta los tokens: ni hex ni escalas Tailwind', () => {
    const out = renderToStaticMarkup(<Landing />)
    const clases = (out.match(/class="[^"]*"/g) ?? []).join(' ')
    expect(clases).not.toMatch(/\b(?:bg|text|border)-(?:slate|gray|zinc|emerald|red|blue|amber|stone)-\d{2,3}\b/)
  })
})
```

- [ ] **Step 2: Ver el fallo.**

- [ ] **Step 3: Implementar las tres secciones**

```tsx
// src/components/landing/hecha-aca.tsx
'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * La sección identidad: por qué una app argentina. Es la única sección sin
 * capturas — acá el ornamento de la marca (sello, sol) trabaja de contenido.
 * Las estampillas entran «pegándose»: caen con una rotación leve, como se
 * pega una estampilla en una libreta.
 */
const ESTAMPILLAS = [
  { titulo: 'Cuotas y ciclos de tarjeta', texto: 'Cierre el 20, vencimiento el 28: la compra post-cierre impacta el mes que viene, como en la vida real.' },
  { titulo: 'El blue, de verdad', texto: 'Cotizaciones reales para tus verdes. Y si la fuente falla, un guion honesto — nunca un número inventado.' },
  { titulo: 'Cobrás a fin de mes', texto: 'Acá el sueldo llega los últimos días hábiles. Chanchito arma el período alrededor de tu ritmo, no de un calendario ajeno.' },
  { titulo: 'Habla como vos', texto: 'Rioplatense hasta en la voz del chat. «Lucas» es plata, «el chino» es el súper.' },
]

export function HechaAca() {
  const reducido = useReducedMotion()
  return (
    <section className="relative mx-auto max-w-[1100px] overflow-hidden px-6 py-20">
      <Image
        src="/brand/sol.svg"
        alt=""
        aria-hidden
        width={120}
        height={120}
        className="pointer-events-none absolute -top-6 right-4 w-[110px] select-none opacity-70 motion-safe:animate-[spin_80s_linear_infinite]"
      />
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent-deep">Hecha acá</p>
      <h2 className="mt-3 max-w-[520px] font-display text-[30px] leading-[1.1] md:text-[38px]">
        Una app de plata que entiende este país
      </h2>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {ESTAMPILLAS.map((e, i) => (
          <motion.div
            key={e.titulo}
            initial={reducido ? false : { opacity: 0, y: 20, rotate: i % 2 ? 1.5 : -1.5 }}
            whileInView={reducido ? undefined : { opacity: 1, y: 0, rotate: i % 2 ? 0.6 : -0.6 }}
            viewport={{ once: true, margin: '-10% 0px' }}
            transition={{ duration: 0.45, delay: (i % 2) * 0.12, ease: 'easeOut' }}
            className="rounded-2xl border-[1.5px] border-dashed border-border bg-surface p-6 shadow-card"
          >
            <h3 className="font-sans text-[16px] font-bold">{e.titulo}</h3>
            <p className="mt-2 text-[14px] leading-[1.55] text-muted">{e.texto}</p>
          </motion.div>
        ))}
      </div>
      <Image
        src="/brand/sello.svg"
        alt=""
        aria-hidden
        width={130}
        height={132}
        className="pointer-events-none mt-8 ml-auto block w-[120px] -rotate-12 select-none"
      />
    </section>
  )
}
```

```tsx
// src/components/landing/cta-final.tsx
'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Chancho } from '@/components/brand/chancho'
import { CtaInstalar } from './cta-instalar'

/** El cierre: el chancho grande, la invitación y la línea de confianza. */
export function CtaFinal() {
  const reducido = useReducedMotion()
  return (
    <section className="mx-auto grid max-w-[640px] justify-items-center gap-5 px-6 py-24 text-center">
      <motion.div
        whileHover={reducido ? undefined : { rotate: [-2, 2, -1, 0], y: -6 }}
        transition={{ duration: 0.5 }}
        className="w-[130px] text-text"
      >
        <Chancho className="w-full" title="El chancho de Chanchito" />
      </motion.div>
      <h2 className="font-display text-[34px] leading-[1.05] md:text-[44px]">Tenelo a mano</h2>
      <p className="max-w-[400px] text-[15.5px] leading-[1.6] text-muted">
        Se instala desde el navegador y se abre como cualquier app — sin tienda,
        sin vueltas.
      </p>
      <CtaInstalar grande />
      <p className="text-[12px] text-faint">
        Tus datos quedan tuyos: entrás con tu cuenta de Google y nadie más los ve.
      </p>
    </section>
  )
}
```

```tsx
// src/components/landing/pie.tsx
/** El pie: firma y fuentes. El link al caso del portfolio se suma cuando exista. */
export function Pie() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-6 py-8 text-[12.5px] text-faint">
        <p>
          Hecho por{' '}
          <a href="https://lhstudio.com.ar" className="font-bold text-muted hover:text-text" rel="noopener">
            LH Studio
          </a>
        </p>
        <a href="https://github.com/papuzinH/finanzas-lh" className="hover:text-text" rel="noopener">
          github.com/papuzinH/finanzas-lh
        </a>
      </div>
    </footer>
  )
}
```

- [ ] **Step 4: Orden final en `landing.tsx`** — Hero → BloquesValor → ChatTeatro → HechaAca → CtaFinal → Pie.
- [ ] **Step 5: Verde** — tests de landing + suite entera + `tsc`.
- [ ] **Step 6: Commit** — `git commit -m "feat(landing): hecha aca, cta final con el chancho y pie"`

---

### Task 6: Metadata + OG + verificación en navegador

**Files:**
- Create: `scripts/generate-og.mjs`
- Create: `public/landing/og.png` (generado)
- Create: `docs/features/landing.md`
- Modify: `src/app/page.tsx` (metadata)
- Modify: `CLAUDE.md` (línea en Comandos)
- Modify: `docs/features/usuario-demo.md` (nota del acople `DISPONIBLE_DEMO`)

- [ ] **Step 1: Metadata de `/`**

En `src/app/page.tsx`:

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Chanchito — Tus gastos, en orden',
  description:
    'Gastos, cuotas, suscripciones y verdes del día a día. Una app de finanzas hecha en Argentina, para saber cuánta plata te queda de verdad.',
  openGraph: {
    title: 'Chanchito — Tus gastos, en orden',
    description: 'La app de plata que entiende este país. El que guarda, tiene.',
    images: [{ url: '/landing/og.png', width: 1200, height: 630 }],
  },
}
```

- [ ] **Step 2: Generador del OG**

```js
// scripts/generate-og.mjs
/**
 * Genera public/landing/og.png (1200×630): papel crema, el chancho y el
 * wordmark. Renderiza scripts/og.html en el Chromium local y lo captura —
 * mismo mecanismo que capture-demo.mjs, sin servidor.
 * Uso: node scripts/generate-og.mjs
 */
import { chromium } from 'playwright-core'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  const dirs = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort()
  if (!dirs.length) { console.error('No hay Chromium: seteá PW_CHROMIUM o npx playwright install chromium'); process.exit(1) }
  return join(base, dirs.at(-1), 'chrome-win64', 'chrome.exe')
}

const browser = await chromium.launch({ executablePath: chromiumPath() })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto('file://' + resolve('scripts/og.html').replace(/\\/g, '/'))
await page.waitForTimeout(400)
await page.screenshot({ path: 'public/landing/og.png' })
await browser.close()
console.log('public/landing/og.png generado')
```

Y `scripts/og.html` (los colores acá son los primitivos de la marca — es un
archivo estático fuera de `src/`, el CSP de tokens no aplica, pero salen de
`globals.css`, no inventados: verificar los valores reales de `--color-cream` /
tinta navy con grep antes de escribir):

```html
<!doctype html>
<meta charset="utf-8">
<style>
  body { margin: 0; width: 1200px; height: 630px; background: #F4EDDC;
         display: grid; place-content: center; justify-items: center; gap: 24px;
         font-family: system-ui; }
  img { width: 260px; }
  h1 { margin: 0; font-size: 84px; color: #1E2A3A; font-family: system-ui; font-weight: 900; }
  p { margin: 0; font-size: 28px; color: #6B6A5C; }
</style>
<img src="../public/brand/chancho-og.png" alt="">
<h1>Chanchito</h1>
<p>Tus gastos, en orden. El que guarda, tiene.</p>
```

**Nota para el implementer**: el chancho para el OG — si no existe un PNG del chancho, generarlo primero desde `design/brand/chancho.svg` con sharp (`sharp('design/brand/chancho.svg').resize(520).png().toFile('scripts/chancho-og.png')` en un one-liner, y referenciarlo relativo). Ajustar el `src` del `<img>` a lo que exista. Verificar el resultado abriendo el PNG. Tipografía del wordmark: si `design/brand/` tiene el wordmark como SVG, usarlo en vez del `<h1>` de system-ui; si no, el `<h1>` alcanza para v1 y se anota en el reporte.

- [ ] **Step 3: Correr y verificar** — `node scripts/generate-og.mjs`, abrir `public/landing/og.png` (Read como imagen): chancho + wordmark centrados sobre crema, sin cortes.

- [ ] **Step 4: Build + medición en navegador (obligatoria)**

```bash
npm run build && npx next start -p 3100
```

Con un script Playwright efímero (mismo patrón `chromiumPath`), medir en `http://localhost:3100/` **anónimo** (sin cookies):
1. En 390×844 y 375×667: `document.documentElement.scrollWidth <= viewport` (sin overflow horizontal) al tope y tras scrollear al fondo.
2. Bounding box del overlay `[data-overlay-disponible]` contenido dentro del bounding box del `PhoneFrame` del hero, y el texto del contador no desborda el overlay. Ajustar los `%` del overlay hasta que tape el número quemado de la captura (comparar screenshot del hero contra `captura-home.png`).
3. Screenshot de página completa en 390 y en 1280 → guardarlos en el scratchpad para el gate visual de Lauti (no commitearlos).
4. Verificar que `/login` y el dashboard logueado siguen intactos: `curl -s localhost:3100/login` devuelve 200 y contiene "Continuar con Google".

- [ ] **Step 5: Docs**

`docs/features/landing.md` (nuevo, mismo formato que los otros docs de feature): propósito (la landing pública de `/`), rutas (page.tsx server + middleware raíz pública), archivos clave (tabla: landing.tsx y las 6 secciones, phone-frame, cta-instalar, constantes), invariantes (tokens only; `DISPONIBLE_DEMO` acoplado a `captura-home.png`; reduced-motion apaga el teatro; las capturas se regeneran con `npm run seed:demo` + `npm run capture:demo` y `DISPONIBLE_DEMO` se actualiza en el mismo commit), tests (los 5 archivos de `__tests__`).

En `docs/features/usuario-demo.md`, agregar a Gotchas: «El hero de la landing redibuja el disponible con `DISPONIBLE_DEMO` (`src/components/landing/constantes.ts`): al regenerar capturas, actualizarlo en el mismo commit.»

En `CLAUDE.md`, sección Comandos: `node scripts/generate-og.mjs  # Regenera la imagen OG de la landing`.

- [ ] **Step 6: Suite entera + tsc + commit**

```bash
npx vitest run && npx tsc --noEmit
git add scripts/generate-og.mjs scripts/og.html public/landing/og.png docs/features/ CLAUDE.md src/app/page.tsx
git commit -m "feat(landing): metadata con OG del chancho y verificacion en navegador"
```

---

## Self-review (hecho al escribir)

- **Cobertura del spec Fase 2**: ruteo por sesión ✔ (T1) · 6 secciones con sus animaciones ✔ (T2-T5) · `useInstallApp` reutilizado con modal iOS y auto-ocultamiento ✔ (T2 `CtaInstalar`) · mobile degrada el sticky ✔ (T3) · chat teatro sin API ✔ (T4) · reduced-motion transversal ✔ (todas) · metadata + OG ✔ (T6) · test de capturas existentes y <150KB ✔ (T3, cierra la nota de scope de la review final de Fase 1) · verificación midiendo en navegador ✔ (T6) · gate visual de Lauti ✔ (post-T6, con los screenshots del paso 4).
- **Placeholders**: los dos puntos donde el repo puede diferir del plan (tokens del botón acento, asset del chancho para OG) llevan instrucción de resolución concreta (grep/generación), no "TBD".
- **Consistencia de tipos**: `PhoneFrame`/`CtaInstalar`/`DISPONIBLE_DEMO` definidos en T2 y consumidos con la misma firma en T3/T5; `useInstallApp`/`PasosIOS`/`Modal` con las firmas reales del código mergeado hoy.
- **Riesgo conocido**: el copy y los valores de posición del overlay son punto de partida — el gate visual de Lauti manda, y T6 los afina midiendo.
