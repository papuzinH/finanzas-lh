/* ============================================================
   Chanchito · App · Chat con IA (FAB + panel fullscreen)
   ============================================================ */

function ChatFab({ onClick }) {
  return (
    <button onClick={onClick}
      className="absolute right-4 bottom-[92px] z-30 grid place-items-center w-14 h-14 rounded-full bg-[var(--accent)] border-[1.5px] border-[var(--accent-deep)] text-[var(--accent-ink)]"
      style={{ boxShadow: '4px 5px 0 0 var(--accent-deep)' }}>
      <Chanchito size={34} fill="var(--accent-ink)" stroke="var(--accent)" face="var(--accent)" />
      <span className="absolute -top-1 -right-1 grid place-items-center w-5 h-5 rounded-full bg-rojo text-cream-light text-[10px] font-bold border-[1.5px] border-[var(--accent)]">
        <Ic name="sparkle" size={11} />
      </span>
    </button>
  );
}

function Bubble({ from, children }) {
  const mine = from === 'me';
  return (
    <div className={`pop flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] px-3.5 py-2.5 text-[13.5px] leading-snug border-[1.5px] font-sans
        ${mine ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent-deep)] rounded-2xl rounded-br-md'
               : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] rounded-2xl rounded-bl-md'}`}>
        {children}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="pop flex justify-start">
      <div className="px-4 py-3 bg-[var(--surface)] border-[1.5px] border-[var(--border)] rounded-2xl rounded-bl-md flex gap-1.5">
        {[0, 1, 2].map(i => <span key={i} className="dot w-2 h-2 rounded-full bg-[var(--muted)]" style={{ animationDelay: `${i * 0.18}s` }} />)}
      </div>
    </div>
  );
}

function ExpenseCard() {
  return (
    <div className="pop flex justify-start">
      <div className="w-[82%] bg-[var(--surface)] border-[1.5px] border-[var(--border)] rounded-2xl rounded-bl-md overflow-hidden">
        <div className="px-3 py-2 flex items-center justify-between border-b border-[var(--border)]" style={{ background: 'color-mix(in srgb, var(--bad) 10%, transparent)' }}>
          <span className="font-sans text-[12px] font-bold text-[var(--text)] flex items-center gap-1.5">🛒 Supermercado</span>
          <span className="font-sans text-[13px] font-extrabold text-[var(--bad)] tnum">−$ 3.000</span>
        </div>
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px] text-[var(--muted)] font-semibold mb-1">
            <span>Presupuesto del mes</span><span className="tnum">79%</span>
          </div>
          <Progress value={79} tone="warn" height={7} />
          <p className="font-sans text-[11px] text-[var(--muted)] mt-2">Efectivo · hoy · te quedan <b className="text-[var(--text)]">$37.700</b> en el rubro.</p>
        </div>
      </div>
    </div>
  );
}

/* Guion de la demo: cada respuesta puede incluir burbujas y/o card */
const SCRIPT = {
  'Gasté 3 lucas en el chino 🛒': [
    { t: 'bubble', text: '¡Anotado, che! 📝 Lo metí en Supermercado.' },
    { t: 'card' },
    { t: 'bubble', text: 'Vas piola 💪 Te quedan $37.700 pa\u0301 el súper este mes.' },
  ],
  '¿Cómo voy este mes?': [
    { t: 'bubble', text: 'Tu saldo disponible es $1.186.430 👌' },
    { t: 'bubble', text: 'Ingresaste $1.759.750 y llevás gastado $573.217 (variables + fijos). Vas ahorrando 21%, ¡mejor que en mayo!' },
  ],
  '¿Cuánto me sale Netflix?': [
    { t: 'bubble', text: 'Netflix te sale $8.499 por mes 🎬 Renueva el 5 de junio con tu Visa Galicia.' },
    { t: 'bubble', text: 'Entre todas tus suscripciones, tu burn rate es $92.847/mes.' },
  ],
};

