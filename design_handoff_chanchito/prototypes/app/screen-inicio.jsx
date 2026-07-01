/* ============================================================
   Chanchito · App · Pantalla INICIO (Dashboard)
   ============================================================ */

function GreetingRow({ onSettings }) {
  return (
    <div className="flex items-center justify-between px-5 pt-1.5 pb-1">
      <div className="flex items-center gap-2.5">
        <ChanchitoSeal size={42} disc="var(--accent)" />
        <div>
          <p className="font-sans text-[11px] text-[var(--muted)] leading-none">Buenas, che 👋</p>
          <p className="font-poster text-[var(--text)] text-[19px] leading-tight">Hola, {USER.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="relative grid place-items-center w-10 h-10 rounded-full bg-[var(--surface)] border-[1.5px] border-[var(--border)] text-[var(--text)]">
          <Ic name="bell" size={18} />
          <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-rojo border border-[var(--surface)]" />
        </button>
        <button onClick={onSettings} className="grid place-items-center w-10 h-10 rounded-full bg-navy text-cream-light border-[1.5px] border-navy font-poster text-[13px]">
          {USER.initials}
        </button>
      </div>
    </div>
  );
}

/* ---------- Tarjeta de balance (3 variantes) ---------- */
function BalanceCard({ t, hidden, onToggleHide }) {
  const numFont = t.balanceFont === 'serif' ? 'font-serif font-semibold' : 'font-poster';
  const trend = MONTH.balance - MONTH.prevBalance;
  const trendPct = (trend / MONTH.prevBalance) * 100;

  const Money = ({ v, cls = '' }) => (
    <span className={`tnum ${cls}`}>{hidden ? '$ ••••••' : ars(v)}</span>
  );

  const mini = [
    { k: 'Ingresos', v: MONTH.income, ic: 'arrow-down-left', col: 'var(--accent-soft)' },
    { k: 'Gastos', v: MONTH.variableExpenses + MONTH.installmentsMonth + MONTH.burnRate, ic: 'arrow-up-right', col: '#E7A9A4' },
  ];

  return (
    <div className="mx-5 rounded-[26px] bg-[var(--hero)] text-[var(--hero-text)] p-5 relative overflow-hidden"
      style={{ boxShadow: '0 18px 36px -18px rgba(28,42,71,0.7)' }}>
      <div className="absolute -right-6 -top-6 opacity-90"><SolDeMayo size={108} color="var(--accent-soft)" style={{ opacity: .22 }} /></div>
      <div className="absolute inset-0 hatch-light opacity-40 pointer-events-none" />

      <div className="relative flex items-center justify-between">
        <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-celeste">Saldo disponible · {USER.month}</p>
        <button onClick={onToggleHide} className="text-celeste/80 hover:text-cream-light"><Ic name={hidden ? 'eye-off' : 'eye'} size={17} /></button>
      </div>

      <div className="relative mt-1.5 flex items-end gap-3">
        <Money v={MONTH.balance} cls={`${numFont} text-[40px] leading-[0.95]`} />
      </div>
      <div className="relative mt-2 inline-flex items-center gap-1.5 rounded-full bg-cream-light/12 px-2.5 py-1 text-[12px] font-bold text-celeste">
        <Ic name="trending-up" size={14} /> {pct(trendPct)} vs mayo · ahorrás {MONTH.savingRate}%
      </div>

      {t.balanceLayout === 'hero' && (
        <div className="relative mt-4 grid grid-cols-2 gap-2.5">
          {mini.map(m => (
            <div key={m.k} className="rounded-xl bg-cream-light/10 border border-cream-light/15 px-3 py-2">
              <div className="flex items-center gap-1.5 text-celeste text-[10.5px] font-bold uppercase tracking-wider">
                <Ic name={m.ic} size={12} stroke={2.6} />{m.k}
              </div>
              <p className="font-poster text-[16px] mt-0.5 tnum">{hidden ? '••••' : ars(m.v)}</p>
            </div>
          ))}
        </div>
      )}

      {t.balanceLayout === 'split' && (
        <div className="relative mt-4 flex divide-x divide-cream-light/15 rounded-xl bg-cream-light/8 border border-cream-light/12">
          {[
            { k: 'Ingresos', v: MONTH.income },
            { k: 'Gastos', v: MONTH.variableExpenses + MONTH.installmentsMonth },
            { k: 'Fijos', v: MONTH.burnRate },
          ].map(m => (
            <div key={m.k} className="flex-1 px-3 py-2.5 text-center">
              <p className="text-celeste text-[9.5px] font-bold uppercase tracking-wider">{m.k}</p>
              <p className="font-poster text-[14px] mt-0.5 tnum">{hidden ? '••' : ars(m.v)}</p>
            </div>
          ))}
        </div>
      )}

      {t.balanceLayout === 'stat' && (
        <div className="relative mt-4 flex items-center gap-2">
          <Btn variant="accent" size="sm" className="flex-1"><Ic name="plus" size={15} stroke={2.6} />Cargar gasto</Btn>
          <Btn variant="soft" size="sm" className="!bg-cream-light/12 !text-cream-light !border-cream-light/20 flex-1"><Ic name="repeat" size={15} />Transferir</Btn>
        </div>
      )}
    </div>
  );
}

/* ---------- Stat rápida ---------- */
function QuickStats() {
  const stats = [
    { k: 'Ingresos', v: MONTH.income, ic: 'arrow-down-left', tone: 'var(--good)' },
    { k: 'Gastos', v: MONTH.variableExpenses, ic: 'arrow-up-right', tone: 'var(--bad)' },
    { k: 'Burn rate', v: MONTH.burnRate, ic: 'flame', tone: 'var(--accent-deep)' },
  ];
  return (
    <div className="px-5 grid grid-cols-3 gap-2.5">
      {stats.map(s => (
        <Card key={s.k} className="p-3">
          <div className="grid place-items-center w-7 h-7 rounded-lg mb-1.5" style={{ background: `color-mix(in srgb, ${s.tone} 16%, transparent)`, color: s.tone }}>
            <Ic name={s.ic} size={15} stroke={2.4} />
          </div>
          <p className="font-poster text-[var(--text)] text-[14px] tnum leading-none">{ars(s.v)}</p>
          <p className="font-sans text-[10.5px] text-[var(--muted)] mt-1">{s.k}</p>
        </Card>
      ))}
    </div>
  );
}

/* ---------- Tendencia mensual ---------- */
function TrendCard() {
  return (
    <Card className="mx-5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-poster text-[var(--text)] text-[14px]">Tendencia · 6 meses</p>
          <p className="font-sans text-[11px] text-[var(--muted)] mt-0.5">Ingresos vs gastos</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold">
          <span className="flex items-center gap-1 text-[var(--muted)]"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--good)' }} />Ingr.</span>
          <span className="flex items-center gap-1 text-[var(--muted)]"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--bad)' }} />Gastos</span>
        </div>
      </div>
      <TrendBars data={TREND} />
    </Card>
  );
}

