/**
 * Gate de navegador de "mover una compra al resumen vecino" (plan
 * 2026-09-02-mover-al-resumen-vecino, Task 5). Verifica en el DOM, no por
 * captura: una captura no distingue "la fila desapareció" de "la fila
 * desapareció y el total de al lado no subió lo mismo que bajó el otro".
 *
 * Corre sobre la Visa Galicia irregular que siembra scripts/seed-escenarios-tarjeta.mjs
 * (ciclos jun..oct materializados). Además siembra, acá mismo (idempotente, por
 * descripción marcada "[gate-mover]"), lo que ese escenario no trae:
 *   - una COMPRA SUELTA en el resumen vigente (septiembre), para el ida y vuelta de los
 *     asserts 1/2/6;
 *   - un PLAN DE 3 CUOTAS (jul/ago/sep) para los asserts 3 (mover una cuota corre las
 *     posteriores, no las anteriores), 8 (el upsert actualiza, no inserta), 9 (mover una
 *     cuota hacia ATRÁS) y 10 (el destino que ya tiene la cuota previa se rechaza);
 *   - una MENSUALIDAD POSTEADA (recurring_plan_id de la Netflix del demo) y un REINTEGRO,
 *     los dos en julio, para el assert 4 (no ofrecen "Mover a otro resumen");
 *   - una compra suelta en el resumen más VIEJO (junio) y otra en el más NUEVO que
 *     exista en el momento de correr (no necesariamente octubre: el sync de fondo
 *     puede haber materializado uno o dos meses más allá, ver el comentario junto a
 *     `cUltimo`), para el assert 5 (en el extremo sólo se ofrece una dirección).
 *
 * Uso (contra DEV, con el build de producción sirviendo):
 *   npm run seed:demo
 *   node scripts/seed-escenarios-tarjeta.mjs
 *   npm run build && npx next start -p 3100
 *   VERIFY_BASE_URL=http://localhost:3100 node scripts/verificar-mover-resumen.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
// Mismo guard duro que verificar-detalle-resumen.mjs / los seeders: el ref de
// producción está hardcodeado como prohibido -- comparar contra una var del mismo
// .env.local que define el destino no protege nada (lección del 25-ago).
const REF_PROD = 'mkkgdjxaotgimqwhyesx';
if (new URL(URL_).hostname.split('.')[0] === REF_PROD) {
  console.error(`ABORTADO: la URL de Supabase apunta a PRODUCCIÓN (${REF_PROD}).`);
  process.exit(1);
}
const BASE = process.env.VERIFY_BASE_URL ?? 'http://localhost:3100';

// Misma resolucion que los otros gates (chrome-win64, no chrome-win).
function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const dirs = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort();
  if (!dirs.length) { console.error('No hay Chromium en ms-playwright.'); process.exit(1); }
  return join(base, dirs.at(-1), 'chrome-win64', 'chrome.exe');
}

const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

// ═══════════════════════════════════════════════════════════════════════
// Setup: el demo, la Visa Galicia, sus ciclos materializados
// ═══════════════════════════════════════════════════════════════════════
const { data: lista, error: eList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (eList) { console.error('listUsers:', eList.message); process.exit(1); }
const demo = lista.users.find((u) => u.email === env.DEMO_USER_EMAIL);
if (!demo) { console.error(`No existe ${env.DEMO_USER_EMAIL}. Corré antes: npm run seed:demo`); process.exit(1); }
const UID = demo.id;

const { data: metodos, error: eMetodos } = await admin.from('payment_methods').select('*').eq('user_id', UID);
if (eMetodos) { console.error('leyendo payment_methods:', eMetodos.message); process.exit(1); }
const visa = metodos.find((m) => m.name === 'Visa Galicia');
if (!visa) { console.error('No encontré la Visa Galicia del demo. ¿Corriste seed-escenarios-tarjeta.mjs?'); process.exit(1); }

// ═══════════════════════════════════════════════════════════════════════
// Sesión del demo -> cookies @supabase/ssr (mismo formato que los otros scripts).
// Se arma ACÁ, antes de leer los ciclos, porque el primer `fetchAllData()` del
// cliente dispara `syncAutomaticRecurringCharges` -- que materializa ciclos de
// TODA tarjeta configurada en la ventana [hoy-1 mes, hoy+2 meses] (CLAUDE.md).
// Con "hoy" en septiembre eso agrega OCTUBRE Y NOVIEMBRE de fondo, más allá de
// los jun..oct que siembra seed-escenarios-tarjeta.mjs -- si se lee credit_card_cycles
// ANTES de que el navegador cargue una vez, octubre parece el último resumen y no
// lo es: el assert 5 (nada de "siguiente" en el último) sale falso negativo, no por
// un bug de esta feature sino por leer el mundo antes de que se estabilice.
// ═══════════════════════════════════════════════════════════════════════
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

// Warm-up: una carga cualquiera de la pantalla de detalle alcanza para que
// `fetchAllData` corra el sync una vez y los ciclos de fondo (si faltan) queden
// materializados -- get-or-create, así que repetirlo más adelante no agrega nada más.
await page.goto(`${BASE}/ajustes/medios/${visa.id}`, { waitUntil: 'networkidle' });
if (page.url().includes('/login')) { console.error('Redirigido a /login: la cookie no sirvió.'); process.exit(1); }
await page.waitForSelector('[data-testid="total-resumen"]');
await page.waitForTimeout(500);

const { data: ciclosRaw, error: eCiclos } = await admin
  .from('credit_card_cycles').select('*').eq('payment_method_id', visa.id).order('closing_date', { ascending: true });
if (eCiclos) { console.error('leyendo credit_card_cycles:', eCiclos.message); process.exit(1); }
if (!ciclosRaw || ciclosRaw.length < 5) {
  console.error(`La Visa Galicia tiene ${ciclosRaw?.length ?? 0} resúmenes materializados, necesito >=5. Corré: node scripts/seed-escenarios-tarjeta.mjs`);
  process.exit(1);
}
// jun, jul, ago, sep, oct -- por posición, ascendente por closing_date (igual que
// ciclosDeMetodo): los primeros cuatro índices son estables aunque el sync haya
// agregado más resúmenes al final. `cUltimo` es el ÚLTIMO que exista AHORA -- oct
// si el sync no agregó nada, o lo que haya agregado (nov, típicamente) si sí --
// y es el que hace falta para el assert 5 del extremo "de verdad" más nuevo.
const [cJun, cJul, cAgo, cSep, cOct] = ciclosRaw;
const cUltimo = ciclosRaw[ciclosRaw.length - 1];

const { data: cats, error: eCats } = await admin.from('categories').select('id, name, type').eq('user_id', UID);
if (eCats) { console.error('leyendo categories:', eCats.message); process.exit(1); }
const catExpense = cats.find((c) => c.type === 'expense')?.id;
const catIncome = cats.find((c) => c.type === 'income')?.id;
if (!catExpense || !catIncome) { console.error('Al demo le faltan categorías de expense/income.'); process.exit(1); }

const { data: recurring, error: eRec } = await admin
  .from('recurring_plans').select('*').eq('user_id', UID).eq('payment_method_id', visa.id);
if (eRec) { console.error('leyendo recurring_plans:', eRec.message); process.exit(1); }
const netflix = recurring.find((r) => r.description === 'Netflix');
if (!netflix) { console.error('El demo no tiene la mensualidad Netflix en la Visa Galicia.'); process.exit(1); }

// ═══════════════════════════════════════════════════════════════════════
// Siembra idempotente, marcada "[gate-mover]": se borra lo sembrado antes (por
// descripción) y se recrea, así que cada corrida arranca del mismo estado conocido.
// ═══════════════════════════════════════════════════════════════════════
const MARCA = '[gate-mover]';
const { error: eDelTx } = await admin.from('transactions').delete().eq('user_id', UID).like('description', `%${MARCA}%`);
if (eDelTx) { console.error('limpiando transacciones previas:', eDelTx.message); process.exit(1); }
const { error: eDelPlan } = await admin.from('installment_plans').delete().eq('user_id', UID).like('description', `%${MARCA}%`);
if (eDelPlan) { console.error('limpiando installment_plans previos:', eDelPlan.message); process.exit(1); }

const DESC_COMPRA = `Compra suelta ${MARCA}`;
const DESC_JUN = `Compra borde primero ${MARCA}`;
const DESC_ULTIMO = `Compra borde último ${MARCA}`;
const DESC_MENSUALIDAD = `Netflix ${MARCA}`;
const DESC_REINTEGRO = `Reintegro ${MARCA}`;
const DESC_PLAN = `Plan cuotas ${MARCA}`;
const cuotaDesc = (i, n) => `${DESC_PLAN} (${i}/${n})`;

const antes = (iso, dias) => { const d = new Date(iso); d.setDate(d.getDate() - dias); return d.toISOString().slice(0, 10); };

const MONTO_COMPRA = 55000;
const MONTO_CUOTA = 30000;

const gasto = (over) => ({
  id: randomUUID(), user_id: UID, type: 'expense', payment_method_id: visa.id, category_id: catExpense,
  ...over,
});

const filasIniciales = [
  gasto({ description: DESC_COMPRA, amount: MONTO_COMPRA, cycle_id: cSep.id, date: cSep.due_date, purchase_date: antes(cSep.closing_date, 3) }),
  gasto({ description: DESC_JUN, amount: 12345, cycle_id: cJun.id, date: cJun.due_date, purchase_date: antes(cJun.closing_date, 3) }),
  gasto({ description: DESC_ULTIMO, amount: 23456, cycle_id: cUltimo.id, date: cUltimo.due_date, purchase_date: antes(cUltimo.closing_date, 3) }),
  gasto({ description: DESC_MENSUALIDAD, amount: netflix.amount, cycle_id: cJul.id, date: cJul.due_date, recurring_plan_id: netflix.id }),
  { id: randomUUID(), user_id: UID, type: 'income', payment_method_id: visa.id, category_id: catIncome,
    description: DESC_REINTEGRO, amount: 8000, cycle_id: cJul.id, date: cJul.due_date },
];
const { error: eInsTx } = await admin.from('transactions').insert(filasIniciales);
if (eInsTx) { console.error('insertando transacciones del gate:', eInsTx.message); process.exit(1); }

// Plan de 3 cuotas: (1/3) en julio -- NUNCA se toca --, (2/3) en agosto -- la tocada --,
// (3/3) en septiembre. Mover (2/3) "siguiente" corre (2/3)->sep y (3/3)->oct.
const plan = { id: randomUUID(), user_id: UID, description: DESC_PLAN, total_amount: MONTO_CUOTA * 3,
  installments_count: 3, purchase_date: antes(cJul.closing_date, 10), category_id: catExpense, payment_method_id: visa.id };
const { error: eInsPlan } = await admin.from('installment_plans').insert(plan);
if (eInsPlan) { console.error('insertando installment_plan del gate:', eInsPlan.message); process.exit(1); }
const cuotas = [
  gasto({ description: cuotaDesc(1, 3), amount: MONTO_CUOTA, cycle_id: cJul.id, date: cJul.due_date, installment_plan_id: plan.id }),
  gasto({ description: cuotaDesc(2, 3), amount: MONTO_CUOTA, cycle_id: cAgo.id, date: cAgo.due_date, installment_plan_id: plan.id }),
  gasto({ description: cuotaDesc(3, 3), amount: MONTO_CUOTA, cycle_id: cSep.id, date: cSep.due_date, installment_plan_id: plan.id }),
];
const { error: eInsCuotas } = await admin.from('transactions').insert(cuotas);
if (eInsCuotas) { console.error('insertando cuotas del gate:', eInsCuotas.message); process.exit(1); }

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

const main = () => page.locator('main').last();
const totalDe = () => page.locator('[data-testid="total-resumen"]').innerText();

/** "$217.450,00" (es-AR) -> 217450. Sólo se usa sobre totales que sabemos > 0 en ARS. */
function parsearMonto(texto) {
  const limpio = texto.replace(/[^0-9.,]/g, '');
  return parseFloat(limpio.replace(/\./g, '').replace(',', '.'));
}

