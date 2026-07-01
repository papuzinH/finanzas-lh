/* ============================================================
   Chanchito · UI Kit · Main (layout + índice + ensamblado)
   ============================================================ */

function KitIndexNav() {
  const [active, setActive] = React.useState('marca');
  React.useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-30% 0px -65% 0px' });
    KIT_INDEX.forEach(([id]) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);
  return (
    <nav className="hidden lg:block sticky top-[74px] self-start w-52 shrink-0">
      <p className="font-sans text-[10.5px] font-extrabold uppercase tracking-[0.18em] text-navy/40 mb-2.5 px-3">Contenido</p>
      <ul className="space-y-0.5">
        {KIT_INDEX.map(([id, label], i) => (
          <li key={id}>
            <a href={`#${id}`} className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 font-sans text-[12.5px] transition-colors ${active === id ? 'bg-navy text-cream-light font-bold' : 'text-navy/65 font-semibold hover:bg-navy/[0.05]'}`}>
              <span className={`font-mono text-[10px] ${active === id ? 'text-celeste' : 'text-navy/30'}`}>{String(i + 1).padStart(2, '0')}</span>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function KitApp() {
  return (
    <div className="min-h-screen paper" style={{ background: '#F4EDDC' }}>
      {/* top bar */}
      <header className="sticky top-0 z-40 bg-cream-light/92 backdrop-blur border-b-[1.5px] border-navy/15">
        <div className="mx-auto max-w-[1180px] px-5 h-[58px] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Chanchito size={34} />
            <span className="font-poster text-navy text-[18px] leading-none">Chanchito</span>
            <span className="hidden sm:inline font-sans text-[11px] font-bold uppercase tracking-wider text-navy/40 border-l border-navy/20 pl-2.5 ml-1">UI Kit · v1</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 font-sans text-[11px] font-bold text-navy/55">
              <span className="w-3 h-3 rounded-full bg-celeste-deep border border-navy/20" /> Acento azul · claro
            </span>
            <a href="Chanchito App.html" className="inline-flex items-center gap-1.5 rounded-full bg-navy text-cream-light px-3.5 py-2 text-[12px] font-bold">
              Ver app <Ic name="arrow-right" size={13} stroke={2.4} />
            </a>
          </div>
        </div>
      </header>

      {/* hero */}
      <div className="mx-auto max-w-[1180px] px-5 pt-10 pb-2">
        <div className="flex items-center gap-2 text-navy/55 mb-3">
          <span className="h-px w-7 bg-current opacity-50" />
          <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.26em]">Sistema de diseño · app mobile</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-poster text-navy text-[clamp(2.2rem,5vw,3.6rem)] leading-[0.92] max-w-2xl">
            Todo lo que arma <span className="relative whitespace-nowrap">Chanchito
              <svg className="absolute -bottom-2 left-0 w-full" height="12" viewBox="0 0 200 12" preserveAspectRatio="none"><path d="M2 8 Q60 2 100 6 T198 5" fill="none" stroke="#5E98BC" strokeWidth="4" strokeLinecap="round"/></svg>
            </span>
          </h1>
          <ChanchitoSeal size={68} disc="#5E98BC" />
        </div>
        <p className="font-serif text-[17px] text-navy/70 mt-5 max-w-2xl">
          Foundations y componentes con todas sus variantes, listos para implementar. Cada pieza es el mismo componente que corre en el prototipo: lo que ves acá es lo que va al código.
        </p>
      </div>

      {/* body */}
      <div className="mx-auto max-w-[1180px] px-5 pb-24 flex gap-8">
        <KitIndexNav />
        <main className="min-w-0 flex-1">
          <KitMarca />
          <KitColor />
          <KitTokens />
          <KitType />
          <KitIcons />
          <KitTexture />
          <KitElevation />
          <KitResponsive />
          <KitButtons />
          <KitChips />
          <KitInputs />
          <KitCards />
          <KitBadges />
          <KitProgress />
          <KitAlerts />
          <KitListas />
          <KitNavegacion />
          <KitChat />
          <KitVacios />

          <footer className="mt-16 pt-6 border-t-[1.5px] border-navy/12 flex items-center gap-3">
            <Chanchito size={32} />
            <p className="font-sans text-[12px] text-navy/55">Chanchito · Sistema de diseño v1 · {KIT_INDEX.length} secciones · junio 2026</p>
          </footer>
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<KitApp />);
