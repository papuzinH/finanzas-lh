import type { Metadata, Viewport } from "next";
import { Fugaz_One, Asap, Bitter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { temaScript } from "@/components/theme/theme-script";

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
  title: "Chanchito",
  description: "Dashboard financiero personal",
  appleWebApp: {
    capable: true,
    title: "Chanchito",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        <AppShell>
          {children}
        </AppShell>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
