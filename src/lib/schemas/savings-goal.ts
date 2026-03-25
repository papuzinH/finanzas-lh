import { z } from 'zod'

export const savingsGoalSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100, 'Máximo 100 caracteres'),
  type: z.enum(['one_time', 'monthly'], { message: 'Tipo de objetivo requerido' }),
  target_amount: z.number().positive('El monto objetivo debe ser positivo'),
  currency: z.enum(['ARS', 'USD'], { message: 'Moneda requerida' }),
  target_date: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'one_time' && !data.target_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Las metas con fecha requieren una fecha objetivo',
      path: ['target_date'],
    })
  }
})

export type SavingsGoalSchema = z.infer<typeof savingsGoalSchema>

/** Form-compatible schema (uses Date for target_date, transforms to string for server) */
export const createSavingsGoalFormSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100, 'Máximo 100 caracteres'),
  type: z.enum(['one_time', 'monthly'], { message: 'Tipo de objetivo requerido' }),
  target_amount: z.number().positive('El monto objetivo debe ser positivo'),
  currency: z.enum(['ARS', 'USD'], { message: 'Moneda requerida' }),
  target_date: z.date().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'one_time' && !data.target_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Las metas con fecha requieren una fecha objetivo',
      path: ['target_date'],
    })
  }
})

export type CreateSavingsGoalFormSchema = z.infer<typeof createSavingsGoalFormSchema>

export const savingsGoalContributionSchema = z.object({
  goal_id: z.string().uuid('ID de meta inválido'),
  amount: z.number().positive('El aporte debe ser positivo'),
  currency: z.enum(['ARS', 'USD'], { message: 'Moneda requerida' }),
  note: z.string().max(200, 'Máximo 200 caracteres').nullable().optional(),
  date: z.string().min(1, 'La fecha es requerida'),
})

export type SavingsGoalContributionSchema = z.infer<typeof savingsGoalContributionSchema>
