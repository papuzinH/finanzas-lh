'use server';

import { z } from 'zod';
import { addMonths } from 'date-fns';
import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { dateToLocalString, parseLocalDate } from '@/lib/utils/dates';
import { chargeDayOf, computeMissingAutomaticCharges, isAutomaticPlan } from '@/lib/finance/recurring';
import { asegurarCiclos } from '@/lib/ciclos/asegurar';
import type { CreditCardCycle } from '@/lib/finance/cycles';
import type { TablesInsert } from '@/types/database'

type ActionResponse = {
  error?: string;
  success?: boolean;
};

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Marca una mensualidad como pagada este mes creando la transacción real
 * vinculada (recurring_plan_id). El Disponible Real no cambia: el monto pasa
 * del bucket "pendiente" al saldo ya gastado.
 *
 * `fecha` (opcional, `yyyy-MM-dd`) fija la fecha de la transacción explícitamente. Sin
 * ella, se usa el reloj del servidor — que en Vercel corre en UTC (no hay `TZ` seteada) y
 * puede desfasarse un día del "hoy" del cliente (Argentina, UTC-3) entre ~21:00 y
 * medianoche. `/puesta-a-punto` pasa su propio `hoy` para que la transacción quede
 * fechada igual que el ancla que guarda en el mismo paso: si el servidor la fechara
 * "mañana", `anchorValueForDeclaredBalance` la trataría como un movimiento futuro, no la
 * descontaría del ancla, y al día siguiente sí la restaría del saldo — el mismo agujero
 * que ese paso vino a cerrar. El call site de Compromisos no pasa nada: sigue como antes.
 */
export async function markRecurringPlanPaid(planId: string, fecha?: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'No autorizado' };
    }

    if (fecha !== undefined && !fechaSchema.safeParse(fecha).success) {
      return { error: 'Fecha inválida' };
    }

    const { data: plan, error: planError } = await supabase
      .from('recurring_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', user.id)
      .single();
    if (planError || !plan) {
      return { error: 'Plan no encontrado' };
    }

    const dia = fecha ?? dateToLocalString(new Date());
    const referencia = parseLocalDate(dia);

    // Guard anti-duplicado: si ya hay pago registrado en el mes de `dia`, no crear otro.
    const monthStart = dateToLocalString(new Date(referencia.getFullYear(), referencia.getMonth(), 1));
    const monthEnd = dateToLocalString(new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0));
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('recurring_plan_id', planId)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .limit(1);
    if (existing && existing.length > 0) {
      return { success: true };
    }

    const isUsd = plan.currency === 'USD';
    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      description: plan.description,
      amount: Math.abs(Number(plan.amount)),
      date: dia,
      type: 'expense' as const,
      category_id: plan.category_id,
      payment_method_id: plan.payment_method_id,
      recurring_plan_id: plan.id,
      original_currency: isUsd ? 'USD' : 'ARS',
      original_amount: isUsd ? plan.original_amount : Math.abs(Number(plan.amount)),
      rate_pair: isUsd ? plan.rate_pair : null,
      exchange_rate: isUsd ? plan.exchange_rate : null,
    });
    if (txError) {
      console.error('Error registrando pago de mensualidad:', txError);
      return { error: `No se pudo registrar el pago: ${txError.message}` };
    }

    revalidatePath('/compromisos');
    revalidatePath('/');
    return { success: true };
  } catch (e) {
    console.error('Error inesperado en markRecurringPlanPaid:', e);
    return { error: 'Ocurrió un error inesperado' };
  }
}

/**
 * Deshace el pago del mes actual de una mensualidad (borra la transacción
 * vinculada de este mes).
 */
export async function unmarkRecurringPlanPaid(planId: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'No autorizado' };
    }

    const now = new Date();
    const monthStart = dateToLocalString(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = dateToLocalString(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', user.id)
      .eq('recurring_plan_id', planId)
      .gte('date', monthStart)
      .lte('date', monthEnd);
    if (error) {
      console.error('Error deshaciendo pago de mensualidad:', error);
      return { error: 'No se pudo deshacer el pago' };
    }

    revalidatePath('/compromisos');
    revalidatePath('/');
    return { success: true };
  } catch (e) {
    console.error('Error inesperado en unmarkRecurringPlanPaid:', e);
    return { error: 'Ocurrió un error inesperado' };
  }
}

