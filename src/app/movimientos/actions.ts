'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { fetchAllRates } from '@/lib/investments/prices/exchange-rates';
import { revalidatePath } from 'next/cache';

type ActionResponse = {
  error?: string;
  success?: boolean;
  updated?: number;
};

/** Refresca exchange_rates (Blue/MEP/CCL/USDT) desde las fuentes de /inversiones. */
export async function updateExchangeRates(): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'No autorizado' };

    const rates = await fetchAllRates();
    const now = new Date().toISOString();

    const rateEntries = [
      rates.USD_ARS_BLUE && { pair: 'USD_ARS_BLUE', rate: rates.USD_ARS_BLUE.sell, source: 'dolarapi' },
      rates.USD_ARS_MEP && { pair: 'USD_ARS_MEP', rate: rates.USD_ARS_MEP.sell, source: 'dolarapi' },
      rates.USD_ARS_CCL && { pair: 'USD_ARS_CCL', rate: rates.USD_ARS_CCL.sell, source: 'dolarapi' },
      rates.USDT_ARS !== null && { pair: 'USDT_ARS', rate: rates.USDT_ARS, source: 'coingecko' },
    ].filter(Boolean) as { pair: string; rate: number; source: string }[];

    if (rateEntries.length === 0) {
      return { error: 'No se pudieron obtener cotizaciones' };
    }

    // `exchange_rates` es global (sin user_id): la escritura va con service_role.
    const { error } = await createAdminClient()
      .from('exchange_rates')
      .upsert(rateEntries.map((e) => ({ ...e, last_update: now })), { onConflict: 'pair' });

    if (error) {
      console.error('Error updating exchange rates:', error);
      return { error: 'Error al actualizar cotizaciones' };
    }

    revalidatePath('/movimientos');
    return { success: true, updated: rateEntries.length };
  } catch (error) {
    console.error('Unexpected error updating rates:', error);
    return { error: 'Ocurrió un error inesperado' };
  }
}
