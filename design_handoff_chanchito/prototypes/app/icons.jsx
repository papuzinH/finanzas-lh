/* ============================================================
   Chanchito · App · Iconografía (línea 24px tipo Lucide) + marcas vintage
   ============================================================ */

const APP_ICONS = {
  /* navegación */
  'home':       <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></>,
  'list':       <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.3"/><circle cx="3.5" cy="12" r="1.3"/><circle cx="3.5" cy="18" r="1.3"/></>,
  'layers':     <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></>,
  'target':     <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/></>,
  'chart':      <><path d="M12 3a9 9 0 1 0 9 9h-9Z"/><path d="M14 3.2A9 9 0 0 1 20.8 10H14Z"/></>,
  /* finanzas */
  'trending-up':   <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></>,
  'trending-down': <><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></>,
  'flame':      <><path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-1.5.6-2.8 1.3-3.8C8.9 8.2 9 9.5 10 10c0-2 .8-5 2-8Z"/></>,
  'wallet':     <><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2"/><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H4"/><circle cx="16.5" cy="13" r="1.2"/></>,
  'credit-card':<><rect x="2" y="5" width="20" height="14" rx="2.5"/><line x1="2" y1="10" x2="22" y2="10"/></>,
  'banknote':   <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="18" y1="12" x2="18.01" y2="12"/></>,
  'dollar':     <><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  'coins':      <><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></>,
  'piggy':      <><path d="M19 8c1.7.6 3 2.2 3 4 0 1.2-.6 2.3-1.5 3l.5 3h-3l-.5-1.5c-.6.2-1.3.3-2 .3H10c-.7 0-1.4-.1-2-.3L7.5 21h-3l.5-3.2A6 6 0 0 1 9 7h4c1 0 2 .2 3 .6"/><path d="M9 7c-.5-2 .5-4 3-4 .5 1 0 2-.5 2.5"/><circle cx="16.5" cy="11.5" r="0.8" fill="currentColor" stroke="none"/></>,
  /* acciones */
  'plus':       <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  'plus-circle':<><circle cx="12" cy="12" r="9"/><line x1="12" y1="8.5" x2="12" y2="15.5"/><line x1="8.5" y1="12" x2="15.5" y2="12"/></>,
  'check':      <polyline points="20 6 9 17 4 12"/>,
  'check-circle':<><circle cx="12" cy="12" r="9"/><polyline points="8.5 12 11 14.5 15.5 9.5"/></>,
  'x':          <><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>,
  'edit':       <><path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></>,
  'trash':      <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
  'filter':     <><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/></>,
  'sliders':    <><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></>,
  'search':     <><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  'calendar':   <><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="16" y1="2.5" x2="16" y2="6.5"/></>,
  'bell':       <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>,
  'eye':        <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>,
  'eye-off':    <><path d="M9.9 5.2A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.4 3.1M6.6 6.6A13.3 13.3 0 0 0 2 12s3.5 7 10 7a9.3 9.3 0 0 0 4.4-1.1"/><path d="m9.5 9.5a3 3 0 0 0 4.2 4.2"/><line x1="3" y1="3" x2="21" y2="21"/></>,
  'settings':   <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.9H3a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4.6 7L4.5 7a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></>,
  'more':       <><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></>,
  'info':       <><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none"/></>,
  'alert':      <><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><line x1="12" y1="9" x2="12" y2="13.5"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/></>,
  'chevron-right':<polyline points="9 18 15 12 9 6"/>,
  'chevron-left': <polyline points="15 18 9 12 15 6"/>,
  'chevron-down': <polyline points="6 9 12 15 18 9"/>,
  'chevron-up':   <polyline points="18 15 12 9 6 15"/>,
  'arrow-right':  <><line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/></>,
  'arrow-up-right':<><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>,
  'arrow-down-left':<><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></>,
  /* registro / categorías */
  'mic':        <><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/></>,
  'send':       <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
  'sparkle':    <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3Z"/>,
  'repeat':     <><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></>,
  'bag':        <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
  'coffee':     <><path d="M17 8h1a3 3 0 0 1 0 6h-1"/><path d="M3 8h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="5"/><line x1="10" y1="2" x2="10" y2="5"/></>,
  'qr':         <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="18" y1="14" x2="18" y2="18"/><line x1="21" y1="14" x2="21" y2="21"/></>,
  'bars':       <><line x1="6" y1="20" x2="6" y2="14"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="9"/></>,
  'bus':        <><path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9H4Z"/><line x1="4" y1="11" x2="20" y2="11"/><circle cx="7.5" cy="16.5" r="1.6"/><circle cx="16.5" cy="16.5" r="1.6"/><line x1="6" y1="19" x2="6" y2="20.5"/><line x1="18" y1="19" x2="18" y2="20.5"/></>,
  'home-line':  <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></>,
  'plane':      <><path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.5.5 0 0 0-.5.8L8 11l-2.5 2.5-2-.5-1 1 3 1.7L7 18.5l1-1-.5-2L10 13l4 3.7.8-.5Z"/></>,
  'gift':       <><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5" rx="1"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z"/></>,
  'phone-screen':<><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5"/></>,
  'health':     <><path d="M12 21s-7.5-4.6-10-9.3C.6 9 1.6 5.5 5 4.7c2-.5 3.8.4 4.9 1.9C11 5.1 12.8 4.2 14.8 4.7c3.4.8 4.4 4.3 3 7C19.5 16.4 12 21 12 21Z"/></>,
  'shield':     <><path d="M12 2 4 5v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V5Z"/><path d="m9 12 2 2 4-4"/></>,
  'zap':        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/>,
  'film':       <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="3" x2="7" y2="21"/><line x1="17" y1="3" x2="17" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></>,
  'music':      <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  'cloud':      <><path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6 1.5A4 4 0 0 0 7 19Z"/></>,
  'cart':       <><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.4 12.4a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2L23 7H6"/></>,
  'laptop':     <><rect x="3" y="5" width="18" height="11" rx="1.6"/><path d="M2 19h20"/><path d="M9.5 19l.5-1.5h4l.5 1.5"/></>,
};

