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
import type { CreditCardCycle } from '@/lib/finance/cycles';

const resumen = (over: Partial<ResumenNavegable> = {}): ResumenNavegable => ({
  id: 'c1',
  closingDate: '2026-08-10',
  dueDate: '2026-08-18',
  source: 'generated',
  estado: 'pendiente',
  ...over,
});

const ciclo = (over: Partial<CreditCardCycle> = {}): CreditCardCycle => ({
  id: 'c1', payment_method_id: 'pm1', user_id: 'u1', created_at: '2026-01-01T00:00:00Z',
  closing_date: '2026-08-10', due_date: '2026-08-18', source: 'generated', reminder_dismissed_at: null,
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

  // Task 5, Step 1b: con los ciclos completos de la tarjeta y el cycle_id de la
  // transacción tocada, el aviso nombra el mes real -- distinto por dirección, porque
  // el destino de la última cuota depende de a qué vecino se mueva.
  it('con ciclos y cicloActualId, nombra el mes real de la última cuota, por dirección', () => {
    const ciclos: CreditCardCycle[] = [
      ciclo({ id: 'jul', closing_date: '2026-07-23', due_date: '2026-07-31' }),
      ciclo({ id: 'ago', closing_date: '2026-08-20', due_date: '2026-08-28' }),
      ciclo({ id: 'sep', closing_date: '2026-09-20', due_date: '2026-09-28' }),
      ciclo({ id: 'oct', closing_date: '2026-10-20', due_date: '2026-10-28' }),
    ];
    // Tocada en agosto, cuota 2 de 3: HOY la última (cuota 3) cae en septiembre (ago + 1).
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen
        anterior={resumen({ id: 'jul', dueDate: '2026-07-31' })}
        siguiente={resumen({ id: 'sep', dueDate: '2026-09-28' })}
        cuotasQueMueve={{ desde: 2, hasta: 3 }}
        ciclos={ciclos}
        cicloActualId="ago"
        onElegir={() => {}}
      />,
    );
    // Al anterior (julio): la última pasa de septiembre a agosto (jul + 1).
    expect(html).toContain('de septiembre a agosto');
    // Al siguiente (septiembre): la última pasa de septiembre a octubre (sep + 1).
    expect(html).toContain('de septiembre a octubre');
  });

  it('sin ciclos/cicloActualId (el caso de una compra suelta) no inventa un mes', () => {
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen
        siguiente={resumen()}
        cuotasQueMueve={{ desde: 2, hasta: 3 }}
        onElegir={() => {}}
      />,
    );
    expect(html).toContain('cuotas 2 a 3');
    expect(html).not.toContain('La última pasa');
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
