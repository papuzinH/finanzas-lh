# Usuario demo y capturas — Plan de implementación (Fase 1 de la landing)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fabricar el usuario demo «Emi» en la base DEV y producir las tres capturas de pantalla (`public/landing/`) que la landing de la Fase 2 y el video del portfolio consumen.

**Architecture:** Dos scripts Node autónomos en `scripts/`: un seeder idempotente con service role contra DEV (con guard explícito de destino), y un capturador que levanta sesión del demo por cookies `@supabase/ssr` en Playwright contra el build de producción local. Sin cambios en `src/`.

**Tech Stack:** Node .mjs · `@supabase/supabase-js` (ya es dependencia, la usa `utils/supabase/admin.ts`) · `playwright-core` + `sharp` (devDeps nuevas).

**Spec:** `docs/superpowers/specs/2026-08-22-landing-michanchito-design.md`

## Global Constraints

- **Solo DEV.** El seeder exige `SEED_TARGET_REF` en el entorno y aborta si la URL de Supabase no contiene exactamente ese ref. Producción no se toca nunca.
- **Fechas relativas a hoy** — offsets en días/meses, jamás fechas fijas: regenerar no envejece nada.
- **Idempotente**: correr el seeder dos veces deja el mismo estado (borra al demo y lo recrea). Jamás toca otros usuarios.
- Credenciales del demo en `.env.local` (`DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`), nunca commiteadas.
- Capturas: tema **día**, viewport 390×844 a 2x, PNG con paleta, **< 150 KB cada una** (el script falla si se pasa).
- Convención de `user_id`: en runtime `users.id` **ES** `auth.uid()` (verificado 2026-07-08, ver `docs/features/pwa-plataforma.md`) — el seeder usa el mismo UUID para todas las tablas.
- El "test" de un script contra una base remota es la **predicción escrita de conteos** verificada tras la corrida (precedente del repo: la migración de mensualidades del 2026-08-21 predijo 22 filas y fueron 22).

---

### Task 1: Seeder del usuario demo

**Files:**
- Create: `scripts/seed-demo-user.mjs`
- Modify: `package.json` (script `seed:demo`)

**Interfaces:**
- Consumes: `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`, `SEED_TARGET_REF`).
- Produces: el usuario demo completo en DEV. Task 2 depende de que exista y de sus credenciales.

- [ ] **Step 1: Pre-requisito manual (Lauti o dashboard): habilitar el provider Email en DEV**

En el dashboard de Supabase del proyecto **DEV** (el de `.env.local`): Authentication → Providers → Email → habilitar (con confirmación de email desactivada o creando el user ya confirmado — el seeder usa `email_confirm: true`, así que alcanza con habilitar el provider). **No tocar el proyecto PROD.** La UI de la app sigue ofreciendo solo Google: esto no cambia nada visible.

- [ ] **Step 2: Agregar a `.env.local` (a mano, no commitear)**

```
DEMO_USER_EMAIL=demo@michanchito.net
DEMO_USER_PASSWORD=<contraseña larga generada>
SEED_TARGET_REF=<ref del proyecto DEV, el subdominio de NEXT_PUBLIC_SUPABASE_URL>
```

- [ ] **Step 3: Escribir `scripts/seed-demo-user.mjs`**

```js
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
if (!URL_.includes(REF)) {
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

let { error: eUser } = await db.from('users').insert({
  id: UID, email: EMAIL, first_name: 'Emi', income_rhythm: 'monthly',
  onboarding_completed: true, pocket_setup_completed: true, tour_completed: true,
});
if (eUser) { console.error('users:', eUser.message); process.exit(1); }

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
  { id: randomUUID(), user_id: UID, name: 'Visa Galicia', type: 'credit', default_closing_day: 20, default_payment_day: 28, bucket: 'pocket' },
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
  ['transactions', [...COTIDIANOS, ...SUELDOS, ...celu.cuotas, ...zapas.cuotas, ...SUBS_POSTEADAS]],
  ['installment_plans', [celu.plan, zapas.plan]],
  ['recurring_plans', RECURRING],
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
```

- [ ] **Step 4: Registrar el npm script**

En `package.json`, junto a los scripts existentes:

```json
"seed:demo": "node scripts/seed-demo-user.mjs"
```

- [ ] **Step 5: Verificar el guard (la "prueba de que falla primero")**

Correr con un ref falso y confirmar que aborta **sin tocar nada**:

```bash
SEED_TARGET_REF=ref-falso npm run seed:demo
```

Esperado: `ABORTADO: la URL de Supabase (...) no contiene SEED_TARGET_REF (ref-falso)` y exit 1. (En PowerShell: `$env:SEED_TARGET_REF='ref-falso'; npm run seed:demo; Remove-Item env:SEED_TARGET_REF`.)

- [ ] **Step 6: Correr el seeder con la predicción escrita ANTES**

Predicción (escribirla antes de correr, compararla después):

