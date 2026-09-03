import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeclararProximoCiclo, mesDelResumen } from '../declarar-proximo-ciclo';

const estimado = { closingDate: '2026-09-27', dueDate: '2026-10-04' };

const render = () =>
  renderToStaticMarkup(
    <DeclararProximoCiclo methodId="pm1" estimado={estimado} onDeclarar={() => {}} />,
  );

describe('DeclararProximoCiclo', () => {
  it('arranca cerrado, mostrando la estimacion como texto', () => {
    const html = render();
    expect(html).toContain('Lo tengo a mano');
    // cerrado: sin inputs de fecha
    expect(html).not.toContain('type="date"');
  });

  it('el boton de abrir es un touch target de 44px', () => {
    expect(render()).toMatch(/min-h-\[44px\]|h-11|h-12/);
  });

  it('dice que las fechas son del PROXIMO resumen, no del que se esta pagando', () => {
    // El paso vive dentro del dialogo de pago, que arriba dice "vence 5 de sept" del
    // resumen que se paga; sin decirlo, un "Estimado: cierra 27 sep" abajo se lee como
    // una correccion de ESE resumen. Es la ambiguedad que reporto el usuario.
    const html = render();
    expect(html).toContain('El resumen que viene');
  });

  it('nombra el resumen por su mes, para que se sepa cual es', () => {
    expect(render()).toContain('septiembre');
  });

  it('muestra la estimacion con las dos fechas', () => {
    const html = render();
    expect(html).toContain('27 sep');
    expect(html).toContain('4 oct');
  });
});

describe('mesDelResumen', () => {
  it('es el mes del CIERRE, que es el que le da nombre al resumen', () => {
    expect(mesDelResumen('2026-09-27')).toBe('septiembre');
  });

  it('un cierre el 1 pertenece a su propio mes', () => {
    expect(mesDelResumen('2026-10-01')).toBe('octubre');
  });

  it('no corre un dia atras en zona horaria negativa', () => {
    // parseLocalDate y no new Date(string): con `new Date` el 1-oct cae 30-sep en AR.
    expect(mesDelResumen('2026-01-01')).toBe('enero');
  });
});
