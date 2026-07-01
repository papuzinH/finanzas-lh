/* ============================================================
   Chanchito · App · Dataset demo (Argentina, junio 2026)
   Todos los montos en ARS salvo donde se indica USD.
   ============================================================ */

const FX = {
  USD_MEP: 1485,
  USD_CCL: 1521,
  USDT:    1468,
  blue:    1495,
  oficial: 1102,
  updated: 'hoy 14:32',
};

/* ---------- Helpers de formato ---------- */
function ars(n, { sign = false, dec = 0 } = {}) {
  const neg = n < 0;
  const s = Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const pre = sign ? (neg ? '−' : '+') : (neg ? '−' : '');
  return `${pre}$ ${s}`;
}
function usd(n, { dec = 0 } = {}) {
  return `U$S ${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}
function pct(n, { sign = true } = {}) {
  const s = Math.abs(n).toLocaleString('es-AR', { maximumFractionDigits: 1 });
  return `${sign ? (n < 0 ? '−' : '+') : ''}${s}%`;
}

/* ---------- Usuario ---------- */
const USER = { name: 'Tomás', initials: 'TM', month: 'Junio 2026' };

/* ---------- Categorías ---------- */
const CATS = {
  super:     { emoji: '🛒', icon: 'cart',   name: 'Supermercado', color: '#5E98BC' },
  cafe:      { emoji: '☕', icon: 'coffee',  name: 'Cafetería',    color: '#B97E16' },
  transp:    { emoji: '🚌', icon: 'bus',     name: 'Transporte',   color: '#5E98BC' },
  servicios: { emoji: '💡', icon: 'zap',     name: 'Servicios',    color: '#E3A938' },
  ocio:      { emoji: '🎬', icon: 'film',    name: 'Ocio',         color: '#C2403A' },
  sueldo:    { emoji: '💼', icon: 'wallet',  name: 'Trabajo',      color: '#2E7D5B' },
  freelance: { emoji: '💻', icon: 'laptop',  name: 'Freelance',    color: '#2E7D5B' },
  salud:     { emoji: '🩺', icon: 'health',  name: 'Salud',        color: '#C2403A' },
  hogar:     { emoji: '🏠', icon: 'home-line', name: 'Hogar',      color: '#B97E16' },
  tech:      { emoji: '📱', icon: 'phone-screen', name: 'Tecnología', color: '#1C2A47' },
};

/* ---------- Medios de pago ---------- */
const METHODS = {
  visa:    { name: 'Visa Galicia',  type: 'credit', last: '· 4821', closing: 24, due: 10, icon: 'credit-card', color: '#1C2A47' },
  master:  { name: 'Master Naranja', type: 'credit', last: '· 0917', closing: 28, due: 12, icon: 'credit-card', color: '#C2403A' },
  debito:  { name: 'Débito Galicia', type: 'debit', last: '· 4821', icon: 'banknote', color: '#5E98BC' },
  mp:      { name: 'Mercado Pago',   type: 'debit', last: '', icon: 'wallet', color: '#5E98BC' },
  efectivo:{ name: 'Efectivo',       type: 'cash', last: '', icon: 'coins', color: '#B97E16' },
};

/* ---------- Movimientos (mes actual) ---------- */
const MOVS = [
  { id: 1, desc: 'Coto Supermercado',  cat: 'super',  method: 'visa',     amount: -48900, date: '2026-06-01', day: 'Hoy' },
  { id: 2, desc: 'Café Martínez',      cat: 'cafe',   method: 'mp',       amount: -3200,  date: '2026-06-01', day: 'Hoy' },
  { id: 3, desc: 'SUBE',               cat: 'transp', method: 'debito',   amount: -7000,  date: '2026-06-01', day: 'Hoy' },
  { id: 4, desc: 'Sueldo Junio',       cat: 'sueldo', method: 'debito',   amount: 1240000,date: '2026-05-31', day: 'Ayer' },
  { id: 5, desc: 'Spotify Premium',    cat: 'ocio',   method: 'visa',     amount: -4499,  date: '2026-05-31', day: 'Ayer' },
  { id: 6, desc: 'Claude Pro',         cat: 'tech',   method: 'visa',     usd: -20, amount: -29700, fx: 'USD_MEP', date: '2026-05-31', day: 'Ayer' },
  { id: 7, desc: 'Farmacity',          cat: 'salud',  method: 'master',   amount: -18650, date: '2026-05-30', day: '30 May' },
  { id: 8, desc: 'YPF Full',           cat: 'transp', method: 'visa',     amount: -32400, date: '2026-05-30', day: '30 May' },
  { id: 9, desc: 'Freelance · landing',cat: 'freelance', method: 'mp',    usd: 350, amount: 519750, fx: 'USD_MEP', date: '2026-05-29', day: '29 May' },
  { id: 10, desc: 'Edenor',            cat: 'servicios', method: 'debito',amount: -41200, date: '2026-05-28', day: '28 May' },
  { id: 11, desc: 'Mercado Libre',     cat: 'tech',   method: 'master',   amount: -89900, date: '2026-05-27', day: '27 May' },
  { id: 12, desc: 'Cine Hoyts',        cat: 'ocio',   method: 'efectivo', amount: -16000, date: '2026-05-26', day: '26 May' },
  { id: 13, desc: 'Chino de la esquina',cat: 'super', method: 'efectivo', amount: -8400,  date: '2026-05-26', day: '26 May' },
  { id: 14, desc: 'Aguas Argentinas',  cat: 'servicios', method: 'debito',amount: -23800, date: '2026-05-25', day: '25 May' },
];

/* ---------- Totales del mes ---------- */
const MONTH = {
  balance: 1186430,
  income: 1759750,
  variableExpenses: 324050,
  installmentsMonth: 156320,
  burnRate: 92847,
  prevBalance: 1004200,
  savingRate: 21,
};

/* ---------- Tendencia (últimos 6 meses) ingreso vs gasto ---------- */
const TREND = [
  { m: 'Ene', income: 1180000, expense: 940000 },
  { m: 'Feb', income: 1240000, expense: 1010000 },
  { m: 'Mar', income: 1310000, expense: 1180000 },
  { m: 'Abr', income: 1520000, expense: 1240000 },
  { m: 'May', income: 1690000, expense: 1335000 },
  { m: 'Jun', income: 1759750, expense: 1432000 },
];

/* ---------- Comparador de categorías (mes actual vs anterior) ---------- */
const CAT_COMPARE = [
  { cat: 'super',     now: 142300, prev: 121000 },
  { cat: 'transp',    now: 71400,  prev: 64800 },
  { cat: 'servicios', now: 65000,  prev: 58200 },
  { cat: 'ocio',      now: 36900,  prev: 49000 },
  { cat: 'salud',     now: 18650,  prev: 12000 },
];

/* ---------- Insights (carrusel) ---------- */
const INSIGHTS = [
  { icon: 'trending-down', tone: 'good', title: 'Gastaste 24% menos en Ocio', body: 'vs el mes pasado. Bien ahí 👏' },
  { icon: 'flame',  tone: 'warn', title: 'Tu burn rate subió', body: 'Sumaste Claude Pro. +$29.700 fijos al mes.' },
  { icon: 'coffee', tone: 'neutral', title: 'Café: 14 visitas este mes', body: 'Casi $45.000 en cafeterías. ¿Querés un tope?' },
  { icon: 'dollar', tone: 'good', title: 'Cobraste U$S 350 freelance', body: 'Lo guardamos al MEP $1.485 del día.' },
];

/* ---------- Cuotas (installment_plans) ---------- */
const INSTALLMENTS = [
  { id: 1, desc: 'iPhone 15',        cat: 'tech',  method: 'visa',   total: 1680000, count: 12, paid: 4,  monthly: 140000, next: '10 Jun' },
  { id: 2, desc: 'Notebook Lenovo',  cat: 'tech',  method: 'master', total: 1350000, count: 18, paid: 11, monthly: 75000,  next: '12 Jun' },
  { id: 3, desc: 'Heladera Samsung', cat: 'hogar', method: 'visa',   total: 960000,  count: 9,  paid: 7,  monthly: 106667, next: '10 Jun' },
  { id: 4, desc: 'Vacaciones Brasil',cat: 'ocio',  method: 'visa',   total: 1240000, count: 6,  paid: 2,  monthly: 206667, next: '10 Jun' },
];

/* ---------- Suscripciones (recurring_plans) ---------- */
const SUBS = [
  { id: 1, name: 'Netflix',       cat: 'ocio', brand: 'N', bg: '#C2403A', amount: 8499,  active: true,  freq: 'Mensual', next: '5 Jun' },
  { id: 2, name: 'Spotify',       cat: 'ocio', brand: 'S', bg: '#2E7D5B', amount: 4499,  active: true,  freq: 'Mensual', next: '8 Jun' },
  { id: 3, name: 'Claude Pro',    cat: 'tech', brand: 'C', bg: '#B97E16', usd: 20, amount: 29700, fx: 'USD_MEP', active: true, freq: 'Mensual', next: '31 May' },
  { id: 4, name: 'YouTube Premium',cat: 'ocio',brand: 'Y', bg: '#1C2A47', amount: 5999,  active: true,  freq: 'Mensual', next: '14 Jun' },
  { id: 5, name: 'Gimnasio SportClub', cat: 'salud', brand: 'G', bg: '#5E98BC', amount: 29900, active: true, freq: 'Mensual', next: '1 Jun' },
  { id: 6, name: 'iCloud 200GB',  cat: 'tech', brand: 'i', bg: '#34466A', usd: 2.99, amount: 4440, fx: 'USD_MEP', active: true, freq: 'Mensual', next: '20 Jun' },
  { id: 7, name: 'Disney+',       cat: 'ocio', brand: 'D', bg: '#14203A', amount: 6299,  active: false, freq: 'Mensual', next: '—' },
];

/* ---------- Objetivos de ahorro (savings_goals) ---------- */
const GOALS = [
  { id: 1, name: 'Vacaciones Bariloche', icon: 'plane', type: 'one_time', target: 2400000, current: 1560000, currency: 'ARS', date: 'Dic 2026' },
  { id: 2, name: 'Fondo de emergencia',  icon: 'shield', type: 'monthly', target: 3000000, current: 1850000, currency: 'ARS', date: 'Meta mensual' },
  { id: 3, name: 'MacBook nueva',        icon: 'phone-screen', type: 'one_time', target: 1500, current: 920, currency: 'USD', date: 'Sep 2026' },
  { id: 4, name: 'Regalo casamiento',    icon: 'gift', type: 'one_time', target: 600000, current: 580000, currency: 'ARS', date: 'Jul 2026' },
];

/* ---------- Presupuestos por categoría (category_budgets) ---------- */
const BUDGETS = [
  { cat: 'super',     budget: 180000, spent: 142300 },
  { cat: 'transp',    budget: 80000,  spent: 71400 },
  { cat: 'ocio',      budget: 50000,  spent: 36900 },
  { cat: 'servicios', budget: 60000,  spent: 65000 },
  { cat: 'cafe',      budget: 30000,  spent: 44800 },
];

/* ---------- Inversiones (investment_assets + market_prices) ---------- */
const INVEST = [
  { ticker: 'AAPL',  name: 'Apple CEDEAR',     type: 'cedear', qty: 60,  avg: 14200, price: 16850, currency: 'ARS' },
  { ticker: 'KO',    name: 'Coca-Cola CEDEAR', type: 'cedear', qty: 80,  avg: 9800,  price: 10420, currency: 'ARS' },
  { ticker: 'GGAL',  name: 'Grupo Galicia',    type: 'accion', qty: 180, avg: 6200,  price: 7180,  currency: 'ARS' },
  { ticker: 'YPFD',  name: 'YPF',              type: 'accion', qty: 30,  avg: 38500, price: 35200, currency: 'ARS' },
  { ticker: 'AL30',  name: 'Bonar 2030',       type: 'bono',   qty: 3000, avg: 685,  price: 724,   currency: 'ARS' },
  { ticker: 'BTC',   name: 'Bitcoin',          type: 'cripto', qty: 0.02, avg: 62000, price: 71800, currency: 'USD' },
  { ticker: 'ETH',   name: 'Ethereum',         type: 'cripto', qty: 0.3,  avg: 2950,  price: 3420,  currency: 'USD' },
  { ticker: 'USDT',  name: 'Tether',           type: 'cripto', qty: 600,  avg: 1,     price: 1,     currency: 'USD' },
  { ticker: 'COCOS', name: 'Cocos Ahorro FCI', type: 'fci',    qty: 3,    avg: 480000,price: 512000,currency: 'ARS' },
];

const ASSET_TYPES = {
  cedear: { label: 'CEDEARs', color: '#5E98BC' },
  accion: { label: 'Acciones', color: '#1C2A47' },
  bono:   { label: 'Bonos',    color: '#E3A938' },
  cripto: { label: 'Cripto',   color: '#C2403A' },
  fci:    { label: 'FCI',      color: '#2E7D5B' },
};

/* ---------- Cálculos de portfolio ---------- */
function assetValueARS(a) {
  const v = a.qty * a.price;
  return a.currency === 'USD' ? v * FX.USD_MEP : v;
}
function assetCostARS(a) {
  const v = a.qty * a.avg;
  return a.currency === 'USD' ? v * FX.USD_MEP : v;
}
function portfolioStats() {
  let value = 0, cost = 0;
  INVEST.forEach(a => { value += assetValueARS(a); cost += assetCostARS(a); });
  const pnl = value - cost;
  const pnlPct = (pnl / cost) * 100;
  const byType = {};
  INVEST.forEach(a => {
    byType[a.type] = (byType[a.type] || 0) + assetValueARS(a);
  });
  return { value, cost, pnl, pnlPct, byType };
}

Object.assign(window, {
  FX, ars, usd, pct, USER, CATS, METHODS, MOVS, MONTH, TREND, CAT_COMPARE,
  INSIGHTS, INSTALLMENTS, SUBS, GOALS, BUDGETS, INVEST, ASSET_TYPES,
  assetValueARS, assetCostARS, portfolioStats,
});
