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

  // El spec pide "El que cerró el 23 jul · vence 3 ago", no sólo el vencimiento: a qué
  // resumen pertenece una compra se decide contra el CIERRE, y es el dato que el usuario
  // tiene impreso en el papel.
  it('cada opción nombra el cierre y el vencimiento, con el tiempo verbal del estado', () => {
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen
        anterior={resumen({ id: 'ant', closingDate: '2026-07-23', dueDate: '2026-08-03', estado: 'pendiente' })}
        siguiente={resumen({ id: 'sig', closingDate: '2026-09-24', dueDate: '2026-10-05', estado: 'proyectado' })}
        onElegir={() => {}}
      />,
    );
    // Ya cerró: pasado. Todavía no cerró ('proyectado'): presente.
    expect(html).toContain('El que cerró el 23 jul · vence 3 ago');
    expect(html).toContain('El que cierra el 24 sep · vence 5 oct');
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

  // m3: con la descripción editada desde /movimientos no hay "(n/m)" del que sacar el
  // número de ESTA cuota. El aviso baja de precisión, pero NUNCA desaparece: sin él, mover
  // una fila mueve cuatro en silencio.
  it('sin el número de cuota, avisa igual que arrastra el plan, y usa el total si lo tiene', () => {
    const soloTotal = renderToStaticMarkup(
      <ContenidoMoverAlResumen siguiente={resumen()} cuotasQueMueve={{ hasta: 6 }} onElegir={() => {}} />,
    );
    expect(soloTotal).toContain('arrastra el plan');
    expect(soloTotal).toContain('de las 6 que tiene');

    const sinNada = renderToStaticMarkup(
      <ContenidoMoverAlResumen siguiente={resumen()} cuotasQueMueve={{}} onElegir={() => {}} />,
    );
    expect(sinNada).toContain('todas las cuotas posteriores');
    expect(sinNada).not.toContain('undefined');
  });

  it('sin el número de cuota tampoco inventa el mes de la última', () => {
    const ciclos: CreditCardCycle[] = [
      ciclo({ id: 'ago', closing_date: '2026-08-20', due_date: '2026-08-28' }),
      ciclo({ id: 'sep', closing_date: '2026-09-20', due_date: '2026-09-28' }),
    ];
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen
        siguiente={resumen({ id: 'sep', dueDate: '2026-09-28' })}
        cuotasQueMueve={{ hasta: 3 }}
        ciclos={ciclos}
        cicloActualId="ago"
        onElegir={() => {}}
      />,
    );
    expect(html).not.toContain('La última pasa');
  });

  it('para una compra suelta no habla de cuotas', () => {
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen siguiente={resumen()} onElegir={() => {}} />,
    );
    expect(html).not.toMatch(/cuota/i);
  });

  // El que más fácil se escribe vacuo: si solo se verifica que el aviso APARECE, un
  // componente que lo muestre siempre pasa igual. Se cubren los dos sentidos.
  it('advierte qué implica un destino ya pagado, y NO cuando no lo está', () => {
    const htmlPagado = renderToStaticMarkup(
      <ContenidoMoverAlResumen siguiente={resumen({ estado: 'pagado' })} onElegir={() => {}} />,
    );
    // Honesto sobre la consecuencia real: el consumo sale de lo que la app te reclama.
    expect(htmlPagado).toContain('ya lo pagaste');
    expect(htmlPagado).toContain('no va a volver a contarse en lo que debés');

    const htmlPendiente = renderToStaticMarkup(
      <ContenidoMoverAlResumen siguiente={resumen({ estado: 'pendiente' })} onElegir={() => {}} />,
    );
    expect(htmlPendiente).not.toContain('ya lo pagaste');
  });

  // m2: el aviso era un `some()` sobre los dos vecinos, dibujado suelto arriba -- con uno
  // pagado y otro no, decía "el resumen que elijas ya está pagado" para las DOS opciones.
  it('con un vecino pagado y otro no, el aviso va SOLO en el pagado', () => {
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen
        anterior={resumen({ id: 'ant', estado: 'pagado' })}
        siguiente={resumen({ id: 'sig', estado: 'pendiente' })}
        onElegir={() => {}}
      />,
    );
    expect(html.split('ya lo pagaste')).toHaveLength(2); // una sola aparición
  });

  it('advierte que un destino vencido puede caerse de lo que la app reclama', () => {
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen anterior={resumen({ id: 'ant', estado: 'vencido' })} onElegir={() => {}} />,
    );
    expect(html).toContain('último impago');
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

describe('ContenidoMoverAlResumen — atrasar amplia a todo el plan', () => {
  const R: ResumenNavegable[] = [
    { id: 'ant', closingDate: '2026-07-23', dueDate: '2026-08-03', source: 'generated', estado: 'pendiente' },
    { id: 'sig', closingDate: '2026-09-24', dueDate: '2026-10-05', source: 'generated', estado: 'proyectado' },
  ];

  it('una cuota intermedia avisa que atrasar mueve TODO el plan', () => {
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen
        anterior={R[0]} siguiente={R[1]} cuotasQueMueve={{ desde: 3, hasta: 6 }}
        moviendo={null} onElegir={() => {}} ciclos={[]} cicloActualId={undefined}
      />,
    );
    expect(html).toContain('todo el plan');
    expect(html).toContain('las 6 cuotas');
  });

  it('la PRIMERA cuota no lo avisa: atrasarla no amplia nada', () => {
    // Si esto no chequeara el caso negativo, un componente que muestre el aviso
    // siempre pasaria igual.
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen
        anterior={R[0]} siguiente={R[1]} cuotasQueMueve={{ desde: 1, hasta: 6 }}
        moviendo={null} onElegir={() => {}} ciclos={[]} cicloActualId={undefined}
      />,
    );
    expect(html).not.toContain('todo el plan');
  });

  it('una compra suelta tampoco lo avisa', () => {
    const html = renderToStaticMarkup(
      <ContenidoMoverAlResumen
        anterior={R[0]} siguiente={R[1]} cuotasQueMueve={undefined}
        moviendo={null} onElegir={() => {}} ciclos={[]} cicloActualId={undefined}
      />,
    );
    expect(html).not.toContain('todo el plan');
  });
});
