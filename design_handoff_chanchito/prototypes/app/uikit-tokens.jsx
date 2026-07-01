/* ============================================================
   Chanchito · UI Kit · Tokens & Responsive (handoff)
   ============================================================ */

function KitTokens() {
  const color = [
    { token: '--bg', value: '#F4EDDC', swatch: '#F4EDDC', use: 'Fondo de pantalla (papel crema)' },
    { token: '--bg-2', value: '#FBF7EC', swatch: '#FBF7EC', use: 'Fondo de barras / nav' },
    { token: '--surface', value: '#FFFFFF', swatch: '#FFFFFF', use: 'Cards y superficies' },
    { token: '--surface-2', value: '#FBF7EC', swatch: '#FBF7EC', use: 'Inputs, tracks, fondos sutiles' },
    { token: '--text', value: '#1C2A47', swatch: '#1C2A47', use: 'Texto principal' },
    { token: '--muted', value: '#5b6577', swatch: '#5b6577', use: 'Texto secundario' },
    { token: '--faint', value: 'navy 50%', swatch: '#8d94a1', use: 'Placeholders, hints' },
    { token: '--border', value: 'navy 16%', swatch: '#cdd3dd', use: 'Bordes 1.5px' },
    { token: '--accent', value: '#5E98BC', swatch: '#5E98BC', use: 'Acento (celeste por defecto)' },
    { token: '--accent-deep', value: '#3C708F', swatch: '#3C708F', use: 'Sombra-offset, hover' },
    { token: '--accent-soft', value: '#A9CFE0', swatch: '#A9CFE0', use: 'Fondos de acento suaves' },
    { token: '--accent-ink', value: '#FBF7EC', swatch: '#FBF7EC', use: 'Texto sobre acento' },
    { token: '--hero', value: '#1C2A47', swatch: '#1C2A47', use: 'Tarjeta de saldo / portfolio' },
    { token: '--good', value: '#2E7D5B', swatch: '#2E7D5B', use: 'Ingresos / positivo' },
    { token: '--bad', value: '#C2403A', swatch: '#C2403A', use: 'Gastos / negativo' },
  ];
  const type = [
    { token: 'font-poster', value: 'Alfa Slab One', use: 'Saldos, títulos, números display' },
    { token: 'font-serif', value: 'Bodoni Moda', use: 'Frases editoriales' },
    { token: 'font-script', value: 'Yellowtail', use: 'Tagline / flourish' },
    { token: 'font-sans', value: 'DM Sans 400–800', use: 'Toda la UI' },
    { token: 'text-display', value: '40 / 0.95', use: 'Saldo principal' },
    { token: 'text-h1', value: '28 / 1.0', use: 'Título de pantalla' },
    { token: 'text-h2', value: '15 / 1.1', use: 'Título de sección' },
    { token: 'text-body', value: '13 / 1.4', use: 'Cuerpo UI' },
    { token: 'text-label', value: '11 / 0.16em', use: 'Etiquetas mayúsculas' },
    { token: 'text-micro', value: '10.5 / 1.3', use: 'Metadatos, captions' },
  ];
  const space = [
    { token: 'space-1', value: '4px', use: 'Gaps mínimos entre íconos/labels' },
    { token: 'space-2', value: '8px', use: 'Gap base de chips, stacks' },
    { token: 'space-3', value: '12px', use: 'Padding interno de filas' },
    { token: 'space-4', value: '16px', use: 'Padding de cards' },
    { token: 'space-5', value: '20px', use: 'Margen lateral de pantalla' },
    { token: 'space-6', value: '24px', use: 'Separación entre secciones' },
  ];
  const radius = [
    { token: 'radius-sm', value: '8px', use: 'Tags, chips de marca' },
    { token: 'radius-md', value: '12px', use: 'Inputs, íconos de categoría' },
    { token: 'radius-lg', value: '16px', use: 'Cards' },
    { token: 'radius-xl', value: '22px', use: 'Tarjeta de saldo' },
    { token: 'radius-2xl', value: '26px', use: 'Hero / portfolio' },
    { token: 'radius-full', value: '999px', use: 'Botones, pills, nav' },
  ];
  const shadow = [
    { token: 'shadow-card', value: '0 1px 0 0 border', use: 'Card base (hairline)' },
    { token: 'shadow-float', value: '0 18px 36px -18px navy/.7', use: 'Hero, FABs, modales' },
    { token: 'shadow-offset', value: '3px 3px 0 0 accent-deep', use: 'Botones (sólida)' },
    { token: 'shadow-fab', value: '4px 5px 0 0 accent-deep', use: 'FAB de chat' },
    { token: 'border-width', value: '1.5px', use: 'Todos los bordes del sistema' },
  ];
  return (
    <KitSection id="tokens" title="Tokens"
      desc="Variables del sistema listas para mapear a CSS custom properties o a un theme de código. El acento y el modo (claro/oscuro) se cambian sólo reescribiendo las vars de color — el resto del kit las consume.">
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="lg:col-span-2"><TokenTable title="Color · semántico (CSS vars)" rows={color} /></div>
        <TokenTable title="Tipografía" rows={type} />
        <TokenTable title="Espaciado · grid 4px" rows={space} />
        <TokenTable title="Radios" rows={radius} />
        <TokenTable title="Elevación & bordes" rows={shadow} />
      </div>
      <div className="mt-4 rounded-2xl border-[1.5px] border-navy/12 overflow-hidden">
        <div className="px-3.5 py-2 bg-navy/[0.035] border-b border-navy/10">
          <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] text-navy/55">Tema · claro / oscuro</span>
        </div>
        <div className="grid sm:grid-cols-2">
          <div className="p-4" style={{ ...KIT_THEME, background: 'var(--bg)' }}>
            <p className="font-poster text-[var(--text)] text-[13px] mb-2">☀️ Claro (default)</p>
            <div className="flex gap-1.5">{['--bg', '--surface', '--text', '--accent', '--good', '--bad'].map(v => <span key={v} className="w-7 h-7 rounded-md border border-navy/15" style={{ background: `var(${v})` }} />)}</div>
          </div>
          <div className="p-4" style={{ ...KIT_THEME_DARK, background: '#14203A' }}>
            <p className="font-poster text-[var(--text)] text-[13px] mb-2">🌙 Oscuro</p>
            <div className="flex gap-1.5">{['--bg', '--surface', '--text', '--accent', '--good', '--bad'].map(v => <span key={v} className="w-7 h-7 rounded-md border border-cream-light/20" style={{ background: `var(${v})` }} />)}</div>
          </div>
        </div>
      </div>
      <p className="font-sans text-[12px] text-navy/55 mt-3 flex items-start gap-1.5">
        <Ic name="info" size={14} className="text-celeste-deep shrink-0 mt-px" />
        Acentos alternativos: <Tok>--accent: #E3A938</Tok> (dorado) · <Tok>#C2403A</Tok> (rojo). Cambian también <Tok>--accent-deep/soft/ink</Tok>.
      </p>
    </KitSection>
  );
}

