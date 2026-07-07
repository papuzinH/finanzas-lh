import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'

/** Contexto pasado a las tools para acceder al usuario autenticado y otras dependencias. */
export interface AgentContext {
  supabase: SupabaseClient   // cliente del usuario autenticado (RLS)
  userId: number             // public.users.id (transactions, payment_methods, …)
  authUserId: string         // UUID de auth (savings_goals, category_budgets, …)
  today: string              // YYYY-MM-DD local
}

/** Resultado estandarizado de ejecución de una tool. */
export interface ToolResult {
  ok: boolean
  data?: unknown
  error?: string
  mutated?: boolean
}

/** Definición de una tool con schema Zod tipado. */
export interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string
  description: string        // en español, orientada al modelo: cuándo usarla y qué devuelve
  kind: 'read' | 'write'
  schema: S
  execute: (args: z.infer<S>, ctx: AgentContext) => Promise<ToolResult>
}