function Ic({ name, size = 24, stroke = 2, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true">
      {APP_ICONS[name] || null}
    </svg>
  );
}

/* ---------- Logo / Isotipo: Chanchito alcancía ---------- */
function Chanchito({ size = 46, stroke = '#1C2A47', fill = '#F2CB6E', face = '#1C2A47' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="Chanchito">
      <ellipse cx="50" cy="55" rx="33" ry="25" fill={fill} stroke={stroke} strokeWidth="3.4"/>
      <path d="M30 36 q-3 -13 9 -12 q-1 8 -4 13 Z" fill={fill} stroke={stroke} strokeWidth="3.2" strokeLinejoin="round"/>
      <ellipse cx="78" cy="56" rx="11" ry="13" fill={fill} stroke={stroke} strokeWidth="3.2"/>
      <circle cx="76" cy="52" r="1.7" fill={face}/>
      <circle cx="80" cy="60" r="1.7" fill={face}/>
      <circle cx="58" cy="46" r="2.4" fill={face}/>
      <line x1="44" y1="36" x2="56" y2="36" stroke={face} strokeWidth="3.2" strokeLinecap="round"/>
      <rect x="33" y="74" width="8" height="11" rx="3" fill={fill} stroke={stroke} strokeWidth="3"/>
      <rect x="58" y="74" width="8" height="11" rx="3" fill={fill} stroke={stroke} strokeWidth="3"/>
      <path d="M18 50 q-7 -2 -5 5 q1 5 6 3" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

/* ---------- Sello postal redondo con chanchito ---------- */
function ChanchitoSeal({ size = 56, ring = '#1C2A47', disc = '#F2CB6E', pig = '#F4EDDC' }) {
  const ticks = Array.from({ length: 40 });
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
        <circle cx="50" cy="50" r="47" fill={ring}/>
        <circle cx="50" cy="50" r="40" fill={disc}/>
        <circle cx="50" cy="50" r="40" fill="none" stroke={ring} strokeWidth="1.5"/>
        {ticks.map((_, i) => {
          const a = (i / ticks.length) * Math.PI * 2;
          const r1 = 43.5, r2 = 47;
          return <line key={i} x1={50 + Math.cos(a) * r1} y1={50 + Math.sin(a) * r1}
            x2={50 + Math.cos(a) * r2} y2={50 + Math.sin(a) * r2} stroke="#F4EDDC" strokeWidth="2"/>;
        })}
      </svg>
      <div className="relative" style={{ transform: 'translateX(-1px)' }}>
        <Chanchito size={size * 0.6} fill={pig} />
      </div>
    </div>
  );
}

/* ---------- Sol de Mayo (geométrico) ---------- */
function SolDeMayo({ size = 64, color = '#E3A938', className = '', style }) {
  const rays = Array.from({ length: 16 });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      {rays.map((_, i) => {
        const a = (i / rays.length) * Math.PI * 2;
        const r1 = 30, r2 = 47;
        return <line key={i} x1={50 + Math.cos(a) * r1} y1={50 + Math.sin(a) * r1}
          x2={50 + Math.cos(a) * r2} y2={50 + Math.sin(a) * r2}
          stroke={color} strokeWidth="3" strokeLinecap="round"/>;
      })}
      <circle cx="50" cy="50" r="24" fill="none" stroke={color} strokeWidth="3.4"/>
      <circle cx="50" cy="50" r="18" fill="none" stroke={color} strokeWidth="1.6"/>
    </svg>
  );
}

