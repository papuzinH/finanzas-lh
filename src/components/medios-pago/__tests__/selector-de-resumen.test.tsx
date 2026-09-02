/**
 * Markup del selector de resumen. Sin jsdom: se verifica el HTML que produce
 * renderToStaticMarkup, no el layout ni la interaccion.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SelectorDeResumen } from '../selector-de-resumen';
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
  // la etiqueta. Mirar hacia atras da un falso rojo.
  const atributosDelBoton = (html: string, label: string) => {
    const i = html.indexOf(`aria-label="${label}"`);
    return i === -1 ? '' : html.slice(i, html.indexOf('>', i));
  };

  it('en el primer resumen la flecha de anterior queda deshabilitada', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="jul" onSelect={() => {}} />);
    expect(atributosDelBoton(html, 'Resumen anterior')).toContain('disabled');
    expect(atributosDelBoton(html, 'Resumen siguiente')).not.toContain('disabled');
  });

  it('en el ultimo resumen la flecha de siguiente queda deshabilitada', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="sep" onSelect={() => {}} />);
    expect(atributosDelBoton(html, 'Resumen siguiente')).toContain('disabled');
    expect(atributosDelBoton(html, 'Resumen anterior')).not.toContain('disabled');
  });

  it('en un resumen del medio ninguna flecha esta deshabilitada', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="ago" onSelect={() => {}} />);
    expect(atributosDelBoton(html, 'Resumen anterior')).not.toContain('disabled');
    expect(atributosDelBoton(html, 'Resumen siguiente')).not.toContain('disabled');
  });

  it('los controles cumplen el minimo de 44px', () => {
    const html = renderToStaticMarkup(<SelectorDeResumen resumenes={R} actualId="ago" onSelect={() => {}} />);
    expect(html).toContain('min-h-[44px]');
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
    expect(html.match(/disabled/g)?.length).toBe(2);
  });
});
