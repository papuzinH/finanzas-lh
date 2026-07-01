/* ============================================================
   Chanchito · UI Kit · Componentes
   ============================================================ */

function StatefulTabs({ tabs }) {
  const [a, setA] = React.useState(tabs[0].id);
  return <Tabs tabs={tabs} active={a} onChange={setA} />;
}
function StatefulToggle({ start = true }) {
  const [on, setOn] = React.useState(start);
  return <Toggle on={on} onClick={() => setOn(o => !o)} />;
}

function KitButtons() {
  return (
    <KitSection id="botones" n="07" title="Botones" desc="Componente <Btn variant size>. Acento por defecto, con sombra-offset sólida que se hunde al presionar. Navy para acción primaria sobre claro, soft para secundaria, ghost para terciaria.">
      <div className="grid sm:grid-cols-2 gap-4">
        <Spec label="Variantes"
          api={[['variant', "'accent'|'navy'|'soft'|'ghost'"], ['size', "'sm'|'md'|'lg'"], ['...rest', 'onClick, disabled, type']]}
          specs={[['Radio', 'full (pill)'], ['Borde', '1.5px accent-deep'], ['Sombra', '3px 3px 0 solid'], ['Activo', 'translate-y 2px']]}>
          <div className="flex flex-wrap items-center gap-3">
            <Btn variant="accent">Acento</Btn>
            <Btn variant="navy">Navy</Btn>
            <Btn variant="soft">Soft</Btn>
            <Btn variant="ghost">Ghost</Btn>
          </div>
        </Spec>
        <Spec label="Tamaños" note="sm · md · lg"
          specs={[['sm', '36px alto · 12.5px'], ['md', '42px alto · 13.5px'], ['lg', '48px alto · 15px'], ['Touch', 'hit-area ≥ 44px']]}
          responsive="En filas estrechas usar size sm; el ancho se controla con className w-full. El texto nunca baja de 12.5px.">
          <div className="flex flex-wrap items-center gap-3">
            <Btn size="sm" variant="accent">Small</Btn>
            <Btn size="md" variant="accent">Medium</Btn>
            <Btn size="lg" variant="accent">Large</Btn>
          </div>
        </Spec>
        <Spec label="Con ícono">
          <div className="flex flex-wrap items-center gap-3">
            <Btn variant="accent"><Ic name="plus" size={15} stroke={2.6} />Cargar gasto</Btn>
            <Btn variant="soft"><Ic name="repeat" size={15} />Transferir</Btn>
            <Btn variant="navy"><Ic name="sparkle" size={15} />IA</Btn>
          </div>
        </Spec>
        <Spec label="Ancho completo · deshabilitado">
          <div className="space-y-3">
            <Btn variant="accent" className="w-full"><Ic name="check" size={16} stroke={2.6} />Confirmar</Btn>
            <Btn variant="soft" className="w-full !border-dashed"><Ic name="plus-circle" size={16} />Crear nueva meta</Btn>
            <Btn variant="accent" className="w-full opacity-40 pointer-events-none">Deshabilitado</Btn>
          </div>
        </Spec>
        <Spec label="FAB · chat" className="sm:col-span-2"
          api={[['onClick', 'abre el panel de chat'], ['badge', 'sparkle (novedad)']]}
          specs={[['Tamaño', '56×56px'], ['Posición', 'abs right-16 bottom-92'], ['Sombra', '4px 5px 0 solid'], ['z-index', '30 (sobre nav)']]}
          responsive="Anclado al viewport del teléfono, no a la página. Respeta safe-area inferior y queda por encima de la bottom-nav.">
          <div className="flex items-center gap-5">
            <div className="relative w-16 h-16">
              <button className="grid place-items-center w-14 h-14 rounded-full bg-[var(--accent)] border-[1.5px] border-[var(--accent-deep)] text-[var(--accent-ink)]" style={{ boxShadow: '4px 5px 0 0 var(--accent-deep)' }}>
                <Chanchito size={34} fill="var(--accent-ink)" stroke="var(--accent)" face="var(--accent)" />
                <span className="absolute -top-1 -right-1 grid place-items-center w-5 h-5 rounded-full bg-rojo text-cream-light border-[1.5px] border-[var(--accent)]"><Ic name="sparkle" size={11} /></span>
              </button>
            </div>
            <div className="flex gap-2.5">
              <button className="grid place-items-center w-10 h-10 rounded-full bg-[var(--surface)] text-[var(--text)] border-[1.5px] border-[var(--border)]"><Ic name="mic" size={18} /></button>
              <button className="grid place-items-center w-10 h-10 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] border-[1.5px] border-[var(--accent-deep)]"><Ic name="send" size={17} /></button>
              <button className="grid place-items-center w-10 h-10 rounded-full bg-[var(--surface)] text-[var(--text)] border-[1.5px] border-[var(--border)]"><Ic name="plus" size={18} stroke={2.4} /></button>
            </div>
          </div>
        </Spec>
      </div>
    </KitSection>
  );
}

