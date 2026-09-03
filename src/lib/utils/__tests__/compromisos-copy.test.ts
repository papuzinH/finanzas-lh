import { describe, it, expect } from 'vitest';
import { cicloSub, montoDelCiclo, avisoDeVencidos } from '../compromisos-copy';
import { formatCurrency } from '@/lib/utils';

describe('cicloSub', () => {
  const cierre = new Date(2026, 7, 22);      // 22-ago
  const vencimiento = new Date(2026, 7, 30); // 30-ago

  it('arma las dos fechas', () => {
    const r = cicloSub(cierre, vencimiento, new Date(2026, 7, 18));
    expect(r.fechas).toBe('cierra el 22 ago · vence el 30 ago');
  });

  it('el dia del cierre sigue en presente: el ciclo corre hasta las 23:59 (E16)', () => {
    const r = cicloSub(cierre, vencimiento, new Date(2026, 7, 22, 14, 0));
    expect(r.fechas).toBe('cierra el 22 ago · vence el 30 ago');
  });

  it('pasado el cierre lo dice en pasado: ese resumen ya se emitio', () => {
    // Decia "cierra el 22 ago" para un resumen cerrado hace una semana, justo en la
    // pantalla donde se le pide al usuario que copie las fechas del papel.
    const r = cicloSub(cierre, vencimiento, new Date(2026, 7, 29));
    expect(r.fechas).toBe('cerró el 22 ago · vence el 30 ago');
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

describe('montoDelCiclo', () => {
  // La card mostraba SOLO `totalARS` como cifra grande y el `u$s` suelto abajo,
  // pegado al chip de pago: se leían como dos datos distintos y ninguno decía
  // cuánto se debe. En la Visa real del 2026-09-01 la card decía $260.582 y el
  // resumen era $324.078. Acá las dos monedas salen juntas y de la misma fuente.
  const visa = { total: 324078.25, totalARS: 260582, totalUSD: 132.41 };

  it('con las dos monedas, muestra ambas y no las mezcla en un solo número', () => {
    const r = montoDelCiclo(visa);
    expect(r.principal).toBe(formatCurrency(260582));
    expect(r.secundario).toBe('+ u$s 132,41');
    // Lo que NO tiene que pasar: convertir los dólares y mostrar un total solo.
    expect(r.principal).not.toContain('324');
  });

  it('sin dólares, no inventa una segunda línea', () => {
    expect(montoDelCiclo({ total: 100000, totalARS: 100000, totalUSD: 0 })).toEqual({
      principal: formatCurrency(100000),
      secundario: null,
    });
  });

  it('un resumen sólo en dólares se muestra en dólares, no en pesos', () => {
    const r = montoDelCiclo({ total: 145000, totalARS: 0, totalUSD: 100 });
    expect(r.principal).toBe('u$s 100,00');
    expect(r.secundario).toBeNull();
  });

  it('un resumen sin desglose cae al total, para no mostrar cero', () => {
    expect(montoDelCiclo({ total: 5000, totalARS: 0, totalUSD: 0 })).toEqual({
      principal: formatCurrency(5000),
      secundario: null,
    });
  });
});

describe('avisoDeVencidos', () => {
  // El aviso es la unica via para que el usuario salde un resumen vencido, y por
  // eso tambien es la explicacion de por que su disponible esta mas bajo: el
  // resumen sigue descontado hasta que lo marque (computePendingCreditCards).
  const vencido = (over = {}) => ({
    cycleId: 'cy1', methodId: 'c1', name: 'Visa Galicia', total: 324078, totalARS: 324078, totalUSD: 0,
    nextPaymentDate: new Date(2026, 8, 1), isCycleClosed: true, isPending: true,
    isPaidManually: false, isOverdue: true, ...over,
  });

  it('sin resumenes vencidos no hay aviso', () => {
    expect(avisoDeVencidos([])).toBeNull();
    expect(avisoDeVencidos([vencido({ isOverdue: false })])).toBeNull();
  });

  it('con uno, lo nombra y dice cuanto', () => {
    const a = avisoDeVencidos([vencido()]);
    expect(a?.titulo).toContain('Visa Galicia');
    expect(a?.detalle).toContain(formatCurrency(324078));
  });

  it('dice que lo sigue descontando: es la explicacion del numero, no un reto', () => {
    expect(avisoDeVencidos([vencido()])?.detalle).toMatch(/descont/i);
  });

  it('con varios no enumera montos sueltos: cuenta cuantos y suma', () => {
    const a = avisoDeVencidos([
      vencido(),
      vencido({ methodId: 'c2', name: 'Mastercard', total: 100000, totalARS: 100000 }),
    ]);
    expect(a?.titulo).toContain('2');
    expect(a?.detalle).toContain(formatCurrency(424078));
  });
});
