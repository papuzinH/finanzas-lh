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
      installment_plans: {
        Row: {
          id: number
          user_id: number
          description: string
          total_amount: number
          installments_count: number
          purchase_date: string
          category: string | null
          created_at: string
        }
        Insert: {
          id?: number
          user_id: number
          description: string
          total_amount: number
          installments_count: number
          purchase_date: string
          category?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: number
          description?: string
          total_amount?: number
          installments_count?: number
          purchase_date?: string
          category?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installment_plans_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
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
          category: string | null
          created_at: string
        }
        Insert: {
          id?: number
          user_id: number
          description: string
          amount: number
          currency?: string | null
          frequency?: string | null
          is_active?: boolean | null
          category?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: number
          description?: string
          amount?: number
          currency?: string | null
          frequency?: string | null
          is_active?: boolean | null
          category?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_plans_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      transactions: {
        Row: {
          id: number
          user_id: number
          description: string
          category: string | null
          amount: number
          date: string
          payment_method: string | null
          type: 'expense' | 'income' | null
          installment_plan_id: number | null
          recurring_plan_id: number | null
          created_at: string
        }
        Insert: {
          id?: number
          user_id: number
          description: string
          category?: string | null
          amount: number
          date: string
          payment_method?: string | null
          type?: 'expense' | 'income' | null
          installment_plan_id?: number | null
          recurring_plan_id?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: number
          description?: string
          category?: string | null
          amount?: number
          date?: string
          payment_method?: string | null
          type?: 'expense' | 'income' | null
          installment_plan_id?: number | null
          recurring_plan_id?: number | null
          created_at?: string
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
export type InstallmentPlan = Tables<'installment_plans'>
export type RecurringPlan = Tables<'recurring_plans'>
export type Transaction = Tables<'transactions'>