function KitChips() {
  return (
    <KitSection id="chips" n="08" title="Chips & tabs" desc="Chips para filtros (medio de pago, categoría) y tabs/segmented para alternar vistas dentro de una pantalla.">
      <div className="grid sm:grid-cols-2 gap-4">
        <Spec label="Chips de filtro"
          api={[['active', 'bool'], ['onClick', 'fn'], ['icon', 'name opcional']]}
          specs={[['Alto', '36px'], ['Radio', 'full'], ['Activo', 'bg accent'], ['Scroll', 'X, sin wrap']]}
          responsive="Fila scrolleable en X con .no-sb. En mobile nunca wrapean: el usuario desliza para ver más filtros.">
          <div className="flex flex-wrap gap-2">
            <Chip active icon="sliders">Todos</Chip>
            <Chip icon="credit-card">Visa</Chip>
            <Chip icon="wallet">Mercado Pago</Chip>
            <Chip>🛒 Súper</Chip>
            <Chip>☕ Café</Chip>
          </div>
        </Spec>
        <Spec label="Quick replies (chat)">
          <div className="flex flex-wrap gap-2">
            {['¿Cómo voy este mes?', 'Gasté 3 lucas', '¿Cuánto sale Netflix?'].map(q => (
              <span key={q} className="rounded-full px-3 py-1.5 text-[11.5px] font-bold bg-[var(--surface)] border-[1.5px] border-[var(--border)] text-[var(--text)]">{q}</span>
            ))}
          </div>
        </Spec>
        <Spec label="Tabs · 2 opciones"
          api={[['tabs', '[{id,label,icon}]'], ['active', 'id'], ['onChange', 'fn']]}
          specs={[['Tipo', 'segmented pill'], ['Alto', '40px'], ['Activo', 'bg accent']]}
          responsive="Hasta 3 opciones cortas; con más usar scroll o un select. Cada tab reparte el ancho por igual (flex-1).">
          <StatefulTabs tabs={[{ id: 'a', label: 'Cuotas', icon: 'credit-card' }, { id: 'b', label: 'Suscripciones', icon: 'repeat' }]} />
        </Spec>
        <Spec label="Tabs · 3 opciones">
          <StatefulTabs tabs={[{ id: 'a', label: 'Resumen', icon: 'chart' }, { id: 'b', label: 'Activos', icon: 'list' }, { id: 'c', label: 'Cargar', icon: 'plus-circle' }]} />
        </Spec>
      </div>
    </KitSection>
  );
}

