/**
 * Siembra en DEV, sobre el usuario demo, los escenarios de tarjeta que ningún
 * test puede mostrar en pantalla y que hay que mirar con los ojos:
 *
 *   A. Un ciclo VIGENTE con compras en dólares → el disponible tiene que
 *      descontar el resumen entero (pesos + dólares convertidos), no sólo la
 *      parte en pesos. Era el bug del 2026-09-01.
 *   B. Un resumen YA VENCIDO y sin pago registrado → tiene que seguir contando
 *      como compromiso y disparar el aviso del home, en vez de esfumarse.
 *   C. Los ciclos IRREGULARES reales de la Visa Galicia del demo (Plan 2, Task
 *      10): contra un "día 20" configurado, la tarjeta cerró 23-jul / 20-ago /
 *      24-sep (los tres jueves) -- la misma referencia que cita el comentario
 *      de la migración `20260901204320_credit_card_cycles.sql`. Julio y agosto
 *      quedan `declared` (el usuario ya los cargó); septiembre queda
 *      `generated` a propósito, con la estimación de los defaults (20/28),
 *      para que el gate visual la corrija a mano (24-sep / 2-oct) como
 *      Flujo 1. Octubre queda `generated` como el "resumen estimado futuro"
 *      para probar el realineado (Flujo 2) y como "próximo resumen" del paso
 *      opcional al pagar (Flujos 3 y 4). Junio queda `generated` y ya CERRADO
 *      -- sin tocar nunca -- para el recordatorio (Flujo 5): julio/agosto/
 *      septiembre terminan `declared` y octubre no cierra hasta el mes que
 *      viene, así que junio es el único candidato posible.
 *
 * El escenario B lo cumple el demo solo (su ciclo de agosto quedó impago y es
 * posterior al ancla); este script le agrega los dólares que le faltan a los
 * dos ciclos, que es lo único que el seeder no genera.
 *
 * Idempotente: borra lo que sembró antes (por descripción) y lo recrea. Los
 * ciclos del escenario C se buscan por mes calendario (mismo criterio que
 * `cicloDelMesDe`) y se actualizan en el lugar si ya existen, para no dejar
 * dos resúmenes del mismo mes ni romper la unique de la tabla.
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

// Reset de los días de la tarjeta a los defaults del seed (20/28), ANTES de
// calcular cualquier fecha con ellos: si un gate anterior llegó a correr el
// Flujo 2 (cambiar los días), la tarjeta puede haber quedado con otro
// vencimiento configurado, y tanto el Escenario A/B de abajo como el C
// (Task 10) tienen que partir del mismo punto conocido en cada corrida.
if (tarjeta.default_closing_day !== 20 || tarjeta.default_payment_day !== 28) {
  const { error: eDiasReset } = await db
    .from('payment_methods')
    .update({ default_closing_day: 20, default_payment_day: 28 })
    .eq('id', tarjeta.id);
  if (eDiasReset) { console.error('reseteando dias de la tarjeta:', eDiasReset.message); process.exit(1); }
  tarjeta.default_closing_day = 20;
  tarjeta.default_payment_day = 28;
}

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

// El insert de estas dos filas va MAS ABAJO, despues de materializar los ciclos:
// necesitan su cycle_id, que es la unica verdad de pertenencia a un resumen. Sin el
// no entran en ningun total y el balde de ruido del gate queda rojo para siempre.

// ---- Escenario C: los ciclos irregulares reales de la Visa Galicia (Task 10)
// (los días de la tarjeta ya se resetearon a 20/28 más arriba, antes de que el
// Escenario A/B calculara nada con ellos)
const mes = (mesesDelta, dia) => new Date(HOY.getFullYear(), HOY.getMonth() + mesesDelta, dia, 12);

const { data: ciclosVisaExistentes, error: eLeerCiclos } = await db
  .from('credit_card_cycles')
  .select('*')
  .eq('payment_method_id', tarjeta.id);
if (eLeerCiclos) { console.error('leyendo ciclos de la tarjeta:', eLeerCiclos.message); process.exit(1); }

/** Busca el ciclo del mismo mes calendario (mismo criterio que cicloDelMesDe) y lo
 * actualiza en el lugar; si no existe, lo inserta. Nunca deja dos resúmenes del
 * mismo mes -- la unique de la tabla es (payment_method_id, closing_date). */
async function upsertCiclo({ closing, due, source }) {
  const closing_date = iso(closing);
  const due_date = iso(due);
  const mesDelCierre = closing_date.slice(0, 7);
  const existente = ciclosVisaExistentes.find((c) => c.closing_date.slice(0, 7) === mesDelCierre);

  if (existente) {
    const { data, error: eUpd } = await db
      .from('credit_card_cycles')
      .update({ closing_date, due_date, source, reminder_dismissed_at: null })
      .eq('id', existente.id)
      .select('*')
      .single();
    if (eUpd) { console.error('actualizando ciclo:', eUpd.message); process.exit(1); }
    return data;
  }
  const { data, error: eIns } = await db
    .from('credit_card_cycles')
    .insert({
      user_id: UID, payment_method_id: tarjeta.id,
      closing_date, due_date, source, reminder_dismissed_at: null,
    })
    .select('*')
    .single();
  if (eIns) { console.error('insertando ciclo:', eIns.message); process.exit(1); }
  return data;
}

