/**
 * Copia UN usuario de producción a DEV, para poder verificar la app contra el
 * resumen de tarjeta real que ese usuario tiene impreso.
 *
 * Por qué existe: los escenarios sembrados (Emi + los seeders) prueban la mecánica,
 * pero no pueden decir si los números coinciden con lo que el banco cobró de verdad.
 * Eso sólo se ve con datos reales al lado del papel.
 *
 * Qué hace y qué NO hace:
 *   · Producción se LEE, nunca se escribe. No hay una sola sentencia de escritura
 *     contra prod en este archivo.
 *   · Trae UN usuario, por email. Los demás usuarios de producción no se tocan ni
 *     se leen: cada consulta filtra por `user_id`.
 *   · NO borra a Emi ni a nadie más en DEV. El demo sigue funcionando, y con él los
 *     seeders y los gates de navegador.
 *   · Es idempotente: si ese usuario ya está en DEV, se borra lo suyo y se recrea.
 *
 * En DEV no hay Google (el provider está apagado en producción y acá nunca se
 * configuró), así que al usuario copiado se le fija una contraseña para poder
 * entrar. Se imprime al final.
 *
 * Uso: node scripts/traer-mis-datos-a-dev.mjs <email>
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const EMAIL = process.argv[2];
if (!EMAIL) {
  console.error('Falta el email. Uso: node scripts/traer-mis-datos-a-dev.mjs <email>');
  process.exit(1);
}

const DEV_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const DEV_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = env.NEXT_PUBLIC_SUPABASE_URL_PROD;
const PROD_KEY = env.SUPABASE_SERVICE_ROLE_KEY_PROD;
if (!DEV_URL || !DEV_KEY || !PROD_URL || !PROD_KEY) {
  console.error('Faltan las credenciales de DEV y/o de PROD (con sufijo _PROD) en .env.local');
  process.exit(1);
}

const PROD_REF = 'mkkgdjxaotgimqwhyesx';
const refDe = (u) => new URL(u).hostname.split('.')[0];

// El guard va al revés que en los seeders: acá LEER de producción es el punto. Lo
// que no puede pasar es ESCRIBIR en producción, así que se verifica que el destino
// NO sea prod y que el origen SÍ lo sea (si no, no hay nada que traer).
if (refDe(DEV_URL) === PROD_REF) {
  console.error(`ABORTADO: el destino es PRODUCCIÓN (${PROD_REF}). Este script sólo escribe en DEV.`);
  process.exit(1);
}
if (refDe(PROD_URL) !== PROD_REF) {
  console.error(`ABORTADO: el origen no es producción (${refDe(PROD_URL)}).`);
  process.exit(1);
}

const prod = createClient(PROD_URL, PROD_KEY, { auth: { persistSession: false } });
const dev = createClient(DEV_URL, DEV_KEY, { auth: { persistSession: false } });

// ---- el usuario en producción
const { data: listaProd, error: eProd } = await prod.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (eProd) { console.error('listUsers en prod:', eProd.message); process.exit(1); }
const enProd = listaProd.users.find((u) => u.email === EMAIL);
if (!enProd) { console.error(`No existe ${EMAIL} en producción.`); process.exit(1); }
const UID = enProd.id;

console.log(`\nOrigen : ${refDe(PROD_URL)} (producción, SÓLO LECTURA)`);
console.log(`Destino: ${refDe(DEV_URL)} (DEV)`);
console.log(`Usuario: ${EMAIL}\n`);

// ---- las tablas, en orden FK-safe. Se copian enteras salvo el filtro por usuario.
const TABLAS = [
  'categories',
  'payment_methods',
  'credit_card_cycles',
  'installment_plans',
  'recurring_plans',
  'transactions',
];

// ---- leer de producción (paginado: transactions pasa el límite por defecto)
const leerTodo = async (tabla) => {
  const filas = [];
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await prod
      .from(tabla).select('*').eq('user_id', UID).range(desde, desde + PAGINA - 1);
    if (error) { console.error(`leyendo ${tabla} de prod:`, error.message); process.exit(1); }
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return filas;
};

const { data: filaUsuario, error: eUser } = await prod.from('users').select('*').eq('id', UID).single();
if (eUser) { console.error('leyendo users de prod:', eUser.message); process.exit(1); }

const datos = {};
for (const t of TABLAS) datos[t] = await leerTodo(t);

console.log('Leído de producción:');
console.log(`  users: 1`);
for (const t of TABLAS) console.log(`  ${t}: ${datos[t].length}`);

// ---- el usuario en DEV: se recrea con el MISMO id, para que todas las FK sirvan
const { data: listaDev } = await dev.auth.admin.listUsers({ page: 1, perPage: 1000 });
const enDev = listaDev.users.find((u) => u.id === UID || u.email === EMAIL);

const PASSWORD = env.DEMO_USER_PASSWORD ?? 'chanchito-dev';

if (enDev) {
  // Idempotencia: fuera lo suyo, en orden inverso al de las FK.
  for (const t of [...TABLAS].reverse()) await dev.from(t).delete().eq('user_id', enDev.id);
  await dev.from('users').delete().eq('id', enDev.id);
  await dev.auth.admin.deleteUser(enDev.id);
  console.log('\nEl usuario ya estaba en DEV: se borró lo suyo y se recrea.');
}

const { error: eCrear } = await dev.auth.admin.createUser({
  id: UID,
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});
if (eCrear) { console.error('creando el usuario en DEV:', eCrear.message); process.exit(1); }

// El trigger on_auth_user_created ya insertó la fila en public.users: se actualiza
// con la de producción en vez de insertarla de nuevo.
//
// Se excluyen las columnas que no se pueden ni se deben copiar: `id` y `created_at`
// son de la fila nueva, `email` lo fija auth, `auth_user_id` es vestigial, y
// `chat_tier` lo protege el trigger `users_proteger_chat_tier` (auditoría M1) --
// mandarlo hace que el UPDATE ENTERO falle, y con él los flags de onboarding, así
// que el usuario copiado aterriza en el wizard aunque en producción ya lo tenga hecho.
const NO_COPIAR = new Set(['id', 'created_at', 'email', 'auth_user_id', 'chat_tier']);
const perfil = Object.fromEntries(Object.entries(filaUsuario).filter(([k]) => !NO_COPIAR.has(k)));
const { error: ePerfil } = await dev.from('users').update(perfil).eq('id', UID);
if (ePerfil) { console.error('copiando el perfil a DEV:', ePerfil.message); process.exit(1); }

// ---- escribir en DEV, en orden FK-safe y por lotes
console.log('\nEscribiendo en DEV:');
for (const t of TABLAS) {
  const filas = datos[t];
  if (!filas.length) { console.log(`  ${t}: 0`); continue; }
  const LOTE = 500;
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await dev.from(t).insert(filas.slice(i, i + LOTE));
    if (error) { console.error(`  ${t}: ${error.message}`); process.exit(1); }
  }
  console.log(`  ${t}: ${filas.length}`);
}

console.log(`\nListo. Entrá a DEV con:\n  ${EMAIL}\n  ${PASSWORD}\n`);
console.log('Emi sigue intacta, así que los seeders y los gates siguen funcionando.');
console.log('Para sacar estos datos de DEV: correr este script de nuevo borra y recrea, y');
console.log('`npm run seed:demo` no los toca (sólo maneja al demo).\n');
