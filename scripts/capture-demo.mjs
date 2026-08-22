/**
 * Captura las pantallas del usuario demo para la landing.
 *
 * Requiere: seeder corrido (Task 1) y el build de producción sirviendo en
 * CAPTURE_BASE_URL (default http://localhost:3100) contra DEV:
 *   npm run build && npx next start -p 3100
 *
 * La sesión no pasa por Google: se firma con email/contraseña vía supabase-js
 * y se inyecta como cookies en el formato de @supabase/ssr
 * (`sb-<ref>-auth-token` = "base64-" + base64url(JSON de la sesión), en
 * chunks de 3180 si hace falta). Si el middleware redirige a /login, el
 * formato cambió: loguearse a mano en DEV e inspeccionar document.cookie.
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { readFileSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = env.DEMO_USER_EMAIL;
const PASSWORD = env.DEMO_USER_PASSWORD;
const BASE = process.env.CAPTURE_BASE_URL ?? 'http://localhost:3100';
const LIMITE = 150 * 1024; // presupuesto por captura (spec)

// ---- chromium local (sin descarga)
function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const dirs = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort();
  if (!dirs.length) { console.error('No hay Chromium en ms-playwright. Seteá PW_CHROMIUM o corré: npx playwright install chromium'); process.exit(1); }
  return join(base, dirs.at(-1), 'chrome-win64', 'chrome.exe');
}

// ---- sesión del demo → cookies @supabase/ssr
const supa = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: auth, error: eAuth } = await supa.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (eAuth) { console.error('signInWithPassword:', eAuth.message, '\n¿Corriste el seeder? ¿Provider email habilitado en DEV?'); process.exit(1); }
const ref = new URL(URL_).hostname.split('.')[0];
const valor = 'base64-' + Buffer.from(JSON.stringify(auth.session)).toString('base64url');
const CHUNK = 3180;
const cookies = valor.length <= CHUNK
  ? [{ name: `sb-${ref}-auth-token`, value: valor }]
  : Array.from({ length: Math.ceil(valor.length / CHUNK) }, (_, i) => ({
      name: `sb-${ref}-auth-token.${i}`, value: valor.slice(i * CHUNK, (i + 1) * CHUNK),
    }));

// ---- capturar
const PANTALLAS = [
  { path: '/', archivo: 'captura-home' },
  { path: '/compromisos', archivo: 'captura-compromisos' },
  { path: '/inversiones', archivo: 'captura-inversiones' },
];
mkdirSync('public/landing', { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light',
});
await ctx.addCookies(cookies.map((c) => ({ ...c, url: BASE })));
// Tema día explícito, gane lo que gane el sistema operativo.
await ctx.addInitScript(() => { try { localStorage.setItem('chanchito-tema', 'dia'); } catch {} });

const page = await ctx.newPage();
for (const { path, archivo } of PANTALLAS) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  if (page.url().includes('/login')) {
    console.error(`Redirigido a /login en ${path}: el formato de cookie de @supabase/ssr cambió (ver comentario de cabecera).`);
    process.exit(1);
  }
  await page.waitForTimeout(1500); // fetchAllData + animaciones de entrada
  const png = await page.screenshot({ type: 'png' });
  const destino = `public/landing/${archivo}.png`;
  await sharp(png).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(destino);
  const peso = statSync(destino).size;
  console.log(`${destino}: ${(peso / 1024).toFixed(0)} KB`);
  if (peso > LIMITE) { console.error(`EXCEDE el presupuesto de 150 KB`); process.exit(1); }
}
await browser.close();
console.log('capturas listas');
