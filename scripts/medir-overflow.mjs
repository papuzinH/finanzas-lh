/**
 * Mide desborde horizontal en 390px (el canvas base del repo) recorriendo las
 * pantallas del demo, y NOMBRA al elemento culpable en vez de decir sólo "hay
 * overflow": recorre el DOM buscando el nodo más chico cuyo rectángulo se sale
 * del viewport, que es el que hay que arreglar.
 *
 * No es un gate: es una herramienta de diagnóstico. Se corre a mano.
 *
 * Uso: VERIFY_BASE_URL=http://localhost:3130 node scripts/medir-overflow.mjs
 */
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const BASE = process.env.VERIFY_BASE_URL ?? 'http://localhost:3130';
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const PROD_REF = 'mkkgdjxaotgimqwhyesx';
if (new URL(URL_).hostname.split('.')[0] === PROD_REF) {
  console.error('ABORTADO: apunta a PRODUCCIÓN.');
  process.exit(1);
}

// Misma resolucion que el resto de los scripts del repo (chrome-win64).
function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const dirs = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort();
  if (!dirs.length) { console.error('No hay Chromium en ms-playwright.'); process.exit(1); }
  return join(base, dirs.at(-1), 'chrome-win64', 'chrome.exe');
}

const anon = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sesion, error } = await anon.auth.signInWithPassword({
  email: env.DEMO_USER_EMAIL,
  password: env.DEMO_USER_PASSWORD,
});
if (error) { console.error('login del demo:', error.message); process.exit(1); }

// La sesion no entra en una cookie sola: se parte igual que en los otros gates.
const ref = new URL(URL_).hostname.split('.')[0];
const valor = 'base64-' + Buffer.from(JSON.stringify(sesion.session)).toString('base64url');
const CHUNK = 3180;
const cookies = valor.length <= CHUNK
  ? [{ name: `sb-${ref}-auth-token`, value: valor }]
  : Array.from({ length: Math.ceil(valor.length / CHUNK) }, (_, i) => ({
      name: `sb-${ref}-auth-token.${i}`, value: valor.slice(i * CHUNK, (i + 1) * CHUNK),
    }));

const browser = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
await ctx.addCookies(cookies.map((c) => ({ ...c, url: BASE })));
const page = await ctx.newPage();

/** Devuelve el detalle del desborde: cuánto, y qué elemento lo produce. */
const medir = () =>
  page.evaluate(() => {
    const doc = document.documentElement;
    const exceso = doc.scrollWidth - doc.clientWidth;
    if (exceso <= 0) return { exceso: 0, culpables: [] };
    const ancho = doc.clientWidth;
    const culpables = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const sale = Math.round(r.right - ancho);
      if (sale <= 0) continue;
      // El nodo más profundo que se sale es el que hay que arreglar; sus padres
      // se salen "de arrastre".
      if ([...el.children].some((c) => c.getBoundingClientRect().right > ancho)) continue;
      culpables.push({
        sale,
        tag: el.tagName.toLowerCase(),
        clase: (el.getAttribute('class') ?? '').slice(0, 110),
        texto: (el.textContent ?? '').trim().slice(0, 60),
      });
    }
    culpables.sort((a, b) => b.sale - a.sale);

    // Cuando TODO se sale lo mismo, el culpable no es el que se sale sino el que
    // MIDE de mas y estira a su contenedor. Se busca el mas profundo que exceda
    // el viewport: sus ancestros son anchos "de arrastre".
    const anchos = [];
    const walk = (el, prof) => {
      const r = el.getBoundingClientRect();
      if (r.width > ancho + 1) {
        const hijoAncho = [...el.children].some((c) => c.getBoundingClientRect().width > ancho + 1);
        if (!hijoAncho) {
          anchos.push({
            prof,
            mide: Math.round(r.width),
            tag: el.tagName.toLowerCase(),
            clase: (el.getAttribute('class') ?? '').slice(0, 110),
            texto: (el.textContent ?? '').trim().slice(0, 55),
          });
        }
      }
      for (const c of el.children) walk(c, prof + 1);
    };
    walk(document.body, 0);
    anchos.sort((a, b) => b.prof - a.prof);

    return { exceso, culpables: culpables.slice(0, 3), anchos: anchos.slice(0, 4) };
  });

const { data: metodos } = await createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  .from('payment_methods').select('id, name').eq('user_id', sesion.user.id);
const visa = metodos?.find((m) => m.name === 'Visa Galicia');
const mp = metodos?.find((m) => m.name === 'Mercado Pago');

const pantallas = [
  ['Inicio', '/'],
  ['Movimientos', '/movimientos'],
  ['Compromisos', '/compromisos'],
  ['Objetivos', '/objetivos'],
  ['Medios de pago', '/ajustes/medios'],
  ['Detalle · tarjeta', `/ajustes/medios/${visa?.id}`],
  ['Detalle · cuenta', `/ajustes/medios/${mp?.id}`],
];

let conProblema = 0;
for (const [nombre, ruta] of pantallas) {
  if (ruta.includes('undefined')) { console.log(`— ${nombre}: sin id, salteada`); continue; }
  // 'domcontentloaded' y no 'networkidle': la app mantiene conexiones abiertas
  // (store, chat) y networkidle se cuelga.
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  // Guard imprescindible: una pagina que NO cargo no tiene desborde, asi que sin
  // esto el script reporta verde justo cuando no midio nada. Paso de verdad: un
  // `next start` viejo quedo ocupando el puerto, el nuevo murio con EADDRINUSE, y
  // el zombie servia un .next/ ya sobrescrito -> todos los chunks 404 y "7 de 7 ✓".
  const cargo = await page.evaluate(() => {
    const t = document.body.innerText ?? '';
    return t.length > 120 && !/couldn.t load|Application error|Internal Server Error/i.test(t);
  });
  if (!cargo) {
    conProblema++;
    console.log(`
✗ ${nombre} — LA PAGINA NO CARGO (${ruta}). No se midio nada.`);
    continue;
  }

  const { exceso, culpables, anchos } = await medir();
  if (exceso <= 0) {
    console.log(`✓ ${nombre}`);
    continue;
  }
  conProblema++;
  console.log(`\n✗ ${nombre} — se sale ${exceso}px  (${ruta})`);
  for (const c of culpables) {
    console.log(`    se sale +${c.sale}px  <${c.tag}> "${c.texto}"`);
  }
  if (anchos?.length) {
    console.log(`  quien MIDE de mas (el que estira al contenedor):`);
    for (const a of anchos) {
      console.log(`    ${a.mide}px  <${a.tag}> "${a.texto}"`);
      console.log(`           class="${a.clase}"`);
    }
  }
  console.log('');
}

await browser.close();
console.log(conProblema === 0 ? '\nSin desborde horizontal en 390px.' : `\n${conProblema} pantalla(s) con desborde.`);
process.exit(conProblema === 0 ? 0 : 1);
