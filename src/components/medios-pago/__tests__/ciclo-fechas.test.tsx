/**
 * Markup del par de campos de fecha del resumen y de su etiqueta de procedencia.
 * Sin jsdom: se verifica el HTML que produce renderToStaticMarkup, no el layout.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EtiquetaProcedencia, CicloFechasField } from '../ciclo-fechas-field';

describe('procedencia de las fechas del resumen', () => {
  it('un resumen declarado se muestra como "del resumen"', () => {
    const html = renderToStaticMarkup(<EtiquetaProcedencia source="declared" />);
    expect(html).toContain('del resumen');
    expect(html).not.toContain('estimado');
  });

  it('un resumen generado se muestra como "estimado"', () => {
    const html = renderToStaticMarkup(<EtiquetaProcedencia source="generated" />);
    expect(html).toContain('estimado');
  });

  it('los dos inputs de fecha tienen su label accesible', () => {
    const html = renderToStaticMarkup(
      <CicloFechasField value={{ closingDate: '2026-09-24', dueDate: '2026-10-02' }} onChange={() => {}} />,
    );
    expect(html).toContain('Cierre');
    expect(html).toContain('Vencimiento');
    expect(html).toContain('2026-09-24');
    expect(html).toContain('2026-10-02');
  });
});
