import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { PaymentMethod } from '@/types/database';
import type { CreditCardCycle } from '@/lib/finance/cycles';

vi.mock('@/lib/ciclos/asegurar', () => ({ asegurarCiclos: vi.fn() }));
import { asegurarCiclos } from '@/lib/ciclos/asegurar';
import { resolverCicloDeCompra } from '../resolver';

const asegurarMock = asegurarCiclos as unknown as Mock;

// Ciclos DESPAREJOS a proposito: cierres 23-jul / 20-ago / 24-sep.
// Un fixture mensual perfecto no probaria nada (ver Global Constraints).
const CICLOS: CreditCardCycle[] = [
  { id: 'c-jul', user_id: 'u1', payment_method_id: 'pm1', closing_date: '2026-07-23', due_date: '2026-07-31', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  { id: 'c-ago', user_id: 'u1', payment_method_id: 'pm1', closing_date: '2026-08-20', due_date: '2026-08-28', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
  { id: 'c-sep', user_id: 'u1', payment_method_id: 'pm1', closing_date: '2026-09-24', due_date: '2026-10-02', source: 'declared', created_at: '2026-01-01T00:00:00Z' },
];

const TARJETA = {
  id: 'pm1', user_id: 'u1', name: 'Visa', type: 'credit',
  default_closing_day: 20, default_payment_day: 28,
} as unknown as PaymentMethod;

const supa = {} as never;

beforeEach(() => { asegurarMock.mockReset(); });

describe('resolverCicloDeCompra', () => {
  it('devuelve el resumen que contiene la compra y su vencimiento', async () => {
    asegurarMock.mockResolvedValue(CICLOS);
    const r = await resolverCicloDeCompra(supa, TARJETA, '2026-09-10', 2);
    expect(r.ciclo?.id).toBe('c-sep');
    expect(r.dueDate).toBe('2026-10-02');
    expect(r.ciclos).toHaveLength(3);
  });

  it('pide la ventana que va de un mes antes de la compra a mesesAdelante despues', async () => {
    asegurarMock.mockResolvedValue(CICLOS);
    await resolverCicloDeCompra(supa, TARJETA, '2026-09-10', 4);
    const [, , desde, hasta] = asegurarMock.mock.calls[0];
    expect((desde as Date).getMonth()).toBe(7);  // agosto
    expect((hasta as Date).getMonth()).toBe(0);  // enero
    expect((hasta as Date).getFullYear()).toBe(2027);
  });

  it('cae al calculo por defaults cuando ningun resumen contiene la compra', async () => {
    asegurarMock.mockResolvedValue([]);
    const r = await resolverCicloDeCompra(supa, TARJETA, '2026-09-10', 2);
    expect(r.ciclo).toBeUndefined();
    // cierre 20 / vence 28: la compra del 10 entra al ciclo que cierra el 20 de septiembre
    expect(r.dueDate).toBe('2026-09-28');
  });

  it('no toca la red ni inventa fechas si la tarjeta no tiene dias configurados', async () => {
    const sinDias = { ...TARJETA, default_closing_day: null, default_payment_day: null } as PaymentMethod;
    const r = await resolverCicloDeCompra(supa, sinDias, '2026-09-10', 2);
    expect(asegurarMock).not.toHaveBeenCalled();
    expect(r.ciclo).toBeUndefined();
    expect(r.dueDate).toBe('2026-09-10');
    expect(r.ciclos).toEqual([]);
  });

  it('respeta la regla del borde: la compra del dia del cierre entra al ciclo que cierra', async () => {
    asegurarMock.mockResolvedValue(CICLOS);
    const r = await resolverCicloDeCompra(supa, TARJETA, '2026-08-20', 2);
    expect(r.ciclo?.id).toBe('c-ago');
    expect(r.dueDate).toBe('2026-08-28');
  });
});
