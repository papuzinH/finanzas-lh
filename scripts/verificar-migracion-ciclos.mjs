/**
 * El invariante duro de la migracion de ciclos: el total a pagar de cada
 * tarjeta, por mes, identico antes y despues. Cualquier diferencia aborta.
 *
 * Se corre dos veces, con --foto antes y --foto despues (la migracion de
 * supabase/migrations/*_backfill_credit_card_cycles.sql en el medio), y una
 * tercera vez con --diff. Guarda las fotos como JSON en el scratchpad.
 *
 * Uso:
 *   node scripts/verificar-migracion-ciclos.mjs --foto antes
 *   (aplicar la migracion: supabase db push --linked)
 *   node scripts/verificar-migracion-ciclos.mjs --foto despues
 *   node scripts/verificar-migracion-ciclos.mjs --diff
 *   node scripts/verificar-migracion-ciclos.mjs --help    (no toca red ni DB)
 *
 * Correcciones sobre la version del brief (ver task-12-dispatch-notes.md):
 *  (a) Env vars: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, leidas
 *      de .env.local con el mismo parser tolerante que seed-demo-user.mjs
 *      (SUPABASE_URL a secas no existe en este repo).
 *  (b) Guard de produccion por hostname exacto (no `.includes`), igual que
 *      seed-demo-user.mjs: un ref que aparezca como substring de otro host
 *      no deberia colar el guard.
 *  (c) Ruta de las fotos: SDD_SCRATCH si esta seteada, si no os.tmpdir()
 *      (process.env.TEMP en Git Bash puede venir vacio o en formato Windows
 *      inconsistente). Se imprime la ruta al escribir cada foto.
 *  (d) PostgREST devuelve maximo 1000 filas por default: fotoAntes/fotoDespues
 *      paginan con .range() en vez de traer todo en un solo pedido -- hoy son
 *      ~900 transacciones, apenas debajo del limite, y el invariante es
 *      inutil si una pagina se pierde en silencio.
 *  (e) fotoDespues ahora tambien suma los gastos de tarjeta que quedaron con
 *      cycle_id IS NULL (agrupados por mes de t.date, igual que fotoAntes):
 *      la version del brief solo sumaba filas CON ciclo, asi que una fila
 *      huerfana desaparecia del total "despues" en vez de aparecer como
 *      diferencia -- exactamente el fallo que este script existe para atrapar.
 *  (f) Bug encontrado al escribir esta version (no estaba en la lista de
 *      correcciones del controller, pero hay que declararlo): la parte "CON
 *      ciclo" de fotoDespues en el brief no filtraba por el payment_method_id
 *      PROPIO de la transaccion. El paso 3 de la migracion tambien le pone
 *      cycle_id a los PAGOS de resumen (que viven en el medio financiador,
 *      ej. Mercado Pago, marcados con card_payment_for). Sin el filtro, un
 *      pago se cuela agrupado bajo la tarjeta que salda -- el join trae el
 *      payment_method_id del CICLO, que es el de la tarjeta -- y duplica el
 *      total: la compra ya esta contada ahi, sumarle el pago que la cancela
 *      no es "el total a pagar", es lo que lo paga. fotoAntes nunca los
 *      cuenta (filtra payment_method_id IN tarjetas, y el pago vive en el
 *      medio financiador). Se agrega `.in('payment_method_id', ids)` tambien
 *      en esa consulta para medir exactamente lo mismo que fotoAntes.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const USO = `Uso:
  node scripts/verificar-migracion-ciclos.mjs --foto antes
  node scripts/verificar-migracion-ciclos.mjs --foto despues
  node scripts/verificar-migracion-ciclos.mjs --diff
  node scripts/verificar-migracion-ciclos.mjs --help

Flags:
  --permitir-produccion   corre --foto contra el ref de produccion (prohibido por defecto)`;

const argv = process.argv.slice(2);
const modo = argv[0];

// --help no toca .env.local ni la red: sirve para chequear el script sin
// credenciales ni conexion (p.ej. en un dispatch que no puede tocar DB).
if (!modo || modo === '--help') {
  console.log(USO);
  process.exit(0);
}
if (modo !== '--foto' && modo !== '--diff') {
  console.error(`Modo desconocido: ${modo}\n\n${USO}`);
  process.exit(1);
}

// Ruta de las fotos: SDD_SCRATCH si esta seteada, si no os.tmpdir(). Una sola
// declaracion a nivel modulo -- la usan tanto --diff como --foto.
const SCRATCH = process.env.SDD_SCRATCH ?? tmpdir();
const RUTA = (cual) => join(SCRATCH, `ciclos-foto-${cual}.json`);

// ---- --diff no necesita DB: solo lee las dos fotos ya guardadas.
if (modo === '--diff') {
  let antes;
  let despues;
  try {
    antes = JSON.parse(readFileSync(RUTA('antes'), 'utf8'));
    despues = JSON.parse(readFileSync(RUTA('despues'), 'utf8'));
  } catch (e) {
    console.error(`No pude leer las fotos en ${SCRATCH}: ${e.message}`);
    process.exit(1);
  }
  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  const difs = [];
  let totalAntes = 0;
  let totalDespues = 0;
  for (const k of claves) {
    const a = antes[k] ?? 0;
    const d = despues[k] ?? 0;
    totalAntes += a;
    totalDespues += d;
    if (Math.abs(a - d) > 0.01) difs.push({ clave: k, antes: a, despues: d, delta: d - a });
  }
  console.log(`Pares (tarjeta, mes): ${claves.size}`);
  console.log(`Total antes:   $ ${totalAntes.toFixed(2)}`);
  console.log(`Total despues: $ ${totalDespues.toFixed(2)}`);
  if (difs.length) {
    console.error(`\nDIFERENCIAS (${difs.length}):`, difs);
    process.exit(1);
  }
  console.log(`OK: ${claves.size} pares (tarjeta, mes) idénticos antes y después.`);
  process.exit(0);
}

// ---- --foto: necesita conexion a la DB.
const cual = argv[1];
if (cual !== 'antes' && cual !== 'despues') {
  console.error(`--foto necesita "antes" o "despues" (recibido: "${cual ?? ''}").\n\n${USO}`);
  process.exit(1);
}

// Mismo parser tolerante que seed-demo-user.mjs: primera ocurrencia gana.
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: SERVICE })) {
  if (!v) {
    console.error(`Falta ${k} en .env.local`);
    process.exit(1);
  }
}

// LHStudio = produccion, con usuarios reales. Guard duro: el ref esta
// hardcodeado (no sale de una env var del mismo .env.local que define el
// destino), y compara el HOSTNAME exacto -- no `.includes` -- igual que
// seed-demo-user.mjs.
const REF_PRODUCCION = 'mkkgdjxaotgimqwhyesx';
const refDestino = new URL(URL_).hostname.split('.')[0];
if (refDestino === REF_PRODUCCION && !argv.includes('--permitir-produccion')) {
  console.error('ABORTADO: apunta a PRODUCCION. Agrega --permitir-produccion si es a proposito.');
  process.exit(1);
}

// PostgREST devuelve maximo 1000 filas por default. Paginamos con .range()
// para no perder filas en silencio a medida que crecen las transacciones.
const PAGE_SIZE = 1000;
const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });

/**
 * Trae TODAS las filas de una query paginando con .range(). `build(from, to)`
 * arma la query (incluido el .range) y la ejecuta. Ordena por `id` para que
 * la paginacion sea estable entre pedidos sucesivos.
 */
