/**
 * Guard estructural: que un `<DialogContent>` no se limite el ancho en mobile.
 *
 * `DialogContent` (components/ui/dialog.tsx) son DOS layouts en un componente: en
 * mobile es un bottom sheet a ancho completo con los dos bordes anclados
 * (`bottom-0 left-0 right-0 w-full rounded-t-2xl`), y recién en `sm:` pasa a modal
 * centrado (`sm:max-w-lg`). Por eso un `max-w-*` SIN prefijo de breakpoint es un
 * bug: también aplica en mobile, y con `left-0 right-0` el sheet queda angosto y
 * pegado a la izquierda, con una franja muerta a la derecha.
 *
 * Pasó de verdad en el popup de novedades (`max-w-sm` pelado), y no lo vio ningún
 * test: el markup era correcto, y el contenido de un `Dialog` de Radix ni siquiera
 * se renderiza con `renderToStaticMarkup` (monta detrás de un Portal que resuelve
 * en un `useLayoutEffect`, que sin jsdom no corre). O sea que este defecto sólo se
 * ve abriendo la app en un teléfono — que es como apareció. De ahí el guard.
 *
 * Si querés un ancho distinto, prefijalo: `sm:max-w-sm`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/** Los .tsx de src/, con separadores normalizados y sin los propios tests. */
function componentes(): string[] {
  return readdirSync('src', { recursive: true, encoding: 'utf8' })
    .map((p) => 'src/' + p.replace(/\\/g, '/'))
    .filter((f) => f.endsWith('.tsx') && !f.includes('__tests__'));
}

/**
 * Las clases del `className` de cada `<DialogContent ...>` del archivo.
 * Se corta en el `>` de la etiqueta de apertura para no leer el contenido.
 */
function anchosSinBreakpoint(fuente: string): string[] {
  const encontrados: string[] = [];
  const apertura = /<DialogContent\b[^>]*>/g;
  for (const [tag] of fuente.matchAll(apertura)) {
    for (const [, clases] of tag.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      for (const clase of (clases ?? '').split(/\s+/)) {
        // `max-w-…` / `w-…` sin `sm:`, `md:`, `lg:` … adelante.
        if (/^(max-)?w-/.test(clase)) encontrados.push(clase);
      }
    }
  }
  return encontrados;
}

describe('DialogContent: el ancho no se limita en mobile', () => {
  it('ningun DialogContent lleva un max-w/w sin prefijo de breakpoint', () => {
    const infractores = componentes()
      .map((f) => [f, anchosSinBreakpoint(readFileSync(f, 'utf8'))] as const)
      .filter(([, clases]) => clases.length > 0)
      .map(([f, clases]) => `${f}: ${clases.join(' ')}`);

    expect(infractores).toEqual([]);
  });

  it('el detector ve una clase sin prefijo y deja pasar la prefijada', () => {
    // Sin esto el test de arriba podria estar vacio por un regex que no matchea
    // nunca, que es la forma en que un guard se muere en silencio.
    expect(anchosSinBreakpoint('<DialogContent className="max-w-sm">')).toEqual(['max-w-sm']);
    expect(anchosSinBreakpoint('<DialogContent className="sm:max-w-sm">')).toEqual([]);
    expect(anchosSinBreakpoint('<DialogContent className="p-6 gap-4">')).toEqual([]);
  });
});
