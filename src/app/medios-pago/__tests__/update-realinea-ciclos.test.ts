import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/ciclos/declarar', () => ({ realinearFuturos: vi.fn().mockResolvedValue(0) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const guardada = {
  id: 'pm1', user_id: 'u1', type: 'credit',
  default_closing_day: 24, default_payment_day: 6,
};

// Doble de Supabase: mismo patron que payment-method-dueno.test.ts (leerlo antes).
// `select().eq().eq().maybeSingle()` devuelve la tarjeta guardada; `update()` no falla.
const from = vi.fn(() => ({
  select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: guardada, error: null }) }) }) }),
  update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
}));

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from,
  }),
}));

import { realinearFuturos } from '@/lib/ciclos/declarar';
import { updatePaymentMethod } from '../actions';
const realinearMock = realinearFuturos as unknown as Mock;

const BASE = { name: 'Visa', type: 'credit' as const, default_closing_day: 24, default_payment_day: 6 };

beforeEach(() => { realinearMock.mockClear(); });

describe('updatePaymentMethod re-fecha los resumenes futuros', () => {
  it('llama a realinearFuturos cuando cambia el dia de vencimiento', async () => {
    // guardada: cierre 24 / vence 6  ->  se edita a cierre 24 / vence 2
    await updatePaymentMethod('pm1', { ...BASE, default_payment_day: 2 });
    expect(realinearMock).toHaveBeenCalledTimes(1);
    expect(realinearMock.mock.calls[0][1]).toMatchObject({ id: 'pm1' });
  });

  it('llama a realinearFuturos cuando cambia el dia de cierre', async () => {
    await updatePaymentMethod('pm1', { ...BASE, default_closing_day: 20 });
    expect(realinearMock).toHaveBeenCalledTimes(1);
  });

  it('NO lo llama si los dos dias quedaron iguales', async () => {
    await updatePaymentMethod('pm1', { ...BASE, name: 'Visa Galicia' });
    expect(realinearMock).not.toHaveBeenCalled();
  });

  it('NO lo llama para un medio que no es credito', async () => {
    await updatePaymentMethod('pm1', {
      name: 'Mercado Pago', type: 'debit',
      default_closing_day: null, default_payment_day: null,
    });
    expect(realinearMock).not.toHaveBeenCalled();
  });

  it('devuelve success aunque el realineado falle: la tarjeta ya se guardo', async () => {
    realinearMock.mockRejectedValueOnce(new Error('boom'));
    const r = await updatePaymentMethod('pm1', { ...BASE, default_payment_day: 2 });
    expect(r).toEqual({ success: true });
  });
});
