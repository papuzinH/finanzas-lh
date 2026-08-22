/**
 * El botón se expande para mostrar su label, y como es `absolute` lo hace sin
 * empujar el layout. De dónde crece depende de por qué borde esté anclado, y
 * los dos casos que existen en la app quieren cosas distintas:
 *
 * - **En un header** (`ScreenHeader right={…}`) está pegado al borde derecho con
 *   20px de margen. Expandido mide ~110px contra 44px: si creciera parejo se
 *   saldría de la pantalla. Ahí `right-0` es lo correcto.
 * - **En un bloque vacío** el contenedor de 44px está centrado, así que crecer
 *   solo hacia la izquierda lo deja visiblemente descentrado respecto del texto
 *   que tiene encima.
 *
 * Por eso la alineación es explícita y el default preserva el comportamiento de
 * los cuatro headers que ya existían.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnimatedPlusButton } from '../animated-plus-button';

const noop = () => {};

describe('AnimatedPlusButton', () => {
  it('por defecto queda anclado a la derecha, como en los headers', () => {
    const html = renderToStaticMarkup(<AnimatedPlusButton label="Crear" onClick={noop} />);
    expect(html).toContain('right-0');
    expect(html).not.toContain('left-1/2');
  });

  it('centrado crece parejo hacia los dos lados', () => {
    const html = renderToStaticMarkup(
      <AnimatedPlusButton label="Crear meta" onClick={noop} align="center" />,
    );
    expect(html).toContain('left-1/2');
    expect(html).toContain('-translate-x-1/2');
    expect(html).not.toContain('right-0');
  });

  it('centrado no arrastra el desplazamiento a desktop, donde el botón sale del absolute', () => {
    const html = renderToStaticMarkup(
      <AnimatedPlusButton label="Crear meta" onClick={noop} align="center" />,
    );
    // md:static saca el botón del posicionamiento absoluto: el translate sobraría.
    expect(html).toContain('md:translate-x-0');
  });

  it('el contenedor centrado no reserva más ancho del que ya reservaba', () => {
    const html = renderToStaticMarkup(
      <AnimatedPlusButton label="Crear meta" onClick={noop} align="center" />,
    );
    expect(html).toContain('h-11 w-11');
  });
});
