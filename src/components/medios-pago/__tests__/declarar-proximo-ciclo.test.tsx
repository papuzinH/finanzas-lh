import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeclararProximoCiclo } from '../declarar-proximo-ciclo';

describe('DeclararProximoCiclo', () => {
  it('arranca cerrado, mostrando la estimacion como texto', () => {
    const html = renderToStaticMarkup(
      <DeclararProximoCiclo methodId="pm1" estimado={{ closingDate: '2026-09-27', dueDate: '2026-10-04' }} onDeclarar={() => {}} />,
    );
    expect(html).toContain('Estimado');
    expect(html).toContain('Lo tengo a mano');
    // cerrado: sin inputs de fecha
    expect(html).not.toContain('type="date"');
  });

  it('el boton de abrir es un touch target de 44px', () => {
    const html = renderToStaticMarkup(
      <DeclararProximoCiclo methodId="pm1" estimado={{ closingDate: '2026-09-27', dueDate: '2026-10-04' }} onDeclarar={() => {}} />,
    );
    expect(html).toMatch(/min-h-\[44px\]|h-11|h-12/);
  });
});
