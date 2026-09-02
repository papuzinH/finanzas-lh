/**
 * Gate visual + assertions de los escenarios de tarjeta en DEV.
 * Loguea al demo, entra al home y a compromisos, verifica en el DOM que el aviso
 * y los montos estén, y deja capturas. Se borra al terminar la sesión.
 *
 * Suma los cinco flujos de "declarar el resumen" (Plan 2, Task 10), contra la
 * Visa Galicia irregular que siembra scripts/seed-escenarios-tarjeta.mjs:
 *   1. Declarar desde la ficha (/ajustes/medios) -- corrige septiembre.
 *   2. Cambiar los días de la tarjeta -- re-fecha sólo los futuros estimados.
 *   3. El paso opcional al pagar, SIN tocarlo -- el próximo resumen sigue
 *      "generated". Es el assert que prueba el requisito central del spec:
 *      confirmar el pago nunca convierte una estimación en dato declarado.
 *   4. El paso opcional al pagar, tocándolo -- el próximo resumen queda
 *      "declared".
 *   5. El recordatorio del resumen ya cerrado, con "Ahora no" persistido en
 *      la base (no localStorage).
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

// Consola entera, desde el arranque: los warnings de accesibilidad de Radix (p.ej.
// "Missing Description") son dev-only y este gate corre contra un build de
// producción, así que además de mirar la consola se audita el DOM (aria-describedby)
// en cada diálogo que se abre más abajo -- esa es la verificación que no depende
// de NODE_ENV.
const consolaEntera = [];
page.on('console', (m) => consolaEntera.push({ type: m.type(), text: m.text() }));

/** Botón medido en el DOM: la regla dura del proyecto es >=44px. */
async function okBotonMin44(locator, nombre) {
  const box = await locator.boundingBox();
  ok((box?.height ?? 0) >= 43.5, `botón "${nombre}" >= 44px (mide ${box?.height?.toFixed(1) ?? 'null'})`);
}

/** El DialogContent/AlertDialogContent visible tiene una descripción accesible
 * de verdad: aria-describedby apunta a un elemento con texto, no a nada. */
async function okDescripcionAccesible(dialogLocator, nombre) {
  const descrita = await dialogLocator.evaluate((el) => {
    const id = el.getAttribute('aria-describedby');
    if (!id) return false;
    const desc = document.getElementById(id);
    return !!desc && desc.textContent.trim().length > 0;
  });
  ok(descrita, `"${nombre}" tiene descripción accesible (aria-describedby resuelve a texto)`);
}

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

// ══════════════════════════════════════════════════════════════════════════
// Los cinco flujos de "declarar el resumen" (Task 10), contra la Visa Galicia
// irregular sembrada por seed-escenarios-tarjeta.mjs (Escenario C).
// ══════════════════════════════════════════════════════════════════════════

// Misma aritmética de fechas que el seed: mesesDelta relativo a HOY, mismo
// mediodía local para esquivar sorpresas de TZ al serializar.
const HOY = new Date(); HOY.setHours(12, 0, 0, 0);
const mes = (mesesDelta, dia) => new Date(HOY.getFullYear(), HOY.getMonth() + mesesDelta, dia, 12);
const iso = (d) => d.toISOString().slice(0, 10);

const { data: visa, error: eVisa } = await supa.from('payment_methods').select('id').eq('name', 'Visa Galicia').single();
if (eVisa || !visa) { console.error('No encontré la Visa Galicia del demo:', eVisa?.message); process.exit(1); }
const visaId = visa.id;

/** El ciclo de Visa Galicia cuyo cierre cae en el mes `mesesDelta` (relativo a hoy).
 * `closing_date` es `date` en Postgres: PostgREST no acepta `like` sobre esa
 * columna ("operator does not exist: date ~~ unknown"), así que se filtra por
 * rango [primer día del mes, primer día del mes siguiente). */
async function ciclo(mesesDelta) {
  const desde = iso(mes(mesesDelta, 1));
  const hasta = iso(mes(mesesDelta + 1, 1));
  const { data, error } = await supa
    .from('credit_card_cycles')
    .select('*')
    .eq('payment_method_id', visaId)
    .gte('closing_date', desde)
    .lt('closing_date', hasta)
    .maybeSingle();
  if (error) { console.error('leyendo ciclo:', error.message); process.exit(1); }
  return data;
}

const dialogoAbierto = () => page.locator('[data-slot="dialog-content"]');
const alertaAbierta = () => page.locator('[data-slot="alert-dialog-content"]');
/** La Card (rounded-2xl) de Visa Galicia que además contiene `extra` en su texto. */
const cardVisa = (extra) => page.locator('.rounded-2xl').filter({ hasText: 'Visa Galicia' }).filter({ hasText: extra });

