/**
 * Guard estructural: la pregunta por las fechas del resumen vive DENTRO de la card del ciclo.
 *
 * Va como test de archivo y no de markup porque `CreditCardCycleCard` renderiza
 * `CreditCardCycleChip`, que usa `useRouter`, y eso no sobrevive a `renderToStaticMarkup` --
 * la misma limitacion que ya documenta overdue-card-payment-banner.test.tsx. La REGLA de
 * cuando pedir esta cubierta en lib/finance/__tests__/recordatorio-ciclo.test.ts; lo que
 * ningun test unitario puede ver es el CABLEADO, y es justo lo que se rompio antes: el pedido
 * vivia en un aviso aparte que repetia el nombre de la tarjeta y sus fechas.
 *
 * Verificado en el navegador contra datos reales el 2026-09-03 (14 de 14): el chip aparece
 * en la tarjeta con el resumen estimado, no aparece en la ya declarada, y al guardar
 * desaparece sin que aparezca ningun otro pedido.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const card = readFileSync(join(process.cwd(), 'src/components/compromisos/credit-card-cycle-card.tsx'), 'utf8');
const compromisos = readFileSync(join(process.cwd(), 'src/app/compromisos/compromisos-client.tsx'), 'utf8');

describe('el pedido de fechas vive en la card del ciclo', () => {
  it('la card decide con pideDeclaracion, no con una regla propia', () => {
    expect(card).toContain('pideDeclaracion');
  });

  it('la card ofrece corregir las fechas del resumen que esta mostrando', () => {
    expect(card).toContain('EditarCicloDialog');
    expect(card).toContain('EtiquetaProcedencia');
  });

  it('el dialogo se remonta cuando cambia el resumen vigente', () => {
    // Su estado se inicializa desde props una sola vez (useState): sin key seguiria
    // mandando las fechas del resumen viejo cuando el vigente cambia de identidad.
    expect(card).toMatch(/<EditarCicloDialog\s+key=\{vigente\.id\}/);
  });

  it('Compromisos NO vuelve a montar un aviso de declaracion aparte', () => {
    expect(compromisos).not.toContain('RecordatorioDeclararCiclo');
    expect(compromisos).not.toContain('ciclosQuePidenDeclaracion');
  });
});
