//
// Escritura del resumen declarado por el usuario. La DECISION (que resumen se
// corrige, cuales futuros hay que re-fechar) es pura y vive en lib/finance/cycles.ts;
// aca solo esta la escritura. Mismo reparto que lib/ciclos/asegurar.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Database, PaymentMethod } from '@/types/database';
import { parseLocalDate } from '@/lib/utils/dates';
import {
  ciclosDeMetodo,
  cicloDelMesDe,
  recalcularFuturosGenerated,
  type CreditCardCycle,
} from '@/lib/finance/cycles';

/** Mismo formato con el que la app nombra un resumen ("cerró el 23 jul · vence 3 ago"). */
const corto = (d: string) => format(parseLocalDate(d), 'd MMM', { locale: es });

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
 * Corrige un resumen que ya existe (declarar es corregir una estimacion, no crear un resumen
 * paralelo) y lo marca `declared`, para que ninguna regeneracion posterior lo pise.
 *
 * Cual resumen se corrige: el de `cycleId` si viene, y solo si no viene se resuelve por MES
 * CALENDARIO del cierre. Los puntos de entrada conocen el resumen exacto que el usuario esta
 * declarando, asi que lo mandan y no hace falta adivinarlo -- con cierres cerca del borde de
 * mes (dia 1, 2, 30, 31) adivinar erraba: un estimado que cierra el 1-oct cuyo cierre real fue
 * el 29-sep se resolvia al resumen de SEPTIEMBRE, que es otro y ademas ya cerro, y el de
 * octubre quedaba intacto con su recordatorio todavia en pantalla despues de un guardado que
 * dijo que salio bien. La resolucion por mes queda para quien no tenga el id a mano.
 *
 * El id llega del cliente pero no necesita validacion aparte: `leerCiclos` ya filtra por
 * `payment_method_id` y la action ya verifico que ese medio es del usuario, asi que un id ajeno
 * simplemente no aparece en la lista y se cae al camino por mes.
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
  cycleId?: string | null,
): Promise<CreditCardCycle> {
  const ciclos = await leerCiclos(supabase, method.id);
  const objetivo =
    (cycleId ? ciclos.find((c) => c.id === cycleId) : undefined) ?? cicloDelMesDe(ciclos, closingDate);

  // La tabla tiene una unique (payment_method_id, closing_date): dos resumenes de la misma
  // tarjeta no pueden cerrar el mismo dia. Si la fecha nueva ya es de OTRO resumen, lo mas
  // probable es que el usuario este declarando el resumen equivocado -- el caso medido es la
  // card de Compromisos, que pide las fechas del resumen que ya cerro y se lee como si pidiera
  // las del vigente. Se corta ANTES de escribir: dejarlo llegar a Postgres le pone en pantalla
  // el nombre de una constraint, que no le dice nada a nadie.
  const chocaCon = ciclos.find((c) => c.closing_date === closingDate && c.id !== objetivo?.id);
  if (chocaCon) {
    throw new Error(
      `Esas fechas ya son las del resumen que cierra el ${corto(chocaCon.closing_date)} y vence el ${corto(chocaCon.due_date)}. Si es ese el que querés corregir, abrilo desde el detalle de la tarjeta.`,
    );
  }

  let guardado: CreditCardCycle;
  if (objetivo) {
    const { data, error } = await supabase
      .from('credit_card_cycles')
      .update({ closing_date: closingDate, due_date: dueDate, source: 'declared' })
      .eq('id', objetivo.id)
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
