/**
 * Gate de navegador de la pantalla de detalle por resumen (Task 8, plan
 * 2026-09-02-detalle-por-resumen). Verifica en el DOM, no por captura: una
 * captura no distingue "el total dice 20.000" de "el total dice 20.000 pero
 * Compromisos dice 24.000".
 *
 * Corre sobre la Visa Galicia irregular que siembra scripts/seed-escenarios-tarjeta.mjs
 * (jun..oct, agosto vencido sin pagar, septiembre vigente y todavía sin cerrar -- ver el
 * encabezado de ese script). Además siembra, si hace falta, UN medio personal: el demo no
 * trae ninguno y el assert 7 lo necesita. Se hace acá mismo (upsert por nombre, idempotente)
 * en vez de tocar seed-escenarios-tarjeta.mjs, que no es parte del alcance de esta task.
 *
 * Uso (contra DEV, con el build de producción sirviendo):
 *   npm run seed:demo
 *   node scripts/seed-escenarios-tarjeta.mjs
 *   npm run build && npx next start -p 3100
 *   VERIFY_BASE_URL=http://localhost:3100 node scripts/verificar-detalle-resumen.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
// Mismo guard duro que el seeder y que verificar-escenarios-tarjeta.mjs: el ref de
// producción está hardcodeado como prohibido (comparar contra una var del mismo
// .env.local que define el destino no protege nada -- lección del 25-ago).
const REF_PROD = 'mkkgdjxaotgimqwhyesx';
if (new URL(URL_).hostname.split('.')[0] === REF_PROD) {
  console.error(`ABORTADO: la URL de Supabase apunta a PRODUCCIÓN (${REF_PROD}).`);
  process.exit(1);
}
const BASE = process.env.VERIFY_BASE_URL ?? 'http://localhost:3100';

// Misma resolucion que capture-demo.mjs / verificar-escenarios-tarjeta.mjs (chrome-win64,
// no chrome-win).
function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const dirs = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort();
  if (!dirs.length) { console.error('No hay Chromium en ms-playwright.'); process.exit(1); }
  return join(base, dirs.at(-1), 'chrome-win64', 'chrome.exe');
}

const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

// ---- demo: usuario, medios de pago
const { data: lista, error: eList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (eList) { console.error('listUsers:', eList.message); process.exit(1); }
const demo = lista.users.find((u) => u.email === env.DEMO_USER_EMAIL);
if (!demo) { console.error(`No existe ${env.DEMO_USER_EMAIL}. Corré antes: npm run seed:demo`); process.exit(1); }
const UID = demo.id;

const { data: metodos, error: eMetodos } = await admin.from('payment_methods').select('*').eq('user_id', UID);
if (eMetodos) { console.error('leyendo payment_methods:', eMetodos.message); process.exit(1); }
const visa = metodos.find((m) => m.name === 'Visa Galicia');
if (!visa) { console.error('No encontré la Visa Galicia del demo. ¿Corriste seed-escenarios-tarjeta.mjs?'); process.exit(1); }
const debito = metodos.find((m) => m.type === 'debit' && !m.is_personal);
if (!debito) { console.error('El demo no tiene una cuenta de débito.'); process.exit(1); }

let personal = metodos.find((m) => m.is_personal);
if (!personal) {
  const { data, error } = await admin
    .from('payment_methods')
    .insert({ user_id: UID, name: '[gate] Deuda con Juan', type: 'debit', is_personal: true })
    .select('*')
    .single();
  if (error) { console.error('creando medio personal:', error.message); process.exit(1); }
  personal = data;
  console.log('Sembrado un medio personal para el assert 7 (el demo no traía ninguno).');
}

// ---- sesión del demo → cookies @supabase/ssr (mismo formato que los otros scripts)
const { data: auth, error: eAuth } = await anon.auth.signInWithPassword({
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

const browser = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
await ctx.addCookies(cookies.map((c) => ({ ...c, url: BASE })));
await ctx.addInitScript(() => { try { localStorage.setItem('chanchito-tema', 'dia'); } catch {} });
const page = await ctx.newPage();

const checks = [];
const check = (nombre, ok, detalle = '') => {
  checks.push({ nombre, ok, detalle });
  console.log(`${ok ? '  OK  ' : '  MAL '} ${nombre}${detalle ? ` -- ${detalle}` : ''}`);
};

/** Botón medido en el DOM: la regla dura del proyecto es >=44px de alto. */
async function alturaMin44(locator) {
  const box = await locator.boundingBox();
  return (box?.height ?? 0) >= 43.5;
}

