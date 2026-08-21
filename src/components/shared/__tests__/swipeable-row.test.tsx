/**
 * El gesto de SwipeableRow se rompió una vez por una razón puramente visual:
 * los fondos de "Editar"/"Eliminar" son `absolute` y, si el div arrastrable no
 * está posicionado, pintan por encima y se comen el `pointerdown` — el swipe no
 * arranca y el tap tampoco llega al contenido. `TransactionItem` no lo notó
 * porque su fila ya traía `relative` propio; las cards de Compromisos, sí.
 *
 * Estos tests fijan las dos clases que sostienen el gesto. No prueban el drag
 * (eso necesita un navegador), pero sí que la fila quede arriba y los fondos
 * fuera del alcance del puntero.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SwipeableRow } from '../swipeable-row';

function render(ui: React.ReactElement) {
  return renderToStaticMarkup(ui);
}

describe('SwipeableRow', () => {
  it('el contenido queda posicionado, por encima de los fondos', () => {
    const html = render(
      <SwipeableRow onSwipeRight={() => {}} onSwipeLeft={() => {}}>
        <div>contenido</div>
      </SwipeableRow>,
    );
    // El div que envuelve al children (el arrastrable) lleva `relative`.
    expect(html).toContain('class="relative"');
  });

  it('los fondos de acción no reciben el puntero', () => {
    const html = render(
      <SwipeableRow onSwipeRight={() => {}} onSwipeLeft={() => {}}>
        <div>contenido</div>
      </SwipeableRow>,
    );
    const fondos = html.match(/class="[^"]*absolute inset-0[^"]*"/g) ?? [];
    expect(fondos).toHaveLength(2);
    for (const fondo of fondos) expect(fondo).toContain('pointer-events-none');
  });

  it('sin `enabled` no monta el gesto: devuelve el contenido pelado', () => {
    const html = render(
      <SwipeableRow enabled={false} onSwipeRight={() => {}} onSwipeLeft={() => {}}>
        <div>contenido</div>
      </SwipeableRow>,
    );
    expect(html).toBe('<div>contenido</div>');
  });

  it('sin handlers tampoco monta el gesto', () => {
    const html = render(
      <SwipeableRow>
        <div>contenido</div>
      </SwipeableRow>,
    );
    expect(html).toBe('<div>contenido</div>');
  });
});
