import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { construirSecurityHeaders } from "./src/lib/security/headers";

/**
 * CSP en enforce. Se verificó primero en report-only recorriendo la app con
 * sesión (día y noche, las 10 pantallas) y la única violación era la prueba de
 * capacidad de Zod (`allowsEval`: `new Function("")` en un try/catch, cacheado),
 * que al fallar lo hace caer solo a su camino sin JIT — por eso NO hace falta
 * `'unsafe-eval'`. Ver `src/lib/security/headers.ts`.
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