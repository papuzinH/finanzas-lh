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
          telegram_chat_id: string
          first_name: string | null
          created_at: string
        }
        Insert: {
          id?: number
          telegram_chat_id: string
          first_name?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          telegram_chat_id?: string
          first_name?: string | null
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
      market_prices: {
        Row: {
          ticker: string
          last_price: number
          last_update: string | null
        }
        Insert: {
          ticker: string
          last_price: number
          last_update?: string | null
        }
        Update: {
          ticker?: string
          last_price?: number
          last_update?: string | null
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
export type MarketPrice = Tables<'market_prices'>
export type Saving = Tables<'savings'>