function KitInputs() {
  return (
    <KitSection id="inputs" n="09" title="Inputs & controles" desc="Campos de formulario, búsqueda, selector de moneda y switch. Borde 1.5px, fondo surface-2, radio 12px.">
      <div className="grid sm:grid-cols-2 gap-4">
        <Spec label="Campos de texto"
          api={[['label', 'string'], ['placeholder', 'string']]}
          specs={[['Alto', '44px'], ['Radio', '12px (md)'], ['Borde', '1.5px'], ['Fondo', 'surface-2']]}
          responsive="Grid de 2 columnas que colapsa a 1 en anchos chicos. Label arriba siempre (no flotante) para legibilidad mobile.">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Ticker" placeholder="AAPL" />
            <Field label="Cantidad" placeholder="10" />
            <Field label="Precio" placeholder="$ 16.850" />
            <Field label="Moneda" placeholder="ARS" />
          </div>
        </Spec>
        <Spec label="Búsqueda">
          <div className="flex items-center gap-2 px-3.5 py-3 rounded-xl bg-[var(--surface-2)] border-[1.5px] border-[var(--border)]">
            <Ic name="search" size={17} className="text-[var(--muted)]" />
            <span className="font-sans text-[13px] text-[var(--faint)]">Buscar movimiento…</span>
          </div>
        </Spec>
        <Spec label="Selector de moneda · bimonetario"
          api={[['value', "'ARS'|'USD'"], ['onChange', 'fn']]}
          specs={[['Tipo', 'segmented pill'], ['FX tag', 'snapshot al cargar']]}
          responsive="Compacto para caber en headers y filas. La cotización se guarda en el momento de la operación.">
          <div className="flex items-center gap-3">
            <div className="flex gap-1 p-0.5 rounded-full bg-[var(--surface-2)] border-[1.5px] border-[var(--border)]">
              <button className="px-3 py-1 rounded-full text-[12px] font-extrabold bg-[var(--accent)] text-[var(--accent-ink)]">ARS</button>
              <button className="px-3 py-1 rounded-full text-[12px] font-extrabold text-[var(--muted)]">USD</button>
            </div>
            <FxTag>MEP $ 1.485</FxTag>
          </div>
        </Spec>
        <Spec label="Switch · activo / inactivo"
          api={[['on', 'bool'], ['onClick', 'fn']]}
          specs={[['Tamaño', '44×26px'], ['Touch', '≥ 44px'], ['Knob', '18px']]}>
          <div className="flex items-center gap-5">
            <StatefulToggle start={true} />
            <StatefulToggle start={false} />
          </div>
        </Spec>
      </div>
    </KitSection>
  );
}

function PortfolioHeroDemo() {
  const st = portfolioStats();
  return (
    <div className="rounded-[24px] bg-[var(--hero)] text-cream-light p-5 relative overflow-hidden" style={{ boxShadow: '0 18px 36px -18px rgba(28,42,71,0.7)' }}>
      <div className="absolute -right-6 -top-6 opacity-20"><SolDeMayo size={100} color="var(--accent-soft)" /></div>
      <p className="font-sans text-[10.5px] uppercase tracking-[0.2em] text-celeste relative">Valor del portfolio</p>
      <p className="font-poster text-[32px] tnum mt-1 relative">{ars(st.value)}</p>
      <span className="relative inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold bg-[#2E7D5B]/30 text-[#9be8bf] mt-2"><Ic name="trending-up" size={14} />{ars(st.pnl)} ({pct(st.pnlPct)})</span>
    </div>
  );
}

