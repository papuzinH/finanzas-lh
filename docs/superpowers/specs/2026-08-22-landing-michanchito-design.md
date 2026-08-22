# Landing de michanchito.net — diseño

**Fecha**: 2026-08-22 · **Estado**: aprobado en sesión (Lauti) · **Fases**: 2 (usuario demo + capturas · landing)

## Contexto y decisiones de producto

- `michanchito.net` hoy manda directo al login: no existe ninguna página que cuente qué es Chanchito. La landing es la puerta nueva.
- **Qué es Chanchito de acá en adelante** (decisión 2026-08-22): *las dos cosas, en ese orden* — caso de portfolio primero, y la puerta abierta a quien quiera usarla, sin promoción ni cobro. No hay allowlist en el código y el registro siempre estuvo abierto; la landing lo cuenta con honestidad en vez de esconderlo.
- **Freemium: explícitamente pospuesto** hasta tener uso medible. Las tres opciones del Backlog (chat / volumen / módulos) se deciden con datos de usuarios reales, no antes. El modelo se cuenta como parte del caso de diseño (en el portfolio), no se implementa.
- **Tono**: la landing habla como **producto** (al usuario), con link discreto al caso de diseño en el pie. El proceso/research vive en `lh-portfolio`, no acá.
- **Estructura elegida** (visual companion, 2026-08-22): opción B «teléfono protagonista» + secciones opcionales chat y «hecha acá». Sin FAQ: la línea de confianza va en el CTA final.
- Dependencia conocida: el **video demo** del portfolio sigue pendiente. El usuario demo de la Fase 1 sirve para las capturas de la landing **y** para grabar ese video — un solo trabajo destraba los dos.

## Fase 1 — Usuario demo y capturas

### Persona

Alguien de ~30 que cobra a fin de mes. Datos diseñados para que cada pantalla capturada muestre su feature en el mejor estado real posible:

| Qué | Valor |
|---|---|
| Nombre | **Emi** — corto y neutro; aparece en el saludo del home, así que sale en las capturas |
| Ritmo de cobro | Mensual, últimos días hábiles (el caso que motivó el modelo de bolsillo) |
| Medios de pago | Mercado Pago (cuenta principal, saldo anclado) · Visa crédito (cierre 20, vto 28) · Efectivo |
| Movimientos | ~6 semanas de gastos cotidianos: chino, súper, SUBE, farmacia, birras, delivery |
| Cuotas | Celular 8/12 · Zapatillas 3/6 — a mitad de camino, se ve el progreso |
| Suscripciones | Netflix, Spotify, gym (mensualidades que se postean solas) |
| Meta | Una al ~60% — el chancho-medidor se ve llenándose |
| Presupuestos | Dos; uno cerca del límite (estado warn, con color) |
| Inversiones | USD billete + un CEDEAR — bimonetario, con cotizaciones reales del refresh |

**Todas las fechas relativas a hoy** (offsets, no fechas fijas): las capturas y el video no envejecen al regenerarlos.

### Dónde vive y cómo se crea

- Base **DEV** (la de `.env.local`). Producción no se toca.
- `scripts/seed-demo-user.mjs`, service role de DEV:
  1. Crea el auth user demo con **email/contraseña** vía admin API (habilitar el provider email **solo en DEV**; la UI sigue ofreciendo únicamente Google).
  2. Siembra los datos respetando la convención de `user_id` por tabla (Grupo A `auth.uid()` / Grupo B `users.id` — ver `docs/features/pwa-plataforma.md`; en runtime son el mismo UUID).
  3. **Idempotente**: correrlo de nuevo borra al demo y lo recrea. Nunca toca otros usuarios.
- Credenciales del demo: en `.env.local` (`DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`), nunca commiteadas.

### Capturas

- Build de producción local (`npm run build && next start`) contra DEV.
- Playwright (chromium local), viewport 390×844, sesión inyectada llamando `signInWithPassword` en el contexto del navegador (extensión del método de verificación usado el 2026-08-22 para la invitación a instalar).
- **Tema día** (crema), coherente con la landing. Capturas de noche: fuera de alcance por ahora.
- Salida: PNG a 2x recortados al contenido del teléfono, en `public/landing/` con nombres semánticos (`captura-home.png`, `captura-compromisos.png`, `captura-inversiones.png`).
- **Presupuesto de peso: < 150 KB por captura** (optimizadas; lección del `icon.png` de 3,6 MB). Un test lo vigila (ver Verificación).

