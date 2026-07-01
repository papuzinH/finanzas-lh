/* ============================================================
   Chanchito · UI Kit · Foundations
   ============================================================ */

function KitMarca() {
  return (
    <KitSection id="marca" n="01" title="Marca" desc="El chanchito-alcancía es el isotipo. Combina con el wordmark en Alfa Slab One. El Sol de Mayo, la roseta y la bandera son ornamentos secundarios de tono criollo/vintage.">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Spec label="Logo + wordmark">
          <div className="flex items-center gap-3">
            <Chanchito size={56} />
            <span className="font-poster text-[var(--text)] text-[30px]">Chanchito</span>
          </div>
        </Spec>
        <Spec label="Logo en oscuro" dark>
          <div className="flex items-center gap-3">
            <Chanchito size={56} fill="#F2CB6E" />
            <span className="font-poster text-cream-light text-[30px]">Chanchito</span>
          </div>
        </Spec>
        <Spec label="Tagline · script">
          <p className="font-script text-[var(--accent-deep)] text-[34px] leading-none">Cuidá tus mangos</p>
        </Spec>
        <Spec label="Sello postal" note="<ChanchitoSeal/>">
          <div className="flex items-center gap-5">
            <ChanchitoSeal size={64} disc="var(--accent)" />
            <ChanchitoSeal size={64} />
            <ChanchitoSeal size={48} disc="#C2403A" pig="#F4EDDC" />
          </div>
        </Spec>
        <Spec label="Sol de Mayo" note="<SolDeMayo/>">
          <div className="flex items-center gap-5">
            <SolDeMayo size={56} color="#E3A938" />
            <SolDeMayo size={56} color="#5E98BC" />
            <SolDeMayo size={56} color="#C2403A" />
          </div>
        </Spec>
        <Spec label="Roseta & bandera">
          <div className="flex items-center gap-5">
            <Roseta size={44} />
            <Roseta size={44} color="#5E98BC" />
            <Bandera w={64} />
          </div>
        </Spec>
      </div>
    </KitSection>
  );
}

function KitColor() {
  const base = [
    ['Celeste', [['celeste', '#A9CFE0'], ['deep', '#5E98BC'], ['soft', '#CBE2EE'], ['tiza', '#E4F0F6']]],
    ['Crema', [['cream', '#F4EDDC'], ['light', '#FBF7EC'], ['dark', '#EAE0C6']]],
    ['Dorado', [['gold', '#E3A938'], ['deep', '#B97E16'], ['soft', '#F2CB6E']]],
    ['Navy', [['navy', '#1C2A47'], ['deep', '#14203A'], ['mid', '#34466A']]],
    ['Acción', [['rojo', '#C2403A'], ['ink', '#23262C']]],
  ];
  const semantic = [['Éxito / good', '#2E7D5B'], ['Atención / warn', '#E3A938'], ['Error / bad', '#C2403A'], ['Texto', '#1C2A47'], ['Muted', '#5b6577'], ['Borde', '#cdd3dd']];
  const accents = [['Dorado', '#E3A938'], ['Celeste ✓', '#5E98BC'], ['Rojo', '#C2403A']];
  return (
    <KitSection id="color" n="02" title="Color" desc="Paleta base cálida (crema + navy) con celeste como acento por defecto del producto. El acento es conmutable (dorado / celeste / rojo) vía variable --accent. Verdes y rojos quedan reservados para semántica financiera.">
      <div className="space-y-6">
        {base.map(([group, swatches]) => (
          <div key={group}>
            <p className="font-sans text-[12px] font-extrabold uppercase tracking-wider text-navy/50 mb-2">{group}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {swatches.map(([n, h]) => <Swatch key={h} name={n} hex={h} />)}
            </div>
          </div>
        ))}
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <p className="font-sans text-[12px] font-extrabold uppercase tracking-wider text-navy/50 mb-2">Acentos conmutables · <Tok>--accent</Tok></p>
            <div className="grid grid-cols-3 gap-3">{accents.map(([n, h]) => <Swatch key={h} name={n} hex={h} big />)}</div>
          </div>
          <div>
            <p className="font-sans text-[12px] font-extrabold uppercase tracking-wider text-navy/50 mb-2">Semánticos</p>
            <div className="grid grid-cols-3 gap-3">{semantic.map(([n, h]) => <Swatch key={h} name={n} hex={h} />)}</div>
          </div>
        </div>
      </div>
    </KitSection>
  );
}

function KitType() {
  const scale = [
    ['Display / saldo', 'font-poster', '40px', '$ 1.186.430'],
    ['Título pantalla', 'font-poster', '28px', 'Movimientos'],
    ['Título sección', 'font-poster', '15px', 'Tu mes en números'],
    ['Cuerpo serif', 'font-serif', '17px', 'La cuenta que entiende cómo gastás.'],
    ['Cuerpo / UI', 'font-sans', '13px', 'Coto Supermercado · Súper · hoy'],
    ['Etiqueta', 'font-sans', '11px', 'SALDO DISPONIBLE'],
  ];
  return (
    <KitSection id="tipografia" n="03" title="Tipografía" desc="Cuatro familias con roles claros: Alfa Slab One para números y títulos con peso; Bodoni Moda para frases editoriales; Yellowtail para el toque manuscrito; DM Sans para toda la UI funcional.">
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        {[
          ['Alfa Slab One', 'font-poster', 'Poster · display', 'Aa Bb 123 $'],
          ['Bodoni Moda', 'font-serif', 'Serif · editorial', 'Aa Bb 123 $'],
          ['Yellowtail', 'font-script', 'Script · flourish', 'Cuidá tus mangos'],
          ['DM Sans', 'font-sans', 'Sans · UI', 'Aa Bb 123 $'],
        ].map(([fam, cls, role, sample]) => (
          <Spec key={fam} label={role} note={fam}>
            <p className={`${cls} text-[var(--text)] text-[34px] leading-tight`}>{sample}</p>
          </Spec>
        ))}
      </div>
      <Spec label="Escala tipográfica">
        <div className="space-y-3.5">
          {scale.map(([role, cls, size, sample]) => (
            <div key={role} className="flex items-baseline gap-4 border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
              <span className="w-32 shrink-0 font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{role}</span>
              <span className={`${cls} text-[var(--text)] flex-1 leading-tight`} style={{ fontSize: size }}>{sample}</span>
              <Tok>{size}</Tok>
            </div>
          ))}
        </div>
      </Spec>
    </KitSection>
  );
}

