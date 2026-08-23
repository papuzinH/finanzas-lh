/**
 * Siembra el usuario demo «Emi» en la base DEV. Idempotente: borra al demo
 * (solo al demo) y lo recrea con fechas relativas a hoy.
 *
 * Guard duro: exige SEED_TARGET_REF y aborta si la URL de Supabase no lo
 * contiene — correr esto contra producción tiene que ser imposible por
 * accidente. Producción ni siquiera tiene el provider email habilitado.
 *
 * Uso: npm run seed:demo
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// ---- env (mismo parser tolerante que los scripts de Micka: primera ocurrencia gana)
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = env.DEMO_USER_EMAIL;
const PASSWORD = env.DEMO_USER_PASSWORD;
const REF = env.SEED_TARGET_REF;

for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: SERVICE, DEMO_USER_EMAIL: EMAIL, DEMO_USER_PASSWORD: PASSWORD, SEED_TARGET_REF: REF })) {
  if (!v) { console.error(`Falta ${k} en .env.local`); process.exit(1); }
}
if (new URL(URL_).hostname.split('.')[0] !== REF) {
  console.error(`ABORTADO: la URL de Supabase (${URL_}) no contiene SEED_TARGET_REF (${REF}). ¿Estás apuntando a la base equivocada?`);
  process.exit(1);
}

const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });

// ---- fechas relativas
const HOY = new Date(); HOY.setHours(12, 0, 0, 0); // mediodía local: esquiva sorpresas de TZ al serializar
const iso = (d) => d.toISOString().slice(0, 10);
const diasAtras = (n) => { const d = new Date(HOY); d.setDate(d.getDate() - n); return d; };
const mesesAtras = (n, dia) => { const d = new Date(HOY); d.setMonth(d.getMonth() - n); d.setDate(dia); return d; };
/** Último día hábil del mes que está `n` meses atrás. */
const ultimoHabil = (n) => {
  const d = new Date(HOY); d.setMonth(d.getMonth() - n + 1); d.setDate(0); // último día de ese mes
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
};

// ---- 1. borrar el demo anterior (solo el demo)
const { data: lista, error: eList } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (eList) { console.error('listUsers:', eList.message); process.exit(1); }
const previo = lista.users.find((u) => u.email === EMAIL);
if (previo) {
  const uid = previo.id;
  // Orden seguro por FKs. users.id === auth.uid(), así que user_id es el mismo UUID en todas.
  for (const tabla of ['transactions', 'installment_plans', 'recurring_plans', 'category_budgets',
                       'savings_goal_contributions', 'savings_goals', 'internal_transfers',
                       'investment_transactions', 'investment_assets', 'categories', 'payment_methods']) {
    const { error } = await db.from(tabla).delete().eq('user_id', uid);
    if (error) { console.error(`limpiando ${tabla}:`, error.message); process.exit(1); }
  }
  await db.from('users').delete().eq('id', uid);
  const { error: eDel } = await db.auth.admin.deleteUser(uid);
  if (eDel) { console.error('deleteUser:', eDel.message); process.exit(1); }
  console.log('demo anterior borrado');
}

// ---- 2. auth user + fila de users
const { data: creado, error: eCrear } = await db.auth.admin.createUser({
  email: EMAIL, password: PASSWORD, email_confirm: true,
});
if (eCrear) { console.error('createUser:', eCrear.message, '\n¿Está habilitado el provider Email en DEV?'); process.exit(1); }
const UID = creado.user.id;

let { data: updated, error: eUser } = await db.from('users').update({
  first_name: 'Emi', income_rhythm: 'monthly',
  onboarding_completed: true, pocket_setup_completed: true, tour_completed: true,
}).eq('id', UID).select('id').single();
if (eUser || !updated) { console.error('users:', eUser ? eUser.message : 'el trigger handle_new_user no creó la fila'); process.exit(1); }

