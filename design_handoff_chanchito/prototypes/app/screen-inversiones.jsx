/* ============================================================
   Chanchito · App · Pantalla INVERSIONES (portfolio bimonetario)
   ============================================================ */

function PriceStatusBar() {
  return (
    <div className="mx-5 mt-3 flex items-center gap-2 rounded-full bg-[var(--surface)] border-[1.5px] border-[var(--border)] px-3 py-2">
      <span className="w-2 h-2 rounded-full bg-[var(--good)] animate-pulse" />
      <span className="font-sans text-[11px] font-bold text-[var(--text)]">Precios en vivo</span>
      <span className="font-sans text-[11px] text-[var(--muted)]">· actualizado {FX.updated}</span>
      <span className="ml-auto font-sans text-[10.5px] text-[var(--muted)] tnum">MEP {ars(FX.USD_MEP)}</span>
    </div>
  );
}

function InvDashboard({ cur, setCur }) {
  const st = portfolioStats();
  const toCur = (ars_) => cur === 'USD' ? ars_ / FX.USD_MEP : ars_;
  const fmt = (ars_) => cur === 'USD' ? usd(toCur(ars_)) : ars(ars_);
  const segments = Object.entries(st.byType).map(([k, v]) => ({ key: k, value: v, color: ASSET_TYPES[k].color, label: ASSET_TYPES[k].label }));

  return (
    <>
      {/* card portfolio */}
      <div className="mx-5 mt-3 rounded-[24px] bg-[var(--hero)] text-cream-light p-5 relative overflow-hidden"
        style={{ boxShadow: '0 18px 36px -18px rgba(28,42,71,0.7)' }}>
        <div className="absolute -right-6 -top-6 opacity-20"><SolDeMayo size={108} color="var(--accent-soft)" /></div>
        <div className="relative flex items-center justify-between">
          <p className="font-sans text-[10.5px] uppercase tracking-[0.2em] text-celeste">Valor del portfolio</p>
          <div className="flex gap-1 p-0.5 rounded-full bg-cream-light/12 border border-cream-light/15">
            {['ARS', 'USD'].map(c => (
              <button key={c} onClick={() => setCur(c)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold transition-colors ${cur === c ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-celeste'}`}>{c}</button>
            ))}
          </div>
        </div>
        <p className="font-poster text-[34px] tnum mt-1.5 leading-none">{fmt(st.value)}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${st.pnl >= 0 ? 'bg-[#2E7D5B]/30 text-[#9be8bf]' : 'bg-rojo/30 text-[#f3b4b0]'}`}>
            <Ic name={st.pnl >= 0 ? 'trending-up' : 'trending-down'} size={14} />{fmt(Math.abs(st.pnl))} ({pct(st.pnlPct)})
          </span>
          <span className="font-sans text-[11px] text-celeste">total</span>
        </div>
      </div>

      {/* distribución */}
      <Card className="mx-5 mt-3 p-4">
        <p className="font-poster text-[var(--text)] text-[14px] mb-3">Distribución por tipo</p>
        <div className="flex items-center gap-4">
          <Donut segments={segments} size={120} stroke={19}
            center={<div><p className="font-poster text-[var(--text)] text-[15px] leading-none">{segments.length}</p><p className="font-sans text-[9px] text-[var(--muted)]">tipos</p></div>} />
          <div className="flex-1 space-y-2">
            {segments.map(s => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                <span className="font-sans text-[11.5px] font-bold text-[var(--text)] flex-1">{s.label}</span>
                <span className="font-sans text-[11px] text-[var(--muted)] tnum">{Math.round((s.value / st.value) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* card ahorro */}
      <div className="px-5 mt-3">
        <Banner icon="piggy" tone="info" title="Tenés U$S 1.200 en USDT quietos"
          body="Podrías pasarlos a un FCI que rinde ~4% anual en dólares." cta="Ver opciones →" />
      </div>
    </>
  );
}

function AssetRow({ a, cur }) {
  const valueARS = assetValueARS(a);
  const costARS = assetCostARS(a);
  const pnl = valueARS - costARS;
  const pnlPct = (pnl / costARS) * 100;
  const tipo = ASSET_TYPES[a.type];
  const fmtVal = cur === 'USD' ? usd(valueARS / FX.USD_MEP) : ars(valueARS);
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <div className="grid place-items-center w-11 h-11 rounded-xl shrink-0 font-poster text-[12px] border-[1.5px]"
        style={{ background: `${tipo.color}1c`, borderColor: `${tipo.color}55`, color: tipo.color }}>
        {a.ticker.slice(0, 4)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-sans text-[13px] font-bold text-[var(--text)] leading-tight truncate">{a.name}</p>
        <p className="font-sans text-[10.5px] text-[var(--muted)] mt-0.5">
          {a.qty.toLocaleString('es-AR')} {a.type === 'cripto' ? a.ticker : 'nom.'} · <span className="uppercase">{tipo.label}</span>
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-sans text-[13px] font-extrabold text-[var(--text)] tnum">{fmtVal}</p>
        <p className={`font-sans text-[11px] font-bold tnum ${pnl >= 0 ? 'text-[var(--good)]' : 'text-[var(--bad)]'}`}>{pct(pnlPct)}</p>
      </div>
    </div>
  );
}

function CargaRapida() {
  const [type, setType] = React.useState('cedear');
  return (
    <div className="px-5 mt-3.5 space-y-3">
      <Card className="p-4">
        <p className="font-poster text-[var(--text)] text-[14px] mb-3">Cargar operación</p>
        <div className="space-y-3">
          <div>
            <label className="font-sans text-[11px] font-bold text-[var(--muted)] uppercase tracking-wide">Tipo de activo</label>
            <div className="flex gap-2 overflow-x-auto mt-1.5 no-sb pb-0.5">
              {Object.entries(ASSET_TYPES).map(([k, v]) => (
                <Chip key={k} active={type === k} onClick={() => setType(k)}>{v.label}</Chip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Ticker" placeholder="AAPL" />
            <Field label="Cantidad" placeholder="10" />
            <Field label="Precio" placeholder="$ 16.850" />
            <Field label="Moneda" placeholder="ARS" />
          </div>
        </div>
        <Btn variant="accent" size="md" className="w-full mt-4"><Ic name="check" size={16} stroke={2.6} />Agregar al portfolio</Btn>
      </Card>
      <Banner icon="info" tone="info" title="Snapshot del tipo de cambio"
        body={`Guardamos la cotización del momento (MEP ${ars(FX.USD_MEP)}) para calcular bien la ganancia.`} />
    </div>
  );
}

function Field({ label, placeholder }) {
  return (
    <div>
      <label className="font-sans text-[10.5px] font-bold text-[var(--muted)] uppercase tracking-wide">{label}</label>
      <div className="mt-1 px-3 py-2.5 rounded-xl bg-[var(--surface-2)] border-[1.5px] border-[var(--border)] font-sans text-[13px] text-[var(--faint)]">{placeholder}</div>
    </div>
  );
}

function ScreenInversiones({ t, onNav }) {
  const [tab, setTab] = React.useState('dash');
  const [cur, setCur] = React.useState('ARS');

  return (
    <div className="pb-6">
      <ScreenHeader title="Inversiones" kicker="Que la plata laburе" sub="Tu portfolio en pesos y dólares" />
      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'dash', label: 'Resumen', icon: 'chart' },
        { id: 'activos', label: 'Activos', icon: 'list' },
        { id: 'carga', label: 'Cargar', icon: 'plus-circle' },
      ]} />

      {tab !== 'carga' && <PriceStatusBar />}

      {tab === 'dash' && <InvDashboard cur={cur} setCur={setCur} />}

      {tab === 'activos' && (
        <>
          <div className="flex items-center justify-between px-5 mt-3.5 mb-2">
            <span className="font-poster text-[var(--text)] text-[14px]">{INVEST.length} activos</span>
            <div className="flex gap-1 p-0.5 rounded-full bg-[var(--surface-2)] border-[1.5px] border-[var(--border)]">
              {['ARS', 'USD'].map(c => (
                <button key={c} onClick={() => setCur(c)} className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${cur === c ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--muted)]'}`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="mx-5">
            <Card className="overflow-hidden">
              {INVEST.map((a, i) => (
                <div key={a.ticker} className={i ? 'border-t border-[var(--border)]' : ''}><AssetRow a={a} cur={cur} /></div>
              ))}
            </Card>
          </div>
        </>
      )}

      {tab === 'carga' && <CargaRapida />}
    </div>
  );
}

Object.assign(window, { ScreenInversiones, AssetRow, PriceStatusBar, Field });