async function irAResumen(cycleId) {
  await page.goto(`${BASE}/ajustes/medios/${visa.id}?resumen=${cycleId}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="total-resumen"]');
  await page.waitForTimeout(400);
}

/** La fila (el div "justify-between" que arma `Fila`) que contiene esta descripción exacta. */
const filaRow = (desc) => main().getByText(desc, { exact: true }).first()
  .locator('xpath=ancestor::div[contains(@class,"justify-between")][1]');

/** Abre el menú de una fila y el diálogo de mover; deja el diálogo VISIBLE, sin elegir nada. */
async function abrirDialogoDeMover(desc) {
  await filaRow(desc).getByRole('button', { name: 'Más opciones' }).click();
  await page.getByRole('button', { name: 'Mover a otro resumen' }).click();
  const dialogo = page.locator('[data-slot="dialog-content"]').filter({ hasText: /vence|no hay otro resumen/i });
  await dialogo.waitFor({ state: 'visible' });
  return dialogo;
}

/** Elige el vecino "anterior" o "siguiente" dentro de un diálogo ya abierto (ContenidoMoverAlResumen
 * arma siempre [anterior?, siguiente?], en ese orden) y espera a que el diálogo se cierre --
 * `elegir()` en el componente primero `await`ea la server action y recién después cierra. */
async function elegirVecino(dialogo, direccion) {
  const botones = dialogo.getByRole('button', { name: /vence/i });
  const n = await botones.count();
  const idx = direccion === 'anterior' ? 0 : n - 1;
  await botones.nth(idx).click();
  await dialogo.waitFor({ state: 'hidden' });
}

async function moverFila(desc, direccion) {
  const dialogo = await abrirDialogoDeMover(desc);
  await elegirVecino(dialogo, direccion);
}

// ═══════════════════════════════════════════════════════════════════════
// Entrar por la lista y aterrizar en el detalle de la Visa Galicia (sin ?resumen:
// cae al vigente, septiembre en este escenario).
// ═══════════════════════════════════════════════════════════════════════
await page.goto(`${BASE}/ajustes/medios`, { waitUntil: 'networkidle' });
if (page.url().includes('/login')) { console.error('Redirigido a /login: la cookie no sirvió.'); process.exit(1); }
await page.getByText('Visa Galicia', { exact: true }).first().click();
await page.waitForURL(/\/ajustes\/medios\/[^/?]+/);
await page.waitForSelector('[data-testid="total-resumen"]');
await page.waitForTimeout(500);

const alturas = [];

// ═══════════════════════════════════════════════════════════════════════
// 5. En el primer resumen (junio) no se ofrece "anterior"; en el último --
// `cUltimo`, no necesariamente octubre: el sync de fondo pudo haber
// materializado uno o dos meses más allá (ver el comentario donde se calcula) --
// no se ofrece "siguiente". Se aprovecha para medir el botón "Vence" (assert 7)
// sin mutar nada -- se cierra con Escape, sin elegir.
// ═══════════════════════════════════════════════════════════════════════
await irAResumen(cJun.id);
let nJun;
{
  const dialogo = await abrirDialogoDeMover(DESC_JUN);
  const botones = dialogo.getByRole('button', { name: /vence/i });
  nJun = await botones.count();
  alturas.push(await alturaMin44(botones.first()));
  await page.keyboard.press('Escape');
  await dialogo.waitFor({ state: 'hidden' });
}

await irAResumen(cUltimo.id);
let nUltimo;
{
  const dialogo = await abrirDialogoDeMover(DESC_ULTIMO);
  const botones = dialogo.getByRole('button', { name: /vence/i });
  nUltimo = await botones.count();
  await page.keyboard.press('Escape');
  await dialogo.waitFor({ state: 'hidden' });
}

check('5. en el primer resumen no se ofrece "anterior"; en el último no se ofrece "siguiente"',
  nJun === 1 && nUltimo === 1, `opciones en el primero=${nJun}, opciones en el último (${cUltimo.closing_date})=${nUltimo}`);

// ═══════════════════════════════════════════════════════════════════════
// 4. Una mensualidad posteada y un reintegro no ofrecen "Mover a otro resumen"
// (los dos viven en julio, que tiene vecinos a los dos lados: si el menú no
// aparece ahí, es por el motivo, no por falta de vecino).
// ═══════════════════════════════════════════════════════════════════════
await irAResumen(cJul.id);
const sinMenuMensualidad = await filaRow(DESC_MENSUALIDAD).getByRole('button', { name: 'Más opciones' }).count();
const sinMenuReintegro = await filaRow(DESC_REINTEGRO).getByRole('button', { name: 'Más opciones' }).count();
check('4. una mensualidad posteada y un reintegro no ofrecen "Mover a otro resumen"',
  sinMenuMensualidad === 0 && sinMenuReintegro === 0,
  `menú mensualidad=${sinMenuMensualidad} menú reintegro=${sinMenuReintegro}`);

// ═══════════════════════════════════════════════════════════════════════
// 1 + 2. Mover la compra suelta de septiembre (vigente) al anterior (agosto):
// la fila cambia de resumen, los dos totales cambian en consecuencia, y
// purchase_date no cambió.
// ═══════════════════════════════════════════════════════════════════════
await irAResumen(cSep.id);
const totalSepAntes = parsearMonto(await totalDe());
const sepTeniaLaFilaAntes = await filaRow(DESC_COMPRA).count();

await irAResumen(cAgo.id);
const totalAgoAntes = parsearMonto(await totalDe());

const { data: filaAntesDeMover, error: eFilaAntesDeMover } = await admin
  .from('transactions').select('*').eq('user_id', UID).eq('description', DESC_COMPRA).single();
if (eFilaAntesDeMover) { console.error('leyendo la compra suelta sembrada:', eFilaAntesDeMover.message); process.exit(1); }
const purchaseDateOriginal = filaAntesDeMover.purchase_date;

await irAResumen(cSep.id);
{
  const dialogo = await abrirDialogoDeMover(DESC_COMPRA);
  const botonAnterior = dialogo.getByRole('button', { name: /vence/i }).first();
  alturas.push(await alturaMin44(botonAnterior));
  await elegirVecino(dialogo, 'anterior');
}

const { data: filaTrasMover, error: eFilaTrasMover } = await admin
  .from('transactions').select('*').eq('id', filaAntesDeMover.id).single();
if (eFilaTrasMover) { console.error('releyendo la transacción tras mover:', eFilaTrasMover.message); process.exit(1); }

check('2. la fecha de compra (purchase_date) no cambió al mover',
  filaTrasMover.purchase_date === purchaseDateOriginal && filaTrasMover.cycle_id === cAgo.id,
  `purchase_date antes=${purchaseDateOriginal} después=${filaTrasMover.purchase_date}, cycle_id=${filaTrasMover.cycle_id}`);

await irAResumen(cSep.id);
const sepTieneLaFilaDespues = await filaRow(DESC_COMPRA).count();
const totalSepDespues = parsearMonto(await totalDe());

await irAResumen(cAgo.id);
const agoTieneLaFilaDespues = await filaRow(DESC_COMPRA).count();
const totalAgoDespues = parsearMonto(await totalDe());

check('1. mover una compra al resumen anterior: la fila cambia de resumen y los dos totales cambian en consecuencia',
  sepTeniaLaFilaAntes === 1 && sepTieneLaFilaDespues === 0 && agoTieneLaFilaDespues === 1 &&
  Math.round(totalSepDespues) === Math.round(totalSepAntes - MONTO_COMPRA) &&
  Math.round(totalAgoDespues) === Math.round(totalAgoAntes + MONTO_COMPRA),
  `sep: ${totalSepAntes}->${totalSepDespues} (esperado ${totalSepAntes - MONTO_COMPRA}); ago: ${totalAgoAntes}->${totalAgoDespues} (esperado ${totalAgoAntes + MONTO_COMPRA})`);

// ═══════════════════════════════════════════════════════════════════════
// 6. Mover de vuelta (agosto -> siguiente -> septiembre) deja todo como estaba.
// ═══════════════════════════════════════════════════════════════════════
await irAResumen(cAgo.id);
await moverFila(DESC_COMPRA, 'siguiente');

await irAResumen(cSep.id);
const sepTieneLaFilaVuelta = await filaRow(DESC_COMPRA).count();
const totalSepVuelta = parsearMonto(await totalDe());

await irAResumen(cAgo.id);
const agoTieneLaFilaVuelta = await filaRow(DESC_COMPRA).count();
const totalAgoVuelta = parsearMonto(await totalDe());

check('6. mover de vuelta deja todo como estaba',
  sepTieneLaFilaVuelta === 1 && agoTieneLaFilaVuelta === 0 &&
  Math.round(totalSepVuelta) === Math.round(totalSepAntes) &&
  Math.round(totalAgoVuelta) === Math.round(totalAgoAntes),
  `sep: ${totalSepVuelta} (esperado ${totalSepAntes}); ago: ${totalAgoVuelta} (esperado ${totalAgoAntes})`);

// ═══════════════════════════════════════════════════════════════════════
// 3 + 8. Mover la cuota (2/3), de agosto, "siguiente": corre (2/3)->sep y
// (3/3)->oct; (1/3), en julio, no se toca. El diálogo avisa "cuotas 2 a 3".
// El assert 8 es el más importante: el conteo de transacciones de la tarjeta
// ANTES y DESPUÉS de este mismo movimiento tiene que ser IDÉNTICO -- si el
// upsert insertara en vez de actualizar, acá aparecería una fila de más.
// ═══════════════════════════════════════════════════════════════════════
const { count: txsAntes, error: eCountAntes } = await admin
  .from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', UID).eq('payment_method_id', visa.id);
if (eCountAntes) { console.error('contando transacciones (antes):', eCountAntes.message); process.exit(1); }

await irAResumen(cAgo.id);
let textoDialogoCuota = '';
{
  const dialogo = await abrirDialogoDeMover(cuotaDesc(2, 3));
  textoDialogoCuota = await dialogo.innerText();
  const botonSiguiente = dialogo.getByRole('button', { name: /vence/i }).last();
  alturas.push(await alturaMin44(botonSiguiente));
  await elegirVecino(dialogo, 'siguiente');
}

const { count: txsDespues, error: eCountDespues } = await admin
  .from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', UID).eq('payment_method_id', visa.id);
if (eCountDespues) { console.error('contando transacciones (después):', eCountDespues.message); process.exit(1); }

check('8. el upsert ACTUALIZA y no inserta: la cantidad de transacciones de la tarjeta no cambió al mover una cuota',
  txsAntes === txsDespues, `antes=${txsAntes} después=${txsDespues}`);

await irAResumen(cJul.id);
const cuota1SigueEnJulio = await filaRow(cuotaDesc(1, 3)).count();

await irAResumen(cAgo.id);
const cuota2SalioDeAgosto = await filaRow(cuotaDesc(2, 3)).count();

await irAResumen(cSep.id);
const cuota2EntroASeptiembre = await filaRow(cuotaDesc(2, 3)).count();

await irAResumen(cOct.id);
const cuota3EntroAOctubre = await filaRow(cuotaDesc(3, 3)).count();

check('3. mover una cuota: el diálogo avisa cuántas mueve, las posteriores se corren, las anteriores no',
  /cuotas 2 a 3/i.test(textoDialogoCuota) &&
  cuota1SigueEnJulio === 1 && cuota2SalioDeAgosto === 0 && cuota2EntroASeptiembre === 1 && cuota3EntroAOctubre === 1,
  `texto="${textoDialogoCuota.replace(/\s+/g, ' ').slice(0, 80)}", cuota1@jul=${cuota1SigueEnJulio}, cuota2@ago=${cuota2SalioDeAgosto}, cuota2@sep=${cuota2EntroASeptiembre}, cuota3@oct=${cuota3EntroAOctubre}`);

// ═══════════════════════════════════════════════════════════════════════
// 7. Los controles (kebab de una fila + botones "Vence" del diálogo) miden >=44px.
// ═══════════════════════════════════════════════════════════════════════
await irAResumen(cJul.id);
alturas.push(await alturaMin44(filaRow(cuotaDesc(1, 3)).getByRole('button', { name: 'Más opciones' })));

check('7. los controles del menú y del diálogo de mover miden >=44px de alto', alturas.every(Boolean), `alturas: ${alturas.join(', ')}`);

// ═══════════════════════════════════════════════════════════════════════
// 9. Mover una cuota hacia ATRÁS. Hasta la fix wave el gate sólo movía cuotas
// hacia adelante (assert 3) y el "de vuelta" del assert 6 era sobre una compra
// suelta -- justo la dirección donde vivía C1. Tras el assert 3 el plan quedó en
// sep/oct (la (1/3) sigue en julio), así que mover la (1/3) al anterior corre el
// plan entero a jun/jul/ago: la cuota más vieja SÍ puede ir para atrás, porque el
// resumen destino no tiene ninguna cuota de este plan.
// ═══════════════════════════════════════════════════════════════════════
await irAResumen(cJul.id);
await moverFila(cuotaDesc(1, 3), 'anterior');

const dondeQuedo = async (desc) => {
  const { data, error } = await admin
    .from('transactions').select('cycle_id').eq('user_id', UID).eq('description', desc).single();
  if (error) { console.error(`releyendo ${desc}:`, error.message); process.exit(1); }
  return data.cycle_id;
};

const [q1Atras, q2Atras, q3Atras] = await Promise.all([
  dondeQuedo(cuotaDesc(1, 3)), dondeQuedo(cuotaDesc(2, 3)), dondeQuedo(cuotaDesc(3, 3)),
]);

check('9. mover la cuota más vieja hacia ATRÁS corre el plan entero un resumen para atrás',
  q1Atras === cJun.id && q2Atras === cJul.id && q3Atras === cAgo.id,
  `(1/3)=${q1Atras === cJun.id ? 'jun' : q1Atras}, (2/3)=${q2Atras === cJul.id ? 'jul' : q2Atras}, (3/3)=${q3Atras === cAgo.id ? 'ago' : q3Atras}`);

// ═══════════════════════════════════════════════════════════════════════
// 10. C1: mover una cuota al resumen que YA tiene la cuota previa del plan se
// rechaza. Dos cuotas del mismo plan en un mismo resumen es el estado que hacía
// divergir las dos cuentas de "qué filas se mueven" -- y del que salía, según el
// orden del heap, o un error falso o el arrastre de una cuota nunca tocada.
// El diálogo NO se cierra (la action devolvió error) y en la base no cambió nada.
// ═══════════════════════════════════════════════════════════════════════
await irAResumen(cJul.id);
let dialogoSigueAbierto = false;
{
  const dialogo = await abrirDialogoDeMover(cuotaDesc(2, 3));
  await dialogo.getByRole('button', { name: /vence/i }).first().click(); // el "anterior"
  await page.waitForTimeout(1200);
  dialogoSigueAbierto = await dialogo.isVisible();
  await page.keyboard.press('Escape');
}

const [q1Tras, q2Tras, q3Tras] = await Promise.all([
  dondeQuedo(cuotaDesc(1, 3)), dondeQuedo(cuotaDesc(2, 3)), dondeQuedo(cuotaDesc(3, 3)),
]);

check('10. mover una cuota al resumen que ya tiene la cuota previa se rechaza y no escribe nada',
  dialogoSigueAbierto && q1Tras === q1Atras && q2Tras === q2Atras && q3Tras === q3Atras,
  `diálogo abierto=${dialogoSigueAbierto}, cycle_ids sin cambios=${q1Tras === q1Atras && q2Tras === q2Atras && q3Tras === q3Atras}`);

await browser.close();

const fallaron = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - fallaron.length}/${checks.length}`);
for (const f of fallaron) console.error(`FALLO: ${f.nombre}${f.detalle ? ` -- ${f.detalle}` : ''}`);
process.exit(fallaron.length ? 1 : 0);
