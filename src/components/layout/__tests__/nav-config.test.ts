import { describe, it, expect } from 'vitest';
import { MOBILE_ITEMS, MORE_DESTINATIONS, isActive, isMoreActive } from '../nav-config';

describe('nav-config', () => {
  it('la barra mobile tiene 4 destinos directos, sin Inversiones', () => {
    expect(MOBILE_ITEMS.map(i => i.href)).toEqual(['/', '/movimientos', '/compromisos', '/objetivos']);
  });

  it('Más agrupa Inversiones, Medios de pago y Ajustes', () => {
    expect(MORE_DESTINATIONS.map(i => i.href)).toEqual(['/inversiones', '/medios-pago', '/ajustes']);
  });

  it('isActive: raíz solo exacta; el resto por prefijo de segmento', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/', '/movimientos')).toBe(false);
    expect(isActive('/movimientos', '/movimientos')).toBe(true);
    expect(isActive('/movimientos', '/movimientos/detalle')).toBe(true);
    expect(isActive('/movimientos', '/movimientos-x')).toBe(false);
  });

  it('isMoreActive: true en cualquier destino del sheet, incluidas subrutas', () => {
    expect(isMoreActive('/inversiones')).toBe(true);
    expect(isMoreActive('/medios-pago')).toBe(true);
    expect(isMoreActive('/ajustes')).toBe(true);
    expect(isMoreActive('/ajustes/medios')).toBe(true);
    expect(isMoreActive('/objetivos')).toBe(false);
    expect(isMoreActive('/')).toBe(false);
  });
});
