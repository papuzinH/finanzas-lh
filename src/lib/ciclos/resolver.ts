import { addMonths, subMonths } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PaymentMethod } from '@/types/database';
import { calculateCreditPaymentDate, parseLocalDate } from '@/lib/utils/dates';
import { cicloDeCompra, type CreditCardCycle } from '@/lib/finance/cycles';
import { asegurarCiclos } from './asegurar';

export type ResolucionDeCiclo = {
  /** Los resumenes de la tarjeta, ya asegurados y ordenados por closing_date. */
  ciclos: CreditCardCycle[];
  /** El resumen que contiene la compra. undefined = no hay ninguno que la contenga. */
  ciclo: CreditCardCycle | undefined;
  /** Cuando se cobra: el vencimiento del resumen, o el calculo por defaults si no hay resumen. */
  dueDate: string;
};

/**
 * La orquestacion "a que resumen entra esta compra y cuando se cobra", en un solo lugar.
 *
 * Estaba copiada en seis sitios (dos altas de transaccion, dos de cuotas, dos del chat) y ya
 * divergio una vez: el fix de zona horaria entro en unos y no en otros. Cualquier alta nueva
 * pasa por aca.
 *
 * `purchaseDate` es un string `yyyy-MM-dd` y se usa tal cual: nunca `new Date(string)`, que
 * corre un dia atras en runtimes con zona horaria negativa.
 *
 * Lanza si Supabase falla (lo hereda de asegurarCiclos): el llamador ya tiene su try/catch.
 */
export async function resolverCicloDeCompra(
  supabase: SupabaseClient<Database>,
  method: PaymentMethod,
  purchaseDate: string,
  mesesAdelante: number,
): Promise<ResolucionDeCiclo> {
  const sinCicloConfigurado =
    method.type !== 'credit' || !method.default_closing_day || !method.default_payment_day;

  if (sinCicloConfigurado) {
    return { ciclos: [], ciclo: undefined, dueDate: purchaseDate };
  }

  const compra = parseLocalDate(purchaseDate);
  const ciclos = await asegurarCiclos(
    supabase,
    method,
    subMonths(compra, 1),
    addMonths(compra, mesesAdelante),
  );
  const ciclo = cicloDeCompra(purchaseDate, ciclos);

  return {
    ciclos,
    ciclo,
    dueDate: ciclo
      ? ciclo.due_date
      : calculateCreditPaymentDate(purchaseDate, method.default_closing_day!, method.default_payment_day!),
  };
}
