import { z } from 'zod'

export const categoryBudgetSchema = z.object({
  category_id: z.string().min(1, 'La categoría es requerida'),
  amount: z.number().positive('El límite de presupuesto debe ser positivo'),
  currency: z.enum(['ARS', 'USD'], { message: 'Moneda requerida' }),
})

export type CategoryBudgetSchema = z.infer<typeof categoryBudgetSchema>