// ---- 3. categorías (las 8 del onboarding + las que el demo necesita)
const CATS = [
  { emoji: '🏠', name: 'Hogar', type: 'expense' },
  { emoji: '🛒', name: 'Supermercado', type: 'expense' },
  { emoji: '🍔', name: 'Delivery de comida', type: 'expense' },
  { emoji: '🍻', name: 'Salidas', type: 'expense' },
  { emoji: '🚗', name: 'Transporte', type: 'expense' },
  { emoji: '🔁', name: 'Mensualidades', type: 'expense' },
  { emoji: '🎬', name: 'Entretenimiento', type: 'expense' },
  { emoji: '💊', name: 'Salud', type: 'expense' },
  { emoji: '💼', name: 'Sueldo', type: 'income' },
  { emoji: '👟', name: 'Ropa', type: 'expense' },
  { emoji: '📱', name: 'Tecnología', type: 'expense' },
].map((c) => ({ ...c, id: randomUUID(), user_id: UID }));
{ const { error } = await db.from('categories').insert(CATS);
  if (error) { console.error('categories:', error.message); process.exit(1); } }
const cat = (n) => CATS.find((c) => c.name === n).id;

// ---- 4. medios de pago (anclados 35 días atrás — el modelo de bolsillo)
const ANCLA = iso(diasAtras(35));
const PMS = [
  { id: randomUUID(), user_id: UID, name: 'Mercado Pago', type: 'debit', is_default: true,  bucket: 'pocket',  initial_balance: 580000,  initial_balance_at: ANCLA },
  { id: randomUUID(), user_id: UID, name: 'Visa Galicia', type: 'credit', default_closing_day: 20, default_payment_day: 28, bucket: 'pocket', initial_balance: 0, initial_balance_at: ANCLA },
  { id: randomUUID(), user_id: UID, name: 'Efectivo', type: 'cash', bucket: 'pocket', initial_balance: 40000, initial_balance_at: ANCLA },
  { id: randomUUID(), user_id: UID, name: 'Colchón', type: 'debit', bucket: 'reserve', initial_balance: 1500000, initial_balance_at: ANCLA },
];
{ const { error } = await db.from('payment_methods').insert(PMS);
  if (error) { console.error('payment_methods:', error.message); process.exit(1); } }
const pm = (n) => PMS.find((p) => p.name === n).id;

// ---- 5. movimientos cotidianos (26) + sueldos (2)
const tx = (dias, amount, catName, description, pmName, type = 'expense') => ({
  id: randomUUID(), user_id: UID, amount, type, description,
  category_id: cat(catName), payment_method_id: pm(pmName), date: iso(diasAtras(dias)),
});
const COTIDIANOS = [
  // Supermercado (6)
  tx(3, 68400, 'Supermercado', 'Súper Coto', 'Mercado Pago'),
  tx(10, 82900, 'Supermercado', 'Súper Día', 'Mercado Pago'),
  tx(17, 71250, 'Supermercado', 'Súper Coto', 'Visa Galicia'),
  tx(24, 76800, 'Supermercado', 'Súper Carrefour', 'Mercado Pago'),
  tx(31, 64500, 'Supermercado', 'Súper Día', 'Mercado Pago'),
  tx(38, 79300, 'Supermercado', 'Súper Coto', 'Visa Galicia'),
  // Delivery / chino (5)
  tx(2, 9800, 'Delivery de comida', 'Chino de la esquina', 'Efectivo'),
  tx(6, 12400, 'Delivery de comida', 'PedidosYa', 'Mercado Pago'),
  tx(13, 8700, 'Delivery de comida', 'Chino de la esquina', 'Efectivo'),
  tx(20, 15200, 'Delivery de comida', 'Rappi', 'Mercado Pago'),
  tx(27, 11300, 'Delivery de comida', 'PedidosYa', 'Mercado Pago'),
  // Transporte (6)
  tx(1, 5000, 'Transporte', 'Carga SUBE', 'Mercado Pago'),
  tx(8, 5000, 'Transporte', 'Carga SUBE', 'Mercado Pago'),
  tx(15, 5000, 'Transporte', 'Carga SUBE', 'Mercado Pago'),
  tx(22, 5000, 'Transporte', 'Carga SUBE', 'Mercado Pago'),
  tx(29, 5000, 'Transporte', 'Carga SUBE', 'Mercado Pago'),
  tx(36, 5000, 'Transporte', 'Carga SUBE', 'Mercado Pago'),
  // Salidas (4)
  tx(4, 28500, 'Salidas', 'Birras con los pibes', 'Mercado Pago'),
  tx(11, 34200, 'Salidas', 'Cena parrilla', 'Visa Galicia'),
  tx(18, 22800, 'Salidas', 'Bar', 'Efectivo'),
  tx(32, 41000, 'Salidas', 'Cumple de Flor', 'Mercado Pago'),
  // Entretenimiento (1) · Salud (2) · Hogar (2)
  tx(9, 18000, 'Entretenimiento', 'Cine', 'Mercado Pago'),
  tx(12, 16850, 'Salud', 'Farmacia', 'Mercado Pago'),
  tx(26, 24300, 'Salud', 'Farmacia', 'Visa Galicia'),
  tx(5, 48700, 'Hogar', 'Ferretería', 'Efectivo'),
  tx(19, 32000, 'Hogar', 'Internet Fibertel', 'Mercado Pago'),
];
const SUELDOS = [1, 2].map((n) => ({
  id: randomUUID(), user_id: UID, amount: 1850000, type: 'income', description: 'Sueldo',
  category_id: cat('Sueldo'), payment_method_id: pm('Mercado Pago'), date: iso(ultimoHabil(n)),
}));

