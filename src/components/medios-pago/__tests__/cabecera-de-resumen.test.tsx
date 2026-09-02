import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CabeceraDeResumen } from '../cabecera-de-resumen';
import type { ResumenNavegable } from '@/lib/finance/detalle-resumen';

const base: ResumenNavegable = {
  id: 'ago', closingDate: '2026-08-20', dueDate: '2026-09-01',
  source: 'generated', estado: 'pendiente',
};

const render = (over: Partial<Parameters<typeof CabeceraDeResumen>[0]> = {}) =>
  renderToStaticMarkup(
    <CabeceraDeResumen
      resumen={base} deuda={20000} totalARS={20000} totalUSD={0}
      onCorregirFechas={() => {}}
      {...over}
    />,
  );

describe('CabeceraDeResumen', () => {
  it('muestra las dos fechas del resumen completas', () => {
    const html = render();
    expect(html).toContain('20 ago');
    expect(html).toContain('1 sep');
  });

  it('un resumen estimado se marca como tal', () => {
    expect(render()).toContain('estimado');
  });

  it('un resumen declarado dice "del resumen"', () => {
    expect(render({ resumen: { ...base, source: 'declared' } })).toContain('del resumen');
  });

  it('el total lleva la firma bandera, que es unica por pantalla', () => {
    const html = render();
    expect(html).toContain('shadow-bandera');
    expect(html.match(/shadow-bandera/g)?.length).toBe(1);
  });

  it('muestra el chip de estado', () => {
    expect(render({ resumen: { ...base, estado: 'vencido' } })).toContain('Vencido');
    expect(render({ resumen: { ...base, estado: 'proyectado' } })).toContain('Proyectado');
  });

  it('un resumen proyectado avisa que esta incompleto', () => {
    const html = render({ resumen: { ...base, estado: 'proyectado' } });
    expect(html.toLowerCase()).toContain('todavía no cerró');
  });

  it('un resumen sin deuda dice "Al dia" y no un monto negativo', () => {
    const html = render({ deuda: 0, totalARS: 0, totalUSD: 0 });
    expect(html).toContain('Al día');
    expect(html).not.toContain('-$');
  });

  it('un saldo a favor (deuda negativa) tambien dice "Al dia"', () => {
    const html = render({ deuda: -5000, totalARS: 0, totalUSD: 0 });
    expect(html).toContain('Al día');
    expect(html).toContain('text-good');
  });

  it('desglosa ARS y USD sin mezclarlos', () => {
    const html = render({ deuda: 175500, totalARS: 20000, totalUSD: 100 });
    expect(html).toContain('20.000');
    expect(html).toContain('100');
    expect(html).toContain('shadow-bandera');
    expect(html.match(/shadow-bandera/g)?.length).toBe(1);
  });

  it('muestra deuda solo en ARS en la cifra principal', () => {
    const html = render({ deuda: 20000, totalARS: 20000, totalUSD: 0 });
    expect(html).toContain('20.000');
    expect(html).not.toContain('u$s');
    expect(html.match(/shadow-bandera/g)?.length).toBe(1);
  });

  it('muestra deuda solo en USD en la cifra principal', () => {
    const html = render({ deuda: 5000, totalARS: 0, totalUSD: 100 });
    expect(html).toContain('u$s 100');
    expect(html.match(/u\$s/g)?.length).toBe(1);
    expect(html.match(/shadow-bandera/g)?.length).toBe(1);
  });

  it('no muestra monto secundario en USD cuando esta al dia', () => {
    const html = render({ deuda: 0, totalARS: 0, totalUSD: 100 });
    expect(html).toContain('Al día');
    expect(html).not.toContain('u$s 100');
  });

  it('ofrece corregir las fechas, con touch target valido', () => {
    const html = render();
    expect(html).toContain('Corregir fechas');
    expect(html).toContain('min-h-[44px]');
  });
});