| Tabla | Filas |
|---|---|
| categories | 11 |
| payment_methods | 4 |
| transactions | **52** (26 cotidianos + 2 sueldos + 12 + 6 cuotas + 6 subs) |
| installment_plans | 2 |
| recurring_plans | 3 |
| savings_goals | 1 |
| savings_goal_contributions | 3 |
| category_budgets | 2 |
| investment_assets | 2 |
| investment_transactions | 3 |

```bash
npm run seed:demo
```

Esperado: el resumen imprime exactamente esos conteos. Cualquier diferencia es un bug del seeder — no seguir hasta explicarla.

- [ ] **Step 7: Verificar idempotencia**

```bash
npm run seed:demo
```

Esperado: «demo anterior borrado» + los **mismos** conteos.

- [ ] **Step 8: Commit**

```bash
git add scripts/seed-demo-user.mjs package.json
git commit -m "feat(demo): seeder del usuario demo Emi contra DEV, idempotente y con guard de destino"
```

---

### Task 2: Capturas para la landing

**Files:**
- Create: `scripts/capture-demo.mjs`
- Create: `docs/features/usuario-demo.md`
- Modify: `package.json` (devDeps `playwright-core` + `sharp`, script `capture:demo`)
- Modify: `CLAUDE.md` (sección Comandos: `seed:demo` y `capture:demo`)
- Produce: `public/landing/captura-home.png`, `captura-compromisos.png`, `captura-inversiones.png`

**Interfaces:**
- Consumes: el usuario demo de Task 1 (`DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD` de `.env.local`) y el build de producción local en `http://localhost:3100`.
- Produces: los tres PNG que la Fase 2 referencia por esos nombres exactos.

- [ ] **Step 1: Instalar devDeps**

```bash
npm install -D playwright-core sharp
```

(`playwright-core` no descarga navegadores: usa el Chromium ya presente en `%LOCALAPPDATA%/ms-playwright` — el mismo que usó la verificación del 2026-08-22 — o el que indique `PW_CHROMIUM`.)

- [ ] **Step 2: Escribir `scripts/capture-demo.mjs`**

```js
/**
 * Captura las pantallas del usuario demo para la landing.
 *
 * Requiere: seeder corrido (Task 1) y el build de producción sirviendo en
 * CAPTURE_BASE_URL (default http://localhost:3100) contra DEV:
 *   npm run build && npx next start -p 3100
 *
 * La sesión no pasa por Google: se firma con email/contraseña vía supabase-js
 * y se inyecta como cookies en el formato de @supabase/ssr
 * (`sb-<ref>-auth-token` = "base64-" + base64url(JSON de la sesión), en
 * chunks de 3180 si hace falta). Si el middleware redirige a /login, el
 * formato cambió: loguearse a mano en DEV e inspeccionar document.cookie.
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { readFileSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = env.DEMO_USER_EMAIL;
const PASSWORD = env.DEMO_USER_PASSWORD;
const BASE = process.env.CAPTURE_BASE_URL ?? 'http://localhost:3100';
const LIMITE = 150 * 1024; // presupuesto por captura (spec)

// ---- chromium local (sin descarga)
function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const dirs = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort();
  if (!dirs.length) { console.error('No hay Chromium en ms-playwright. Seteá PW_CHROMIUM o corré: npx playwright install chromium'); process.exit(1); }
  return join(base, dirs.at(-1), 'chrome-win64', 'chrome.exe');
}

// ---- sesión del demo → cookies @supabase/ssr
const supa = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: auth, error: eAuth } = await supa.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (eAuth) { console.error('signInWithPassword:', eAuth.message, '\n¿Corriste el seeder? ¿Provider email habilitado en DEV?'); process.exit(1); }
const ref = new URL(URL_).hostname.split('.')[0];
const valor = 'base64-' + Buffer.from(JSON.stringify(auth.session)).toString('base64url');
const CHUNK = 3180;
const cookies = valor.length <= CHUNK
  ? [{ name: `sb-${ref}-auth-token`, value: valor }]
  : Array.from({ length: Math.ceil(valor.length / CHUNK) }, (_, i) => ({
      name: `sb-${ref}-auth-token.${i}`, value: valor.slice(i * CHUNK, (i + 1) * CHUNK),
    }));

// ---- capturar
const PANTALLAS = [
  { path: '/', archivo: 'captura-home' },
  { path: '/compromisos', archivo: 'captura-compromisos' },
  { path: '/inversiones', archivo: 'captura-inversiones' },
];
mkdirSync('public/landing', { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light',
});
await ctx.addCookies(cookies.map((c) => ({ ...c, url: BASE })));
// Tema día explícito, gane lo que gane el sistema operativo.
await ctx.addInitScript(() => { try { localStorage.setItem('chanchito-tema', 'dia'); } catch {} });

const page = await ctx.newPage();
for (const { path, archivo } of PANTALLAS) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  if (page.url().includes('/login')) {
    console.error(`Redirigido a /login en ${path}: el formato de cookie de @supabase/ssr cambió (ver comentario de cabecera).`);
    process.exit(1);
  }
  await page.waitForTimeout(1500); // fetchAllData + animaciones de entrada
  const png = await page.screenshot({ type: 'png' });
  const destino = `public/landing/${archivo}.png`;
  await sharp(png).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(destino);
  const peso = statSync(destino).size;
  console.log(`${destino}: ${(peso / 1024).toFixed(0)} KB`);
  if (peso > LIMITE) { console.error(`EXCEDE el presupuesto de 150 KB`); process.exit(1); }
}
await browser.close();
console.log('capturas listas');
```

