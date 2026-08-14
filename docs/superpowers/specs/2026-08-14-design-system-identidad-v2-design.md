# Design System Identidad v2 — Spec de implementación

**Fecha**: 2026-08-14 · **Estado**: aprobado en diseño (chat Pancho)
**Contexto**: la identidad fileteado-criollo quedó cerrada el 2026-08-13 (assets en `design/brand/`, decisiones en el artifact «Identidad Chanchito», vectores en Figma). El prototipo completo (15 pantallas día/noche) vive en el proyecto Claude Design «Diseño PWA Chanchito» y fue aprobado por Lauti. Esta fase lleva esa identidad al código real.

**Principio rector**: reemplazo **atómico**. Se modifican tokens y componentes básicos (átomos) para que la cascada repinte moléculas y organismos sola. Las pantallas NO se rediseñan estructuralmente; solo se intervienen los cuatro «momentos de marca» listados en §4. El prototipo Claude Design es la referencia visual, no un espec funcional — las diferencias de funcionalidad entre prototipo y app real se resuelven siempre a favor de la app real.

**Rama**: `identidad-v2` desde `master`. NUNCA push a master (deploy Vercel es decisión de Lauti). La rama vieja `identidad-fileteado` es un registro descartado: no tocarla, no mergearla, no reusar su código.

---

## 1 · Fuentes — `src/app/layout.tsx`

Reemplazar los cuatro `next/font/google` **manteniendo los nombres de variable CSS** (así las ~89 clases `font-poster` y todos los `font-sans` se actualizan sin tocar componentes):

| Variable | Hoy | Pasa a | Config |
|---|---|---|---|
| `--font-poster` | Alfa_Slab_One | `Fugaz_One` | `weight: "400", subsets: ["latin"]` |
| `--font-sans` | DM_Sans | `Asap` | `subsets: ["latin"]` (variable; ejes por defecto) |
| `--font-serifd` | Bodoni_Moda | `Bitter` | `subsets: ["latin"], style: ["normal","italic"]` |
| `--font-script` | Yellowtail | **eliminar** | cero usos fuera de layout.tsx; quitar también su línea `--font-script` del `@theme inline` de globals.css |

Reglas de uso (heredadas del prototipo, van como comentario en globals.css):
- Fugaz One es un solo peso: nunca `font-bold` sobre `font-poster`.
- Toda cifra display lleva `tnum` (ya existe la utilidad).
- Bitter itálica para fechas de conversación y notas al pie.

## 2 · Tokens — `src/app/globals.css`

La estructura de 3 capas se conserva tal cual. Cambios por capa:

### 2.1 Primitivos (capa 1) — agregar

```css
/* ---- Marca ---- */
--bandera:  #70AADE;   /* celeste bandera, fijo en ambos temas */
--ladrillo: #AE4A3C;   /* sello */
/* ---- Paleta: Estraza (tema noche) ---- */
--estraza-900: #251F15;
--estraza-800: #2B241A;   /* fondo noche (papel de estraza) */
--estraza-700: #332A1D;   /* surface noche */
--estraza-600: #3B3122;   /* surface-2 noche */
--estraza-200: #C9BFA8;   /* texto muted noche */
/* ---- Celestes noche (más claros para contraste sobre marrón) ---- */
--celeste-n300: #9CC7E3;
--celeste-n400: #8FBEDC;
--celeste-n500: #7FB3D4;
/* ---- Semánticos noche ---- */
--green-n:  #5FA98A;
--gold-n:   #D9A84E;
--rojo-n:   #E06B5F;
/* Canal RGB para composición con alpha (--cream-100-rgb ya existe) */
--estraza-800-rgb: 43 36 26;
```

Los primitivos existentes (celeste/cream/navy/gold/rojo/green día) no cambian: el tema día ya es fiel a la identidad.

### 2.2 Semánticos (capa 2)

Día: sin cambios. El bloque `.dark, [data-theme="dark"]` **se reemplaza completo** por el tema noche estraza (muere el dark navy):

