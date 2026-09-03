/**
 * Siembra, sobre el usuario demo en DEV, lo que hace falta para probar a mano
 * "mover una compra al resumen vecino" (Plan 4). Corre DESPUÉS de
 * `npm run seed:demo` y de `scripts/seed-escenarios-tarjeta.mjs`, que dejan la
 * Visa Galicia con sus cinco resúmenes irregulares (jun a oct).
 *
 * Lo que agrega, y para qué:
 *
 *   1. PLAN DE 6 CUOTAS repartido en los cinco resúmenes + uno más adelante.
 *      Es el escenario central: mover la cuota 3 al siguiente tiene que
 *      arrastrar 3, 4, 5 y 6 y dejar la 1 y la 2 quietas; y mover la 3 al
 *      ANTERIOR tiene que ser RECHAZADO, porque ahí vive la cuota 2 (dos
 *      cuotas del mismo plan en un resumen es un estado que en el papel del
 *      banco no existe).
 *   2. UN REINTEGRO en la tarjeta (`income`, `purchase_date` null por diseño).
 *      No debe ofrecer "Mover a otro resumen", y su fila va al bloque propio de
 *      reintegros, no al de "sin fecha de compra".
 *   3. DOS COMPRAS VIEJAS SIN `purchase_date`, para ver el bloque "Sin fecha de
 *      compra" con su explicación, y que el total las siga contando.
 *   4. UN RESUMEN PAGADO (junio): al ofrecerlo como destino, el diálogo tiene
 *      que advertir que ese consumo no va a volver a contarse en lo que debés.
 *   5. UNA DESCRIPCIÓN LARGA Y UN MONTO DE 7 CIFRAS, que son los dos casos que
 *      rompen el layout en 390px si algo no trunca.
 *
 * Idempotente: borra por descripción lo que sembró antes y lo recrea.
 *
 * Uso: node scripts/seed-qa-mover.mjs
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

// Mismo guard duro que el resto de los seeders: el ref de producción va
// hardcodeado como prohibido, porque compararlo contra una variable del mismo
// .env.local que define el destino no protege nada (lección del 25-ago).
const PROD_REF = 'mkkgdjxaotgimqwhyesx';
if (new URL(URL_).hostname.split('.')[0] === PROD_REF) {
  console.error(`ABORTADO: la URL apunta a PRODUCCIÓN (${PROD_REF}). Este script solo corre contra DEV.`);
  process.exit(1);
}

const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const { data: lista, error: eList } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (eList) { console.error('listUsers:', eList.message); process.exit(1); }
const demo = lista.users.find((u) => u.email === EMAIL);
if (!demo) { console.error(`No existe ${EMAIL}. Corré antes: npm run seed:demo`); process.exit(1); }
const UID = demo.id;

const { data: metodos } = await db.from('payment_methods').select('id, name, type').eq('user_id', UID);
const visa = metodos?.find((m) => m.name === 'Visa Galicia');
const mp = metodos?.find((m) => m.name === 'Mercado Pago');
if (!visa) { console.error('No encontré la Visa Galicia. Corré antes: npm run seed:demo'); process.exit(1); }

const { data: cats } = await db.from('categories').select('id, name, type').eq('user_id', UID);
const catGasto = cats?.find((c) => c.type === 'expense' && c.name === 'Tecnología') ?? cats?.find((c) => c.type === 'expense');
const catIngreso = cats?.find((c) => c.type === 'income');
if (!catGasto || !catIngreso) { console.error('Faltan categorías del demo.'); process.exit(1); }

const { data: ciclos } = await db
  .from('credit_card_cycles')
  .select('id, closing_date, due_date, source')
  .eq('payment_method_id', visa.id)
  .order('closing_date', { ascending: true });

if (!ciclos || ciclos.length < 5) {
  console.error(`La Visa tiene ${ciclos?.length ?? 0} resúmenes; hacen falta 5. Corré antes: node scripts/seed-escenarios-tarjeta.mjs`);
  process.exit(1);
}

// ---- idempotencia: fuera lo que sembró una corrida anterior
const MARCA = 'QA mover';
const { data: viejas } = await db.from('transactions').select('id, installment_plan_id').eq('user_id', UID).like('description', `%${MARCA}%`);
const planesViejos = [...new Set((viejas ?? []).map((t) => t.installment_plan_id).filter(Boolean))];
if (viejas?.length) await db.from('transactions').delete().in('id', viejas.map((t) => t.id));
if (planesViejos.length) await db.from('installment_plans').delete().in('id', planesViejos);

const filas = [];

// ---- 1. plan de 6 cuotas, una por resumen (los 5 que existen + el 6º queda sin
// ciclo materializado a propósito: mover hacia adelante desde la 5 obliga a la
// action a materializar el resumen que falta, que es un camino real del código).
const planId = randomUUID();
const TOTAL = 1_800_000; // 7 cifras: el caso que rompe el layout si algo no trunca
const CUOTAS = 6;
const DESC_LARGA = 'Notebook Lenovo ThinkPad X1 Carbon Gen 11 con garantía extendida';
const { error: ePlan } = await db.from('installment_plans').insert({
  id: planId,
  user_id: UID,
  description: `${DESC_LARGA} · ${MARCA}`,
  total_amount: TOTAL,
  installments_count: CUOTAS,
  payment_method_id: visa.id,
  category_id: catGasto.id,
  purchase_date: ciclos[0].closing_date,
});
if (ePlan) { console.error('insert del plan:', ePlan.message); process.exit(1); }
for (let i = 0; i < CUOTAS; i++) {
  const ciclo = ciclos[i]; // los primeros 5 tienen resumen; la 6ª queda sin ciclo
  filas.push({
    id: randomUUID(),
    user_id: UID,
    description: `${DESC_LARGA} (${i + 1}/${CUOTAS}) · ${MARCA}`,
    amount: TOTAL / CUOTAS,
    type: 'expense',
    date: ciclo ? ciclo.due_date : '2026-12-05',
    purchase_date: ciclos[0].closing_date,
    category_id: catGasto.id,
    payment_method_id: visa.id,
    installment_plan_id: planId,
    cycle_id: ciclo ? ciclo.id : null,
  });
}

// ---- 2. reintegro en la tarjeta: purchase_date null POR DISEÑO (todo income lo es)
filas.push({
  id: randomUUID(),
  user_id: UID,
  description: `Reintegro por devolución · ${MARCA}`,
  amount: 45_000,
  type: 'income',
  date: ciclos[2].due_date,
  purchase_date: null,
  category_id: catIngreso.id,
  payment_method_id: visa.id,
  cycle_id: ciclos[2].id,
});

// ---- 3. dos compras viejas sin fecha de compra (las que el backfill no pudo recuperar)
for (const [i, desc] of ['Compra vieja sin fecha', 'Otra compra sin fecha'].entries()) {
  filas.push({
    id: randomUUID(),
    user_id: UID,
    description: `${desc} · ${MARCA}`,
    amount: 33_000 + i * 7_000,
    type: 'expense',
    date: ciclos[1].due_date,
    purchase_date: null,
    category_id: catGasto.id,
    payment_method_id: visa.id,
    cycle_id: ciclos[1].id,
  });
}

const { error: eIns } = await db.from('transactions').insert(filas);
if (eIns) { console.error('insert:', eIns.message); process.exit(1); }

// ---- 4. junio queda PAGADO: un gasto en Mercado Pago imputado a ese resumen
if (mp) {
  const catPago = cats?.find((c) => c.name === 'Pagos de tarjeta' && c.type === 'expense');
  if (catPago) {
    await db.from('transactions').insert({
      id: randomUUID(),
      user_id: UID,
      description: `Pago Visa Galicia · ${MARCA}`,
      amount: 120_000,
      type: 'expense',
      date: ciclos[0].due_date,
      purchase_date: null,
      category_id: catPago.id,
      payment_method_id: mp.id,
      card_payment_for: visa.id,
      cycle_id: ciclos[0].id,
    });
  }
}

const f = (c) => `${c.closing_date} → vence ${c.due_date}${c.source === 'declared' ? ' (declarado)' : ''}`;
console.log(`\nQA de "mover al resumen vecino" sembrado en ${new URL(URL_).hostname.split('.')[0]}\n`);
console.log(`Tarjeta: ${visa.name} · ${ciclos.length} resúmenes`);
ciclos.forEach((c, i) => console.log(`  ${i + 1}. ${f(c)}${i < CUOTAS ? `  ← cuota ${i + 1}/${CUOTAS}` : ''}`));
console.log(`\n  · Plan de ${CUOTAS} cuotas de $${(TOTAL / CUOTAS).toLocaleString('es-AR')} (descripción larga a propósito)`);
console.log(`  · La cuota 6 quedó SIN resumen: moverla obliga a materializar uno nuevo`);
console.log(`  · Reintegro de $45.000 en el resumen ${3}`);
console.log(`  · Dos compras sin fecha de compra en el resumen ${2}`);
console.log(`  · El resumen 1 quedó PAGADO (aviso al ofrecerlo como destino)\n`);