// ---- 6. cuotas: dos planes a mitad de camino, cuotas fechadas al día 28 (vto de la Visa)
const planCuotas = (mesesDesdeCompra, diaCompra, total, cantidad, catName, descripcion) => {
  const compra = mesesAtras(mesesDesdeCompra, diaCompra);
  const plan = {
    id: randomUUID(), user_id: UID, description: descripcion, total_amount: total,
    installments_count: cantidad, purchase_date: iso(compra),
    category_id: cat(catName), payment_method_id: pm('Visa Galicia'),
  };
  const cuotas = Array.from({ length: cantidad }, (_, i) => {
    const f = new Date(compra); f.setMonth(f.getMonth() + 1 + i); f.setDate(28);
    return {
      id: randomUUID(), user_id: UID, amount: Math.round(total / cantidad), type: 'expense',
      description: `${descripcion} (${i + 1}/${cantidad})`, category_id: cat(catName),
      payment_method_id: pm('Visa Galicia'), installment_plan_id: plan.id, date: iso(f),
    };
  });
  return { plan, cuotas };
};
const celu = planCuotas(8, 15, 1176000, 12, 'Tecnología', 'Celular Samsung');
const zapas = planCuotas(3, 10, 186000, 6, 'Ropa', 'Zapatillas');

// ---- 7. suscripciones: 3 planes + los 2 meses anteriores ya posteados
const RECURRING = [
  { id: randomUUID(), user_id: UID, description: 'Netflix', amount: 15999, billing_day: 10, category_id: cat('Mensualidades'), payment_method_id: pm('Visa Galicia'), is_active: true },
  { id: randomUUID(), user_id: UID, description: 'Spotify', amount: 8999, billing_day: 5, category_id: cat('Mensualidades'), payment_method_id: pm('Visa Galicia'), is_active: true },
  { id: randomUUID(), user_id: UID, description: 'Gimnasio', amount: 46000, billing_day: 3, category_id: cat('Salud'), payment_method_id: pm('Mercado Pago'), is_active: true },
];
const SUBS_POSTEADAS = RECURRING.flatMap((r) => [1, 2].map((n) => ({
  id: randomUUID(), user_id: UID, amount: r.amount, type: 'expense', description: r.description,
  category_id: r.category_id, payment_method_id: r.payment_method_id,
  recurring_plan_id: r.id, date: iso(mesesAtras(n, r.billing_day)),
})));
// El mes corriente NO se siembra: syncAutomaticRecurringCharges lo postea solo
// en la primera carga — la captura muestra el motor real trabajando.

