/* ============================================================
   Chanchito · App · Pantalla OBJETIVOS (Metas + Presupuestos)
   ============================================================ */

function GoalCard({ g }) {
  const fmt = g.currency === 'USD' ? (v) => usd(v) : (v) => ars(v);
  const ratio = (g.current / g.target) * 100;
  const done = ratio >= 100;
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="grid place-items-center w-11 h-11 rounded-xl shrink-0 bg-[var(--accent-soft)] border-[1.5px] border-[var(--accent-deep)] text-[var(--accent-ink)]">
          <Ic name={g.icon} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-sans text-[14px] font-extrabold text-[var(--text)] leading-tight">{g.name}</p>
            {g.type === 'monthly' && <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--muted)] border border-[var(--border)]">mensual</span>}
          </div>
          <p className="font-sans text-[11px] text-[var(--muted)] mt-0.5 flex items-center gap-1"><Ic name="calendar" size={11} />{g.date}</p>
        </div>
        {done && <span className="grid place-items-center w-7 h-7 rounded-full bg-[var(--good)] text-white"><Ic name="check" size={15} stroke={3} /></span>}
      </div>
      <div className="mt-3 flex items-end justify-between">
        <p className="font-poster text-[var(--text)] text-[19px] tnum leading-none">{fmt(g.current)}</p>
        <p className="font-sans text-[11.5px] text-[var(--muted)] tnum">de {fmt(g.target)}</p>
      </div>
      <div className="mt-2"><Progress value={ratio} tone={done ? 'good' : 'accent'} height={9} /></div>
      <div className="mt-3 flex items-center gap-2">
        <Btn size="sm" variant="accent" className="flex-1"><Ic name="plus" size={14} stroke={2.6} />Aportar</Btn>
        <span className="font-sans text-[11px] font-bold text-[var(--muted)] tnum">{pct(ratio, { sign: false })}</span>
      </div>
    </Card>
  );
}

function BudgetRow({ b }) {
  const cat = CATS[b.cat];
  const ratio = (b.spent / b.budget) * 100;
  const over = b.spent - b.budget;
  const tone = ratio >= 100 ? 'bad' : ratio >= 75 ? 'warn' : 'good';
  const status = ratio >= 100 ? { t: 'Excedido', c: 'var(--bad)' } : ratio >= 75 ? { t: 'Atención', c: '#B97E16' } : { t: 'En regla', c: 'var(--good)' };
  return (
    <div className="px-3.5 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-2 font-sans text-[13px] font-bold text-[var(--text)]"><span className="text-[15px]">{cat.emoji}</span>{cat.name}</span>
        <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: `color-mix(in srgb, ${status.c} 15%, transparent)`, color: status.c }}>{status.t}</span>
      </div>
      <Progress value={ratio} tone={tone} height={8} />
      <div className="flex items-center justify-between mt-1.5">
        <span className="font-sans text-[11px] text-[var(--muted)] tnum">{ars(b.spent)} de {ars(b.budget)}</span>
        <span className="font-sans text-[11px] font-bold tnum" style={{ color: status.c }}>
          {over > 0 ? `${ars(over)} de más` : `quedan ${ars(-over)}`}
        </span>
      </div>
    </div>
  );
}

function ScreenObjetivos({ t, onNav }) {
  const [tab, setTab] = React.useState('metas');
  const totalSaved = GOALS.filter(g => g.currency === 'ARS').reduce((s, g) => s + g.current, 0);
  const overBudget = BUDGETS.filter(b => b.spent >= b.budget).length;

  return (
    <div className="pb-6">
      <ScreenHeader title="Objetivos" kicker="Hacia dónde va la guita" sub="Metas de ahorro y presupuestos" />

      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'metas', label: 'Metas', icon: 'target' },
        { id: 'presu', label: 'Presupuestos', icon: 'sliders' },
      ]} />

      {tab === 'metas' && (
        <>
          <div className="mx-5 mt-3 rounded-2xl bg-[var(--hero)] text-cream-light p-4 relative overflow-hidden">
            <div className="absolute -right-5 -top-6 opacity-20"><SolDeMayo size={96} color="var(--accent-soft)" /></div>
            <p className="font-sans text-[10.5px] uppercase tracking-[0.2em] text-celeste">Ahorrado en metas</p>
            <p className="font-poster text-[30px] tnum mt-1">{ars(totalSaved)}</p>
            <p className="font-sans text-[11.5px] text-celeste mt-1">{GOALS.length} metas activas · vas bien encaminado 💪</p>
          </div>
          <div className="px-5 mt-3.5 space-y-3">
            {GOALS.map(g => <GoalCard key={g.id} g={g} />)}
          </div>
          <div className="px-5 mt-3.5">
            <Btn variant="soft" size="md" className="w-full !border-dashed"><Ic name="plus-circle" size={16} />Crear nueva meta</Btn>
          </div>
        </>
      )}

      {tab === 'presu' && (
        <>
          <div className="px-5 mt-3 grid grid-cols-2 gap-2.5">
            <Card className="p-3.5">
              <p className="font-sans text-[10.5px] uppercase tracking-wider font-bold text-[var(--muted)]">Presupuestos</p>
              <p className="font-poster text-[var(--text)] text-[20px] mt-1">{BUDGETS.length}</p>
            </Card>
            <Card className="p-3.5">
              <p className="font-sans text-[10.5px] uppercase tracking-wider font-bold text-[var(--bad)]">Excedidos</p>
              <p className="font-poster text-[var(--text)] text-[20px] mt-1">{overBudget}</p>
            </Card>
          </div>
          <SectionTitle action="Agregar" onAction={() => {}}>Por categoría</SectionTitle>
          <div className="mx-5">
            <Card className="overflow-hidden">
              {BUDGETS.map((b, i) => (
                <div key={b.cat} className={i ? 'border-t border-[var(--border)]' : ''}><BudgetRow b={b} /></div>
              ))}
            </Card>
          </div>
          <div className="px-5 mt-3.5">
            <Banner icon="alert" tone="warn" title="Te pasaste en 2 rubros"
              body="Servicios y Cafetería superaron el tope de junio." cta="Ajustar presupuestos →" />
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { ScreenObjetivos, GoalCard, BudgetRow });