function KitCards() {
  const tHero = { balanceLayout: 'hero', balanceFont: 'poster' };
  const tSplit = { balanceLayout: 'split', balanceFont: 'poster' };
  const tStat = { balanceLayout: 'stat', balanceFont: 'serif' };
  return (
    <KitSection id="cards" n="10" title="Cards" desc="Superficie base + variantes especializadas. La tarjeta de saldo (hero navy) es la firma del producto y tiene 3 layouts conmutables.">
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <Spec label="Card base"
          api={[['as', 'tag (div)'], ['className', 'extra'], ['children', 'contenido']]}
          specs={[['Radio', '16px (lg)'], ['Borde', '1.5px'], ['Sombra', 'hairline'], ['Padding', '16px típico']]}>
          <Card className="p-4"><p className="font-sans text-[13px] text-[var(--text)] font-bold">Contenido</p><p className="font-sans text-[12px] text-[var(--muted)] mt-1">Superficie con borde 1.5px y radio 16px.</p></Card>
        </Spec>
        <Spec label="Stat card" className="sm:col-span-2"
          specs={[['Grid', '3 columnas'], ['Min', '~104px'], ['Número', 'font-poster 14px']]}
          responsive="3 columnas fijas en mobile; el valor usa tabular-nums para alinear. Escalable a 4–6 en web.">
          <QuickStats />
        </Spec>
      </div>
      <p className="font-sans text-[12px] font-extrabold uppercase tracking-wider text-navy/50 mb-2">Tarjeta de saldo · 3 layouts · <code className="font-mono normal-case text-[11px] text-celeste-deep">t.balanceLayout</code></p>
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <Spec label="Layout “Saldo”" api={[['t.balanceLayout', "'hero'"]]}><BalanceCard t={tHero} hidden={false} onToggleHide={() => {}} /></Spec>
        <Spec label="Layout “Columnas”" api={[['t.balanceLayout', "'split'"]]}><BalanceCard t={tSplit} hidden={false} onToggleHide={() => {}} /></Spec>
        <Spec label="Layout “Acción” · serif" api={[['t.balanceLayout', "'stat'"], ['t.balanceFont', "'serif'"]]}><BalanceCard t={tStat} hidden={false} onToggleHide={() => {}} /></Spec>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Spec label="Portfolio hero"><PortfolioHeroDemo /></Spec>
        <Spec label="Section title">
          <div className="bg-[var(--bg)] -mx-5 -my-5 py-3">
            <SectionTitle action="Ver todos" onAction={() => {}}>Últimos movimientos</SectionTitle>
          </div>
        </Spec>
      </div>
    </KitSection>
  );
}

function KitBadges() {
  return (
    <KitSection id="badges" n="11" title="Badges & estados" desc="Píldoras de estado para presupuestos, etiquetas de tipo, snapshot de cambio y chips de marca para servicios.">
      <div className="grid sm:grid-cols-2 gap-4">
        <Spec label="Estado de presupuesto">
          <div className="flex flex-wrap gap-2.5">
            {[['En regla', '#2E7D5B'], ['Atención', '#B97E16'], ['Excedido', '#C2403A']].map(([t, c]) => (
              <span key={t} className="text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full" style={{ background: `color-mix(in srgb, ${c} 15%, transparent)`, color: c }}>{t}</span>
            ))}
          </div>
        </Spec>
        <Spec label="Etiquetas / tags">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--muted)] border border-[var(--border)]">mensual</span>
            <FxTag>U$S 20 · MEP $ 1.485</FxTag>
            <span className="relative inline-grid place-items-center w-9 h-9 rounded-full bg-[var(--surface)] border-[1.5px] border-[var(--border)] text-[var(--text)]"><Ic name="bell" size={16} /><span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-rojo border border-[var(--surface)]" /></span>
          </div>
        </Spec>
        <Spec label="Chips de marca · servicios" className="sm:col-span-2">
          <div className="flex flex-wrap gap-3">
            {SUBS.slice(0, 6).map(s => (
              <div key={s.id} className="flex items-center gap-2">
                <BrandChip label={s.brand} bg={s.bg} size={40} />
                <span className="font-sans text-[12px] font-bold text-[var(--text)]">{s.name}</span>
              </div>
            ))}
          </div>
        </Spec>
      </div>
    </KitSection>
  );
}

