import type { Metadata, Viewport } from "next";
import { Alfa_Slab_One, Bodoni_Moda, Yellowtail, DM_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";

const poster = Alfa_Slab_One({ weight: "400", subsets: ["latin"], variable: "--font-poster" });
const serifd = Bodoni_Moda({ subsets: ["latin"], variable: "--font-serifd", display: "swap" });
const script = Yellowtail({ weight: "400", subsets: ["latin"], variable: "--font-script" });
const sans   = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

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
    <html lang="es" className={`${poster.variable} ${serifd.variable} ${script.variable} ${sans.variable}`}>
      <body className="antialiased bg-bg text-text font-sans">
        <AppShell>
          {children}
        </AppShell>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