/**
 * Registra el pago del resumen de una tarjeta de crédito como una salida real
 * del medio que la financia (ej. Mercado Pago). La transacción se marca con
 * `card_payment_for` = id de la tarjeta: baja el saldo del medio financiador,
 * pero es neutra para el Disponible Real global y las analíticas de consumo
 * (las compras de la tarjeta ya están itemizadas). La fecha se setea en el
 * vencimiento del ciclo pagado, así el estado "pagada" se deriva de su existencia.
 *
 * `cycleId` puede ser null: una tarjeta SIN default_closing_day/default_payment_day
 * no genera ciclos a propósito (`generarCiclos` devuelve []), así que no hay resumen
 * que saldar. Ese pago se registra igual, con `cycle_id` null — como eran TODOS los
 * pagos antes de esta rama. Sin eso, esas tarjetas (hay 2 en producción) se quedaban
 * sin ninguna vía de registrar un pago: tampoco tienen chip en Compromisos.
 */
export async function payCreditCardCycle(params: {
  cardMethodId: string;
  fundingMethodId: string;
  amountArs: number;
  date: string; // yyyy-MM-dd (vencimiento / fecha del pago)
  cardName: string;
  cycleId: string | null; // el resumen que este pago salda; null = registro manual sin resumen
}): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'No autorizado' };

    const { cardMethodId, fundingMethodId, amountArs, date, cardName, cycleId } = params;
    if (!fundingMethodId) return { error: 'Elegí con qué medio pagás' };
    if (!amountArs || amountArs <= 0) return { error: 'El monto del pago es inválido' };

    // Guard anti-duplicado: ya hay un pago imputado a ESTE resumen.
    // Antes se buscaba por rango de mes (rangoDelMes), que fue el parche del bug
    // de la Visa que vence el dia 1. Con el ciclo como entidad la pregunta no
    // depende de ninguna aritmetica de fechas.
    // Sin ciclo no hay nada que deduplicar: son pagos sueltos que el usuario
    // registra a mano y puede haber más de uno.
    if (cycleId) {
      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', user.id)
        .eq('card_payment_for', cardMethodId)
        .eq('cycle_id', cycleId)
        .limit(1);
      if (existing && existing.length > 0) return { success: true };
    }

    // category_id es NOT NULL. Usamos una categoría "Pagos de tarjeta" (get-or-create).
    // Igual queda excluida de las analíticas de consumo por el marcador card_payment_for.
    const CARD_PAYMENT_CATEGORY = 'Pagos de tarjeta';
    let categoryId: string;
    const { data: cats } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', CARD_PAYMENT_CATEGORY)
      .limit(1);
    if (cats && cats.length > 0) {
      categoryId = cats[0].id;
    } else {
      const { data: newCat, error: catErr } = await supabase
        .from('categories')
        .insert({ user_id: user.id, name: CARD_PAYMENT_CATEGORY, emoji: '💳', is_system: true, type: 'expense' as const })
        .select('id')
        .single();
      if (catErr || !newCat) {
        console.error('Error creando categoría de pago de tarjeta:', catErr);
        return { error: 'No se pudo preparar la categoría del pago' };
      }
      categoryId = newCat.id;
    }

    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      description: `Pago ${cardName}`,
      amount: Math.abs(Number(amountArs)),
      date,
      type: 'expense' as const,
      category_id: categoryId,
      payment_method_id: fundingMethodId,
      card_payment_for: cardMethodId,
      cycle_id: cycleId,
      original_currency: 'ARS',
      original_amount: Math.abs(Number(amountArs)),
      rate_pair: null,
      exchange_rate: null,
    });
    if (error) {
      console.error('Error registrando pago de tarjeta:', error);
      return { error: `No se pudo registrar el pago: ${error.message}` };
    }

    revalidatePath('/compromisos');
    revalidatePath('/');
    return { success: true };
  } catch (e) {
    console.error('Error inesperado en payCreditCardCycle:', e);
    return { error: 'Ocurrió un error inesperado' };
  }
}

/**
 * Deshace el pago de un ciclo de tarjeta: borra la transacción de pago
 * (`card_payment_for`) imputada a ese resumen (`cycle_id`).
 */
export async function undoCreditCardPayment(params: {
  cardMethodId: string;
  cycleId: string;
}): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'No autorizado' };

    const { cardMethodId, cycleId } = params;

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', user.id)
      .eq('card_payment_for', cardMethodId)
      .eq('cycle_id', cycleId);
    if (error) {
      console.error('Error deshaciendo pago de tarjeta:', error);
      return { error: 'No se pudo deshacer el pago' };
    }

    revalidatePath('/compromisos');
    revalidatePath('/');
    return { success: true };
  } catch (e) {
    console.error('Error inesperado en undoCreditCardPayment:', e);
    return { error: 'Ocurrió un error inesperado' };
  }
}