/* ---------- Roseta (esquinas tipo estampilla) ---------- */
function Roseta({ size = 26, color = '#C2403A' }) {
  const petals = Array.from({ length: 6 });
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {petals.map((_, i) => {
        const a = (i / 6) * 360;
        return <circle key={i} cx="20" cy="9" r="6.5" fill={color}
          transform={`rotate(${a} 20 20)`} opacity="0.92"/>;
      })}
      <circle cx="20" cy="20" r="5" fill="#1C2A47"/>
      <circle cx="20" cy="20" r="2.2" fill="#F2CB6E"/>
    </svg>
  );
}

/* ---------- Bandera argentina ondeando ---------- */
function Bandera({ w = 70 }) {
  const h = w * 0.62;
  return (
    <svg width={w} height={h} viewBox="0 0 100 62" aria-label="Bandera argentina">
      <path d="M2 8 Q26 0 50 8 T98 8 L98 54 Q74 62 50 54 T2 54 Z" fill="#CBE2EE" stroke="#1C2A47" strokeWidth="1.4"/>
      <path d="M2 23 Q26 15 50 23 T98 23 L98 39 Q74 47 50 39 T2 39 Z" fill="#F4EDDC"/>
      <circle cx="50" cy="31" r="6.5" fill="#E3A938" stroke="#B97E16" strokeWidth="1"/>
    </svg>
  );
}

/* ---------- Rayos / sunburst ---------- */
function Sunrays({ className = '', color = '#CBE2EE' }) {
  return <div className={`sunburst ${className}`} style={{ '--ray': color }} />;
}

/* ---------- Chip de marca (monograma) para servicios/suscripciones ---------- */
function BrandChip({ label, bg = '#1C2A47', fg = '#F4EDDC', size = 38, icon }) {
  return (
    <div className="grid place-items-center shrink-0 rounded-xl border-[1.5px] border-navy/30 font-poster"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.42 }}>
      {icon ? <Ic name={icon} size={size * 0.5} stroke={2.2} /> : label}
    </div>
  );
}

Object.assign(window, { Ic, Chanchito, ChanchitoSeal, SolDeMayo, Roseta, Bandera, Sunrays, BrandChip, APP_ICONS, ICON_NAMES: Object.keys(APP_ICONS) });
