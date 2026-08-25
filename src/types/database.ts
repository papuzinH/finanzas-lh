// ============================================================
// Tipos de la base de datos — regenerados desde el schema REAL
// (MCP Supabase generate_typescript_types, 2026-07-08), con las
// uniones literales de dominio preservadas a mano ('income' |
// 'expense', 'credit' | 'debit' | 'cash', etc.).
//
// IMPORTANTE: en la DB real TODOS los ids de las tablas de la app
// son UUID (string): users.id ES el auth.uid(); transactions,
// payment_methods, recurring_plans, installment_plans, etc. usan
// uuid. Los ids numéricos existen solo en las tablas legacy_* de
// la era del bot de Telegram (omitidas acá: sin uso en la app y
// sin acceso de cliente). La versión anterior de este archivo
// tipaba los ids como number y estaba desactualizada.
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string | null
          description: string | null
          emoji: string | null
          id: string
          is_system: boolean | null
          name: string
          type: 'income' | 'expense'
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          type?: 'income' | 'expense'
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          type?: 'income' | 'expense'
          user_id?: string
        }
      }
      category_budgets: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          currency: 'ARS' | 'USD'
          id: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          currency?: 'ARS' | 'USD'
          id?: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          currency?: 'ARS' | 'USD'
          id?: string
          is_active?: boolean
          user_id?: string
        }
      }
      chat_budget: {
        Row: {
          estimated_cost_usd: number
          input_tokens: number
          is_killed: boolean
          output_tokens: number
          period: string
          request_count: number
          updated_at: string
        }
        Insert: {
          estimated_cost_usd?: number
          input_tokens?: number
          is_killed?: boolean
          output_tokens?: number
          period: string
          request_count?: number
          updated_at?: string
        }
        Update: {
          estimated_cost_usd?: number
          input_tokens?: number
          is_killed?: boolean
          output_tokens?: number
          period?: string
          request_count?: number
          updated_at?: string
        }
      }
      chat_usage: {
        Row: {
          request_count: number
          usage_date: string
          user_id: string
        }
        Insert: {
          request_count?: number
          usage_date?: string
          user_id: string
        }
        Update: {
          request_count?: number
          usage_date?: string
          user_id?: string
        }
      }
      exchange_rates: {
        Row: {
          id: string
          last_update: string | null
          pair: string
          rate: number
          source: string | null
        }
        Insert: {
          id?: string
          last_update?: string | null
          pair: string
          rate: number
          source?: string | null
        }
        Update: {
          id?: string
          last_update?: string | null
          pair?: string
          rate?: number
          source?: string | null
        }
      }
      installment_plans: {
        Row: {
          category_id: string
          created_at: string
          description: string
          id: string
          installments_count: number
          payment_method_id: string | null
          purchase_date: string
          total_amount: number
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description: string
          id?: string
          installments_count: number
          payment_method_id?: string | null
          purchase_date: string
          total_amount: number
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string
          id?: string
          installments_count?: number
          payment_method_id?: string | null
          purchase_date?: string
          total_amount?: number
          user_id?: string
        }
      }
      internal_transfers: {
        Row: {
          amount: number
          created_at: string
          currency: 'ARS' | 'USD'
          description: string | null
          from_payment_method_id: string | null
          id: string
          period_date: string
          real_transfer_date: string
          to_payment_method_id: string | null
          transfer_type: 'end_of_month_surplus' | 'manual'
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: 'ARS' | 'USD'
          description?: string | null
          from_payment_method_id?: string | null
          id?: string
          period_date: string
          real_transfer_date?: string
          to_payment_method_id?: string | null
          transfer_type?: 'end_of_month_surplus' | 'manual'
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: 'ARS' | 'USD'
          description?: string | null
          from_payment_method_id?: string | null
          id?: string
          period_date?: string
          real_transfer_date?: string
          to_payment_method_id?: string | null
          transfer_type?: 'end_of_month_surplus' | 'manual'
          user_id?: string
        }
      }
      investment_assets: {
        Row: {
          asset_type: 'stock' | 'cedear' | 'bond' | 'on' | 'bopreal' | 'lecap' | 'boncap' | 'plazo_fijo' | 'money_market' | 'crypto' | 'stablecoin' | 'fci' | 'etf'
          created_at: string | null
          currency: string | null
          data_source_url: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          ticker: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          asset_type: 'stock' | 'cedear' | 'bond' | 'on' | 'bopreal' | 'lecap' | 'boncap' | 'plazo_fijo' | 'money_market' | 'crypto' | 'stablecoin' | 'fci' | 'etf'
          created_at?: string | null
          currency?: string | null
          data_source_url?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          ticker: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          asset_type?: 'stock' | 'cedear' | 'bond' | 'on' | 'bopreal' | 'lecap' | 'boncap' | 'plazo_fijo' | 'money_market' | 'crypto' | 'stablecoin' | 'fci' | 'etf'
          created_at?: string | null
          currency?: string | null
          data_source_url?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          ticker?: string
          updated_at?: string | null
          user_id?: string
        }
      }
      investment_transactions: {
        Row: {
          asset_id: string
          created_at: string | null
          currency: string
          date: string
          fees: number | null
          id: string
          notes: string | null
          price_per_unit: number
          quantity: number
          total_amount: number
          type: 'buy' | 'sell' | 'dividend' | 'coupon' | 'interest'
          user_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string | null
          currency: string
          date: string
          fees?: number | null
          id?: string
          notes?: string | null
          price_per_unit: number
          quantity: number
          total_amount: number
          type: 'buy' | 'sell' | 'dividend' | 'coupon' | 'interest'
          user_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string | null
          currency?: string
          date?: string
          fees?: number | null
          id?: string
          notes?: string | null
          price_per_unit?: number
          quantity?: number
          total_amount?: number
          type?: 'buy' | 'sell' | 'dividend' | 'coupon' | 'interest'
          user_id?: string
        }
      }
      investments: {
        Row: {
          avg_buy_price: number | null
          created_at: string
          currency: string | null
          data_source_url: string | null
          id: string
          name: string
          quantity: number
          ticker: string
          type: string
          user_id: string
        }
        Insert: {
          avg_buy_price?: number | null
          created_at?: string
          currency?: string | null
          data_source_url?: string | null
          id?: string
          name: string
          quantity: number
          ticker: string
          type: string
          user_id: string
        }
        Update: {
          avg_buy_price?: number | null
          created_at?: string
          currency?: string | null
          data_source_url?: string | null
          id?: string
          name?: string
          quantity?: number
          ticker?: string
          type?: string
          user_id?: string
        }
      }
      market_prices: {
        Row: {
          ccl_implicit: number | null
          currency: string | null
          last_price: number
          last_update: string
          next_coupon_amount: number | null
          next_coupon_date: string | null
          price_usd: number | null
          source: string | null
          ticker: string
          tir: number | null
          tna: number | null
        }
        Insert: {
          ccl_implicit?: number | null
          currency?: string | null
          last_price: number
          last_update?: string
          next_coupon_amount?: number | null
          next_coupon_date?: string | null
          price_usd?: number | null
          source?: string | null
          ticker: string
          tir?: number | null
          tna?: number | null
        }
        Update: {
          ccl_implicit?: number | null
          currency?: string | null
          last_price?: number
          last_update?: string
          next_coupon_amount?: number | null
          next_coupon_date?: string | null
          price_usd?: number | null
          source?: string | null
          ticker?: string
          tir?: number | null
          tna?: number | null
        }
      }
      payment_methods: {
        Row: {
          bucket: 'pocket' | 'reserve'
          created_at: string
          default_closing_day: number | null
          default_payment_day: number | null
          id: string
          initial_balance: number
          initial_balance_at: string | null
          is_default: boolean | null
          is_personal: boolean | null
          name: string
          type: 'credit' | 'debit' | 'cash'
          user_id: string
        }
        Insert: {
          bucket?: 'pocket' | 'reserve'
          created_at?: string
          default_closing_day?: number | null
          default_payment_day?: number | null
          id?: string
          initial_balance?: number
          initial_balance_at?: string | null
          is_default?: boolean | null
          is_personal?: boolean | null
          name: string
          type: 'credit' | 'debit' | 'cash'
          user_id: string
        }
        Update: {
          bucket?: 'pocket' | 'reserve'
          created_at?: string
          default_closing_day?: number | null
          default_payment_day?: number | null
          id?: string
          initial_balance?: number
          initial_balance_at?: string | null
          is_default?: boolean | null
          is_personal?: boolean | null
          name?: string
          type?: 'credit' | 'debit' | 'cash'
          user_id?: string
        }
      }
      recurring_plans: {
        Row: {
          amount: number
          billing_day: number | null
          category_id: string
          created_at: string
          currency: string | null
          description: string
          exchange_rate: number | null
          frequency: string | null
          id: string
          is_active: boolean | null
          original_amount: number | null
          payment_method_id: string | null
          rate_pair: string | null
          user_id: string
        }
        Insert: {
          amount: number
          billing_day?: number | null
          category_id: string
          created_at?: string
          currency?: string | null
          description: string
          exchange_rate?: number | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          original_amount?: number | null
          payment_method_id?: string | null
          rate_pair?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          billing_day?: number | null
          category_id?: string
          created_at?: string
          currency?: string | null
          description?: string
          exchange_rate?: number | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          original_amount?: number | null
          payment_method_id?: string | null
          rate_pair?: string | null
          user_id?: string
        }
      }
      savings: {
        Row: {
          amount: number
          created_at: string
          currency: 'ARS' | 'USD'
          date: string
          id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: 'ARS' | 'USD'
          date?: string
          id?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: 'ARS' | 'USD'
          date?: string
          id?: string
          user_id?: string
        }
      }
      savings_goal_contributions: {
        Row: {
          amount: number
          created_at: string
          currency: 'ARS' | 'USD'
          date: string
          goal_id: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: 'ARS' | 'USD'
          date?: string
          goal_id: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: 'ARS' | 'USD'
          date?: string
          goal_id?: string
          id?: string
          note?: string | null
          user_id?: string
        }
      }
      savings_goals: {
        Row: {
          created_at: string
          currency: 'ARS' | 'USD'
          id: string
          is_active: boolean
          name: string
          target_amount: number
          target_date: string | null
          type: 'one_time' | 'monthly'
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: 'ARS' | 'USD'
          id?: string
          is_active?: boolean
          name: string
          target_amount: number
          target_date?: string | null
          type: 'one_time' | 'monthly'
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: 'ARS' | 'USD'
          id?: string
          is_active?: boolean
          name?: string
          target_amount?: number
          target_date?: string | null
          type?: 'one_time' | 'monthly'
          user_id?: string
        }
      }
      transactions: {
        Row: {
          amount: number
          card_payment_for: string | null
          category_id: string
          confirmation_status: string
          created_at: string
          date: string
          description: string
          exchange_rate: number | null
          id: string
          installment_plan_id: string | null
          is_balance_adjustment: boolean
          original_amount: number | null
          original_currency: string
          payment_method_id: string | null
          rate_pair: string | null
          recurring_plan_id: string | null
          source: string
          type: 'expense' | 'income' | null
          user_id: string
        }
        Insert: {
          amount: number
          card_payment_for?: string | null
          category_id: string
          confirmation_status?: string
          created_at?: string
          date: string
          description: string
          exchange_rate?: number | null
          id?: string
          installment_plan_id?: string | null
          is_balance_adjustment?: boolean
          original_amount?: number | null
          original_currency?: string
          payment_method_id?: string | null
          rate_pair?: string | null
          recurring_plan_id?: string | null
          source?: string
          type?: 'expense' | 'income' | null
          user_id: string
        }
        Update: {
          amount?: number
          card_payment_for?: string | null
          category_id?: string
          confirmation_status?: string
          created_at?: string
          date?: string
          description?: string
          exchange_rate?: number | null
          id?: string
          installment_plan_id?: string | null
          is_balance_adjustment?: boolean
          original_amount?: number | null
          original_currency?: string
          payment_method_id?: string | null
          rate_pair?: string | null
          recurring_plan_id?: string | null
          source?: string
          type?: 'expense' | 'income' | null
          user_id?: string
        }
      }
      users: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          chat_tier: string
          created_at: string | null
          custom_categories_prompt: string | null
          email: string | null
          first_name: string | null
          id: string
          income_rhythm: 'monthly' | 'biweekly' | 'weekly' | 'irregular'
          interaction_mode: string | null
          onboarding_completed: boolean | null
          pocket_setup_completed: boolean
          telegram_chat_id: number | null
          tour_completed: boolean
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          chat_tier?: string
          created_at?: string | null
          custom_categories_prompt?: string | null
          email?: string | null
          first_name?: string | null
          id: string
          income_rhythm?: 'monthly' | 'biweekly' | 'weekly' | 'irregular'
          interaction_mode?: string | null
          onboarding_completed?: boolean | null
          pocket_setup_completed?: boolean
          telegram_chat_id?: number | null
          tour_completed?: boolean
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          chat_tier?: string
          created_at?: string | null
          custom_categories_prompt?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          income_rhythm?: 'monthly' | 'biweekly' | 'weekly' | 'irregular'
          interaction_mode?: string | null
          onboarding_completed?: boolean | null
          pocket_setup_completed?: boolean
          telegram_chat_id?: number | null
          tour_completed?: boolean
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      // La política de cuotas NO viaja por la red: el usuario sale de
      // auth.uid() y los límites/precios de chat_config. Las firmas viejas
      // (con p_user_id, p_daily_limit, p_monthly_budget_usd y los precios)
      // se dropearon el 2026-07-28 — ver
      // supabase/migrations/20260728b_drop_chat_usage_rpc_wrappers.sql
      accumulate_chat_budget: {
        Args: {
          p_input_tokens: number
          p_output_tokens: number
        }
        Returns: undefined
      }
      check_and_increment_chat_usage: { Args: never; Returns: string }
      delete_my_account: { Args: never; Returns: undefined }
      get_current_user_int_id: { Args: never; Returns: string }
    }
    Enums: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']

// Tipos específicos para facilitar el uso
export type User = Tables<'users'>
export type Category = Tables<'categories'>
export type InstallmentPlan = Tables<'installment_plans'>
export type RecurringPlan = Tables<'recurring_plans'>
export type Transaction = Tables<'transactions'>
export type PaymentMethod = Tables<'payment_methods'>
export type Investment = Tables<'investments'>
export type InvestmentAsset = Tables<'investment_assets'>
export type InvestmentTransaction = Tables<'investment_transactions'>
export type ExchangeRate = Tables<'exchange_rates'>
export type MarketPrice = Tables<'market_prices'>
export type Saving = Tables<'savings'>
export type InternalTransfer = Tables<'internal_transfers'>
export type SavingsGoal = Tables<'savings_goals'>
export type SavingsGoalContribution = Tables<'savings_goal_contributions'>
export type CategoryBudget = Tables<'category_budgets'>
