import { describe, it, expect } from 'vitest';
import { resolveRate } from '../financeStore';
import type { ExchangeRate } from '@/types/database';

const rates: ExchangeRate[] = [
  { id: '1', pair: 'USD_ARS_MEP', rate: 1200, source: 'dolarapi', last_update: '' },
  { id: '2', pair: 'USD_ARS_CCL', rate: 1250, source: 'dolarapi', last_update: '' },
];
const blue = { compra: 1000, venta: 1100, fechaActualizacion: '' };

describe('resolveRate', () => {
  it('usa la cotización del par cuando existe', () => {
    expect(resolveRate('USD_ARS_MEP', rates, blue)).toBe(1200);
  });

  it('cae al dólar blue (venta) si el par no está', () => {
    expect(resolveRate('USDT_ARS', rates, blue)).toBe(1100);
  });

  it('usa el fallback (snapshot) si no hay par ni blue', () => {
    expect(resolveRate('USDT_ARS', [], null, 950)).toBe(950);
  });

  it('devuelve 1 si no hay nada', () => {
    expect(resolveRate(null, [], null)).toBe(1);
  });

  it('ignora rates <= 0', () => {
    const bad: ExchangeRate[] = [{ id: '1', pair: 'USD_ARS_MEP', rate: 0, source: '', last_update: '' }];
    expect(resolveRate('USD_ARS_MEP', bad, blue)).toBe(1100);
  });
});
