/**
 * Guard estructural: que no vuelva a aparecer un bloque vacío hecho a mano.
 *
 * Antes de `<EmptyState>` había diez copias del mismo `<div>` repartidas en siete
 * pantallas, cada una con su propio padding, su ícono de 56px en gris y su copy.
 * Nadie las escribió mal a propósito: se copiaba la de al lado. Este test corta
 * esa cadena — si aparece un bloque punteado nuevo fuera de la lista de abajo,
 * falla y manda a usar el componente.
 *
 * Las dos excepciones NO son estados vacíos del mismo tipo: son avisos inline de
 * una línea (uno dentro de una tabla, otro dentro de un modal), sin ícono ni
 * acción. Meterlos en `<EmptyState>`, que pide ícono y título, los infla en vez
 * de arreglarlos.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Avisos inline de una línea: no son el bloque grande, ver el encabezado. */
const EXCEPCIONES = [
  'components/inversiones/portfolio-list.tsx',
  'components/medios-pago/payment-method-detail-modal.tsx',
  // El componente mismo, que es quien tiene derecho a dibujar el borde punteado.
  'components/shared/empty-state.tsx',
];

/** Los .tsx de src/, con separadores normalizados y sin los propios tests. */
function componentes(): string[] {
  return readdirSync('src', { recursive: true, encoding: 'utf8' })
    .map((p) => 'src/' + p.replace(/\\/g, '/'))
    .filter((f) => f.endsWith('.tsx') && !f.includes('__tests__'));
}

describe('adopción de EmptyState', () => {
  it('ninguna pantalla dibuja su propio bloque vacío punteado', () => {
    const archivos = componentes();

    expect(archivos.length).toBeGreaterThan(50); // el barrido encontró algo

    const infractores = archivos.filter((f) => {
      if (EXCEPCIONES.some((e) => f.endsWith(e))) return false;
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      // `border-t border-dashed` es un separador de filas, no un bloque vacío.
      return /border-dashed border-border/.test(src.replace(/border-t border-dashed/g, ''));
    });

    expect(infractores, `usá <EmptyState> en vez de armar el bloque a mano:\n${infractores.join('\n')}`)
      .toEqual([]);
  });

  it('no quedan íconos sueltos de 48px+ en gris, que era la marca del bloque viejo', () => {
    const archivos = componentes().filter((f) => !f.endsWith('components/shared/empty-state.tsx'));

    const infractores = archivos.filter((f) =>
      /h-1[2-9] w-1[2-9] text-faint/.test(readFileSync(join(process.cwd(), f), 'utf8')),
    );

    expect(infractores, `el ícono va en la ranura de <EmptyState>:\n${infractores.join('\n')}`)
      .toEqual([]);
  });
});
