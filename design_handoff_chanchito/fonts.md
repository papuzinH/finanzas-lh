# Fuentes

El sistema usa 4 familias de Google Fonts. En Next.js, lo más limpio es `next/font/google`.

## app/layout.tsx (o donde definas las fuentes)

```ts
import { Alfa_Slab_One, Bodoni_Moda, Yellowtail, DM_Sans } from "next/font/google";

const poster = Alfa_Slab_One({ weight: "400", subsets: ["latin"], variable: "--font-poster" });
const serifd = Bodoni_Moda({ subsets: ["latin"], variable: "--font-serifd" });
const script = Yellowtail({ weight: "400", subsets: ["latin"], variable: "--font-script" });
const sans   = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });

// en <html className={`${poster.variable} ${serifd.variable} ${script.variable} ${sans.variable}`}>
```

Y en `tailwind.tokens.ts`, cambiá las fontFamily para que apunten a las CSS vars:

```ts
fontFamily: {
  poster: ["var(--font-poster)", "serif"],
  serifd: ["var(--font-serifd)", "Georgia", "serif"],
  script: ["var(--font-script)", "cursive"],
  sans:   ["var(--font-sans)", "system-ui", "sans-serif"],
},
```

## Alternativa: <link> directo

Si preferís no usar next/font:

```html
<link href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Bodoni+Moda:opsz,wght@6..96,500;6..96,600;6..96,700&family=Yellowtail&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap" rel="stylesheet" />
```