## Fase 2 — La landing

### Ruteo

- `src/app/page.tsx` pasa a **Server Component**: lee la sesión con `utils/supabase/server.ts`; sin usuario renderiza `<Landing />`, con usuario renderiza el dashboard actual **movido tal cual** a `src/app/dashboard-client.tsx` (mismo patrón server-decide + client-render de Objetivos).
- `src/utils/supabase/middleware.ts`: `/` se vuelve ruta pública para anónimos (hoy redirige a `/login`). Los gates de onboarding y `/puesta-a-punto` para logueados quedan **intactos**.
- `/login` no cambia: sigue siendo el paso de entrada, la landing lo linkea.

### Componentes

`src/components/landing/`, un componente por sección. Server Components donde se pueda; client solo donde hay Framer Motion o `useInstallApp`. Framer Motion ya está en el repo (onboarding, template) — no se agrega dependencia.

| # | Sección | Contenido | Animación |
|---|---|---|---|
| 1 | **Hero split** | Cinta + claim + doble CTA: «Instalar la app» (reutiliza `useInstallApp` + modal iOS + auto-ocultamiento) y «Usar en el navegador» → `/login`. Teléfono con captura del home | Cascada de entrada · **contador del disponible hacia arriba** — el número es un overlay HTML posicionado sobre el frame del teléfono (un PNG no se anima); la captura de fondo va con esa zona limpia · parallax suave del teléfono |
| 2 | **Sticky phone ×3** | Disponible real → Compromisos → Inversiones, un bloque de texto por pantalla | Desktop: teléfono sticky, crossfade de capturas, texto entra por el costado. **Mobile: degrada a secciones apiladas** (el sticky en pantalla chica marea) |
| 3 | **Chat** | Conversación guionada: «gasté 8 lucas en el chino» → categorizado + respuesta. **Cero API — es teatro** | Máquina de escribir + burbujas que aparecen |
| 4 | **Hecha acá** | Por qué una app argentina: cuotas, ciclos de tarjeta, blue, ritmo de cobro. El ornamento fuerte (sello, cinta, sol) vive acá | Estampillas que se «pegan» al entrar al viewport, sello que rota |
| 5 | **CTA final** | Chancho grande + «Tenelo a mano» + botón instalar + «Usar en el navegador» + línea «Tus datos quedan tuyos» | El chancho reacciona al hover/tap |
| 6 | **Pie** | LH Studio · GitHub. El link al caso del portfolio se suma cuando el caso exista | — |

### Reglas transversales

- **Solo tokens semánticos** — regla dura del repo, sin excepción para la landing.
- Tokens de movimiento del sistema (`--duration-fast/base/slow`, `--ease-*`) como base; Framer para lo que CSS no expresa.
- **`prefers-reduced-motion` apaga todo el teatro**: contador estático, sin parallax, sin typewriter. Accesibilidad + seriedad de app de plata.
- Metadata propia para `/`: title, description y **OG image con el chancho** (compartir michanchito.net tiene que verse bien).
- Copy rioplatense, voz de la marca (la del login y Objetivos).

### Verificación

- Tests de markup (`environment: 'node'`, `renderToStaticMarkup`, como los existentes): secciones presentes, CTAs apuntando bien, sin hex ni escalas Tailwind.
- Test que falla si una captura referenciada no existe en `public/landing/` o **pesa más de 150 KB**.
- **Layout se verifica midiendo en el navegador** (regla establecida 2026-08-22, tercera ocurrencia del patrón): bounding boxes sin solapes ni overflow horizontal en 390×844 y 375×667, build de producción.
- Middleware: verificación manual en navegador — anónimo ve landing, logueado ve dashboard, onboarding intacto.
- **Gate visual de Lauti antes del merge**, día y noche, como siempre.

## Fuera de alcance

- Freemium / paywall / pricing (pospuesto a uso medible).
- Modo demo navegable dentro de la app (era la opción C, descartada).
- Capturas en tema noche.
- Legales (privacy policy / TyC): siguen pendientes de la decisión de promocionar — la landing no promociona, cuenta.
- El caso de diseño en el portfolio y el video demo (trabajos aparte; el usuario demo los alimenta).
