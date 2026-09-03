/**
 * Qué acciones ofrece el menú de una fila de /movimientos.
 *
 * Va como función pura y no como markup porque el ActionSheet arranca cerrado y
 * su contenido vive detrás del Portal de Radix, que resuelve su contenedor en un
 * `useLayoutEffect` -- y ese efecto nunca corre bajo `renderToStaticMarkup`, que
 * es como testea toda la suite (sin jsdom). Un test de markup sobre el sheet
 * asserta contra una cadena vacía y pasa siempre.
 */
import { describe, it, expect, vi } from 'vitest';
import { accionesDeTransaccion } from '../transaction-item';

const nada = () => {};
const base = {
  esCuota: false,
  puedeVerEnResumen: false,
  onEditar: nada,
  onEliminar: nada,
  onVerEnResumen: nada,
};

const labels = (a: ReturnType<typeof accionesDeTransaccion>) => a.map((x) => x.label);

describe('accionesDeTransaccion', () => {
  it('un movimiento comun ofrece editar y eliminar', () => {
    expect(labels(accionesDeTransaccion(base))).toEqual(['Editar', 'Eliminar']);
  });

  it('una cuota NO ofrece editar ni eliminar: se gestiona desde Cuotas', () => {
    const a = accionesDeTransaccion({ ...base, esCuota: true });
    expect(labels(a)).not.toContain('Editar');
    expect(labels(a)).not.toContain('Eliminar');
  });

  it('una cuota de tarjeta imputada a un resumen ofrece VER EN EL RESUMEN, habilitado', () => {
    // El caso que hoy es un callejón sin salida: el usuario busca la acción acá,
    // que es donde es natural buscarla, y se encuentra un ítem apagado.
    const a = accionesDeTransaccion({ ...base, esCuota: true, puedeVerEnResumen: true });
    expect(labels(a)).toEqual(['Ver en el resumen']);
    expect(a[0].disabled).toBeFalsy();
  });

  it('esa accion navega de verdad', () => {
    const onVerEnResumen = vi.fn();
    const a = accionesDeTransaccion({ ...base, esCuota: true, puedeVerEnResumen: true, onVerEnResumen });
    a[0].onClick();
    expect(onVerEnResumen).toHaveBeenCalledOnce();
  });

  it('una cuota que NO esta imputada a un resumen conserva el aviso de siempre', () => {
    // Débito, o una cuota vieja sin cycle_id: no hay resumen adonde llevarla.
    const a = accionesDeTransaccion({ ...base, esCuota: true });
    expect(labels(a)).toEqual(['Gestionar en Cuotas']);
    expect(a[0].disabled).toBe(true);
    expect(a[0].disabledHint).toBeTruthy();
  });

  it('un movimiento comun de tarjeta NO ofrece ver en el resumen: no es una cuota', () => {
    const a = accionesDeTransaccion({ ...base, puedeVerEnResumen: true });
    expect(labels(a)).toEqual(['Editar', 'Eliminar']);
  });
});
