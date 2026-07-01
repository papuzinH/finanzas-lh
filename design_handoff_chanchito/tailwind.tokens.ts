/* ============================================================
   ⚠️ DEPRECADO — NO EDITAR NI COPIAR.
   La fuente de verdad de tokens es `src/app/globals.css`, que usa
   Tailwind v4 `@theme inline` (no hay tailwind.config.ts). Este
   archivo quedó como referencia histórica del handoff.
   Ver design-system-plan.md.
   ============================================================ */

/* ============================================================
   Chanchito · Tailwind theme tokens (histórico)
   Mergeá esto dentro de theme.extend en tu tailwind.config.ts.
   Los colores semánticos apuntan a las CSS vars de tokens.css,
   así heredan el tema claro/oscuro y el acento automáticamente.
   ============================================================ */

import type { Config } from "tailwindcss";

export const chanchitoTheme: Config["theme"] = {
  extend: {
    colors: {
      // Semánticos (siguen las CSS vars → soportan dark + acento)
      bg:        "var(--bg)",
      "bg-2":    "var(--bg-2)",
      surface:   "var(--surface)",
      "surface-2": "var(--surface-2)",
      text:      "var(--text)",
      muted:     "var(--muted)",
      faint:     "var(--faint)",
      border:    "var(--border)",
      hero:      "var(--hero)",
      accent:        "var(--accent)",
      "accent-deep": "var(--accent-deep)",
      "accent-soft": "var(--accent-soft)",
      "accent-ink":  "var(--accent-ink)",
      good: "var(--good)",
      warn: "var(--warn)",
      bad:  "var(--bad)",

      // Paleta fija de marca (por si necesitás un valor literal)
      celeste: { DEFAULT: "#A9CFE0", deep: "#5E98BC", soft: "#CBE2EE", tiza: "#E4F0F6" },
      cream:   { DEFAULT: "#F4EDDC", light: "#FBF7EC", dark: "#EAE0C6" },
      gold:    { DEFAULT: "#E3A938", deep: "#B97E16", soft: "#F2CB6E" },
      navy:    { DEFAULT: "#1C2A47", deep: "#14203A", mid: "#34466A" },
      rojo:    "#C2403A",
    },
    fontFamily: {
      poster: ['"Alfa Slab One"', "serif"],          // saldos, títulos, números display
      serifd: ['"Bodoni Moda"', "Georgia", "serif"], // frases editoriales
      script: ['"Yellowtail"', "cursive"],           // tagline / flourish
      sans:   ['"DM Sans"', "system-ui", "sans-serif"], // toda la UI
    },
    borderRadius: {
      sm: "8px", md: "12px", lg: "16px", xl: "22px", "2xl": "26px",
    },
    boxShadow: {
      card:   "0 1px 0 0 var(--border)",
      float:  "0 18px 36px -18px rgba(28,42,71,0.70)",
      offset: "3px 3px 0 0 var(--accent-deep)",
      fab:    "4px 5px 0 0 var(--accent-deep)",
    },
    borderWidth: {
      DEFAULT: "1.5px",
      "1.5": "1.5px",
    },
  },
};

/* ---- Uso en tailwind.config.ts ----
import { chanchitoTheme } from "./design_handoff_chanchito/tailwind.tokens";

export default {
  darkMode: "class",
  content: [ ... ],
  theme: chanchitoTheme,
} satisfies Config;
--------------------------------------- */
