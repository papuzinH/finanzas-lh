/**
 * Markup del selector de resumen. Sin jsdom: se verifica el HTML que produce
 * renderToStaticMarkup, no el layout ni la interaccion.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SelectorDeResumen, etiquetaDeResumen } from '../selector-de-resumen';
import type { ResumenNavegable } from '@/lib/finance/detalle-resumen';

const R: ResumenNavegable[] = [
  { id: 'jul', closingDate: '2026-07-23', dueDate: '2026-08-03', source: 'generated', estado: 'vencido' },
  { id: 'ago', closingDate: '2026-08-20', dueDate: '2026-09-01', source: 'declared', estado: 'pendiente' },
  { id: 'sep', closingDate: '2026-09-24', dueDate: '2026-10-05', source: 'generated', estado: 'proyectado' },
];

describe('SelectorDeResumen', () => {
  it('muestra el mes del cierre del resumen actual', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="ago" onSelect={() => {}} />);
    expect(html.toLowerCase()).toContain('agosto');
  });

  it('las flechas tienen label accesible', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="ago" onSelect={() => {}} />);
    expect(html).toContain('Resumen anterior');
    expect(html).toContain('Resumen siguiente');
  });

  // React emite los atributos en el orden del JSX: aria-label viene ANTES de
  // disabled, asi que hay que mirar hacia ADELANTE desde el label hasta cerrar
  // la etiqueta. Buscamos disabled="" para no matchear "disabled:opacity-40" en el class.
  const atributosDelBoton = (html: string, label: string) => {
    const i = html.indexOf(`aria-label="${label}"`);
    return i === -1 ? '' : html.slice(i, html.indexOf('>', i));
  };

  it('en el primer resumen la flecha de anterior queda deshabilitada', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="jul" onSelect={() => {}} />);
    expect(atributosDelBoton(html, 'Resumen anterior')).toContain('disabled=""');
    expect(atributosDelBoton(html, 'Resumen siguiente')).not.toContain('disabled=""');
  });

  it('en el ultimo resumen la flecha de siguiente queda deshabilitada', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="sep" onSelect={() => {}} />);
    expect(atributosDelBoton(html, 'Resumen siguiente')).toContain('disabled=""');
    expect(atributosDelBoton(html, 'Resumen anterior')).not.toContain('disabled=""');
  });

  it('en un resumen del medio ninguna flecha esta deshabilitada', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="ago" onSelect={() => {}} />);
    expect(atributosDelBoton(html, 'Resumen anterior')).not.toContain('disabled=""');
    expect(atributosDelBoton(html, 'Resumen siguiente')).not.toContain('disabled=""');
  });

  it('los controles cumplen el minimo de 44px', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="ago" onSelect={() => {}} />);
    expect(html).toContain('min-h-[44px]');
  });

  it('con tres resumenes de meses distintos el pill muestra el mes solo', () => {
    // R son julio/agosto/septiembre de 2026: nada se repite.
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="ago" onSelect={() => {}} />);
    expect(html).toContain('>agosto<');
  });

  it('con dos resumenes que cierran el mismo mes, el pill desambigua con el dia', () => {
    const mismoMes: ResumenNavegable[] = [
      { id: 'a', closingDate: '2026-08-04', dueDate: '2026-08-15', source: 'generated', estado: 'pagado' },
      { id: 'b', closingDate: '2026-08-31', dueDate: '2026-09-10', source: 'generated', estado: 'pendiente' },
    ];
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={mismoMes} actualId="b" onSelect={() => {}} />);
    expect(html).toContain('31');
  });

  it('una tarjeta con un solo resumen no ofrece navegacion rota', () => {
    const uno = [R[1]];
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={uno} actualId="ago" onSelect={() => {}} />);
    expect(html.match(/disabled=""/g)?.length).toBe(2);
  });

  it('con dos resumenes del mismo mes pero anos distintos, alcanza el ano: no hace falta el dia', () => {
    const diferentesAnos: ResumenNavegable[] = [
      { id: 'ago26', closingDate: '2026-08-20', dueDate: '2026-09-01', source: 'generated', estado: 'pagado' },
      { id: 'ago27', closingDate: '2027-08-20', dueDate: '2027-09-01', source: 'generated', estado: 'pendiente' },
    ];
    const html1 = renderToStaticMarkup(<SelectorDeResumen resumenes={diferentesAnos} actualId="ago26" onSelect={() => {}} />);
    const html2 = renderToStaticMarkup(<SelectorDeResumen resumenes={diferentesAnos} actualId="ago27" onSelect={() => {}} />);
    expect(html1).toContain('>agosto 2026<');
    expect(html2).toContain('>agosto 2027<');
  });

  it('sin homónimo, el label muestra solo el mes, sin día ni año', () => {
    const unoPorMes: ResumenNavegable[] = [
      { id: 'jul', closingDate: '2026-07-23', dueDate: '2026-08-03', source: 'generated', estado: 'pagado' },
      { id: 'ago', closingDate: '2026-08-20', dueDate: '2026-09-01', source: 'generated', estado: 'pendiente' },
    ];
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={unoPorMes} actualId="ago" onSelect={() => {}} />);
    // Debe mostrar solo "agosto", sin día ni año
    expect(html).toContain('agosto');
    expect(html).not.toContain('2026');
  });
});

/**
 * El caso REAL: el backfill materializa ~26 resumenes (2025-08 -> 2027-09), asi que cada
 * nombre de mes aparece dos o tres veces. Comparando solo el nombre, "hay homonimo" daba
 * siempre true y el pill mostraba SIEMPRE la fecha completa -- nunca el mes solo, que es
 * para lo que se diseño.
 */
describe('etiquetaDeResumen con el historial que deja el backfill', () => {
  const veintiseis: ResumenNavegable[] = Array.from({ length: 26 }, (_, i) => {
    const mes = 7 + i; // 2025-08 en adelante
    const fecha = new Date(2025, mes, 20);
    const iso = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-20`;
    return { id: iso, closingDate: iso, dueDate: iso, source: 'generated', estado: 'pagado' };
  });

  it('no cae a la fecha completa solo porque el nombre del mes se repita en otro ano', () => {
    const actual = veintiseis.find((r) => r.id === '2026-08-20')!;
    expect(etiquetaDeResumen(actual, veintiseis)).toBe('agosto 2026');
  });

  it('el ano sigue estando: tres "agosto" distintos no pueden decir lo mismo', () => {
    const etiquetas = veintiseis
      .filter((r) => r.closingDate.slice(5, 7) === '08')
      .map((r) => etiquetaDeResumen(r, veintiseis));
    expect(etiquetas.length).toBeGreaterThan(1);
    expect(new Set(etiquetas).size).toBe(etiquetas.length);
  });

  it('dos resumenes del MISMO mes y ano (lo que produce declarar) sí piden el dia', () => {
    const declarados: ResumenNavegable[] = [
      { id: 'a', closingDate: '2026-08-04', dueDate: '2026-08-15', source: 'declared', estado: 'pagado' },
      { id: 'b', closingDate: '2026-08-31', dueDate: '2026-09-10', source: 'generated', estado: 'pendiente' },
    ];
    expect(etiquetaDeResumen(declarados[1], declarados)).toBe('31 ago 2026');
  });
});