const QUICK = Object.keys(SCRIPT);

function ChatPanel({ open, onClose }) {
  const [msgs, setMsgs] = React.useState([
    { from: 'bot', el: <>¡Buenas, {USER.name}! 🐷 Soy Chanchito. Tirame un gasto, un audio o preguntame lo que quieras.</> },
  ]);
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, busy]);

  function send(text) {
    if (busy || !text) return;
    const steps = SCRIPT[text] || [{ t: 'bubble', text: 'Lo anoto en un toque 👍 (demo: probá una de las sugerencias).' }];
    setMsgs(m => [...m, { from: 'me', el: text }]);
    setBusy(true);
    let delay = 600;
    steps.forEach((s, i) => {
      setTimeout(() => {
        setMsgs(m => [...m, s.t === 'card' ? { from: 'bot', card: true } : { from: 'bot', el: s.text }]);
        if (i === steps.length - 1) setBusy(false);
      }, delay + 350);
      delay += 950;
    });
    setTimeout(() => setMsgs(m => [...m, { from: 'typing' }]), 250);
    // remove typing right before first response — handled by replacing; simpler: keep typing only briefly
    setTimeout(() => setMsgs(m => m.filter(x => x.from !== 'typing')), 600);
  }

  return (
    <div className={`absolute inset-0 z-40 flex flex-col transition-all duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none translate-y-3'}`}>
      <div className="absolute inset-0 bg-[var(--bg)]" />
      {/* header */}
      <div className="relative flex items-center gap-3 bg-navy px-4 pt-12 pb-3 text-cream-light">
        <div className="grid place-items-center w-10 h-10 rounded-full bg-[var(--accent)] border-[1.5px] border-cream-light">
          <Chanchito size={26} fill="#1C2A47" stroke="#F4EDDC" face="#F4EDDC" />
        </div>
        <div className="flex-1 leading-tight">
          <p className="font-poster text-[16px]">Chanchito IA</p>
          <p className="font-sans text-[11px] text-celeste flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />en línea · Gemini</p>
        </div>
        <button onClick={onClose} className="grid place-items-center w-9 h-9 rounded-full bg-cream-light/12 text-cream-light"><Ic name="x" size={18} /></button>
      </div>

      {/* mensajes */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-4 py-4 space-y-2.5 hatch">
        {msgs.map((m, i) => (
          m.from === 'typing' ? <Typing key={i} />
          : m.card ? <ExpenseCard key={i} />
          : <Bubble key={i} from={m.from}>{m.el}</Bubble>
        ))}
      </div>

      {/* sugerencias */}
      <div className="relative flex gap-2 overflow-x-auto px-4 py-2 no-sb border-t border-[var(--border)] bg-[var(--bg-2)]">
        {QUICK.map(q => (
          <button key={q} onClick={() => send(q)} disabled={busy}
            className="shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold bg-[var(--surface)] border-[1.5px] border-[var(--border)] text-[var(--text)] disabled:opacity-50">
            {q}
          </button>
        ))}
      </div>

      {/* input */}
      <div className="relative flex items-center gap-2 px-3 py-3 pb-5 border-t-[1.5px] border-[var(--border)] bg-[var(--bg-2)]">
        <div className="flex-1 px-4 py-2.5 rounded-full bg-[var(--surface)] border-[1.5px] border-[var(--border)] text-[var(--faint)] text-[13px] font-sans">Escribí o mandá un audio…</div>
        <button className="grid place-items-center w-10 h-10 rounded-full bg-[var(--surface)] text-[var(--text)] border-[1.5px] border-[var(--border)]"><Ic name="mic" size={18} /></button>
        <button onClick={() => send(QUICK[0])} className="grid place-items-center w-10 h-10 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] border-[1.5px] border-[var(--accent-deep)]"><Ic name="send" size={17} /></button>
      </div>
    </div>
  );
}

Object.assign(window, { ChatFab, ChatPanel, Bubble, Typing, ExpenseCard, QUICK });
