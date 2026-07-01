/* ============================================================
   Chanchito · App · Main (host, navegación, overview, tweaks)
   ============================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "celeste",
  "dark": false,
  "density": "comodo",
  "texture": "media",
  "balanceLayout": "hero",
  "insightsLayout": "carousel",
  "balanceFont": "poster"
}/*EDITMODE-END*/;

const SCREENS = {
  inicio: ScreenInicio,
  movimientos: ScreenMovimientos,
  compromisos: ScreenCompromisos,
  objetivos: ScreenObjetivos,
  inversiones: ScreenInversiones,
};
const SCREEN_TITLES = {
  inicio: 'Inicio', movimientos: 'Movimientos', compromisos: 'Compromisos',
  objetivos: 'Objetivos', inversiones: 'Inversiones',
};

/* ---------- Segmented control local (label legible, value-key) ---------- */
function Seg({ value, options, onChange }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-black/[0.04] border border-black/10">
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`flex-1 px-2 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${value === o.v ? 'bg-white text-[#1C2A47] shadow-sm' : 'text-[#1C2A47]/55'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Host de una pantalla dentro del teléfono ---------- */
function ScreenHost({ screen, t, interactive, onNav }) {
  const [chatOpen, setChatOpen] = React.useState(false);
  const Screen = SCREENS[screen];
  const vars = themeVars(t);
  const densityZoom = t.density === 'compacto' || t.density === 'compact' ? 0.9 : 1;

  return (
    <div className="app-screen h-full flex flex-col relative bg-[var(--bg)] font-sans" style={vars}
      data-texture={t.texture} data-dark={t.dark ? '1' : '0'}>
      <div className="paper-bg" />
      <StatusBar />
      <div className={`flex-1 overflow-y-auto no-sb relative ${interactive ? '' : 'pointer-events-none'}`}
        style={{ paddingBottom: 104 }}>
        <div style={{ zoom: densityZoom }}>
          <Screen t={t} onNav={onNav} />
        </div>
      </div>
      <BottomNav active={screen} onNav={onNav} />
      {interactive && <>
        <ChatFab onClick={() => setChatOpen(true)} />
        <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      </>}
    </div>
  );
}

/* ---------- Vista general (lienzo con las 5 pantallas) ---------- */
function Overview({ t, onOpen }) {
  return (
    <div className="w-full">
      <div className="text-center mb-8 px-5">
        <div className="inline-flex items-center gap-2 text-navy/60 mb-3">
          <span className="h-px w-7 bg-current opacity-50" />
          <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.26em]">Prototipo · app mobile</span>
          <span className="h-px w-7 bg-current opacity-50" />
        </div>
        <h1 className="font-poster text-navy text-[clamp(2rem,5vw,3.4rem)] leading-[0.95]">Las 5 pantallas de Chanchito</h1>
        <p className="font-serif text-[17px] text-navy/70 mt-3 max-w-md mx-auto">
          Tocá cualquiera para abrirla y navegar de verdad. El menú de abajo, las tabs y el chat funcionan.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-x-7 gap-y-10 px-6 pb-10">
        {Object.keys(SCREENS).map((id, i) => (
          <div key={id} className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-poster text-navy/30 text-[20px] tnum">{String(i + 1).padStart(2, '0')}</span>
              <span className="font-sans text-[13px] font-extrabold text-navy uppercase tracking-wide">{SCREEN_TITLES[id]}</span>
            </div>
            <div role="button" tabIndex={0} onClick={() => onOpen(id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(id); }}
              className="group relative block rounded-[36px] cursor-pointer transition-transform hover:-translate-y-1.5"
              style={{ filter: 'drop-shadow(0 24px 36px rgba(28,42,71,0.28))' }}>
              <PhoneFrame scale={0.62}>
                <ScreenHost screen={id} t={t} interactive={false} onNav={() => onOpen(id)} />
              </PhoneFrame>
              {/* capa para capturar el tap sin disparar botones internos */}
              <span className="absolute inset-0 rounded-[36px] z-10" />
              <span className="absolute inset-0 rounded-[36px] z-10 ring-0 group-hover:ring-[3px] ring-[var(--accent,#E3A938)] transition-all pointer-events-none" style={{ '--accent': ACCENTS[t.accent].c }} />
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-navy text-cream-light px-3.5 py-2 text-[12px] font-bold shadow-lg whitespace-nowrap">
                  Abrir <Ic name="arrow-right" size={14} stroke={2.4} />
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- App principal ---------- */
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = React.useState('overview'); // overview | app
  const [screen, setScreen] = React.useState('inicio');

  const openScreen = (id) => { setScreen(id); setView('app'); window.scrollTo({ top: 0 }); };

  return (
    <div className="min-h-screen w-full paper" style={{ background: t.dark && view === 'app' ? '#0e1830' : 'var(--page-bg, #F4EDDC)' }}>
      {/* barra superior de la página */}
      <div className="sticky top-0 z-40 bg-cream-light/90 backdrop-blur border-b-[1.5px] border-navy/15">
        <div className="mx-auto max-w-6xl px-5 h-[58px] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Chanchito size={34} />
            <span className="font-poster text-navy text-[18px] leading-none">Chanchito</span>
            <span className="hidden sm:inline font-sans text-[11px] font-bold uppercase tracking-wider text-navy/40 border-l border-navy/20 pl-2.5 ml-1">App · prototipo</span>
          </div>
          <div className="flex items-center gap-2">
            {view === 'app' && (
              <button onClick={() => setView('overview')} className="flex items-center gap-1.5 font-sans text-[13px] font-bold text-navy">
                <Ic name="chevron-left" size={16} stroke={2.4} /> Vista general
              </button>
            )}
            <div className="flex gap-1 p-1 rounded-full bg-navy/[0.06] border border-navy/10">
              <button onClick={() => setView('overview')} className={`px-3 py-1.5 rounded-full text-[12px] font-bold ${view === 'overview' ? 'bg-navy text-cream-light' : 'text-navy/60'}`}>Las 5</button>
              <button onClick={() => setView('app')} className={`px-3 py-1.5 rounded-full text-[12px] font-bold ${view === 'app' ? 'bg-navy text-cream-light' : 'text-navy/60'}`}>App</button>
            </div>
          </div>
        </div>
      </div>

      {/* contenido */}
      {view === 'overview' ? (
        <div className="py-10"><Overview t={t} onOpen={openScreen} /></div>
      ) : (
        <div className="py-8 flex flex-col items-center gap-5">
          <PhoneFrame scale={1}>
            <ScreenHost key={screen + JSON.stringify(t)} screen={screen} t={t} interactive={true} onNav={openScreen} />
          </PhoneFrame>
          <div className="flex flex-wrap justify-center gap-2 max-w-[420px]">
            {NAV.map(n => (
              <button key={n.id} onClick={() => setScreen(n.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold border-[1.5px] transition-colors ${screen === n.id ? 'bg-navy text-cream-light border-navy' : 'bg-cream-light text-navy/70 border-navy/20'}`}>
                <Ic name={n.icon} size={13} stroke={2.2} />{n.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Panel de Tweaks */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Identidad" />
        <TweakRow label="Acento">
          <div className="flex gap-2">
            {Object.entries(ACCENTS).map(([k, a]) => (
              <button key={k} onClick={() => setTweak('accent', k)}
                className={`w-8 h-8 rounded-full border-2 transition-transform ${t.accent === k ? 'scale-110 border-[#1C2A47]' : 'border-black/15'}`}
                style={{ background: a.c }} title={k} />
            ))}
          </div>
        </TweakRow>
        <TweakToggle label="Modo oscuro" value={t.dark} onChange={v => setTweak('dark', v)} />

        <TweakSection label="Pantalla de inicio" />
        <TweakRow label="Layout del balance">
          <Seg value={t.balanceLayout} onChange={v => setTweak('balanceLayout', v)}
            options={[{ v: 'hero', label: 'Saldo' }, { v: 'split', label: 'Columnas' }, { v: 'stat', label: 'Acción' }]} />
        </TweakRow>
        <TweakRow label="Tipografía del saldo">
          <Seg value={t.balanceFont} onChange={v => setTweak('balanceFont', v)}
            options={[{ v: 'poster', label: 'Poster' }, { v: 'serif', label: 'Serif' }]} />
        </TweakRow>
        <TweakRow label="Insights">
          <Seg value={t.insightsLayout} onChange={v => setTweak('insightsLayout', v)}
            options={[{ v: 'carousel', label: 'Carrusel' }, { v: 'stack', label: 'Lista' }]} />
        </TweakRow>

        <TweakSection label="Sistema" />
        <TweakRow label="Textura vintage">
          <Seg value={t.texture} onChange={v => setTweak('texture', v)}
            options={[{ v: 'baja', label: 'Baja' }, { v: 'media', label: 'Media' }, { v: 'alta', label: 'Alta' }]} />
        </TweakRow>
        <TweakRow label="Densidad">
          <Seg value={t.density} onChange={v => setTweak('density', v)}
            options={[{ v: 'compacto', label: 'Compacto' }, { v: 'comodo', label: 'Cómodo' }]} />
        </TweakRow>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
