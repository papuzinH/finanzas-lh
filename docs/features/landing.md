# Landing pública (`/`)

## Propósito
La puerta de entrada a Chanchito para quien llega sin sesión: el teléfono como
protagonista (Estructura B), sin datos reales — capturas del usuario demo y un
guion de chat fijo. Vende la app en una sola scrolleada: qué muestra, cómo se
usa hablándole, y por qué está hecha acá.

## Rutas / entry points
- `/` → `src/app/page.tsx` — **Server Component**, async. Decide en el
  servidor: `supabase.auth.getUser()` → con sesión, `<DashboardClient />`; sin
  sesión, `<Landing />`. Lleva el `metadata` de la ruta (título, OG).
- El middleware raíz (`src/middleware.ts` → `updateSession`) deja pasar `/`
  anónimo a propósito, para que esta decisión sea de `page.tsx` y no un
  redirect.

## Archivos clave
| Archivo | Rol |
|---|---|
| `src/components/landing/landing.tsx` | Compone las 6 secciones en orden; no tiene lógica propia |
| `src/components/landing/hero.tsx` | Claim + los dos caminos + teléfono con contador animado. El overlay `[data-overlay-disponible]` tapa el número quemado de `captura-home.png` y lo redibuja con `framer-motion` (`useMotionValue` + `animate`, 1.8s) |
| `src/components/landing/phone-frame.tsx` | `PhoneFrame`: marco reusable (radio + borde) sobre una captura 780×1688; `children` permite superponer overlays |
| `src/components/landing/bloques-valor.tsx` | 3 bloques de valor. Desktop: teléfono sticky que muta de captura según el bloque en viewport (`useInView`); mobile: cada bloque apila la suya (el sticky marea) |
| `src/components/landing/chat-teatro.tsx` | Guion de chat fijo animado al entrar en viewport — **sin llamar al chat real**; usa la categoría real de los datos demo para no prometer de más |
| `src/components/landing/hecha-aca.tsx` | Identidad: por qué una app argentina, en 4 "estampillas" que se pegan con rotación leve. Única sección sin capturas |
| `src/components/landing/cta-final.tsx` | Cierre: chancho grande + `CtaInstalar` + la línea de confianza («Tus datos son tuyos: sin publicidad, sin venta, y los borrás cuando quieras» + link a `/privacidad`). La versión anterior decía «nadie más los ve» y no era cierto: Gemini procesa lo que se le escribe al chat |
| `src/components/landing/pie.tsx` | Firma (LH Studio) + links: Privacidad (`/privacidad`) y el repo |
| `src/components/landing/cta-instalar.tsx` | Los dos caminos (instalar / usar en el navegador), reutiliza `useInstallApp` (mismo hook que login/Ajustes) con el modal de pasos iOS |
| `src/components/landing/constantes.ts` | `DISPONIBLE_DEMO` — el número que el overlay redibuja; ver Invariantes |
| `scripts/generate-og.mjs` + `scripts/og.html` | Generan `public/landing/og.png` (1200×630) rasterizando `design/brand/chancho.svg` con `sharp` + Chromium local, sin servidor |

## Tests
`src/components/landing/__tests__/`:
- `routing-shape.test.ts` — el split de `/` (anónimo → Landing, con sesión → dashboard)
- `hero.test.tsx` — Hero y PhoneFrame
- `bloques-valor.test.tsx`
- `chat-teatro.test.tsx`
- `cierre.test.tsx` — HechaAca, CtaFinal, Pie y la Landing completa
- `capturas.test.ts` — las 3 capturas existen y pesan menos de 150 KB

## Invariantes
- **Tokens only**: todo color/espaciado sale de `globals.css` (semánticos sobre
  primitivos); nada de valores de marca hardcodeados fuera de `scripts/og.html`
  (estático, fuera de `src/`, no le aplica el CSP de tokens — pero sus colores
  salen igual de los primitivos reales, no inventados).
- **`DISPONIBLE_DEMO` acoplado a `captura-home.png`**: el overlay del hero
  tapa el número quemado en la captura y redibuja ese mismo valor animado. Si
  se regeneran las capturas (`npm run capture:demo`), `DISPONIBLE_DEMO` se
  actualiza **en el mismo commit** — si no, el overlay tapa un número y
  redibuja otro.
- **`reduced-motion` apaga el teatro**: todas las secciones respetan
  `useReducedMotion` (framer-motion) — sin animaciones de entrada, sin
  parallax, sin count-up del contador (arranca directo en `DISPONIBLE_DEMO`).
- Las capturas se regeneran con `npm run seed:demo` + `npm run capture:demo`
  (ver `docs/features/usuario-demo.md`); el OG con
  `node scripts/generate-og.mjs`.

## Gotcha del AppShell — RESUELTO en `5ec7160` (misma rama, 2026-08-22)
Hoy `RootLayout` lee la sesión en el server y se la pasa a `AppShell` como
`sesionInicial`; `esLandingAnonima = pathname === '/' && !sesionInicial` saltea
el shell y `fetchAllData()`. Las páginas públicas de contenido (`/privacidad`)
van por otra lista, `lib/rutas-publicas.ts`, que consultan middleware y shell.
Queda el relato del bug original porque explica por qué la decisión no puede
ser por pathname solo:

`src/components/layout/app-shell.tsx` decidía el shell (nav, chat widget,
onboarding tour) por ruta + `isInitialized`, sin distinguir la landing
anónima de `/`: solo trata `/login` y `/auth` como públicas. Cuando
`fetchAllData()` resuelve para un visitante sin sesión, `isInitialized` pasa a
`true` y `AppShell` cae en la rama autenticada — la Landing queda envuelta en
`MainNav` (sidebar `md:pl-64` en desktop, bottom-nav fijo en mobile),
`ChatWidgetWrapper` y `OnboardingTour` (que además arranca solo porque un
visitante nuevo nunca tiene `chanchito-tour` en `localStorage`). Eso es lo que
arregló `5ec7160`, en esta misma rama: el relato queda como advertencia, no como
pendiente.