```css
.dark, [data-theme="dark"] {
  --bg: var(--estraza-800);      --bg-2: var(--estraza-900);
  --surface: var(--estraza-700); --surface-2: var(--estraza-600);
  --text: var(--cream-100);      --muted: var(--estraza-200);
  --faint:  rgb(var(--cream-100-rgb) / 0.5);
  --border: rgb(var(--cream-100-rgb) / 0.18);
  --border-strong: rgb(var(--cream-100-rgb) / 0.4);
  --accent: var(--celeste-n500); --accent-deep: var(--celeste-n300);
  --accent-soft: var(--celeste-700); --accent-ink: #22303F;
  --good: var(--green-n); --warn: var(--gold-n); --bad: var(--rojo-n);
}
```

Nota de rol: en noche `--accent-deep` es MÁS claro que `--accent` (es tinta de labels/links sobre fondo oscuro). `--accent-soft` en noche es un celeste profundo para fondos suaves de banner.

### 2.3 Componente (capa 3)

```css
/* Hero: deja el navy oscuro; pasa a card clara con cifra shadow-bandera */
--hero:      var(--surface);
--hero-text: var(--text);
/* Sombras */
--shadow-bandera: 1.5px 1.5px 0 var(--bg), 4px 4px 0 var(--bandera);  /* NUEVA */
--shadow-offset: 0 1px 0 0 var(--border);        /* muere la 3px 3px dura */
--shadow-fab: 0 10px 22px -10px rgb(var(--navy-700-rgb) / 0.55);
/* En bloque noche: --shadow-card y --shadow-fab con rgb(0 0 0 / 0.35 y 0.6) */
```

`--shadow-offset` se conserva como token (para no tocar sus consumidores) pero con valor de apoyo sutil. Los banner-* (capa 3) se revisan en noche: si `--gold-100`/`--celeste-200` de fondo quedan ilegibles con texto crema, se agregan overrides de `--banner-*-bg` al bloque noche.

Exponer en `@theme inline`: `--shadow-bandera` y `--color-bandera`, `--color-ladrillo`.

## 3 · Data-viz — escala `--chart-N` por tema

Los 5 gráficos (`trend-chart`, `metric-grid`, `savings-rate-bars`, `spending-pace-chart`, `portfolio-distribution`) consumen `var(--chart-N)` sin hardcodes: la adaptación es solo de tokens.

- **Día**: la escala actual se valida con `scripts/validate_palette.js` del skill dataviz (modo light, superficie `#FFFFFF`). Se re-stepea cualquier par adyacente que falle CVD/contraste.
- **Noche**: se define un bloque `--chart-N` dentro de `.dark` — los pasos oscuros actuales (chart-7 navy-700, chart-8 slate-500, chart-9 navy-800) son ilegibles sobre `#332A1D` y se reemplazan por pasos claros de las mismas familias (celestes noche, crema, estraza-200). Validar con el mismo script (modo dark, superficie `#332A1D`).
- Los roles fijos `--chart-ars`/`--chart-usd` siguen apuntando a `--good`/`--accent` (ya cambian por tema).
- Verificación visual final: captura Playwright de Dashboard (sparklines + trend), Análisis y Inversiones (distribución) en ambos temas.

## 4 · Momentos de marca

### 4.1 `src/components/brand/` (nuevo)

- `chancho.tsx` — `<Chancho tinta?: string; ranura?: string; className?>`: SVG inline (viewBox `0 0 194 146`, paths de `design/brand/chancho.svg`). Defaults: `tinta="currentColor"`, `ranura="var(--bg)"`. La cola es stroke con `fill="none"` **obligatorio** (regresión conocida: sin él se rellena negra).
- `sello.tsx` — `<Sello className?>`: embebe `design/brand/sello.svg` (textos ya en curvas, no depende de fuentes).
- `cinta.tsx` — `<Cinta frase: 'el-que-guarda' | 'guita-clara' | 'sin-apuro' | 'sol'; conFranja?: boolean>`: embebe el SVG correspondiente de `design/brand/`. `conFranja` agrega la franja central crema `#F4EDDC` detrás de las bandas (path ya calculado, en `claude-design/franja-blanca.frag`) — **obligatoria en tema noche** para que lea como bandera; en día opcional (el frente abierto toma el crema del fondo).

