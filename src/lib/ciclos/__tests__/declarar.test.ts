import { describe, it, expect } from 'vitest';
import type { PaymentMethod } from '@/types/database';
import { guardarDeclaracion } from '../declarar';

const TARJETA = {
  id: 'pm1', user_id: 'u1', type: 'credit',
  default_closing_day: 20, default_payment_day: 28,
} as unknown as PaymentMethod;

// Estimado de septiembre: cierra el 20, vence el 28. El usuario declara 24-sep / 2-oct.
const EXISTENTES = [
  { id: 'sep', user_id: 'u1', payment_method_id: 'pm1', closing_date: '2026-09-20', due_date: '2026-09-28', source: 'generated', created_at: 'x' },
  { id: 'oct', user_id: 'u1', payment_method_id: 'pm1', closing_date: '2026-10-20', due_date: '2026-10-28', source: 'generated', created_at: 'x' },
];

function dobleSupabase(filas = EXISTENTES) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const inserts: Record<string, unknown>[] = [];
  const supabase = {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ data: filas, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => {
          updates.push({ id, patch });
          return { select: () => ({ single: () => ({ data: { ...filas[0], ...patch }, error: null }) }) };
        },
      }),
      insert: (row: Record<string, unknown>) => {
        inserts.push(row);
        return { select: () => ({ single: () => ({ data: { id: 'nuevo', ...row }, error: null }) }) };
      },
    }),
  } as never;
  return { supabase, updates, inserts };
}

describe('guardarDeclaracion', () => {
  it('corrige el resumen del mismo mes en vez de crear uno nuevo', async () => {
    const { supabase, updates, inserts } = dobleSupabase();
    await guardarDeclaracion(supabase, TARJETA, '2026-09-24', '2026-10-02', '2026-09-02');
    expect(inserts).toHaveLength(0);
    const delMes = updates.find((u) => u.id === 'sep');
    expect(delMes?.patch).toMatchObject({
      closing_date: '2026-09-24', due_date: '2026-10-02', source: 'declared',
    });
  });

  it('inserta cuando ese mes todavia no tiene resumen', async () => {
    const { supabase, inserts } = dobleSupabase([]);
    await guardarDeclaracion(supabase, TARJETA, '2026-09-24', '2026-10-02', '2026-09-02');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      payment_method_id: 'pm1', closing_date: '2026-09-24',
      due_date: '2026-10-02', source: 'declared',
    });
  });

  it('no toca ninguna transaccion: declarar nunca reasigna', async () => {
    const { supabase, updates } = dobleSupabase();
    await guardarDeclaracion(supabase, TARJETA, '2026-09-24', '2026-10-02', '2026-09-02');
    // Solo se escriben filas de credit_card_cycles. Si alguna vez esta task tocara
    // transactions, este test es el que tiene que romperse.
    expect(updates.every((u) => u.patch.closing_date !== undefined || u.patch.due_date !== undefined)).toBe(true);
  });
});
