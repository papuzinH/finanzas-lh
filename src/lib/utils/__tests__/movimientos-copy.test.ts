import { describe, it, expect } from 'vitest';
import { dayGroupLabel } from '../movimientos-copy';

const NOW = new Date(2026, 7, 18); // mar 18-ago-2026

describe('dayGroupLabel', () => {
  it('hoy: "Hoy · mar 18"', () => {
    expect(dayGroupLabel('2026-08-18', NOW)).toBe('Hoy · mar 18');
  });

  it('ayer: "Ayer · lun 17"', () => {
    expect(dayGroupLabel('2026-08-17', NOW)).toBe('Ayer · lun 17');
  });

  it('otro día del mismo mes: "vie 14"', () => {
    expect(dayGroupLabel('2026-08-14', NOW)).toBe('vie 14');
  });

  it('día de otro mes: agrega el mes — "mié 8 jul"', () => {
    expect(dayGroupLabel('2026-07-08', NOW)).toBe('mié 8 jul');
  });

  it('día de otro año: agrega mes y año — "lun 8 dic 2025"', () => {
    expect(dayGroupLabel('2025-12-08', NOW)).toBe('lun 8 dic 2025');
  });
});