function KitIcons() {
  return (
    <KitSection id="iconos" n="04" title="Iconografía" desc="Set de línea 24px, trazo 2px, estilo Lucide. Heredan currentColor. Componente <Ic name size stroke/>.">
      <Spec label={`${ICON_NAMES.length} íconos`} note="stroke 2 · 24px">
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-y-4 gap-x-2">
          {ICON_NAMES.map(n => (
            <div key={n} className="flex flex-col items-center gap-1.5">
              <div className="grid place-items-center w-11 h-11 rounded-xl bg-[var(--surface)] border-[1.5px] border-[var(--border)] text-[var(--text)]">
                <Ic name={n} size={20} />
              </div>
              <span className="font-mono text-[9px] text-[var(--muted)] text-center leading-none truncate w-full">{n}</span>
            </div>
          ))}
        </div>
      </Spec>
    </KitSection>
  );
}

function KitTexture() {
  return (
    <KitSection id="textura" n="05" title="Texturas & ornamentos" desc="Recursos que dan el aire de papel impreso / estampilla. Su intensidad es conmutable (baja / media / alta) en el producto.">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Spec label="Papel · grano" note=".paper" pad="p-0">
          <div className="h-24 paper bg-cream" />
        </Spec>
        <Spec label="Rayado diagonal" note=".hatch" pad="p-0">
          <div className="h-24 hatch bg-cream-light" />
        </Spec>
        <Spec label="Sunburst" note=".sunburst" pad="p-0">
          <div className="h-24 sunburst" style={{ '--ray': '#CBE2EE' }} />
        </Spec>
        <Spec label="Perforado / troquel" pad="p-0">
          <div className="h-24 grid place-items-center bg-cream-light">
            <div className="w-full" style={{ height: 14, background: 'radial-gradient(circle 5px at center, #1C2A47 96%, transparent 100%)', backgroundSize: '22px 14px', backgroundRepeat: 'repeat-x', backgroundPosition: 'center' }} />
          </div>
        </Spec>
        <Spec label="Estampilla (mask)">
          <div className="stamp bg-[var(--accent)] p-2 inline-block">
            <div className="bg-cream-light px-5 py-4 border-[1.5px] border-navy text-center">
              <SolDeMayo size={26} color="#B97E16" className="mx-auto" />
              <p className="font-poster text-[10px] text-navy mt-1 leading-none">100%<br/>NACIONAL</p>
            </div>
          </div>
        </Spec>
        <Spec label="Filete dorado" dark>
          <div className="rounded-lg bg-navy-deep px-6 py-5 text-center" style={{ boxShadow: '0 0 0 2px #E3A938, 0 0 0 4px #14203A, 0 0 0 6px #B97E16' }}>
            <p className="font-poster text-gold text-[16px]">PREMIUM</p>
          </div>
        </Spec>
      </div>
    </KitSection>
  );
}

function KitElevation() {
  const radii = [['sm', 8], ['md', 12], ['lg', 16], ['xl', 22], ['2xl', 26], ['full', 999]];
  const space = [4, 8, 12, 16, 20, 24];
  return (
    <KitSection id="elevacion" n="06" title="Elevación, radios & espaciado">
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <Spec label="Card base" note="0 1px 0 borde">
          <div className="rounded-2xl bg-[var(--surface)] border-[1.5px] border-[var(--border)] h-16" style={{ boxShadow: '0 1px 0 0 var(--border)' }} />
        </Spec>
        <Spec label="Hero / flotante" note="sombra difusa">
          <div className="rounded-2xl bg-navy h-16" style={{ boxShadow: '0 18px 36px -18px rgba(28,42,71,0.7)' }} />
        </Spec>
        <Spec label="Botón · offset" note="3px 3px sólido">
          <div className="rounded-full bg-[var(--accent)] border-[1.5px] border-[var(--accent-deep)] h-12 w-32" style={{ boxShadow: '3px 3px 0 0 var(--accent-deep)' }} />
        </Spec>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Spec label="Radios">
          <div className="flex items-end flex-wrap gap-3">
            {radii.map(([n, r]) => (
              <div key={n} className="flex flex-col items-center gap-1.5">
                <div className="w-14 h-14 bg-[var(--accent-soft)] border-[1.5px] border-[var(--accent-deep)]" style={{ borderRadius: r }} />
                <span className="font-mono text-[10px] text-[var(--muted)]">{n}</span>
              </div>
            ))}
          </div>
        </Spec>
        <Spec label="Espaciado · grid 4px">
          <div className="flex items-end gap-3">
            {space.map(s => (
              <div key={s} className="flex flex-col items-center gap-1.5">
                <div className="bg-[var(--accent)]" style={{ width: s, height: s }} />
                <span className="font-mono text-[10px] text-[var(--muted)]">{s}</span>
              </div>
            ))}
          </div>
        </Spec>
      </div>
    </KitSection>
  );
}

Object.assign(window, { KitMarca, KitColor, KitType, KitIcons, KitTexture, KitElevation });
