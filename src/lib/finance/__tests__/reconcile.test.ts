import { describe, it, expect } from 'vitest';
import { daysSinceLastRegistration, reconcileOptionsFor, reconcileHeadline } from '../reconcile';
import type { ProcessedTransaction } from '../types';

const NOW = new Date(2026, 7, 20, 12, 0, 0); // 20-ago-2026

const tx = (createdAt: string): ProcessedTransaction => ({
  id: createdAt, user_id: 'u1', type: 'expense', amount: 1000,
  date: '2026-08-01', periodDate: '2026-08-01', realPaymentDate: '2026-08-01',
  payment_method_id: 'm1', category_id: 'c1', created_at: createdAt,
  installment_plan_id: null, recurring_plan_id: null, card_payment_for: null,
  is_balance_adjustment: false,
} as unknown as ProcessedTransaction);

describe('daysSinceLastRegistration', () => {
  it('sin transacciones no hay dato', () => {
    expect(daysSinceLastRegistration([], NOW)).toBeNull();
  });

  it('cuenta desde created_at, no desde la fecha del movimiento', () => {
    // Un gasto con fecha de hace un mes pero registrado hoy NO dispara el recordatorio.
    expect(daysSinceLastRegistration([tx('2026-08-20T09:00:00Z')], NOW)).toBe(0);
  });

  it('toma el registro mas reciente', () => {
    const r = daysSinceLastRegistration(
      [tx('2026-08-10T09:00:00Z'), tx('2026-08-18T09:00:00Z'), tx('2026-08-12T09:00:00Z')],
      NOW,
    );
    expect(r).toBe(2);
  });

  it('una cuota con fecha futura no cuenta como registro de hoy', () => {
    expect(daysSinceLastRegistration([tx('2026-08-15T09:00:00Z')], NOW)).toBe(5);
  });

  it('una transferencia interna reciente cuenta como registro (conciliar "lo mande a una reserva")', () => {
    // Sin transacciones desde hace 5 dias, pero el usuario acaba de conciliar con una
    // transferencia a reserva: el recordatorio no debe seguir contando desde la transaccion vieja.
    const r = daysSinceLastRegistration(
      [tx('2026-08-15T09:00:00Z')],
      NOW,
      [{ created_at: '2026-08-20T09:00:00Z' }],
    );
    expect(r).toBe(0);
  });

  it('toma la mas reciente entre transacciones y transferencias', () => {
    const r = daysSinceLastRegistration(
      [tx('2026-08-18T09:00:00Z')],
      NOW,
      [{ created_at: '2026-08-12T09:00:00Z' }],
    );
    expect(r).toBe(2);
  });

  it('sin transacciones, una transferencia interna sola tambien cuenta', () => {
    const r = daysSinceLastRegistration([], NOW, [{ created_at: '2026-08-19T09:00:00Z' }]);
    expect(r).toBe(1);
  });
});

describe('reconcileOptionsFor', () => {
  it('si falta plata, pudo irse al ahorro, ser un gasto, o quedar como ajuste', () => {
    expect(reconcileOptionsFor(-50000)).toEqual(['transfer', 'expense', 'adjustment']);
  });

  it('si sobra plata, fue un ingreso o queda como ajuste: no se puede "mandar al ahorro" lo que aparecio', () => {
    expect(reconcileOptionsFor(50000)).toEqual(['income', 'adjustment']);
  });

  it('si el saldo coincide no hay nada que clasificar', () => {
    expect(reconcileOptionsFor(0)).toEqual([]);
  });

  it('una diferencia menor a un peso se trata como coincidencia (redondeo)', () => {
    expect(reconcileOptionsFor(-0.4)).toEqual([]);
  });
});

describe('reconcileHeadline', () => {
  it('nombra la diferencia en la direccion correcta', () => {
    expect(reconcileHeadline(-50000)).toBe('Te falta anotar una salida');
    expect(reconcileHeadline(50000)).toBe('Te falta anotar una entrada');
    expect(reconcileHeadline(0)).toBe('El saldo coincide');
  });
});