// ---- 8. meta al 60% + presupuestos + inversiones
const GOAL = { id: randomUUID(), user_id: UID, name: 'Viaje a Bariloche', type: 'one_time', target_amount: 1200000, currency: 'ARS', is_active: true };
const CONTRIBS = [[40, 300000], [20, 250000], [6, 170000]].map(([d, a]) => ({
  id: randomUUID(), user_id: UID, goal_id: GOAL.id, amount: a, currency: 'ARS', date: iso(diasAtras(d)),
}));
const BUDGETS = [
  { id: randomUUID(), user_id: UID, category_id: cat('Supermercado'), amount: 250000, currency: 'ARS', is_active: true },
  { id: randomUUID(), user_id: UID, category_id: cat('Salidas'), amount: 150000, currency: 'ARS', is_active: true },
];
const ASSETS = [
  { id: randomUUID(), user_id: UID, ticker: 'AAPL', name: 'Apple (CEDEAR)', asset_type: 'cedear', currency: 'ARS', is_active: true },
  { id: randomUUID(), user_id: UID, ticker: 'USDT', name: 'Dólar cripto', asset_type: 'stablecoin', currency: 'USD', is_active: true },
];
const INV_TX = [
  { id: randomUUID(), user_id: UID, asset_id: ASSETS[0].id, type: 'buy', quantity: 8, price_per_unit: 14500, total_amount: 116000, currency: 'ARS', date: iso(diasAtras(150)) },
  { id: randomUUID(), user_id: UID, asset_id: ASSETS[0].id, type: 'buy', quantity: 4, price_per_unit: 16200, total_amount: 64800, currency: 'ARS', date: iso(diasAtras(60)) },
  { id: randomUUID(), user_id: UID, asset_id: ASSETS[1].id, type: 'buy', quantity: 350, price_per_unit: 1, total_amount: 350, currency: 'USD', date: iso(diasAtras(90)) },
];

// ---- 9. insertar todo lo del usuario
const LOTES = [
  ['installment_plans', [celu.plan, zapas.plan]],
  ['recurring_plans', RECURRING],
  ['transactions', [...COTIDIANOS, ...SUELDOS, ...celu.cuotas, ...zapas.cuotas, ...SUBS_POSTEADAS]],
  ['savings_goals', [GOAL]],
  ['savings_goal_contributions', CONTRIBS],
  ['category_budgets', BUDGETS],
  ['investment_assets', ASSETS],
  ['investment_transactions', INV_TX],
];
for (const [tabla, filas] of LOTES) {
  const { error } = await db.from(tabla).insert(filas);
  if (error) { console.error(`${tabla}:`, error.message); process.exit(1); }
}

// ---- 10. tablas globales de mercado (DEV): el portfolio tiene que valuar sin banner
const AHORA = new Date().toISOString();
for (const p of [
  { ticker: 'AAPL', last_price: 17350, currency: 'ARS', source: 'seed-demo', last_update: AHORA },
  { ticker: 'USDT', last_price: 1, currency: 'USD', source: 'seed-demo', last_update: AHORA },
]) {
  const { data: existe } = await db.from('market_prices').select('ticker').eq('ticker', p.ticker).maybeSingle();
  const { error } = existe
    ? await db.from('market_prices').update(p).eq('ticker', p.ticker)
    : await db.from('market_prices').insert(p);
  if (error) { console.error('market_prices:', error.message); process.exit(1); }
}
for (const r of [
  { pair: 'USD_ARS_MEP', rate: 1335, source: 'seed-demo', last_update: AHORA },
  { pair: 'USD_ARS_CCL', rate: 1348, source: 'seed-demo', last_update: AHORA },
]) {
  const { data: existe } = await db.from('exchange_rates').select('id').eq('pair', r.pair).maybeSingle();
  const { error } = existe
    ? await db.from('exchange_rates').update(r).eq('id', existe.id)
    : await db.from('exchange_rates').insert(r);
  if (error) { console.error('exchange_rates:', error.message); process.exit(1); }
}

// ---- 11. resumen verificable
console.log('\n=== Emi sembrada en', REF, '===');
for (const [tabla] of LOTES) {
  const { count } = await db.from(tabla).select('*', { count: 'exact', head: true }).eq('user_id', UID);
  console.log(`  ${tabla}: ${count}`);
}
const { count: nCats } = await db.from('categories').select('*', { count: 'exact', head: true }).eq('user_id', UID);
const { count: nPms } = await db.from('payment_methods').select('*', { count: 'exact', head: true }).eq('user_id', UID);
console.log(`  categories: ${nCats}\n  payment_methods: ${nPms}`);