async function fetchAllRows(build) {
  const filas = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    filas.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return filas;
}

/** ANTES: el total por tarjeta y mes segun la regla VIEJA (mes de t.date). */
async function fotoAntes() {
  const { data: metodos, error: eMetodos } = await db.from('payment_methods').select('id, name').eq('type', 'credit');
  if (eMetodos) {
    console.error(eMetodos.message);
    process.exit(1);
  }
  const ids = metodos.map((m) => m.id);
  const acc = {};
  if (!ids.length) return acc;

  const txs = await fetchAllRows((from, to) =>
    db
      .from('transactions')
      .select('payment_method_id, date, amount, type')
      .in('payment_method_id', ids)
      .eq('type', 'expense')
      .order('id', { ascending: true })
      .range(from, to)
  );
  for (const t of txs) {
    const k = `${t.payment_method_id}|${String(t.date).slice(0, 7)}`;
    acc[k] = (acc[k] ?? 0) + Math.abs(Number(t.amount));
  }
  return acc;
}

/**
 * DESPUES: el mismo total, agrupado por el mes de vencimiento del ciclo
 * apuntado -- MAS los gastos de tarjeta huerfanos (cycle_id IS NULL),
 * agrupados como en fotoAntes, para que no desaparezcan del total (ver (e)
 * en el header).
 */
async function fotoDespues() {
  const { data: metodos, error: eMetodos } = await db.from('payment_methods').select('id, name').eq('type', 'credit');
  if (eMetodos) {
    console.error(eMetodos.message);
    process.exit(1);
  }
  const ids = metodos.map((m) => m.id);
  const acc = {};
  if (!ids.length) return acc;

  // Parte 1: gastos CON ciclo. Filtramos por el payment_method_id PROPIO de
  // la transaccion (no solo el de la card_payment_for via el join) -- ver
  // (f) en el header: sin esto, un pago de resumen se cuela duplicando el
  // total de la tarjeta que salda.
  const conCiclo = await fetchAllRows((from, to) =>
    db
      .from('transactions')
      .select('amount, type, payment_method_id, credit_card_cycles!inner(payment_method_id, due_date)')
      .eq('type', 'expense')
      .in('payment_method_id', ids)
      .not('cycle_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, to)
  );
  for (const t of conCiclo) {
    const c = t.credit_card_cycles;
    const k = `${c.payment_method_id}|${String(c.due_date).slice(0, 7)}`;
    acc[k] = (acc[k] ?? 0) + Math.abs(Number(t.amount));
  }

  // Parte 2: huerfanas -- gastos de tarjeta que quedaron sin cycle_id.
  const huerfanas = await fetchAllRows((from, to) =>
    db
      .from('transactions')
      .select('payment_method_id, date, amount, type')
      .in('payment_method_id', ids)
      .eq('type', 'expense')
      .is('cycle_id', null)
      .order('id', { ascending: true })
      .range(from, to)
  );
  for (const t of huerfanas) {
    const k = `${t.payment_method_id}|${String(t.date).slice(0, 7)}`;
    acc[k] = (acc[k] ?? 0) + Math.abs(Number(t.amount));
  }
  return acc;
}

const foto = cual === 'antes' ? await fotoAntes() : await fotoDespues();
const ruta = RUTA(cual);
writeFileSync(ruta, JSON.stringify(foto, null, 2));
console.log(`Foto "${cual}": ${Object.keys(foto).length} pares (tarjeta, mes).`);
console.log(`Guardada en ${ruta}`);