/**
 * Regulariza el historial: crea las transacciones de mensualidades de meses
 * PASADOS que nunca se registraron (desde el mes de creación de cada plan
 * activo hasta el mes pasado inclusive). El mes actual no se toca: lo maneja
 * el estado Pagado/Pendiente.
 */
export async function backfillRecurringPlansHistory(): Promise<ActionResponse & { created?: number }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'No autorizado' };
    }

    const [
      { data: plans, error: plansError },
      { data: existingTxs, error: txReadError },
      { data: firstIncomeTx, error: firstTxError },
    ] = await Promise.all([
      supabase.from('recurring_plans').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase
        .from('transactions')
        .select('recurring_plan_id, date')
        .eq('user_id', user.id)
        .not('recurring_plan_id', 'is', null),
      supabase
        .from('transactions')
        .select('date')
        .eq('user_id', user.id)
        .eq('type', 'income')
        .order('date', { ascending: true })
        .limit(1),
    ]);
    if (plansError || txReadError || firstTxError) {
      return { error: 'No se pudo leer el historial' };
    }

    const now = new Date();
    const currentMonthKey = dateToLocalString(now).slice(0, 7);

    // Piso del historial: mes del primer INGRESO del usuario. Antes de ese mes
    // la app no tiene ingresos registrados; backfillear mensualidades ahí resta
    // gastos sin contrapartida y hunde el saldo. Ojo: usar el primer INGRESO, no
    // la primera transacción — una cuota/gasto anterior al primer sueldo no debe
    // correr el piso hacia atrás. Sin ingresos, no hay nada que backfillear.
    const floorMonth = firstIncomeTx?.[0]?.date
      ? String(firstIncomeTx[0].date).slice(0, 7)
      : currentMonthKey;

    // Limpieza: pagos generados por backfills previos en meses anteriores al
    // piso. Seguro de borrar: solo esta feature crea transacciones con
    // recurring_plan_id (nada más las escribe en la app).
    const { error: cleanupError } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', user.id)
      .not('recurring_plan_id', 'is', null)
      .lt('date', `${floorMonth}-01`);
    if (cleanupError) {
      console.error('Error limpiando exceso de backfill:', cleanupError);
      return { error: `No se pudo corregir el historial: ${cleanupError.message}` };
    }

    // Meses ya cubiertos por plan: { planId: Set<'yyyy-MM'> } (solo desde el piso)
    const coveredMonths = new Map<string, Set<string>>();
    for (const t of existingTxs ?? []) {
      if (!t.recurring_plan_id) continue;
      const m = String(t.date).slice(0, 7);
      if (m < floorMonth) continue; // recién borrados
      if (!coveredMonths.has(t.recurring_plan_id)) coveredMonths.set(t.recurring_plan_id, new Set());
      coveredMonths.get(t.recurring_plan_id)!.add(m);
    }

    const rows: TablesInsert<'transactions'>[] = [];

    for (const plan of plans ?? []) {
      const start = new Date(plan.created_at);
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const covered = coveredMonths.get(plan.id) ?? new Set<string>();

      while (dateToLocalString(cursor).slice(0, 7) < currentMonthKey) {
        const monthKey = dateToLocalString(cursor).slice(0, 7);
        if (monthKey >= floorMonth && !covered.has(monthKey)) {
          const isUsdPlan = plan.currency === 'USD';
          rows.push({
            user_id: user.id,
            description: plan.description,
            amount: Math.abs(Number(plan.amount)),
            date: `${monthKey}-01`,
            type: 'expense',
            category_id: plan.category_id,
            payment_method_id: plan.payment_method_id,
            recurring_plan_id: plan.id,
            original_currency: isUsdPlan ? 'USD' : 'ARS',
            original_amount: isUsdPlan ? plan.original_amount : Math.abs(Number(plan.amount)),
            rate_pair: isUsdPlan ? plan.rate_pair : null,
            exchange_rate: isUsdPlan ? plan.exchange_rate : null,
          });
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('transactions').insert(rows);
      if (insertError) {
        console.error('Error regularizando historial de mensualidades:', insertError);
        return { error: `No se pudo regularizar el historial: ${insertError.message}` };
      }
    }

    revalidatePath('/compromisos');
    revalidatePath('/');
    return { success: true, created: rows.length };
  } catch (e) {
    console.error('Error inesperado en backfillRecurringPlansHistory:', e);
    return { error: 'Ocurrió un error inesperado' };
  }
}

/**
 * Postea las mensualidades de crédito que la tarjeta ya facturó y todavía no
 * existen como transacción. Idempotente: se puede llamar en cada carga.
 *
 * La fila creada es idéntica a la de `markRecurringPlanPaid` — misma categoría,
 * mismo medio, mismos campos de moneda heredados del plan — salvo por la fecha,
 * que acá es el vencimiento del resumen en vez del día en que se apretó el botón.
 *
 * Spec: docs/superpowers/specs/2026-08-21-mensualidades-credito-automaticas-design.md
 */
