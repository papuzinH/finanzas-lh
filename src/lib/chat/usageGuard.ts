import type { SupabaseClient } from '@supabase/supabase-js'

export type UsageCheckResult = 'ok' | 'budget_exceeded' | 'user_limit_exceeded'

export function getDailyLimit(tier: 'free' | 'pro'): number {
  if (tier === 'pro') return Number(process.env.CHAT_DAILY_LIMIT_PRO) || 300
  return Number(process.env.CHAT_DAILY_LIMIT_FREE) || 30
}

export async function checkAndIncrementUsage(
  supabase: SupabaseClient,
  userId: string,
  tier: 'free' | 'pro'
): Promise<UsageCheckResult> {
  const { data, error } = await supabase.rpc('check_and_increment_chat_usage', {
    p_user_id: userId,
    p_daily_limit: getDailyLimit(tier),
    p_monthly_budget_usd: Number(process.env.CHAT_MONTHLY_BUDGET_USD) || 50,
  })
  if (error) throw error
  return data as UsageCheckResult
}

export async function accumulateBudget(
  supabase: SupabaseClient,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const { error } = await supabase.rpc('accumulate_chat_budget', {
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_input_price_per_1m: Number(process.env.GEMINI_INPUT_PRICE_PER_1M) || 0.30,
    p_output_price_per_1m: Number(process.env.GEMINI_OUTPUT_PRICE_PER_1M) || 2.50,
  })
  if (error) console.error('accumulate_chat_budget failed:', error)
}
