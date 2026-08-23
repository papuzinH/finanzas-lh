import type { Metadata, Viewport } from "next";
import { Fugaz_One, Asap, Bitter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { temaScript } from "@/components/theme/theme-script";
import { createClient } from "@/utils/supabase/server";

// Identidad cerrada 2026-08-13. Fugaz One es rótulo pintado (un solo peso, nunca
// en negrita forzada); Asap y Bitter son de Omnibus-Type y Huerta Tipográfica,
// las dos de Buenos Aires — la procedencia es parte del argumento de marca.
const display = Fugaz_One({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const sans    = Asap({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif   = Bitter({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  // Resuelve las URLs relativas de OG/Twitter (p.ej. /landing/og.png) contra
  // el dominio real — sin esto, Next las arma contra localhost:3000 en build.
  metadataBase: new URL("https://michanchito.net"),
  title: "Chanchito",
  description: "Dashboard financiero personal",
  appleWebApp: {
    capable: true,
    title: "Chanchito",
    statusBarStyle: "black-translucent",
  },
  // El .ico lo toma Next por convención de `src/app/favicon.ico`; acá se suman
  // el vectorial (nítido en cualquier densidad) y el PNG de respaldo.
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // La raíz es dual desde 2026-08-22 (landing pública / dashboard): el shell
  // necesita saber del lado del server si hay sesión, porque por pathname solo
  // no puede distinguir al visitante anónimo de / del usuario logueado (el
  // bug: sin esto, AppShell le pintaba MainNav + chat + tour a la landing).
  const supabase = await createClient();
  // getSession lee la cookie local sin round-trip a Supabase Auth: para decidir
  // el chrome del shell alcanza, porque el middleware ya validó con getUser()
  // en este mismo request y los datos reales están detrás de RLS igual. Una
  // cookie forjada solo conseguiría ver un dashboard vacío sin nav funcional.
  const { data: { session } } = await supabase.auth.getSession();

  return (
    <html
      lang="es"
      className={`${display.variable} ${sans.variable} ${serif.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Antes de hidratar: si no, la app pinta en Día y salta a Noche. */}
        <script dangerouslySetInnerHTML={{ __html: temaScript }} />
      </head>
      <body className="antialiased bg-bg text-text font-sans">
        <AppShell sesionInicial={session !== null}>
          {children}
        </AppShell>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
