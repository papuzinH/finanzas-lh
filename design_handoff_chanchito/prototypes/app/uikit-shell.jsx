/* ============================================================
   Chanchito · UI Kit · Shell, helpers de documentación
   ============================================================ */

const KIT_THEME = themeVars({ accent: 'celeste', dark: false });
const KIT_THEME_DARK = themeVars({ accent: 'celeste', dark: true });

/* índice de secciones (el número se deriva de esta posición) */
const KIT_INDEX = [
  ['marca', 'Marca'],
  ['color', 'Color'],
  ['tokens', 'Tokens'],
  ['tipografia', 'Tipografía'],
  ['iconos', 'Iconografía'],
  ['textura', 'Texturas & ornamentos'],
  ['elevacion', 'Elevación, radios & espaciado'],
  ['responsive', 'Responsive & layout'],
  ['botones', 'Botones'],
  ['chips', 'Chips & tabs'],
  ['inputs', 'Inputs & controles'],
  ['cards', 'Cards'],
  ['badges', 'Badges & estados'],
  ['progreso', 'Progreso & charts'],
  ['alerts', 'Alertas & banners'],
  ['listas', 'Items de lista'],
  ['navegacion', 'Navegación'],
  ['chat', 'Chat con IA'],
  ['vacios', 'Estados vacíos'],
];

function kitNum(id) {
  const i = KIT_INDEX.findIndex(([x]) => x === id);
  return String(i + 1).padStart(2, '0');
}

function KitSection({ id, title, desc, children }) {
  return (
    <section id={id} className="scroll-mt-20 pt-12 first:pt-2">
      <div className="flex items-baseline gap-3 mb-1">
        <span className="font-poster text-navy/25 text-[20px] tnum">{kitNum(id)}</span>
        <h2 className="font-poster text-navy text-[26px] leading-none">{title}</h2>
      </div>
      {desc && <p className="font-serif text-[16px] text-navy/65 max-w-2xl mb-5">{desc}</p>}
      <div className="h-[1.5px] bg-navy/12 mb-6" />
      {children}
    </section>
  );
}

/* Pie de specs para handoff: medidas, API de props y nota responsive */
function SpecFoot({ specs, api, responsive }) {
  if (!specs && !api && !responsive) return null;
  return (
    <div className="border-t border-navy/10 bg-cream-light/80 px-3.5 py-2.5 space-y-2">
      {specs && (
        <div className="space-y-1">
          {specs.map(([k, v]) => (
            <div key={k} className="flex gap-2 leading-tight">
              <span className="font-sans text-[10px] font-bold uppercase tracking-wide text-navy/40 w-[92px] shrink-0 pt-px">{k}</span>
              <span className="font-mono text-[10.5px] text-navy/70">{v}</span>
            </div>
          ))}
        </div>
      )}
      {api && (
        <div className="pt-1.5 border-t border-navy/8 space-y-1">
          <p className="font-sans text-[9px] font-extrabold uppercase tracking-[0.16em] text-navy/35">Props</p>
          {api.map(([p, v]) => (
            <div key={p} className="flex gap-2 leading-tight">
              <span className="font-mono text-[10.5px] font-medium text-celeste-deep w-[92px] shrink-0">{p}</span>
              <span className="font-mono text-[10.5px] text-navy/60">{v}</span>
            </div>
          ))}
        </div>
      )}
      {responsive && (
        <div className="pt-1.5 border-t border-navy/8 flex gap-1.5 items-start">
          <Ic name="phone-screen" size={13} className="text-celeste-deep shrink-0 mt-px" />
          <span className="font-sans text-[10.5px] text-navy/65 leading-snug">{responsive}</span>
        </div>
      )}
    </div>
  );
}

/* Tile de muestra con etiqueta + (opcional) pie de specs */
function Spec({ label, note, children, className = '', dark = false, pad = 'p-5', specs, api, responsive }) {
  return (
    <div className={`rounded-2xl border-[1.5px] border-navy/12 overflow-hidden ${className}`}>
      {label && (
        <div className="flex items-center justify-between px-3.5 py-2 bg-navy/[0.035] border-b border-navy/10">
          <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] text-navy/55">{label}</span>
          {note && <span className="font-mono text-[10.5px] text-navy/45">{note}</span>}
        </div>
      )}
      <div className={`kit-stage ${pad}`}
        style={dark ? { ...KIT_THEME_DARK, background: '#14203A' } : { ...KIT_THEME, background: 'var(--bg)' }}>
        {children}
      </div>
      <SpecFoot specs={specs} api={api} responsive={responsive} />
    </div>
  );
}

/* etiqueta mono para tokens / nombres */
function Tok({ children }) {
  return <code className="font-mono text-[11px] text-navy/60 bg-navy/[0.06] rounded px-1.5 py-0.5">{children}</code>;
}

/* swatch de color */
function Swatch({ name, hex, big }) {
  const dark = ['#1C2A47', '#14203A', '#34466A', '#23262C', '#5E98BC', '#B97E16', '#C2403A', '#3C708F', '#2E7D5B', '#9B2F2A'].includes(hex);
  return (
    <div className="rounded-xl overflow-hidden border-[1.5px] border-navy/12">
      <div className={`${big ? 'h-20' : 'h-14'} flex items-end p-2`} style={{ background: hex, color: dark ? '#F4EDDC' : '#1C2A47' }}>
        <span className="font-sans text-[11px] font-bold opacity-80">{name}</span>
      </div>
      <div className="px-2 py-1.5 bg-cream-light">
        <span className="font-mono text-[10.5px] text-navy/60 uppercase">{hex}</span>
      </div>
    </div>
  );
}

/* Tabla de tokens (name → value → uso) */
function TokenTable({ title, rows }) {
  return (
    <div className="rounded-2xl border-[1.5px] border-navy/12 overflow-hidden">
      <div className="px-3.5 py-2 bg-navy/[0.035] border-b border-navy/10">
        <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] text-navy/55">{title}</span>
      </div>
      <div className="divide-y divide-navy/8">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-3 px-3.5 py-2 bg-cream-light/40">
            {r.swatch && <span className="w-5 h-5 rounded-md border border-navy/15 shrink-0" style={{ background: r.swatch }} />}
            <span className="font-mono text-[11px] text-navy font-medium w-[150px] shrink-0 truncate">{r.token}</span>
            <span className="font-mono text-[10.5px] text-navy/55 w-[120px] shrink-0 truncate">{r.value}</span>
            <span className="font-sans text-[11px] text-navy/55 flex-1 truncate hidden sm:block">{r.use}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Card de regla (para responsive) */
function RuleCard({ icon, title, children }) {
  return (
    <div className="rounded-2xl border-[1.5px] border-navy/12 bg-cream-light/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-celeste-soft border border-celeste-deep/40 text-celeste-deep"><Ic name={icon} size={16} /></span>
        <p className="font-poster text-navy text-[14px]">{title}</p>
      </div>
      <div className="font-sans text-[12.5px] text-navy/70 leading-snug space-y-1.5">{children}</div>
    </div>
  );
}

Object.assign(window, { KIT_THEME, KIT_THEME_DARK, KIT_INDEX, kitNum, KitSection, Spec, SpecFoot, Tok, Swatch, TokenTable, RuleCard });