function KitResponsive() {
  const bp = [
    { token: 'base', value: '0–639px', use: 'Mobile (canvas nativo del producto)' },
    { token: 'sm', value: '≥ 640px', use: 'Mobile grande / phablet' },
    { token: 'md', value: '≥ 768px', use: 'Tablet vertical' },
    { token: 'lg', value: '≥ 1024px', use: 'Tablet horizontal / web' },
    { token: 'xl', value: '≥ 1280px', use: 'Desktop (kit a 2 columnas)' },
  ];
  return (
    <KitSection id="responsive" title="Responsive & layout"
      desc="El producto es mobile-first: el canvas base es un teléfono de 392px. Estas reglas aseguran que cada componente escale bien de mobile a web sin romper jerarquía ni accesibilidad táctil.">
      <div className="mb-4"><TokenTable title="Breakpoints" rows={bp} /></div>

      {/* demo de columnas */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <Spec label="Contenedor de pantalla"
          specs={[['Ancho canvas', '392px (mobile)'], ['Margen lateral', '20px (px-5)'], ['Max web', '420–480px centrado'], ['Scroll', 'vertical, nav fija abajo']]}
          responsive="En web la pantalla se centra dentro de un marco; el contenido nunca pasa de ~480px para conservar las proporciones mobile.">
          <div className="rounded-xl border-[1.5px] border-dashed border-[var(--accent-deep)] bg-[var(--surface)] p-3">
            <div className="h-2 w-1/2 rounded bg-[var(--accent-soft)] mb-2" />
            <div className="h-2 w-full rounded bg-[var(--surface-2)] mb-1.5" />
            <div className="h-2 w-3/4 rounded bg-[var(--surface-2)]" />
            <p className="font-mono text-[9.5px] text-[var(--muted)] mt-2 text-center">↔ 20px · contenido · 20px ↔</p>
          </div>
        </Spec>
        <Spec label="Grilla de stat cards"
          specs={[['Mobile', 'grid-cols-3, gap-10'], ['Colapso', 'nunca; texto encoge'], ['Min card', '~104px']]}
          responsive="Las stat cards mantienen 3 columnas en mobile. En contenedores anchos podés pasarlas a 4–6 sin cambiar el componente.">
          <div className="grid grid-cols-3 gap-2.5">
            {[0, 1, 2].map(i => <div key={i} className="rounded-xl bg-[var(--surface)] border-[1.5px] border-[var(--border)] h-14" />)}
          </div>
        </Spec>
        <Spec label="Lista → grilla"
          specs={[['Mobile', '1 col (filas full)'], ['lg', '2 cols en el kit'], ['Item min', '320px']]}
          responsive="Los items de lista son full-width en el producto; en superficies anchas (web/handoff) se acomodan en grilla auto-fit minmax(320px, 1fr).">
          <div className="grid grid-cols-2 gap-2.5">
            {[0, 1].map(i => <div key={i} className="rounded-xl bg-[var(--surface)] border-[1.5px] border-[var(--border)] h-14" />)}
          </div>
        </Spec>
      </div>

      {/* reglas */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <RuleCard icon="target" title="Touch targets">
          <p>Mínimo <b>44×44px</b> para cualquier elemento accionable. Botones sm = 36px de alto + área táctil extendida; nav e íconos respetan 44px de hit-area.</p>
        </RuleCard>
        <RuleCard icon="phone-screen" title="Safe areas">
          <p>Respetar <Tok>env(safe-area-inset-*)</Tok>. La bottom-nav suma padding inferior; el contenido scrollea con <Tok>padding-bottom: 104px</Tok> para no quedar tapado.</p>
        </RuleCard>
        <RuleCard icon="sliders" title="Densidad">
          <p>Token conmutable: <b>cómodo</b> (default) y <b>compacto</b> (zoom 0.9). No cambia tamaños de fuente individuales, escala el bloque entero.</p>
        </RuleCard>
        <RuleCard icon="bars" title="Tipografía fluida">
          <p>Títulos de página usan <Tok>clamp()</Tok> en web. Dentro del canvas mobile los tamaños son fijos en px para mantener la jerarquía exacta.</p>
        </RuleCard>
        <RuleCard icon="list" title="Scroll horizontal">
          <p>Chips de filtro, insights y quick-replies scrollean en X con <Tok>.no-sb</Tok> (sin scrollbar) y <Tok>snap-x</Tok>. Nunca wrapear a 2 líneas.</p>
        </RuleCard>
        <RuleCard icon="eye" title="Reduce motion">
          <p>Animaciones <Tok>.pop</Tok> y de entrada se desactivan con <Tok>prefers-reduced-motion</Tok>; el estado final visible es siempre la base.</p>
        </RuleCard>
      </div>
    </KitSection>
  );
}

Object.assign(window, { KitTokens, KitResponsive });
