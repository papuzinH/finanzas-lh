/**
 * Siembra en DEV, sobre el usuario demo, los escenarios de tarjeta que ningún
 * test puede mostrar en pantalla y que hay que mirar con los ojos:
 *
 *   A. Un ciclo VIGENTE con compras en dólares → el disponible tiene que
 *      descontar el resumen entero (pesos + dólares convertidos), no sólo la
 *      parte en pesos. Era el bug del 2026-09-01.
 *   B. Un resumen YA VENCIDO y sin pago registrado → tiene que seguir contando
 *      como compromiso y disparar el aviso del home, en vez de esfumarse.
 *
 * El escenario B lo cumple el demo solo (su ciclo de agosto quedó impago y es
 * posterior al ancla); este script le agrega los dólares que le faltan a los
 * dos ciclos, que es lo único que el seeder no genera.
 *
 * Idempotente: borra lo que sembró antes (por descripción) y lo recrea.
 *
 * Uso: node scripts/seed-escenarios-tarjeta.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = env.DEMO_USER_EMAIL;
if (!URL_ || !SERVICE || !EMAIL) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DEMO_USER_EMAIL en .env.local');
  process.exit(1);
}

// Mismo guard duro que el seeder: el ref de producción está hardcodeado como
// prohibido, porque un guard que compara contra una variable del mismo
// .env.local que define el destino no protege nada (lección del 25-ago).
const PROD_REF = 'mkkgdjxaotgimqwhyesx';
if (new URL(URL_).hostname.split('.')[0] === PROD_REF) {
  console.error(`ABORTADO: la URL apunta a PRODUCCIÓN (${PROD_REF}). Este script solo corre contra DEV.`);
  process.exit(1);
}

const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });

// ---- el demo
const { data: lista, error: eList } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (eList) { console.error('listUsers:', eList.message); process.exit(1); }
const demo = lista.users.find((u) => u.email === EMAIL);
if (!demo) { console.error(`No existe ${EMAIL} en esta base. Corré antes: npm run seed:demo`); process.exit(1); }
const UID = demo.id;

const { data: metodos } = await db.from('payment_methods').select('id, name, type, default_closing_day, default_payment_day').eq('user_id', UID);
const tarjeta = metodos?.find((m) => m.type === 'credit' && m.default_closing_day && m.default_payment_day);
if (!tarjeta) { console.error('El demo no tiene una tarjeta de crédito con ciclo cargado.'); process.exit(1); }

const { data: cats } = await db.from('categories').select('id, name').eq('user_id', UID).eq('type', 'expense');
const cat = (nombre) => cats?.find((c) => c.name === nombre)?.id ?? cats?.[0]?.id;

// ---- fechas de los dos ciclos, con la misma regla que getCreditCycleDates
const HOY = new Date(); HOY.setHours(12, 0, 0, 0);
const { default_closing_day: cierre, default_payment_day: pago } = tarjeta;
const vencimiento = (base) => {
  const d = new Date(base.getFullYear(), base.getMonth(), pago, 12);
  return d < base ? new Date(base.getFullYear(), base.getMonth() + 1, pago, 12) : d;
};
const vigente = vencimiento(HOY);
const anterior = new Date(vigente.getFullYear(), vigente.getMonth() - 1, pago, 12);
const iso = (d) => d.toISOString().slice(0, 10);

// ---- los movimientos en dólares que faltan
const MARCA = '[escenario]';
const SUSCRIPCIONES = [
  { desc: `Claude ${MARCA}`, usd: 100, date: iso(vigente), cat: 'Servicios' },
  { desc: `Netflix + Spotify ${MARCA}`, usd: 30, date: iso(anterior), cat: 'Entretenimiento' },
];
/** Sólo se usa si el store no consiguió ni la pair ni el blue: no fija el número en pantalla. */
const TASA_FALLBACK = 1529.2;

// Idempotencia: fuera lo sembrado antes.
const { error: eDel } = await db.from('transactions').delete().eq('user_id', UID).like('description', `%${MARCA}`);
if (eDel) { console.error('limpiando escenarios previos:', eDel.message); process.exit(1); }

const filas = SUSCRIPCIONES.map((s) => ({
  id: randomUUID(),
  user_id: UID,
  description: s.desc,
  // amount se RECALCULA en runtime desde original_amount (prepare.ts): esto es
  // sólo el valor persistido, la pantalla muestra la conversión del día.
  amount: s.usd * TASA_FALLBACK,
  type: 'expense',
  date: s.date,
  category_id: cat(s.cat),
  payment_method_id: tarjeta.id,
  original_currency: 'USD',
  original_amount: s.usd,
  rate_pair: null,
  exchange_rate: TASA_FALLBACK,
}));

const { error } = await db.from('transactions').insert(filas);
if (error) { console.error('insert:', error.message); process.exit(1); }

console.log(`Escenarios sembrados en ${new URL(URL_).hostname.split('.')[0]} sobre ${EMAIL}\n`);
console.log(`Tarjeta: ${tarjeta.name} (cierra ${cierre}, vence ${pago})`);
console.log(`  A. ciclo VIGENTE  vence ${iso(vigente)} → + u$s 100 (Claude)`);
console.log(`  B. resumen VENCIDO vence ${iso(anterior)} → + u$s 30 (Netflix + Spotify)`);
console.log('\nQué mirar en la app:');
console.log('  · Home: aviso "Venció el resumen de tu ' + tarjeta.name + '" arriba del hero, sin botón de cerrar.');
console.log('  · Home: la plata libre descuenta los DOS resúmenes, con los dólares adentro.');
console.log('  · Compromisos: la card del vencido dice "resumen vencido", sin barra de progreso.');
console.log('  · Compromisos: el monto muestra "$X" y debajo "+ u$s Y", juntos.');
console.log('\nPara volver atrás: correr este script de nuevo, o npm run seed:demo (recrea el demo entero).');