function KitProgress() {
  const st = portfolioStats();
  const segments = Object.entries(st.byType).map(([k, v]) => ({ key: k, value: v, color: ASSET_TYPES[k].color, label: ASSET_TYPES[k].label }));
  return (
    <KitSection id="progreso" n="12" title="Progreso & charts" desc="Barras de progreso con semántica de color, barras de tendencia ingreso/gasto y donut de distribución por tipo de activo.">
      <div className="grid sm:grid-cols-2 gap-4">
        <Spec label="Barras de progreso"
          api={[['value', '0–100'], ['tone', "'accent'|'good'|'warn'|'bad'"], ['height', 'px (8)']]}
          specs={[['Radio', 'full'], ['Track', 'surface-2'], ['Borde', '1px']]}
          responsive="Full-width del contenedor. El color comunica estado del presupuesto: warn ≥ 75%, bad ≥ 100%.">
          <div className="space-y-3">
            {[['Acento', 'accent', 64], ['OK / good', 'good', 40], ['Atención 75%+', 'warn', 82], ['Excedido 100%+', 'bad', 100]].map(([l, tone, v]) => (
              <div key={l}>
                <div className="flex justify-between mb-1"><span className="font-sans text-[11.5px] font-bold text-[var(--text)]">{l}</span><span className="font-mono text-[10.5px] text-[var(--muted)]">{v}%</span></div>
                <Progress value={v} tone={tone} />
              </div>
            ))}
          </div>
        </Spec>
        <Spec label="Tendencia · ingreso vs gasto">
          <TrendBars data={TREND} />
        </Spec>
        <Spec label="Donut · distribución" className="sm:col-span-2"
          api={[['segments', '[{value,color,label}]'], ['size', 'px'], ['stroke', 'px'], ['center', 'node']]}
          specs={[['Default', '120×120 · stroke 19'], ['Leyenda', 'a la derecha']]}
          responsive="Donut + leyenda en fila; en anchos chicos la leyenda pasa debajo. El SVG escala con size.">
          <div className="flex items-center gap-5">
            <Donut segments={segments} size={120} stroke={19} center={<div className="text-center"><p className="font-poster text-[var(--text)] text-[15px] leading-none">{segments.length}</p><p className="font-sans text-[9px] text-[var(--muted)]">tipos</p></div>} />
            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2">
              {segments.map(s => (
                <div key={s.key} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} /><span className="font-sans text-[11.5px] font-bold text-[var(--text)] flex-1">{s.label}</span><span className="font-sans text-[11px] text-[var(--muted)] tnum">{Math.round((s.value / st.value) * 100)}%</span></div>
              ))}
            </div>
          </div>
        </Spec>
      </div>
    </KitSection>
  );
}

function KitAlerts() {
  return (
    <KitSection id="alerts" n="13" title="Alertas & banners" desc="Avisos contextuales del dashboard. Tres tonos: accent (acción/ahorro), warn (atención), info (sugerencia).">
      <div className="grid sm:grid-cols-2 gap-4">
        <Spec label="Tono warn"
          api={[['icon', 'name'], ['tone', "'accent'|'warn'|'info'"], ['title', 's'], ['body', 's'], ['cta', 's?'], ['onClose', 'fn?']]}
          specs={[['Radio', '16px'], ['Borde', '1.5px tono'], ['Ícono', '36px chip']]}
          responsive="Full-width con margen lateral 20px. El texto usa text-wrap y el CTA es subrayado, no botón, para no competir."><Banner icon="credit-card" tone="warn" title="Completá tu Visa Galicia" body="Falta el día de cierre para calcular bien tus cuotas." cta="Completar ahora →" /></Spec>
        <Spec label="Tono info"><Banner icon="piggy" tone="info" title="Te sobran $182.230 este mes" body="¿Los mandamos a tu meta “Vacaciones Bariloche”?" cta="Guardar ahora →" /></Spec>
        <Spec label="Tono accent"><Banner icon="sparkle" tone="accent" title="Cobraste U$S 350 freelance" body="Lo guardamos al MEP $1.485 del día." /></Spec>
        <Spec label="Con cerrar"><Banner icon="alert" tone="warn" title="Te pasaste en 2 rubros" body="Servicios y Cafetería superaron el tope." cta="Ajustar →" onClose={() => {}} /></Spec>
      </div>
    </KitSection>
  );
}

Object.assign(window, { KitButtons, KitChips, KitInputs, KitCards, KitBadges, KitProgress, KitAlerts, StatefulTabs, StatefulToggle });
