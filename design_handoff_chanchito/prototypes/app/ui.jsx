/* ============================================================
   Chanchito · App · UI compartida (chrome, primitivas, charts)
   Theming vía CSS vars seteadas en .app-screen (claro/oscuro,
   acento, densidad, textura) desde los Tweaks.
   ============================================================ */

/* ---------- Tema → variables CSS para el screen ---------- */
const ACCENTS = {
  gold:    { c: '#E3A938', deep: '#B97E16', ink: '#1C2A47', soft: '#F2CB6E' },
  celeste: { c: '#5E98BC', deep: '#3C708F', ink: '#FBF7EC', soft: '#A9CFE0' },
  rojo:    { c: '#C2403A', deep: '#9B2F2A', ink: '#FBF7EC', soft: '#E7A9A4' },
};

function themeVars(t) {
  const a = ACCENTS[t.accent] || ACCENTS.gold;
  const dark = t.dark;
  return {
    '--accent': a.c, '--accent-deep': a.deep, '--accent-ink': a.ink, '--accent-soft': a.soft,
    '--bg':       dark ? '#14203A' : '#F4EDDC',
    '--bg-2':     dark ? '#1C2A47' : '#FBF7EC',
    '--surface':  dark ? '#1C2A47' : '#FFFFFF',
    '--surface-2':dark ? '#22315A' : '#FBF7EC',
    '--text':     dark ? '#F4EDDC' : '#1C2A47',
    '--muted':    dark ? '#A9CFE0' : '#5b6577',
    '--faint':    dark ? 'rgba(169,207,224,0.55)' : 'rgba(28,42,71,0.5)',
    '--border':   dark ? 'rgba(244,237,220,0.16)' : 'rgba(28,42,71,0.16)',
    '--border-strong': dark ? 'rgba(244,237,220,0.35)' : '#1C2A47',
    '--hero':     '#1C2A47',
    '--hero-text':'#F4EDDC',
    '--good':     dark ? '#5FBE8C' : '#2E7D5B',
    '--bad':      '#C2403A',
  };
}

/* ---------- Teléfono ---------- */
function PhoneFrame({ children, scale = 1, label }) {
  return (
    <div className="relative" style={{ width: 392 * scale, height: 812 * scale }}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
        <div className="relative w-[392px] h-[812px] rounded-[52px] bg-navy p-[11px]"
          style={{ boxShadow: '0 30px 60px -20px rgba(28,42,71,0.5), inset 0 0 0 2px rgba(255,255,255,0.06)' }}>
          {/* botones laterales */}
          <div className="absolute -left-[3px] top-[150px] w-[3px] h-16 rounded-l bg-navy-deep" />
          <div className="absolute -left-[3px] top-[230px] w-[3px] h-16 rounded-l bg-navy-deep" />
          <div className="absolute -right-[3px] top-[200px] w-[3px] h-24 rounded-r bg-navy-deep" />
          {/* pantalla */}
          <div className="relative w-full h-full rounded-[42px] overflow-hidden bg-[var(--bg)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="relative z-20 flex items-center justify-between px-7 pt-3.5 pb-1.5 text-[13px] font-bold text-[var(--text)] tnum select-none">
      <span>9:41</span>
      <div className="absolute left-1/2 -translate-x-1/2 top-2 w-[112px] h-[26px] rounded-full bg-navy" />
      <div className="flex items-center gap-1.5">
        <Ic name="bars" size={15} stroke={2.4} />
        <span className="text-[11px]">5G</span>
        <div className="w-6 h-3 rounded-[3px] border-[1.5px] border-current relative">
          <div className="absolute inset-[1.5px] right-[5px] bg-current rounded-[1px]" />
          <div className="absolute -right-[2.5px] top-1/2 -translate-y-1/2 w-[2px] h-1.5 rounded-r bg-current" />
        </div>
      </div>
    </div>
  );
}

/* ---------- Bottom nav ---------- */
const NAV = [
  { id: 'inicio',      label: 'Inicio',      icon: 'home' },
  { id: 'movimientos', label: 'Movimientos', icon: 'list' },
  { id: 'compromisos', label: 'Compromisos', icon: 'layers' },
  { id: 'objetivos',   label: 'Objetivos',   icon: 'target' },
  { id: 'inversiones', label: 'Inversiones', icon: 'chart' },
];

