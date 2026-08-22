/**
 * El chancho medidor es la única pieza de /objetivos que codifica un número en
 * una forma: el nivel de llenado ES el progreso de la meta. Si el recorte se
 * calcula mal, la card miente sin que nada falle.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChanchoGauge } from '../chancho-gauge';

/** Devuelve el rect del clipPath: `y` es dónde arranca el relleno (viewBox de 146). */
function clipRect(percent: number) {
  const html = renderToStaticMarkup(<ChanchoGauge percent={percent} />);
  const m = html.match(/<rect x="0" y="([\d.]+)" width="194" height="([\d.]+)"/);
  if (!m) throw new Error('no se encontró el rect del clip:\n' + html.slice(0, 300));
  return { y: Number(m[1]), height: Number(m[2]) };
}

describe('ChanchoGauge', () => {
  it('vacío no muestra relleno', () => {
    expect(clipRect(0)).toEqual({ y: 146, height: 0 });
  });

  it('lleno cubre todo el dibujo', () => {
    expect(clipRect(100)).toEqual({ y: 0, height: 146 });
  });

  it('a la mitad, el relleno arranca en la mitad de abajo', () => {
    expect(clipRect(50)).toEqual({ y: 73, height: 73 });
  });

  it('un aporte de más no desborda el chancho', () => {
    expect(clipRect(150)).toEqual({ y: 0, height: 146 });
  });

  it('un porcentaje negativo o inválido se lee como vacío', () => {
    expect(clipRect(-20)).toEqual({ y: 146, height: 0 });
    expect(clipRect(NaN)).toEqual({ y: 146, height: 0 });
  });

  it('dos medidores en la misma pantalla no comparten el clip', () => {
    const html = renderToStaticMarkup(
      <>
        <ChanchoGauge percent={30} />
        <ChanchoGauge percent={70} />
      </>,
    );
    const ids = [...html.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('sin `title` es decorativo: no lo anuncia un lector de pantalla', () => {
    const html = renderToStaticMarkup(<ChanchoGauge percent={40} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
  });

  it('con `title` se anuncia con ese nombre', () => {
    const html = renderToStaticMarkup(<ChanchoGauge percent={40} title="40% de Bariloche" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="40% de Bariloche"');
  });
});
