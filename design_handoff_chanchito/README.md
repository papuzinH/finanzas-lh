# Handoff: Rediseño Chanchito (Next.js)

Paquete para implementar el rediseño de la app **Chanchito** (finanzas personales, es-AR)
sobre tu proyecto Next.js existente, usando Claude Code.

## ⚠️ Qué es esto
Los archivos en `prototypes/` son **referencias de diseño hechas en HTML/React-Babel** —
muestran el look y el comportamiento buscados, **no son código para copiar tal cual**.
La tarea es **recrear estos diseños en tu codebase Next.js**, con tus patrones y tu API real.

Fidelidad: **alta (hi-fi)**. Colores, tipografía, espaciado e interacciones son finales.
Reproducí la UI con fidelidad de píxel usando los componentes/tokens de este paquete.

## Contenido del paquete
```
design_handoff_chanchito/
├─ README.md                  ← este archivo
├─ CLAUDE_design_system.md    ← PEGAR en tu CLAUDE.md (reglas del sistema)
├─ tokens.css                 ← CSS vars (claro + oscuro + acentos). Drop-in en globals.css
├─ tailwind.tokens.ts         ← theme.extend para tu tailwind.config.ts
├─ fonts.md                   ← las 4 fuentes con next/font
├─ components/                ← primitivas ya convertidas a módulos Next (TSX)
│  ├─ Icon.tsx  Button.tsx  primitives.tsx  cn.ts
└─ prototypes/                ← referencia visual (abrir en navegador)
   ├─ Chanchito App.html      ← prototipo navegable de las 5 pantallas + chat
   ├─ Chanchito UI Kit.html   ← sistema de diseño completo (tokens, specs, variantes)
   └─ app/                    ← fuente de los prototipos (lógica de cada componente)
```

## Setup (una vez)
1. **Tokens:** copiá `tokens.css` a tu repo e importalo al inicio de `globals.css`
   (`@import "./tokens.css";`). Activá `darkMode: "class"` en Tailwind.
2. **Tailwind:** mergeá `tailwind.tokens.ts` dentro de `theme.extend` (ver comentario al pie del archivo).
3. **Fuentes:** seguí `fonts.md` (`npm i` no hace falta, usa `next/font/google`).
4. **Íconos:** `npm i lucide-react` (el wrapper `Icon.tsx` mapea los nombres de los prototipos).
5. **Primitivas:** mové `components/*` a tu carpeta de UI (p. ej. `components/ui/`). Son
   data-agnósticas y ya respetan los tokens.
6. **CLAUDE.md:** pegá el bloque de `CLAUDE_design_system.md` en tu `CLAUDE.md` existente.

## Cómo trabajar el rediseño con Claude Code (pantalla por pantalla)
Una vez hecho el setup, pedile a Claude Code algo como:

> "Rediseñá la pantalla `/movimientos` siguiendo el sistema de
> `design_handoff_chanchito`. Usá las primitivas de `components/ui` y los tokens.
> La referencia visual y la lógica del componente está en
> `prototypes/app/screen-movimientos.jsx` y se ve en `prototypes/Chanchito App.html`.
> Cableá los datos a nuestro endpoint real de transacciones; NO uses el dataset demo."

Repetí para `/inicio`, `/compromisos`, `/objetivos`, `/inversiones`.

## Las 5 pantallas (resumen)
| Ruta | Qué muestra | Datos |
|---|---|---|
| `/inicio` | Saldo del mes, tendencia 6m, comparador de categorías, insights, últimos movimientos, presupuestos | varios |
| `/movimientos` | Transacciones agrupadas por día, filtros por categoría y medio de pago, ARS/USD | `transactions` |
| `/compromisos` | Tabs: cuotas y suscripciones (con burn rate) | `installment_plans`, `recurring_plans` |
| `/objetivos` | Tabs: metas de ahorro y presupuestos por categoría | `savings_goals`, `category_budgets` |
| `/inversiones` | Resumen (donut), activos (P&L), cargar. Bimonetario | `investment_assets`, `market_prices` |

Más el **chat con IA** (FAB flotante + panel) presente en todas las pantallas.

## Notas
- Los prototipos usan un dataset demo argentino (`prototypes/app/data.jsx`) **solo de referencia**.
  Tu implementación debe leer de la API real.
- El formato de moneda de referencia está en `data.jsx` (`ars()`, `usd()`, `pct()`): es-AR,
  sin decimales en ARS, tag de cotización para USD.
- Acento por defecto: **celeste**. Conmutable a dorado/rojo reescribiendo `--accent*` (ver tokens.css).
