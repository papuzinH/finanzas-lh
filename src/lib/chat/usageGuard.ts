import type { SupabaseClient } from '@supabase/supabase-js'

export type UsageCheckResult = 'ok' | 'budget_exceeded' | 'user_limit_exceeded'

/**
 * Guard de cuotas del chat.
 *
 * SEGURIDAD: estos RPC son SECURITY DEFINER y están expuestos vía
 * /rest/v1/rpc/ al rol `authenticated`, así que cualquiera con la anon key
 * (que viaja en el bundle del browser) puede invocarlos. Por eso la política
 * —usuario, tier, límite diario, presupuesto y precios— NO se manda por la
 * red: vive en `public.chat_config` y en `users.chat_tier`, y la función la
 * resuelve sola a partir de `auth.uid()`.
 *
 * No agregar parámetros de política a estas llamadas.
 * Ver `supabase/migrations/20260728_harden_chat_usage_rpcs.sql`.
 */
export async function checkAndIncrementUsage(
  supabase: SupabaseClient
): Promise<UsageCheckResult> {
  const { data, error } = await supabase.rpc('check_and_increment_chat_usage')
  if (error) throw error
  return data as UsageCheckResult
}

/**
 * Suma el consumo del loop al presupuesto mensual global.
 * Los precios por 1M de tokens salen de `chat_config`; los tokens que se
 * pasan acá se clampean del lado de la DB (`chat_config.max_tokens_per_call`).
 */
export async function accumulateBudget(
  supabase: SupabaseClient,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const { error } = await supabase.rpc('accumulate_chat_budget', {
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
  })
  if (error) console.error('accumulate_chat_budget failed:', error)
}