function BottomNav({ active, onNav }) {
  return (
    <div className="absolute bottom-0 inset-x-0 z-30">
      <div className="px-3 pb-2 pt-2 bg-[var(--bg-2)]/95 backdrop-blur border-t-[1.5px] border-[var(--border)]"
        style={{ boxShadow: '0 -6px 20px -12px rgba(28,42,71,0.4)' }}>
        <div className="flex items-stretch justify-between">
          {NAV.map(n => {
            const on = active === n.id;
            return (
              <button key={n.id} onClick={() => onNav(n.id)}
                className="flex-1 flex flex-col items-center gap-1 py-1 relative group">
                <span className={`grid place-items-center w-11 h-8 rounded-full transition-all ${on ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--muted)]'}`}>
                  <Ic name={n.icon} size={20} stroke={on ? 2.4 : 2} />
                </span>
                <span className={`text-[9.5px] font-bold tracking-tight ${on ? 'text-[var(--text)]' : 'text-[var(--faint)]'}`}>{n.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mx-auto mt-1 h-1 w-32 rounded-full bg-[var(--text)] opacity-25" />
      </div>
    </div>
  );
}

/* ---------- Header de pantalla ---------- */
function ScreenHeader({ title, sub, kicker, right, onBack }) {
  return (
    <div className="px-5 pt-2 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {kicker && (
            <div className="flex items-center gap-2 text-[var(--accent-deep)] mb-1">
              <span className="font-sans text-[10px] font-extrabold uppercase tracking-[0.22em]">{kicker}</span>
            </div>
          )}
          <h1 className="font-poster text-[var(--text)] text-[28px] leading-none">{title}</h1>
          {sub && <p className="font-sans text-[12.5px] text-[var(--muted)] mt-1.5">{sub}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}

/* ---------- Card genérica ---------- */
function Card({ children, className = '', as = 'div', ...rest }) {
  const Tag = as;
  return (
    <Tag className={`rounded-2xl bg-[var(--surface)] border-[1.5px] border-[var(--border)] ${className}`}
      style={{ boxShadow: '0 1px 0 0 var(--border)' }} {...rest}>
      {children}
    </Tag>
  );
}

function SectionTitle({ children, action, onAction }) {
  return (
    <div className="flex items-center justify-between px-5 mt-5 mb-2.5">
      <h2 className="font-poster text-[var(--text)] text-[15px] tracking-tight">{children}</h2>
      {action && (
        <button onClick={onAction} className="flex items-center gap-1 font-sans text-[12px] font-bold text-[var(--accent-deep)]">
          {action} <Ic name="chevron-right" size={13} stroke={2.6} />
        </button>
      )}
    </div>
  );
}

/* ---------- Chip / filtro ---------- */
function Chip({ active, children, onClick, icon }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold border-[1.5px] transition-colors
        ${active ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent-deep)]'
                 : 'bg-[var(--surface)] text-[var(--muted)] border-[var(--border)]'}`}>
      {icon && <Ic name={icon} size={14} stroke={2.2} />}
      {children}
    </button>
  );
}

/* ---------- Botón pill ---------- */
function Btn({ children, variant = 'accent', size = 'md', className = '', ...rest }) {
  const sizes = { sm: 'px-3.5 py-2 text-[12.5px]', md: 'px-5 py-2.5 text-[13.5px]', lg: 'px-6 py-3 text-[15px]' };
  const variants = {
    accent: 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent-deep)] shadow-[3px_3px_0_0_var(--accent-deep)] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--accent-deep)]',
    navy:   'bg-navy text-cream-light border-navy shadow-[3px_3px_0_0_var(--accent-deep)] active:translate-y-[2px]',
    ghost:  'bg-transparent text-[var(--text)] border-[var(--border)]',
    soft:   'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]',
  };
  return (
    <button className={`inline-flex items-center justify-center gap-2 rounded-full font-sans font-bold tracking-tight border-[1.5px] transition-transform select-none ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/* ---------- Progress bar con estado ---------- */
function Progress({ value, tone = 'accent', height = 8, track }) {
  const colors = { accent: 'var(--accent)', good: 'var(--good)', warn: '#E3A938', bad: 'var(--bad)' };
  const w = Math.max(0, Math.min(100, value));
  return (
    <div className="rounded-full overflow-hidden border border-[var(--border)]"
      style={{ height, background: track || 'var(--surface-2)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: colors[tone] }} />
    </div>
  );
}

/* ---------- Toggle switch ---------- */
function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick}
      className={`relative w-[44px] h-[26px] rounded-full border-[1.5px] transition-colors shrink-0
        ${on ? 'bg-[var(--accent)] border-[var(--accent-deep)]' : 'bg-[var(--surface-2)] border-[var(--border)]'}`}>
      <span className={`absolute top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full bg-white border border-navy/20 transition-all
        ${on ? 'left-[22px]' : 'left-[3px]'}`} style={{ boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
    </button>
  );
}

/* ---------- Avatar/categoria ícono ---------- */
function CatIcon({ cat, size = 40 }) {
  const c = CATS[cat] || { color: '#5E98BC', icon: 'bag' };
  return (
    <div className="grid place-items-center rounded-xl border-[1.5px] shrink-0"
      style={{ width: size, height: size, background: `${c.color}1f`, borderColor: `${c.color}55`, color: c.color }}>
      <Ic name={c.icon} size={size * 0.5} stroke={2.1} />
    </div>
  );
}

/* ---------- Barras de tendencia (ingreso vs gasto) ---------- */
function TrendBars({ data, height = 96 }) {
  const max = Math.max(...data.flatMap(d => [d.income, d.expense]));
  return (
    <div className="flex items-end justify-between gap-2" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
          <div className="w-full flex items-end justify-center gap-[3px]" style={{ height }}>
            <div className="w-[42%] rounded-t-[3px]" style={{ height: `${(d.income / max) * 100}%`, background: 'var(--good)' }} />
            <div className="w-[42%] rounded-t-[3px]" style={{ height: `${(d.expense / max) * 100}%`, background: 'var(--bad)', opacity: .85 }} />
          </div>
          <span className="text-[9.5px] font-bold text-[var(--muted)]">{d.m}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Donut de distribución ---------- */
function Donut({ segments, size = 132, stroke = 20, center }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * c;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color}
              strokeWidth={stroke} strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset}
              strokeLinecap="butt" />
          );
          offset += dash;
          return el;
        })}
      </svg>
      {center && <div className="absolute inset-0 grid place-items-center text-center">{center}</div>}
    </div>
  );
}

