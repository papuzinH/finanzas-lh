//
// Escritura del resumen declarado por el usuario. La DECISION (que resumen se
// corrige, cuales futuros hay que re-fechar) es pura y vive en lib/finance/cycles.ts;
// aca solo esta la escritura. Mismo reparto que lib/ciclos/asegurar.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PaymentMethod } from '@/types/database';
import {
  ciclosDeMetodo,
  cicloDelMesDe,
  recalcularFuturosGenerated,
  type CreditCardCycle,
} from '@/lib/finance/cycles';

async function leerCiclos(
  supabase: SupabaseClient<Database>,
  methodId: string,
): Promise<CreditCardCycle[]> {
  const { data, error } = await supabase
    .from('credit_card_cycles')
    .select('*')
    .eq('payment_method_id', methodId)
    .order('closing_date', { ascending: true });
  if (error) throw new Error('No pude leer los resumenes de la tarjeta: ' + error.message);
  return ciclosDeMetodo(methodId, (data ?? []) as CreditCardCycle[]);
}

/** Re-fecha los resumenes futuros estimados. Devuelve cuantos cambio. */
async function aplicarRealineado(
  supabase: SupabaseClient<Database>,
  method: PaymentMethod,
  ciclos: CreditCardCycle[],
  hoy: string,
): Promise<number> {
  const cambios = recalcularFuturosGenerated(method, ciclos, hoy);
  for (const c of cambios) {
    const { error } = await supabase
      .from('credit_card_cycles')
      .update({ closing_date: c.closing_date, due_date: c.due_date })
      .eq('id', c.id);
    if (error) throw new Error('No pude actualizar un resumen futuro: ' + error.message);
  }
  return cambios.length;
}

/**
 * Escribe lo que el usuario leyo del resumen.
 *
 * Corrige el resumen del MISMO MES si ya existe (declarar es corregir una estimacion, no crear
 * un resumen paralelo) y lo marca `declared`, para que ninguna regeneracion posterior lo pise.
 *
 * NO toca ninguna transaccion: el invariante central del spec. Lo que estaba imputado a ese
 * resumen sigue imputado, con la fecha nueva.
 */
export async function guardarDeclaracion(
  supabase: SupabaseClient<Database>,
  method: PaymentMethod,
  closingDate: string,
  dueDate: string,
  hoy: string,
): Promise<CreditCardCycle> {
  const ciclos = await leerCiclos(supabase, method.id);
  const delMes = cicloDelMesDe(ciclos, closingDate);

  let guardado: CreditCardCycle;
  if (delMes) {
    const { data, error } = await supabase
      .from('credit_card_cycles')
      .update({ closing_date: closingDate, due_date: dueDate, source: 'declared' })
      .eq('id', delMes.id)
      .select('*')
      .single();
    if (error) throw new Error('No pude guardar el resumen: ' + error.message);
    guardado = data as CreditCardCycle;
  } else {
    const { data, error } = await supabase
      .from('credit_card_cycles')
      .insert({
        user_id: method.user_id,
        payment_method_id: method.id,
        closing_date: closingDate,
        due_date: dueDate,
        source: 'declared',
      })
      .select('*')
      .single();
    if (error) throw new Error('No pude guardar el resumen: ' + error.message);
    guardado = data as CreditCardCycle;
  }

  // Los futuros estimados se re-fechan con los defaults vigentes. El recien declarado ya es
  // `declared`, asi que queda fuera por definicion.
  const actualizados = ciclos.map((c) => (c.id === guardado.id ? guardado : c));
  await aplicarRealineado(supabase, method, actualizados, hoy);

  return guardado;
}

/**
 * Re-fecha los resumenes futuros estimados de una tarjeta contra sus defaults actuales.
 * Se llama cuando el usuario cambia el dia de cierre o de vencimiento en la ficha.
 */
export async function realinearFuturos(
  supabase: SupabaseClient<Database>,
  method: PaymentMethod,
  hoy: string,
): Promise<number> {
  const ciclos = await leerCiclos(supabase, method.id);
  return aplicarRealineado(supabase, method, ciclos, hoy);
}
