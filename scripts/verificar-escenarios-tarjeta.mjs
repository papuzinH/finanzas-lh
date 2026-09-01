/**
 * Gate visual + assertions de los escenarios de tarjeta en DEV.
 * Loguea al demo, entra al home y a compromisos, verifica en el DOM que el aviso
 * y los montos estén, y deja capturas. Se borra al terminar la sesión.
 *
 * Uso: VERIFY_BASE_URL=http://localhost:3001 node scripts/verificar-escenarios-tarjeta.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
if (new URL(URL_).hostname.split('.')[0] === 'mkkgdjxaotgimqwhyesx') {
  console.error('ABORTADO: apunta a producción.'); process.exit(1);
}
const BASE = process.env.VERIFY_BASE_URL ?? 'http://localhost:3001';
const OUT = process.env.VERIFY_OUT ?? '.';

// Misma resolucion que capture-demo.mjs (chrome-win64, no chrome-win).
function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const dirs = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort();
  if (!dirs.length) { console.error('No hay Chromium en ms-playwright.'); process.exit(1); }
  return join(base, dirs.at(-1), 'chrome-win64', 'chrome.exe');
}

const supa = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: auth, error: eAuth } = await supa.auth.signInWithPassword({
  email: env.DEMO_USER_EMAIL, password: env.DEMO_USER_PASSWORD,
});
if (eAuth) { console.error('signInWithPassword:', eAuth.message); process.exit(1); }

const ref = new URL(URL_).hostname.split('.')[0];
const valor = 'base64-' + Buffer.from(JSON.stringify(auth.session)).toString('base64url');
const CHUNK = 3180;
const cookies = valor.length <= CHUNK
  ? [{ name: `sb-${ref}-auth-token`, value: valor }]
  : Array.from({ length: Math.ceil(valor.length / CHUNK) }, (_, i) => ({
      name: `sb-${ref}-auth-token.${i}`, value: valor.slice(i * CHUNK, (i + 1) * CHUNK),
    }));

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light',
});
await ctx.addCookies(cookies.map((c) => ({ ...c, url: BASE })));
await ctx.addInitScript(() => { try { localStorage.setItem('chanchito-tema', 'dia'); } catch {} });
const page = await ctx.newPage();

const errores = [];
const ok = (cond, msg) => { console.log(`${cond ? '  OK  ' : '  MAL '} ${msg}`); if (!cond) errores.push(msg); };

// ---- HOME
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
if (page.url().includes('/login')) { console.error('Redirigido a /login: la cookie no sirvió.'); process.exit(1); }
await page.waitForTimeout(2500);
const home = await page.innerText('body');

console.log('\n--- HOME ---');
ok(/Venció el resumen/i.test(home), 'aparece el aviso de resumen vencido');
ok(/descontando de tu plata libre/i.test(home), 'el aviso explica que lo sigue descontando');
ok(!/Descartar aviso/i.test(home.slice(0, 400)), 'el aviso no ofrece descartarse');
const disponible = home.match(/\$\s?[\d.]+/)?.[0];
console.log(`  plata libre en pantalla: ${disponible ?? '(no encontrada)'}`);
await page.screenshot({ path: join(OUT, 'home.png'), fullPage: false });
await page.screenshot({ path: join(OUT, 'home-completo.png'), fullPage: true });

// ---- COMPROMISOS
await page.goto(BASE + '/compromisos', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const comp = await page.innerText('body');
console.log('\n--- COMPROMISOS ---');
ok(comp.includes('· vencido'), 'la card marca el resumen como vencido');
ok(/y no lo marcaste/i.test(comp), 'dice que no se marcó el pago');
ok(/u\$s/i.test(comp), 'muestra el monto en dólares junto al de pesos');
ok(/¿La pagaste\?/i.test(comp), 'el chip del vencido pide la acción, no dice "Pendiente"');
await page.screenshot({ path: join(OUT, 'compromisos.png'), fullPage: true });

// ---- consola del navegador (React degradado por CSP)
const errConsola = [];
page.on('console', (m) => { if (m.type() === 'error') errConsola.push(m.text()); });
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
console.log('\n--- CONSOLA ---');
ok(!errConsola.some((e) => /eval/i.test(e)), 'sin el error de eval() de React en desarrollo');
if (errConsola.length) console.log('  otros errores:', errConsola.slice(0, 3));

await browser.close();
console.log(`\ncapturas en ${OUT}`);
if (errores.length) { console.error(`\n${errores.length} verificación(es) fallaron.`); process.exit(1); }
console.log('todas las verificaciones pasaron.');
