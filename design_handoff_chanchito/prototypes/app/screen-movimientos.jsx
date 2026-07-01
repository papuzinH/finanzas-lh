/* ============================================================
   Chanchito · App · Pantalla MOVIMIENTOS
   ============================================================ */

function MonthSwitcher({ month }) {
  return (
    <div className="flex items-center gap-2">
      <button className="grid place-items-center w-8 h-8 rounded-full bg-[var(--surface)] border-[1.5px] border-[var(--border)] text-[var(--text)]"><Ic name="chevron-left" size={16} stroke={2.4} /></button>
      <span className="font-sans text-[12.5px] font-extrabold text-[var(--text)] min-w-[78px] text-center">{month}</span>
      <button className="grid place-items-center w-8 h-8 rounded-full bg-[var(--surface)] border-[1.5px] border-[var(--border)] text-[var(--muted)]"><Ic name="chevron-right" size={16} stroke={2.4} /></button>
    </div>
  );
}

function MovItem({ m }) {
  const cat = CATS[m.cat];
  const method = METHODS[m.method];
  const inc = m.amount > 0;
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <CatIcon cat={m.cat} size={42} />
      <div className="min-w-0 flex-1">
        <p className="font-sans text-[13px] font-bold text-[var(--text)] truncate leading-tight">{m.desc}</p>
        <p className="font-sans text-[10.5px] text-[var(--muted)] truncate flex items-center gap-1 mt-0.5">
          <Ic name={method.icon} size={11} stroke={2} /> {method.name}{method.last} · {cat.name}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`font-sans text-[13.5px] font-extrabold tnum ${inc ? 'text-[var(--good)]' : 'text-[var(--text)]'}`}>{ars(m.amount, { sign: true })}</p>
        {m.usd && (
          <p className="mt-0.5"><FxTag>{usd(m.usd)} · {m.fx.replace('USD_', '')} {ars(FX[m.fx])}</FxTag></p>
        )}
      </div>
    </div>
  );
}

function ScreenMovimientos({ t, onNav }) {
  const [cat, setCat] = React.useState('todas');
  const [method, setMethod] = React.useState('todos');

  const filtered = MOVS.filter(m =>
    (cat === 'todas' || m.cat === cat) && (method === 'todos' || m.method === method));

  const income = filtered.filter(m => m.amount > 0).reduce((s, m) => s + m.amount, 0);
  const expense = filtered.filter(m => m.amount < 0).reduce((s, m) => s + m.amount, 0);

  // agrupar por día
  const groups = [];
  filtered.forEach(m => {
    let g = groups.find(x => x.day === m.day);
    if (!g) { g = { day: m.day, items: [] }; groups.push(g); }
    g.items.push(m);
  });

  const catFilters = [['todas', 'Todas', null], ...Object.entries(CATS).filter(([k]) => MOVS.some(m => m.cat === k)).map(([k, c]) => [k, c.name, c.icon])];
  const methodFilters = [['todos', 'Todos', 'sliders'], ...Object.entries(METHODS).map(([k, m]) => [k, m.name.split(' ')[0], m.icon])];

  return (
    <div className="pb-6">
      <ScreenHeader title="Movimientos" kicker="Tus mangos" sub="Todo lo que entra y sale"
        right={<MonthSwitcher month="Junio 2026" />} />

      {/* resumen */}
      <div className="px-5 grid grid-cols-2 gap-2.5">
        <Card className="p-3.5">
          <div className="flex items-center gap-1.5 text-[var(--good)] text-[10.5px] font-bold uppercase tracking-wider"><Ic name="arrow-down-left" size={13} stroke={2.6} />Ingresos</div>
          <p className="font-poster text-[var(--text)] text-[18px] tnum mt-1">{ars(income)}</p>
        </Card>
        <Card className="p-3.5">
          <div className="flex items-center gap-1.5 text-[var(--bad)] text-[10.5px] font-bold uppercase tracking-wider"><Ic name="arrow-up-right" size={13} stroke={2.6} />Gastos</div>
          <p className="font-poster text-[var(--text)] text-[18px] tnum mt-1">{ars(Math.abs(expense))}</p>
        </Card>
      </div>

      {/* filtros medios */}
      <div className="flex gap-2 overflow-x-auto px-5 mt-3.5 pb-0.5 no-sb">
        {methodFilters.map(([k, label, ic]) => (
          <Chip key={k} active={method === k} onClick={() => setMethod(k)} icon={ic}>{label}</Chip>
        ))}
      </div>
      {/* filtros categorías */}
      <div className="flex gap-2 overflow-x-auto px-5 mt-2 pb-0.5 no-sb">
        {catFilters.map(([k, label, ic]) => (
          <Chip key={k} active={cat === k} onClick={() => setCat(k)}>{k !== 'todas' ? CATS[k].emoji + ' ' : ''}{label}</Chip>
        ))}
      </div>

      {/* lista agrupada */}
      <div className="mt-4 space-y-4">
        {groups.map(g => (
          <div key={g.day}>
            <div className="px-5 mb-1.5 flex items-center justify-between">
              <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--muted)]">{g.day}</span>
              <span className="font-sans text-[11px] font-bold tnum text-[var(--faint)]">{ars(g.items.reduce((s, m) => s + m.amount, 0), { sign: true })}</span>
            </div>
            <div className="mx-5">
              <Card className="overflow-hidden">
                {g.items.map((m, i) => (
                  <div key={m.id} className={i ? 'border-t border-[var(--border)]' : ''}><MovItem m={m} /></div>
                ))}
              </Card>
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="px-5 py-12 text-center">
            <ChanchitoSeal size={56} disc="var(--accent)" />
            <p className="font-sans text-[13px] text-[var(--muted)] mt-3">No hay movimientos con esos filtros.</p>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ScreenMovimientos, MovItem, MonthSwitcher });