- [ ] **Step 3: Registrar el npm script**

```json
"capture:demo": "node scripts/capture-demo.mjs"
```

- [ ] **Step 4: Build de producción + server contra DEV**

```bash
npm run build
npx next start -p 3100
```

(en dev no hay service worker ni comportamiento real; el server queda corriendo aparte)

- [ ] **Step 5: Correr las capturas**

```bash
npm run capture:demo
```

Esperado: tres líneas con nombre y peso (< 150 KB cada una) y «capturas listas». Si redirige a `/login`, seguir la instrucción del error (formato de cookie).

- [ ] **Step 6: Verificación visual de las tres capturas**

Abrir los tres PNG y confirmar contra el spec: el home muestra el disponible con un número creíble y la línea de reservas; Compromisos muestra las cuotas a mitad de camino (8/12 y 3/6) y las tres suscripciones; Inversiones muestra AAPL en ARS y USDT en USD **sin banner de cotizaciones faltantes**. Nada de datos de Lauti en pantalla — es Emi.

- [ ] **Step 7: Escribir `docs/features/usuario-demo.md`**

```markdown
# Usuario demo (Emi)

## Propósito
Usuario ficticio en la base DEV para capturas de la landing y el video del
portfolio. Nunca existe en producción. Spec:
`docs/superpowers/specs/2026-08-22-landing-michanchito-design.md`.

## Comandos
- `npm run seed:demo` — lo (re)crea en DEV. Idempotente; exige
  `SEED_TARGET_REF` en `.env.local` y aborta si la URL no lo contiene.
- `npm run capture:demo` — captura home/compromisos/inversiones a
  `public/landing/` (390×844 @2x, tema día, < 150 KB c/u). Requiere el build
  de producción corriendo (`npm run build && npx next start -p 3100`).

## Env (en `.env.local`, no commitear)
`DEMO_USER_EMAIL` · `DEMO_USER_PASSWORD` · `SEED_TARGET_REF` (ref del
proyecto DEV).

## Gotchas
- El provider **Email** está habilitado solo en DEV para este usuario; la UI
  sigue ofreciendo únicamente Google.
- Las fechas del seed son **relativas a hoy**: re-correr seeder + capturas
  regenera todo sin envejecer.
- El mes corriente de las suscripciones no se siembra: lo postea
  `syncAutomaticRecurringCharges` en la primera carga (el motor real).
- La sesión de captura se inyecta como cookies `@supabase/ssr`
  (`sb-<ref>-auth-token`, "base64-" + base64url, chunks de 3180). Si el
  formato cambia con una versión nueva de `@supabase/ssr`, el script falla
  con instrucciones.
- `market_prices`/`exchange_rates` de DEV reciben precios `source:
  'seed-demo'` para que el portfolio valúe sin banner.
```

- [ ] **Step 8: Actualizar `CLAUDE.md` (sección Comandos)**

Agregar al bloque de comandos existente:

```
npm run seed:demo     # (Re)crea el usuario demo Emi en DEV — ver docs/features/usuario-demo.md
npm run capture:demo  # Capturas de la landing desde el demo (requiere build + next start -p 3100)
```

- [ ] **Step 9: Suite en verde y commit**

```bash
npm test
npx tsc --noEmit
git add scripts/capture-demo.mjs docs/features/usuario-demo.md package.json package-lock.json CLAUDE.md public/landing/
git commit -m "feat(demo): capturas de la landing desde el usuario demo (390x844 @2x, tema dia, <150KB)"
```

Esperado: 543 tests en verde, tsc 0 — los scripts no tocan `src/`.

---

## Self-review (hecho al escribir)

- **Cobertura del spec (Fase 1)**: persona completa ✔ (tabla del spec → arrays del seeder) · fechas relativas ✔ · DEV con guard ✔ · idempotencia ✔ · provider email solo DEV ✔ · capturas 390×844 @2x tema día ✔ · presupuesto 150 KB con fallo ✔ · `market_prices`/`exchange_rates` DEV ✔. La Fase 2 tiene plan propio (se escribe cuando existan las capturas).
- **Riesgo conocido y señalizado**: el formato de cookie de `@supabase/ssr` (paso más frágil) — el script falla con instrucciones en vez de capturar un login.
- **Consistencia de tipos**: columnas tomadas de `src/types/database.ts` (2026-08-22); pares `USD_ARS_MEP`/`USD_ARS_CCL` tomados de los tests de `resolveRate`/`portfolio`; clave de tema `chanchito-tema` de `theme-script.tsx`.
