import { describe, it, expect } from 'vitest';
import type { PaymentMethod } from '@/types/database';
import { guardarDeclaracion, realinearFuturos } from '../declarar';

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
  // Cada elemento es UNA llamada al upsert, con todas las filas que le fueron en el payload:
  // asi el test puede afirmar que el realineado escribe una sola vez y no N veces.
  const upserts: Record<string, unknown>[][] = [];
  const supabase = {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ data: filas, error: null }) }) }),
      upsert: (rows: Record<string, unknown>[]) => {
        upserts.push(rows);
        return { then: (resolve: (v: { data: null; error: null }) => void) => resolve({ data: null, error: null }) };
      },
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
  return { supabase, updates, inserts, upserts };
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

  it('con cycleId corrige ESE resumen aunque el cierre real caiga en otro mes calendario', async () => {
    // El caso del borde de mes: el estimado de octubre cierra el 1-oct y el usuario lee del
    // papel que en realidad cerro el 29-sep. Resolver por mes calendario apuntaria al resumen
    // de SEPTIEMBRE -- otro resumen, y encima uno que ya cerro -- y dejaria el de octubre
    // intacto, con el recordatorio que se quiso silenciar todavia en pantalla despues de un
    // guardado que dijo que salio bien. Los tres puntos de entrada conocen el id exacto.
    const BORDE = [
      { id: 'sep', user_id: 'u1', payment_method_id: 'pm1', closing_date: '2026-09-01', due_date: '2026-09-10', source: 'generated', created_at: 'x' },
      { id: 'oct', user_id: 'u1', payment_method_id: 'pm1', closing_date: '2026-10-01', due_date: '2026-10-10', source: 'generated', created_at: 'x' },
    ];
    const { supabase, updates, inserts } = dobleSupabase(BORDE);

    await guardarDeclaracion(supabase, TARJETA, '2026-09-29', '2026-10-08', '2026-09-02', 'oct');

    expect(inserts).toHaveLength(0);
    expect(updates.find((u) => u.id === 'oct')?.patch).toMatchObject({
      closing_date: '2026-09-29', due_date: '2026-10-08', source: 'declared',
    });
    // Y el de septiembre, que ya cerro, no se toca.
    expect(updates.find((u) => u.id === 'sep')).toBeUndefined();
  });

  it('sin cycleId sigue resolviendo por mes calendario (el camino de siempre)', async () => {
    const { supabase, updates } = dobleSupabase();
    await guardarDeclaracion(supabase, TARJETA, '2026-09-24', '2026-10-02', '2026-09-02');
    expect(updates.find((u) => u.id === 'sep')).toBeDefined();
  });

  it('un cycleId que no es de esta tarjeta cae a la resolucion por mes, nunca escribe fuera', async () => {
    // leerCiclos ya filtra por payment_method_id y el medio ya se valido como propio en la
    // action, asi que un id ajeno simplemente no aparece: se degrada al camino de siempre.
    const { supabase, updates } = dobleSupabase();
    await guardarDeclaracion(supabase, TARJETA, '2026-09-24', '2026-10-02', '2026-09-02', 'de-otra-tarjeta');
    expect(updates.find((u) => u.id === 'sep')).toBeDefined();
    expect(updates.find((u) => u.id === 'de-otra-tarjeta')).toBeUndefined();
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
    const { supabase, upserts } = dobleSupabase();

    await guardarDeclaracion(supabase, TARJETA_CON_DEFAULTS_NUEVOS, '2026-09-24', '2026-10-02', '2026-09-02');

    // El realineado paso de N updates a un unico upsert todo-o-nada (ver el describe de
    // realinearFuturos), asi que el futuro re-fechado se busca en el payload de ese upsert.
    // Lo que se afirma sigue siendo lo mismo: octubre cierra el 24 y vence el 2-nov.
    const futuro = upserts[0]?.find((f) => f.id === 'oct');
    expect(futuro).toMatchObject({ closing_date: '2026-10-24', due_date: '2026-11-02' });
  });

  it('avisa cual es el resumen que ya tiene esas fechas, en vez de dejar reventar la unique', async () => {
    // El caso real (Lauti, 2026-09-03): la card de Compromisos pide las fechas del resumen que
    // YA CERRO, el usuario entiende que le pide las del vigente y escribe las del siguiente --
    // que ya existe. El update violaba la unique (payment_method_id, closing_date) y el error
    // crudo de Postgres terminaba en pantalla: "duplicate key value violates unique constraint
    // credit_card_cycles_payment_method_id_closing_date_key".
    const { supabase, updates } = dobleSupabase();

    await expect(
      guardarDeclaracion(supabase, TARJETA, '2026-10-20', '2026-10-28', '2026-09-02', 'sep'),
    ).rejects.toThrow(/ya son las del resumen que cierra el 20 oct/);

    // Y no escribe nada: corta antes del update, no despues de que falle.
    expect(updates).toHaveLength(0);
  });
});

describe('realinearFuturos', () => {
  // Defaults nuevos (25/3): los DOS futuros generados cambian de fecha, asi que hay mas de
  // una fila para escribir -- que es la condicion para que la atomicidad importe.
  const TARJETA_MOVIDA = {
    ...TARJETA, default_closing_day: 25, default_payment_day: 3,
  } as unknown as PaymentMethod;

  it('re-fecha todos los futuros en UNA sola escritura: todo o nada', async () => {
    // Antes era un for de updates que cortaba al primer error. El 2026-09-17 eso dejo el
    // conjunto a medias: el resumen de septiembre se movio, el de octubre choco contra la
    // unique (payment_method_id, closing_date) de un declarado, y de noviembre en adelante
    // no se toco nada -- con el error perdido en el console.error de la action, que por
    // decision previa no lo reporta para no decirle al usuario que la tarjeta no se guardo.
    const { supabase, upserts, updates } = dobleSupabase();

    const cuantos = await realinearFuturos(supabase, TARJETA_MOVIDA, '2026-09-02');

    expect(cuantos).toBe(2);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toHaveLength(2);
    expect(updates).toHaveLength(0);
  });

  it('manda la fila entera, no solo las fechas: un upsert necesita las columnas NOT NULL', async () => {
    // Un upsert con {id, closing_date, due_date} dejaria user_id, payment_method_id y source
    // en null y la base lo rechazaria. Se arma desde la fila leida, cambiando solo las fechas.
    const { supabase, upserts } = dobleSupabase();

    await realinearFuturos(supabase, TARJETA_MOVIDA, '2026-09-02');

    const oct = upserts[0].find((f) => f.id === 'oct');
    expect(oct).toMatchObject({
      id: 'oct', user_id: 'u1', payment_method_id: 'pm1', source: 'generated',
      closing_date: '2026-10-25', due_date: '2026-11-03',
    });
  });

  it('no escribe nada cuando no hay nada que re-fechar', async () => {
    // Con los defaults originales los frescos coinciden con lo que hay: ni un upsert vacio.
    const { supabase, upserts } = dobleSupabase();
    expect(await realinearFuturos(supabase, TARJETA, '2026-09-02')).toBe(0);
    expect(upserts).toHaveLength(0);
  });
});