### 4.2 Intervenciones

- **Login** (`app/login/`): estructura del prototipo — sello 172px arriba, «Chanchito» en `font-poster` 42px, subtítulo «Gastos, cuotas y verdes del día a día, en orden.», `<Cinta frase="el-que-guarda">` al centro, botón Google existente abajo (lógica intacta). Sin «Buenos Aires · 2026».
- **FAB del chat** (`ChatWidget.tsx`): `MessageCircle` → `<Chancho tinta="var(--cream-50)" ranura="var(--accent)">` ~30×23. El estado abierto (X) no cambia.
- **Bienvenida del chat**: el emoji 🐷 → `<Chancho>` tinta accent, y el copy pasa a «¡Buenas! Contame qué gastaste o preguntame por tus números.»
- **Balance-card** (`dashboard/balance-card.tsx`): la cifra principal pasa a `font-poster` con `text-shadow: var(--shadow-bandera)` sobre el hero claro (§2.3). El resto de la card no se toca.

## 5 · Identidad PWA

- **Íconos** (generados con Playwright desde `design/brand/chancho.svg` — nunca redibujar):
  - `public/favicon.svg`: chancho tinta navy sobre crema `#F4EDDC`, esquinas redondeadas.
  - `public/favicon.ico` + `favicon-96x96.png`: raster del anterior.
  - `public/icon.png` (512): chancho navy sobre crema, margen 12%.
  - `public/apple-touch-icon.png` (180): igual, margen 15%.
  - `public/web-app-manifest-192x192.png` y `-512x512.png`: versión maskable — chancho al 60% del canvas centrado (zona segura 80%).
- **`src/app/manifest.ts`**: `description: 'Gastos, cuotas y verdes del día a día, en orden.'`, `background_color: '#F4EDDC'`, `theme_color: '#F4EDDC'`.
- **`layout.tsx` metadata**: `themeColor` con media queries — día `#F4EDDC`, `(prefers-color-scheme: dark)` `#2B241A`. Revisar `site.webmanifest` duplicado en public/ (si existe y difiere, alinearlo o eliminarlo si nada lo referencia).

## 6 · Átomos — auditoría `components/ui`

Con tokens y fuentes nuevos, la mayoría se repinta sola. Auditoría dirigida:

- `button.tsx`: las variantes con `shadow-offset` quedan (el token ya es sutil). Variante `navy` (`bg-hero`) ahora es clara: revisar que `text-cream-light` pase a `text-hero-text` para no quedar crema-sobre-blanco.
- `banner-ds.tsx`, `chip.tsx`, `tabs-ds.tsx`, `toggle-ds.tsx`, `progress-bar.tsx`, `switch.tsx`: verificar en ambos temas; corregir solo lo que consuma primitivos crudos o quede ilegible en noche.
- `skeletons.tsx`, `sonner.tsx`, `action-sheet.tsx`, `dialog.tsx`, `sheet.tsx`: verificación visual en ambos temas, sin cambios esperados.
- `icon.tsx`: sin cambios (lucide sigue siendo la iconografía funcional; los emojis de categorías NO se tocan en esta fase — decisión pendiente de Lauti).

## 7 · Verificación

- Por tarea: `npm run build` (o dev) + captura Playwright de la pantalla afectada en día Y noche (forzar `.dark` en `<html>`), comparación visual contra el prototipo (`claude-design/*-check.png`).
- Final: recorrido completo — Login, Dashboard, Movimientos, Compromisos, Objetivos, Inversiones, Ajustes, Chat abierto — ambos temas, viewport 390×844.
- Lighthouse/PWA rápido para manifest e íconos (instalabilidad).

## 8 · Fuera de alcance

- Rediseño estructural de pantallas y funcionalidad nueva (incluye toggle de tema en Ajustes si no existe hoy).
- Migración de emojis de categorías a sellos-chancho (decisión pendiente).
- Onboarding: se repinta solo por tokens; sus ilustraciones/slides no se rediseñan en esta fase.
- Pantallas Noche del prototipo como specs: la referencia noche es el tema por tokens, no un rediseño por pantalla.
