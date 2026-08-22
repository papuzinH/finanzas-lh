/**
 * El estado vacío es la primera pantalla que ve alguien que recién llega, y era
 * el único rincón de la app que quedó fuera del rediseño de layouts: diez copias
 * del mismo bloque, con un ícono gris gigante y copy de manual.
 *
 * Lo que se vigila acá es lo que se rompe en silencio: que el bloque no vuelva a
 * inflarse (dos apilados se comen la pantalla entera) y que el ícono no le hable
 * al lector de pantalla, que ya tiene el título.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState } from '../empty-state';
import { Wallet } from 'lucide-react';

const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

describe('EmptyState', () => {
  it('muestra el título y la descripción', () => {
    const html = render(
      <EmptyState
        icon={<Wallet />}
        title="Ponele un objetivo"
        description="Un viaje, un fondo, lo que se te cante."
      />,
    );
    expect(html).toContain('Ponele un objetivo');
    expect(html).toContain('Un viaje, un fondo, lo que se te cante.');
  });

  it('sin descripción no deja un párrafo vacío', () => {
    const html = render(<EmptyState icon={<Wallet />} title="Sin nada todavía" />);
    expect(html).not.toMatch(/<p[^>]*><\/p>/);
  });

  it('renderiza la acción cuando se le pasa una', () => {
    const html = render(
      <EmptyState icon={<Wallet />} title="Sin nada" action={<button>Crear meta</button>} />,
    );
    expect(html).toContain('Crear meta');
  });

  it('sin acción no dibuja nada en su lugar', () => {
    const html = render(<EmptyState icon={<Wallet />} title="Sin nada" />);
    expect(html).not.toContain('<button');
  });

  it('el ícono es decorativo: el título ya dice lo que hay que saber', () => {
    const html = render(<EmptyState icon={<Wallet />} title="Controlá en qué gastás" />);
    expect(html).toContain('aria-hidden="true"');
  });

  it('el bloque no vuelve al padding gigante que se comía la pantalla', () => {
    // Dos vacíos apilados con py-14/py-16 dejaban /objetivos como dos rectángulos
    // punteados y nada más. El mock de la identidad usa 26px; acá van 32.
    const html = render(<EmptyState icon={<Wallet />} title="Sin nada" />);
    expect(html).not.toMatch(/\bpy-1[2-9]\b/);
    expect(html).toMatch(/\bpy-8\b/);
  });

  it('mantiene el borde punteado de 1.5px del sistema', () => {
    const html = render(<EmptyState icon={<Wallet />} title="Sin nada" />);
    expect(html).toContain('border-dashed');
    expect(html).toContain('border-[1.5px]');
  });
});
