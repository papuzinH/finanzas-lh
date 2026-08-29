import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { construirSecurityHeaders } from "./src/lib/security/headers";
import { construirRedirectsCanonicos } from "./src/lib/security/dominio-canonico";

/**
 * CSP en **enforce**. Lo que se verificó antes de cortar:
 *
 * 1. La app entera en el navegador (10 pantallas con sesión, día y noche, más
 *    las públicas sin sesión), primero en report-only y después en enforce: la
 *    única violación es la prueba de capacidad de Zod (`allowsEval`, un
 *    `new Function("")` en try/catch que al fallar lo hace caer a su camino sin
 *    JIT — por eso NO hace falta `'unsafe-eval'`), y cero errores de consola.
 * 2. La cadena del login con Google, que no se puede ejercitar en local porque
 *    DEV no tiene el provider: se midió el mecanismo con esta misma política —
 *    un submit cuyo redirect va a Supabase llega hasta `accounts.google.com` sin
 *    violaciones, y el mismo submit hacia un origen no listado se bloquea. Ese
 *    control invertido es lo que prueba que `form-action` alcanza a los
 *    redirects, y por lo tanto que Supabase tenía que estar nombrado.
 *
 * Ver `src/lib/security/headers.ts`.
 */
const CSP_REPORT_ONLY = false;

const securityHeaders = construirSecurityHeaders(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  { reportOnly: CSP_REPORT_ONLY },
);

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // No anunciar el framework: no es una defensa, pero es información gratis
  // para quien busca objetivos por versión (auditoría M3).
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Un solo hostname: www se va al apex. Sin esto el login con Google rebota
  // al /login, porque el `redirectTo` del OAuth sale con el host de la request
  // y www no está en la allow-list de Supabase. Ver `lib/security/dominio-canonico.ts`.
  async redirects() {
    return construirRedirectsCanonicos();
  },
};

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development", // Desactivar en modo dev para que no moleste
  workboxOptions: {
    disableDevLogs: true,
  },
});

export default withPWA(nextConfig);