/* ---------- Comparador de categorías ---------- */
function CategoryCompare() {
  const max = Math.max(...CAT_COMPARE.map(c => Math.max(c.now, c.prev)));
  return (
    <Card className="mx-5 p-4">
      <p className="font-poster text-[var(--text)] text-[14px] mb-3">Categorías · junio vs mayo</p>
      <div className="space-y-3">
        {CAT_COMPARE.map(c => {
          const cat = CATS[c.cat];
          const diff = c.now - c.prev;
          return (
            <div key={c.cat}>
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 font-sans text-[12px] font-bold text-[var(--text)]"><span>{cat.emoji}</span>{cat.name}</span>
                <span className="flex items-center gap-1.5">
                  <span className="font-sans text-[12px] font-extrabold text-[var(--text)] tnum">{ars(c.now)}</span>
                  <span className={`text-[10px] font-bold tnum ${diff > 0 ? 'text-[var(--bad)]' : 'text-[var(--good)]'}`}>{pct((diff / c.prev) * 100)}</span>
                </span>
              </div>
              <div className="relative">
                <Progress value={(c.now / max) * 100} tone="accent" height={7} />
                <div className="absolute top-0 h-[7px] w-[2px] bg-[var(--text)] opacity-40 rounded" style={{ left: `${(c.prev / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="font-sans text-[10.5px] text-[var(--faint)] mt-3 flex items-center gap-1"><span className="inline-block w-[2px] h-3 bg-[var(--text)] opacity-40" /> la marca indica el mes anterior</p>
    </Card>
  );
}

/* ---------- Insights ---------- */
function Insights({ layout }) {
  const tones = {
    good: { bg: '#CDE7D8', ic: '#2E7D5B' },
    warn: { bg: '#F7E4B6', ic: '#B97E16' },
    neutral: { bg: '#CBE2EE', ic: '#3C708F' },
  };
  if (layout === 'stack') {
    return (
      <div className="px-5 space-y-2.5">
        {INSIGHTS.map((c, i) => {
          const tn = tones[c.tone];
          return (
            <div key={i} className="flex items-start gap-3 rounded-2xl bg-[var(--surface)] border-[1.5px] border-[var(--border)] p-3">
              <div className="grid place-items-center w-9 h-9 rounded-xl shrink-0" style={{ background: tn.bg, color: tn.ic }}><Ic name={c.icon} size={18} /></div>
              <div><p className="font-sans font-extrabold text-[var(--text)] text-[12.5px] leading-tight">{c.title}</p><p className="font-sans text-[11.5px] text-[var(--muted)] mt-0.5">{c.body}</p></div>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="flex gap-3 overflow-x-auto px-5 pb-1 no-sb snap-x">
      {INSIGHTS.map((c, i) => {
        const tn = tones[c.tone];
        return (
          <div key={i} className="snap-start shrink-0 w-[210px] rounded-2xl bg-[var(--surface)] border-[1.5px] border-[var(--border)] p-3.5">
            <div className="grid place-items-center w-9 h-9 rounded-xl mb-2.5" style={{ background: tn.bg, color: tn.ic }}><Ic name={c.icon} size={18} /></div>
            <p className="font-sans font-extrabold text-[var(--text)] text-[13px] leading-tight">{c.title}</p>
            <p className="font-sans text-[11.5px] text-[var(--muted)] mt-1 leading-snug">{c.body}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Mini lista de últimos movimientos ---------- */
function RecentMovs({ onNav }) {
  return (
    <Card className="mx-5 overflow-hidden">
      {MOVS.slice(0, 4).map((m, i) => {
        const cat = CATS[m.cat];
        return (
          <div key={m.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${i ? 'border-t border-[var(--border)]' : ''}`}>
            <CatIcon cat={m.cat} size={38} />
            <div className="min-w-0 flex-1">
              <p className="font-sans text-[12.5px] font-bold text-[var(--text)] truncate leading-tight">{m.desc}</p>
              <p className="font-sans text-[10.5px] text-[var(--muted)] truncate">{cat.name} · {m.day}</p>
            </div>
            <span className={`font-sans text-[13px] font-extrabold tnum ${m.amount < 0 ? 'text-[var(--bad)]' : 'text-[var(--good)]'}`}>{ars(m.amount, { sign: true })}</span>
          </div>
        );
      })}
    </Card>
  );
}

/* ---------- Overview presupuestos ---------- */
function BudgetOverview({ onNav }) {
  return (
    <Card className="mx-5 p-4">
      <div className="space-y-3">
        {BUDGETS.slice(0, 3).map(b => {
          const cat = CATS[b.cat];
          const ratio = (b.spent / b.budget) * 100;
          const tone = ratio >= 100 ? 'bad' : ratio >= 75 ? 'warn' : 'good';
          return (
            <div key={b.cat}>
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 font-sans text-[12px] font-bold text-[var(--text)]">{cat.emoji} {cat.name}</span>
                <span className="font-sans text-[11px] text-[var(--muted)] tnum">{ars(b.spent)} / {ars(b.budget)}</span>
              </div>
              <Progress value={ratio} tone={tone} height={7} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ScreenInicio({ t, onNav }) {
  const [hidden, setHidden] = React.useState(false);
  return (
    <div className="pb-6">
      <GreetingRow onSettings={() => {}} />
      <div className="mt-2"><BalanceCard t={t} hidden={hidden} onToggleHide={() => setHidden(h => !h)} /></div>

      <div className="mt-3"><QuickStats /></div>

      <div className="px-5 mt-4 space-y-2.5">
        <Banner icon="credit-card" tone="warn" title="Completá tu Visa Galicia"
          body="Falta el día de cierre para calcular bien tus cuotas." cta="Completar ahora →" />
      </div>

      <SectionTitle>Tu mes en números</SectionTitle>
      <TrendCard />
      <div className="mt-3"><CategoryCompare /></div>

      <SectionTitle action="Ver todo" onAction={() => {}}>Insights de Chanchito</SectionTitle>
      <Insights layout={t.insightsLayout} />

      <SectionTitle action="Ver todos" onAction={() => onNav('movimientos')}>Últimos movimientos</SectionTitle>
      <RecentMovs onNav={onNav} />

      <SectionTitle action="Gestionar" onAction={() => onNav('objetivos')}>Presupuestos</SectionTitle>
      <BudgetOverview onNav={onNav} />

      <div className="px-5 mt-4">
        <Banner icon="piggy" tone="info" title="Te sobran $182.230 este mes"
          body="¿Los mandamos a tu meta “Vacaciones Bariloche”?" cta="Guardar ahora →" />
      </div>
    </div>
  );
}

Object.assign(window, { ScreenInicio, BalanceCard, QuickStats, Insights, GreetingRow, RecentMovs });
