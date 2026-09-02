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
          const fila = filas.find((f) => f.id === id) ?? filas[0];
          const actualizada = { ...fila, ...patch };
          return {
            select: () => ({ single: () => ({ data: actualizada, error: null }) }),
            // aplicarRealineado hace `.update(...).eq(...)` SIN encadenar select/single (Fix
            // 2 del round 1): awaitear este objeto directo tiene que resolver { error: null },
            // como lo haria el cliente real.
            then: (resolve: (v: { data: null; error: null }) => void) => resolve({ data: null, error: null }),
          };
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

  it('re-fecha el resumen futuro generado cuando los defaults de la tarjeta ya no coinciden', async () => {
    // Con los defaults originales de TARJETA (20/28), el fresco que recalcularFuturosGenerated
    // calcula para octubre coincide con el existente y no hay nada que re-fechar (por eso
    // ningun test de arriba ejercita el loop de aplicarRealineado). Con estos defaults nuevos
    // (24/2, vence el mes siguiente) el resumen de octubre SI cambia: cierra el 24-oct en vez
    // del 20-oct, y vence el 2-nov en vez del 28-oct.
    const TARJETA_CON_DEFAULTS_NUEVOS = {
      ...TARJETA,
      default_closing_day: 24,
      default_payment_day: 2,
    } as unknown as PaymentMethod;
    const { supabase, updates } = dobleSupabase();

    await guardarDeclaracion(supabase, TARJETA_CON_DEFAULTS_NUEVOS, '2026-09-24', '2026-10-02', '2026-09-02');

    const futuro = updates.find((u) => u.id === 'oct');
    expect(futuro?.patch).toEqual({ closing_date: '2026-10-24', due_date: '2026-11-02' });
  });
});