const totalDe = () => page.locator('[data-testid="total-resumen"]').innerText();
const resumenDeLaUrl = () => new URL(page.url()).searchParams.get('resumen');

/** Sondea totalDe() hasta que difiera de `anterior` o se acaben los intentos --
 * más robusto que un timeout fijo contra la navegación cliente (router.replace). */
async function esperarQueCambieElTotal(anterior, intentos = 20) {
  for (let i = 0; i < intentos; i++) {
    const actual = await totalDe();
    if (actual !== anterior) return actual;
    await page.waitForTimeout(200);
  }
  return totalDe();
}

// ═══════════════════════════════════════════════════════════════════════
// Entrar por la lista y aterrizar en el detalle de la Visa Galicia. Sin
// ?resumen todavía: el getter cae al resumen VIGENTE (septiembre, en este
// escenario -- cierra 20-sep, todavía no cerró).
// ═══════════════════════════════════════════════════════════════════════
await page.goto(`${BASE}/ajustes/medios`, { waitUntil: 'networkidle' });
if (page.url().includes('/login')) { console.error('Redirigido a /login: la cookie no sirvió.'); process.exit(1); }
await page.getByText('Visa Galicia', { exact: true }).first().click();
await page.waitForURL(/\/ajustes\/medios\/[^/?]+/);
await page.waitForSelector('[data-testid="total-resumen"]');
await page.waitForTimeout(500);

// El AppShell envuelve todo en su propio <main>; la pantalla de detalle abre OTRO
// adentro. .last() es el interno -- el contenido propio de la pantalla.
const main = () => page.locator('main').last().innerText();

// ---- 3. Un resumen con filas sin purchase_date muestra "Sin fecha de compra"
// El resumen vigente (septiembre) tiene una compra y una suscripción USD sembradas
// directo en Supabase sin purchase_date (seed-escenarios-tarjeta.mjs).
const textoInicial = await main();
if (process.env.DEBUG_GATE) console.log('---DEBUG textoInicial---\n' + textoInicial + '\n---FIN---');
check(
  '3. un resumen con filas sin fecha de compra muestra el bloque "Sin fecha de compra"',
  /Sin fecha de compra/.test(textoInicial),
);

// ---- 4. Un resumen futuro (que todavía no cerró) muestra "Proyectado" + el aviso
// El badge del estado es uppercase por CSS (text-transform): innerText() devuelve el
// texto tal como lo renderiza el navegador ("PROYECTADO"), no el string JS original
// ("Proyectado") -- de ahí el /i en todos los matches de texto con transform.
check(
  '4. el resumen vigente, que todavía no cerró, muestra "Proyectado" y el aviso',
  /proyectado/i.test(textoInicial) && /todavía no cerró/i.test(textoInicial),
);

// ---- 6. En una tarjeta NO aparecen "Costos fijos" ni "Mensualidades activas"
check(
  '6. en una tarjeta no aparecen "Costos fijos" ni "Mensualidades activas"',
  !/Costos fijos/i.test(textoInicial) && !/Mensualidades activas/i.test(textoInicial),
);

// ---- 8. Los controles del selector miden >=44px
const btnAnterior = page.getByRole('button', { name: 'Resumen anterior' });
const btnSiguiente = page.getByRole('button', { name: 'Resumen siguiente' });
const btnElegir = btnAnterior.locator('xpath=..').locator('button').nth(1);
const alturasOk = await Promise.all([
  alturaMin44(btnAnterior),
  alturaMin44(btnSiguiente),
  alturaMin44(btnElegir),
]);
check('8. los controles del selector (anterior / elegir / siguiente) miden >=44px', alturasOk.every(Boolean),
  `alturas: ${alturasOk.join(', ')}`);

// ═══════════════════════════════════════════════════════════════════════
// 1. Navegar al anterior y al siguiente cambia el total y la URL
// ═══════════════════════════════════════════════════════════════════════
const totalVigente = await totalDe();

await btnAnterior.click();
await page.waitForURL(/resumen=/);
const totalAnterior = await esperarQueCambieElTotal(totalVigente);
const urlTraeResumenAnterior = resumenDeLaUrl() !== null;
const idAgosto = resumenDeLaUrl(); // el resumen inmediatamente anterior al vigente (agosto, vencido)

const cambioAlAnterior = totalAnterior !== totalVigente && urlTraeResumenAnterior;

await btnSiguiente.click();
const totalTrasVolver = await esperarQueCambieElTotal(totalAnterior);
const cambioAlSiguiente = totalTrasVolver !== totalAnterior && resumenDeLaUrl() !== null;

