/**
 * Borrar una mensualidad que ya tiene movimientos posteados.
 *
 * `transactions.recurring_plan_id` tiene FK sin `ON DELETE`, así que el DELETE del
 * plan se rechaza con `23503` mientras exista una transacción apuntándole. Y el sync
 * postea solas las mensualidades de tarjeta, así que cualquiera acumula movimientos
 * y se vuelve imborrable: medido contra datos reales, 18 de 18 y 3 de 3 del demo.
 *
 * Los movimientos son gastos que ocurrieron de verdad, así que NO se borran: se
 * desvinculan (`recurring_plan_id = null`) y quedan en el historial como gastos
 * sueltos. Es el mismo patrón que ya usa el borrado de categorías.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado: { cliente: ClienteFalso | null } = { cliente: null };

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => estado.cliente,
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const UID = 'usuario-1';

type Op = { tabla: string; tipo: 'update' | 'delete'; datos?: Record<string, unknown>; filtros: Record<string, unknown> };

type ClienteFalso = ReturnType<typeof clienteFalso>;

/** `fkBloquea`: el delete del plan falla con 23503, o sea el estado previo al fix. */
function clienteFalso(fkBloquea = false) {
  const ops: Op[] = [];

  const from = (tabla: string) => {
    const filtros: Record<string, unknown> = {};
    const query = {
      update(datos: Record<string, unknown>) {
        ops.push({ tabla, tipo: 'update', datos, filtros });
        return query;
      },
      delete() {
        ops.push({ tabla, tipo: 'delete', filtros });
        return query;
      },
      eq(col: string, val: unknown) {
        filtros[col] = val;
        return query;
      },
      then(resolve: (r: { error: unknown }) => void) {
        const ultima = ops[ops.length - 1];
        const rompe = fkBloquea && ultima.tabla === 'recurring_plans' && ultima.tipo === 'delete';
        resolve({
          error: rompe
            ? { code: '23503', message: 'violates foreign key constraint "transactions_recurring_plan_id_fkey"' }
            : null,
        });
      },
    };
    return query;
  };

  return {
    ops,
    from,
    auth: { getUser: async () => ({ data: { user: { id: UID } } }) },
  };
}

const { deleteSubscription } = await import('../actions');

describe('deleteSubscription', () => {
  beforeEach(() => { estado.cliente = null; });

  it('desvincula los movimientos posteados ANTES de borrar el plan', async () => {
    estado.cliente = clienteFalso();

    const r = await deleteSubscription('plan-1');

    expect(r.error).toBeFalsy();
    const [primera, segunda] = estado.cliente.ops;
    // El orden importa: si el delete va primero, la FK lo rechaza.
    expect(primera).toMatchObject({
      tabla: 'transactions',
      tipo: 'update',
      datos: { recurring_plan_id: null },
      filtros: { recurring_plan_id: 'plan-1', user_id: UID },
    });
    expect(segunda).toMatchObject({
      tabla: 'recurring_plans',
      tipo: 'delete',
      filtros: { id: 'plan-1', user_id: UID },
    });
  });

  it('NO borra los movimientos: son gastos que ocurrieron de verdad', async () => {
    estado.cliente = clienteFalso();

    await deleteSubscription('plan-1');

    const borradosDeTransactions = estado.cliente.ops.filter(
      (o) => o.tabla === 'transactions' && o.tipo === 'delete',
    );
    expect(borradosDeTransactions).toHaveLength(0);
  });

  it('desvincula filtrando por usuario, no sólo por plan', async () => {
    // Un id que llega del cliente se valida contra su tabla (auditoría M4).
    estado.cliente = clienteFalso();

    await deleteSubscription('plan-1');

    const update = estado.cliente.ops.find((o) => o.tabla === 'transactions');
    expect(update?.filtros.user_id).toBe(UID);
  });

  it('si el delete falla igual, lo dice en vez de callarse', async () => {
    estado.cliente = clienteFalso(true);

    const r = await deleteSubscription('plan-1');

    expect(r.error).toBeTruthy();
  });
});