/* ---------- Banner (avisos del dashboard) ---------- */
function Banner({ icon, tone = 'accent', title, body, cta, onClose }) {
  const tones = {
    accent: { bg: 'var(--accent-soft)', bd: 'var(--accent-deep)', ic: 'var(--accent-deep)' },
    warn:   { bg: '#F7E4B6', bd: '#B97E16', ic: '#B97E16' },
    info:   { bg: '#CBE2EE', bd: '#3C708F', ic: '#3C708F' },
  };
  const tn = tones[tone] || tones.accent;
  return (
    <div className="relative rounded-2xl p-3.5 pr-9 border-[1.5px] overflow-hidden"
      style={{ background: tn.bg, borderColor: tn.bd }}>
      <div className="flex items-start gap-3">
        <div className="grid place-items-center w-9 h-9 rounded-xl shrink-0 bg-white/60 border border-navy/15" style={{ color: tn.ic }}>
          <Ic name={icon} size={18} />
        </div>
        <div className="min-w-0">
          <p className="font-sans font-extrabold text-navy text-[13px] leading-tight">{title}</p>
          <p className="font-sans text-[12px] text-navy/70 leading-snug mt-0.5">{body}</p>
          {cta && <button className="mt-2 font-sans text-[12px] font-extrabold text-navy underline decoration-2 underline-offset-2">{cta}</button>}
        </div>
      </div>
      {onClose && (
        <button onClick={onClose} className="absolute top-2.5 right-2.5 text-navy/40 hover:text-navy"><Ic name="x" size={15} /></button>
      )}
    </div>
  );
}

/* ---------- Pill bimonetario (snapshot FX) ---------- */
function FxTag({ children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-[var(--muted)] border border-[var(--border)] bg-[var(--surface-2)]">
      {children}
    </span>
  );
}

Object.assign(window, {
  ACCENTS, themeVars, PhoneFrame, StatusBar, NAV, BottomNav, ScreenHeader,
  Card, SectionTitle, Chip, Btn, Progress, Toggle, CatIcon, TrendBars, Donut, Banner, FxTag,
});
