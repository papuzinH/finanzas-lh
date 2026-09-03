/**
 * Cuando un resumen pide que el usuario cargue sus fechas reales.
 *
 * La regla es una VENTANA -- del cierre al vencimiento -- y las dos puntas tienen razon
 * propia. Antes del cierre el dato no existe: la Ley 25.065 art. 23 obliga al banco a
 * imprimir el cierre y el vencimiento siguientes en cada resumen, asi que recien lo tenes
 * cuando el resumen se emite. Despues del vencimiento el papel ya es viejo, la fecha no
 * esta a mano y lo accionable pasa a ser pagarlo, no fecharlo.
 *
 * La punta de arriba faltaba, y era un bug de verdad. La version anterior tomaba como
 * candidato CUALQUIER resumen estimado ya cerrado y mostraba el ultimo: medido contra
 * datos reales el 2026-09-03, eso daba 13 candidatos en una tarjeta y 12 en la otra, 25
 * en total. Declarar el de agosto hacia aparecer el de julio, visualmente idéntico -- una
 * cola de 25 avisos servidos de a uno, que se vaciaba recien tras 25 declaraciones. La
 * contradiccion estaba escrita en el propio docstring de la funcion, que usaba "el dato de
 * los anteriores ya no esta a mano" para justificar uno por tarjeta y no lo aplicaba para
 * descartar los viejos.
 *
 * Y la ventana ademas garantiza UNO POR TARJETA sin ordenar ni deduplicar nada: los
 * resumenes de una tarjeta no se solapan, asi que a lo sumo uno contiene a `hoy`.
 */
import { describe, it, expect } from 'vitest';
import { pideDeclaracion } from '@/lib/finance/cycles';

const ciclo = (over: Partial<Parameters<typeof pideDeclaracion>[0]> = {}) => ({
  id: 'c', user_id: 'u', payment_method_id: 'pm', created_at: 'x',
  reminder_dismissed_at: null,
  closing_date: '2026-08-24', due_date: '2026-09-05',
  source: 'generated' as const,
  ...over,
});

describe('pideDeclaracion', () => {
  it('pide las fechas de un resumen estimado que ya cerro y todavia no vencio', () => {
    expect(pideDeclaracion(ciclo(), '2026-09-03')).toBe(true);
  });

  it('el dia del cierre ya pide: el resumen se emite ese dia', () => {
    expect(pideDeclaracion(ciclo(), '2026-08-24')).toBe(true);
  });

  it('no pide antes del cierre: el banco todavia no emitio el papel', () => {
    expect(pideDeclaracion(ciclo(), '2026-08-23')).toBe(false);
  });

  it('el dia del vencimiento todavia pide: es el ultimo dia que el resumen esta vivo', () => {
    expect(pideDeclaracion(ciclo(), '2026-09-05')).toBe(true);
  });

  it('NO pide un resumen viejo: pasado el vencimiento la fecha ya no esta a mano', () => {
    // El bug: en septiembre, el resumen de julio seguia pidiendo sus fechas.
    expect(pideDeclaracion(ciclo({ closing_date: '2026-07-24', due_date: '2026-08-05' }), '2026-09-03')).toBe(false);
  });

  it('no pide uno que el usuario ya declaro', () => {
    expect(pideDeclaracion(ciclo({ source: 'declared' }), '2026-09-03')).toBe(false);
  });
});