// Junio (-3): generated y ya CERRADO -- nunca se toca. Único candidato al
// recordatorio del Flujo 5 (jul/ago/sep terminan declared; oct no cierra aún).
const cicloJun = await upsertCiclo({ closing: mes(-3, 20), due: mes(-3, 28), source: 'generated' });
// Julio (-2): real, irregular, ya declarado (23-jul / 31-jul, mismo mes).
const cicloJul = await upsertCiclo({ closing: mes(-2, 23), due: mes(-2, 31), source: 'declared' });
// Agosto (-1): real, coincide con el default (20-ago / 28-ago), ya declarado.
const cicloAgo = await upsertCiclo({ closing: mes(-1, 20), due: mes(-1, 28), source: 'declared' });
// Septiembre (0): SIN declarar a propósito -- la estimación de los defaults
// (20-sep / 28-sep). El Flujo 1 la corrige a mano a 24-sep / 2-oct.
const cicloSep = await upsertCiclo({ closing: mes(0, 20), due: mes(0, 28), source: 'generated' });
// Octubre (+1): resumen estimado futuro, para el realineado (Flujo 2) y el
// "próximo resumen" del paso opcional al pagar (Flujos 3 y 4).
const cicloOct = await upsertCiclo({ closing: mes(1, 20), due: mes(1, 28), source: 'generated' });

// ---- Escenarios A y B: las suscripciones en dólares, ya con su resumen
// El resumen de cada una sale de su fecha, que en crédito ES el vencimiento: se
// aparea contra el due_date de los ciclos recién sembrados. Se falla ruidosamente
// si alguna no encuentra el suyo -- una transacción de crédito sin cycle_id no
// cuenta en la deuda de la tarjeta ni en el disponible, y el escenario mentiría.
const cicloPorVencimiento = new Map(
  [cicloJun, cicloJul, cicloAgo, cicloSep, cicloOct].map((c) => [c.due_date, c.id]),
);

const filas = SUSCRIPCIONES.map((s) => {
  const cycle_id = cicloPorVencimiento.get(s.date);
  if (!cycle_id) {
    console.error(`Sin resumen para "${s.desc}" (vence ${s.date}): revisá las fechas del escenario C.`);
    process.exit(1);
  }
  return {
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
    cycle_id,
    original_currency: 'USD',
    original_amount: s.usd,
    rate_pair: null,
    exchange_rate: TASA_FALLBACK,
  };
});

const { error } = await db.from('transactions').insert(filas);
if (error) { console.error('insert:', error.message); process.exit(1); }

// Una transacción real imputada al ciclo de septiembre: para que el Flujo 1
// del gate ("ninguna transacción cambió de cycle_id") cuente algo de verdad
// en vez de comparar cero contra cero.
const MARCA_C = '[ciclos-galicia]';
const { error: eDelC } = await db.from('transactions').delete().eq('user_id', UID).like('description', `%${MARCA_C}`);
if (eDelC) { console.error('limpiando escenario C previo:', eDelC.message); process.exit(1); }
const { error: eInsC } = await db.from('transactions').insert({
  user_id: UID,
  description: `Compra imputada al resumen ${MARCA_C}`,
  amount: 12000,
  type: 'expense',
  date: iso(mes(0, 10)),
  category_id: cat('Hogar'),
  payment_method_id: tarjeta.id,
  cycle_id: cicloSep.id,
});
if (eInsC) { console.error('insert transaccion escenario C:', eInsC.message); process.exit(1); }

console.log(`Escenarios sembrados en ${new URL(URL_).hostname.split('.')[0]} sobre ${EMAIL}\n`);
console.log(`Tarjeta: ${tarjeta.name} (cierra ${cierre}, vence ${pago})`);
console.log(`  A. ciclo VIGENTE  vence ${iso(vigente)} → + u$s 100 (Claude)`);
console.log(`  B. resumen VENCIDO vence ${iso(anterior)} → + u$s 30 (Netflix + Spotify)`);
console.log(`  C. ciclos irregulares: jun ${cicloJun.closing_date}/${cicloJun.source}, jul ${cicloJul.closing_date}/${cicloJul.source}, ago ${cicloAgo.closing_date}/${cicloAgo.source}, sep ${cicloSep.closing_date}/${cicloSep.source}, oct ${cicloOct.closing_date}/${cicloOct.source}`);
console.log('\nQué mirar en la app:');
console.log('  · Home: aviso "Venció el resumen de tu ' + tarjeta.name + '" arriba del hero, sin botón de cerrar.');
console.log('  · Home: la plata libre descuenta los DOS resúmenes, con los dólares adentro.');
console.log('  · Compromisos: la card del vencido dice "resumen vencido", sin barra de progreso.');
console.log('  · Compromisos: el monto muestra "$X" y debajo "+ u$s Y", juntos.');
console.log('\nPara volver atrás: correr este script de nuevo, o npm run seed:demo (recrea el demo entero).');
