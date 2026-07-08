# 🐷 Chanchito

PWA de finanzas personales pensada para el día a día argentino: movimientos en ARS/USD (dólar blue), tarjetas de crédito con ciclos de cierre/vencimiento reales, mensualidades, cuotas, objetivos de ahorro, presupuestos, inversiones y un asistente IA conversacional.

## Stack

- **Next.js** (App Router) + **TypeScript** — Server Components por defecto
- **Supabase** — PostgreSQL + Auth
- **Zustand** — estado cliente (`src/lib/store/financeStore.ts`, única fuente de verdad)
- **Tailwind CSS** con tokens semánticos propios (design system Chanchito)
- **Gemini 2.5 Flash** (`@google/genai`) — asistente IA agéntico con tools tipadas
- **Vitest** — tests · **@ducanh2912/next-pwa** — PWA

## Comandos

```bash
npm run dev      # Desarrollo (Turbopack)
npm run build    # Build de producción (Webpack)
npm run lint     # ESLint
npm test         # Vitest
```

## Arquitectura en 30 segundos

- `src/app/` — rutas: `/` (home con Disponible Real), `/movimientos`, `/compromisos`, `/objetivos`, `/inversiones`, `/ajustes/*`, `/api/chat` (asistente IA).
- `src/lib/finance/` — funciones **puras** de cálculo financiero, compartidas por el store (cliente) y el chatbot (servidor): garantía de que el chat y el home dicen el mismo número.
- `src/lib/store/financeStore.ts` — store Zustand; sus getters son wrappers finos sobre `lib/finance/`.
- `src/lib/ai/` — agent loop del asistente (tools con schema Zod, registry, handlers).
- `supabase/migrations/` — schema SQL (aplicar a PROD **antes** de mergear a master).

## Documentación

- [CLAUDE.md](CLAUDE.md) — convenciones y reglas del proyecto (leer primero).
- [docs/features/](docs/features/) — un documento por gran feature: arquitectura, archivos clave, tablas e invariantes.
- [docs/superpowers/](docs/superpowers/) — specs y planes históricos por fecha.

## Deploy

`master` deploya automático a producción en Vercel (Supabase PROD). El entorno local usa `.env.local` con Supabase DEV.
