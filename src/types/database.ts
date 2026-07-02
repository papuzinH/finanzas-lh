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
          id: string
          user_id: string
          name: string
          description: string | null
          emoji: string | null
          is_system: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          emoji?: string | null
          is_system?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          emoji?: string | null
          is_system?: boolean | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      users: {
        Row: {
          id: number
          telegram_chat_id: string | null
          first_name: string | null
          onboarding_completed: boolean
          tour_completed: boolean
          created_at: string
        }
        Insert: {
          id?: number
          telegram_chat_id?: string | null
          first_name?: string | null
          onboarding_completed?: boolean
          tour_completed?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          telegram_chat_id?: string | null
          first_name?: string | null
          onboarding_completed?: boolean
          tour_completed?: boolean
          created_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          id: number
          user_id: number
          name: string
          type: 'credit' | 'debit' | 'cash'
          default_closing_day: number | null
          default_payment_day: number | null
          is_personal?: boolean
          is_default?: boolean
          created_at: string
        }
        Insert: {
          id?: number
          user_id: number
          name: string
          type: 'credit' | 'debit' | 'cash'
          default_closing_day?: number | null
          default_payment_day?: number | null
          is_personal?: boolean
          is_default?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: number
          name?: string
          type?: 'credit' | 'debit' | 'cash'
          default_closing_day?: number | null
          default_payment_day?: number | null
          is_personal?: boolean
          is_default?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      installment_plans: {
        Row: {
          id: number
          user_id: number
          description: string
          total_amount: number
          installments_count: number
          purchase_date: string
          category_id: string | null
          created_at: string
          payment_method_id: number | null
        }
        Insert: {
          id?: number
          user_id: number
          description: string
          total_amount: number
          installments_count: number
          purchase_date: string
          category_id?: string | null
          created_at?: string
          payment_method_id?: number | null
        }
        Update: {
          id?: number
          user_id?: number
          description?: string
          total_amount?: number
          installments_count?: number
          purchase_date?: string
          category_id?: string | null
          created_at?: string
          payment_method_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "installment_plans_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_plans_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_plans_payment_method_id_fkey"
            columns: ["payment_method_id"]
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          }
        ]
      }
      recurring_plans: {
        Row: {
          id: number
          user_id: number
          description: string
          amount: number
          currency: string | null
          frequency: string | null
          is_active: boolean | null
          category_id: string | null
          created_at: string
          payment_method_id: number | null
          original_amount: number | null
          rate_pair: string | null
          exchange_rate: number | null
        }
        Insert: {
          id?: number
          user_id: number
          description: string
          amount: number
          currency?: string | null
          frequency?: string | null
          is_active?: boolean | null
          category_id?: string | null
          created_at?: string
          payment_method_id?: number | null
          original_amount?: number | null
          rate_pair?: string | null
          exchange_rate?: number | null
        }
        Update: {
          id?: number
          user_id?: number
          description?: string
          amount?: number
          currency?: string | null
          frequency?: string | null
          is_active?: boolean | null
          category_id?: string | null
          created_at?: string
          payment_method_id?: number | null
          original_amount?: number | null
          rate_pair?: string | null
          exchange_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_plans_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_plans_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_plans_payment_method_id_fkey"
            columns: ["payment_method_id"]
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          }
        ]
      }
      transactions: {
        Row: {
          id: number
          user_id: number
          description: string
          category_id: string | null
          amount: number
          date: string
          type: 'expense' | 'income' | null
          installment_plan_id: number | null
          recurring_plan_id: number | null
          created_at: string
          payment_method_id: number | null
          original_currency: string
          original_amount: number | null
          rate_pair: string | null
          exchange_rate: number | null
          card_payment_for: number | null
        }
        Insert: {
          id?: number
          user_id: number
          description: string
          category_id?: string | null
          amount: number
          date: string
          type?: 'expense' | 'income' | null
          installment_plan_id?: number | null
          recurring_plan_id?: number | null
          created_at?: string
          payment_method_id?: number | null
          original_currency?: string
          original_amount?: number | null
          rate_pair?: string | null
          exchange_rate?: number | null
          card_payment_for?: number | null
        }
        Update: {
          id?: number
          user_id?: number
          description?: string
          category_id?: string | null
          amount?: number
          date?: string
          type?: 'expense' | 'income' | null
          installment_plan_id?: number | null
          recurring_plan_id?: number | null
          created_at?: string
          payment_method_id?: number | null
          original_currency?: string
          original_amount?: number | null
          rate_pair?: string | null
          exchange_rate?: number | null
          card_payment_for?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_installment_plan_id_fkey"
            columns: ["installment_plan_id"]
            referencedRelation: "installment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_plan_id_fkey"
            columns: ["recurring_plan_id"]
            referencedRelation: "recurring_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_payment_method_id_fkey"
            columns: ["payment_method_id"]
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          }
        ]
      }
      investments: {
        Row: {
          id: string
          user_id: string
          ticker: string
          name: string
          type: string
          quantity: number
          avg_buy_price: number | null
          currency: string | null
          created_at: string
          data_source_url: string | null
        }
        Insert: {
          id?: string
          user_id: string
          ticker: string
          name: string
          type: string
          quantity: number
          avg_buy_price?: number | null
          currency?: string | null
          created_at?: string
          data_source_url?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          ticker?: string
          name?: string
          type?: string
          quantity?: number
          avg_buy_price?: number | null
          currency?: string | null
          created_at?: string
          data_source_url?: string | null
        }
        Relationships: []
      }
      investment_assets: {
        Row: {
          id: string
          user_id: string
          ticker: string
          name: string
          asset_type: 'stock' | 'cedear' | 'bond' | 'on' | 'bopreal' | 'lecap' | 'boncap' | 'plazo_fijo' | 'money_market' | 'crypto' | 'stablecoin' | 'fci' | 'etf'
          currency: string | null
          data_source_url: string | null
          metadata: Record<string, unknown>
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ticker: string
          name: string
          asset_type: 'stock' | 'cedear' | 'bond' | 'on' | 'bopreal' | 'lecap' | 'boncap' | 'plazo_fijo' | 'money_market' | 'crypto' | 'stablecoin' | 'fci' | 'etf'
          currency?: string | null
          data_source_url?: string | null
          metadata?: Record<string, unknown>
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ticker?: string
          name?: string
          asset_type?: 'stock' | 'cedear' | 'bond' | 'on' | 'bopreal' | 'lecap' | 'boncap' | 'plazo_fijo' | 'money_market' | 'crypto' | 'stablecoin' | 'fci' | 'etf'
          currency?: string | null
          data_source_url?: string | null
          metadata?: Record<string, unknown>
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_assets_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      investment_transactions: {
        Row: {
          id: string
          asset_id: string
          user_id: string
          type: 'buy' | 'sell' | 'dividend' | 'coupon' | 'interest'
          quantity: number
          price_per_unit: number
          total_amount: number
          fees: number
          currency: string
          date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          user_id: string
          type: 'buy' | 'sell' | 'dividend' | 'coupon' | 'interest'
          quantity: number
          price_per_unit: number
          total_amount: number
          fees?: number
          currency: string
          date: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          asset_id?: string
          user_id?: string
          type?: 'buy' | 'sell' | 'dividend' | 'coupon' | 'interest'
          quantity?: number
          price_per_unit?: number
          total_amount?: number
          fees?: number
          currency?: string
          date?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_transactions_asset_id_fkey"
            columns: ["asset_id"]
            referencedRelation: "investment_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_transactions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      exchange_rates: {
        Row: {
          id: string
          pair: string
          rate: number
          source: string | null
          last_update: string
        }
        Insert: {
          id?: string
          pair: string
          rate: number
          source?: string | null
          last_update?: string
        }
        Update: {
          id?: string
          pair?: string
          rate?: number
          source?: string | null
          last_update?: string
        }
        Relationships: []
      }
      market_prices: {
        Row: {
          ticker: string
          last_price: number
          last_update: string | null
          currency: string | null
          price_usd: number | null
          ccl_implicit: number | null
          tir: number | null
          next_coupon_date: string | null
          next_coupon_amount: number | null
          tna: number | null
          source: string | null
        }
        Insert: {
          ticker: string
          last_price: number
          last_update?: string | null
          currency?: string | null
          price_usd?: number | null
          ccl_implicit?: number | null
          tir?: number | null
          next_coupon_date?: string | null
          next_coupon_amount?: number | null
          tna?: number | null
          source?: string | null
        }
        Update: {
          ticker?: string
          last_price?: number
          last_update?: string | null
          currency?: string | null
          price_usd?: number | null
          ccl_implicit?: number | null
          tir?: number | null
          next_coupon_date?: string | null
          next_coupon_amount?: number | null
          tna?: number | null
          source?: string | null
        }
        Relationships: []
      }
      savings: {
        Row: {
          id: string
          user_id: string
          amount: number
          currency: 'ARS' | 'USD'
          date: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          currency?: 'ARS' | 'USD'
          date?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          currency?: 'ARS' | 'USD'
          date?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      internal_transfers: {
        Row: {
          id: string
          user_id: string
          amount: number
          currency: 'ARS' | 'USD'
          period_date: string
          real_transfer_date: string
          transfer_type: 'end_of_month_surplus' | 'manual'
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          currency?: 'ARS' | 'USD'
          period_date: string
          real_transfer_date?: string
          transfer_type?: 'end_of_month_surplus' | 'manual'
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          currency?: 'ARS' | 'USD'
          period_date?: string
          real_transfer_date?: string
          transfer_type?: 'end_of_month_surplus' | 'manual'
          description?: string | null
          created_at?: string
        }
        Relationships: []
      }
      savings_goals: {
        Row: {
          id: string
          user_id: string
          name: string
          type: 'one_time' | 'monthly'
          target_amount: number
          currency: 'ARS' | 'USD'
          target_date: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: 'one_time' | 'monthly'
          target_amount: number
          currency?: 'ARS' | 'USD'
          target_date?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: 'one_time' | 'monthly'
          target_amount?: number
          currency?: 'ARS' | 'USD'
          target_date?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      savings_goal_contributions: {
        Row: {
          id: string
          goal_id: string
          user_id: string
          amount: number
          currency: 'ARS' | 'USD'
          note: string | null
          date: string
          created_at: string
        }
        Insert: {
          id?: string
          goal_id: string
          user_id: string
          amount: number
          currency?: 'ARS' | 'USD'
          note?: string | null
          date?: string
          created_at?: string
        }
        Update: {
          id?: string
          goal_id?: string
          user_id?: string
          amount?: number
          currency?: 'ARS' | 'USD'
          note?: string | null
          date?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goal_contributions_goal_id_fkey"
            columns: ["goal_id"]
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          }
        ]
      }
      category_budgets: {
        Row: {
          id: string
          user_id: string
          category_id: string
          amount: number
          currency: 'ARS' | 'USD'
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          category_id: string
          amount: number
          currency?: 'ARS' | 'USD'
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          category_id?: string
          amount?: number
          currency?: 'ARS' | 'USD'
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_budgets_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]

// Helper interfaces for easier usage in components
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
