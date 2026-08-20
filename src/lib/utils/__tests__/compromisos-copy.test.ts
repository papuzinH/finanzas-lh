import { describe, it, expect } from 'vitest';
import { cicloSub } from '../compromisos-copy';

describe('cicloSub', () => {
  const cierre = new Date(2026, 7, 22);      // 22-ago
  const vencimiento = new Date(2026, 7, 30); // 30-ago

  it('arma las dos fechas', () => {
    const r = cicloSub(cierre, vencimiento, new Date(2026, 7, 18));
    expect(r.fechas).toBe('cierra el 22 ago · vence el 30 ago');
  });

  it('cuenta los días transcurridos del ciclo (ciclo = 22-jul → 22-ago)', () => {
    const r = cicloSub(cierre, vencimiento, new Date(2026, 7, 18));
    expect(r.dias).toBe('27 días del ciclo transcurridos'); // 22-jul → 18-ago
    expect(r.pct).toBeGreaterThan(80);
    expect(r.pct).toBeLessThanOrEqual(100);
  });

  it('singulariza y clampa al arrancar el ciclo', () => {
    const r = cicloSub(cierre, vencimiento, new Date(2026, 6, 23)); // 23-jul
    expect(r.dias).toBe('1 día del ciclo transcurrido');
    expect(r.pct).toBeGreaterThanOrEqual(0);
  });

  it('sin fecha de cierre: solo vencimiento y pct 100', () => {
    const r = cicloSub(undefined, vencimiento, new Date(2026, 7, 18));
    expect(r.fechas).toBe('vence el 30 ago');
    expect(r.pct).toBe(100);
    expect(r.dias).toBe('');
  });
});