// ---- FLUJO 1: declarar desde la ficha ------------------------------------
console.log('\n--- FLUJO 1: declarar desde la ficha ---');
await page.goto(BASE + '/ajustes/medios', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const cicloSepAntes = await ciclo(0);
ok(cicloSepAntes?.source === 'generated', `septiembre arranca "generated" (es ${cicloSepAntes?.source})`);
const { count: txCicloAntes } = await supa
  .from('transactions').select('*', { count: 'exact', head: true }).eq('cycle_id', cicloSepAntes?.id);

const corregirBtn = page.getByRole('button', { name: 'Corregir fechas' });
await corregirBtn.waitFor({ state: 'visible' });
await okBotonMin44(corregirBtn, 'Corregir fechas');
await corregirBtn.click();

const dlg1 = dialogoAbierto();
await dlg1.waitFor({ state: 'visible' });
await okDescripcionAccesible(dlg1, 'Fechas del resumen (ficha)');

const nuevoCierreSep = iso(mes(0, 24));
const nuevoVencSep = iso(mes(1, 2));
await dlg1.locator('input[type="date"]').first().fill(nuevoCierreSep);
await dlg1.locator('input[type="date"]').nth(1).fill(nuevoVencSep);

const guardarFichaBtn = dlg1.getByRole('button', { name: 'Guardar' });
await okBotonMin44(guardarFichaBtn, 'Guardar (ficha)');
await guardarFichaBtn.click();
await page.waitForTimeout(1500);

const cicloSepDespues = await ciclo(0);
ok(cicloSepDespues?.source === 'declared', `septiembre quedó "declared" (es ${cicloSepDespues?.source})`);
ok(cicloSepDespues?.closing_date === nuevoCierreSep, `cierre corregido a ${nuevoCierreSep} (quedó ${cicloSepDespues?.closing_date})`);
ok(cicloSepDespues?.due_date === nuevoVencSep, `vencimiento corregido a ${nuevoVencSep} (quedó ${cicloSepDespues?.due_date})`);
ok(cicloSepDespues?.id === cicloSepAntes?.id, 'sigue siendo el MISMO resumen (update, no un resumen nuevo)');

const { count: txCicloDespues } = await supa
  .from('transactions').select('*', { count: 'exact', head: true }).eq('cycle_id', cicloSepAntes?.id);
ok(
  txCicloAntes === txCicloDespues && (txCicloAntes ?? 0) > 0,
  `transacciones del resumen sin cambios: ${txCicloAntes} antes, ${txCicloDespues} después (declarar no reasigna)`,
);

// ---- FLUJO 2: cambiar los días de la tarjeta -----------------------------
console.log('\n--- FLUJO 2: cambiar los días de la tarjeta ---');
const cicloOctAntes = await ciclo(1);
ok(cicloOctAntes?.source === 'generated', `octubre arranca "generated" (es ${cicloOctAntes?.source})`);

const visaCardFicha = cardVisa('Visa Galicia');
await visaCardFicha.getByRole('button', { name: 'Más opciones' }).click();
await page.getByRole('menuitem', { name: 'Editar' }).click();

const dlg2 = dialogoAbierto();
await dlg2.waitFor({ state: 'visible' });
// Este diálogo es previo a esta rama (edit-payment-method-dialog.tsx no es parte
// del File Structure de ninguna task del plan): se audita igual, porque el gate
// es sobre lo que se TOCA en este flujo, no sólo sobre archivos nuevos.
await okDescripcionAccesible(dlg2, 'Editar Medio de Pago');

await dlg2.locator('input[type="number"]').nth(1).fill('2'); // Día de vencimiento
const guardarCambiosBtn = dlg2.getByRole('button', { name: 'Guardar Cambios' });
await guardarCambiosBtn.click();
await page.waitForTimeout(1500);

const nuevoVencOct = iso(mes(2, 2)); // el vencimiento salta al mes siguiente (2 <= 20)
const cicloOctDespues = await ciclo(1);
ok(cicloOctDespues?.source === 'generated', 'octubre sigue "generated" tras editar los días (sigue siendo estimado)');
ok(cicloOctDespues?.due_date === nuevoVencOct, `octubre se re-fechó a ${nuevoVencOct} (quedó ${cicloOctDespues?.due_date})`);

const cicloSepTrasEditar = await ciclo(0);
ok(
  cicloSepTrasEditar?.due_date === nuevoVencSep && cicloSepTrasEditar?.source === 'declared',
  'el resumen declarado (septiembre) NO se movió al cambiar los días',
);
const cicloAgoTrasEditar = await ciclo(-1);
ok(cicloAgoTrasEditar?.due_date === iso(mes(-1, 28)), 'un resumen pasado (agosto) tampoco se movió');

// ---- FLUJO 3: el paso opcional al pagar, SIN tocarlo ---------------------
console.log('\n--- FLUJO 3: confirmar el pago sin declarar (el assert crítico) ---');
await page.goto(BASE + '/compromisos', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const septCardV1 = cardVisa('ciclo actual');
await septCardV1.getByRole('button', { name: /Registrar pago de Visa Galicia/ }).click();

const alert3 = alertaAbierta();
await alert3.waitFor({ state: 'visible' });
// El AlertDialog anima su entrada (zoom-in, 200ms): medir un botón ANTES de que
// asiente da un bounding box más chico que el real (el transform de la animación
// todavía no llegó a scale(1)) y es un falso "MAL". Se espera a que asiente.
await page.waitForTimeout(350);
await okDescripcionAccesible(alert3, '¿Ya pagaste la Visa Galicia? (flujo 3)');

const declararBtn3 = alert3.getByRole('button', { name: 'Lo tengo a mano, lo cargo' });
await declararBtn3.waitFor({ state: 'visible' });
await okBotonMin44(declararBtn3, 'Lo tengo a mano, lo cargo');
// A PROPÓSITO no se lo toca: este flujo confirma "de largo".

const confirmarBtn3 = alert3.getByRole('button', { name: 'Sí, ya la pagué' });
await confirmarBtn3.click(); // .click() ya espera a que esté habilitado (auto-wait)
await page.waitForTimeout(1500);

const cicloOctTrasFlujo3 = await ciclo(1);
ok(
  cicloOctTrasFlujo3?.source === 'generated',
  `CRÍTICO -- confirmar sin abrir el paso opcional NO declara el próximo resumen (es "${cicloOctTrasFlujo3?.source}")`,
);

// ---- FLUJO 4: el paso opcional al pagar, declarando ----------------------
console.log('\n--- FLUJO 4: declarar desde el pago ---');
// Deshace el pago del Flujo 3 para volver a dejar septiembre "pendiente" y
// poder repetir la acción de pago, esta vez sí declarando.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const septCardPagada = cardVisa('ciclo actual');
await septCardPagada.getByRole('button', { name: /Deshacer pago de Visa Galicia/ }).click();
const alertUndo = alertaAbierta();
await alertUndo.waitFor({ state: 'visible' });
await alertUndo.getByRole('button', { name: 'Sí, deshacer' }).click();
await page.waitForTimeout(1500);

const septCardV2 = cardVisa('ciclo actual');
await septCardV2.getByRole('button', { name: /Registrar pago de Visa Galicia/ }).click();
const alert4 = alertaAbierta();
await alert4.waitFor({ state: 'visible' });
await page.waitForTimeout(350); // deja asentar la animación de entrada (ver Flujo 3)

const declararBtn4 = alert4.getByRole('button', { name: 'Lo tengo a mano, lo cargo' });
await declararBtn4.click(); // esta vez SÍ se abre el paso opcional

const confirmarBtn4 = alert4.getByRole('button', { name: 'Sí, ya la pagué' });
await confirmarBtn4.click(); // .click() ya espera a que esté habilitado (auto-wait)
await page.waitForTimeout(1500);

const cicloOctTrasFlujo4 = await ciclo(1);
ok(
  cicloOctTrasFlujo4?.source === 'declared',
  `declarar durante el pago SÍ marca el próximo resumen como "declared" (es "${cicloOctTrasFlujo4?.source}")`,
);

// ---- FLUJO 5: el recordatorio del resumen ya cerrado ---------------------
console.log('\n--- FLUJO 5: el recordatorio ---');
await page.goto(BASE + '/compromisos', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const recordatorioTexto = page.getByText('Cerró el resumen de Visa Galicia');
await recordatorioTexto.waitFor({ state: 'visible' });
ok(true, 'aparece el recordatorio del resumen estimado ya cerrado (junio)');

const cargarFechasBtn = page.getByRole('button', { name: 'Cargar fechas' });
await okBotonMin44(cargarFechasBtn, 'Cargar fechas');
const ahoraNoBtn = page.getByRole('button', { name: 'Ahora no' });
await okBotonMin44(ahoraNoBtn, 'Ahora no');

await ahoraNoBtn.click();
await page.waitForTimeout(1200);
const trasDescartar = await page.getByText('Cerró el resumen de Visa Galicia').count();
ok(trasDescartar === 0, 'el aviso desaparece tras "Ahora no"');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const trasRecargar = await page.getByText('Cerró el resumen de Visa Galicia').count();
ok(trasRecargar === 0, 'sigue sin aparecer al recargar (persistido en la base, no localStorage)');

const cicloJunDespues = await ciclo(-3);
ok(cicloJunDespues?.reminder_dismissed_at != null, 'reminder_dismissed_at quedó escrito en la base');

await page.screenshot({ path: join(OUT, 'declarar-ciclos.png'), fullPage: true });

// ---- consola del navegador (React degradado por CSP + accesibilidad)
console.log('\n--- CONSOLA ---');
const errConsola = consolaEntera.filter((m) => m.type === 'error').map((m) => m.text);
ok(!errConsola.some((e) => /eval/i.test(e)), 'sin el error de eval() de React en desarrollo');
const warnDescripcion = consolaEntera.filter((m) => /Missing.*Description|aria-describedby/i.test(m.text));
if (warnDescripcion.length) {
  console.log('  aviso: la consola SÍ tiene warnings de Description (dev-only, no bloquea; ver DOM arriba):');
  for (const w of warnDescripcion.slice(0, 5)) console.log('   ·', w.text);
}
if (errConsola.length) console.log('  otros errores:', errConsola.slice(0, 3));

await browser.close();
console.log(`\ncapturas en ${OUT}`);
if (errores.length) { console.error(`\n${errores.length} verificación(es) fallaron.`); process.exit(1); }
console.log('todas las verificaciones pasaron.');