export async function syncAutomaticRecurringCharges(): Promise<ActionResponse & { created?: number }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'No autorizado' };
    }

    const [
      { data: plans, error: plansError },
      { data: methods, error: methodsError },
      { data: existingTxs, error: txError },
      { data: firstIncomeTx, error: incomeError },
    ] = await Promise.all([
      supabase.from('recurring_plans').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('payment_methods').select('*').eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('recurring_plan_id, date')
        .eq('user_id', user.id)
        .not('recurring_plan_id', 'is', null),
      supabase
        .from('transactions')
        .select('date')
        .eq('user_id', user.id)
        .eq('type', 'income')
        .order('date', { ascending: true })
        .limit(1),
    ]);
    if (plansError || methodsError || txError || incomeError) {
      return { error: 'No se pudo leer el estado de las mensualidades' };
    }

    // Sin ingresos registrados no hay piso: mismo criterio que el backfill.
    const floorMonth = firstIncomeTx?.[0]?.date
      ? String(firstIncomeTx[0].date).slice(0, 7)
      : dateToLocalString(new Date()).slice(0, 7);

    // Ciclos de cada tarjeta con planes automáticos, un asegurarCiclos por
    // tarjeta (no por plan): desde el mes del plan más viejo de esa tarjeta
    // hasta hoy + 1 mes de margen.
    // `plans` ya salió de la DB filtrado por is_active = true (query de arriba).
    const methodsById = new Map((methods ?? []).map((m) => [m.id, m]));
    const planesActivos = plans ?? [];
    const cardIdsConAutomatico = new Set<string>();
    for (const plan of planesActivos) {
      const method = plan.payment_method_id ? methodsById.get(plan.payment_method_id) : undefined;
      if (method && isAutomaticPlan(plan, method)) cardIdsConAutomatico.add(method.id);
    }

    let ciclos: CreditCardCycle[] = [];
    for (const cardId of cardIdsConAutomatico) {
      const method = methodsById.get(cardId);
      if (!method) continue;
      const planesDeLaTarjeta = planesActivos.filter(
        (p) => p.payment_method_id === cardId && isAutomaticPlan(p, method),
      );
      const primerMes = planesDeLaTarjeta
        .map((p) => String(p.created_at).slice(0, 7))
        .sort()[0];
      const ciclosDeLaTarjeta = await asegurarCiclos(
        supabase,
        method,
        parseLocalDate(`${primerMes}-01`),
        addMonths(new Date(), 1),
      );
      ciclos = ciclos.concat(ciclosDeLaTarjeta);
    }

    const missing = computeMissingAutomaticCharges(
      plans ?? [],
      methods ?? [],
      existingTxs ?? [],
      floorMonth,
      new Date(),
      ciclos,
    );
    if (missing.length === 0) {
      return { success: true, created: 0 };
    }

    const plansById = new Map((plans ?? []).map((p) => [p.id, p]));
    const rows = missing.flatMap(({ planId, month, date, cycleId }) => {
      const plan = plansById.get(planId);
      if (!plan) return [];
      const isUsd = plan.currency === 'USD';
      const purchaseDay = String(chargeDayOf(plan, month)).padStart(2, '0');
      return [
        {
          user_id: user.id,
          description: plan.description,
          amount: Math.abs(Number(plan.amount)),
          date,
          purchase_date: `${month}-${purchaseDay}`,
          cycle_id: cycleId,
          type: 'expense' as const,
          category_id: plan.category_id,
          payment_method_id: plan.payment_method_id,
          recurring_plan_id: plan.id,
          original_currency: isUsd ? 'USD' : 'ARS',
          original_amount: isUsd ? plan.original_amount : Math.abs(Number(plan.amount)),
          rate_pair: isUsd ? plan.rate_pair : null,
          exchange_rate: isUsd ? plan.exchange_rate : null,
        },
      ];
    });

    const { error: insertError } = await supabase.from('transactions').insert(rows);
    if (insertError) {
      console.error('Error posteando mensualidades automáticas:', insertError);
      return { error: `No se pudieron postear las mensualidades: ${insertError.message}` };
    }

    revalidatePath('/compromisos');
    revalidatePath('/');
    return { success: true, created: rows.length };
  } catch (e) {
    console.error('Error inesperado en syncAutomaticRecurringCharges:', e);
    return { error: 'Ocurrió un error inesperado' };
  }
}
