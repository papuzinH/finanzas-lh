// Chequea qué nombre muestra la pantalla de Google al iniciar el OAuth desde
// michanchito.net: hasta que la verificación de marca propaga, dice el dominio
// de Supabase (mkkg….supabase.co) en vez de «Chanchito». Sólo navega el flujo,
// no toca ninguna base ni crea sesión.
//
// Uso: node scripts/check-consent-screen.mjs [ruta-captura.png]
// (Chromium local de playwright-core, mismo chromiumPath() que capture-demo.mjs.)
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const dirs = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort();
  if (!dirs.length) { console.error('No hay Chromium en ms-playwright.'); process.exit(1); }
  return join(base, dirs.at(-1), 'chrome-win64', 'chrome.exe');
}

const OUT = process.argv[2] ?? 'consent-check.png';

const browser = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({ viewport: { width: 500, height: 900 }, locale: 'es-AR' });
const page = await ctx.newPage();

await page.goto('https://michanchito.net/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
const boton = page.getByRole('button', { name: /google/i }).first();
await boton.waitFor({ timeout: 15000 });
await Promise.all([
  page.waitForURL(/accounts\.google\.com/, { timeout: 30000 }),
  boton.click(),
]);
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(2500); // la página de Google termina de pintar el encabezado

console.log('URL:', page.url().slice(0, 120));
const texto = await page.evaluate(() => document.body.innerText);
const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
const interes = lineas.filter((l) => /continuar|continue|chanchito|supabase|michanchito/i.test(l));
console.log('--- líneas relevantes ---');
for (const l of interes) console.log(l);
console.log('--- primeras 12 líneas ---');
for (const l of lineas.slice(0, 12)) console.log(l);

await page.screenshot({ path: OUT, fullPage: false });
console.log('Captura:', OUT);
await browser.close();
