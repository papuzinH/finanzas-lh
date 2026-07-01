/* ============================================================
   Chanchito · App · Pantalla COMPROMISOS (Cuotas + Suscripciones)
   ============================================================ */

function Tabs({ tabs, active, onChange }) {
  return (
    <div className="mx-5 flex gap-1 p-1 rounded-full bg-[var(--surface-2)] border-[1.5px] border-[var(--border)]">
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-[12.5px] font-bold transition-colors
            ${active === tab.id ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--muted)]'}`}>
          {tab.icon && <Ic name={tab.icon} size={14} stroke={2.2} />}{tab.label}
        </button>
      ))}
    </div>
  );
}

function InstallmentCard({ p }) {
  const cat = CATS[p.cat];
  const method = METHODS[p.method];
  const ratio = (p.paid / p.count) * 100;
  const remaining = p.total - (p.total / p.count) * p.paid;
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <CatIcon cat={p.cat} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-sans text-[14px] font-extrabold text-[var(--text)] leading-tight">{p.desc}</p>
              <p className="font-sans text-[11px] text-[var(--muted)] mt-0.5 flex items-center gap-1"><Ic name={method.icon} size={11} />{method.name}{method.last}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-poster text-[var(--text)] text-[15px] tnum leading-none">{ars(p.monthly)}</p>
              <p className="font-sans text-[10px] text-[var(--muted)] mt-0.5">por mes</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-sans text-[11.5px] font-bold text-[var(--text)]">Cuota {p.paid} de {p.count}</span>
          <span className="font-sans text-[11px] text-[var(--muted)] tnum">Faltan {ars(remaining)}</span>
        </div>
        <Progress value={ratio} tone="accent" height={9} />
        <div className="flex items-center justify-between mt-2">
          <span className="font-sans text-[10.5px] text-[var(--muted)]">Total {ars(p.total)}</span>
          <span className="inline-flex items-center gap-1 font-sans text-[10.5px] font-bold text-[var(--accent-deep)]"><Ic name="calendar" size={12} />Próxima: {p.next}</span>
        </div>
      </div>
    </Card>
  );
}

function SubItem({ s, onToggle }) {
  const inactive = !s.active;
  return (
    <div className={`flex items-center gap-3 px-3.5 py-3 ${inactive ? 'opacity-55' : ''}`}>
      <BrandChip label={s.brand} bg={s.active ? s.bg : 'var(--surface-2)'} fg={s.active ? '#F4EDDC' : 'var(--muted)'} size={42} />
      <div className="min-w-0 flex-1">
        <p className="font-sans text-[13px] font-bold text-[var(--text)] leading-tight">{s.name}</p>
        <p className="font-sans text-[10.5px] text-[var(--muted)] mt-0.5">{s.freq} · {s.active ? `renueva ${s.next}` : 'pausada'}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-sans text-[13px] font-extrabold text-[var(--text)] tnum">{ars(s.amount)}</p>
        {s.usd && <p className="mt-0.5"><FxTag>{usd(s.usd, { dec: 2 })}</FxTag></p>}
      </div>
      <Toggle on={s.active} onClick={() => onToggle(s.id)} />
    </div>
  );
}

function ScreenCompromisos({ t, onNav }) {
  const [tab, setTab] = React.useState('cuotas');
  const [subs, setSubs] = React.useState(SUBS);
  const toggle = id => setSubs(list => list.map(s => s.id === id ? { ...s, active: !s.active } : s));

  const totalCuotas = INSTALLMENTS.reduce((s, p) => s + p.monthly, 0);
  const activeSubs = subs.filter(s => s.active);
  const burnRate = activeSubs.reduce((s, x) => s + x.amount, 0);

  return (
    <div className="pb-6">
      <ScreenHeader title="Compromisos" kicker="Lo que ya está jugado" sub="Cuotas y suscripciones, todo junto" />

      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'cuotas', label: 'Cuotas', icon: 'credit-card' },
        { id: 'subs', label: 'Suscripciones', icon: 'repeat' },
      ]} />

      {tab === 'cuotas' && (
        <>
          <div className="mx-5 mt-3 rounded-2xl bg-[var(--hero)] text-cream-light p-4 relative overflow-hidden">
            <div className="absolute -right-5 -top-5 opacity-20"><SolDeMayo size={92} color="var(--accent-soft)" /></div>
            <p className="font-sans text-[10.5px] uppercase tracking-[0.2em] text-celeste">Cuotas de este mes</p>
            <p className="font-poster text-[30px] tnum mt-1">{ars(totalCuotas)}</p>
            <p className="font-sans text-[11.5px] text-celeste mt-1">{INSTALLMENTS.length} planes activos · respeta el ciclo de cada tarjeta</p>
          </div>
          <div className="px-5 mt-3.5 space-y-3">
            {INSTALLMENTS.map(p => <InstallmentCard key={p.id} p={p} />)}
          </div>
        </>
      )}

      {tab === 'subs' && (
        <>
          <div className="mx-5 mt-3 rounded-2xl bg-[var(--hero)] text-cream-light p-4 relative overflow-hidden">
            <div className="absolute -right-5 -top-5 opacity-20"><SolDeMayo size={92} color="var(--accent-soft)" /></div>
            <div className="flex items-center gap-1.5 text-celeste text-[10.5px] uppercase tracking-[0.2em] font-bold"><Ic name="flame" size={13} />Burn rate mensual</div>
            <p className="font-poster text-[30px] tnum mt-1">{ars(burnRate)}</p>
            <p className="font-sans text-[11.5px] text-celeste mt-1">{activeSubs.length} suscripciones activas · ${(burnRate * 12 / 1000000).toFixed(1)}M al año</p>
          </div>
          <SectionTitle action="Agregar" onAction={() => {}}>Tus servicios</SectionTitle>
          <div className="mx-5">
            <Card className="overflow-hidden">
              {subs.map((s, i) => (
                <div key={s.id} className={i ? 'border-t border-[var(--border)]' : ''}><SubItem s={s} onToggle={toggle} /></div>
              ))}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { Tabs, ScreenCompromisos, InstallmentCard, SubItem });