check('1. navegar al resumen anterior y al siguiente cambia el total y la URL',
  cambioAlAnterior && cambioAlSiguiente,
  `vigente=${totalVigente} anterior=${totalAnterior} tras-volver=${totalTrasVolver}`);

// ═══════════════════════════════════════════════════════════════════════
// 2. El selector permite saltar a un resumen NO contiguo
// ═══════════════════════════════════════════════════════════════════════
await btnElegir.click();
const dialogo = page.locator('[data-slot="dialog-content"]');
await dialogo.waitFor({ state: 'visible' });
const filasDelPicker = dialogo.getByRole('button', { name: /vence/ });
const cantidadDeResumenes = await filasDelPicker.count();
// El resumen más viejo del picker (última fila: la lista se muestra más reciente
// primero) -- desde el vigente (septiembre), eso es al menos 3 resúmenes de
// distancia (agosto, julio, junio), nunca el inmediato anterior/siguiente.
await filasDelPicker.last().click();
await page.waitForFunction(() => !document.querySelector('[data-slot="dialog-content"]'));
// En este punto la pantalla volvió a mostrar el vigente (totalTrasVolver, septiembre)
// tras el Flujo 1; se espera que el total cambie DESDE ahí, no desde el de agosto.
await esperarQueCambieElTotal(totalTrasVolver);
const idNoContiguo = resumenDeLaUrl();
const dialogoCerrado = !(await dialogo.isVisible());

check('2. el selector permite saltar a un resumen no contiguo',
  cantidadDeResumenes >= 3 &&
  dialogoCerrado &&
  idNoContiguo !== null &&
  idNoContiguo !== idAgosto,
  `filas en el picker: ${cantidadDeResumenes}, saltó a resumen=${idNoContiguo}`);

// ═══════════════════════════════════════════════════════════════════════
// 5. El total de la pantalla es idéntico al que muestra /compromisos, para el
// MISMO resumen (agosto: vencido, sin pagar -- computePendingCreditCards lo
// devuelve como el ciclo anterior impago, y Compromisos lo card-ea aparte).
// ═══════════════════════════════════════════════════════════════════════
await page.goto(`${BASE}/ajustes/medios/${visa.id}?resumen=${idAgosto}`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="total-resumen"]');
await page.waitForTimeout(400);
const totalDetalleAgosto = await totalDe();

await page.goto(`${BASE}/compromisos`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const cardVencida = page.locator('.rounded-2xl').filter({ hasText: 'Visa Galicia' }).filter({ hasText: 'vencido' });
await cardVencida.waitFor({ state: 'visible' });
const totalCompromisosAgosto = await cardVencida.locator('[data-testid="total-resumen"]').innerText();

check('5. el total de la pantalla es idéntico al de /compromisos para el mismo resumen',
  totalDetalleAgosto === totalCompromisosAgosto,
  `detalle="${totalDetalleAgosto}" compromisos="${totalCompromisosAgosto}"`);

// ═══════════════════════════════════════════════════════════════════════
// 7. Una cuenta de débito y un medio personal abren la pantalla sin romperse,
// y ahí "Costos fijos" SÍ aparece.
// ═══════════════════════════════════════════════════════════════════════
await page.goto(`${BASE}/ajustes/medios/${debito.id}`, { waitUntil: 'networkidle' });
await page.locator('main').last().locator('h1').waitFor({ state: 'visible' });
await page.waitForTimeout(300);
const textoDebito = await main();
const debitoOk = new RegExp(debito.name).test(textoDebito) && /Costos fijos/i.test(textoDebito);

await page.goto(`${BASE}/ajustes/medios/${personal.id}`, { waitUntil: 'networkidle' });
await page.locator('main').last().locator('h1').waitFor({ state: 'visible' });
await page.waitForTimeout(300);
const textoPersonal = await main();
const personalOk = new RegExp(personal.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(textoPersonal)
  && /Costos fijos/i.test(textoPersonal);

check('7. una cuenta de débito y un medio personal abren la pantalla, con "Costos fijos"',
  debitoOk && personalOk,
  `débito(${debito.name})=${debitoOk} personal(${personal.name})=${personalOk}`);

await browser.close();

const fallaron = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - fallaron.length}/${checks.length}`);
for (const f of fallaron) console.error(`FALLO: ${f.nombre}${f.detalle ? ` -- ${f.detalle}` : ''}`);
process.exit(fallaron.length ? 1 : 0);
