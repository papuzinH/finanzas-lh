/**
 * Markup del CONTENIDO del diálogo de mover al resumen vecino. Sin jsdom: se verifica
 * el HTML de renderToStaticMarkup, no el layout.
 *
 * Se testea `ContenidoMoverAlResumen`, no `MoverAlResumenDialog`: el segundo envuelve al
 * primero en `DialogContent`, que vive detrás de un Portal (@radix-ui/react-portal) que
 * espera un `useLayoutEffect` -- ese efecto nunca corre en un render de servidor, así que
 * en `renderToStaticMarkup` SIEMPRE devuelve null, esté `open` en true o en false.
 * Verificado a mano: `renderToStaticMarkup(<Dialog open><DialogContent>x</DialogContent></Dialog>)`
 * da `''`. Testear el contenido suelto es el mismo patrón que ciclo-fechas-field.tsx.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContenidoMoverAlResumen } from '../mover-al-resumen-dialog';
import type { ResumenNavegable } from '@/lib/finance/detalle-resumen';

const resumen = (over: Partial<ResumenNavegable> = {}): ResumenNavegable => ({
  id: 'c1',
  closingDate: '2026-08-10',
  dueDate: '2026-08-18',
  source: 'generated',
  estado: 'pendiente',
  ...over,
});

describe('ContenidoMoverAlResumen', () => {
  it('ofrece los dos vecinos con sus fechas reales', () => {
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen
        anterior={resumen({ id: 'ant', dueDate: '2026-07-23' })}
        siguiente={resumen({ id: 'sig', dueDate: '2026-09-24' })}
        onElegir={() => {}}
      />,
    );
    expect(html).toContain('23 jul');
    expect(html).toContain('24 sep');
    expect(html).not.toContain('anterior');
  });

  it('un vecino que no existe no se ofrece', () => {
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen
        siguiente={resumen({ id: 'sig', dueDate: '2026-09-24' })}
        onElegir={() => {}}
      />,
    );
    expect(html).toContain('24 sep');
    expect(html).not.toContain('23 jul');
  });

  it('para una cuota avisa cuántas mueve, y el número sale de la prop', () => {
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen
        siguiente={resumen()}
        cuotasQueMueve={{ desde: 3, hasta: 6 }}
        onElegir={() => {}}
      />,
    );
    expect(html).toContain('3 a 6');

    // Otro valor de la prop tiene que cambiar el texto: si no, estaría hardcodeado.
    const htmlOtro = renderToStaticMarkup(
      <ContenidoMoverAlResumen
        siguiente={resumen()}
        cuotasQueMueve={{ desde: 1, hasta: 2 }}
        onElegir={() => {}}
      />,
    );
    expect(htmlOtro).toContain('1 a 2');
    expect(htmlOtro).not.toContain('3 a 6');
  });

  it('para una compra suelta no habla de cuotas', () => {
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen siguiente={resumen()} onElegir={() => {}} />,
    );
    expect(html).not.toMatch(/cuota/i);
  });

  // El que más fácil se escribe vacuo: si solo se verifica que el aviso APARECE, un
  // componente que lo muestre siempre pasa igual. Se cubren los dos sentidos.
  it('advierte cuando el destino ya está pagado, y NO cuando no lo está', () => {
    const htmlPagado = renderToStaticMarkup(
      <ContenidoMoverAlResumen siguiente={resumen({ estado: 'pagado' })} onElegir={() => {}} />,
    );
    expect(htmlPagado).toContain('ya está pagado');

    const htmlPendiente = renderToStaticMarkup(
      <ContenidoMoverAlResumen siguiente={resumen({ estado: 'pendiente' })} onElegir={() => {}} />,
    );
    expect(htmlPendiente).not.toContain('ya está pagado');
  });

  it('touch targets de 44px', () => {
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen
        anterior={resumen({ id: 'ant' })}
        siguiente={resumen({ id: 'sig' })}
        onElegir={() => {}}
      />,
    );
    expect(html).toContain('min-h-[44px]');
  });
});
